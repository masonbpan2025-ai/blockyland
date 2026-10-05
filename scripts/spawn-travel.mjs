// Travel regression harness.
//
// The reported bug was "mobs near spawn only, nothing in newly loaded areas". This drives a player
// across hundreds of blocks, unloading the chunks behind them, and reports what the spawn cycle did
// before and after -- which is the evidence that the underlying cause is fixed rather than that the
// spawn rate was merely raised.
import { World } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { MobSpawnManager } from '../src/spawning/mobSpawnManager.js';
import { blockOpacity, MAX_LIGHT } from '../src/spawning/lightEngine.js';

const DIMS = { zombie: { width: 0.6, height: 1.95 }, skeleton: { width: 0.6, height: 1.98 }, creeper: { width: 0.6, height: 1.7 }, spider: { width: 1.4, height: 0.9 }, slime: { width: 2.08, height: 2.08 }, enderman: { width: 0.6, height: 2.9 }, witch: { width: 0.6, height: 1.95 }, zombie_villager: { width: 0.6, height: 1.95 }, bat: { width: 0.5, height: 0.9 }, glow_squid: { width: 0.8, height: 0.8 }, sheep: { width: 0.9, height: 1.3 }, pig: { width: 0.9, height: 0.9 }, cow: { width: 0.9, height: 1.4 }, chicken: { width: 0.4, height: 0.7 }, horse: { width: 1.4, height: 1.6 }, donkey: { width: 1.3965, height: 1.5 }, cod: { width: 0.35, height: 0.3 }, salmon: { width: 0.4, height: 0.35 }, squid: { width: 0.8, height: 0.8 }, drowned: { width: 0.6, height: 1.95 }, tropical_fish: { width: 0.5, height: 0.4 }, pufferfish: { width: 0.35, height: 0.35 }, rabbit: { width: 0.4, height: 0.5 } };

function setup(seed, biome, radius = 8) {
  const world = new World(seed, biome);
  for (let cx = -radius; cx <= radius; cx++) for (let cz = -radius; cz <= radius; cz++) world.getOrCreateChunk(cx, cz);
  world.light.relightAll();
  const mobs = {
    mobs: [],
    getMobDimensions: (t) => DIMS[t] || { width: 0.6, height: 1.95 },
    isBlockSolid: (x, y, z) => {
      const id = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.FIRE) return false;
      return blockOpacity(id) >= MAX_LIGHT;
    },
    spawnMob(type, x, y, z) {
      const m = { type, health: 20, maxHealth: 20, mesh: { position: { x, y, z } }, persistent: false, noActionTime: 0 };
      mobs.mobs.push(m); return m;
    },
    removeMob(mob) { const i = mobs.mobs.indexOf(mob); if (i === -1) return false; mobs.mobs.splice(i, 1); return true; },
  };
  const player = { position: { x: 8, y: 40, z: 8 }, gamemode: 'survival', teleport(x, z) { this.position.x = x; this.position.z = z; } };
  const game = { world, mobs, player, difficulty: 'normal', worldTime: 18000, weather: { weatherType: 'clear' } };
  const manager = new MobSpawnManager({ game });
  return { world, game, mobs, player, manager };
}

/**
 * Move the player, streaming chunks the way the game does: generate ahead, unload behind.
 *
 * The unload is the part that matters. The old engine kept every chunk, so a mob left behind held
 * cap space forever with no way to release it.
 */
function streamTo(world, player, x, z, radius = 8, unloadRadius = 11) {
  const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
  for (let ax = cx - radius; ax <= cx + radius; ax++) for (let az = cz - radius; az <= cz + radius; az++) world.getOrCreateChunk(ax, az);
  for (const chunk of [...world.chunks.values()]) {
    if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > unloadRadius) {
      world.light.removeChunk(chunk.cx, chunk.cz);
      world.chunks.delete(`${chunk.cx},${chunk.cz}`);
    }
  }
  world.invalidateChunkCache();
  world.light.relightAll();
  player.teleport(x, z);
}

function simulate(manager, game, seconds) {
  for (let i = 0; i < seconds * 20; i++) {
    game.worldTime = (game.worldTime + 1) % 24000;
    manager.update(1 / 20);
  }
}

function describe(mobs, world, label) {
  const counts = {};
  let nearOld = 0, nearNew = 0, onSurface = 0, underground = 0;
  for (const m of mobs) {
    counts[m.type] = (counts[m.type] || 0) + 1;
    const distOrigin = Math.hypot(m.mesh.position.x - 8, m.mesh.position.z - 8);
    if (distOrigin < 160) nearOld++; else nearNew++;
    const surface = world.getHighestSolidY(Math.floor(m.mesh.position.x), Math.floor(m.mesh.position.z));
    if (m.mesh.position.y >= surface - 1) onSurface++; else underground++;
  }
  return { label, total: mobs.length, counts, nearOld, nearNew, onSurface, underground };
}

// ---------------------------------------------------------------------------------------------
console.log('=== TRAVEL REGRESSION: player walks 800 blocks, chunks unload behind ===');
const { world, game, mobs, player, manager } = setup(1234, 'all');
simulate(manager, game, 45);
console.log('after 45s at spawn:', JSON.stringify(describe(mobs.mobs, world, 'spawn')));
const beforeTypes = mobs.mobs.map(m => m.type).sort();

// Walk in steps, streaming as the game would.
for (let step = 1; step <= 8; step++) {
  const targetX = 8 + step * 100;
  streamTo(world, player, targetX, 8);
  simulate(manager, game, 12);
  const d = describe(mobs.mobs, world, `x=${targetX}`);
  console.log(`after travelling to x=${targetX}: total=${d.total} nearOld=${d.nearOld} nearNew=${d.nearNew} above=${d.onSurface} below=${d.underground}`);
}

const final = describe(mobs.mobs, world, 'final');
console.log('\nfinal populations:', JSON.stringify(final.counts));
const despawn = manager.despawnManager.telemetry();
console.log('despawns over the trip:', JSON.stringify({ hard: despawn.hardRemovals, random: despawn.randomRemovals, peaceful: despawn.peacefulRemovals }));
const telemetry = manager.naturalSpawner.telemetry();
console.log('spawns by biome across the trip:', JSON.stringify(telemetry.spawnsByBiome));

console.log('\n--- ASSERTIONS ---');
const checks = [
  ['mobs exist at the end of the trip', final.total > 0],
  ['mobs exist far from the original spawn', final.nearNew > 0 || final.nearOld === 0],
  ['the old area is not the only place with mobs', !(final.nearNew === 0 && final.nearOld > 0)],
  ['mobs kept despawning as the player travelled', despawn.hardRemovals + despawn.randomRemovals > 0],
  ['spawns cover more than one biome', Object.keys(telemetry.spawnsByBiome).length > 1],
];
let failed = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; }
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
