import * as bitcoinJs from "bitcoinjs-lib";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import { ECPairFactory, ECPairAPI } from 'ecpair';
import {
  ScanWallet,
  Address,
  TransactionInput,
  TransactionOutput,
  RawTransaction,
  CoinTransaction,
  NetworkType,
  Mempool,
  Block,
} from "./wallet.js";
import axios from "axios";
import { ElectrumClient } from "./utils/electrum-client.js";
import * as jsonrpc from "./utils/jsonrpc.js";
import type { BlockchainScripthashGetBalance, BlockchainScripthashListunspent } from "./utils/electrum-rpc.d.ts";
import type { GetBlockHash, GetBlockVerbosity2, GetBlockchainInfo, GetRawMempool, GetRawTransactionVerbose } from "./utils/bitcoin-rpc.d.ts";

export interface BitcoinWalletConfig {
  server: string,
  electrumServer: string,
  fee: bigint,
}

export class BitcoinWallet implements ScanWallet {

  private mnemonic: string;
  private network: bitcoinJs.Network;
  private config: BitcoinWalletConfig;
  private bip32: BIP32API;
  private ecPair: ECPairAPI;

  constructor(mnemonic: string, networkType: NetworkType, config: BitcoinWalletConfig) {
    this.mnemonic = mnemonic;
    this.network = 'mainnet' === networkType ? bitcoinJs.networks['bitcoin'] : bitcoinJs.networks[networkType];
    this.config = config;
    this.bip32 = BIP32Factory(ecc);
    this.ecPair = ECPairFactory(ecc);
    bitcoinJs.initEccLib(ecc);
  }

  private async request<ResultType = unknown, ErrorDataType = unknown>(method: string, params: unknown[] = []) {
    const body = { "jsonrpc": "2.0", "id": 0, method, params };
    const res = await axios.post<jsonrpc.JsonRpcResult<ResultType> | jsonrpc.JsonRpcError<ErrorDataType>>(this.config.server, body);
    const data = res.data;
    if (jsonrpc.isError(data)) throw new Error(data.error.message);
    if (jsonrpc.isNotError(data)) return data.result;
    throw new Error('Malformed response.');
  }

  private createElectrumClient() {
    const parsed = new URL(this.config.electrumServer);
    const c = new ElectrumClient(parsed.hostname, parseInt(parsed.port), parsed.protocol.slice(0, -1));
    c.onTimeout(() => {
      throw new Error('Electrum client timeout!');
    });
    c.onError((e) => {
      throw new Error('Electrum client error!');
    });
    return c;
  }

  async getLastBlockHeight(): Promise<number> {
    const result = await this.request<GetBlockchainInfo>('getblockchaininfo');
    return result['blocks'];
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/84'/0'").deriveHardened(accountIndex).derive(0).derive(index);
    if (undefined === node.privateKey) throw new Error("Private key doesn't exist on derived BIP32 node.");
    const p = bitcoinJs.payments.p2wpkh({ network: this.network, pubkey: node.publicKey });
    if (undefined === p.address) throw new Error("Failed to generate address.");
    return new Address(index, accountIndex, p.address, node.privateKey);
  }

  async getMempool(): Promise<Mempool> {
    const hashes = await this.request<GetRawMempool>('getrawmempool', [false, false]);
    return new Mempool(hashes);
  }

  async getBlocks(fromHeight: number, toHeight: number): Promise<Block[]> {
    const blocks: Block[] = [];
    for (let height = fromHeight; height <= toHeight; height++) {
      blocks.push(new Block(height, await this.getBlockTransactions(height)));
    }
    return blocks;
  }

  private async getBlockTransactions(height: number): Promise<Array<CoinTransaction>> {
    const blockHash = await this.request<GetBlockHash>('getblockhash', [height]);
    const result = await this.request<GetBlockVerbosity2>('getblock', [blockHash, 2]);
    const transactions: CoinTransaction[] = [];
    for (const tx of result.tx) {
      transactions.push(this.convertTx(bitcoinJs.Transaction.fromHex(tx.hex)));
    }
    return transactions;
  }

  async getTransactions(hashes: string[]): Promise<CoinTransaction[]> {
    const client = this.createElectrumClient();
    await client.connect();
    const transactions: CoinTransaction[] = [];
    client.onMessage<string>(async (msg) => {
      if (jsonrpc.isNotError(msg))
        transactions.push(this.convertTx(bitcoinJs.Transaction.fromHex(msg.result)));
      if (msg.id == (hashes.length - 1))
        await client.close();
    });
    for (const [i, h] of hashes.entries()) {
      await client.send({ "jsonrpc": "2.0", "method": "blockchain.transaction.get", "params": [h, false], "id": i });
    }
    return new Promise(async (resolve, reject) => {
      client.onClose(() => {
        resolve(transactions);
      });
    });
  }

  async getTransaction(hash: string): Promise<CoinTransaction> {
    const result = await this.request<GetRawTransactionVerbose>('getrawtransaction', [hash, true]);
    const tx = bitcoinJs.Transaction.fromHex(result['hex']);
    return this.convertTx(tx);
  }

  private convertTx(tx: bitcoinJs.Transaction): CoinTransaction {
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    for (const [i, inp] of tx.ins.entries()) {
      inputs.push(new TransactionInput(i, async () => this.extractAddressFromInput(inp)));
    }
    for (const [i, out] of tx.outs.entries()) {
      outputs.push(new TransactionOutput(i, BigInt(out.value), async () => this.extractAddressFromOutput(out)));
    }
    return new CoinTransaction(tx.getId(), tx.toHex(), inputs, outputs);
  }

  private async extractAddressFromInput(inp: bitcoinJs.TxInput): Promise<string> {
    try {
      const addr = bitcoinJs.payments.p2sh({ input: inp.script, network: this.network }).address;
      if (addr) return addr;
    } catch {}
    try {
      const addr = bitcoinJs.payments.p2pkh({ input: inp.script, network: this.network }).address;
      if (addr) return addr;
    } catch {}
    if (0 === parseInt(inp.hash.toString('hex'), 16)) {
      return 'Block Reward';
    } else {
      return await this.extractAddressFromInputPrevOut(inp);
    }
  }

  private async extractAddressFromInputPrevOut(inp: bitcoinJs.TxInput): Promise<string> {
    const txId = inp.hash.reverse().toString('hex');
    const result = await this.request<GetRawTransactionVerbose>('getrawtransaction', [txId, true]);
    const tx = bitcoinJs.Transaction.fromHex(result.hex);
    const output = tx.outs[inp.index];
    if (undefined === output) throw new Error('Failed to extract address from output.');
    return this.extractAddressFromOutput(output);
  }

  private extractAddressFromOutput(out: bitcoinJs.TxOutput): string {
    try {
      return bitcoinJs.address.fromOutputScript(out.script, this.network);
    } catch {}
    try {
      const addr = bitcoinJs.payments.p2pkh({ pubkey: out.script.subarray(1, -1), network: this.network }).address;
      if (addr) return addr;
    } catch {}
    if (out.script.length) {
      return out.script.toString('hex');
    } else {
      throw new Error('Failed to extract address from output.');
    }
  }

  async createTransaction(from: Address, to: string, value: bigint): Promise<RawTransaction> {
    const spending = await this.getAddressUnspent(from.hash);
    const prevOuts: Array<{ tx: CoinTransaction, index: number }> = [];
    for (const tx of spending) {
      for (const [index, output] of tx.outputs.entries()) {
        const addr = await output.address();
        if (addr === from.hash) prevOuts.push({ tx, index });
      }
    }
    // we should only use as much outputs as we need
    // so, first we sort them from the lowest value to highest value
    prevOuts.sort((a, b) => {
      var bValue = b.tx.outputs[b.index]?.value ?? 0n;
      var aValue = a.tx.outputs[a.index]?.value ?? 0n;
      return Number(bValue - aValue);
    });
    const totalRequiredValue = value + this.config.fee;
    let totalAvailableValue = 0n;
    let requiredPrevOuts: typeof prevOuts = [];
    prevOuts.forEach((v) => {
      requiredPrevOuts.push(v);
      totalAvailableValue += v.tx.outputs[v.index]?.value ?? 0n;
      return totalAvailableValue >= totalRequiredValue ? false : undefined;
    });
    if (totalAvailableValue < totalRequiredValue) {
      throw new Error('Not enough balance.');
    }
    const psbt = new bitcoinJs.Psbt({ network: this.network });
    requiredPrevOuts.forEach(({ tx, index }) => {
      psbt.addInput({ hash: tx.hash, index, nonWitnessUtxo: Buffer.from(tx.data, 'hex') });
    });
    psbt.addOutput({ address: to, value: Number(value) });
    // return the rest of money back to the from address
    if (totalAvailableValue > totalRequiredValue) {
      psbt.addOutput({ address: from.hash, value: Number(totalAvailableValue - totalRequiredValue) });
    }
    psbt.signAllInputs(this.ecPair.fromPrivateKey(from.privateKey));
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();
    return new RawTransaction(tx.getId(), tx.toHex());
  }

  async estimateTransactionFee(from: Address, to: string, value: bigint): Promise<bigint> {
    return this.config.fee;
  }

  createTokenTransaction(_contractAddress: string, _from: Address, _to: string, _value: bigint): Promise<RawTransaction> {
    throw new Error('Tokens are not supported by Bitcoin blockchain.');
  }

  estimateTokenTransactionFee(contractAddress: string, from: Address, to: string, value: bigint): Promise<bigint> {
    throw new Error('Tokens are not supported by Bitcoin blockchain.');
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    await this.request("sendrawtransaction", [transaction.data, 0]);
  }

  async getAddressUnspent(address: string): Promise<CoinTransaction[]> {
    const sh = this.addressToScriptHash(address);
    const client = this.createElectrumClient();
    await client.connect();
    const hashes: string[] = [];
    client.onMessage<BlockchainScripthashListunspent>(async (msg) => {
      if (jsonrpc.isNotError(msg)) for (const r of msg.result) hashes.push(r.tx_hash);
      await client.close();
    });
    await client.send({ "jsonrpc": "2.0", "method": "blockchain.scripthash.listunspent", "params": [sh], "id": 0 });
    return new Promise((res, rej) => {
      client.onClose(async () => {
        res(await this.getTransactions(hashes));
      });
    });
  }

  async getAddressBalance(address: Address): Promise<bigint> {
    const sh = this.addressToScriptHash(address.hash);
    const client = this.createElectrumClient();
    await client.connect();
    let balance: bigint | undefined = undefined;
    client.onMessage<BlockchainScripthashGetBalance>(async (msg) => {
      if (jsonrpc.isNotError(msg)) balance = BigInt(msg.result.confirmed);
      await client.close();
    });
    await client.send({ "jsonrpc": "2.0", "method": "blockchain.scripthash.get_balance", "params": [sh], "id": 0 });
    return new Promise((res, rej) => {
      client.onClose(() => {
        if (undefined === balance) rej('Failed to resolve balance.');
        else res(balance);
      });
    });
  }

  private addressToScriptHash(address: string) {
    const script = bitcoinJs.address.toOutputScript(address, this.network);
    const hash = bitcoinJs.crypto.sha256(script);
    return hash.reverse().toString('hex');
  }
}
