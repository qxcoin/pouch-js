import { Address } from '../src/wallet';
import { MoneroWallet } from '../src/monero';
import { expect, test, vi } from 'vitest';

function createWallet(network: 'testnet' | 'mainnet') {
  const mnemonic = 'radar blur cabbage chef fix engine embark joy scheme fiction master release';
  return new MoneroWallet(mnemonic, network, {
    path: './storage/test_monero_wallet',
    server: 'testnet' === network ? 'http://node.monerodevs.org:28089' : 'http://node.monerodevs.org:18089',
  });
}

vi.setConfig({ testTimeout: 240000 });

test('can retrieve block height', async () => {
  const wallet = createWallet('testnet');
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

test('can create valid address', async () => {
  const wallet = createWallet('mainnet');
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('356a1684d97dca6270799749f03a0cf0331bc9cc9392bf626b1af4285a53f90d');
  expect(addr.hash).toBe('46D3GUmsVXUPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJDP4Xt');
});

test('can sync wallet', async () => {
  const wallet = createWallet('testnet');
  const lastHeight = await wallet.getLastBlockHeight();
  await wallet.sync();
  const syncedHeight = await wallet.getSyncedBlockHeight();
  expect(lastHeight).toBe(syncedHeight);
});

test('can create transaction', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, '9wkakjS8mtaPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJMhPUV', Buffer.from('be2a02e0f40e151b20df8402c4acb108d0563cc0e72318431148cc808cce4603', 'hex'));
  await wallet.createTransaction(from, 'Bgc7jRBqPwr83YeKCad78v8neFU6L7F6bPgGrFXSUUZgeHrpjefFd6BMVD19qPyTBfZScuJ9T3zy91HxHzcpu7VzCrgBBjX', BigInt(0.1 * 1000000000000));
});

test('can estimate transaction fee', async () => {
  const wallet = createWallet('testnet');
  const from = new Address(0, 0, '9wkakjS8mtaPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJMhPUV', Buffer.from('be2a02e0f40e151b20df8402c4acb108d0563cc0e72318431148cc808cce4603', 'hex'));
  const fee = await wallet.estimateTransactionFee(from, 'BgVf9wDT2Wk4ZTd38igZbDTckEbCixhStNXE2ZX6Bq6geir4tsy3SBEEQCYorGyw1QVeB98gxh3ph4AhVTpnzDUp7eMUGzv', BigInt(0.1 * 1000000000000));
  expect(typeof fee).toBe('bigint');
});

test('can retrieve transaction', async () => {
  const wallet = createWallet('testnet');
  const tx = await wallet.getTransaction('5f3c77d15f3adb700493c069d86651e9e9c75aa21fbe4f7b71c92a28dd535a36');
  expect(await tx.outputs[0]?.address()).toBe('9wkakjS8mtaPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJMhPUV');
  expect(tx.outputs[0]?.value).toBe(1000000000000n);
});

test('can retrieve address balance', async () => {
  const wallet = createWallet('testnet');
  const addr = new Address(0, 0, '9wkakjS8mtaPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJMhPUV', Buffer.from('be2a02e0f40e151b20df8402c4acb108d0563cc0e72318431148cc808cce4603', 'hex'));
  const balance = await wallet.getAddressBalance(addr);
  expect(balance).toBe(1000000000000n);
});
