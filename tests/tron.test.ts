import { TronWallet } from '../src/tron';

test('can retrieve block height', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { provider: 'https://api.shasta.trongrid.io', headers: { 'TRON-PRO-API-KEY': 'f1c685a8-97ee-4a4f-8475-381fc2a4278b' } });
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

test('can create valid address', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { provider: 'https://example.com', headers: { 'TRON-PRO-API-KEY': 'example' } });
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b');
  expect(addr.hash).toBe('TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi');
});

test('can retrieve transactions of a block', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { provider: 'https://api.shasta.trongrid.io', headers: { 'TRON-PRO-API-KEY': 'f1c685a8-97ee-4a4f-8475-381fc2a4278b' } });
  const txs = await wallet.getTransactions(33273991, 33273991);
  expect(txs[33273991]?.[0]?.hash).toBe('3970ee4f246e6dc880e21ee0a6929311a00608a9fd44d5ac11466e3de32f49b1');
});

test('can retrieve transactions of a block range', async () => {
  const wallet = new TronWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { provider: 'https://api.shasta.trongrid.io', headers: { 'TRON-PRO-API-KEY': 'f1c685a8-97ee-4a4f-8475-381fc2a4278b' } });
  const txs = await wallet.getTransactions(33274568, 33274569);
  expect(txs[33274568]?.[0]?.hash).toBe('dbdc18bbac50844aaae4ddf5d99137ecac961565de86792c163b64a259b08f4b');
  expect(txs[33274569]?.[0]?.hash).toBe('dcd3affa8faec2a277500e000887e624f433c98b9f98aa24c37e8117223a14c4');
});
