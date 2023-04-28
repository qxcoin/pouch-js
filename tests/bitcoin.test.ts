import wif from 'wif';
import { Address, RawTransaction } from '../src/wallet';
import { BitcoinWallet } from '../src/bitcoin';

jest.setTimeout(240000);

test('can retrieve block height', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

// see: https://github.com/libbitcoin/libbitcoin-system/wiki/Altcoin-Version-Mappings#7-bitcoin-btc-bip-3944-technology-examples
test('can create valid address', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { rpcServer: 'http://example.com', fee: 0n });
  const addr = await wallet.getAddress(0, 0);
  expect(wif.encode(128, addr.privateKey, true)).toBe('KxdnUF9EAinLC6KWSrEZdQvdkT3XSbvDHzxANB1qKrpPjxSK2TFC');
  expect(addr.hash).toBe('bc1qaqn2muzgsle78cknhz6qluf9j6uqkvqa6r003g');
});

test('can create transaction for P2PKH', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'http://example.com', fee: BigInt(0.001 * 100000000) });
  const from = new Address(0, 0, 'tb1qaqn2muzgsle78cknhz6qluf9j6uqkvqas95u2m', Buffer.from('2a38cfc8025dc970ca18537527ab78f838fb0c2159c12c8cce1c8afa0fc79174', 'hex'));
  const spending = [new RawTransaction('940117f6669da0c9855b435d52c20b02117dc21290af4dd7df9bf381b2c6a2cc', '020000000001012beeeacb02a43ea4dc9c08c3c9701143fa59364bfcdb158b30fa8b0941dbb4b90100000000feffffff027cc2a5910100000016001434f54c5712a20f91f6995d5a014d5112d30eaa130823160000000000160014e826adf04887f3e3e2d3b8b40ff12596b80b301d024730440220712dba203a2185f7f59b2f7c3a2cf9ef0163821f05faa649701055382f1bc28902204a0aed4dde6f381a627711a94f6bad9ef73ad54b684fe7cabdab33980f9291a701210363d67b1556d9117a515f1a7b4afbafe3b658537c2079bef615d612e2042df5d04b0b2500')];
  const rawTx = await wallet.createTransaction(from, 'n2gTQ45JG7RzfjafW4MVvh7EseVX5VGHTs', BigInt(0.002 * 100000000), spending);
  expect(rawTx.hash).toBe('6a46b555c2b47d625b4554e1679fee4ad0476dfdb9075efe47c75e6c61f24a86');
  expect(rawTx.data).toBe('02000000000101cca2c6b281f39bdfd74daf9012c27d11020bc2525d435b85c9a09d66f61701940100000000ffffffff02400d0300000000001976a914e826adf04887f3e3e2d3b8b40ff12596b80b301d88ac288f110000000000160014e826adf04887f3e3e2d3b8b40ff12596b80b301d02483045022100f2bf7408fdfe36378e4f7db0a9acde516944c1845566f285cf5e3c4d93dcfd3402201b6d638e75264d0bca8500db833c8830148bfedfdfc83ba81a0fc3b9a24c0726012102c3d462c3b9aaf9e5dc540cbbd4d4a75346ce8ef9e3e124142c41b517950d3a2a00000000');
});

test('can create transaction for P2WPKH', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'http://example.com', fee: BigInt(0.001 * 100000000) });
  const from = new Address(0, 0, 'tb1qaqn2muzgsle78cknhz6qluf9j6uqkvqas95u2m', Buffer.from('2a38cfc8025dc970ca18537527ab78f838fb0c2159c12c8cce1c8afa0fc79174', 'hex'));
  const spending = [new RawTransaction('940117f6669da0c9855b435d52c20b02117dc21290af4dd7df9bf381b2c6a2cc', '020000000001012beeeacb02a43ea4dc9c08c3c9701143fa59364bfcdb158b30fa8b0941dbb4b90100000000feffffff027cc2a5910100000016001434f54c5712a20f91f6995d5a014d5112d30eaa130823160000000000160014e826adf04887f3e3e2d3b8b40ff12596b80b301d024730440220712dba203a2185f7f59b2f7c3a2cf9ef0163821f05faa649701055382f1bc28902204a0aed4dde6f381a627711a94f6bad9ef73ad54b684fe7cabdab33980f9291a701210363d67b1556d9117a515f1a7b4afbafe3b658537c2079bef615d612e2042df5d04b0b2500')];
  const rawTx = await wallet.createTransaction(from, 'tb1qte2qdm64ykmvjjpawxeev6g3d776z5502l4yj2', BigInt(0.002 * 100000000), spending);
  expect(rawTx.hash).toBe('1ebecbd8a1928f4087abacd803a30bd5061c97f3dfec9f6f9014317a48fc6afa');
  expect(rawTx.data).toBe('02000000000101cca2c6b281f39bdfd74daf9012c27d11020bc2525d435b85c9a09d66f61701940100000000ffffffff02400d0300000000001600145e5406ef5525b6c9483d71b39669116fbda1528f288f110000000000160014e826adf04887f3e3e2d3b8b40ff12596b80b301d024830450221008b832c076120677756b15d9b96f2bc442a799f6be66ac450d2b30d848fa7bbec02201dd0a25fe59d46d69ba4938d396472cb49342c85c35ba507cfe654a2a78e1a1e012102c3d462c3b9aaf9e5dc540cbbd4d4a75346ce8ef9e3e124142c41b517950d3a2a00000000');
});

// test using Pizza Transaction
test('can retrieve P2PKH transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/mainnet/', fee: 0n });
  const tx = await wallet.getTransaction('a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d');
  expect(await tx.inputs[0]?.address()).toBe('1XPTgDRhN8RFnzniWCddobD9iKZatrvH4');
  expect(await tx.outputs[0]?.address()).toBe('17SkEw2md5avVNyYgj6RiXuQKNwkXaxFyQ');
});

test('can retrieve P2WPKH transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const tx = await wallet.getTransaction('580cc9ad94042394cbbe31b58fb63ae1b0e60a433fd7c9679d87f91cdee34201');
  expect(await tx.inputs[0]?.address()).toBe('tb1q568fk0pmj9x044a9tqczr6a50xy2ze74qrsvl4');
  expect(await tx.outputs[0]?.address()).toBe('tb1q00ug85flspuk9ld9yflpxgave5dlxqt8t254rl');
  expect(tx.outputs[0]?.value).toBe(6477514563n);
  expect(await tx.outputs[1]?.address()).toBe('tb1qws4qs40qvys4lnrvc5dm7fdjh6wq00tm43x7sc');
  expect(tx.outputs[1]?.value).toBe(2051331n);
});

// The first transaction that has spent funds from P2WSH
test('can retrieve P2WSH transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/mainnet/', fee: 0n });
  const tx = await wallet.getTransaction('cab75da6d7fe1531c881d4efdb4826410a2604aa9e6442ab12a08363f34fb408');
  expect(await tx.inputs[0]?.address()).toBe('bc1qj9hlju59t0m4389033r2x8mlxwc86qgqm9flm626sd22cdhfs9jsyrrp6q');
  expect(await tx.outputs[0]?.address()).toBe('bc1qt4hs9aracmzhpy7ly3hrwsk0u83z4dqsln4vg5');
  expect(tx.outputs[0]?.value).toBe(73182n);
});

test('can retrieve P2WPKH-P2SH transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const tx = await wallet.getTransaction('678893a63f6c0084964272035d3b23cc3914a294601862177f301f0086b27d56');
  expect(await tx.inputs[0]?.address()).toBe('2NC9aEw5DZwaXGntkv8PXSv2f7eaGpHBRqD');
  expect(await tx.inputs[1]?.address()).toBe('2NDHWpQNCLo2yTwmyVkvMHgtby9pdoyGAP4');
  expect(await tx.outputs[0]?.address()).toBe('2NEH4zBsz3za2hzjyjXsGETz4SpHzhjiSiG');
  expect(tx.outputs[0]?.value).toBe(200000n);
  expect(await tx.outputs[1]?.address()).toBe('2N6jH2TKRnEfnsRA7dQLtTX7wfR2GpDoHqv');
  expect(tx.outputs[1]?.value).toBe(88478n);
});

test('can retrieve P2WSH-P2SH transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const tx = await wallet.getTransaction('74ca72c306816cd942b5b042378478a109989bf46b269e0be9e79736e21e7016');
  expect(await tx.inputs[0]?.address()).toBe('2MsyRCfhKxomefD7XWMTpZ9pq21zE19TxXd');
  expect(await tx.outputs[0]?.address()).toBe('2Mt1ZouaHFSyoPy7t9u5ZiFqDLKWv7t88Wh');
  expect(tx.outputs[0]?.value).toBe(2500n);
  expect(await tx.outputs[1]?.address()).toBe('2MsyRCfhKxomefD7XWMTpZ9pq21zE19TxXd');
  expect(tx.outputs[1]?.value).toBe(23000n);
});

// test using the first transaction of testnet network
test('can retrieve P2PK transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const tx = await wallet.getTransaction('f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba');
  expect(await tx.inputs[0]?.address()).toBe('Block Reward');
  expect(await tx.outputs[0]?.address()).toBe('n3GNqMveyvaPvUbH469vDRadqpJMPc84JA');
  expect(tx.outputs[0]?.value).toBe(5000000000n);
});

test('can retrieve P2TR transaction', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const tx = await wallet.getTransaction('228def0c3f8b4f1898cb7f442e356ed8755383745a682750102753c32072a9db');
  expect(await tx.inputs[0]?.address()).toBe('tb1p86u6c9u0p9ez08clh9aw9shxqqaeh35dj5thg20u9mx5ytplpxqsxp802z');
  expect(await tx.inputs[1]?.address()).toBe('tb1pmvgk75p2l29vckjt9sslu0m95vpvj8zylee2k9y8eg76uazu4neqz3vnd7');
  expect(await tx.outputs[0]?.address()).toBe('tb1p32d76xcy56htzfjaf94hu6d2gtexczuu4m40wxd6khhh048ndclq5mgx9g');
  expect(await tx.outputs[1]?.address()).toBe('tb1qn4g20fe47mt80eeq5hzs3c4nkjxdv4n8727hdzq7kq59rj92xydqsxf4r4');
});

// test using the first transaction of testnet network
test('can handle Block Reward as input', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const tx = await wallet.getTransaction('f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba');
  expect(await tx.inputs[0]?.address()).toBe('Block Reward');
});

// test using the first and second block of testnet network
test('can retrieve block transactions', async () => {
  const wallet = new BitcoinWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { rpcServer: 'https://btc.getblock.io/71bdf852-94b3-4bd2-85d8-74d085ec5c56/testnet/', fee: 0n });
  const txs = await wallet.getTransactions(1, 2);
  expect(txs[0]?.hash).toBe('f0315ffc38709d70ad5647e22048358dd3745f3ce3874223c80a7c92fab0c8ba');
  expect(txs[1]?.hash).toBe('20222eb90f5895556926c112bb5aa0df4ab5abc3107e21a6950aec3b2e3541e2');
});
