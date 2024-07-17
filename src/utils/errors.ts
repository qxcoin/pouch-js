export class UnsupportedTransactionError extends Error {
  constructor(public hash: string, message?: string) {
    super(message ?? `Transaction [${hash}] is not supported.`);
  }
}
