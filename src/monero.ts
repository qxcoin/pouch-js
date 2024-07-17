import moneroTs from "monero-ts";
import * as bip39 from 'bip39';
import createKeccakHash from "keccak";
import {
  Address,
  CoinTransaction,
  RawTransaction,
  NetworkType,
  TransactionOutput,
  TransactionInput,
  SyncWallet,
  SyncWalletListener,
} from "./wallet.js";
import fs from 'node:fs';

export interface MoneroWalletConfig {
  path: string,
  server: string,
}

export class MoneroWallet implements SyncWallet {

  private privateSpendKey: string;
  private networkType: NetworkType;
  private config: MoneroWalletConfig;

  constructor(mnemonic: string, networkType: NetworkType, config: MoneroWalletConfig) {
    this.privateSpendKey = createKeccakHash('keccak256').update(bip39.mnemonicToSeedSync(mnemonic)).digest('hex');
    this.networkType = networkType;
    this.config = config;
  }

  private async createWalletKeys() {
    return await moneroTs.createWalletKeys({
      networkType: this.networkType,
      privateSpendKey: this.privateSpendKey,
      proxyToWorker: false,
    });
  }

  private async createWalletFull() {
    return await moneroTs.createWalletFull({
      path: this.config.path,
      password: 'ssp',
      networkType: this.networkType,
      privateSpendKey: this.privateSpendKey,
      server: this.config.server,
      proxyToWorker: false,
      restoreHeight: await this.getLastBlockHeight(),
    });
  }

  private async openWalletFull() {
    return await moneroTs.openWalletFull({
      path: this.config.path,
      password: 'ssp',
      networkType: this.networkType,
      server: this.config.server,
      proxyToWorker: false,
    });
  }

  async getWalletFull() {
    if (fs.existsSync(this.config.path)) {
      return this.openWalletFull();
    } else {
      return this.createWalletFull();
    }
  }

  async getLastBlockHeight(): Promise<number> {
    const daemon = await moneroTs.connectToDaemonRpc(this.config.server);
    const height = await daemon.getHeight();
    return height;
  }

  async getSyncedBlockHeight(): Promise<number> {
    const wallet = await this.getWalletFull();
    const height = await wallet.getHeight();
    await wallet.close();
    return height;
  }

  async getAddress(index: number, accountIndex: number = 0): Promise<Address> {
    const wallet = await this.createWalletKeys();
    const hash = await wallet.getAddress(accountIndex, index);
    const addr = new Address(index, accountIndex, hash, Buffer.from(await wallet.getPrivateSpendKey(), 'hex'));
    await wallet.close();
    return addr;
  }

  private createMoneroListener(listener: Partial<SyncWalletListener>) {
    const self = this;
    return new class extends moneroTs.MoneroWalletListener {
      override async onSyncProgress(height: number, startHeight: number, endHeight: number, percentDone: number, message: string) {
        if (undefined !== listener.onProgress) {
          listener.onProgress(height);
        }
      }
      override async onOutputReceived(output: moneroTs.MoneroOutputWallet) {
        if (undefined !== listener.onTransaction) {
          listener.onTransaction(self.convertOutputWallet(output), output.getTx().getHeight());
        }
      }
    }
  }

  private convertOutputWallet(output: moneroTs.MoneroOutputWallet) {
    const tx = output.getTx();
    // it is not possible to read inputs from XMR blockchain, they are hidden
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    outputs.push(new TransactionOutput(0, output.getAmount(), async () => {
      return (await this.getAddress(output.getSubaddressIndex(), output.getAccountIndex())).hash;
    }));
    // NOTE: it seems `getFullHex` is undefined.
    // see: https://github.com/woodser/monero-ts/issues/214
    return new CoinTransaction(tx.getHash(), tx.getFullHex() ?? '', inputs, outputs);
  }

  async sync(listener: Partial<SyncWalletListener>, startHeight?: number) {
    const wallet = await this.getWalletFull();
    await wallet.sync(this.createMoneroListener(listener), startHeight);
    await wallet.close(true);
  }

  async getTransactions(hashes: string[]): Promise<Array<CoinTransaction>> {
    throw new Error('This method is not supported.');
  }

  private async getMoneroTx(hash: string): Promise<moneroTs.MoneroTxWallet> {
    const wallet = await this.getWalletFull();
    const tx = await wallet.getTx(hash);
    await wallet.close();
    return tx;
  }

  async getTransaction(hash: string): Promise<CoinTransaction> {
    const tx = await this.getMoneroTx(hash);
    return this.convertTxWallet(tx);
  }

  private convertTxWallet(tx: moneroTs.MoneroTxWallet): CoinTransaction {
    // it is not possible to read inputs from XMR blockchain, they are hidden
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    tx.getTransfers().forEach((t: moneroTs.MoneroTransfer, i: number) => {
      if (t instanceof moneroTs.MoneroIncomingTransfer)
        outputs.push(new TransactionOutput(i, t.getAmount(), async () => t.getAddress()));
    });
    // NOTE: it seems `getFullHex` is undefined.
    // see: https://github.com/woodser/monero-ts/issues/214
    return new CoinTransaction(tx.getHash(), tx.getFullHex() ?? '', inputs, outputs);
  }

  private async createMoneroTx(from: Address, to: string, value: bigint): Promise<moneroTs.MoneroTxWallet> {
    const wallet = await this.getWalletFull();
    const tx = await wallet.createTx({
      address: to,
      amount: value,
      accountIndex: from.accountIndex,
      subaddressIndex: from.index,
    });
    await wallet.close();
    return tx;
  }

  async createTransaction(from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const tx = await this.createMoneroTx(from, to, value);
    return new RawTransaction(tx.getHash(), tx.getMetadata());
  }

  async estimateTransactionFee(from: Address, to: string, value: bigint): Promise<bigint> {
    const tx = await this.createMoneroTx(from, to, value);
    return tx.getFee();
  }

  createTokenTransaction(_contractAddress: string, _from: Address, _to: string, _value: bigint): Promise<RawTransaction> {
    throw new Error('Tokens are not supported by Monero blockchain.');
  }

  estimateTokenTransactionFee(contractAddress: string, from: Address, to: string, value: bigint): Promise<bigint> {
    throw new Error('Tokens are not supported by Monero blockchain.');
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    const wallet = await this.getWalletFull();
    await wallet.relayTx(transaction.data);
    await wallet.close();
  }

  async getAddressBalance(address: string): Promise<bigint> {
    const wallet = await this.getWalletFull();
    const addr = await wallet.getAddressIndex(address);
    const balance = await wallet.getBalance(addr.accountIndex, addr.index);
    await wallet.close();
    return balance;
  }

  async getAddressTokenBalance(contractAddress: string, address: string): Promise<bigint> {
    throw new Error('Tokens are not supported by Bitcoin blockchain.');
  }
}
