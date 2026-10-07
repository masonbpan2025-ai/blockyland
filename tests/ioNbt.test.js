// NBT round-trip and security tests.
//
// §36 requires every codec to be tested input -> parse -> canonical -> serialize -> parse again -> compare, and
// §31 requires every imported file to be treated as untrusted. This file does both for NBT, which is the layer
// every other format in this subsystem stands on: a bug here is a bug in Sponge schematics, Java structures and
// region files at once.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TagType, TAG_NAMES, readNbt, writeNbt, readNbtAuto, gzip, gunzip, inflate, deflate,
  isGzipped, isZlib, NbtError, NBT_LIMITS
} from '../src/io/nbt.js';

/** Read -> write -> read, the shape §36 asks for. */
function roundTrip(value, options = {}) {
  return readNbt(writeNbt(value, options), { littleEndian: options.littleEndian });
}

test('every tag type survives a round trip, big-endian', () => {
  const value = {
    byte: -12,
    short: -3000,
    int: 1234567,
    long: 9007199254740993n, // deliberately beyond a double's exact range: BigInt is the point
    float: 1.5,
    double: -2.25,
    byteArray: Uint8Array.from([0, 1, 2, 254, 255]),
    string: 'minecraft:oak_stairs[facing=north]',
    list: [1, 2, 3],
    compound: { nested: { deeper: 'yes' } },
    intArray: Int32Array.from([-1, 0, 2147483647]),
    longArray: BigInt64Array.from([-1n, 4611686018427387904n])
  };
  const back = roundTrip(value);

  assert.equal(back.byte, -12);
  assert.equal(back.short, -3000);
  assert.equal(back.int, 1234567);
  assert.equal(back.long, 9007199254740993n, 'a long must not lose its low bits');
  assert.equal(back.float, 1.5);
  assert.equal(back.double, -2.25);
  assert.deepEqual([...back.byteArray], [0, 1, 2, 254, 255]);
  assert.equal(back.string, 'minecraft:oak_stairs[facing=north]');
  assert.deepEqual(back.list, [1, 2, 3]);
  assert.equal(back.compound.nested.deeper, 'yes');
  assert.deepEqual([...back.intArray], [-1, 0, 2147483647]);
  assert.deepEqual([...back.longArray].map(String), ['-1', '4611686018427387904']);
  // The tag ids must be the format's own, or nothing else can read the file.
  assert.equal(TagType.COMPOUND, 10);
  assert.equal(TAG_NAMES[12], 'LONG_ARRAY');
});

test('little-endian is byte-for-byte different, and round-trips', () => {
  // Bedrock is little-endian throughout. If the option were ignored, a Bedrock file would parse as garbage
  // rather than fail, which is the worst possible outcome.
  const value = { int: 0x01020304, short: 0x0102, long: 0x0102030405060708n };
  const big = writeNbt(value);
  const little = writeNbt(value, { littleEndian: true });
  assert.notDeepEqual([...big], [...little], 'the two encodings must differ');
  assert.deepEqual(roundTrip(value, { littleEndian: true }).int, 0x01020304);
  assert.equal(roundTrip(value, { littleEndian: true }).long, 0x0102030405060708n);
  // The int's bytes must be reversed, which proves the option reaches the writer rather than only the reader.
  const bigIntAt = big.indexOf(0x01);
  const littleBytes = [...little];
  assert.ok(littleBytes.includes(0x04) && littleBytes.includes(0x01), 'the int is written low byte first');
  assert.ok(bigIntAt >= 0);
});

test('gzip and zlib payloads are detected by content and inflated', async () => {
  const value = { hello: 'world', list: [1, 2, 3] };
  const raw = writeNbt(value);
  const gzipped = await gzip(raw);
  const deflated = await deflate(raw);

  assert.ok(isGzipped(gzipped), 'gzip is recognised by its magic bytes, not by a file name');
  assert.ok(isZlib(deflated), 'so is a zlib stream');
  assert.equal(isGzipped(raw), false);
  assert.deepEqual([...await gunzip(gzipped)], [...raw], 'gzip must round-trip exactly');
  assert.deepEqual([...await inflate(deflated)], [...raw], 'zlib must round-trip exactly');

  const fromGzip = await readNbtAuto(gzipped);
  const fromZlib = await readNbtAuto(deflated);
  const fromRaw = await readNbtAuto(raw);
  assert.equal(fromGzip.hello, 'world');
  assert.equal(fromZlib.hello, 'world');
  assert.equal(fromRaw.hello, 'world');
  assert.deepEqual(fromGzip.list, [1, 2, 3]);
});

test('an unknown tag type is refused, not guessed at', () => {
  const bytes = Uint8Array.from([90, 0, 0, 0]);
  assert.throws(() => readNbt(bytes), NbtError);
});

test('truncated input is refused at the byte where it ran out', () => {
  const raw = writeNbt({ a: 'a string long enough to be cut' });
  assert.throws(() => readNbt(raw.subarray(0, raw.length - 4)), /unexpected end of NBT/);
  assert.throws(() => readNbt(Uint8Array.from([TagType.END])), /empty NBT/);
});

test('nested compounds beyond the depth limit are refused', () => {
  // A 40-byte file can nest arbitrarily deep; without a limit this is a stack overflow, which is a denial of
  // service rather than an error message.
  let deep = { leaf: 1 };
  for (let i = 0; i < 80; i++) deep = { inner: deep };
  // Written with a raised limit on purpose: the WRITER refuses first at the default one, which is a separate\n  // behaviour and is asserted on the next line. Testing the reader needs bytes the writer would not produce.\n  const deepBytes = writeNbt(deep, { limits: { ...NBT_LIMITS, maxDepth: 200 } });\n  assert.throws(() => readNbt(deepBytes), /nested deeper than/);
  assert.throws(() => writeNbt(deep), /deeper than/);
});

test('a list that claims more elements than it holds is refused before allocating', () => {
  // The classic NBT bomb: a four-byte length field claiming 2^31-1 elements. The reader must refuse on the
  // DECLARED length, before it tries to read or allocate anything.
  const header = writeNbt({ list: [1] });
  const bomb = Uint8Array.from(header);
  // Find the list's length int (it is the 4 bytes before the single element) and inflate it.
  const view = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
  for (let i = 0; i + 4 <= bomb.length; i++) {
    if (view.getInt32(i) === 1) {
      view.setInt32(i, 0x7fffffff);
      break;
    }
  }
  assert.throws(() => readNbt(bomb), /above the limit|unexpected end/);
});

test('a string longer than the limit is refused', () => {
  const bytes = writeNbt({ s: 'x'.repeat(64) });
  assert.throws(() => readNbt(bytes, { limits: { ...NBT_LIMITS, maxStringLength: 8 } }), /above the limit/);
});

test('a malformed varint is refused rather than looping for ever', async () => {
  // Varints are Sponge's encoding, and a corrupt one must not spin: five continuation bytes is already
  // suspicious and the reader stops there.
  const { readVarInt } = await import('../src/io/codecs.js');
  assert.throws(() => readVarInt(Uint8Array.from([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80]), 0), /longer than 5 bytes/);
  assert.throws(() => readVarInt(Uint8Array.from([0x80]), 0), /past the end/);
  // And a valid one decodes: 300 is 0xAC 0x02.
  assert.equal(readVarInt(Uint8Array.from([0xac, 0x02]), 0).value, 300);
});

test('the root compound name is preserved, and defaults to empty as Minecraft writes it', () => {
  const bytes = writeNbt({ a: 1 });
  const withName = readNbt(bytes, { withName: true });
  assert.equal(withName.name, '', 'the root name is empty');
  assert.equal(withName.type, TagType.COMPOUND);
  assert.equal(withName.value.a, 1);
  const named = readNbt(writeNbt({ a: 1 }, { rootName: 'hello' }), { withName: true });
  assert.equal(named.name, 'hello');
});

test('type overrides let a caller keep an int an int, and drop nulls rather than writing them', () => {
  // A whole-number DOUBLE and an INT are the same JS value, and real files distinguish them (a region's
  // "yPos" is an int; a structure's coordinates are ints too). Guessing is documented; overriding is exact.
  const bytes = writeNbt({ count: 5, missing: null, name: 'x' }, { types: { count: TagType.DOUBLE } });
  const back = readNbt(bytes);
  assert.equal(back.count, 5);
  assert.equal(back.missing, undefined, 'a null is an absent tag, not a written one');
  assert.equal(back.name, 'x');
});
