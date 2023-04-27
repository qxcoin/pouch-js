import { EthereumWallet } from '../src/ethereum';

test('can retrieve block height', async () => {
  const wallet = new EthereumWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { provider: 'https://mainnet.infura.io/v3/ef48b777be6b4d2bb16a9197685eb698' });
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

// see: https://github.com/libbitcoin/libbitcoin-system/wiki/Altcoin-Version-Mappings#11-ethereum-eth-bip-3944-technology-examples
test('can create valid address', async () => {
  const wallet = new EthereumWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { provider: 'http://example.com' });
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('b96e9ccb774cc33213cbcb2c69d3cdae17b0fe4888a1ccd343cbd1a17fd98b18');
  expect(addr.hash).toBe('0xaC39b311DCEb2A4b2f5d8461c1cdaF756F4F7Ae9');
});
