import test from 'node:test';
import assert from 'node:assert/strict';
import { parseServerAddress, buildClientUrl, HYPIXEL } from '../src/multiplayer/serverAddress.js';

test('Java addresses normalize hostname, port, IPv4 and bracketed IPv6', () => {
  assert.deepEqual(parseServerAddress(' MC.HYPIXEL.NET '), { host: 'mc.hypixel.net', port: 25565, address: 'mc.hypixel.net' });
  assert.equal(parseServerAddress('localhost:25566').port, 25566);
  assert.equal(parseServerAddress('127.0.0.1').host, '127.0.0.1');
  assert.equal(parseServerAddress('[::1]:25565').host, '::1');
  assert.deepEqual(parseServerAddress('top.traffic.pika.host.:25565'), { host: 'top.traffic.pika.host', port: 25565, address: 'top.traffic.pika.host:25565' });
});
test('invalid destinations fail before opening a connection', () => {
  for (const address of ['', '.', 'host..', 'https://mc.hypixel.net', 'host/path', 'a@host', 'host:0', 'host:65536', 'host:abc', 'host\nother', 'a..b']) {
    assert.throws(() => parseServerAddress(address), undefined, address);
  }
});
test('launch uses documented upstream parameters and preserves account selection', () => {
  const url = new URL(buildClientUrl('http://localhost:3001/', { ...HYPIXEL, name: 'A & B <server>' }));
  assert.equal(url.searchParams.get('ip'), HYPIXEL.address);
  assert.equal(url.searchParams.get('name'), 'A & B <server>');
  assert.equal(url.searchParams.get('version'), HYPIXEL.version);
  assert.equal(url.searchParams.get('proxy'), 'http://localhost:3001');
  assert.equal(url.searchParams.has('autoConnect'), false);
});
test('versions, client URLs and offline usernames are validated independently', () => {
  assert.throws(() => buildClientUrl('javascript:alert(1)', HYPIXEL));
  assert.throws(() => buildClientUrl('http://localhost/', { ...HYPIXEL, version: 'invalid' }));
  assert.throws(() => buildClientUrl('http://localhost/', { ...HYPIXEL, username: '<script>' }));
  assert.equal(new URL(buildClientUrl('http://localhost/', { ...HYPIXEL, username: 'Test_Player' })).searchParams.get('username'), 'Test_Player');
});
