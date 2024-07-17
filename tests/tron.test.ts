import { TronWallet } from '../src/tron';
import { Address, CoinTransaction, TokenTransaction } from '../src/wallet';
import { expect, test, vi } from 'vitest';

function createWallet(network: 'mainnet' | 'testnet') {
  const mnemonic = 'radar blur cabbage chef fix engine embark joy scheme fiction master release';
  return new TronWallet(mnemonic, network, {
    provider: 'testnet' === network ? 'https://api.shasta.trongrid.io' : 'https://api.trongrid.io',
    headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY! }
  });
}

vi.setConfig({ testTimeout: 240000 });

test('can retrieve block height', async () => {
  const wallet = createWallet('testnet');
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

test('can create valid address', async () => {
  const wallet = createWallet('testnet');
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b');
  expect(addr.hash).toBe('TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi');
});

test('can retrieve a coin transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('ad45309ca656d46dec82d037e478bbf2b92f8682fcd3c22a782a495df6a7fc1e');
  if (!(tx instanceof CoinTransaction)) return fail("Didn't get coin transaction!");
  expect(await tx.inputs[0]?.address()).toBe('TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi');
  expect(await tx.outputs[0]?.address()).toBe('TYBuQy5rduHQn4rtW5auSW3W3waTpGph6E');
  expect(tx.outputs[0]?.value).toBe(1000000n);
});

test('can retrieve a token transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('2329a5974c8d1df0c914bfaf8e245a86406eb303adc3bca3c911e26d53e711c4');
  if (!(tx instanceof TokenTransaction)) return fail("Didn't get coin transaction!");
  expect(tx.from).toBe('TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi');
  expect(tx.to).toBe('TYBuQy5rduHQn4rtW5auSW3W3waTpGph6E');
  expect(tx.contractAddress).toBe('TZAMowU7LPttMHV4ba9osJSmYw6i6erC2d');
  expect(tx.value).toBe(1000000n);
});

// see: https://github.com/tronprotocol/tronweb/issues/540
test('can retrieve a token transaction without value exceeds width error', async () => {
  const wallet = createWallet('mainnet');
  const tx = await wallet.getTransaction('7e45745226085334dd91ce42a3beb76dcb3b6f164f5ec558a49abac8ba1885a0');
  if (!(tx instanceof TokenTransaction)) return fail("Didn't get coin transaction!");
  expect(tx.from).toBe('TGS2YuigrghENqQqCMP6p1ktbxnvo33LGg');
  expect(tx.to).toBe('TLKopop7gJJCcjrAL6jis1Scx6BSniPpbo');
  expect(tx.contractAddress).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
  expect(tx.value).toBe(2000000n);
});

test('can create a coin transaction', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, 'TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi', Buffer.from('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b', 'hex'));
  const rawTx = await wallet.createTransaction(from, 'TYBuQy5rduHQn4rtW5auSW3W3waTpGph6E', 1n);
  expect(rawTx.hash).toBeDefined();
  expect(rawTx.data).toBeDefined();
});

// we use this contract: TZAMowU7LPttMHV4ba9osJSmYw6i6erC2d
// it is a mineable USDT-like contract, you can use "drip" method to mine fake coins
// see: https://github.com/bokkypoobah/WeenusTokenFaucet
test('can create a token transaction', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, 'TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi', Buffer.from('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b', 'hex'));
  const rawTx = await wallet.createTokenTransaction('TZAMowU7LPttMHV4ba9osJSmYw6i6erC2d', from, 'TYBuQy5rduHQn4rtW5auSW3W3waTpGph6E', 1000000n);
  expect(rawTx.hash).toBeDefined();
  expect(rawTx.data).toBeDefined();
});

test('can retrieve transactions of a block', async () => {
  const wallet = createWallet('testnet');
  const blocks = await wallet.getBlocks(33273991, 33273991);
  expect(blocks[0]?.transactions[0]?.hash).toBe('3970ee4f246e6dc880e21ee0a6929311a00608a9fd44d5ac11466e3de32f49b1');
});

test('can retrieve transactions of an empty block', async () => {
  const wallet = createWallet('testnet');
  const blocks = await wallet.getBlocks(44711520, 44711520);
  expect(blocks[0]?.transactions).toStrictEqual([]);
});

test('can retrieve transactions of a block range', async () => {
  const wallet = createWallet('testnet');
  const blocks = await wallet.getBlocks(33274568, 33274569);
  expect(blocks[0]?.transactions[0]?.hash).toBe('dbdc18bbac50844aaae4ddf5d99137ecac961565de86792c163b64a259b08f4b');
  expect(blocks[1]?.transactions[0]?.hash).toBe('dcd3affa8faec2a277500e000887e624f433c98b9f98aa24c37e8117223a14c4');
});

test('can retrieve transactions of a block range larger than 100', async () => {
  const wallet = createWallet('testnet');
  const blocks = await wallet.getBlocks(1, 145);
  expect(blocks[0]?.height).toBe(1);
  expect(blocks[144]?.height).toBe(145);
});

test('can retrieve address balance', async () => {
  const wallet = createWallet('testnet');
  const addr = 'TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi';
  const balance = await wallet.getAddressBalance(addr);
  expect(balance).toBe(333719n);
});

test('can retrieve address token balance', async () => {
  const wallet = createWallet('testnet');
  const addr = 'TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi';
  const balance = await wallet.getAddressTokenBalance('TZAMowU7LPttMHV4ba9osJSmYw6i6erC2d', addr);
  expect(typeof balance).toBe('bigint');
});

test('can estimate transaction fee', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, 'TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi', Buffer.from('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b', 'hex'));
  const fee = await wallet.estimateTransactionFee(from, 'TYBuQy5rduHQn4rtW5auSW3W3waTpGph6E', 1n);
  expect(fee).toBe(0n);
});

test('can estimate token transaction fee', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, 'TAKu6XAtzZqUdVXh5k4qZZ7LwNeyJjqVgi', Buffer.from('ce11c0f1778d6ad49bbe049b34c5963138a277fd25f4a9ea6b7e7eb8d506059b', 'hex'));
  const fee = await wallet.estimateTokenTransactionFee('TZAMowU7LPttMHV4ba9osJSmYw6i6erC2d', from, 'TYBuQy5rduHQn4rtW5auSW3W3waTpGph6E', 1n);
  expect(fee).toBe(6148380n);
});
