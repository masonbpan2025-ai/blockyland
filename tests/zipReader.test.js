import test from 'node:test';
import assert from 'node:assert/strict';
import { readZip, createSimpleZip } from '../src/io/zipReader.js';

test('createSimpleZip & readZip roundtrip: extracts files with matching content', async () => {
  const filesToZip = {
    'pack.mcmeta': JSON.stringify({ pack: { pack_format: 46, description: 'Test Pack' } }),
    'assets/minecraft/textures/block/stone.png': new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    'assets/minecraft/textures/item/diamond_sword.png': new Uint8Array([1, 2, 3, 4, 5]),
  };

  const zipBytes = createSimpleZip(filesToZip);
  assert.ok(zipBytes instanceof Uint8Array);
  assert.ok(zipBytes.length > 50);

  const extracted = await readZip(zipBytes);
  assert.ok(extracted['pack.mcmeta'], 'Extracts pack.mcmeta');
  assert.ok(extracted['assets/minecraft/textures/block/stone.png'], 'Extracts stone.png');
  assert.ok(extracted['assets/minecraft/textures/item/diamond_sword.png'], 'Extracts diamond_sword.png');

  const textDecoder = new TextDecoder();
  const meta = JSON.parse(textDecoder.decode(extracted['pack.mcmeta']));
  assert.equal(meta.pack.pack_format, 46);
  assert.equal(meta.pack.description, 'Test Pack');
  assert.deepEqual(Array.from(extracted['assets/minecraft/textures/item/diamond_sword.png']), [1, 2, 3, 4, 5]);
});

test('readZip rejects corrupt input', async () => {
  await assert.rejects(
    async () => readZip(new Uint8Array([1, 2, 3, 4, 5])),
    /Not a valid ZIP archive/
  );
});
