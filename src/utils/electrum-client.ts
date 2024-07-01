import net from 'node:net';
import tls from 'node:tls';
import { ElectrumMessageParser } from './electrum-message-parser.js';
import { JsonRpcError, JsonRpcResult } from './jsonrpc.js';
import * as jsonrpc from "./jsonrpc.js";
import { ServerVersion } from './electrum-rpc.js';

type MessageCallback<ResultType, ErrorDataType> = (msg: JsonRpcResult<ResultType> | JsonRpcError<ErrorDataType>) => void;

export class ElectrumClient {

  host: string;
  port: number;
  protocol: string;

  messageParser: ElectrumMessageParser;

  client: net.Socket | tls.TLSSocket | undefined;

  timeoutCallback: () => void = () => void(0);
  errorCallback: (e: unknown) => void = () => void(0);
  messageCallback: MessageCallback<never, never> = () => void(0);

  constructor(host: string, port: number, protocol: string) {
    this.host = host;
    this.port = port;
    this.protocol = protocol;
    this.messageParser = new ElectrumMessageParser((msg: string) => {
      this.messageCallback(JSON.parse(msg));
    });
  }

  async connect(): Promise<void> {
    this.client = await this.createConnection();
    this.initClient();
    await this.negotiateVersion();
  }

  private async createConnection() {
    switch (this.protocol) {
      case 'tcp':
        return await this.createTcpConnection();
      case 'tls':
      case 'ssl':
        return await this.createTlsConnection();
      default:
        throw new Error(`Invalid protocol: ${this.protocol}`);
    }
  }

  async negotiateVersion() {
    await this.send({ "jsonrpc": "2.0", "method": "server.version", "params": ["Pouch Electrum Client", "1.4"], "id": 0 });
    return new Promise<ServerVersion>((res, rej) => {
      this.onMessage<ServerVersion>((msg) => {
        if (jsonrpc.isNotError(msg)) res(msg.result);
        else rej('Failed to negotiate version.');
      });
    });
  }

  private createTcpConnection() {
    return new Promise<net.Socket>((res, rej) => {
      const client = net.createConnection(this.port, this.host, () => {
        res(client);
      });
    });
  }

  private createTlsConnection() {
    return new Promise<tls.TLSSocket>((res, rej) => {
      const client = tls.connect(this.port, this.host, { rejectUnauthorized: false }, () => {
        res(client);
      });
    });
  }

  private initClient() {
    this.client?.setTimeout(90_000);
    this.client?.setKeepAlive(true, 0);
    this.client?.setNoDelay(true);
    this.client?.on('data', (data) => {
      this.messageParser.run(data.toString());
    });
    this.client?.on('timeout', () => {
      this.timeoutCallback();
    });
    this.client?.on('error', (e) => {
      this.errorCallback(e);
    });
  }

  onTimeout(timeoutCallback: () => void) {
    this.timeoutCallback = timeoutCallback;
  }

  onError(errorCallback: (...args: unknown[]) => void) {
    this.errorCallback = errorCallback;
  }

  async send(msg: object) {
    this.client?.write(`${JSON.stringify(msg)}\n`);
  }

  onMessage<ResultType = unknown, ErrorDataType = unknown>(callback: MessageCallback<ResultType, ErrorDataType>) {
    this.messageCallback = callback;
  }

  onClose(callback: () => void) {
    this.client?.on('close', callback);
  }

  async close() {
    this.client?.end();
    this.client?.destroy();
  }
}
