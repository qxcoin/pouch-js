import { Web3, ContractAbi } from "web3";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import {
  Wallet,
  Address,
  Transaction,
  RawTransaction,
  NetworkType,
  TransactionInput,
  TransactionOutput,
  TokenTransaction,
  Mempool,
  Block,
} from "./wallet.js";

export interface EthereumWalletConfig {
  provider: string,
  gasLimit?: number,
  gasPrice?: bigint,
  contracts?: Record<string, ContractAbi>,
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
    return Number(await this.web3.eth.getBlockNumber());
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/44'/60'").deriveHardened(accountIndex).derive(0).derive(index);
    const acc = this.web3.eth.accounts.privateKeyToAccount(node.privateKey!);
    return new Address(index, accountIndex, acc.address, node.privateKey!);
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

  private async getBlockTransactions(height: number): Promise<Array<Transaction | TokenTransaction>> {
    const block = await this.web3.eth.getBlock(height, true);
    const transactions: Array<Transaction | TokenTransaction> = [];
    for (const tx of block.transactions) {
      const transaction = this.convertTx(tx);
      if (transaction) transactions.push(transaction);
    }
    return transactions;
  }

  async getTransaction(hash: string): Promise<Transaction | TokenTransaction> {
    const tx = await this.web3.eth.getTransaction(hash);
    const transaction = this.convertTx(tx);
    if (!transaction)
      throw new Error(`Failed to convert transaction ${tx.hash}.`);
    return transaction;
  }

  private convertTx(tx: any): Transaction | TokenTransaction | false {
    if ('0x' !== tx.input) return this.convertTokenTx(tx);
    const inputs: TransactionInput[] = [new TransactionInput(0, async () => tx.from)];
    const outputs: TransactionOutput[] = [new TransactionOutput(0, tx.value!, async () => tx.to!)];
    return new Transaction(tx.hash, JSON.stringify(tx), inputs, outputs);
  }

  private convertTokenTx(tx: any): TokenTransaction | false {
    const method = tx.input!.slice(2, 10);
    // we only support transfer (a9059cbb) method for now
    if (method !== 'a9059cbb') return false;
    const params = this.web3.eth.abi.decodeParameters(['address', 'uint256'], tx.input!.slice(10));
    const to = params[0] as string;
    const value = params[1] as bigint;
    return new TokenTransaction(tx.hash, JSON.stringify(tx), tx.from, to, tx.to!, value);
  }

  async createTransaction(from: Address, to: string, value: bigint, _spending: Array<RawTransaction>): Promise<RawTransaction> {
    const gasLimit = this.config.gasLimit ? this.web3.utils.toHex(this.config.gasLimit) : 21000;
    const gasPrice = this.config.gasPrice ? this.web3.utils.toHex(this.config.gasPrice) : undefined;
    const tx = { from: from.hash, to, value: this.web3.utils.toHex(value), gasLimit, gasPrice };
    const signedTx = await this.web3.eth.accounts.signTransaction(tx, from.privateKey);
    return new RawTransaction(signedTx.transactionHash, signedTx.rawTransaction);
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const contractAbi = this.config.contracts?.[contractAddress];
    if (undefined === contractAbi) throw new Error(`ABI for contract ${contractAddress} is not available.`);
    const contract = new this.web3.eth.Contract(contractAbi, contractAddress);
    // @ts-ignore because we can't have type safety from dynamic ABI
    const data = contract.methods['transfer'](to, value).encodeABI();
    const gasLimit = this.config.gasLimit ? this.web3.utils.toHex(this.config.gasLimit) : 500000;
    const gasPrice = this.config.gasPrice ? this.web3.utils.toHex(this.config.gasPrice) : undefined;
    const tx = { from: from.hash, to, value: '0x0', data, gasLimit, gasPrice };
    const signedTx = await this.web3.eth.accounts.signTransaction(tx, from.privateKey);
    return new RawTransaction(signedTx.transactionHash, signedTx.rawTransaction);
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    await this.web3.eth.sendSignedTransaction(transaction.data);
  }
}
