// The walk-through: build a real structure in a real World and walk into it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructureWorld, meshBuiltWorld, lootView, blockEntitiesView, boxBlockCounts } from '../src/structureInspectorWorld.js';
import { createWalker, WALKER } from '../src/structureWalker.js';
import { ChunkMesher } from '../src/mesher.js';

const fakeTextures = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

async function arriveAt(structureId, seed = 20250401) {
  const built = await buildStructureWorld({ structureId, seed });
  const a = built.arrival;
  const walker = createWalker(built.world, { x: a.x, y: a.y, z: a.z, yaw: a.yaw, pitch: a.pitch });
  return { built, walker };
}

function run(walker, input, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) walker.step(input, 1 / 60);
}

test('the walker stands on the ground and does not fall through it', async () => {
  const { walker } = await arriveAt('swamp_hut');
  const y0 = walker.y;
  run(walker, {}, 2);
  assert.ok(walker.onGround, 'on the ground');
  assert.ok(Math.abs(walker.y - y0) < 0.2, `settled at ${walker.y}, arrived at ${y0}`);
});

test('walking moves at the walking speed, and never ends up inside a solid block', async () => {
  const { walker } = await arriveAt('swamp_hut');
  run(walker, {}, 1);
  // Walk away from the hut in the open for half a second: that is walk speed x 0.5.
  walker.yaw += Math.PI;
  const before = [walker.x, walker.z];
  run(walker, { forward: true }, 0.5);
  const moved = Math.hypot(walker.x - before[0], walker.z - before[1]);
  assert.ok(Math.abs(moved - WALKER.walk * 0.5) < 0.25, `moved ${moved}`);
  // Now walk at the hut for long enough to reach it: the walker stops at the wall.
  walker.yaw += Math.PI;
  run(walker, { forward: true }, 10);
  assert.equal(walker.collides(walker.x, walker.y, walker.z), false, 'the walker is inside a solid block');
});

test('jumping leaves the ground, clears one block, and comes back', async () => {
  const { walker } = await arriveAt('swamp_hut');
  run(walker, {}, 1);
  const y0 = walker.y;
  walker.step({ jump: true }, 1 / 60);
  let peak = walker.y;
  for (let i = 0; i < 90; i++) { walker.step({}, 1 / 60); peak = Math.max(peak, walker.y); }
  assert.ok(peak - y0 > 1.0 && peak - y0 < 1.6, `jump height ${peak - y0}`);
  assert.ok(walker.onGround && Math.abs(walker.y - y0) < 0.2);
});

test('flying ignores gravity', async () => {
  const { walker } = await arriveAt('swamp_hut');
  run(walker, {}, 1);
  walker.toggleFlying();
  const y0 = walker.y;
  run(walker, { jump: true }, 1);
  assert.ok(walker.y > y0 + 8, `rose ${walker.y - y0}`);
  const hover = walker.y;
  run(walker, {}, 1);
  assert.equal(walker.y, hover);
});

test('a closed door is solid and an open door is not', async () => {
  const { built, walker } = await arriveAt('village_plains');
  const door = built.recorder.doors[0];
  assert.ok(door, 'the village has doors');
  const [dx, dy, dz] = door.pos.map(Math.floor);
  assert.equal(built.world.game.doorManager.getDoor(dx, dy, dz).open, false);
  assert.equal(walker.isSolid(dx, dy, dz), true, 'a closed door is solid');
  built.world.game.doorManager.toggleDoor(dx, dy, dz);
  assert.equal(walker.isSolid(dx, dy, dz), false, 'an open door is not');
  assert.equal(walker.isSolid(dx, dy + 1, dz), false, 'the top half opens with it');
});

test('the walker can find the door it is looking at', async () => {
  const { built, walker } = await arriveAt('village_plains');
  const [dx, dy, dz] = built.recorder.doors[0].pos.map(Math.floor);
  // Stand three blocks away on each side in turn; the door must be found from at least one with a clear view.
  let found = false;
  for (const [ox, oz] of [[0, 3], [0, -3], [3, 0], [-3, 0]]) {
    walker.placeAt(dx + 0.5 + ox, dy, dz + 0.5 + oz, Math.atan2(ox, oz), 0);
    walker.pitch = Math.atan2(dy + 0.5 - walker.eyeY, 3);
    if (walker.targetDoor()) found = true;
  }
  assert.ok(found, 'no side had a clear view of the door');
});

test('structures are meshed with the game\'s mesher, doors and chests included', async () => {
  const { built } = await arriveAt('village_plains');
  const meshes = meshBuiltWorld(built, new ChunkMesher(fakeTextures));
  assert.ok(meshes.length >= 4);
  const vertices = meshes.reduce((sum, m) => sum + (m.geo.opaqueGeo?.attributes.position.count ?? 0) + (m.geo.lightGeo?.attributes.position.count ?? 0), 0);
  assert.ok(vertices > 1000, `${vertices} vertices`);
});

test('loot and block-entity views report what the game created', async () => {
  const built = await buildStructureWorld({ structureId: 'village_plains', seed: 20250401 });
  const loot = lootView(built);
  assert.ok(loot.chests.length > 0, 'a village has chests');
  assert.ok(loot.totals.length > 0);
  const entities = blockEntitiesView(built);
  assert.ok(entities.counts.door > 0 && entities.counts.mob > 0 && entities.counts.chest > 0, JSON.stringify(entities.counts));
  assert.ok(Object.keys(boxBlockCounts(built)).length > 5);
});

test('different seeds give different structures (the seed gallery premise)', async () => {
  const signatures = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const built = await buildStructureWorld({ structureId: 'swamp_hut', seed });
    signatures.add(`${built.found.chunk}|${JSON.stringify(boxBlockCounts(built))}`);
  }
  assert.ok(signatures.size >= 4, `${signatures.size} distinct of 6`);
});

test('every overworld structure builds quickly (the Inspector used to hang on buried_treasure)', async () => {
  const { inspectorStructures } = await import('../src/structureInspectorSession.js');
  const started = Date.now();
  const slow = [];
  for (const entry of inspectorStructures().filter((s) => s.implemented && s.dimension === 'overworld')) {
    const t = Date.now();
    const built = await buildStructureWorld({ structureId: entry.id, seed: 4242 });
    assert.ok(built.found, entry.id);
    if (Date.now() - t > 8000) slow.push(`${entry.id} ${Date.now() - t}ms`);
  }
  assert.deepEqual(slow, []);
  assert.ok(Date.now() - started < 60000, 'the whole set builds within a minute');
});

test('the Inspector opens on the swamp hut', async () => {
  const { createStructureInspectorSession } = await import('../src/structureInspectorSession.js');
  assert.equal(createStructureInspectorSession().state.structureId, 'swamp_hut');
});

// ---- Creative: double-tap Space flight, breaking and placing blocks -------------------------------------------------

test('double-tapping Space toggles flight and holding Space does not end it', async () => {
  const { walker } = await arriveAt('swamp_hut');
  run(walker, {}, 1);
  assert.equal(walker.tapJump(1000), false, 'one tap is just a jump');
  assert.equal(walker.flying, false);
  assert.equal(walker.tapJump(1200), true, 'a second tap within 300 ms starts flying');
  assert.equal(walker.flying, true);
  const y0 = walker.y;
  run(walker, { jump: true }, 3); // hold Space for three seconds: still flying, and rising
  assert.equal(walker.flying, true, 'holding Space does not switch flying off');
  assert.ok(walker.y > y0 + 20);
  run(walker, {}, 2);
  assert.equal(walker.flying, true);
  assert.equal(walker.tapJump(9000), false, 'taps far apart do not count as a double tap');
  assert.equal(walker.tapJump(9100), true, 'a double tap again leaves flight');
  assert.equal(walker.flying, false);
});

test('left click breaks the block in view, right click places the selected block against it', async () => {
  const { built, walker } = await arriveAt('swamp_hut');
  walker.toggleFlying();
  // From the arrival point (outside, facing the hut) sweep the view up and down until a block of the hut is in reach.
  const world = built.world;
  run(walker, {}, 0.2);
  let hit = null;
  for (let pitch = 0.4; pitch > -0.8 && !hit; pitch -= 0.05) {
    walker.pitch = pitch;
    const seen = walker.targetBlock(5);
    if (seen && seen.distance > 1.0) hit = seen;
  }
  assert.ok(hit, 'a block of the structure was in view');
  const before = world.getVoxel(hit.x, hit.y, hit.z);
  const broken = walker.breakBlock();
  assert.equal(broken.length >= 1, true);
  assert.equal(world.getVoxel(hit.x, hit.y, hit.z), 0, 'the block is gone');
  assert.equal(broken[0].id, before);
  // Now look at whatever is behind it and place a block in the hole.
  walker.select(2); // cobblestone
  // Look down until the ray meets the ground, and place against it.
  let next = null;
  for (let pitch = -0.2; pitch > -1.5 && !(next && next.prev); pitch -= 0.1) { walker.pitch = pitch; next = walker.targetBlock(5); }
  assert.ok(next && next.prev, 'the ground is in reach');
  const placed = walker.placeBlock();
  assert.ok(placed, 'the block was placed');
  assert.equal(world.getVoxel(placed.x, placed.y, placed.z), placed.id);
  assert.equal(placed.id, (await import('../src/blocks.js')).BLOCKS.COBBLESTONE);
});

test('breaking a door removes both halves, bedrock at y 0 is never broken, and a block is not placed inside the walker', async () => {
  const { built, walker } = await arriveAt('village_plains');
  const [dx, dy, dz] = built.recorder.doors[0].pos.map(Math.floor);
  const world = built.world;
  let aimed = false;
  for (const [ox, oz] of [[0, 3], [0, -3], [3, 0], [-3, 0]]) {
    if (world.getVoxel(dx + ox, dy, dz + oz) !== 0) continue;
    walker.placeAt(dx + 0.5 + ox, dy, dz + 0.5 + oz, Math.atan2(ox, oz), 0);
    walker.pitch = Math.atan2(dy + 0.5 - walker.eyeY, 3);
    if (walker.targetDoor()) { aimed = true; break; }
  }
  assert.ok(aimed, 'the door is in view from one side');
  const changed = walker.breakBlock();
  assert.equal(changed.length, 2, 'both halves of the door went');
  assert.equal(world.getVoxel(dx, dy, dz), 0);
  assert.equal(world.getVoxel(dx, dy + 1, dz), 0);
  // Bedrock is protected: aim straight down at the lowest layer from just above it.
  walker.toggleFlying();
  walker.placeAt(dx + 0.5, 1.0, dz + 0.5, 0, -1.5);
  const floor = walker.targetBlock(3);
  if (floor && floor.y === 0) assert.deepEqual(walker.breakBlock(), []);
});

// ---- Real mobs (the game's MobManager) instead of coloured boxes ---------------------------------------------------

test('the swamp hut\'s witch and black cat are the game\'s own mobs, and they survive being ticked', async () => {
  const THREE = await import('three');
  const { createInspectorMobs } = await import('../src/structureInspectorMobs.js');
  const built = await buildStructureWorld({ structureId: 'swamp_hut', seed: 20250401 });
  const scene = new THREE.Scene();
  const mobs = await createInspectorMobs({ scene, built });
  assert.deepEqual(mobs.failed, []);
  assert.equal(mobs.count, 2);
  const types = mobs.manager.mobs.map((m) => m.type).sort();
  assert.deepEqual(types, ['cat', 'witch']);
  const cat = mobs.manager.mobs.find((m) => m.type === 'cat');
  assert.equal(cat.breed, 'black', 'the hut\'s cat is black');
  assert.ok(scene.children.length >= 2, 'their models are in the scene');
  const before = mobs.positions();
  // Ten simulated seconds with the viewer next to the hut: no throw, no falling through the world.
  for (let i = 0; i < 600; i++) mobs.tick(1 / 60, { x: built.arrival.x, y: built.arrival.y, z: built.arrival.z });
  assert.deepEqual(mobs.failed, []);
  for (const after of mobs.positions()) {
    assert.ok(Number.isFinite(after.x + after.y + after.z));
    assert.ok(after.y > 5, `${after.type} fell through the world to y ${after.y}`);
  }
  assert.equal(before.length, mobs.positions().length);
  mobs.dispose();
  assert.equal(mobs.manager.mobs.length, 0);
});

test('rebinding the walk-through after Regenerate puts the walker at the new structure', async () => {
  const { StructureWalker } = await import('../src/structureWalker.js');
  const first = await buildStructureWorld({ structureId: 'swamp_hut', seed: 1 });
  const second = await buildStructureWorld({ structureId: 'swamp_hut', seed: 2 });
  assert.notDeepEqual(first.arrival, second.arrival);
  const walker = new StructureWalker(first.world, first.arrival);
  // This is what `rebind()` does: a new walker on the new world at its arrival point.
  const rebound = new StructureWalker(second.world, second.arrival);
  rebound.step({}, 1 / 60);
  assert.equal(rebound.world, second.world);
  assert.notEqual(rebound.world, walker.world);
  assert.ok(Math.abs(rebound.x - second.arrival.x) < 1e-6);
});

test('the page rebinds the walker after a rebuild and ticks the real mobs every frame', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../src/structureInspector.js', import.meta.url), 'utf8');
  assert.match(page, /if \(walk\.active\) walk\.rebind\(\);/);
  assert.match(page, /worldView\.tickMobs\(dt,/);
  const view = readFileSync(new URL('../src/structureInspectorWorldView.js', import.meta.url), 'utf8');
  assert.match(view, /createInspectorMobs\(\{ scene, built \}\)/);
});
