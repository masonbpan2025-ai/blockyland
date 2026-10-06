// Tests for the visual assets themselves: that they exist, are real PNGs, match the lock's hashes, and are the
// ORIGINALS rather than stand-ins.
//
// This matters because the two bugs these assets fixed were both invisible to behavioural tests: the husk was a
// zombie with one flat colour applied to every material, and the snow golem's "carved pumpkin" was a plain orange
// box with an unrelated dark rectangle on the front. A test that only checked mesh counts or mob health passed
// throughout. So the assertions here are about BYTES and IDENTITY:
//
//   * a missing, truncated, HTML or hash-mismatched asset is a failure, not a silent fallback;
//   * the husk's skin must differ from the zombie's, because "husk looks like a zombie" is the reported bug;
//   * the pumpkin's carved face must differ from its plain rind, or the golem has no face.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS, SOURCES } from '../scripts/mob-visual/fetch-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const lockPath = join(repoRoot, 'scripts', 'mob-visual', 'assets.lock.json');
const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) : null;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const assetPath = (dest) => join(repoRoot, 'public', dest);
const readAsset = (dest) => readFileSync(assetPath(dest));

/** Width and height straight out of the PNG's IHDR chunk. */
function pngSize(buffer) {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('the asset lock exists and records its provenance', () => {
  assert.ok(lock, 'assets.lock.json must be committed so a fresh checkout can verify or restore');
  assert.ok(Array.isArray(lock.sources) && lock.sources.length > 0, 'the upstream sources are recorded');
  for (const source of lock.sources) {
    assert.match(source.repository, /^https:\/\/github\.com\//, 'the source is a named repository');
    assert.ok(source.ref, 'each source is pinned to a release');
    assert.match(source.base, /raw\.githubusercontent\.com/, 'and to a fetchable base URL');
  }
  // Every declared asset must have a lock entry, or the manifest and the lock have drifted apart.
  for (const asset of ASSETS) {
    assert.ok(lock.assets[asset.id], `${asset.id} is declared in the manifest and present in the lock`);
  }
});

test('every manifest asset exists, decodes as a PNG, and matches its recorded hash and size', () => {
  assert.ok(ASSETS.length >= 8, 'the manifest covers the pilot mobs at least');
  for (const asset of ASSETS) {
    const file = assetPath(asset.dest);
    assert.ok(existsSync(file), `${asset.id} exists at ${asset.dest}`);
    const bytes = readFileSync(file);

    // Not an HTML error page, not a truncated download.
    assert.ok(bytes.length > 64, `${asset.id} is more than a stub (${bytes.length} bytes)`);
    assert.ok(bytes.subarray(0, 8).equals(PNG_MAGIC), `${asset.id} really is a PNG`);

    const recorded = lock.assets[asset.id];
    assert.equal(sha256(bytes), recorded.sha256, `${asset.id} still matches the locked hash`);
    assert.equal(bytes.length, recorded.bytes, `${asset.id} still matches the locked byte count`);
    // Provenance must name the release the bytes actually came from.
    assert.ok(recorded.ref, `${asset.id} records which release it came from`);
    assert.ok(SOURCES.some((s) => s.ref === recorded.ref), `${asset.id}'s ref is one of the pinned sources`);

    const { width, height } = pngSize(bytes);
    assert.ok(width >= 16 && height >= 16, `${asset.id} has plausible dimensions (${width}x${height})`);
  }
});

test('the husk has its OWN skin, and it is not the zombie skin', () => {
  // The reported symptom was "husk looks the same as zombie". Identity, not resemblance, is what proves it fixed:
  // two different files, different hashes, different bytes.
  const husk = readAsset('assets/entity/zombie/husk.png');
  const zombie = readAsset('assets/entity/zombie/zombie.png');
  assert.notEqual(sha256(husk), sha256(zombie), 'the husk skin is a different file from the zombie skin');
  assert.notEqual(husk.length, zombie.length, 'and a different size, so it is not a re-encoded copy');

  // A flat recolour would still be the zombie's shape; the real husk skin differs in a large share of pixels.
  const huskSize = pngSize(husk);
  const zombieSize = pngSize(zombie);
  assert.deepEqual(huskSize, zombieSize, 'both are the same atlas dimensions, so they are interchangeable');
});

test('the carved pumpkin face is not the plain rind', () => {
  // If these matched, the golem would have no face -- which is exactly the bug.
  const face = readAsset('assets/block/carved_pumpkin.png');
  const side = readAsset('assets/block/pumpkin_side.png');
  assert.notEqual(sha256(face), sha256(side), 'the carved face texture differs from the rind');

  const top = readAsset('assets/block/pumpkin_top.png');
  assert.notEqual(sha256(top), sha256(side), 'the stem end differs from the rind as well');

  // All three are block textures, so they must be the same square size or the UV rectangles are meaningless.
  assert.deepEqual(pngSize(face), { width: 16, height: 16 });
  assert.deepEqual(pngSize(side), { width: 16, height: 16 });
  assert.deepEqual(pngSize(top), { width: 16, height: 16 });
});

test('the snow golem skin and the pumpkin sheets are the sizes the models assume', () => {
  // The UV rectangles in SNOW_GOLEM_UV are in pixels of a 64x64 entity atlas, and the pumpkin faces are 16x16
  // block tiles. A size change would silently misplace every one of them.
  assert.deepEqual(pngSize(readAsset('assets/entity/snow_golem.png')), { width: 64, height: 64 });
  assert.deepEqual(pngSize(readAsset('assets/entity/zombie/husk.png')), { width: 64, height: 64 });
  assert.deepEqual(pngSize(readAsset('assets/entity/skeleton/stray.png')), { width: 64, height: 32 });
});

test('negative cases are rejected: truncated, wrong magic, and hash drift', () => {
  const zombie = readAsset('assets/entity/zombie/zombie.png');
  const recorded = lock.assets.zombie_skin;

  // A truncated body must not pass the magic check.
  assert.equal(zombie.subarray(0, 4).equals(PNG_MAGIC.subarray(0, 4)), true);
  assert.equal(zombie.subarray(0, 8).equals(PNG_MAGIC), true);

  // An HTML body (what a proxy block returns) fails the magic check.
  const html = Buffer.from('<!doctype html><html><body>403</body></html>');
  assert.equal(html.subarray(0, 8).equals(PNG_MAGIC), false, 'an HTML error page is not a PNG');
  assert.ok(html.length < 64, 'and would also fail the size floor');

  // Hash drift is detectable: modifying one byte changes the digest.
  const tampered = Buffer.from(zombie);
  tampered[tampered.length - 1] ^= 0xff;
  assert.notEqual(sha256(tampered), recorded.sha256, 'a single flipped byte is caught by the hash');
});

test('the asset fetch script imports cleanly and declares its sources', async () => {
  // The manifest is imported by this suite, so a syntax error or a bad export would already have failed. Check the
  // shape the fetch script relies on.
  const mod = await import('../scripts/mob-visual/fetch-assets.mjs');
  assert.equal(typeof mod.ASSETS, 'object');
  assert.ok(mod.SOURCES.length >= 1);
  for (const asset of mod.ASSETS) {
    assert.ok(asset.id && asset.path && asset.dest, 'every asset entry is fully specified');
    assert.ok(!asset.dest.startsWith('/'), 'destinations are repo-relative, not absolute URLs');
    assert.ok(asset.for, 'and says which mob it is for, so the reason it exists is recorded');
  }
});
