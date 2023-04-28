import { Address, RawTransaction } from '../src/wallet';
import { MoneroWallet } from '../src/monero';

jest.setTimeout(240000);

test('can retrieve block height', async () => {
  const wallet = new MoneroWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { server: 'https://testnet.xmr.ditatompel.com:443' });
  const height = await wallet.getLastBlockHeight();
  expect(typeof height).toBe('number');
});

test('can create valid address', async () => {
  const wallet = new MoneroWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'mainnet', { server: 'https://testnet.xmr.ditatompel.com:443' });
  const addr = await wallet.getAddress(0, 0);
  expect(addr.privateKey.toString('hex')).toBe('356a1684d97dca6270799749f03a0cf0331bc9cc9392bf626b1af4285a53f90d');
  expect(addr.hash).toBe('46D3GUmsVXUPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJDP4Xt');
});

test('can create transaction', async () => {
  const wallet = new MoneroWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { server: 'https://testnet.xmr.ditatompel.com:443' });
  const from = new Address(0, 0, '9wkakjS8mtaPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJMhPUV', Buffer.from('be2a02e0f40e151b20df8402c4acb108d0563cc0e72318431148cc808cce4603', 'hex'));
  const spending = [new RawTransaction('2c4dacb50197ae631da53a4f5fd8baca44386e8e53fe1c7d348db5d3e88133b2', '')];
  await wallet.createTransaction(from, 'BgVf9wDT2Wk4ZTd38igZbDTckEbCixhStNXE2ZX6Bq6geir4tsy3SBEEQCYorGyw1QVeB98gxh3ph4AhVTpnzDUp7eMUGzv', BigInt(0.1 * 1000000000000), spending);
});

test('can retrieve transaction', async () => {
  const wallet = new MoneroWallet('radar blur cabbage chef fix engine embark joy scheme fiction master release', 'testnet', { server: 'https://testnet.xmr.ditatompel.com:443' });
  const tx = await wallet.getTransaction('2c4dacb50197ae631da53a4f5fd8baca44386e8e53fe1c7d348db5d3e88133b2');
  expect(await tx.outputs[0]?.address()).toBe('9wkakjS8mtaPUpuwQ8mjhi8yJZMa8z4gHejQrKbZPLxGA3W565xthkUdKb7ZqFJi8SKaFfSCFzZHjJiwdyLDA3uNKJMhPUV');
  expect(tx.outputs[0]?.value).toBe(1000000000000n);
});
