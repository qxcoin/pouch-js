import { EthereumWallet } from '../src/ethereum';
import { Address, CoinTransaction, TokenTransaction } from '../src/wallet';
import { expect, test, vi } from 'vitest';

function createWallet(network: 'mainnet' | 'testnet') {
  const mnemonic = 'radar blur cabbage chef fix engine embark joy scheme fiction master release';
  return new EthereumWallet(mnemonic, network, {
    provider: 'testnet' === network ? 'https://sepolia.infura.io/v3/ef48b777be6b4d2bb16a9197685eb698' : 'https://mainnet.infura.io/v3/ef48b777be6b4d2bb16a9197685eb698',
  });
}

vi.setConfig({ testTimeout: 240000 });

test('can retrieve block height', async () => {
  const wallet = createWallet('testnet');
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

// see: https://github.com/libbitcoin/libbitcoin-system/wiki/Altcoin-Version-Mappings#11-ethereum-eth-bip-3944-technology-examples
test('can create valid address', async () => {
  const wallet = createWallet('testnet');
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('b96e9ccb774cc33213cbcb2c69d3cdae17b0fe4888a1ccd343cbd1a17fd98b18');
  expect(addr.hash).toBe('0xac39b311dceb2a4b2f5d8461c1cdaf756f4f7ae9');
});

// test using famous 15k ETH transaction
test('can retrieve a coin transaction', async () => {
  const wallet = createWallet('mainnet');
  const tx = await wallet.getTransaction('0x05ac503f00789d76ce251102892b10a2cad5cea3bd3e48cc92fd42441cd1a8a8');
  if (!(tx instanceof CoinTransaction)) return fail("Didn't get coin transaction!");
  expect(await tx.inputs[0]?.address()).toBe('0x2ce910fbba65b454bbaf6a18c952a70f3bcd8299');
  expect(await tx.outputs[0]?.address()).toBe('0xa5a0944852972da191dc0becaaa1167d573e0008');
  expect(tx.outputs[0]?.value).toBe(15000000000000000000000n);
});

test('can retrieve a token transaction', async () => {
  const wallet = createWallet('mainnet');
  const tx = await wallet.getTransaction('0x946ae012ce77cbf7bfbf91efece0d0153c50328741240a54aed1e85c8e5c01ee');
  if (!(tx instanceof TokenTransaction)) return fail("Didn't get token transaction!");
  expect(tx.from).toBe('0x27686364d256efed49d5750f5c3fc70bac874682');
  expect(tx.to).toBe('0xf8Fe8ca234e9C060109CCAb2f1E4c09F99fac617');
  expect(tx.value).toBe(500000000000n);
});

test('can create a coin transaction', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, '0xaC39b311DCEb2A4b2f5d8461c1cdaF756F4F7Ae9', Buffer.from('b96e9ccb774cc33213cbcb2c69d3cdae17b0fe4888a1ccd343cbd1a17fd98b18', 'hex'));
  const rawTx = await wallet.createTransaction(from, '0xEb64657BDcab5087ca2627065317e39AAcaF67B4', 1n, []);
  expect(rawTx.hash).toBeDefined();
  expect(rawTx.data).toBeDefined();
});

// we use this contract: 0x7439E9Bb6D8a84dd3A23fe621A30F95403F87fB9
// it is a mineable USDT-like contract, you can use "drip" method to mine fake coins
// see: https://github.com/bokkypoobah/WeenusTokenFaucet
test('can create a token transaction', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, '0xaC39b311DCEb2A4b2f5d8461c1cdaF756F4F7Ae9', Buffer.from('b96e9ccb774cc33213cbcb2c69d3cdae17b0fe4888a1ccd343cbd1a17fd98b18', 'hex'));
  const rawTx = await wallet.createTokenTransaction('0x7439E9Bb6D8a84dd3A23fe621A30F95403F87fB9', from, '0xEb64657BDcab5087ca2627065317e39AAcaF67B4', BigInt(1 * 1000000));
  expect(rawTx.hash).toBeDefined();
  expect(rawTx.data).toBeDefined();
});

test('can retrieve transactions of a block range', async () => {
  const wallet = createWallet('mainnet');
  const blocks = await wallet.getBlocks(19981132, 19981133);
  expect(blocks[0]?.transactions[0]?.hash).toBe('0x736c384f84216ff99abda93557262519d3d7575d6e8d940c0a62510dc1d4eb24');
  expect(blocks[1]?.transactions[0]?.hash).toBe('0x106371759f9cf09005bef99b080e1287eeac2659787e226cf046dc70c78de6da');
});
