import { Web3 } from "web3";
import { FMT_BYTES, FMT_NUMBER, TransactionInfo as Web3TransactionInfo } from "web3-types";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import ERC20 from '@openzeppelin/contracts/build/contracts/ERC20.json' assert { type: 'json' };
import {
  Wallet,
  Address,
  CoinTransaction,
  RawTransaction,
  NetworkType,
  TransactionInput,
  TransactionOutput,
  TokenTransaction,
  Mempool,
  Block,
} from "./wallet.js";

export type ContractAddress = string;

export interface EthereumWalletConfig {
  provider: string,
  maxPriorityFeePerGas?: number,
}

export class EthereumWallet implements Wallet {

  private mnemonic: string;
  private config: EthereumWalletConfig;
  private web3: Web3;
  private bip32: BIP32API;

  constructor(mnemonic: string, _networkType: NetworkType, config: EthereumWalletConfig) {
    this.mnemonic = mnemonic;
    this.config = config;
    this.web3 = new Web3(this.config.provider);
    this.bip32 = BIP32Factory(ecc);
  }

  async getLastBlockHeight(): Promise<number> {
    return await this.web3.eth.getBlockNumber({ number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.HEX });
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/44'/60'").deriveHardened(accountIndex).derive(0).derive(index);
    if (undefined === node.privateKey) throw new Error("Private key doesn't exist on derived BIP32 node.");
    const acc = this.web3.eth.accounts.privateKeyToAccount(node.privateKey);
    return new Address(index, accountIndex, acc.address, node.privateKey);
  }

  async getMempool(): Promise<Mempool> {
    return new Mempool([]);
  }

  async getBlocks(fromHeight: number, toHeight: number): Promise<Block[]> {
    const blocks: Block[] = [];
    for (let height = fromHeight; height <= toHeight; height++) {
      blocks.push(new Block(height, await this.getBlockTransactions(height)));
    }
    return blocks;
  }

  private async getBlockTransactions(height: number): Promise<Array<CoinTransaction | TokenTransaction>> {
    const block = await this.web3.eth.getBlock(height, true, { number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.HEX });
    const transactions: Array<CoinTransaction | TokenTransaction> = [];
    for (const tx of block.transactions) {
      if (typeof tx === 'string') continue; // `getBlock` can return both `string` and `TransactionInfo`, we only want `TransactionInfo`
      try { transactions.push(this.convertTx(tx)) } catch {}
    }
    return transactions;
  }

  async getTransaction(hash: string): Promise<CoinTransaction | TokenTransaction> {
    const tx = await this.web3.eth.getTransaction(hash, { number: FMT_NUMBER.NUMBER, bytes: FMT_BYTES.HEX });
    const transaction = this.convertTx(tx);
    return transaction;
  }

  private convertTx(tx: Web3TransactionInfo): CoinTransaction | TokenTransaction {
    if (undefined === tx.input) {
      throw new Error('Transaction has no input.');
    }
    const input = this.web3.utils.toHex(tx.input);
    if ('0x' !== input) return this.convertTokenTx(tx);
    else return this.convertCoinTx(tx);
  }

  private convertCoinTx(tx: Web3TransactionInfo): CoinTransaction {
    if (undefined === tx.value || undefined === tx.hash || null == tx.to) {
      throw new Error('Transaction is invalid.');
    }
    const value = this.web3.utils.toBigInt(tx.value);
    const hash = this.web3.utils.toHex(tx.hash);
    const to = tx.to;
    const inputs: TransactionInput[] = [new TransactionInput(0, async () => tx.from)];
    const outputs: TransactionOutput[] = [new TransactionOutput(0, value, async () => to)];
    return new CoinTransaction(hash, JSON.stringify(tx), inputs, outputs);
  }

  private convertTokenTx(tx: Web3TransactionInfo): TokenTransaction {
    if (undefined === tx.value || undefined === tx.hash || undefined === tx.input || null == tx.to) {
      throw new Error('Transaction is invalid.');
    }
    const input = this.web3.utils.toHex(tx.input);
    const method = input.slice(2, 10);
    // we only support transfer (a9059cbb) method for now
    if (method !== 'a9059cbb') {
      throw new Error(`Transaction [${tx.hash}] does not trigger the transfer (a9059cbb) contract method.`);
    }
    const hash = this.web3.utils.toHex(tx.hash);
    const data = input.slice(10);
    const params = this.web3.eth.abi.decodeParameters(['address', 'uint256'], data);
    const to = params[0] as string;
    const value = params[1] as bigint;
    return new TokenTransaction(hash, JSON.stringify(tx), tx.from, to, tx.to, value);
  }

  async createTransaction(from: Address, to: string, value: bigint, _spending: Array<RawTransaction>): Promise<RawTransaction> {
    const baseFee = (await this.web3.eth.getBlock()).baseFeePerGas;
    if (undefined === baseFee) {
      throw new Error('Failed to retrieve base fee.');
    }
    const maxFeePerGas = baseFee * 2n;
    const maxPriorityFeePerGas = this.config.maxPriorityFeePerGas ?? 1_000_000_000; // default to 1 gwei
    const gasLimit = 21_000;
    const tx = { from: from.hash, to, value: this.web3.utils.toHex(value), gasLimit, maxFeePerGas, maxPriorityFeePerGas };
    const signedTx = await this.web3.eth.accounts.signTransaction(tx, from.privateKey);
    return new RawTransaction(signedTx.transactionHash, signedTx.rawTransaction);
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const contract = new this.web3.eth.Contract(ERC20.abi, contractAddress);
    const transfer = contract.methods['transfer'];
    if (!transfer) {
      throw new Error('Transfer method of contract cannot be found.');
    }
    const data = transfer(to, value).encodeABI();
    const baseFee = (await this.web3.eth.getBlock()).baseFeePerGas;
    if (undefined === baseFee) {
      throw new Error('Failed to retrieve base fee.');
    }
    const maxFeePerGas = baseFee * 2n;
    const maxPriorityFeePerGas = this.config.maxPriorityFeePerGas ?? 1_000_000_000; // default to 1 gwei
    const gasLimit = (21_000 + (68 * data.length)) * 2;
    const tx = { from: from.hash, to: contractAddress, data, gasLimit, maxFeePerGas, maxPriorityFeePerGas };
    const signedTx = await this.web3.eth.accounts.signTransaction(tx, from.privateKey);
    return new RawTransaction(signedTx.transactionHash, signedTx.rawTransaction);
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    await this.web3.eth.sendSignedTransaction(transaction.data);
  }
}
