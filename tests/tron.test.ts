import { TronWallet } from '../src/tron';

test('can retrieve block height', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { provider: 'https://api.trongrid.io', headers: { 'TRON-PRO-API-KEY': 'f1c685a8-97ee-4a4f-8475-381fc2a4278b' } });
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

test('can create valid address', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { provider: 'https://example.com', headers: { 'TRON-PRO-API-KEY': 'example' } });
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b');
  expect(addr.hash).toBe('TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi');
});
