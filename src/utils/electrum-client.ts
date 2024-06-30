import net from 'node:net';
import tls from 'node:tls';
import { ElectrumMessageParser } from './electrum-message-parser.js';
import { JsonRpcError, JsonRpcResult } from './jsonrpc.js';

type MessageCallback<ResultType, ErrorDataType> = (msg: JsonRpcResult<ResultType> | JsonRpcError<ErrorDataType>) => void;

export class ElectrumClient {

  host: string;
  port: number;
  client: net.Socket | tls.TLSSocket;
  timeoutCallback: () => void = () => void(0);
  errorCallback: (e: unknown) => void = () => void(0);
  messageCallback: MessageCallback<never, never> = () => void(0);
  messageParser: ElectrumMessageParser;

  constructor(host: string, port: number, protocol: string) {
    this.host = host;
    this.port = port;
    switch (protocol) {
      case 'tcp':
        this.client = new net.Socket();
        break;
      case 'tls':
      case 'ssl':
        // @ts-ignore when I provide first argument, it doesn't work :|
        this.client = new tls.TLSSocket(undefined, { rejectUnauthorized: false });
        break;
      default:
        throw new Error(`Invalid protocol: ${protocol}`);
    }
    this.messageParser = new ElectrumMessageParser((msg: string) => {
      this.messageCallback(JSON.parse(msg));
    });
    this.client.setTimeout(10_000);
    this.client.setKeepAlive(true, 0);
    this.client.setNoDelay(true);
    this.client.on('data', (data) => {
      this.messageParser.run(data.toString());
    });
    this.client.on('timeout', () => {
      this.timeoutCallback();
    });
    this.client.on('error', (e) => {
      this.errorCallback(e);
    });
  }

  async connect(): Promise<void> {
    const client = this.client;
    return new Promise((res, rej) => {
      client.connect(this.port, this.host, () => {
        res();
      });
    });
  }

  onTimeout(timeoutCallback: () => void) {
    this.timeoutCallback = timeoutCallback;
  }

  onError(errorCallback: (...args: unknown[]) => void) {
    this.errorCallback = errorCallback;
  }

  async send(msg: object) {
    this.client.write(`${JSON.stringify(msg)}\n`);
  }

  onMessage<ResultType = unknown, ErrorDataType = unknown>(callback: MessageCallback<ResultType, ErrorDataType>) {
    this.messageCallback = callback;
  }

  onClose(callback: () => void) {
    this.client.on('close', callback);
  }

  async close() {
    this.client?.end();
    this.client?.destroy();
  }
}