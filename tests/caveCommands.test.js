import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { World } from '../src/world.js';
import { BLOCKS as B, BLOCK_DEFS } from '../src/blocks.js';
import { CAVE_KIND, CAVE_REGION_SIZE } from '../src/worldgen/caveTerrain.js';
import { parseTeleport } from '../src/teleport.js';
import { findCommand } from '../src/commands.js';
import { permissionRefusal } from '../src/commandRunner.js';
import { caveLocateLines, locateCaveEntrances, nearestCaveArrival, parseCaveRadius } from '../src/caveLocator.js';

function world(seed = 4289, biome = 'plains') {
  const w = new World(seed, biome);
  w.structures = null;
  return w;
}

test('cave argument parsing, aliases, validation and command help', () => {
  assert.deepEqual(parseTeleport(['cave']), { ok: true, kind: 'cave', radius: 256 });
  assert.deepEqual(parseTeleport(['CAVE', '512']), { ok: true, kind: 'cave', radius: 512 });
  for (const args of [['-1'], ['15'], ['1025'], ['Infinity'], ['64.5'], ['256', 'extra']]) {
    assert.throws(() => parseCaveRadius(args), /radius/);
    assert.equal(parseTeleport(['cave', ...args]).ok, false);
  }
  assert.equal(parseCaveRadius(['16']), 16);
  assert.equal(parseCaveRadius(['1024']), 1024);
  assert.match(findCommand('locate').args, /cave/);
  assert.match(findCommand('tp').args, /cave/);
  assert.ok(permissionRefusal({}, '/locate'));
  assert.ok(permissionRefusal({}, '/tp'));
});

test('locate lists every mapped mouth in range, ordered by distance, without generating terrain', () => {
  const w = world(), origin = { x: -72.5, z: 31.5 }, radius = 160;
  const caves = locateCaveEntrances(w, origin.x, origin.z, { radius });
  assert.ok(caves.length > 8);
  assert.equal(w.chunks.size, 0, 'lookup must not generate terrain');
  assert.equal(new Set(caves.map(c => `${c.x},${c.y},${c.z}`)).size, caves.length);
  for (let i = 0; i < caves.length; i++) {
    const c = caves[i];
    assert.ok(c.distance <= radius);
    assert.ok(c.predicted);
    assert.ok(i === 0 || c.distance >= caves[i - 1].distance);
    assert.ok(w.caves.kindAt(c.x, c.y, c.z) & CAVE_KIND.ENTRANCE);
    assert.equal(w.caves.cellAt(c.x, c.y, c.z), B.AIR);
  }
  // Independently enumerate a larger region rectangle: no mouth in the radius
  // may be dropped at a region boundary, including negative region indices.
  const expected = new Set();
  for (let gx = -6; gx <= 4; gx++) for (let gz = -5; gz <= 5; gz++) {
    const [ex, , ez] = w.caves.region(gx, gz).entrance;
    const nearby = locateCaveEntrances(w, ex, ez, { radius: 16 });
    for (const c of nearby) if (Math.hypot(c.x + .5 - origin.x, c.z + .5 - origin.z) <= radius) expected.add(`${c.x},${c.y},${c.z}`);
  }
  assert.deepEqual(new Set(caves.map(c => `${c.x},${c.y},${c.z}`)), expected);
  const lines = caveLocateLines(w, origin, [String(radius)]);
  assert.match(lines[0], new RegExp(`^${caves.length} cave entrance\\(s\\) within ${radius}`));
  assert.equal(lines.filter(l => l.startsWith('Cave:')).length, caves.length);
  assert.ok(lines.some(l => /Unexplored/.test(l)));
  assert.equal(w.chunks.size, 0);
});

test('nearest arrival is beside an actual generated open mouth with dry support and headroom', () => {
  const w = world(), origin = { x: 50, z: 0 };
  const expected = locateCaveEntrances(w, origin.x, origin.z)[0];
  const arrival = nearestCaveArrival(w, origin);
  assert.ok(Math.hypot(arrival.entrance.x - expected.x, arrival.entrance.z - expected.z) <= 4);
  const { x, y, z } = arrival.entrance;
  assert.equal(w.getVoxel(x, y, z), B.AIR);
  assert.equal(w.getVoxel(x, y + 1, z), B.AIR);
  const ax = Math.floor(arrival.x), az = Math.floor(arrival.z);
  const support = w.getVoxel(ax, arrival.y - 1, az);
  assert.notEqual(support, B.AIR);
  assert.notEqual(support, B.WATER);
  assert.notEqual(support, B.LAVA);
  assert.notEqual(BLOCK_DEFS[support].solid, false);
  assert.equal(w.getVoxel(ax, arrival.y, az), B.AIR);
  assert.equal(w.getVoxel(ax, arrival.y + 1, az), B.AIR);
  assert.ok(Math.hypot(ax - x, az - z) <= 8);
  assert.ok(w.chunks.size <= 9, 'only the arrival neighborhood is generated');
  assert.match(arrival.say, /nearest safe cave entrance/);
  assert.ok(Number.isFinite(arrival.yaw));
});

for (const biome of ['all', 'frozen_peaks', 'lush_caves', 'dripstone_caves', 'nether']) {
  test(`cave teleport works in generated ${biome} terrain, including negative coordinates`, () => {
    const w = world(4289, biome), origin = { x: 0, z: 0 };
    const arrival = nearestCaveArrival(w, origin), c = arrival.entrance;
    assert.ok(c.x < 0);
    assert.equal(c.predicted, false);
    assert.equal(w.getVoxel(c.x, c.y, c.z), B.AIR);
    const x = Math.floor(arrival.x), z = Math.floor(arrival.z);
    const solid = w.getVoxel(x, arrival.y - 1, z);
    assert.ok(![B.AIR, B.WATER, B.LAVA, B.MAGMA_BLOCK].includes(solid));
    assert.equal(w.getVoxel(x, arrival.y, z), B.AIR);
    assert.equal(w.getVoxel(x, arrival.y + 1, z), B.AIR);
  });
}

test('invalid search origins are refused before region iteration', () => {
  for (const value of [NaN, Infinity, 1e300]) assert.throws(() => locateCaveEntrances(world(), value, 0), /origin/);
});

test('loaded or saved terrain overrides seed predictions; sealed mouths are not offered', () => {
  const w = world(), c = locateCaveEntrances(w, 50, 0)[0];
  const [ex, , ez] = w.caves.region(...c.region).entrance;
  // Model a saved chunk whose player-built stone cap completely sealed this mouth.
  for (let x = Math.floor(ex) - 4; x <= Math.floor(ex) + 4; x++) {
    for (let z = Math.floor(ez) - 4; z <= Math.floor(ez) + 4; z++) {
      w.getOrCreateChunk(Math.floor(x / 16), Math.floor(z / 16));
      const h = w.surfaceHeightAt(x, z);
      w.setVoxel(x, h - 1, z, B.STONE);
      w.setVoxel(x, h, z, B.STONE);
    }
  }
  assert.ok(!locateCaveEntrances(w, 50, 0).some(entry => entry.region.join() === c.region.join()));
  const arrival = nearestCaveArrival(w, { x: 50, z: 0 });
  assert.ok(Math.hypot(arrival.entrance.x - ex, arrival.entrance.z - ez) > 4);
  assert.equal(w.getVoxel(c.x, c.y, c.z), B.STONE, 'no excavation to force an arrival');
});

test('unsupported generation modes give an explanation instead of invented caves', () => {
  for (const setup of [w => { w.dimension = 'the_end'; }, w => { w.isFlatWorld = true; }, w => { w.generationMode = 'authored'; }]) {
    const w = world(); setup(w);
    assert.throws(() => locateCaveEntrances(w, 0, 0), /no generated cave entrances/);
    assert.throws(() => nearestCaveArrival(w, { x: 0, z: 0 }), /no generated cave entrances/);
    assert.equal(w.chunks.size, 0);
  }
});

test('flooded mouths are listed but never used as a dry teleport destination', () => {
  const w = world(), caves = locateCaveEntrances(w, 0, 0, { radius: 64 });
  assert.ok(caves.length);
  w.getChunk = () => true;
  w.getVoxel = () => B.WATER;
  w.getOrCreateChunk = () => { throw new Error('must not generate flooded destinations'); };
  const flooded = locateCaveEntrances(w, 0, 0, { radius: 64 });
  assert.equal(flooded.length, caves.length);
  assert.ok(flooded.every(c => c.flooded && !c.predicted));
  assert.ok(caveLocateLines(w, { x: 0, z: 0 }, ['64']).some(l => /flooded/.test(l)));
  assert.throws(() => nearestCaveArrival(w, { x: 0, z: 0 }, { radius: 64 }), /No safe, dry cave/);
});

// Exercise the actual Game command methods without importing main.js and starting
// the whole renderer, world, audio, UI and animation loop.
const source = readFileSync('src/main.js', 'utf8');
function method(name) {
  const start = source.indexOf(`  ${name}(parts) {`);
  assert.ok(start > 0);
  const body = source.slice(start, source.indexOf('\n  /**', start)).trim();
  return new Function('THREE', 'parseTeleport', 'caveLocateLines', 'nearestCaveArrival', 'locateNearestStructure', 'structureArrival', 'countStructures',
    `return function ${body}`)(THREE, parseTeleport, caveLocateLines, nearestCaveArrival,
      () => { throw new Error('should not use structure lookup for cave commands'); });
}
const runLocate = method('runLocateCommand'), runTeleport = method('runTeleportCommand');
function game(w = world()) {
  const messages = [];
  return { world: w, player: { position: new THREE.Vector3(50, 35, 0), velocity: new THREE.Vector3(2, -9, 1), fallDistance: 20 },
    ui: { addChatMessage: (text, kind) => messages.push({ text, kind }) }, messages,
    loadChunksAroundPlayer() { this.loaded = true; } };
}

test('real chat handlers list caves, honor /execute origin, teleport and reset falling state', () => {
  const g = game();
  g.commandOrigin = { x: -80, y: 30, z: -80 };
  runLocate.call(g, ['/locate', 'cave', '64']);
  const first = locateCaveEntrances(g.world, -80, -80, { radius: 64 })[0];
  assert.ok(g.messages.some(m => m.text.includes(`x ${first.x}, y ${first.y}, z ${first.z}`)));
  const before = g.player.position.clone();
  runTeleport.call(g, ['/tp', 'cave']);
  assert.equal(g.messages.at(-1).kind, 'system');
  assert.notDeepEqual(g.player.position, before);
  assert.ok(g.player.position.distanceTo(new THREE.Vector3(-80, g.player.position.y, -80)) < 80);
  assert.equal(g.player.velocity.length(), 0);
  assert.equal(g.player.fallDistance, 0);
  assert.equal(g.loaded, true);
});

test('failed cave teleport leaves player and mount unchanged; successful teleport dismounts', () => {
  const g = game();
  g.world.isFlatWorld = true;
  const before = g.player.position.clone();
  g.riding = { rider: g.player };
  g.dismount = () => { g.riding = null; };
  runTeleport.call(g, ['/teleport', 'cave']);
  assert.deepEqual(g.player.position, before);
  assert.ok(g.riding);
  assert.equal(g.messages.at(-1).kind, 'error');
  g.world.isFlatWorld = false;
  g.player.ridingMob = {};
  g.mobs = { animalBehaviors: { dismount(p) { p.ridingMob = null; } } };
  runTeleport.call(g, ['/teleport', 'cave']);
  assert.equal(g.riding, null);
  assert.equal(g.player.ridingMob, null);
  assert.equal(g.messages.at(-1).kind, 'system');
});

test('coordinates still use the same command handler and relative-coordinate support', () => {
  const g = game();
  runTeleport.call(g, ['/tp', '~2', '40', '~-3']);
  assert.deepEqual(g.player.position.toArray(), [52, 40, -3]);
  assert.equal(g.messages.at(-1).kind, 'system');
  assert.equal(CAVE_REGION_SIZE, 64);
});
