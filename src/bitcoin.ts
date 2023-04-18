import * as bitcoinjs from "bitcoinjs-lib";
import { BIP32Factory, BIP32API } from "bip32";
import * as ecc from "tiny-secp256k1";
import * as bip39 from 'bip39';
import { ECPairFactory, ECPairAPI } from 'ecpair';
import { RequestManager, HTTPTransport, Client } from "@open-rpc/client-js";
import {
  Wallet,
  Address,
  TransactionInput,
  TransactionOutput,
  Transaction,
  RawTransaction,
  NetworkType,
  SpendableTransaction,
} from "wallet";

export interface BitcoinWalletConfig {
  rpcUrl: string,
  fee: bigint,
}

export class BitcoinWallet implements Wallet {

  private mnemonic: string;
  private network: bitcoinjs.Network;
  private config: BitcoinWalletConfig;
  private bip32: BIP32API;
  private ecPair: ECPairAPI;
  private client: Client;

  constructor(mnemonic: string, networkType: NetworkType, config: BitcoinWalletConfig) {
    this.mnemonic = mnemonic;
    this.network = 'mainnet' === networkType ? bitcoinjs.networks['bitcoin'] : bitcoinjs.networks[networkType];
    this.config = config;
    this.bip32 = BIP32Factory(ecc);
    this.ecPair = ECPairFactory(ecc);
    this.client = new Client(new RequestManager([new HTTPTransport(this.config.rpcUrl)]));
  }

  async getAddress(index: number, accountIndex: number): Promise<Address> {
    const node = this.bip32.fromSeed(bip39.mnemonicToSeedSync(this.mnemonic)).derivePath("m/44'/0'").deriveHardened(accountIndex).derive(0).derive(index);
    const p = bitcoinjs.payments.p2wpkh({ network: this.network, pubkey: node.publicKey });
    return new Address(index, accountIndex, p.address!, node.privateKey!);
  }

  async getMempool(): Promise<Array<string>> {
    return await this.client.request({ method: "getrawmempool", params: [false, false] });
  }

  async getTransactions(fromBlock: number, toBlock: number): Promise<Array<Transaction>> {
    const transactions: Transaction[] = [];
    for (let height = fromBlock; height <= toBlock; height++)
      transactions.concat(await this.getBlockTransactions(height));
    return transactions;
  }

  private async getBlockTransactions(height: number): Promise<Array<Transaction>> {
    const blockHash = await this.client.request({ method: "getblockhash", params: [height] });
    const result = await this.client.request({ method: "getblock", params: [blockHash, 2] });
    const transactions: Transaction[] = [];
    result.tx.forEach((tx: any) => {
      transactions.push(this.convertTx(tx.hex));
    });
    return transactions;
  }

  async getTransaction(hash: string): Promise<Transaction> {
    const result = await this.client.request({ method: "getrawtransaction", params: [hash, true] });
    const tx = bitcoinjs.Transaction.fromHex(result['hex']);
    return this.convertTx(tx);
  }

  private convertTx(tx: bitcoinjs.Transaction): Transaction {
    const inputs: TransactionInput[] = [];
    const outputs: TransactionOutput[] = [];
    tx.ins.forEach((inp, i) => {
      inputs.push(new TransactionInput(i, this.extractAddressFromInput(inp)));
    });
    tx.outs.forEach((out, i) => {
      outputs.push(new TransactionOutput(i, bitcoinjs.address.fromOutputScript(out.script, this.network), BigInt(out.value)));
    });
    return new Transaction(tx.getId(), tx.toHex(), inputs, outputs);
  }

  private extractAddressFromInput(inp: bitcoinjs.TxInput): string {
    let payment;
    if (inp.witness.length) {
      if (inp.witness.length > 2) {
        payment = bitcoinjs.payments.p2wsh({ redeem: { output: inp.witness[inp.witness.length - 1] }, network: this.network});
      } else {
        payment = bitcoinjs.payments.p2wpkh({ pubkey: inp.witness[inp.witness.length - 1], network: this.network});
      }
    }
    if (inp.script.length) {
      if (payment) {
        payment = bitcoinjs.payments.p2sh({ redeem: payment, network: this.network });
      } else if (inp.script.at(0) === 0) {
        payment = bitcoinjs.payments.p2sh({ input: inp.script, network: this.network });
      } else {
        payment = bitcoinjs.payments.p2pkh({ input: inp.script, network: this.network });
      }
    }
    if (!payment || !payment.address) {
      throw new Error(`Failed to extract input address from output ${inp.index} of tx ${inp.hash}.`);
    } else {
      return payment.address;
    }
  }

  async createTransaction(from: Address, to: string, value: bigint, spending: Array<RawTransaction>): Promise<SpendableTransaction> {
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

    return new SpendableTransaction(tx.getId(), tx.toHex());
  }

  async broadcastTransaction(transaction: SpendableTransaction): Promise<void> {
    await this.client.request({ method: "sendrawtransaction", params: [transaction.data, 0] });
  }

  async getRequiredConfirmations() {
    return 1;
  }

  createTokenTransaction(_contractAddress: string, _from: Address, _to: string, _value: bigint): Promise<SpendableTransaction> {
    throw new Error('Tokens are not supported by Bitcoin blockchain.');
  }
}
