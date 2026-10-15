// The lag pass: each speed-up here keeps its output identical to the slower code it replaced, and these tests
// hold it to that. (The water pass's skip is in waterPass.test.js; the mesher's tables in mesherPerformance.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World } from '../src/world.js';
import { WaterSimulation } from '../src/waterSimulation.js';
import { BLOCKS } from '../src/blocks.js';
import { RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

/** The chunk scan as it was: every water voxel asks the world about its outlets, then the four borders. */
function referenceWake(world, chunk) {
  const sim = new WaterSimulation(world);
  for (let y = 0; y < 64; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    if (chunk.getVoxel(x, y, z) !== BLOCKS.WATER) continue;
    const wx = chunk.cx * 16 + x, wz = chunk.cz * 16 + z;
    if (sim.needsTick(wx, y, wz, chunk.waterLevels[chunk.getIndex(x, y, z)])) sim.notify(wx, y, wz);
  }
  for (let y = 0; y < 64; y++) for (let i = 0; i < 16; i++) {
    for (const [x, z] of [[chunk.cx * 16 - 1, chunk.cz * 16 + i], [chunk.cx * 16 + 16, chunk.cz * 16 + i], [chunk.cx * 16 + i, chunk.cz * 16 - 1], [chunk.cx * 16 + i, chunk.cz * 16 + 16]]) {
      if (sim.needsTick(x, y, z)) sim.notify(x, y, z);
    }
  }
  return [...sim.pending];
}

test('a new chunk wakes the same water cells, in the same order, as the world-lookup scan did', () => {
  // Ocean and shore: seed 12345 around the origin holds both, and a neighbour on every side.
  const world = new World(12345);
  for (let cx = -3; cx <= 3; cx++) for (let cz = -3; cz <= 3; cz++) world.getOrCreateChunk(cx, cz);
  let compared = 0, woken = 0;
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) {
    const chunk = world.getChunk(cx, cz);
    const expected = referenceWake(world, chunk);
    world.water.pending.clear();
    world.water.initChunk(chunk);
    assert.deepEqual([...world.water.pending], expected, `chunk ${cx},${cz}`);
    compared++; woken += expected.length;
  }
  assert.equal(compared, 25);
  assert.ok(woken > 50, `the area has exposed water to compare (${woken} cells)`);
});

test('lava and fire in a new chunk are found from its arrays, borders included', () => {
  const world = new World(5);
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.getOrCreateChunk(cx, cz);
  const chunk = world.getChunk(0, 0);
  chunk.setVoxel(3, 10, 4, BLOCKS.LAVA);
  chunk.setVoxel(7, 12, 7, BLOCKS.FIRE);
  world.getChunk(-1, 0).setVoxel(15, 20, 9, BLOCKS.LAVA); // touching the west border
  world.lava.pending.clear(); world.lava.lavaCells.clear(); world.lava.fires.clear();
  world.lava.initChunk(chunk);
  assert.ok(world.lava.lavaCells.has('3,10,4'));
  assert.ok(world.lava.fires.has('7,12,7'));
  assert.ok(world.lava.lavaCells.has('-1,20,9'), 'the neighbour\'s border lava is woken');
});

test('noise samples allocate no gradient tables (they are module constants)', () => {
  const src = readFileSync(new URL('../src/world.js', import.meta.url), 'utf8');
  const noise = src.slice(src.indexOf('class FastNoise'), src.indexOf('export const CHUNK_SIZE_X'));
  assert.doesNotMatch(noise, /const grad3 = \[/);
  assert.match(src, /const GRAD3_X = Int8Array\.of\(/);
});

test('structure plans are memoised under numeric keys, one map per dimension', () => {
  const src = readFileSync(new URL('../src/worldStructures.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function plansAt('), src.indexOf('function planAt('));
  assert.doesNotMatch(body, /`\$\{dimension\}\|/, 'no string key per lookup');
  assert.match(body, /byChunk\.get\(key\)/);
});

test('crafting lookups answer as before, and a shapeless list is sorted once', () => {
  const cell = (id, isBlock = false) => ({ id, isBlock, count: 1 });
  const grid = Array(9).fill(null);
  grid[1] = cell('diamond'); grid[4] = cell('stick');
  assert.equal(findMatchingRecipe(grid, 3, 3, RECIPES_3X3), null, 'no recipe is a diamond on a stick');
  // A shapeless recipe, in any arrangement, twice (the second from the cached sort).
  const shapeless = RECIPES_3X3.find((r) => r.shapeless && r.ingredients.length === 2);
  for (const order of [[0, 1], [1, 0]]) {
    const g = Array(9).fill(null);
    shapeless.ingredients.forEach((v, k) => { g[[2, 6][order[k]]] = cell(v, typeof v === 'number'); });
    const found = findMatchingRecipe(g, 3, 3, RECIPES_3X3);
    assert.ok(found, 'the shapeless recipe matches');
  }
});

test('the HUD is redrawn only when what it shows changes', async () => {
  const { UIManager } = await import('../src/ui.js');
  let writes = 0;
  const el = (n = 0) => ({
    children: Array.from({ length: n }, () => ({ style: new Proxy({}, { set(t, k, v) { writes++; t[k] = v; return true; } }) })),
    style: {}, textContent: '',
  });
  const ui = Object.create(UIManager.prototype);
  ui.player = { gamemode: 'survival', maxHealth: 20, health: 20, hunger: 20, level: 0, experience: 0, hasStatusEffect: () => false };
  ui.inv = { getTotalArmorPoints: () => 0 };
  ui.healthBarEl = el(10); ui.hungerBarEl = el(10); ui.armorBarEl = el(10);
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    ui.updateStats();
    const first = writes;
    assert.ok(first > 0, 'the first frame draws');
    ui.updateStats(); ui.updateStats();
    assert.equal(writes, first, 'unchanged frames write nothing');
    ui.player.health = 13;
    ui.updateStats();
    assert.ok(writes > first, 'a change is drawn');
    const after = writes;
    ui.statsSignature = 'stale'; // what initStatusBarsDOM does by clearing it
    ui.updateStats();
    assert.ok(writes > after, 'freshly built bars are drawn');
  } finally {
    globalThis.document = saved;
  }
});

// Found while profiling: the light spread wrote a margin cell's spread into the NEIGHBOUR's arrays, so light never
// crossed a chunk border. Light "decreases by 1 for each block" from its source (wiki, Light); chunks do not enter.
test('block light crosses a chunk border, falling by one a block', () => {
  const w = new World(3); w.generationMode = 'authored';
  for (let cx = -1; cx <= 2; cx++) for (let cz = -1; cz <= 1; cz++) w.getOrCreateChunk(cx, cz);
  for (let x = 10; x <= 21; x++) for (let z = 2; z <= 8; z++) for (let y = 20; y <= 26; y++) w.setVoxel(x, y, z, BLOCKS.STONE);
  for (let x = 11; x <= 20; x++) for (let z = 3; z <= 7; z++) for (let y = 21; y <= 25; y++) w.setVoxel(x, y, z, BLOCKS.AIR);
  w.setVoxel(15, 21, 5, BLOCKS.TORCH); // torch light 14, on the chunk 0 side of the x = 15 | 16 border
  w.light.relightAll();
  const row = [13, 14, 15, 16, 17, 18].map((x) => w.light.getBlockLight(x, 21, 5));
  assert.deepEqual(row, [12, 13, 14, 13, 12, 11]);
});

test('a redstone tick works out input power only for the components that use it', async () => {
  const { World: W } = await import('../src/world.js');
  const w = new W(1); w.generationMode = 'authored';
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) w.getOrCreateChunk(cx, cz);
  for (let x = -10; x < 10; x++) { w.setVoxel(x, 10, 0, BLOCKS.STONE); w.setVoxel(x, 11, 0, BLOCKS.RAIL); w.redstone.notify(x, 11, 0); }
  w.setVoxel(0, 11, 3, BLOCKS.REDSTONE_LAMP); w.redstone.notify(0, 11, 3);
  w.setVoxel(1, 11, 3, BLOCKS.REDSTONE_BLOCK); w.redstone.notify(1, 11, 3);
  let calls = 0; const input = w.redstone.input.bind(w.redstone);
  w.redstone.input = (...a) => { calls++; return input(...a); };
  w.redstone.tick([]); w.redstone.tick([]);
  assert.ok(calls <= 4, `twenty rails cost no input lookups (${calls} calls, for the lamp)`);
  assert.equal(w.redstone.state([0, 11, 3]).on, true, 'and the lamp next to the block still lights');
});

test('a mob that carries its own size is collision-checked without the type table', async () => {
  const { MobManager } = await import('../src/mobs.js');
  const m = Object.create(MobManager.prototype);
  m.world = { getVoxel: () => BLOCKS.AIR };
  let lookups = 0; m.getMobDimensions = () => { lookups++; return { width: 0.6, height: 1.8 }; };
  assert.equal(m.checkMobCollision({ type: 'cow', width: 0.9, height: 1.4 }, { x: 0.5, y: 5, z: 0.5 }), false);
  assert.equal(lookups, 0);
  m.checkMobCollision({ type: 'cow' }, { x: 0.5, y: 5, z: 0.5 });
  assert.equal(lookups, 1, 'one lookup when it does not, not two');
  m.world.getVoxel = () => BLOCKS.STONE;
  assert.equal(m.checkMobCollision({ type: 'cow', width: 0.9, height: 1.4 }, { x: 0.5, y: 5, z: 0.5 }), true);
});

test('a world\'s light is settled under the loading cover, not over the first seconds of play', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const body = (name) => { const at = main.indexOf(`  ${name}`); assert.ok(at >= 0, name); return main.slice(at, main.indexOf('\n  }\n', at)); };
  const gen = body('async generateNewWorld() {');
  assert.ok(gen.indexOf('await this.settleLighting()') > gen.indexOf('await this.loadWorldProgressively()'));
  assert.ok(gen.indexOf('await this.settleLighting()') < gen.indexOf('markReady(this.lifecycle)'), 'before the simulation starts');
  const load = body('async loadMapWithProgress(');
  assert.ok(load.indexOf('await this.settleLighting()') < load.indexOf('this.overlay.hide()'), 'a loaded map too');
  const settle = body('async settleLighting() {');
  assert.match(settle, /while \(light\.dirtyCount > 0\)/, 'until nothing is dirty');
  assert.match(settle, /await yieldToBrowser\(\)/, 'in batches the progress bar can paint between');
});
