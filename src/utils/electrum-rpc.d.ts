export type ServerVersion = [string, string];

export type BlockchainScripthashGetBalance = {
  confirmed: number,
  unconfirmed: number,
};

export type BlockchainScripthashListunspent = Array<{
  height: number,
  tx_pos: number,
  tx_hash: string,
  value: number,
}>;

export type BlockchainHeadersSubscribe = {
  height: number,
  hex: string,
};

export type BlockchainBlockHeader = string;

export type BlockchainTransactionGet = string;
