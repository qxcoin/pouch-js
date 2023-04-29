import { Web3, ContractAbi } from "web3";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import { EthereumWallet } from "./ethereum.js";
import {
  Wallet,
  Address,
  Transaction,
  RawTransaction,
  NetworkType,
  SpendableTransaction,
  TokenTransaction,
  Mempool,
  Block,
} from "./wallet.js";

export interface BscWalletConfig {
  provider: string,
  gasLimit?: number,
  gasPrice?: bigint,
  contracts?: Record<string, ContractAbi>,
}

export class BscWallet implements Wallet {

  private mnemonic: string;
  private config: BscWalletConfig;
  private web3: Web3;
  private bip32: BIP32API;
  private ethereumWallet: EthereumWallet;

  constructor(mnemonic: string, networkType: NetworkType, config: BscWalletConfig) {
    this.mnemonic = mnemonic;
    this.config = config;
    this.web3 = new Web3(this.config.provider);
    this.bip32 = BIP32Factory(ecc);
    this.ethereumWallet = new EthereumWallet(mnemonic, networkType, config);
  }

  async getLastBlockHeight(): Promise<number> {
    return this.ethereumWallet.getLastBlockHeight();
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/44'/9006'").deriveHardened(accountIndex).derive(0).derive(index);
    const acc = this.web3.eth.accounts.privateKeyToAccount(node.privateKey!);
    return new Address(index, accountIndex, acc.address, node.privateKey!);
  }

  async getMempool(): Promise<Mempool> {
    return this.ethereumWallet.getMempool();
  }

  async getBlocks(from: number, to: number): Promise<Block[]> {
    return this.ethereumWallet.getBlocks(from, to);
  }

  async getTransaction(hash: string): Promise<Transaction | TokenTransaction> {
    return this.ethereumWallet.getTransaction(hash);
  }

  async createTransaction(from: Address, to: string, value: bigint, spending: Array<RawTransaction>): Promise<SpendableTransaction> {
    return this.ethereumWallet.createTransaction(from, to, value, spending);
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<SpendableTransaction> {
    return this.ethereumWallet.createTokenTransaction(contractAddress, from, to, value);
  }

  async broadcastTransaction(transaction: SpendableTransaction): Promise<void> {
    return this.ethereumWallet.broadcastTransaction(transaction);
  }

  getRequiredConfirmations() {
    return 1;
  }

  getBlockTime() {
    return 3 * 1000;
  }
}
