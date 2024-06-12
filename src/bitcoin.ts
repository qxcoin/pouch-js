import * as bitcoinjs from "bitcoinjs-lib";
import { reverseBuffer } from "bitcoinjs-lib/src/bufferutils.js";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import { ECPairFactory, ECPairAPI } from 'ecpair';
import {
  Wallet,
  Address,
  TransactionInput,
  TransactionOutput,
  RawTransaction,
  CoinTransaction,
  NetworkType,
  Mempool,
  Block,
} from "./wallet.js";
import axios, { Axios } from "axios";

export interface BitcoinWalletConfig {
  rpcServer: string,
  fee: bigint,
}

export class BitcoinWallet implements Wallet {

  private mnemonic: string;
  private network: bitcoinjs.Network;
  private config: BitcoinWalletConfig;
  private bip32: BIP32API;
  private ecPair: ECPairAPI;
  private client: Axios;

  constructor(mnemonic: string, networkType: NetworkType, config: BitcoinWalletConfig) {
    this.mnemonic = mnemonic;
    this.network = 'mainnet' === networkType ? bitcoinjs.networks['bitcoin'] : bitcoinjs.networks[networkType];
    this.config = config;
    this.bip32 = BIP32Factory(ecc);
    this.ecPair = ECPairFactory(ecc);
    bitcoinjs.initEccLib(ecc);
    this.client = axios.create({
      baseURL: this.config.rpcServer,
    });
  }

  private async request(method: string, params: unknown[] = []) {
    const body = { "jsonrpc": "2.0", "id": "0", method, params };
    const res = await this.client.post('', body);
    const data = res.data;
    if (null != data.error) throw new Error(data.error.message);
    if (null == data.result) throw new Error('Invalid response, result not found.');
    return data.result;
  }

  async getLastBlockHeight(): Promise<number> {
    const result = await this.request('getblockchaininfo');
    return result['blocks'];
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/84'/0'").deriveHardened(accountIndex).derive(0).derive(index);
    if (undefined === node.privateKey) throw new Error("Private key doesn't exist on derived BIP32 node.");
    const p = bitcoinjs.payments.p2wpkh({ network: this.network, pubkey: node.publicKey });
    if (undefined === p.address) throw new Error("Failed to generate address.");
    return new Address(index, accountIndex, p.address, node.privateKey);
  }

  async getMempool(): Promise<Mempool> {
    const hashes = await this.request('getrawmempool', [false, false]);
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
    const blockHash = await this.request('getblockhash', [height]);
    const result = await this.request('getblock', [blockHash, 2]);
    const transactions: CoinTransaction[] = [];
    result.tx.forEach((tx: any) => {
      transactions.push(this.convertTx(bitcoinjs.Transaction.fromHex(tx.hex)));
    });
    return transactions;
  }

  async getTransaction(hash: string): Promise<CoinTransaction> {
    const result = await this.request('getrawtransaction', [hash, true]);
    const tx = bitcoinjs.Transaction.fromHex(result['hex']);
    return this.convertTx(tx);
  }

  private convertTx(tx: bitcoinjs.Transaction): CoinTransaction {
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    tx.ins.forEach((inp, i) => {
      inputs.push(new TransactionInput(i, async () => this.extractAddressFromInput(inp)));
    });
    tx.outs.forEach((out, i) => {
      outputs.push(new TransactionOutput(i, BigInt(out.value), async () => this.extractAddressFromOutput(out)));
    });
    return new CoinTransaction(tx.getId(), tx.toHex(), inputs, outputs);
  }

  private async extractAddressFromInput(inp: bitcoinjs.TxInput): Promise<string> {
    try {
      return bitcoinjs.payments.p2sh({ input: inp.script, network: this.network }).address!;
    } catch {}
    try {
      return bitcoinjs.payments.p2pkh({ input: inp.script, network: this.network }).address!;
    } catch {}
    if (0 === parseInt(inp.hash.toString('hex'), 16)) {
      return 'Block Reward';
    } else {
      return await this.extractAddressFromInputPrevOut(inp);
    }
  }

  private async extractAddressFromInputPrevOut(inp: bitcoinjs.TxInput): Promise<string> {
    const txId = reverseBuffer(inp.hash).toString('hex');
    const result = await this.request('getrawtransaction', [txId, true]);
    const tx = bitcoinjs.Transaction.fromHex(result['hex']);
    return this.extractAddressFromOutput(tx.outs[inp.index]!);
  }

  private extractAddressFromOutput(out: bitcoinjs.TxOutput): string {
    try {
      return bitcoinjs.address.fromOutputScript(out.script, this.network);
    } catch {}
    try {
      return bitcoinjs.payments.p2pkh({ pubkey: out.script.subarray(1, -1), network: this.network }).address!;
    } catch {}
    if (out.script.length) {
      return out.script.toString('hex');
    } else {
      throw new Error('Failed to extract address from output.');
    }
  }

  async createTransaction(from: Address, to: string, value: bigint, spending: Array<RawTransaction>): Promise<RawTransaction> {
    const prevOuts: Array<{ tx: bitcoinjs.Transaction, index: number }> = [];
    spending.forEach((rawTx) => {
      const tx = bitcoinjs.Transaction.fromHex(rawTx.data);
      tx.outs.forEach((out, index) => {
        const addr = bitcoinjs.address.fromOutputScript(out.script, this.network);
        if (addr === from.hash) prevOuts.push({ tx, index });
      });
    });

    // we should only use as much outputs as we need
    // and sort them from the lowest value to highest value
    prevOuts.sort((a, b) => b.tx.outs[b.index]!.value - a.tx.outs[a.index]!.value);
    const totalRequiredValue = Number(value + this.config.fee);
    let totalAvailableValue = 0;
    let requiredPrevOuts: typeof prevOuts = [];
    prevOuts.forEach((v) => {
      requiredPrevOuts.push(v);
      totalAvailableValue += v.tx.outs[v.index]!.value;
      return totalAvailableValue >= totalRequiredValue ? false : undefined;
    });
    if (totalAvailableValue < totalRequiredValue) {
      throw new Error('Not enough balance.');
    }

    const psbt = new bitcoinjs.Psbt({ network: this.network });
    requiredPrevOuts.forEach(({ tx, index }) => {
      psbt.addInput({ hash: tx.getId(), index, nonWitnessUtxo: tx.toBuffer() });
    });
    psbt.addOutput({ address: to, value: Number(value) });
    // return the rest of money back to the from address
    if (totalAvailableValue > totalRequiredValue) {
      psbt.addOutput({ address: from.hash, value: (totalAvailableValue - totalRequiredValue) });
    }
    psbt.signAllInputs(this.ecPair.fromPrivateKey(from.privateKey));
    psbt.finalizeAllInputs();
    const tx = psbt.extractTransaction();

    return new RawTransaction(tx.getId(), tx.toHex());
  }

  createTokenTransaction(_contractAddress: string, _from: Address, _to: string, _value: bigint): Promise<RawTransaction> {
    throw new Error('Tokens are not supported by Bitcoin blockchain.');
  }

  async broadcastTransaction(transaction: RawTransaction): Promise<void> {
    await this.request("sendrawtransaction", [transaction.data, 0]);
  }
}
