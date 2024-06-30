// TODO: add other properties
export type GetBlockchainInfo = {
  blocks: number
};

export type GetRawMempool = string[];

export type GetBlockHash = string;

// TODO: add other properties
export type GetRawTransactionVerbose = {
  txid: string,
  hash: string,
  hex: string,
};

// TODO: add other properties
export type GetBlockVerbosity2 = {
  tx: GetRawTransactionVerbose[]
};
