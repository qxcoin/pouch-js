import { Web3 } from "web3";
import {
  FMT_BYTES,
  FMT_NUMBER,
  Transaction as Web3Transaction,
  TransactionInfo as Web3TransactionInfo,
} from "web3-types";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import ERC20 from '@openzeppelin/contracts/build/contracts/ERC20.json' with { type: 'json' };
import {
  ScanWallet,
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
import { UnsupportedTransactionError } from "./utils/errors.js";

export type ContractAddress = string;

export interface EthereumWalletConfig {
  provider: string,
  maxPriorityFeePerGas?: bigint,
}

export class EthereumWallet implements ScanWallet {

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
    if (undefined === node.privateKey) {
      throw new Error("Private key doesn't exist on derived BIP32 node.");
    }
    const acc = this.web3.eth.accounts.privateKeyToAccount(node.privateKey);
    // hex strings are case-insensitive
    // so we should lowercase the address everywhere to prevent errors when comparing
    return new Address(index, accountIndex, acc.address.toLowerCase(), node.privateKey);
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
    // NOTE: for empty blocks, `block.transaction` is not present
    // see: https://github.com/tronprotocol/tronweb/issues/522
    for (const tx of (block.transactions ?? [])) {
      // `getBlock` can return both `string` and `TransactionInfo`, we only want `TransactionInfo`
      if (typeof tx === 'string') continue;
      try {
        transactions.push(this.convertTx(tx));
      } catch (e) {
        if (!(e instanceof UnsupportedTransactionError)) throw e;
      }
    }
    return transactions;
  }

  async getTransactions(hashes: string[]): Promise<Array<CoinTransaction | TokenTransaction>> {
    throw new Error('This method is not supported.');
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
      throw new UnsupportedTransactionError('Transaction has not enough data.');
    }
    const value = this.web3.utils.toBigInt(tx.value);
    const hash = this.web3.utils.toHex(tx.hash);
    const from = tx.from;
    const to = tx.to;
    const inputs: TransactionInput[] = [new TransactionInput(0, async () => from)];
    const outputs: TransactionOutput[] = [new TransactionOutput(0, value, async () => to)];
    return new CoinTransaction(hash, JSON.stringify(tx), inputs, outputs);
  }

  private convertTokenTx(tx: Web3TransactionInfo): TokenTransaction {
    if (undefined === tx.value || undefined === tx.hash || undefined === tx.input || null == tx.to) {
      throw new UnsupportedTransactionError('Transaction has not enough data.');
    }
    const input = this.web3.utils.toHex(tx.input);
    const method = input.slice(2, 10);
    // we only support transfer (a9059cbb) method for now
    if (method !== 'a9059cbb') {
      throw new UnsupportedTransactionError(tx.hash.toString(), `Transaction [${tx.hash}] does not trigger the transfer (a9059cbb) contract method.`);
    }
    const hash = this.web3.utils.toHex(tx.hash);
    const data = input.slice(10);
    const params = this.web3.eth.abi.decodeParameters(['address', 'uint256'], data);
    const to = (params[0] as string).toLowerCase(); // hex strings are case-insensitive, so we should lowercase the address everywhere
    const value = params[1] as bigint;
    return new TokenTransaction(hash, JSON.stringify(tx), tx.from, to, tx.to, value);
  }

  private async createWeb3Transaction(from: Address, to: string, value: bigint): Promise<Web3Transaction> {
    const baseFee = (await this.web3.eth.getBlock()).baseFeePerGas;
    if (undefined === baseFee) {
      throw new Error('Failed to retrieve base fee.');
    }
    const maxPriorityFeePerGas = this.config.maxPriorityFeePerGas ?? 1_000_000_000n;
    const maxFeePerGas = baseFee + maxPriorityFeePerGas;
    const gasLimit = 21_000;
    return { from: from.hash, to, value: this.web3.utils.toHex(value), gasLimit, maxFeePerGas, maxPriorityFeePerGas };
  }

  async createTransaction(from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const tx = await this.createWeb3Transaction(from, to, value);
    const signedTx = await this.web3.eth.accounts.signTransaction(tx, from.privateKey);
    return new RawTransaction(signedTx.transactionHash, signedTx.rawTransaction);
  }

  async estimateTransactionFee(from: Address, to: string, value: bigint): Promise<bigint> {
    const tx = await this.createWeb3Transaction(from, to, value);
    const gasLimit = this.web3.utils.toBigInt(tx.gasLimit);
    const maxFeePerGas = this.web3.utils.toBigInt(tx.maxFeePerGas);
    return gasLimit * maxFeePerGas;
  }

  private async createWeb3TokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<Web3Transaction> {
    const contract = new this.web3.eth.Contract(ERC20.abi, contractAddress);
    const transfer = contract.methods['transfer'];
    if (!transfer) {
      throw new Error('Method [transfer] of the contract cannot be found.');
    }
    const data = transfer(to, value).encodeABI();
    const baseFee = (await this.web3.eth.getBlock()).baseFeePerGas;
    if (undefined === baseFee) {
      throw new Error('Failed to retrieve base fee.');
    }
    const maxPriorityFeePerGas = this.config.maxPriorityFeePerGas ?? 1_000_000_000n;
    const maxFeePerGas = baseFee + maxPriorityFeePerGas;
    const gasLimit = (21_000 + (68 * data.length)) * 2;
    return { from: from.hash, to: contractAddress, data, gasLimit, maxFeePerGas, maxPriorityFeePerGas };
  }

  async createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const tx = await this.createWeb3TokenTransaction(contractAddress, from, to, value);
    tx.gasLimit = await this.web3.eth.estimateGas({ from: tx.from, to: tx.to, data: tx.data });
    const signedTx = await this.web3.eth.accounts.signTransaction(tx, from.privateKey);
    return new RawTransaction(signedTx.transactionHash, signedTx.rawTransaction);
  }

  async estimateTokenTransactionFee(contractAddress: string, from: Address, to: string, value: bigint): Promise<bigint> {
    const tx = await this.createWeb3TokenTransaction(contractAddress, from, to, value);
    const gasLimit = await this.web3.eth.estimateGas({ from: tx.from, to: tx.to, data: tx.data });
    const maxFeePerGas = this.web3.utils.toBigInt(tx.maxFeePerGas);
    return gasLimit * maxFeePerGas;
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    await this.web3.eth.sendSignedTransaction(transaction.data);
  }

  async getAddressBalance(address: string) {
    const balance = await this.web3.eth.getBalance(address);
    return balance;
  }

  async getAddressTokenBalance(contractAddress: string, address: string): Promise<bigint> {
    const contract = new this.web3.eth.Contract(ERC20.abi, contractAddress);
    const balanceOf = contract.methods['balanceOf'];
    if (!balanceOf) {
      throw new Error('Method [balanceOf] of contract cannot be found.');
    }
    return await balanceOf(address).call();
  }
}
