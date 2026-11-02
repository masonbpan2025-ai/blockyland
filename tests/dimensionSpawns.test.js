// Nether and End world starts (src/dimensionSpawns.js), checked in the game's own World through the Biome Inspector's
// model (src/biomeInspectorSession.js), which places the spawn exactly as a new world does:
//   * a Nether choice starts beside a lit portal to a random Overworld biome, and a portal there leads back;
//   * an End choice starts on its own kind of island with a small End portal home -- only "The End" on the main island;
//   * killing the dragon opens a small gateway to an End city and one back, saved with the End.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/blocks.js';
import { BIOME_CATEGORIES, getBiomeDef } from '../src/biomes.js';
import { buildBiomeWorld, biomeChecks, simulateDragonDefeat } from '../src/biomeInspectorSession.js';
import {
  END_SPAWNS, OVERWORLD_PORTAL_BIOMES, overworldPortalTarget, spawnPortalLink, captureSpawnPortals, restoreSpawnPortals,
  openEndCityLinks
} from '../src/dimensionSpawns.js';
import { smallPortalCells, restoreEndState, captureEndState, endStateFor } from '../src/endProgression.js';
import { endColumn, END_OUTER_RADIUS } from '../src/endTerrain.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const failing = (checks) => checks.filter((c) => !c.ok).map((c) => `${c.label}: ${c.detail}`);

test('the End section has a start for each kind of place: small and big islands, chorus forests, End cities', () => {
  const end = BIOME_CATEGORIES.find((c) => c.id === 'end').biomes;
  for (const id of ['the_end', 'small_end_islands', 'big_end_islands', 'chorus_forest', 'end_city', 'end_midlands', 'end_highlands', 'end_barrens']) {
    assert.ok(end.includes(id), `${id} is listed`);
    assert.equal(getBiomeDef(id).isEnd, true, `${id} starts in the End`);
    assert.ok(END_SPAWNS[id], `${id} has a start`);
    assert.match(read('index.html'), new RegExp(`<option value="${id}">`), `${id} is on the new-world screen`);
  }
  assert.equal(END_SPAWNS.the_end, 'main', 'only The End starts on the main island');
  assert.deepEqual(Object.entries(END_SPAWNS).filter(([, kind]) => kind === 'main').map(([id]) => id), ['the_end']);
});

for (const biome of ['crimson_forest', 'nether_wastes']) {
  test(`a ${biome} world starts beside a lit portal to a random Overworld biome, which leads back`, async () => {
    const built = await buildBiomeWorld({ biome, seed: 4242 });
    assert.equal(built.world.dimension, 'nether');
    assert.deepEqual(failing(biomeChecks(built)), []);
    const link = spawnPortalLink(built.world, 'nether', built.world.spawnPortals.nether);
    assert.ok(OVERWORLD_PORTAL_BIOMES.includes(link.biome), `${link.biome} is a land biome of the Overworld`);
    assert.equal(spawnPortalLink(built.world, 'nether', { x: built.world.spawnPortals.nether.x + 40, z: 0 }), null, 'another portal keeps the 8:1 rule');
  });
}

test('the portal\'s biome is chosen from the seed, so different worlds lead to different biomes', async () => {
  const biomes = new Set();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { world } = await buildBiomeWorld({ biome: 'nether_wastes', seed, radiusChunks: 0 });
    const target = overworldPortalTarget(world);
    assert.equal(world.mixedOverworldBiome(target.x, target.z), target.biome);
    biomes.add(target.biome);
  }
  assert.ok(biomes.size >= 3, `six seeds, ${biomes.size} biomes: ${[...biomes]}`);
});

test('the spawn link is saved with the world', async () => {
  const { world } = await buildBiomeWorld({ biome: 'basalt_deltas', seed: 77, radiusChunks: 0 });
  const saved = JSON.parse(JSON.stringify(captureSpawnPortals(world)));
  const other = {};
  restoreSpawnPortals(other, saved);
  assert.deepEqual(other.spawnPortals, world.spawnPortals);
  restoreSpawnPortals(other, { nether: { x: 'no' } });
  assert.equal(other.spawnPortals, null, 'a broken record is dropped');
  assert.match(read('src/saveSchema.js'), /spawnPortals: captureSpawnPortals\(game\.world\)/);
  assert.match(read('src/netherPortal.js'), /const link = spawnPortalLink\(game\.world, currentDim, sourcePos\);/);
});

for (const biome of ['the_end', 'small_end_islands', 'big_end_islands', 'chorus_forest', 'end_city', 'end_midlands', 'end_highlands', 'end_barrens']) {
  test(`${biome}: the start has a small End portal home${biome === 'the_end' ? ', on the main island\'s platform' : ', off the main island'}`, async () => {
    const built = await buildBiomeWorld({ biome, seed: 4242 });
    assert.equal(built.world.dimension, 'the_end');
    assert.deepEqual(failing(biomeChecks(built)), []);
    const distance = Math.hypot(built.centre.x, built.centre.z);
    if (biome === 'the_end') assert.ok(distance < 110, 'on the platform 100 blocks out');
    else assert.ok(distance >= END_OUTER_RADIUS, `${Math.round(distance)} blocks out, on the outer islands`);
  });
}

test('a small End portal is one portal block set into a bedrock floor; a gateway stands two high under a cap', () => {
  const cells = (block) => new Map(smallPortalCells(10, 30, 10, block).map(([x, y, z, id]) => [`${x},${y},${z}`, id]));
  const portal = cells(BLOCKS.END_PORTAL);
  assert.equal(portal.get('10,30,10'), BLOCKS.END_PORTAL, 'flush with the floor, stepped onto');
  assert.equal(portal.get('9,30,10'), BLOCKS.BEDROCK);
  assert.equal(portal.get('10,29,10'), BLOCKS.BEDROCK, 'bedrock under it');
  assert.equal([...portal.values()].filter((id) => id === BLOCKS.END_PORTAL).length, 1);
  const gateway = cells(BLOCKS.END_GATEWAY);
  assert.equal(gateway.get('10,31,10'), BLOCKS.END_GATEWAY);
  assert.equal(gateway.get('10,32,10'), BLOCKS.END_GATEWAY);
  assert.equal(gateway.get('10,33,10'), BLOCKS.BEDROCK);
});

test('killing the dragon opens a small gateway on the main island to an End city, and one there back', async () => {
  const built = await buildBiomeWorld({ biome: 'the_end', seed: 4242 });
  const { links, gateways } = simulateDragonDefeat(built);
  const { world } = built;
  assert.ok(links, 'an End city was found');
  assert.ok(Math.hypot(links.main.x, links.main.z) < 40, 'on the main island');
  assert.ok(Math.hypot(links.city.x, links.city.z) >= END_OUTER_RADIUS, 'by a city on the outer islands');
  assert.equal(world.getVoxel(links.main.x, links.main.y, links.main.z), BLOCKS.END_GATEWAY);
  assert.equal(world.getVoxel(links.city.x, links.city.y, links.city.z), BLOCKS.END_GATEWAY);
  const toCity = gateways.find((g) => g.link === 'end_city'), toMain = gateways.find((g) => g.link === 'main_island');
  assert.ok(Math.hypot(toCity.to.x - links.city.x, toCity.to.z - links.city.z) < 4, 'the island\'s leads beside the city\'s');
  assert.ok(Math.hypot(toMain.to.x - links.main.x, toMain.to.z - links.main.z) < 4, 'and back');
  assert.ok(endColumn(world, Math.floor(toCity.to.x), Math.floor(toCity.to.z)).top > 0, 'arriving on ground');
  assert.equal(openEndCityLinks(world), null, 'opened once: another dragon leaves them as they are');
  // Saved with the End, and rebuilt in a fresh chunk.
  const restored = { seed: world.seed };
  restoreEndState(restored, JSON.parse(JSON.stringify(captureEndState(world, null))));
  assert.deepEqual(endStateFor(restored).gateways.filter((g) => g.link).map((g) => [g.link, g.x, g.y, g.z, g.small?.groundY]),
    endStateFor(world).gateways.filter((g) => g.link).map((g) => [g.link, g.x, g.y, g.z, g.small?.groundY]));
  // The dragon's own gateway count does not count them.
  assert.match(read('src/bossFights.js'), /state\.gateways\.filter\(g=>!g\.link&&Math\.hypot\(g\.x,g\.z\)<1000\)/);
  assert.match(read('src/bossFights.js'), /const links=openEndCityLinks\(this\.world\);/);
});

test('a new world places these starts', () => {
  const main = read('src/main.js');
  assert.match(main, /spawn=placeEndWorldSpawn\(this,arrival\);/);
  assert.match(main, /if\(this\.world\.dimension==='nether'&&spawn\?\.found\)placeNetherSpawnPortal\(this,spawn\);/);
});
