import TronWeb from "tronweb";
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

export interface TronWalletConfig {
  provider: string,
  headers?: Record<string, string>,
}

export class TronWallet implements Wallet {

  private mnemonic: string;
  private config: TronWalletConfig;
  private tronweb: any;
  private bip32: BIP32API;

  constructor(mnemonic: string, _networkType: NetworkType, config: TronWalletConfig) {
    this.mnemonic = mnemonic;
    this.config = config;
    this.tronweb = new TronWeb({ fullHost: this.config.provider, headers: config.headers, });
    this.bip32 = BIP32Factory(ecc);
  }

  private encodeAddress(address: string): string {
    return TronWeb.utils.crypto.getBase58CheckAddress(address);
  }

  private decodeAddress(address: string): string {
    return Buffer.from(TronWeb.utils.crypto.decodeBase58Address(address)).toString('hex');
  }

  async getLastBlockHeight(): Promise<number> {
    const block = await this.tronweb.trx.getCurrentBlock();
    return block['block_header']['raw_data']['number'];
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/44'/195'").deriveHardened(accountIndex).derive(0).derive(index);
    const acc = this.encodeAddress(TronWeb.utils.crypto.getAddressFromPriKey(node.privateKey!));
    return new Address(index, accountIndex, acc, node.privateKey!);
  }

  async getMempool(): Promise<Mempool> {
    return new Mempool([]);
  }

  async getBlocks(fromHeight: number, toHeight: number): Promise<Block[]> {
    if (fromHeight === toHeight) return [new Block(fromHeight, await this.getBlockTransactions(fromHeight))];
    const blocks = await this.tronweb.trx.getBlockRange(fromHeight, toHeight);
    return blocks.map((block: any) => {
      return this.convertBlock(block);
    });
  }

  private convertBlock(block: any): Block {
    const height: number = block['block_header']['raw_data']['number'];
    const transactions: Array<CoinTransaction | TokenTransaction> = [];
    for (const tx of (block.transactions ?? [])) {
      const transaction = this.convertTx(tx);
      if (transaction) transactions.push(transaction);
    }
    return new Block(height, transactions);
  }

  private async getBlockTransactions(height: number): Promise<Array<CoinTransaction | TokenTransaction>> {
    const block = await this.tronweb.trx.getBlock(height);
    const transactions: Array<CoinTransaction | TokenTransaction> = [];
    for (const tx of block.transactions) {
      const transaction = this.convertTx(tx);
      if (transaction) transactions.push(transaction);
    }
    return transactions;
  }

  async getTransaction(hash: string): Promise<CoinTransaction | TokenTransaction> {
    const tx = await this.tronweb.trx.getTransaction(hash);
    const transaction = this.convertTx(tx);
    if (!transaction) {
      throw new Error(`Failed to convert transaction ${tx.txID}.`);
    }
    return transaction;
  }

  private convertTx(tx: any): CoinTransaction | TokenTransaction | false {
    const contract = tx.raw_data.contract[0];
    if (contract.type === 'TriggerSmartContract') return this.convertTokenTx(tx);
    else if (contract.type !== 'TransferContract') return false;
    const value = contract.parameter.value;
    const inputs: TransactionInput[] = [new TransactionInput(0, async () => this.encodeAddress(value.owner_address))];
    const outputs: TransactionOutput[] = [new TransactionOutput(0, value.amount, async () => this.encodeAddress(value.to_address))];
    return new CoinTransaction(tx.txID, tx.raw_data_hex, inputs, outputs);
  }

  private convertTokenTx(tx: any): TokenTransaction | false {
    const contract = tx.raw_data.contract[0];
    const value = contract.parameter.value;
    const method = value.data.slice(8);
    // we only support transfer (a9059cbb) method for now
    if (method !== 'a9059cbb') return false;
    const from = this.encodeAddress(value.owner_address);
    const params = TronWeb.utils.abi.decodeParams(["address", "uint256"], value.data, true);
    return new TokenTransaction(tx.txID, tx.raw_data_hex, from, params[0].toString(), value.contract_address, params[1].toBigInt());
  }

  async createTransaction(from: Address, to: string, value: bigint, _spending: Array<RawTransaction>): Promise<RawTransaction> {
    const tx = await this.tronweb.transactionBuilder.sendTrx(to, value, from.hash);
    const signedTx = this.tronweb.trx.sign(tx, from.privateKey);
    return new RawTransaction(signedTx.txID, JSON.stringify(signedTx));
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const func = 'transfer(address,uint256)';
    const parameter = [{ type: 'address', value: to }, { type: 'uint256', value }];
    const tx = await this.tronweb.transactionBuilder.triggerSmartContract(contractAddress, func, parameter, from);
    const signedTx = this.tronweb.trx.sign(tx, from.privateKey);
    return new RawTransaction(signedTx.txID, JSON.stringify(signedTx));
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    this.tronweb.trx.sendRawTransaction(JSON.parse(transaction.data));
  }
}
