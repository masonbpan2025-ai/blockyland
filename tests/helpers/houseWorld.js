// A small plank house on flat grass, for the Agent Terminal's perception and decoration tests.
//
//   interior air: x 1..7, y 11..13, z 1..5 (a 7x5 room, 3 blocks high)
//   walls x 0 / 8, z 0 / 6; floor y 10, roof y 14, all oak planks
//   a door in the north wall at x 4, glass windows in the west and east walls at z 3 (eye level, y 12),
//   a bed and a chest against the south wall
import { BLOCKS } from '../../src/blocks.js';

export function houseWorld({ door = true } = {}) {
  const cells = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const set = (x, y, z, id) => cells.set(key(x, y, z), id);
  for (let x = 0; x <= 8; x++) for (let z = 0; z <= 6; z++) {
    set(x, 10, z, BLOCKS.OAK_PLANKS);
    set(x, 14, z, BLOCKS.OAK_PLANKS);
    for (let y = 11; y <= 13; y++) {
      const wall = x === 0 || x === 8 || z === 0 || z === 6;
      set(x, y, z, wall ? BLOCKS.OAK_PLANKS : BLOCKS.AIR);
    }
  }
  if (door) {
    set(4, 11, 0, BLOCKS.OAK_DOOR);
    set(4, 12, 0, BLOCKS.OAK_DOOR_TOP);
  }
  set(0, 12, 3, BLOCKS.GLASS);
  set(8, 12, 3, BLOCKS.GLASS);
  set(1, 11, 5, BLOCKS.RED_BED_FOOT);
  set(7, 11, 5, BLOCKS.CHEST);
  const natural = y => (y < 10 ? BLOCKS.DIRT : y === 10 ? BLOCKS.GRASS : BLOCKS.AIR);
  const world = {
    cells,
    getVoxel: (x, y, z) => cells.get(key(x, y, z)) ?? natural(y),
    setVoxel: (x, y, z, id) => cells.set(key(x, y, z), id),
    getOrCreateChunk: () => null,
    chunks: new Map()
  };
  return world;
}

export function houseGame(overrides = {}) {
  const world = houseWorld(overrides);
  return {
    world,
    player: { position: { x: 4.5, y: 11, z: 3.5 }, yaw: Math.PI, pitch: 0, gamemode: 'creative', health: 20, maxHealth: 20, hunger: 20 },
    worldTime: 6000,
    weather: { weatherType: 'clear', setWeather() {} },
    sounds: { playMagic() {}, playLevelUp() {}, playClick() {}, playPlace() {}, playBreak() {} },
    rebuildChunkMesh() {},
    ...overrides.game
  };
}
