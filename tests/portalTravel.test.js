// Portals: the Nether portal's swirl and particles, a trip that is committed when the player steps in, the loading
// screen a trip goes through, and the two portals in the Structure Inspector, where walking into them travels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/blocks.js';
import { netherPortalFrames, PORTAL_FRAMES, PORTAL_FRAME_SECONDS } from '../src/portalTexture.js';
import { blockParticleSources, AMBIENT_PARTICLES } from '../src/ambientParticleRules.js';
import { STRUCTURES, STRUCTURE_SETS } from '../src/worldgen/registry.js';
import { WORLD_STRUCTURE_IDS } from '../src/worldStructures.js';
import { createStructureInspectorSession, inspectorStructures } from '../src/structureInspectorSession.js';
import { buildStructureWorld } from '../src/structureInspectorWorld.js';
import { createPortalTravel } from '../src/structureInspectorPortals.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the portal swirls: 32 frames of Minecraft\'s two-spiral portal, purple and translucent, a frame a tick', () => {
  const frames = netherPortalFrames();
  assert.equal(frames.length, PORTAL_FRAMES);
  assert.equal(PORTAL_FRAMES, 32);
  assert.equal(PORTAL_FRAME_SECONDS, 0.05, 'twenty a second, the game\'s tick');
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < 256; i++) { r += frames[0][i * 4]; g += frames[0][i * 4 + 1]; b += frames[0][i * 4 + 2]; a += frames[0][i * 4 + 3]; }
  assert.ok(b / 256 > 150 && r / 256 > 50 && g / 256 < 60, `purple (${(r / 256) | 0}, ${(g / 256) | 0}, ${(b / 256) | 0})`);
  assert.ok(a / 256 > 150 && a / 256 < 255, 'translucent');
  const changed = [...frames[0]].filter((v, i) => v !== frames[8][i]).length;
  assert.ok(changed > 500, 'it moves from frame to frame');
  const textures = read('src/textures.js');
  assert.match(textures, /this\.animatePortal\(dt\);/, 'painted into the atlas every update');
  assert.match(textures, /if\(fileName==='nether_portal\.png'\)this\.portalImage=img;/, 'a resource pack\'s strip is played instead');
});

test('purple specks drift into a portal', () => {
  assert.deepEqual(blockParticleSources(BLOCKS.NETHER_PORTAL), ['portal']);
  assert.ok(AMBIENT_PARTICLES.portal.glow > 0);
  assert.match(read('src/ambientParticles.js'), /if\(kind==='portal'\)\{/);
});

test('a trip goes behind a progress bar: the switch defers its chunk load and the terrain is built in batches', () => {
  const main = read('src/main.js');
  assert.match(main, /async travelToDimension\(newDim, targetPos = null, \{ title = 'Travelling', arrive = null \} = \{\}\) \{/);
  assert.match(main, /this\.switchDimension\(newDim, targetPos, \{ deferLoad: true \}\);\s*await this\.loadWorldProgressively\(/);
  assert.match(main, /if \(deferLoad\) \{ if \(this\.ui\?\.updateStats\) this\.ui\.updateStats\(\); return; \}/);
  assert.match(main, /this\.travelToDimension\(dest, arrival, \{ title: dest === 'the_end' \? 'Entering the End' : 'Returning to the Overworld', arrive \}\)/, 'the End portal too');
  assert.match(read('src/netherPortal.js'), /if \(game\.travelToDimension\) \{/);
});

test('the Structure Inspector has a Nether portal and an End portal, which no world generates', () => {
  for (const id of ['nether_portal', 'end_portal']) {
    assert.equal(STRUCTURES[id].inspectorOnly, true);
    assert.ok(!WORLD_STRUCTURE_IDS.includes(id), `${id} is not in a world`);
    assert.ok(STRUCTURE_SETS.some((s) => s.inspectorOnly && s.structures.some(([sid]) => sid === id)));
    assert.ok(inspectorStructures().some((s) => s.id === id && s.implemented), `${id} is in the picker`);
  }
  const counts = (id) => {
    const s = createStructureInspectorSession({ structureId: id, seed: 4242 });
    assert.ok(s.planNearest({ maxRadiusChunks: 8 }), `${id} is found`);
    s.realize();
    const n = {};
    for (const [, b] of s.world.blocks) n[b] = (n[b] ?? 0) + 1;
    return n;
  };
  const nether = counts('nether_portal');
  assert.equal(nether[BLOCKS.NETHER_PORTAL], 6, 'a lit 2x3');
  assert.equal(nether[BLOCKS.OBSIDIAN], 14 + 4, 'a 4x5 frame on its platform');
  const end = counts('end_portal');
  assert.equal(end[BLOCKS.END_PORTAL], 9);
  assert.equal(end[BLOCKS.END_PORTAL_FRAME_FILLED], 12, 'every frame has its eye');
});

async function walkInto(id, blockId, { lift = 0 } = {}) {
  const built = await buildStructureWorld({ structureId: id, seed: 4242 });
  const travel = createPortalTravel({ view: { built, remeshChunk() {}, clearChunks() {} }, frameYield: () => Promise.resolve() });
  const w = built.world;
  let y = 1;
  while (w.getVoxel(0, y, 0) !== blockId && y < 80) y++;
  const walker = { x: 0.5, y: y + lift, z: 0.5, yaw: 0, placeAt(x, yy, z) { this.x = x; this.y = yy; this.z = z; } };
  const go = async () => {
    for (let i = 0; i < 200 && !travel.busy; i++) { const held = travel.tick(walker, 0.05); if (held) walker.placeAt(held.x, held.y, held.z); }
    while (travel.busy) await new Promise((r) => setTimeout(r, 0));
    const p = travel.player.position;
    walker.placeAt(p.x, p.y, p.z);
  };
  return { built, travel, walker, go, w };
}

test('in the Inspector, walking into the Nether portal goes to the Nether, and its arrival portal comes back', async () => {
  const { travel, walker, go, w } = await walkInto('nether_portal', BLOCKS.NETHER_PORTAL);
  const start = { x: walker.x, z: walker.z };
  // Held while the warp builds: walking on does not take the walker through.
  travel.tick(walker, 0.05);
  walker.x += 3;
  const held = travel.tick(walker, 0.05);
  assert.ok(held && Math.abs(held.x - start.x) < 1e-9, 'held in the portal');
  await go();
  assert.equal(w.dimension, 'nether');
  assert.match(travel.trips.at(-1).message, /Teleported to The Nether/);
  const arrived = { x: walker.x, y: walker.y, z: walker.z };
  stepsOutOfPortal(w, arrived, travel.player.yaw, 'in the Nether');
  // Standing there is not travelling: nothing happens until the walker walks back into the portal.
  for (let i = 0; i < 60; i++) travel.tick(walker, 0.05);
  assert.equal(w.dimension, 'nether', 'no trip from beside the portal');
  const portal = portalBeside(w, arrived);
  walker.placeAt(portal.x + 0.5, portal.y, portal.z + 0.5);
  await go();
  assert.equal(w.dimension, 'overworld');
  assert.ok(Math.hypot(walker.x - start.x, walker.z - start.z) < 3, 'back at the portal it left from');
  stepsOutOfPortal(w, { x: walker.x, y: walker.y, z: walker.z }, travel.player.yaw, 'back in the Overworld');
});

/** The nearest portal block to a spot, within two blocks. */
function portalBeside(w, at) {
  for (let r = 1; r <= 2; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) for (let dy = -1; dy <= 1; dy++) {
    const x = Math.floor(at.x) + dx, y = Math.floor(at.y) + dy, z = Math.floor(at.z) + dz;
    if (w.getVoxel(x, y, z) === BLOCKS.NETHER_PORTAL) return { x, y, z };
  }
  return null;
}

/** Arrived out of the portal: not in it, on the ground beside it, facing away from it. */
function stepsOutOfPortal(w, at, yaw, where) {
  const fx = Math.floor(at.x), fy = Math.floor(at.y), fz = Math.floor(at.z);
  assert.notEqual(w.getVoxel(fx, fy, fz), BLOCKS.NETHER_PORTAL, `not inside the portal ${where}`);
  assert.notEqual(w.getVoxel(fx, fy + 1, fz), BLOCKS.NETHER_PORTAL);
  assert.notEqual(w.getVoxel(fx, fy - 1, fz), BLOCKS.AIR, 'standing on the ground');
  const portal = portalBeside(w, at);
  assert.ok(portal, `right in front of the portal ${where}`);
  const awayX = -Math.sin(yaw), awayZ = -Math.cos(yaw);
  assert.ok(awayX * (at.x - (portal.x + 0.5)) + awayZ * (at.z - (portal.z + 0.5)) > 0, 'facing away from it');
}

test('in the Inspector, the End portal goes to the End platform, and a small portal there comes home', async () => {
  const { travel, go, w, walker } = await walkInto('end_portal', BLOCKS.END_PORTAL, { lift: 0.2 });
  await go();
  assert.equal(w.dimension, 'the_end');
  assert.deepEqual([walker.x, walker.z], [100.5, 0.5], 'on the obsidian platform');
  assert.equal(travel.player.yaw, Math.PI / 2, 'facing the main island');
  let home = null;
  for (let x = 100; x <= 110 && !home; x++) for (let y = 15; y <= 25; y++) if (w.getVoxel(x, y, 0) === BLOCKS.END_PORTAL) { home = [x, y]; break; }
  assert.ok(home, 'a small End portal off the platform');
  walker.placeAt(home[0] + 0.5, home[1] + 0.2, 0.5);
  for (let i = 0; i < 80; i++) travel.tick(walker, 0.05);
  await go();
  assert.equal(w.dimension, 'overworld', 'home');
});
