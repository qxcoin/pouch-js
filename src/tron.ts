import { TronWeb, utils as tronUtils, providers as tronProviders } from "tronweb";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import {
  ScanWallet,
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
import type {
  SignedTransaction as TronSignedTransaction,
  Transaction as TronTransaction,
} from "tronweb/lib/esm/types/Transaction.js";
import type {
  TransferContract as TronTransferContract,
  TriggerSmartContract as TronTriggerSmartContract,
} from "tronweb/lib/esm/types/Contract.js";
import type { Block as TronBlock } from "tronweb/lib/esm/types/APIResponse.js";
import {
  TriggerSmartContractOptions as TronTriggerSmartContractOptions,
} from "tronweb/lib/esm/types/TransactionBuilder.js";

export interface TronWalletConfig {
  provider: string,
  headers?: Record<string, string>,
}

export class TronWallet implements ScanWallet {

  private mnemonic: string;
  private config: TronWalletConfig;
  private tronweb: TronWeb;
  private bip32: BIP32API;

  constructor(mnemonic: string, _networkType: NetworkType, config: TronWalletConfig) {
    this.mnemonic = mnemonic;
    this.config = config;
    this.bip32 = BIP32Factory(ecc);
    this.tronweb = new TronWeb({
      fullHost: new tronProviders.HttpProvider(this.config.provider, 16000),
      headers: new AxiosHeaders(config.headers),
    });
  }

  private encodeAddress(address: string): string {
    const addressBytes = tronUtils.code.hexStr2byteArray(address);
    return tronUtils.crypto.getBase58CheckAddress(addressBytes);
  }

  private decodeAddress(address: string): string {
    const addressBytes = tronUtils.crypto.decodeBase58Address(address);
    if (false === addressBytes) throw new Error('Failed to decode address.');
    return tronUtils.code.byteArray2hexStr(addressBytes);
  }

  async getLastBlockHeight(): Promise<number> {
    const block = await this.tronweb.trx.getCurrentBlock();
    return block['block_header']['raw_data']['number'];
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const seed = bip39.mnemonicToSeedSync(this.mnemonic);
    const node = this.bip32.fromSeed(seed).derivePath("m/44'/195'").deriveHardened(accountIndex).derive(0).derive(index);
    if (undefined === node.privateKey) throw new Error("Private key doesn't exist on derived BIP32 node.");
    const privateKeyBytes = tronUtils.code.hexStr2byteArray(node.privateKey.toString('hex'));
    const addressBytes = tronUtils.crypto.getAddressFromPriKey(privateKeyBytes);
    const acc = tronUtils.crypto.getBase58CheckAddress(addressBytes);
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
    // NOTE: for empty blocks, `block.transaction` is not present
    // see: https://github.com/tronprotocol/tronweb/issues/522
    for (const tx of (block.transactions ?? [])) {
      try { transactions.push(this.convertTx(tx)) } catch {}
    }
    return new Block(height, transactions);
  }

  private async getBlockTransactions(height: number): Promise<Array<CoinTransaction | TokenTransaction>> {
    const block = await this.tronweb.trx.getBlock(height);
    const transactions: Array<CoinTransaction | TokenTransaction> = [];
    // NOTE: for empty blocks, `block.transaction` is not present
    // see: https://github.com/tronprotocol/tronweb/issues/522
    for (const tx of (block.transactions ?? [])) {
      try { transactions.push(this.convertTx(tx)) } catch {}
    }
    return transactions;
  }

  async getTransactions(hashes: string[]): Promise<Array<CoinTransaction | TokenTransaction>> {
    throw new Error('This method is not supported.');
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
    const decoded = tronUtils.abi.decodeParams([], ["address", "uint256"], value.data, true);
    const from = this.encodeAddress(value.owner_address);
    const to = this.encodeAddress(decoded[0].toString());
    const contractAddress = this.encodeAddress(value.contract_address);
    return new TokenTransaction(tx.txID, tx.raw_data_hex, from, to, contractAddress, decoded[1].toBigInt());
  }

  async createTransaction(from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const signedTx = await this.createTronSignedTransaction(from, to, value);
    return new RawTransaction(signedTx.txID, JSON.stringify(signedTx));
  }

  private async createTronSignedTransaction(from: Address, to: string, value: bigint): Promise<TronSignedTransaction> {
    const tx = await this.tronweb.transactionBuilder.sendTrx(to, Number(value), from.hash);
    return await this.tronweb.trx.sign(tx, from.privateKey.toString('hex'));
  }

  async estimateTransactionFee(from: Address, to: string, value: bigint): Promise<bigint> {
    const signedTx = await this.createTronSignedTransaction(from, to, value);
    const txBandwidth = this.estimateBandwidth(signedTx);
    const accountBandwidth = await this.getAddressBandwidth(from.hash);
    const fee = await this.getBandwidthFee(accountBandwidth, txBandwidth);
    return BigInt(fee);
  }

  private async getBandwidthFee(accountBandwidth: number, txBandwidth: number) {
    if (accountBandwidth < txBandwidth) {
      const bandwidthPrice = await this.getBandwidthPrice();
      return (txBandwidth * bandwidthPrice);
    } else {
      return 0;
    }
  }

  private async getBandwidthPrice() {
    const prices = await this.tronweb.trx.getBandwidthPrices();
    const lastPriceAndTime = prices.split(',').pop();
    if (undefined === lastPriceAndTime) throw new Error('Failed to get last bandwidth price.');
    const lastPrice = lastPriceAndTime.split(':')[1];
    if (undefined === lastPrice) throw new Error('Failed to get last bandwidth price.');
    return Number(lastPrice);
  }

  private estimateBandwidth(signedTx: TronSignedTransaction) {
    const DATA_HEX_PROTOBUF_EXTRA = 3;
    const MAX_RESULT_SIZE_IN_TX = 64;
    const A_SIGNATURE = 67;

    let len = signedTx.raw_data_hex.length / 2 + DATA_HEX_PROTOBUF_EXTRA + MAX_RESULT_SIZE_IN_TX;
    const signatureListSize = signedTx.signature.length;
    for (let i = 0; i < signatureListSize; i++) len += A_SIGNATURE;
    return len;
  }

  private async getAddressBandwidth(address: string) {
    const resources = await this.tronweb.trx.getAccountResources(address);
    const limit = resources.freeNetLimit + (resources.NetLimit ?? 0);
    const used = resources.freeNetUsed + (resources.NetUsed ?? 0);
    return limit - used;
  }

  private async getAddressEnergy(address: string) {
    const resources = await this.tronweb.trx.getAccountResources(address);
    const limit = (resources.EnergyLimit ?? 0);
    const used = (resources.EnergyUsed ?? 0);
    return limit - used;
  }

  private async getEnergyPrice() {
    const prices = await this.tronweb.trx.getEnergyPrices();
    const lastPriceAndTime = prices.split(',').pop();
    if (undefined === lastPriceAndTime) throw new Error('Failed to get last energy price.');
    const lastPrice = lastPriceAndTime.split(':')[1];
    if (undefined === lastPrice) throw new Error('Failed to get last energy price.');
    return Number(lastPrice);
  }

  private async getEnergyFee(accountEnergy: number, txEnergy: number) {
    if (accountEnergy < txEnergy) {
      const energyPrice = await this.getEnergyPrice();
      return (txEnergy * energyPrice);
    } else {
      return 0;
    }
  }

  private async estimateEnergy(contractAddress: string, from: Address, to: string, value: bigint) {
    const func = 'transfer(address,uint256)';
    const parameter = [{ type: 'address', value: to }, { type: 'uint256', value: Number(value) }];
    const estimateEnergy = await this.tronweb.transactionBuilder.estimateEnergy(contractAddress, func, {}, parameter, from.hash);
    return estimateEnergy.energy_required;
  }

  private async createTronSignedTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint, feeLimit?: bigint): Promise<TronSignedTransaction> {
    const func = 'transfer(address,uint256)';
    const parameter = [{ type: 'address', value: to }, { type: 'uint256', value: Number(value) }];
    const options: TronTriggerSmartContractOptions = {};
    if (undefined !== feeLimit) options.feeLimit = Number(feeLimit);
    const tx = await this.tronweb.transactionBuilder.triggerSmartContract(contractAddress, func, options, parameter, from.hash);
    return await this.tronweb.trx.sign(tx.transaction, from.privateKey.toString('hex'));
  }

  async estimateTokenTransactionFee(contractAddress: string, from: Address, to: string, value: bigint): Promise<bigint> {
    const signedTx = await this.createTronSignedTokenTransaction(contractAddress, from, to, value);
    const txBandwidth = this.estimateBandwidth(signedTx);
    const txEnergy = await this.estimateEnergy(contractAddress, from, to, value);
    const accountBandwidth = await this.getAddressBandwidth(from.hash);
    const accountEnergy = await this.getAddressEnergy(from.hash);
    const bandwidthFee = await this.getBandwidthFee(accountBandwidth, txBandwidth);
    const energyFee = await this.getEnergyFee(accountEnergy, txEnergy);
    return BigInt(bandwidthFee + energyFee);
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const feeLimit = await this.estimateTokenTransactionFee(contractAddress, from, to, value);
    const signedTx = await this.createTronSignedTokenTransaction(contractAddress, from, to, value, feeLimit);
    return new RawTransaction(signedTx.txID, JSON.stringify(signedTx));
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    this.tronweb.trx.sendRawTransaction(JSON.parse(transaction.data));
  }

  async getAddressBalance(address: string) {
    const balance = await this.tronweb.trx.getBalance(address);
    return BigInt(balance);
  }

  async getAddressTokenBalance(contractAddress: string, address: string): Promise<bigint> {
    const issuer = await this.getAddress(0, 0);
    const func = 'balanceOf(address)';
    const parameter = [{ type: 'address', value: address }];
    const tx = await this.tronweb.transactionBuilder.triggerConstantContract(contractAddress, func, {}, parameter, issuer.hash);
    const result = tx['constant_result'][0];
    const decoded = this.tronweb.utils.abi.decodeParams([], ['uint256'], `0x${result}`);
    return decoded[0].toBigInt();
  }
}
