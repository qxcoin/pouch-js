import wif from 'wif';
import { Address } from '../src/wallet';
import { BitcoinWallet } from '../src/bitcoin';
import { expect, test, vi } from 'vitest';

function createWallet(network: 'mainnet' | 'testnet') {
  const mnemonic = 'radar blur cabbage chef fix engine embark joy scheme fiction master release';
  return new BitcoinWallet(mnemonic, network, {
    server: 'testnet' === network ? 'https://go.getblock.io/204e9839582942599ea222a86f6f937d' : 'https://go.getblock.io/139892f83b72409bb850d16de30d51d7',
    electrumServer: 'testnet' === network ? 'ssl://testnet.aranguren.org:51002' : 'ssl://elx.bitske.com:50002',
    fee: 1n,
  });
}

vi.setConfig({ testTimeout: 240000 });

test('can retrieve block height', async () => {
  const wallet = createWallet('testnet');
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

// create a native-segwit wallet in electrum to check this
test('can create valid address', async () => {
  const wallet = createWallet('mainnet');
  const addr = await wallet.getAddress(0, 0);
  expect(wif.encode(128, addr.privateKey, true)).toBe('KzzbWJFNFvdv2UqzvTvDkeT9ySnaY1E4FnuifwPYMbTwJhFXF9By');
  expect(addr.hash).toBe('bc1qc5semafyf4zxfvul968ldfqmxrxynnyta5vhhg');
});

test('can create transaction for P2PKH', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, 'tb1qaqn2muzgsle78cknhz6qluf9j6uqkvqas95u2m', Buffer.from('2a38cfc8025dc970ca18537527ab78f838fb0c2159c12c8cce1c8afa0fc79174', 'hex'));
  const rawTx = await wallet.createTransaction(from, 'n2gTQ45JG7RzfjafW4MVvh7EseVX5VGHTs', 1n);
  expect(rawTx.hash).toBe('3b9c11729076f97334a83f5db0065949db783719f2b98070612df07fae5fb8de');
  expect(rawTx.data).toBe('020000000001029e50b71fd7d5d847f998d5d3a69d8e856563f1aa3551be4878daffe70d00cf4f0000000000ffffffff684a66085ec820c03c10eb9ea8c951f1aa27b531030d0318654868ba208a4d8c0000000000ffffffff0201000000000000001976a914e826adf04887f3e3e2d3b8b40ff12596b80b301d88acff89000000000000160014e826adf04887f3e3e2d3b8b40ff12596b80b301d02483045022100e3576cb496fce283c29957525711cf7bb8346732e3bda59dc2848c712a47e58c02205570f45c7115755c827cae8b9f5d91981f993a6a8063a00b3ba4ea409b5a4d0e012102c3d462c3b9aaf9e5dc540cbbd4d4a75346ce8ef9e3e124142c41b517950d3a2a02483045022100881ea0b23444650ef9b7aff40988e1530b7f1ed1f01f1185a3b09c6b7d164cca02200bb3c72d129be5c8ce00425eff0ee25bbbcbe19c4e849470d49f7b5c29e6a152012102c3d462c3b9aaf9e5dc540cbbd4d4a75346ce8ef9e3e124142c41b517950d3a2a00000000');
});

test('can create transaction for P2WPKH', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, 'tb1qaqn2muzgsle78cknhz6qluf9j6uqkvqas95u2m', Buffer.from('2a38cfc8025dc970ca18537527ab78f838fb0c2159c12c8cce1c8afa0fc79174', 'hex'));
  const rawTx = await wallet.createTransaction(from, 'tb1qte2qdm64ykmvjjpawxeev6g3d776z5502l4yj2', 1n);
  expect(rawTx.hash).toBe('a4910a3acbf0438484603765553249444318552443f71eea82154595d663cfd1');
  expect(rawTx.data).toBe('020000000001029e50b71fd7d5d847f998d5d3a69d8e856563f1aa3551be4878daffe70d00cf4f0000000000ffffffff684a66085ec820c03c10eb9ea8c951f1aa27b531030d0318654868ba208a4d8c0000000000ffffffff0201000000000000001600145e5406ef5525b6c9483d71b39669116fbda1528fff89000000000000160014e826adf04887f3e3e2d3b8b40ff12596b80b301d0247304402207ff811721e968161f83269de72e24f7c6806fa397d670af458c09496ac091cf2022074a6e6f1fbfddec2ad056d8f62ea9ddbe82f1f59baf50b6399eaede1d5fca6ef012102c3d462c3b9aaf9e5dc540cbbd4d4a75346ce8ef9e3e124142c41b517950d3a2a024730440220529ed2ba5eab2e50f10cb10e4bd7f9b1b092d2918db2bf2a64650504a1ddc986022038620087071681ea93f8e06fb88ef39219a83c66230615c75d95f66a1ed6e739012102c3d462c3b9aaf9e5dc540cbbd4d4a75346ce8ef9e3e124142c41b517950d3a2a00000000');
});

// test using Pizza Transaction
test('can retrieve P2PKH transaction', async () => {
  const wallet = createWallet('mainnet');
  const tx = await wallet.getTransaction('a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d');
  expect(await tx.inputs[0]?.address()).toBe('1XPTgDRhN8RFnzniWCddobD9iKZatrvH4');
  expect(await tx.outputs[0]?.address()).toBe('17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ');
});

test('can retrieve P2WPKH transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('580cc9ad94042394cbbe31b58fb63ae1b0e60a433fd7c9679d87f91cdee34201');
  expect(await tx.inputs[0]?.address()).toBe('tb1q568fk0pmj9x044a9tqczr6a50xy2ze74qrsvl4');
  expect(await tx.outputs[0]?.address()).toBe('tb1q00ug85flspuk9ld9yflpxgave5dlxqt8t254rl');
  expect(tx.outputs[0]?.value).toBe(6477514563n);
  expect(await tx.outputs[1]?.address()).toBe('tb1qws4qs40qvys4lnrvc5dm7fdjh6wq00tm43x7sc');
  expect(tx.outputs[1]?.value).toBe(2051331n);
});

// The first transaction that has spent funds from P2WSH
test('can retrieve P2WSH transaction', async () => {
  const wallet = createWallet('mainnet');
  const tx = await wallet.getTransaction('cab75da6d7fe1531c881d4efdb4826410a2604aa9e6442ab12a08363f34fb408');
  expect(await tx.inputs[0]?.address()).toBe('bc1qj9hlju59t0m4389033r2x8mlxwc86qgqm9flm626sd22cdhfs9jsyrrp6q');
  expect(await tx.outputs[0]?.address()).toBe('bc1qt4hs9aracmzhpy7ly3hrwsk0u83z4dqsln4vg5');
  expect(tx.outputs[0]?.value).toBe(73182n);
});

test('can retrieve P2WPKH-P2SH transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('678893a63f6c0084964272035d3b23cc3914a294601862177f301f0086b27d56');
  expect(await tx.inputs[0]?.address()).toBe('2NC9aEw5DZwaXGntkv8PXSv2f7eaGpHBRqD');
  expect(await tx.inputs[1]?.address()).toBe('2NDHWpQNCLo2yTwmyVkvMHgtby9pdoyGAP4');
  expect(await tx.outputs[0]?.address()).toBe('2NEH4zBsz3za2hzjyjXsGETz4SpHzhjiSiG');
  expect(tx.outputs[0]?.value).toBe(200000n);
  expect(await tx.outputs[1]?.address()).toBe('2N6jH2TKRnEfnsRA7dQLtTX7wfR2GpDoHqv');
  expect(tx.outputs[1]?.value).toBe(88478n);
});

test('can retrieve P2WSH-P2SH transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('74ca72c306816cd942b5b042378478a109989bf46b269e0be9e79736e21e7016');
  expect(await tx.inputs[0]?.address()).toBe('2MsyRCfhKxomefD7XWMTpZ9pq21zE19TxXd');
  expect(await tx.outputs[0]?.address()).toBe('2Mt1ZouaHFSyoPy7t9u5ZiFqDLKWv7t88Wh');
  expect(tx.outputs[0]?.value).toBe(2500n);
  expect(await tx.outputs[1]?.address()).toBe('2MsyRCfhKxomefD7XWMTpZ9pq21zE19TxXd');
  expect(tx.outputs[1]?.value).toBe(23000n);
});

// test using the first transaction of testnet network
test('can retrieve P2PK transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba');
  expect(await tx.inputs[0]?.address()).toBe('Block Reward');
  expect(await tx.outputs[0]?.address()).toBe('n3GNqMveyvaPvUbH469vDRadqpJMPc84JA');
  expect(tx.outputs[0]?.value).toBe(5000000000n);
});

test('can retrieve P2TR transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('228def0c3f8b4f1898cb7f442e356ed8755383745a682750102753c32072a9db');
  expect(await tx.inputs[0]?.address()).toBe('tb1p86u6c9u0p9ez08clh9aw9shxqqaeh35dj5thg20u9mx5ytplpxqsxp802z');
  expect(await tx.inputs[1]?.address()).toBe('tb1pmvgk75p2l29vckjt9sslu0m95vpvj8zylee2k9y8eg76uazu4neqz3vnd7');
  expect(await tx.outputs[0]?.address()).toBe('tb1p32d76xcy56htzfjaf94hu6d2gtexczuu4m40wxd6khhh048ndclq5mgx9g');
  expect(await tx.outputs[1]?.address()).toBe('tb1qn4g20fe47mt80eeq5hzs3c4nkjxdv4n8727hdzq7kq59rj92xydqsxf4r4');
});

// test using the first transaction of testnet network
test('can handle Block Reward as input', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba');
  expect(await tx.inputs[0]?.address()).toBe('Block Reward');
});

// test using the first and second block of testnet network
test('can retrieve transactions of a block range', async () => {
  const wallet = createWallet('testnet');
  const blocks = await wallet.getBlocks(1, 2);
  expect(blocks[0]?.transactions[0]?.hash).toBe('f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba');
  expect(blocks[1]?.transactions[0]?.hash).toBe('20222eb90f5895556926c112bb5aa0df4ab5abc3107e21a6950aec3b2e3541e2');
});

test('can retrieve address balance', async () => {
  const wallet = createWallet('testnet');
  const addr = new Address(0, 0, 'tb1qaqn2muzgsle78cknhz6qluf9j6uqkvqas95u2m', Buffer.from('2a38cfc8025dc970ca18537527ab78f838fb0c2159c12c8cce1c8afa0fc79174', 'hex'));
  const balance = await wallet.getAddressBalance(addr);
  expect(balance).toBe(35329n);
});
