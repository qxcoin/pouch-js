import monerojs, { MoneroWalletListener } from "monero-javascript";
import * as bip39 from 'bip39';
import createKeccakHash from "keccak";
import {
  Wallet,
  Address,
  Transaction,
  RawTransaction,
  NetworkType,
  TransactionOutput,
  SpendableTransaction,
  TransactionInput,
} from "./wallet.js";

export interface MoneroWalletConfig {
  server: string,
}

export class MoneroWallet implements Wallet {

  private privateSpendKey: string;
  private networkType: NetworkType;
  private config: MoneroWalletConfig;

  constructor(mnemonic: string, networkType: NetworkType, config: MoneroWalletConfig) {
    this.privateSpendKey = createKeccakHash('keccak256').update(bip39.mnemonicToSeedSync(mnemonic)).digest('hex');
    this.networkType = networkType;
    this.config = config;
  }

  async createWalletKeys() {
    return await monerojs.createWalletKeys({
      networkType: this.networkType,
      privateSpendKey: this.privateSpendKey,
    });
  }

  async createWalletFull() {
    return await monerojs.createWalletFull({
      password: 'ssp',
      networkType: this.networkType,
      privateSpendKey: this.privateSpendKey,
      server: this.config.server,
      proxyToWorker: false,
    });
  }

  async getLastBlockHeight(): Promise<number> {
    const wallet = await this.createWalletFull();
    return await wallet.getDaemonHeight();
  }

  async getAddress(index: number, accountIndex: number = 0): Promise<Address> {
    const wallet = await this.createWalletKeys();
    const hash = await wallet.getAddress(accountIndex, index);
    const addr = new Address(index, accountIndex, hash, Buffer.from(await wallet.getPrivateSpendKey(), 'hex'));
    await wallet.close();
    return addr;
  }

  async getMempool(): Promise<Array<string>> {
    return [];
  }

  async getTransactions(fromBlock: number, toBlock: number): Promise<Record<number, Array<Transaction>>> {
    const wallet = await this.createWalletFull();
    await wallet.sync(this.syncListener(wallet, toBlock), fromBlock);
    const txs = await wallet.getTxs({ minHeight: fromBlock, maxHeight: toBlock, isIncoming: true });
    await wallet.close();
    const transactions: Record<number, Array<Transaction>> = {};
    for (const tx of txs) {
      const height = tx.getHeight();
      if (undefined === transactions[height]) transactions[height] = [];
      transactions[height]!.push(this.convertTx(tx));
    }
    return transactions;
  }

  async getTransaction(hash: string): Promise<Transaction> {
    const wallet = await this.createWalletFull();
    await wallet.scanTxs([hash]);
    const tx = await wallet.getTx(hash);
    await wallet.close();
    return this.convertTx(tx);
  }

  private convertTx(tx: any): Transaction {
    // it is not possible to read inputs from XMR blockchain, they are hidden
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    tx.getTransfers().forEach((t: any, i: number) => {
      if (t.isIncoming())
        outputs.push(new TransactionOutput(i, BigInt(t.getAmount().toString()), async () => t.getAddress()));
    });
    return new Transaction(tx.getHash(), tx.getFullHex(), inputs, outputs);
  }

  syncListener(wallet: any, to: number) {
    return new class extends MoneroWalletListener {
      onSyncProgress(height: number) {
        if (height >= to) wallet.stopSyncing();
      }
    }
  }

  async createTransaction(from: Address, to: string, value: bigint, spending: Array<RawTransaction>): Promise<SpendableTransaction> {
    const wallet = await this.createWalletFull();
    await wallet.scanTxs(spending.map((tx) => tx.hash));
    const syncRange = await wallet.getNumBlocksToUnlock();
    await wallet.sync(this.syncListener(wallet, syncRange[1]), syncRange[0]);
    const tx = await wallet.createTx({
      address: to,
      amount: value.toString(),
      accountIndex: from.accountIndex,
      subaddressIndex: from.index,
    });
    await wallet.close();
    return new SpendableTransaction(tx.getHash(), tx.getMetadata());
  }

  async broadcastTransaction(transaction: SpendableTransaction): Promise<void> {
    const wallet = await this.createWalletFull();
    wallet.relayTx(transaction.data);
    await wallet.close();
  }

  async getRequiredConfirmations() {
    return 10;
  }

  createTokenTransaction(_contractAddress: string, _from: Address, _to: string, _value: bigint): Promise<SpendableTransaction> {
    throw new Error('Tokens are not supported by Bitcoin blockchain.');
  }
}
