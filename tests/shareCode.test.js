// Room codes and share links: the only thing a friend ever receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_ALPHABET, ROOM_CODE_LENGTH, generateRoomCode, normalizeRoomCode, isValidRoomCode, buildShareUrl, parseJoinCode, isLocalOnlyAddress,
} from '../src/multiplayer/shareCode.js';

test('a code is eight characters from an alphabet with no look-alikes', () => {
  assert.equal(ROOM_ALPHABET.length, 32);
  for (const bad of ['i', 'l', 'o', 'u']) assert.ok(!ROOM_ALPHABET.includes(bad), `${bad} is left out`);
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    assert.equal(code.length, ROOM_CODE_LENGTH);
    assert.ok(isValidRoomCode(code), code);
  }
});

test('codes are drawn from the whole space and do not repeat', () => {
  const seen = new Set();
  const chars = new Set();
  for (let i = 0; i < 2000; i++) {
    const code = generateRoomCode();
    seen.add(code);
    for (const ch of code) chars.add(ch);
  }
  assert.equal(seen.size, 2000, 'no collisions in two thousand codes');
  assert.equal(chars.size, 32, 'every letter of the alphabet is used');
});

test('the random source is injectable, so a code can be reproduced', () => {
  const fixed = generateRoomCode((bytes) => bytes.fill(0));
  assert.equal(fixed, '00000000');
  assert.equal(generateRoomCode((bytes) => { bytes.set([1, 2, 3, 4, 5, 6, 7, 8]); return bytes; }), '12345678');
});

test('what a person types is cleaned up: case, spaces, dashes and look-alike characters', () => {
  assert.equal(normalizeRoomCode('  ABCD-EFGH '), 'abcdefgh');
  assert.equal(normalizeRoomCode('1l0O'), '1100');
  assert.equal(normalizeRoomCode('ab cd ef gh'), 'abcdefgh');
  for (const junk of [null, undefined, 42, {}, []]) assert.equal(normalizeRoomCode(junk), '');
});

test('validity is exact: length and alphabet', () => {
  assert.equal(isValidRoomCode('abcdefgh'), true);
  assert.equal(isValidRoomCode('abcdefg'), false);
  assert.equal(isValidRoomCode('abcdefghj'), false);
  assert.equal(isValidRoomCode('abcdefgi'), false, 'i is not in the alphabet');
  assert.equal(isValidRoomCode('ABCDEFGH'), false, 'codes are lower case once normalised');
  assert.equal(isValidRoomCode(12345678), false);
});

test('a share link is the game\'s own address with the code, and nothing else of the host\'s', () => {
  const link = buildShareUrl('https://play.example/game/?join=old&debug=1#top', 'abcd2345');
  assert.equal(link, 'https://play.example/game/?join=abcd2345');
  assert.equal(buildShareUrl('http://192.168.1.5:3000/', 'abcd2345', { signal: 'wss://meet.example/ws' }),
    'http://192.168.1.5:3000/?join=abcd2345&signal=wss%3A%2F%2Fmeet.example%2Fws');
  assert.equal(buildShareUrl(new URL('https://x.example/'), 'abcd2345', { signal: '' }), 'https://x.example/?join=abcd2345', 'an empty extra is left out');
});

test('a link\'s code is read back, from a query string or a whole address', () => {
  assert.equal(parseJoinCode('?join=abcd2345'), 'abcd2345');
  assert.equal(parseJoinCode('?x=1&join=ABCD-2345'), 'abcd2345', 'tolerant of how it was typed');
  assert.equal(parseJoinCode('https://play.example/?join=abcd2345'), 'abcd2345');
  const code = generateRoomCode();
  assert.equal(parseJoinCode(buildShareUrl('https://a.example/', code)), code, 'round trip');
});

test('a link without a usable code asks to join nothing', () => {
  for (const bad of ['', '?', '?join=', '?join=short', '?join=abcdefghijk', '?join=abc%00defg', '?other=abcd2345', null, undefined, 5, 'http://[']) {
    assert.equal(parseJoinCode(bad), null, String(bad));
  }
});

test('addresses only this computer can open are recognised, so the dialog can warn', () => {
  for (const local of ['http://localhost:3000/', 'http://127.0.0.1:3000/', 'http://[::1]:3000/', 'http://game.localhost/']) {
    assert.equal(isLocalOnlyAddress(local), true, local);
  }
  for (const reachable of ['https://play.example/', 'http://192.168.1.5:3000/', 'http://10.0.0.7/']) {
    assert.equal(isLocalOnlyAddress(reachable), false, reachable);
  }
  assert.equal(isLocalOnlyAddress('not a url'), false);
});
