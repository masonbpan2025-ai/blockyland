// Headless smoke harness for the spawning subsystem.
//
// Builds a real World, a stub mob manager and a stub game, then drives the manager for a simulated
// period and reports what happened. Used during development because the game itself needs a browser;
// the real tests live in tests/.
import { World } from '../src/world.js';
import { BLOCKS } from '../src/blocks.js';
import { MobSpawnManager } from '../src/spawning/mobSpawnManager.js';
import { blockOpacity, MAX_LIGHT } from '../src/spawning/lightEngine.js';

const MOB_DIMS = {
  zombie: { width: 0.6, height: 1.95 },
  skeleton: { width: 0.6, height: 1.98 },
  creeper: { width: 0.6, height: 1.7 },
  spider: { width: 1.4, height: 0.9 },
  slime: { width: 2.08, height: 2.08 },
  enderman: { width: 0.6, height: 2.9 },
  witch: { width: 0.6, height: 1.95 },
  zombie_villager: { width: 0.6, height: 1.95 },
  bat: { width: 0.5, height: 0.9 },
  glow_squid: { width: 0.8, height: 0.8 },
  sheep: { width: 0.9, height: 1.3 },
  pig: { width: 0.9, height: 0.9 },
  cow: { width: 0.9, height: 1.4 },
  chicken: { width: 0.4, height: 0.7 },
  horse: { width: 1.4, height: 1.6 },
  donkey: { width: 1.3965, height: 1.5 },
  cod: { width: 0.35, height: 0.3 },
  squid: { width: 0.8, height: 0.8 },
  dolphin: { width: 0.9, height: 0.6 },
  drowned: { width: 0.6, height: 1.95 },
  guardian: { width: 0.85, height: 0.85 },
  tropical_fish: { width: 0.5, height: 0.4 },
  axolotl: { width: 0.5, height: 0.35 },
  salmon: { width: 0.4, height: 0.35 },
  pufferfish: { width: 0.35, height: 0.35 },
};

let mobSeq = 0;
function makeStubGame(world) {
  const mobs = {
    mobs: [],
    getMobDimensions: (type) => MOB_DIMS[type] || { width: 0.6, height: 1.95 },
    isBlockSolid: (x, y, z) => {
      const id = world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id === BLOCKS.AIR || id === BLOCKS.WATER || id === BLOCKS.FIRE) return false;
      return blockOpacity(id) >= MAX_LIGHT;
    },
    spawnMob(type, x, y, z) {
      const mob = {
        id: ++mobSeq,
        type,
        health: 20,
        maxHealth: 20,
        mesh: { position: { x, y, z, distanceTo: () => 0 } },
        persistent: false,
        noActionTime: 0,
      };
      mobs.mobs.push(mob);
      return mob;
    },
    removeMob(mob) {
      const i = mobs.mobs.indexOf(mob);
      if (i === -1) return false;
      mobs.mobs.splice(i, 1);
      return true;
    },
  };
  const player = {
    position: { x: 8, y: 40, z: 8 },
    gamemode: 'survival',
  };
  const game = {
    world,
    mobs,
    player,
    difficulty: 'normal',
    worldTime: 18000,
    weather: { weatherType: 'clear' },
  };
  return { game, mobs, player };
}

function run({ seed = 42, biome = 'all', label, seconds = 60, difficulty = 'normal', time = 18000, radius = 8, verbose = true }) {
  const world = new World(seed, biome);
  // Generate the player's area, as the streamer would.
  const cx0 = 0;
  const cz0 = 0;
  for (let cx = cx0 - radius; cx <= cx0 + radius; cx++) {
    for (let cz = cz0 - radius; cz <= cz0 + radius; cz++) world.getOrCreateChunk(cx, cz);
  }
  world.light.relightAll();

  const { game, mobs, player } = makeStubGame(world);
  game.difficulty = difficulty;
  game.worldTime = time;

  const manager = new MobSpawnManager({ game });
  manager.enabled = true;

  const ticks = seconds * 20;
  const t0 = performance.now();
  for (let i = 0; i < ticks; i++) {
    game.worldTime = (game.worldTime + 1) % 24000;
    manager.update(1 / 20);
  }
  const elapsed = performance.now() - t0;

  const surface = world.getHighestSolidY(8, 8);
  const telemetry = manager.naturalSpawner.telemetry();
  const byType = {};
  for (const m of mobs.mobs) byType[m.type] = (byType[m.type] || 0) + 1;
  const state = manager.stateCache?.state;

  if (verbose) {
    console.log(`\n=== ${label} (${seconds}s sim, ${elapsed.toFixed(0)}ms wall) ===`);
    console.log(`surface y=${surface} seaLevel=${world.seaLevel} dimension=${world.dimension}`);
    console.log(`eligible chunks: ${state?.eligibleChunks?.length ?? 0} / capSquare ${state?.capSquareChunkCount ?? 0}`);
    console.log(`caps:`, Object.entries(state?.caps || {}).map(([k, v]) => `${k}=${v === Infinity ? 'inf' : v}`).join(' '));
    console.log(`spawner: attempts=${telemetry.positionAttempts} spawns=${telemetry.spawns} chunks=${telemetry.chunkAttempts} avgMs=${telemetry.averageMs} maxMs=${telemetry.maxMs}`);
    console.log(`mobs alive: ${mobs.mobs.length}`, byType);
    console.log(`rejections:`, telemetry.rejections);
    console.log(`spawnsByBiome:`, telemetry.spawnsByBiome);
    console.log(`despawner:`, manager.despawnManager.telemetry().hardRemovals, 'hard,', manager.despawnManager.telemetry().randomRemovals, 'random,', manager.despawnManager.telemetry().peacefulRemovals, 'peaceful');
  }
  return { world, game, mobs, manager, telemetry, byType, state };
}

const which = process.argv[2] || 'all';
if (which === 'all' || which === 'plains') run({ biome: 'plains', label: 'PLAINS NIGHT' });
if (which === 'all' || which === 'day') run({ biome: 'plains', label: 'PLAINS DAY', time: 6000 });
if (which === 'all' || which === 'peaceful') run({ biome: 'plains', label: 'PLAINS PEACEFUL', difficulty: 'peaceful' });
if (which === 'all' || which === 'desert') run({ biome: 'desert', label: 'DESERT NIGHT' });
if (which === 'all' || which === 'ocean') run({ biome: 'ocean', label: 'OCEAN NIGHT', seed: 7 });
if (which === 'all' || which === 'nether') run({ biome: 'nether', label: 'NETHER' });
if (which === 'all' || which === 'mushroom') run({ biome: 'mushroom_fields', label: 'MUSHROOM FIELDS' });
if (which === 'all' || which === 'varied') run({ biome: 'all', label: 'ALL BIOMES NIGHT', seed: 1234 });
