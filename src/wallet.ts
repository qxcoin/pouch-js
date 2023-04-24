import { BitcoinWallet, BitcoinWalletConfig } from "./bitcoin.js";
import { MoneroWallet, MoneroWalletConfig } from "./monero.js";
import { EthereumWallet, EthereumWalletConfig } from "./ethereum.js";
import { TronWallet, TronWalletConfig } from "./tron.js";
import { BscWallet, BscWalletConfig } from "./bsc.js";

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
    public readonly address: string,
  ) {
    // pass
  };
}

export class TransactionOutput {

  constructor(
    public readonly index: number,
    public readonly address: string,
    public readonly value: bigint,
  ) {
    // pass
  };
}

export class Transaction extends RawTransaction {

  constructor(
    public override readonly hash: string,
    public override readonly data: string,
    public readonly inputs: Array<TransactionInput>,
    public readonly outputs: Array<TransactionOutput>,
  ) {
    super(hash, data);
  }
}

export class SpendableTransaction {

  constructor(
    public readonly hash: string,
    public readonly data: string,
  ) {
    // pass
  }
}

export class TokenTransaction {

  constructor(
    public readonly hash: string,
    public readonly data: string,
    public readonly from: string,
    public readonly to: string,
    public readonly contractAddress: string,
    public readonly value: bigint,
  ) {
    // pass
  }
}

export interface Wallet {
  getAddress(index: number, accountIndex: number): Promise<Address>;
  getMempool(): Promise<Array<string>>;
  getTransactions(fromBlock: number, toBlock: number): Promise<Array<Transaction | TokenTransaction>>;
  getTransaction(hash: string): Promise<Transaction | TokenTransaction>;
  createTransaction(from: Address, to: string, value: bigint, spending: Array<RawTransaction>): Promise<SpendableTransaction>;
  createTokenTransaction(contractAddress: string, from: Address, to: string, value: bigint): Promise<SpendableTransaction>;
  broadcastTransaction(transaction: SpendableTransaction): Promise<void>;
  getRequiredConfirmations(): Promise<number>;
}

export interface WalletConfigs {
  bitcoin: BitcoinWalletConfig,
  monero: MoneroWalletConfig,
  ethereum: EthereumWalletConfig,
  tron: TronWalletConfig,
  bsc: BscWalletConfig,
}

export type WalletTypes = keyof WalletConfigs;

export class WalletFactory {

  constructor(private mnemonic: string, private networkType: NetworkType, private configs: WalletConfigs) {
    // pass
  }

  create(type: WalletTypes): Wallet {
    switch (type) {
      case 'bitcoin':
        return this.createBitcoinWallet();
      case 'monero':
        return this.createMoneroWallet();
      case 'tron':
          return this.createTronWallet();
      case 'ethereum':
        return this.createEthereumWallet();
      case 'bsc':
        return this.createBscWallet();
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

  createBscWallet(): BscWallet {
    return new BscWallet(this.mnemonic, this.networkType, this.configs.bsc);
  }
}
