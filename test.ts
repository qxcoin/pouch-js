import * as bitcoin from 'bitcoinjs-lib';
import { ofetch } from 'ofetch';

const block = bitcoin.Block.fromHex('0100000085144a84488ea88d221c8bd6c059da090e88f8a2c99690ee55dbba4e00000000e11c48fecdd9e72510ca84f023370c9a38bf91ac5cae88019bee94d24528526344c36649ffff001d1d03e477');

console.log(block.getId());

const body = { "jsonrpc": "2.0", "id": 0, method: 'getblock', params: [block.getId(), 2] };
const data = await ofetch('https://go.getblock.io/139892f83b72409bb850d16de30d51d7', { method: 'POST', body });

console.log(data);
