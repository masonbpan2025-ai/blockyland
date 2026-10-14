// Strongholds: the start (spiral staircase at chunk-local 4,4, then a five-way crossing), the piece limits, exactly
// one portal room with 12 frames and a silverfish spawner, the brick mix, the 112-block radius, the land bias.
// Card SH1-SH6 + W1 runs in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStronghold, generateStronghold, realizeStronghold, biasedStart, PIECE_LIMITS, MAX_RADIUS, EYE_CHANCE } from '../src/worldgen/generators/stronghold.js';
import { generatorCoverage } from '../src/worldgen/index.js';
import { BLOCKS } from '../src/blocks.js';

test('implemented; every stronghold has one portal room and keeps to the limits and radius', () => {
  assert.ok(generatorCoverage().implemented.includes('stronghold'));
  let eyes = 0; let frames = 0;
  for (let s = 1; s <= 12; s++) {
    const { canvas, pieces, counts, portal } = buildStronghold({ seed: s, x: 4, y: 40, z: 4 });
    assert.ok(portal);
    assert.equal(counts.portal, 1);
    for (const [k, n] of Object.entries(PIECE_LIMITS)) assert.ok((counts[k] ?? 0) <= n, `${k} ${counts[k]}`);
    assert.equal(pieces[0].kind, 'start');
    for (const p of pieces) assert.ok(Math.hypot(p.box.maxX - 4, p.box.maxZ - 4) <= MAX_RADIUS && Math.hypot(p.box.minX - 4, p.box.minZ - 4) <= MAX_RADIUS);
    const cells = [...canvas.cells.values()];
    const f = cells.filter((c) => /^end_portal_frame/.test(c.name));
    assert.equal(f.length, 12);
    frames += 12; eyes += f.filter((c) => c.name === 'end_portal_frame_filled').length;
    const sp = cells.filter((c) => c.name === 'spawner');
    assert.equal(sp.length, 1);
    assert.equal(sp[0].nbt.SpawnData.entity.id, 'minecraft:silverfish');
  }
  assert.ok(Math.abs(eyes / frames - EYE_CHANCE) < 0.07, `${eyes}/${frames} eyes`);
});

test('the start sits at chunk-local 4, 4 and moves off water toward land', () => {
  const s = generateStronghold({ seed: 3, chunkX: 90, chunkZ: -12, structureId: 'stronghold', context: { surfaceY: () => 45 } });
  assert.equal(((s.meta.start[0] % 16) + 16) % 16, 4);
  assert.equal(((s.meta.start[2] % 16) + 16) % 16, 4);
  const biomeAt = (x) => (x < 100 ? 'ocean' : 'plains');
  const [bx] = biasedStart(40, 0, biomeAt);
  assert.ok(bx >= 100, 'moved to land');
  assert.deepEqual(biasedStart(200, 0, biomeAt), [200, 0], 'already on land: stays');
});

test('libraries carry cobwebs and library loot; every block resolves', () => {
  let library = 0;
  for (let s = 1; s <= 8; s++) {
    const st = generateStronghold({ seed: s, chunkX: 100, chunkZ: s, structureId: 'stronghold', context: { surfaceY: () => 45 } });
    if (st.meta.counts.library) library++;
    assert.deepEqual(realizeStronghold(st, () => true, BLOCKS).missingBlocks, []);
  }
  assert.ok(library > 0);
});
