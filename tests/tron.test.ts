import { TronWallet } from '../src/tron';

test('can create valid address', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { provider: 'https://example.com' });
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b');
  expect(addr.hash).toBe('TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi');
});
