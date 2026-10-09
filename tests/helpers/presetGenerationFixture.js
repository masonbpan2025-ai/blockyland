import { World } from '../../src/world.js';
import { MobSpawnManager } from '../../src/spawning/mobSpawnManager.js';
import { RecordingMobManager, isSolidBlockId } from './spawnFixture.js';
import { JavaRandom } from '../../src/spawning/spawnRandom.js';
import { buildPresetPack } from '../../src/dataPackPresets.js';
import { createPackStore, addPack, PACK_SOURCES } from '../../src/dataPackStore.js';
import { applyStore, revertAll } from '../../src/dataPackApply.js';
import { resetTagRegistry } from '../../src/dataPackRuntime.js';

export function applyPresetFixture(t, id) {
  resetTagRegistry();
  const built = buildPresetPack(id);
  const store = createPackStore();
  addPack(store, { name: built.name, files: built.files, source: PACK_SOURCES.PRESET, format: 61 });
  const applied = applyStore(store);
  t.after(() => { revertAll(applied); resetTagRegistry(); });
  return built;
}

export function recordingSpawner(world, seed = 4242) {
  if (!world.chunks) world.chunks = new Map([...world.loaded].map(key => [key, {}]));
  const shape = (width, height) => ({ width, height });
  const mobs = new RecordingMobManager({ world, dimensions: {
    cow: shape(0.9, 1.4), sheep: shape(0.9, 1.3), pig: shape(0.9, 0.9), chicken: shape(0.4, 0.7),
    horse: shape(1.4, 1.6), llama: shape(0.9, 1.87), wolf: shape(0.6, 0.85), fox: shape(0.6, 0.7),
    rabbit: shape(0.4, 0.5), bee: shape(0.7, 0.6), parrot: shape(0.5, 0.9), polar_bear: shape(1.4, 1.4),
    goat: shape(0.9, 1.3), camel: shape(1.7, 2.375), panda: shape(1.3, 1.25), ocelot: shape(0.6, 0.7),
    mooshroom: shape(0.9, 1.4), bat: shape(0.5, 0.9), cod: shape(0.5, 0.3), salmon: shape(0.5, 0.4),
    tropical_fish: shape(0.5, 0.4), pufferfish: shape(0.35, 0.35), squid: shape(0.8, 0.8), dolphin: shape(0.9, 0.6),
  } });
  mobs.isBlockSolid = (x, y, z) => isSolidBlockId(world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)));
  const game = { world, mobs, player: { gamemode: 'creative', position: { x: 8, y: 40, z: 8 } },
    difficulty: 'normal', worldTime: 6000 };
  const manager = new MobSpawnManager({ game });
  manager.random = new JavaRandom(seed);
  world.game = game;
  game.spawnManager = manager;
  return { manager, mobs, game, world };
}

// Real terrain + real pack application + real lighting/population, without rendering or mob AI.
export function generatedPresetFixture(biome, { seed = 4289, radius = 2 } = {}) {
  const fixture = recordingSpawner(new World(seed, biome));
  for (let cx = -radius; cx <= radius; cx++) for (let cz = -radius; cz <= radius; cz++) fixture.world.getOrCreateChunk(cx, cz);
  fixture.counts = Object.fromEntries([...new Set(fixture.mobs.mobs.map(m => m.type))]
    .map(type => [type, fixture.mobs.mobs.filter(m => m.type === type).length]));
  return fixture;
}
