import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Blocks definitions
const BLOCKS = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  BEDROCK: 5,
  SAND: 6,
  GRAVEL: 7,
  OAK_LOG: 8,
  OAK_LEAVES: 9,
  OAK_PLANKS: 10,
  GLASS: 11,
  WATER: 12,
  LAVA: 13,
  GOLD_ORE: 16,
  OBSIDIAN: 20,
  BRICKS: 25,
  POPPY: 30,
  DANDELION: 31,
  SANDSTONE: 32,
  STONE_BRICKS: 34,
  GLOWSTONE: 35,
  SEA_LANTERN: 36,
  NETHERRACK: 40,
  WHITE_WOOL: 43,
  RED_WOOL: 44,
  BLUE_WOOL: 45,
  YELLOW_WOOL: 46,
  BLACK_WOOL: 48
};

const CHUNK_SIZE_X = 16;
const CHUNK_SIZE_Y = 64;
const CHUNK_SIZE_Z = 16;

function encodeVoxelsRLE(voxels) {
  if (!voxels || voxels.length === 0) return [];
  const rle = [];
  let currentVal = voxels[0];
  let currentCount = 1;
  for (let i = 1; i < voxels.length; i++) {
    const v = voxels[i];
    if (v === currentVal) {
      currentCount++;
    } else {
      rle.push(currentVal, currentCount);
      currentVal = v;
      currentCount = 1;
    }
  }
  rle.push(currentVal, currentCount);
  return rle;
}

// World grid container
class WorldBuilder {
  constructor() {
    this.chunks = new Map(); // key -> Uint8Array(16*64*16)
  }

  getChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (!this.chunks.has(key)) {
      this.chunks.set(key, new Uint8Array(CHUNK_SIZE_X * CHUNK_SIZE_Y * CHUNK_SIZE_Z));
    }
    return this.chunks.get(key);
  }

  setVoxel(x, y, z, blockId) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return;
    const cx = Math.floor(x / CHUNK_SIZE_X);
    const cz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const chunk = this.getChunk(cx, cz);
    const idx = lx + lyIndex(y) + lz * (CHUNK_SIZE_X * CHUNK_SIZE_Y);
    chunk[idx] = blockId;
  }

  getVoxel(x, y, z) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return BLOCKS.AIR;
    const cx = Math.floor(x / CHUNK_SIZE_X);
    const cz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const chunk = this.getChunk(cx, cz);
    const idx = lx + lyIndex(y) + lz * (CHUNK_SIZE_X * CHUNK_SIZE_Y);
    return chunk[idx];
  }

  fillBox(minX, minY, minZ, maxX, maxY, maxZ, blockId) {
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          this.setVoxel(x, y, z, blockId);
        }
      }
    }
  }
}

function lyIndex(y) {
  return y * CHUNK_SIZE_X;
}

console.log('Generating Dragon Ball World Martial Arts Tournament Map...');
const builder = new WorldBuilder();

// 1. Build Base Terrain across Chunks CX: -3..3, CZ: -3..3 (from X: -48 to 48, Z: -48 to 48)
const minX = -48;
const maxX = 48;
const minZ = -48;
const maxZ = 48;

for (let x = minX; x <= maxX; x++) {
  for (let z = minZ; z <= maxZ; z++) {
    builder.setVoxel(x, 0, z, BLOCKS.BEDROCK);
    for (let y = 1; y <= 15; y++) {
      builder.setVoxel(x, y, z, BLOCKS.STONE);
    }
    for (let y = 16; y <= 19; y++) {
      builder.setVoxel(x, y, z, BLOCKS.DIRT);
    }
    // Ground surface at Y=20: Courtyard stone pavement near center, green lawn on outer
    const distFromCenter = Math.hypot(x, z);
    if (distFromCenter < 28) {
      // Paved courtyard pattern: Sandstone / Cobblestone walkways
      if (Math.abs(x) <= 3 || Math.abs(z) <= 3 || (Math.abs(x) >= 10 && Math.abs(x) <= 12) || (Math.abs(z) >= 10 && Math.abs(z) <= 12)) {
        builder.setVoxel(x, 20, z, BLOCKS.COBBLESTONE);
      } else {
        builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
      }
    } else {
      builder.setVoxel(x, 20, z, BLOCKS.GRASS);
    }
  }
}

// 2. Tenkaichi Budokai Elevated Fighting Stage (The Ring)
// 18x18 arena: X: -9 to 9, Z: -9 to 9
// Solid foundation from Y=21 to Y=23
builder.fillBox(-9, 21, -9, 9, 23, 9, BLOCKS.STONE_BRICKS);

// Stage Surface at Y=24
for (let x = -9; x <= 9; x++) {
  for (let z = -9; z <= 9; z++) {
    const isBorder = (Math.abs(x) === 9 || Math.abs(z) === 9);
    if (isBorder) {
      // Iconic White ring boundary lines
      builder.setVoxel(x, 24, z, BLOCKS.WHITE_WOOL);
    } else {
      // Elegant checkered stone tiles
      const checker = (Math.abs(x) + Math.abs(z)) % 2 === 0;
      builder.setVoxel(x, 24, z, checker ? BLOCKS.STONE : BLOCKS.STONE_BRICKS);
    }
  }
}

// Center Dragon Ball Martial Arts Ring Crest at (0, 24, 0)
builder.setVoxel(0, 24, 0, BLOCKS.GOLD_ORE);
builder.setVoxel(1, 24, 0, BLOCKS.RED_WOOL);
builder.setVoxel(-1, 24, 0, BLOCKS.RED_WOOL);
builder.setVoxel(0, 24, 1, BLOCKS.RED_WOOL);
builder.setVoxel(0, 24, -1, BLOCKS.RED_WOOL);

// 3. Four Grand Staircases leading up to the stage
// South stairs (Front / Player approach): X: -2..2, Z: 10..13
for (let step = 0; step < 4; step++) {
  const z = 10 + step;
  const y = 23 - step;
  builder.fillBox(-2, 21, z, 2, y, z, BLOCKS.STONE_BRICKS);
}
// North stairs (towards pavilion): X: -2..2, Z: -10..-13
for (let step = 0; step < 4; step++) {
  const z = -10 - step;
  const y = 23 - step;
  builder.fillBox(-2, 21, z, 2, y, z, BLOCKS.STONE_BRICKS);
}
// East stairs: X: 10..13, Z: -2..2
for (let step = 0; step < 4; step++) {
  const x = 10 + step;
  const y = 23 - step;
  builder.fillBox(x, 21, -2, x, y, 2, BLOCKS.STONE_BRICKS);
}
// West stairs: X: -10..-13, Z: -2..2
for (let step = 0; step < 4; step++) {
  const x = -10 - step;
  const y = 23 - step;
  builder.fillBox(x, 21, -2, x, y, 2, BLOCKS.STONE_BRICKS);
}

// 4. Tenkaichi Budokai Main Temple Pavilion (Behind the Stage, Z: -15 to -28)
// Foundation Terrace (Y=21..24)
builder.fillBox(-15, 21, -28, 15, 24, -15, BLOCKS.STONE_BRICKS);
builder.fillBox(-14, 24, -27, 14, 24, -16, BLOCKS.OAK_PLANKS);

// Vermilion Red Columns / Pillars (Y=25..31)
const columnPositions = [
  [-13, -17], [-7, -17], [-1, -17], [1, -17], [7, -17], [13, -17],
  [-13, -23], [-7, -23], [7, -23], [13, -23],
  [-13, -27], [-7, -27], [0, -27], [7, -27], [13, -27]
];
for (const [cx, cz] of columnPositions) {
  builder.fillBox(cx, 25, cz, cx, 31, cz, BLOCKS.RED_WOOL);
}

// Walls of the Pavilion (Y=25..31)
builder.fillBox(-14, 25, -28, 14, 31, -28, BLOCKS.BRICKS); // Back wall
builder.fillBox(-14, 25, -27, -14, 31, -17, BLOCKS.BRICKS); // West wall
builder.fillBox(14, 25, -27, 14, 31, -17, BLOCKS.BRICKS);  // East wall

// Front Archway & Dragon Ball Sign Board: "TENKAICHI BUDOKAI"
builder.fillBox(-6, 30, -17, 6, 31, -17, BLOCKS.GOLD_ORE);
builder.fillBox(-4, 31, -17, 4, 31, -17, BLOCKS.RED_WOOL);
builder.setVoxel(0, 31, -16, BLOCKS.SEA_LANTERN); // Glowing central crest

// Tier 1 Pagoda Roof with Swept Eaves (Y=32..33, X: -16..16, Z: -29..-14)
for (let x = -16; x <= 16; x++) {
  for (let z = -29; z <= -14; z++) {
    const isEave = (Math.abs(x) >= 15 || z <= -28 || z >= -15);
    builder.setVoxel(x, 32, z, isEave ? BLOCKS.NETHERRACK : BLOCKS.OAK_PLANKS);
  }
}
// Upturned curved corner eaves
builder.setVoxel(-16, 33, -14, BLOCKS.GOLD_ORE);
builder.setVoxel(16, 33, -14, BLOCKS.GOLD_ORE);
builder.setVoxel(-16, 33, -29, BLOCKS.GOLD_ORE);
builder.setVoxel(16, 33, -29, BLOCKS.GOLD_ORE);

// Hanging Lanterns under eaves
builder.setVoxel(-15, 31, -15, BLOCKS.GLOWSTONE);
builder.setVoxel(15, 31, -15, BLOCKS.GLOWSTONE);
builder.setVoxel(-15, 31, -28, BLOCKS.GLOWSTONE);
builder.setVoxel(15, 31, -28, BLOCKS.GLOWSTONE);

// Tier 2 Upper Pagoda Roof (Y=34..36, X: -10..10, Z: -26..-17)
builder.fillBox(-10, 33, -26, 10, 34, -17, BLOCKS.BRICKS);
for (let x = -11; x <= 11; x++) {
  for (let z = -27; z <= -16; z++) {
    builder.setVoxel(x, 35, z, BLOCKS.NETHERRACK);
  }
}
// Golden Roof Spire / Ornamentation at top (Y=36..38)
builder.fillBox(-8, 36, -24, 8, 36, -19, BLOCKS.GOLD_ORE);
builder.setVoxel(0, 37, -21, BLOCKS.GOLD_ORE);
builder.setVoxel(0, 38, -21, BLOCKS.SEA_LANTERN);

// 5. Spectator Bleachers & Viewing Stands (East & West)
// West Bleachers: X: -22 to -14, Z: -12 to 12
for (let row = 0; row < 5; row++) {
  const x = -14 - row * 2;
  const y = 21 + row;
  builder.fillBox(x - 1, 21, -12, x, y, 12, BLOCKS.STONE_BRICKS);
  builder.fillBox(x - 1, y, -12, x, y, 12, BLOCKS.OAK_PLANKS); // wooden seat
}
// East Bleachers: X: 14 to 22, Z: -12 to 12
for (let row = 0; row < 5; row++) {
  const x = 14 + row * 2;
  const y = 21 + row;
  builder.fillBox(x, 21, -12, x + 1, y, 12, BLOCKS.STONE_BRICKS);
  builder.fillBox(x, y, -12, x + 1, y, 12, BLOCKS.OAK_PLANKS); // wooden seat
}

// Colorful Tournament Banners over bleachers
const bannerColors = [BLOCKS.RED_WOOL, BLOCKS.YELLOW_WOOL, BLOCKS.BLUE_WOOL];
for (let z = -10; z <= 10; z += 4) {
  const col = bannerColors[Math.abs(z) % bannerColors.length];
  // West banner pole
  builder.fillBox(-23, 25, z, -23, 29, z, BLOCKS.OAK_LOG);
  builder.fillBox(-23, 28, z - 1, -23, 29, z + 1, col);
  // East banner pole
  builder.fillBox(23, 25, z, 23, 29, z, BLOCKS.OAK_LOG);
  builder.fillBox(23, 28, z - 1, 23, 29, z + 1, col);
}

// 6. Tropical Palm Trees in the Courtyard
const treeSpots = [
  [-12, 14], [12, 14], [-12, -14], [12, -14],
  [-24, 20], [24, 20], [-24, -20], [24, -20]
];
for (const [tx, tz] of treeSpots) {
  // Curved trunk
  builder.fillBox(tx, 21, tz, tx, 26, tz, BLOCKS.OAK_LOG);
  builder.setVoxel(tx + 1, 27, tz, BLOCKS.OAK_LOG);
  // Palm leaves canopy
  builder.fillBox(tx - 2, 28, tz - 2, tx + 4, 28, tz + 2, BLOCKS.OAK_LEAVES);
  builder.fillBox(tx - 3, 27, tz, tx + 5, 27, tz, BLOCKS.OAK_LEAVES);
  builder.fillBox(tx + 1, 27, tz - 3, tx + 1, 27, tz + 3, BLOCKS.OAK_LEAVES);
}

// 7. Perimeter Courtyard Wall with Stone Coping
builder.fillBox(-32, 21, -34, 32, 23, -34, BLOCKS.STONE_BRICKS);
builder.fillBox(-32, 21, 30, 32, 23, 30, BLOCKS.STONE_BRICKS);
builder.fillBox(-32, 21, -34, -32, 23, 30, BLOCKS.STONE_BRICKS);
builder.fillBox(32, 21, -34, 32, 23, 30, BLOCKS.STONE_BRICKS);
// South Entrance Gate (gap in south wall at X: -4..4)
builder.fillBox(-4, 21, 30, 4, 23, 30, BLOCKS.AIR);
builder.fillBox(-5, 21, 30, -5, 26, 30, BLOCKS.RED_WOOL);
builder.fillBox(5, 21, 30, 5, 26, 30, BLOCKS.RED_WOOL);
builder.fillBox(-5, 26, 30, 5, 27, 30, BLOCKS.GOLD_ORE);

// 8. RLE Encode All Generated Chunks
const chunksData = [];
for (const [key, voxels] of builder.chunks.entries()) {
  const [cx, cz] = key.split(',').map(Number);
  chunksData.push({
    cx,
    cz,
    voxels: encodeVoxelsRLE(voxels)
  });
}

// 9. Assemble Custom Mobs (Tournament Host & Spectators)
const mobsData = [
  {
    type: 'tournament_host',
    position: { x: 3.5, y: 24.0, z: 10.5 },
    yaw: 0,
    health: 100
  },
  // Friendly spectators in the bleachers
  {
    type: 'villager',
    position: { x: -16.0, y: 23.0, z: 0.0 },
    yaw: Math.PI / 2,
    health: 20
  },
  {
    type: 'villager',
    position: { x: -18.0, y: 24.0, z: 4.0 },
    yaw: Math.PI / 2,
    health: 20
  },
  {
    type: 'villager',
    position: { x: 16.0, y: 23.0, z: -2.0 },
    yaw: -Math.PI / 2,
    health: 20
  },
  {
    type: 'villager',
    position: { x: 18.0, y: 24.0, z: 3.0 },
    yaw: -Math.PI / 2,
    health: 20
  }
];

// 10. Player Hotbar and Inventory
const hotbar = Array(9).fill(null);
hotbar[0] = { id: 'diamond_sword', isBlock: false, count: 1 };
hotbar[1] = { id: 'golden_apple', isBlock: false, count: 16 };
hotbar[2] = { id: 'firework_rocket', isBlock: false, count: 64 };
hotbar[3] = { id: BLOCKS.GOLD_ORE, isBlock: true, count: 64 };
hotbar[4] = { id: BLOCKS.STONE_BRICKS, isBlock: true, count: 64 };

const storage = Array(27).fill(null);

// 11. Final Map Object
const tournamentMapData = {
  format: 'minecraft-web-map',
  version: 1,
  name: 'World Martial Arts Tournament',
  savedAt: new Date().toISOString(),
  seed: 777777,
  worldTime: 6000, // Bright sunny midday
  weather: {
    isRaining: false,
    rainIntensity: 0
  },
  player: {
    position: { x: 0.0, y: 24.0, z: 16.0 }, // Standing in front of south stairs facing stage
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 3.14159, // Looking directly north towards the stage and host
    pitch: 0,
    gamemode: 'creative',
    health: 20,
    hunger: 20,
    exp: 100,
    level: 10
  },
  inventory: {
    hotbar,
    storage,
    activeSlot: 0
  },
  chunks: chunksData,
  mobs: mobsData,
  gemini: {
    builtStructures: [
      {
        id: 'tournament_arena_1',
        name: 'World Martial Arts Tournament',
        type: 'tournament_arena',
        min: { x: -32, y: 20, z: -34 },
        max: { x: 32, y: 38, z: 30 },
        center: { x: 0, y: 24, z: 0 },
        createdPrompt: 'Dragon Ball World Martial Arts Tournament (Tenkaichi Budokai)',
        timestamp: Date.now()
      }
    ],
    lastBuiltStructure: 'tournament_arena_1',
    conversationHistory: []
  }
};

// 12. Save Map to default saves location
const defaultSaveDir = path.resolve(__dirname, '..', 'saves');
if (!fs.existsSync(defaultSaveDir)) {
  fs.mkdirSync(defaultSaveDir, { recursive: true });
}

const outputPath = path.join(defaultSaveDir, 'World_Martial_Arts_Tournament.json');
fs.writeFileSync(outputPath, JSON.stringify(tournamentMapData, null, 2), 'utf-8');

console.log(`Successfully generated and saved tournament map to: ${outputPath}`);
console.log(`Total Chunks: ${chunksData.length}, Total Mobs: ${mobsData.length}`);
