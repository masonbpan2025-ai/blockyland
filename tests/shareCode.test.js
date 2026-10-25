// Room codes and share links: the only thing a friend ever receives.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_ALPHABET, ROOM_CODE_LENGTH, generateRoomCode, normalizeRoomCode, isValidRoomCode, buildShareUrl, parseJoinCode, isLocalOnlyAddress,
} from '../src/multiplayer/shareCode.js';

test('a code is four digits, short enough to read out', () => {
  assert.equal(ROOM_ALPHABET, '0123456789');
  assert.equal(ROOM_CODE_LENGTH, 4);
  for (let i = 0; i < 200; i++) {
    const code = generateRoomCode();
    assert.match(code, /^[0-9]{4}$/);
    assert.ok(isValidRoomCode(code), code);
  }
});

test('codes are drawn evenly from all ten thousand', () => {
  const seen = new Set();
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 20000; i++) {
    const code = generateRoomCode();
    seen.add(code);
    for (const ch of code) counts[Number(ch)]++;
  }
  assert.ok(seen.size > 8000, `${seen.size} different codes in twenty thousand`);
  // 80,000 digits: each about 8,000. A biased draw (byte % 10 without rejection) skews 0-5 by about 2%.
  for (const [digit, n] of counts.entries()) assert.ok(Math.abs(n - 8000) < 400, `digit ${digit}: ${n}`);
});

test('the random source is injectable, so a code can be reproduced, and a byte that would bias it is drawn again', () => {
  assert.equal(generateRoomCode((bytes) => bytes.fill(0)), '0000');
  assert.equal(generateRoomCode((bytes) => { bytes.set([1, 12, 23, 34]); return bytes; }), '1234');
  let draw = 0;
  const skewed = (bytes) => { bytes.set(draw++ === 0 ? [255, 7, 251, 8] : [9, 9, 9, 9]); return bytes; };
  assert.equal(generateRoomCode(skewed), '7899', 'bytes 250-255 are skipped');
});

test('what a person types is cleaned up: spaces, dashes and letters that look like digits', () => {
  assert.equal(normalizeRoomCode('  12-34 '), '1234');
  assert.equal(normalizeRoomCode('1l0O'), '1100');
  assert.equal(normalizeRoomCode('4 2 0 7'), '4207');
  for (const junk of [null, undefined, 42, {}, []]) assert.equal(normalizeRoomCode(junk), '');
});

test('validity is exact: four digits', () => {
  assert.equal(isValidRoomCode('0042'), true);
  assert.equal(isValidRoomCode('123'), false);
  assert.equal(isValidRoomCode('12345'), false);
  assert.equal(isValidRoomCode('12a4'), false);
  assert.equal(isValidRoomCode('abcdefgh'), false, 'the old eight-letter codes are not codes any more');
  assert.equal(isValidRoomCode(1234), false);
});

test('a share link is the game\'s own address with the code, and nothing else of the host\'s', () => {
  const link = buildShareUrl('https://play.example/game/?join=old&debug=1#top', '4207');
  assert.equal(link, 'https://play.example/game/?join=4207');
  assert.equal(buildShareUrl('http://192.168.1.5:3000/', '4207', { signal: 'wss://meet.example/ws' }),
    'http://192.168.1.5:3000/?join=4207&signal=wss%3A%2F%2Fmeet.example%2Fws');
  assert.equal(buildShareUrl(new URL('https://x.example/'), '4207', { signal: '' }), 'https://x.example/?join=4207', 'an empty extra is left out');
});

test('a link\'s code is read back, from a query string or a whole address', () => {
  assert.equal(parseJoinCode('?join=4207'), '4207');
  assert.equal(parseJoinCode('?x=1&join=42-O7'), '4207', 'tolerant of how it was typed');
  assert.equal(parseJoinCode('https://play.example/?join=4207'), '4207');
  const code = generateRoomCode();
  assert.equal(parseJoinCode(buildShareUrl('https://a.example/', code)), code, 'round trip');
});

test('a link without a usable code asks to join nothing', () => {
  for (const bad of ['', '?', '?join=', '?join=123', '?join=12345', '?join=abcd2345', '?join=12%004', '?other=4207', null, undefined, 5, 'http://[']) {
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
