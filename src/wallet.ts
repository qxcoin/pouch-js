import { BitcoinWallet, BitcoinWalletConfig } from "./bitcoin.js";
import { MoneroWallet, MoneroWalletConfig } from "./monero.js";
import { EthereumWallet, EthereumWalletConfig } from "./ethereum.js";
import { TronWallet, TronWalletConfig } from "./tron.js";

export type NetworkType = "mainnet" | "testnet";

export class Address {

  constructor(
    public readonly index: number,
    public readonly accountIndex: number,
    public readonly hash: string,
    public readonly privateKey: Buffer,
  ) {
    // pass
  }
}

export class RawTransaction {

  constructor(
    public readonly hash: string,
    public readonly data: string,
  ) {
    // pass
  }
}

export class TransactionInput {

  constructor(
    public readonly index: number,
    public readonly address: () => Promise<string>,
  ) {
    // pass
  }
}

export class TransactionOutput {

  constructor(
    public readonly index: number,
    public readonly value: bigint,
    public readonly address: () => Promise<string>,
  ) {
    // pass
  }
}

export class CoinTransaction extends RawTransaction {

  constructor(
    public override readonly hash: string,
    public override readonly data: string,
    public readonly inputs: Array<TransactionInput>,
    public readonly outputs: Array<TransactionOutput>,
  ) {
    super(hash, data);
  }
}

export class TokenTransaction extends RawTransaction {

  constructor(
    public override readonly hash: string,
    public override readonly data: string,
    public readonly from: string,
    public readonly to: string,
    public readonly contractAddress: string,
    public readonly value: bigint,
  ) {
    super(hash, data);
  }
}

export class Mempool {

  constructor(
    public readonly transactionHashes: string[],
  ) {
    // pass
  }
}

export class Block {

  constructor(
    public readonly height: number,
    public readonly transactions: Array<CoinTransaction | TokenTransaction>,
  ) {
    // pass
  }
}

export interface SyncWalletListener {
  onProgress(blockHeight: number): void;
  onTransaction(transaction: CoinTransaction | TokenTransaction, blockHeight?: number): void;
}

export interface SyncWallet {
  getLastBlockHeight(): Promise<number>;
  getSyncedBlockHeight(): Promise<number>;
  getAddress(index: number, accountIndex: number): Promise<Address>;
  sync(listener?: Partial<SyncWalletListener>, startHeight?: number): Promise<void>;
  getTransactions(hashes: string[]): Promise<Array<CoinTransaction | TokenTransaction>>;
  getTransaction(hash: string): Promise<CoinTransaction | TokenTransaction>;
  createTransaction(from: Address, to: string, value: bigint): Promise<RawTransaction>;
  createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction>;
  estimateTransactionFee(from: Address, to: string, value: bigint): Promise<bigint>;
  estimateTokenTransactionFee(contractAddress: string, from: Address, to: string, value: bigint): Promise<bigint>;
  broadcastTransaction(transaction: RawTransaction): Promise<void>;
  getAddressBalance(address: string): Promise<bigint>;
  getAddressTokenBalance(contractAddress: string, address: string): Promise<bigint>;
  isTransactionConfirmed(txHeight: number): Promise<boolean>;
}

export interface ScanWallet {
  getLastBlockHeight(): Promise<number>;
  getAddress(index: number, accountIndex: number): Promise<Address>;
  getMempool(): Promise<Mempool>;
  getBlocks(fromHeight: number, toHeight: number): Promise<Block[]>;
  getTransactions(hashes: string[]): Promise<Array<CoinTransaction | TokenTransaction>>;
  getTransaction(hash: string): Promise<CoinTransaction | TokenTransaction>;
  createTransaction(from: Address, to: string, value: bigint): Promise<RawTransaction>;
  createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<RawTransaction>;
  estimateTransactionFee(from: Address, to: string, value: bigint): Promise<bigint>;
  estimateTokenTransactionFee(contractAddress: string, from: Address, to: string, value: bigint): Promise<bigint>;
  broadcastTransaction(transaction: RawTransaction): Promise<void>;
  getAddressBalance(address: string): Promise<bigint>;
  getAddressTokenBalance(contractAddress: string, address: string): Promise<bigint>;
  isTransactionConfirmed(txHeight: number): Promise<boolean>;
}

export interface WalletConfigs {
  bitcoin: BitcoinWalletConfig,
  monero: MoneroWalletConfig,
  ethereum: EthereumWalletConfig,
  tron: TronWalletConfig,
}

export type WalletTypes = keyof WalletConfigs;

export class WalletFactory {

  constructor(private mnemonic: string, private networkType: NetworkType, private configs: WalletConfigs) {
    // pass
  }

  create(type: WalletTypes): SyncWallet | ScanWallet {
    switch (type) {
      case 'bitcoin':
        return this.createBitcoinWallet();
      case 'monero':
        return this.createMoneroWallet();
      case 'tron':
        return this.createTronWallet();
      case 'ethereum':
        return this.createEthereumWallet();
      default:
        throw new Error(`Wallet [${type}] is not supported.`);
    }
  }

  createBitcoinWallet(): BitcoinWallet {
    return new BitcoinWallet(this.mnemonic, this.networkType, this.configs.bitcoin);
  }

  createMoneroWallet(): MoneroWallet {
    return new MoneroWallet(this.mnemonic, this.networkType, this.configs.monero);
  }

  createTronWallet(): TronWallet {
    return new TronWallet(this.mnemonic, this.networkType, this.configs.tron);
  }

  createEthereumWallet(): EthereumWallet {
    return new EthereumWallet(this.mnemonic, this.networkType, this.configs.ethereum);
  }

  isSyncWallet(wallet: SyncWallet | ScanWallet): wallet is SyncWallet {
    return 'sync' in wallet;
  }

  isScanWallet(wallet: SyncWallet | ScanWallet): wallet is ScanWallet {
    return 'getBlocks' in wallet;
  }
}
