export type BlockchainScripthashGetBalance = {
  confirmed: number,
  unconfirmed: number,
};

export type BlockchainScripthashListunspent = Array<{
  height: number,
  tx_pos: number,
  tx_hash: string,
  value: nunber,
}>;
