import { TronWeb, utils as TronWebUtils } from "tronweb";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import {
  Wallet,
  Address,
  NetworkType,
  CoinTransaction,
  RawTransaction,
  TransactionInput,
  TransactionOutput,
  TokenTransaction,
  Block,
  Mempool,
} from "./wallet.js";
import { AxiosHeaders } from "axios";
import type { Transaction as TronTransaction } from "tronweb/lib/esm/types/Transaction.js";
import type {
  TransferContract as TronTransferContract,
  TriggerSmartContract as TronTriggerSmartContract,
} from "tronweb/lib/esm/types/Contract.js";
import type { Block as TronBlock } from "tronweb/lib/esm/types/APIResponse.js";

export interface TronWalletConfig {
  provider: string,
  headers?: Record<string, string>,
}

export class TronWallet implements Wallet {

  private mnemonic: string;
  private config: TronWalletConfig;
  private tronweb: TronWeb;
  private bip32: BIP32API;

  constructor(mnemonic: string, _networkType: NetworkType, config: TronWalletConfig) {
    this.mnemonic = mnemonic;
    this.config = config;
    this.tronweb = new TronWeb({ fullHost: this.config.provider, headers: new AxiosHeaders(config.headers) });
    this.bip32 = BIP32Factory(ecc);
  }

  private encodeAddress(address: string): string {
    const addressBytes = TronWebUtils.code.hexStr2byteArray(address);
    return TronWebUtils.crypto.getBase58CheckAddress(addressBytes);
  }

  private decodeAddress(address: string): string {
    const addressBytes = TronWebUtils.crypto.decodeBase58Address(address);
    if (false === addressBytes) throw new Error('Failed to decode address.');
    return TronWebUtils.code.byteArray2hexStr(addressBytes);
  }

  async getLastBlockHeight(): Promise<number> {
    const block = await this.tronweb.trx.getCurrentBlock();
    return block['block_header']['raw_data']['number'];
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const seed = bip39.mnemonicToSeedSync(this.mnemonic);
    const node = this.bip32.fromSeed(seed).derivePath("m/44'/195'").deriveHardened(accountIndex).derive(0).derive(index);
    if (undefined === node.privateKey) throw new Error("Private key doesn't exist on derived BIP32 node.");
    const privateKeyBytes = TronWebUtils.code.hexStr2byteArray(node.privateKey.toString('hex'));
    const addressBytes = TronWebUtils.crypto.getAddressFromPriKey(privateKeyBytes);
    const acc = TronWebUtils.crypto.getBase58CheckAddress(addressBytes);
    return new Address(index, accountIndex, acc, node.privateKey!);
  }

  async getMempool(): Promise<Mempool> {
    return new Mempool([]);
  }

  async getBlocks(fromHeight: number, toHeight: number): Promise<Block[]> {
    if (fromHeight === toHeight) return [new Block(fromHeight, await this.getBlockTransactions(fromHeight))];
    // NOTE: getBlockRange only allows range of 100 blocks
    const blocks = [];
    for (let i = fromHeight; i <= toHeight; i = i + 100) {
      const from = i;
      const to = Math.min(i + 99, toHeight);
      blocks.push(...await this.tronweb.trx.getBlockRange(from, to));
    }
    return blocks.map((block) => {
      return this.convertBlock(block);
    });
  }

  private convertBlock(block: TronBlock): Block {
    const height: number = block['block_header']['raw_data']['number'];
    const transactions: Array<CoinTransaction | TokenTransaction> = [];
    for (const tx of (block.transactions ?? [])) {
      try { transactions.push(this.convertTx(tx)) } catch {}
    }
    return new Block(height, transactions);
  }

  private async getBlockTransactions(height: number): Promise<Array<CoinTransaction | TokenTransaction>> {
    const block = await this.tronweb.trx.getBlock(height);
    const transactions: Array<CoinTransaction | TokenTransaction> = [];
    for (const tx of block.transactions) {
      try { transactions.push(this.convertTx(tx)) } catch {}
    }
    return transactions;
  }

  async getTransaction(hash: string): Promise<CoinTransaction | TokenTransaction> {
    const tx = await this.tronweb.trx.getTransaction(hash);
    const transaction = this.convertTx(tx);
    return transaction;
  }

  private convertTx(tx: TronTransaction): CoinTransaction | TokenTransaction {
    if (this.isTokenTx(tx)) {
      return this.convertTokenTx(tx);
    } else if (this.isCoinTx(tx)) {
      return this.convertCoinTx(tx);
    } else {
      throw new Error(`Transaction [${tx.txID}] is not supported.`);
    }
  }

  private isCoinTx(tx: TronTransaction): tx is TronTransaction<TronTransferContract> {
    const contract = tx.raw_data.contract[0];
    return contract?.type === 'TransferContract';
  }

  private isTokenTx(tx: TronTransaction): tx is TronTransaction<TronTriggerSmartContract> {
    const contract = tx.raw_data.contract[0];
    return contract?.type === 'TriggerSmartContract';
  }

  private convertCoinTx(tx: TronTransaction<TronTransferContract>) {
    const contract = tx.raw_data.contract[0];
    if (undefined === contract) throw new Error();
    const value = contract.parameter.value;
    const inputs: TransactionInput[] = [new TransactionInput(0, async () => this.encodeAddress(value.owner_address))];
    const outputs: TransactionOutput[] = [new TransactionOutput(0, BigInt(value.amount), async () => this.encodeAddress(value.to_address))];
    return new CoinTransaction(tx.txID, tx.raw_data_hex, inputs, outputs);
  }

  private convertTokenTx(tx: TronTransaction<TronTriggerSmartContract>): TokenTransaction {
    const contract = tx.raw_data.contract[0];
    if (undefined === contract) throw new Error();
    const value = contract.parameter.value;
    // we only support transfer (a9059cbb) method for now
    // so the contract data cannot be empty and the first 8 characters should be "a9059cbb"
    if (!value.data) throw new Error(`Transaction [${tx.txID}] has empty data.`);
    const method = value.data.slice(0, 8);
    if (method !== 'a9059cbb') {
      throw new Error(`Transaction [${tx.txID}] does not trigger the transfer (a9059cbb) contract method.`);
    }
    const params = TronWebUtils.abi.decodeParams([], ["address", "uint256"], value.data, true);
    const from = this.encodeAddress(value.owner_address);
    const to = this.encodeAddress(params[0].toString());
    const contractAddress = this.encodeAddress(value.contract_address);
    return new TokenTransaction(tx.txID, tx.raw_data_hex, from, to, contractAddress, params[1].toBigInt());
  }

  async createTransaction(from: Address, to: string, value: bigint, _spending: Array<RawTransaction>): Promise<RawTransaction> {
    const tx = await this.tronweb.transactionBuilder.sendTrx(to, Number(value), from.hash);
    const signedTx = await this.tronweb.trx.sign(tx, from.privateKey.toString('hex'));
    return new RawTransaction(signedTx.txID, JSON.stringify(signedTx));
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const func = 'transfer(address,uint256)';
    const parameter = [{ type: 'address', value: to }, { type: 'uint256', value: Number(value) }];
    const tx = await this.tronweb.transactionBuilder.triggerSmartContract(contractAddress, func, {}, parameter, from.hash);
    const signedTx = await this.tronweb.trx.sign(tx.transaction, from.privateKey.toString('hex'));
    return new RawTransaction(signedTx.txID, JSON.stringify(signedTx));
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    this.tronweb.trx.sendRawTransaction(JSON.parse(transaction.data));
  }
}
