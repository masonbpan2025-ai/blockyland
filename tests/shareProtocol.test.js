// What the host will accept from a guest. In a game with no server, every guest message is untrusted input.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeName, sanitizeChat, escapeHtml, sanitizePlayerState, sanitizeBlockUpdate, RateLimiter, guestLimiters,
  encodeFrames, FrameReassembler, ProtocolError, packSnapshot, unpackSnapshot, MAX_FRAME_CHARS, MAX_NAME_LENGTH, MAX_CHAT_LENGTH,
  WORLD_HEIGHT, MAX_COORDINATE,
} from '../src/multiplayer/shareProtocol.js';

// --- text -----------------------------------------------------------------------------

test('a name loses markup, control characters and length, and falls back when nothing is left', () => {
  assert.equal(sanitizeName('Alex'), 'Alex');
  assert.equal(sanitizeName('  Al   ex  '), 'Al ex', 'whitespace collapsed');
  assert.equal(sanitizeName('<script>alert(1)</script>'), 'scriptalert(1)/script');
  assert.equal(sanitizeName('a"b\'c`d&e\\f'), 'abcdef');
  assert.equal(sanitizeName('\u0000\u0007bell\u009f'), 'bell');
  assert.equal(sanitizeName('x'.repeat(100)).length, MAX_NAME_LENGTH);
  assert.equal(sanitizeName('<<<>>>'), 'Player', 'nothing left: the fallback');
  assert.equal(sanitizeName('<<>>', 'Guest'), 'Guest');
  for (const junk of [null, undefined, 5, {}, ['a']]) assert.equal(sanitizeName(junk), 'Player');
});

test('a name is never a way to inject markup, whatever it contains', () => {
  const attacks = ['<img src=x onerror=alert(1)>', '"><svg/onload=alert(1)>', "';alert(1);//", '‮<b>', '&lt;b&gt;'];
  for (const attack of attacks) assert.ok(!/[<>&"'`]/.test(sanitizeName(attack)), attack);
});

test('chat keeps its text (the game escapes it on display), but loses control characters and is bounded', () => {
  assert.equal(sanitizeChat('hello'), 'hello');
  assert.equal(sanitizeChat('  spaced  '), 'spaced');
  assert.equal(sanitizeChat('a\u0000b\u0007c'), 'abc');
  assert.equal(sanitizeChat('line1\nline2'), 'line1\nline2', 'a newline is ordinary text');
  assert.equal(sanitizeChat('x'.repeat(1000)).length, MAX_CHAT_LENGTH);
  for (const nothing of ['', '   ', '\u0007\u0007', null, undefined, 3, {}]) assert.equal(sanitizeChat(nothing), null);
});

test('escaping makes text inert as HTML', () => {
  assert.equal(escapeHtml('<b onclick="x">&\'</b>'), '&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
  assert.equal(escapeHtml(5), '5');
});

// --- state and blocks ---------------------------------------------------------------------

test('a pose is clamped, typed and stripped to what the game uses', () => {
  const s = sanitizePlayerState({ x: 1.5, y: 64, z: -2, yaw: 3, pitch: 0.2, isSneaking: true, isSprinting: 1, isSwinging: 'yes', activeItem: 'diamond_sword', health: 999, op: true });
  assert.deepEqual(s, { x: 1.5, y: 64, z: -2, yaw: 3, pitch: 0.2, isSneaking: true, isSprinting: false, isSwinging: false, activeItem: 'diamond_sword' });
});

test('a pose with no real position is refused, and extremes are held within the world', () => {
  for (const bad of [null, undefined, 5, 'x', {}, { x: 1, y: 2 }, { x: NaN, y: 1, z: 1 }, { x: Infinity, y: 1, z: 1 }, { x: '1', y: 1, z: 1 }]) {
    assert.equal(sanitizePlayerState(bad), null, JSON.stringify(bad));
  }
  const far = sanitizePlayerState({ x: 1e20, y: -1e9, z: -1e20 });
  assert.equal(far.x, MAX_COORDINATE);
  assert.equal(far.z, -MAX_COORDINATE);
  assert.equal(far.y, -1000);
  assert.equal(sanitizePlayerState({ x: 0, y: 0, z: 0, pitch: 50 }).pitch, Math.PI / 2, 'cannot look past straight up');
  assert.equal(sanitizePlayerState({ x: 0, y: 0, z: 0, pitch: 'up', yaw: null }).yaw, 0);
});

test('a held item must look like an item id', () => {
  for (const ok of ['stick', 'diamond_sword', 'minecraft:stone', 'a.b-c']) assert.equal(sanitizePlayerState({ x: 0, y: 0, z: 0, activeItem: ok }).activeItem, ok);
  for (const bad of ['<script>', 'a b', '', 'x'.repeat(65), 5, {}, null]) assert.equal(sanitizePlayerState({ x: 0, y: 0, z: 0, activeItem: bad }).activeItem, null, String(bad));
});

test('a block edit must be whole numbers inside the world and name a real block', () => {
  assert.deepEqual(sanitizeBlockUpdate({ x: 3, y: 10, z: -4, blockId: 5, junk: 1 }), { x: 3, y: 10, z: -4, blockId: 5 });
  assert.deepEqual(sanitizeBlockUpdate({ x: 0, y: 0, z: 0, blockId: 0 }), { x: 0, y: 0, z: 0, blockId: 0 }, 'air is a block');
  assert.deepEqual(sanitizeBlockUpdate({ x: 0, y: WORLD_HEIGHT - 1, z: 0, blockId: 1 }), { x: 0, y: WORLD_HEIGHT - 1, z: 0, blockId: 1 });
  for (const bad of [
    null, 'x', {}, { x: 1, y: 1, z: 1 }, { x: 1.5, y: 1, z: 1, blockId: 1 }, { x: NaN, y: 1, z: 1, blockId: 1 }, { x: '1', y: 1, z: 1, blockId: 1 },
    { x: 1, y: -1, z: 1, blockId: 1 }, { x: 1, y: WORLD_HEIGHT, z: 1, blockId: 1 }, { x: MAX_COORDINATE + 1, y: 1, z: 1, blockId: 1 },
    { x: 1, y: 1, z: -MAX_COORDINATE - 1, blockId: 1 }, { x: 1, y: 1, z: 1, blockId: -1 }, { x: 1, y: 1, z: 1, blockId: 1e9 }, { x: 1, y: 1, z: 1, blockId: 1.5 },
  ]) assert.equal(sanitizeBlockUpdate(bad), null, JSON.stringify(bad));
});

test('the game can say which block ids exist', () => {
  const known = (id) => id >= 0 && id < 10;
  assert.ok(sanitizeBlockUpdate({ x: 0, y: 0, z: 0, blockId: 9 }, { isBlockId: known }));
  assert.equal(sanitizeBlockUpdate({ x: 0, y: 0, z: 0, blockId: 10 }, { isBlockId: known }), null);
});

// --- rate limits ------------------------------------------------------------------------

test('a rate limiter allows a burst, then the steady rate, and recovers with time', () => {
  let t = 0;
  const limiter = new RateLimiter({ perSecond: 2, burst: 3, now: () => t });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take()), [true, true, true, false], 'a burst of three');
  t = 500;
  assert.equal(limiter.take(), true, 'half a second earns one');
  assert.equal(limiter.take(), false);
  t = 60_000;
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.take()), [true, true, true, false], 'a long rest refills only to the burst');
});

test('each guest gets budgets sized to what play needs, with chat much tighter than movement', () => {
  let t = 0;
  const l = guestLimiters(() => t);
  const count = (limiter) => { let n = 0; while (limiter.take() && n < 10_000) n++; return n; };
  assert.ok(count(l.state) >= 40, 'enough for 25 updates a second');
  assert.ok(count(l.chat) <= 6, 'chat cannot flood');
  assert.ok(count(l.block) >= 30);
});

// --- frames ------------------------------------------------------------------------------

test('a short message is one frame and arrives as it was sent', () => {
  const frames = encodeFrames('{"t":"ping"}');
  assert.equal(frames.length, 1);
  assert.equal(new FrameReassembler().push(frames[0]), '{"t":"ping"}');
});

test('a long message is split into frames within the channel\'s limit, and rejoined in any order', () => {
  const text = 'abcdefghij'.repeat(10_000);
  const frames = encodeFrames(text);
  assert.ok(frames.length > 1);
  assert.ok(frames.every((f) => f.length <= MAX_FRAME_CHARS + 24), 'every frame is small enough to send');
  const r = new FrameReassembler();
  let out = null;
  for (const frame of [...frames].reverse()) out = r.push(frame) ?? out;
  assert.equal(out, text);
  assert.equal(r.pending.size, 0, 'nothing is left waiting');
});

test('frames of two messages can interleave', () => {
  const a = encodeFrames('A'.repeat(40_000));
  const b = encodeFrames('B'.repeat(40_000));
  const r = new FrameReassembler();
  const done = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    for (const set of [a, b]) if (set[i]) { const m = r.push(set[i]); if (m) done.push(m[0]); }
  }
  assert.deepEqual(done.sort(), ['A', 'B']);
});

test('a hostile sender cannot exhaust memory with frames', () => {
  const small = { maxChars: 50_000, maxFrame: 1000, maxPending: 2 };
  assert.throws(() => new FrameReassembler(small).push('no separators'), ProtocolError);
  assert.throws(() => new FrameReassembler(small).push('id|5|3|data'), /index/);
  assert.throws(() => new FrameReassembler(small).push('id|-1|3|data'), /index/);
  assert.throws(() => new FrameReassembler(small).push('id|x|3|data'), /index/);
  assert.throws(() => new FrameReassembler(small).push(`id|0|2|${'x'.repeat(1001)}`), /too large/);
  assert.throws(() => new FrameReassembler(small).push('id|0|9999999|x'), /too large/, 'a promise of an enormous message');
  assert.throws(() => new FrameReassembler(small).push(42), ProtocolError);
  const r = new FrameReassembler(small);
  r.push('a|0|2|x');
  r.push('b|0|2|x');
  assert.throws(() => r.push('c|0|2|x'), /too many/, 'only so many half-sent messages at once');
  const r2 = new FrameReassembler(small);
  r2.push('a|0|3|x');
  assert.throws(() => r2.push('a|1|9|x'), /changed/, 'the declared size cannot change');
});

test('the same frame twice is not counted twice', () => {
  const r = new FrameReassembler();
  assert.equal(r.push('m|0|2|ab'), null);
  assert.equal(r.push('m|0|2|ab'), null, 'a duplicate adds nothing');
  assert.equal(r.push('m|1|2|cd'), 'abcd');
});

// --- compressed snapshots ---------------------------------------------------------------

test('a snapshot round-trips exactly, and is much smaller on the wire', async () => {
  const world = { chunks: Array.from({ length: 300 }, (_, i) => ({ i, v: Array.from({ length: 256 }, (_, j) => (i + j) % 9) })) };
  const packed = await packSnapshot(world);
  assert.equal(packed.enc, 'gzip-b64');
  assert.ok(packed.data.length < JSON.stringify(world).length / 5, `${packed.data.length} against ${JSON.stringify(world).length}`);
  assert.deepEqual(await unpackSnapshot(packed), world);
});

test('text outside the Latin range survives packing', async () => {
  const world = { name: 'Café ☕ 世界 🌍', nested: { emoji: '🧱' } };
  assert.deepEqual(await unpackSnapshot(await packSnapshot(world)), world);
});

test('an uncompressed snapshot is accepted, within a limit', async () => {
  assert.deepEqual(await unpackSnapshot({ enc: 'json', data: '{"a":1}' }), { a: 1 });
  await assert.rejects(unpackSnapshot({ enc: 'json', data: JSON.stringify({ big: 'x'.repeat(2000) }) }, { maxChars: 100 }), /too large/);
});

test('a hostile snapshot cannot expand without limit', async () => {
  const bomb = await packSnapshot({ filler: 'a'.repeat(5_000_000) });
  assert.ok(bomb.data.length < 20_000, 'a few kilobytes on the wire...');
  await assert.rejects(unpackSnapshot(bomb, { maxChars: 1_000_000 }), /too large/, '...refused when it would expand past the limit');
});

test('garbage is refused rather than crashing', async () => {
  for (const bad of [null, undefined, {}, { enc: 'gzip-b64' }, { enc: 'rot13', data: 'abc' }, { enc: 'gzip-b64', data: 'not-base64!!' }, { enc: 'gzip-b64', data: 'AAAA' }]) {
    await assert.rejects(unpackSnapshot(bad), (e) => e instanceof Error, JSON.stringify(bad));
  }
});
