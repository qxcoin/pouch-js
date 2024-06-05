import monerojs, { MoneroWalletListener } from "monero-javascript";
import * as bip39 from 'bip39';
import createKeccakHash from "keccak";
import {
  Wallet,
  Address,
  CoinTransaction,
  RawTransaction,
  NetworkType,
  TransactionOutput,
  TransactionInput,
  Mempool,
  Block,
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
      proxyToWorker: false,
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
    const height = await wallet.getDaemonHeight();
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

  async getMempool(): Promise<Mempool> {
    return new Mempool([]);
  }

  async getBlocks(fromHeight: number, toHeight: number): Promise<Block[]> {
    const wallet = await this.createWalletFull();
    await wallet.sync(this.syncListener(wallet, toHeight), fromHeight);
    const txs = await wallet.getTxs({ minHeight: fromHeight, maxHeight: toHeight, isIncoming: true });
    await wallet.close();
    const txMap = new Map<number, CoinTransaction[]>();
    for (const tx of txs) {
      const height = tx.getHeight();
      if (txMap.has(height)) txMap.get(height)!.push(this.convertTx(tx));
      else txMap.set(height, [this.convertTx(tx)]);
    }
    const blocks: Block[] = [];
    for (let height = fromHeight; height <= toHeight; height++) {
      blocks.push(new Block(height, txMap.get(height) ?? []));
    }
    return blocks;
  }

  async getTransaction(hash: string): Promise<CoinTransaction> {
    const wallet = await this.createWalletFull();
    await wallet.scanTxs([hash]);
    const tx = await wallet.getTx(hash);
    await wallet.close();
    return this.convertTx(tx);
  }

  private convertTx(tx: any): CoinTransaction {
    // it is not possible to read inputs from XMR blockchain, they are hidden
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    tx.getTransfers().forEach((t: any, i: number) => {
      if (t.isIncoming())
        outputs.push(new TransactionOutput(i, BigInt(t.getAmount().toString()), async () => t.getAddress()));
    });
    // NOTE: it seems `getFullHex` is undefined.
    // see: https://github.com/woodser/monero-ts/issues/214
    return new CoinTransaction(tx.getHash(), tx.getFullHex() ?? '', inputs, outputs);
  }

  syncListener(wallet: any, to: number) {
    return new class extends MoneroWalletListener {
      onSyncProgress(height: number) {
        if (height >= to) wallet.stopSyncing();
      }
    }
  }

  async createTransaction(from: Address, to: string, value: bigint, spending: Array<RawTransaction>): Promise<RawTransaction> {
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
    return new RawTransaction(tx.getHash(), tx.getMetadata());
  }

  createTokenTransaction(_contractAddress: string, _from: Address, _to: string, _value: bigint): Promise<RawTransaction> {
    throw new Error('Tokens are not supported by Monero blockchain.');
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    const wallet = await this.createWalletFull();
    wallet.relayTx(transaction.data);
    await wallet.close();
  }
}
