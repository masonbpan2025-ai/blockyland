// SkyWars map templates and data packs: every template, with each of its packs, over many seeds, must give a fair and
// playable arena -- one caged island per player, three chests each on solid ground, every island a bridge away from the
// next -- and each pack must change what the arena is made of, what grows on it, and what its chests hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, buildArena, cellKey, normalizeMap, mapKey, DEFAULT_MAP } from '../src/mods/skywars/arena.js';
import { TEMPLATES, TEMPLATE_IDS } from '../src/mods/skywars/templates.js';
import { PACKS, BUNDLED, packsFor, loadPack, rollLootTable, checkLootTable, ARENA_PATH, LOOT_PATHS } from '../src/mods/skywars/packs.js';
import { fillChests, rollIslandLoot } from '../src/mods/skywars/loot.js';
import { SkyWarsMatch, HOST_ID } from '../src/mods/skywars/rules.js';
import { seededRandom } from '../src/mods/skywars/generator.js';
import { BLOCKS } from '../src/blocks.js';
import { sanitizeContainer, sanitizeGameData } from '../src/multiplayer/shareProtocol.js';

const SEEDS = [1, 7, 2015, 123456789];
// Each arena is built once and checked by every test below.
const built = new Map();
const every = (fn) => {
  for (const template of TEMPLATE_IDS) for (const pack of packsFor(template)) for (const seed of SEEDS) {
    const label = `${template}/${pack.id}/${seed}`;
    if (!built.has(label)) built.set(label, buildArena({ template, pack: pack.id, seed }));
    fn(built.get(label), label);
  }
};
const solid = (arena, x, y, z) => arena.blocks.has(cellKey(x, y, z));

// --- the packs --------------------------------------------------------------------------------------------------

test('packs: twelve bundled data packs, three made for each of the four templates, all loading cleanly', () => {
  assert.equal(TEMPLATE_IDS.length, 4);
  assert.equal(PACKS.size, 12);
  for (const template of TEMPLATE_IDS) assert.equal(packsFor(template).length, 3, template);
  for (const [id, pack] of PACKS) {
    assert.deepEqual(pack.errors, [], id);
    assert.ok(pack.name && pack.description, id);
  }
});

test('packs: laid out as data packs -- pack.mcmeta with the 1.21.4 format, the arena settings, vanilla loot tables', () => {
  for (const files of BUNDLED) {
    assert.equal(files['pack.mcmeta'].pack.pack_format, 61);
    assert.ok(files[ARENA_PATH]);
    for (const path of Object.keys(files)) assert.ok(path === 'pack.mcmeta' || path.startsWith('data/skywars/'), path);
    for (const path of Object.values(LOOT_PATHS)) if (files[path]) {
      assert.equal(files[path].type, 'minecraft:chest');
      assert.deepEqual(checkLootTable(files[path]), [], path);
    }
  }
});

test('packs: a bad pack says what is wrong with it', () => {
  assert.deepEqual(loadPack({}).errors, [`missing ${ARENA_PATH}`]);
  const bad = loadPack({
    'pack.mcmeta': { pack: { pack_format: 61 } },
    [ARENA_PATH]: { id: 'bad', templates: ['nowhere'], palette: { surface: 'minecraft:grass_block', subsurface: 'minecraft:dirt', core: 'minecraft:moon_rock' },
      decorations: [{ type: 'volcano' }, { type: 'pool', fluid: 'minecraft:stone' }], center: { feature: 'castle' } },
    [LOOT_PATHS.island]: { pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:laser_sword' }, { type: 'minecraft:tag', name: 'x' }] }] },
  });
  const text = bad.errors.join('\n');
  for (const expected of ['moon_rock', 'unknown type "volcano"', 'a pool is water or lava', 'center.feature', 'templates', 'laser_sword', 'minecraft:tag']) {
    assert.ok(text.includes(expected), `${expected} in:\n${text}`);
  }
});

// --- every template, with each of its packs, over many seeds --------------------------------------------------------

test('every map: one island per player, each in a closed cage of the pack\'s glass with room to stand, facing the middle', () => {
  every((arena, label) => {
    assert.equal(arena.islands.filter((i) => i.role === 'spawn').length, ARENA.maxPlayers, label);
    const cage = PACKS.get(arena.pack).generation.palette.cage;
    for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
      const s = arena.spawns[slot], x = Math.floor(s.x), z = Math.floor(s.z);
      assert.ok(solid(arena, x, s.y - 1, z), `${label} floor ${slot}`);
      assert.ok(!solid(arena, x, s.y, z) && !solid(arena, x, s.y + 1, z), `${label} room ${slot}`);
      assert.ok(arena.cages[slot].every((cell) => arena.blocks.get(cellKey(...cell)) === cage), `${label} cage ${slot}`);
      assert.ok(-Math.sin(s.yaw) * -s.x + -Math.cos(s.yaw) * -s.z > 0, `${label} slot ${slot} faces the middle`);
    }
  });
});

test('every map: fair -- every spawn as far from the middle as every other, to within a block', () => {
  every((arena, label) => {
    const d = arena.spawns.map((s) => Math.hypot(s.x - 0.5, s.z - 0.5));
    assert.ok(Math.max(...d) - Math.min(...d) <= 1.01, `${label}: ${d.map((n) => n.toFixed(1)).join(' ')}`);
    const heights = new Set(arena.spawns.map((s) => s.y));
    assert.equal(heights.size, 1, `${label}: every spawn at one height`);
  });
});

test('every map: three chests on every spawn island and chests in the middle, each on solid ground with air above', () => {
  every((arena, label) => {
    for (let slot = 0; slot < ARENA.maxPlayers; slot++) assert.equal(arena.chests.filter((c) => c.kind === 'island' && c.slot === slot).length, 3, `${label} ${slot}`);
    assert.ok(arena.chests.filter((c) => c.kind === 'center').length >= 4, label);
    for (const c of arena.chests) {
      assert.equal(arena.blocks.get(cellKey(c.x, c.y, c.z)), BLOCKS.CHEST, `${label} chest`);
      assert.ok(solid(arena, c.x, c.y - 1, c.z), `${label} chest on the ground`);
      assert.ok(!solid(arena, c.x, c.y + 1, c.z), `${label} a chest needs air above to open`);
    }
  });
});

test(`every map: at least ${ARENA.minGap} blocks of void between any two islands -- nobody jumps across, everybody bridges`, () => {
  every((arena, label) => {
    const islands = arena.islands;
    for (let i = 0; i < islands.length; i++) for (let j = i + 1; j < islands.length; j++) {
      const A = islands[i], B = islands[j];
      if (Math.hypot(A.x - B.x, A.z - B.z) > A.extent + B.extent + ARENA.minGap + 3) continue;
      for (const [x1, z1] of A.cells) for (const [x2, z2] of B.cells) {
        assert.ok(Math.hypot(x1 - x2, z1 - z2) - 1 >= ARENA.minGap, `${label}: ${A.role}${A.slot ?? ''} and ${B.role}${B.slot ?? ''}`);
      }
    }
  });
});

test('every map: the blocks in a spawn island\'s chests always reach the nearest island', () => {
  // rollIslandLoot always gives two or more stacks of 8-16 planks or stone (skywars.test.js): 16 at the least.
  every((arena, label) => {
    for (const s of arena.islands.filter((i) => i.role === 'spawn')) {
      let nearest = Infinity;
      for (const o of arena.islands) if (o !== s && o.role !== 'spawn') {
        for (const [x1, z1] of s.cells) for (const [x2, z2] of o.cells) nearest = Math.min(nearest, Math.hypot(x1 - x2, z1 - z2) - 1);
      }
      assert.ok(nearest <= 16, `${label}: ${nearest.toFixed(1)} blocks from spawn ${s.slot} to the next island`);
    }
  });
});

test('every map: inside the world (y 4-60), inside its bounds, and nothing below an island but the void', () => {
  every((arena, label) => {
    const b = arena.bounds;
    for (const key of arena.blocks.keys()) {
      const [x, y, z] = key.split(',').map(Number);
      assert.ok(y >= ARENA.minY && y <= ARENA.maxY && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ, `${label} ${key}`);
    }
    for (const i of arena.islands) assert.ok(i.y - 12 > ARENA.voidY, label);
  });
});

test('every map: water and lava lie in closed pools -- walled on every side and floored -- so nothing pours into the void', () => {
  every((arena, label) => {
    for (const [key, id] of arena.blocks) {
      if (id !== BLOCKS.WATER && id !== BLOCKS.LAVA) continue;
      const [x, y, z] = key.split(',').map(Number);
      assert.ok(solid(arena, x, y - 1, z), `${label}: a floor under ${key}`);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(solid(arena, x + dx, y, z + dz), `${label}: a wall beside ${key}`);
    }
  });
});

test('every map: the same map and seed give the same arena; a new seed gives different islands', () => {
  for (const template of TEMPLATE_IDS) {
    const pack = packsFor(template)[0].id;
    const a = buildArena({ template, pack, seed: 5 }), b = buildArena({ template, pack, seed: 5 }), c = buildArena({ template, pack, seed: 6 });
    assert.deepEqual([...a.blocks], [...b.blocks], template);
    assert.notDeepEqual([...a.blocks], [...c.blocks], template);
  }
});

// --- what makes each template itself -------------------------------------------------------------------------------

const roles = (arena, role) => arena.islands.filter((i) => i.role === role);

test('Classic Ring: eight spawn islands round one big middle, as on Hypixel', () => {
  const a = buildArena({ template: 'classic', pack: 'meadow', seed: 11 });
  assert.deepEqual(a.islands.map((i) => i.role).sort(), ['center', ...Array(8).fill('spawn')].sort());
  assert.ok(roles(a, 'center')[0].radius > roles(a, 'spawn')[0].radius);
});

test('Archipelago: connector islands of one chest each between the spawns and a smaller middle (Mineplex)', () => {
  const eight = buildArena({ template: 'archipelago', pack: 'tropical_atoll', seed: 11 });
  const four = buildArena({ template: 'archipelago', pack: 'mushroom_isles', seed: 11 });
  assert.equal(roles(eight, 'mid').length, 8, 'eight connector islands in Tropical Atoll');
  assert.equal(roles(four, 'mid').length, 4, 'four semi-middle islands in Mushroom Isles');
  assert.equal(eight.chests.filter((c) => c.kind === 'mid').length, 8, 'one chest each');
  for (const mid of roles(eight, 'mid')) {
    const d = Math.hypot(mid.x, mid.z);
    assert.ok(d > roles(eight, 'center')[0].radius && d < Math.hypot(eight.spawns[0].x, eight.spawns[0].z), 'between the spawns and the middle');
  }
});

test('Citadel: the castle in the middle is the highest ground, with a chest in each of four towers', () => {
  for (const seed of SEEDS) {
    const a = buildArena({ template: 'citadel', pack: 'stone_keep', seed });
    const center = roles(a, 'center')[0];
    assert.ok(center.y > roles(a, 'spawn')[0].y, 'higher than the spawns');
    const tower = a.chests.filter((c) => c.kind === 'center');
    assert.equal(tower.length, 4);
    const accent = PACKS.get('stone_keep').generation.palette.accent;
    for (const c of tower) assert.ok([4, 5, 6].some((h) => solid(a, c.x, c.y + h, c.z)), 'a tower roof over each chest');
    assert.ok([...a.blocks.values()].filter((id) => id === accent).length > 100, 'built of the pack\'s accent block');
  }
});

test('Sectors: four slices of two spawn islands sharing a sector island with two chests, round a small middle (Desserted Islands)', () => {
  const a = buildArena({ template: 'sectors', pack: 'sweet_slices', seed: 11 });
  const sectors = roles(a, 'sector');
  assert.equal(sectors.length, 4);
  assert.equal(a.chests.filter((c) => c.kind === 'mid').length, 8);
  assert.equal(a.chests.filter((c) => c.kind === 'center').length, 6, 'more middle chests');
  for (const sector of sectors) {
    const near = roles(a, 'spawn').map((s) => Math.hypot(s.x - sector.x, s.z - sector.z)).sort((x, y) => x - y);
    assert.ok(near[1] < near[2] - 5, 'two spawn islands belong to each sector');
  }
});

// --- what each pack changes --------------------------------------------------------------------------------------------

const count = (arena, id) => [...arena.blocks.values()].filter((b) => b === id).length;

test('packs change the materials: each island is topped with its pack\'s surface block', () => {
  for (const [id, pack] of PACKS) {
    const a = buildArena({ template: pack.templates[0], pack: id, seed: 3 });
    for (const island of a.islands) {
      const top = a.blocks.get(cellKey(island.x, island.y, island.z));
      if (island.role === 'spawn') assert.equal(top, pack.generation.palette.surface, `${id} ${island.role}`);
    }
  }
});

test('packs change what grows: spruces and ice in Frozen Peaks, fungi, basalt and lava in the Nether Rift, mushrooms, cherry trees, candy canes, ruins, palms and lagoons', () => {
  // Summed over a few seeds, as each island draws its own decorations.
  const total = (template, pack, id) => [1, 2, 3].reduce((n, seed) => n + count(buildArena({ template, pack, seed }), id), 0);
  const expect = [
    ['classic', 'meadow', 'OAK_LOG', 12], ['classic', 'meadow', 'BIRCH_LOG', 12], ['classic', 'meadow', 'GLOWSTONE', 4],
    ['classic', 'frozen_peaks', 'SPRUCE_LOG', 30], ['classic', 'frozen_peaks', 'PACKED_ICE', 30], ['classic', 'frozen_peaks', 'ICE', 30],
    ['classic', 'nether_rift', 'WARPED_STEM', 4], ['classic', 'nether_rift', 'BASALT', 15], ['classic', 'nether_rift', 'LAVA', 3], ['classic', 'nether_rift', 'BREWING_STAND', 3],
    ['archipelago', 'tropical_atoll', 'JUNGLE_LOG', 40], ['archipelago', 'tropical_atoll', 'WATER', 3],
    ['archipelago', 'mushroom_isles', 'BROWN_MUSHROOM_BLOCK', 20], ['archipelago', 'mushroom_isles', 'MUSHROOM_STEM', 8],
    ['archipelago', 'sky_ruins', 'CRACKED_STONE_BRICKS', 3], ['archipelago', 'sky_ruins', 'HANGING_ROOTS', 10],
    ['citadel', 'desert_fortress', 'CACTUS', 8], ['citadel', 'end_citadel', 'OBSIDIAN', 20], ['citadel', 'end_citadel', 'PURPUR_BLOCK', 100],
    ['sectors', 'sweet_slices', 'RED_WOOL', 30], ['sectors', 'volcanic_shards', 'MAGMA_BLOCK', 10], ['sectors', 'volcanic_shards', 'LAVA', 3],
    ['sectors', 'cherry_grove', 'CHERRY_LOG', 12], ['sectors', 'cherry_grove', 'PINK_PETALS', 30],
  ];
  for (const [template, pack, name, least] of expect) {
    const n = total(template, pack, BLOCKS[name]);
    assert.ok(n >= least, `${pack}: ${n} ${name}, expected at least ${least}`);
  }
  // And not in the packs that do not ask for them.
  assert.equal(total('classic', 'meadow', BLOCKS.LAVA), 0);
  assert.equal(total('classic', 'frozen_peaks', BLOCKS.OAK_LOG), 0);
});

test('packs change the loot: their vanilla loot tables add to every fill, on top of Normal or Insane', () => {
  const frozen = buildArena({ template: 'classic', pack: 'frozen_peaks', seed: 4 });
  for (const seed of [1, 2, 3]) {
    const lists = fillChests(frozen, { mode: 'normal', seed });
    for (let slot = 0; slot < 8; slot++) {
      const mine = frozen.chests.flatMap((c, i) => (c.slot === slot ? lists[i] : [])).filter(Boolean);
      assert.ok(mine.some((s) => s.id === 'snowball' && s.count >= 8), `snowballs on island ${slot}`);
    }
  }
  const desert = buildArena({ template: 'citadel', pack: 'desert_fortress', seed: 4 });
  const loot = fillChests(desert, { mode: 'insane', seed: 9 }).flat().filter(Boolean);
  assert.ok(loot.some((s) => s.id === BLOCKS.TNT && s.isBlock) && loot.some((s) => s.id === 'flint_and_steel'), 'TNT and flint and steel');
  // Every stack of every pack can travel to the other players.
  for (const [id, pack] of PACKS) {
    const a = buildArena({ template: pack.templates[0], pack: id, seed: 1 });
    fillChests(a, { mode: 'insane', seed: 5 }).forEach((items, i) => {
      const c = a.chests[i];
      assert.ok(sanitizeContainer({ x: c.x, y: c.y, z: c.z, items }), `${id} chest ${i} (${c.kind})`);
      assert.ok(items.some(Boolean), `${id} chest ${i} is not empty`);
    });
  }
});

test('loot tables: vanilla rolls, weights, counts, enchantments and random_chance', () => {
  const table = { pools: [
    { rolls: { min: 2, max: 2 }, entries: [{ type: 'minecraft:item', name: 'minecraft:diamond_sword', weight: 1, functions: [{ function: 'minecraft:set_enchantments', enchantments: { 'minecraft:sharpness': 2 } }] },
      { type: 'minecraft:item', name: 'minecraft:arrow', weight: 3, functions: [{ function: 'minecraft:set_count', count: { min: 5, max: 7 } }] }] },
    { rolls: 1, conditions: [{ condition: 'minecraft:random_chance', chance: 0 }], entries: [{ type: 'minecraft:item', name: 'minecraft:totem_of_undying' }] },
    { rolls: 1, entries: [{ type: 'minecraft:empty' }] },
  ] };
  const random = seededRandom(3);
  let arrows = 0, swords = 0;
  for (let i = 0; i < 400; i++) {
    const out = rollLootTable(table, random);
    assert.equal(out.length, 2, 'two rolls; the empty entry gives nothing; the 0-chance pool never');
    for (const s of out) {
      if (s.id === 'arrow') { arrows++; assert.ok(s.count >= 5 && s.count <= 7); }
      else { swords++; assert.deepEqual(s.enchantments.map((e) => [e.id, e.level]), [['sharpness', 2]]); }
    }
  }
  assert.ok(arrows > swords * 2 && arrows < swords * 4, `weights 3:1 (${arrows}:${swords})`);
});

// --- choosing the map in the lobby ---------------------------------------------------------------------------------

test('lobby: the host chooses the map and its pack; each choice, and each round, is freshly generated', () => {
  let n = 0;
  const match = new SkyWarsMatch({ random: () => ((n++ * 0.137) % 1) });
  match.join(HOST_ID, 'Host');
  match.join('p1', 'Guest');
  assert.ok(TEMPLATES[match.map.template] && PACKS.get(match.map.pack));
  assert.equal(match.setMap('p1', { template: 'citadel' }), false, 'only the host');
  assert.equal(match.setMap(HOST_ID, { template: 'citadel' }), true);
  assert.deepEqual([match.map.template, match.map.pack], ['citadel', 'stone_keep'], 'the template\'s first pack by default');
  const first = match.map.seed;
  assert.equal(match.setMap(HOST_ID, { template: 'citadel', pack: 'end_citadel' }), true);
  assert.equal(match.map.pack, 'end_citadel');
  assert.notEqual(match.map.seed, first);
  assert.equal(match.setMap(HOST_ID, { template: 'citadel', pack: 'meadow' }), true);
  assert.equal(match.map.pack, 'stone_keep', 'a pack made for another template is not used');
  const before = match.map.seed;
  assert.equal(match.newIslands(HOST_ID), true);
  assert.notEqual(match.map.seed, before, 'New islands');
  assert.equal(match.snapshot().map.template, 'citadel');
  assert.deepEqual(sanitizeGameData(match.snapshot()).map, match.map, 'the map travels in the state');
  match.start(HOST_ID);
  assert.equal(match.setMap(HOST_ID, { template: 'classic' }), false, 'not once started');
  assert.equal(match.newIslands(HOST_ID), false);
  match.update(3.1);
  match.eliminate('p1', 'void');
  const played = match.map.seed;
  match.reset(HOST_ID);
  assert.equal(match.map.template, 'citadel', 'play again keeps the map');
  assert.notEqual(match.map.seed, played, 'on new islands');
});

test('maps: anything unknown falls back to the default map', () => {
  assert.deepEqual(normalizeMap({ template: 'moon', pack: 'cheese', seed: 'x' }), DEFAULT_MAP);
  assert.equal(normalizeMap({ template: 'sectors' }).pack, 'sweet_slices');
  assert.equal(mapKey({ template: 'a', pack: 'b', seed: -1 }), 'a/b/4294967295');
  assert.equal(buildArena(77).template, DEFAULT_MAP.template, 'a bare seed is the default map');
  assert.ok(rollIslandLoot('normal', seededRandom(1)).length > 3);
});
