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

// World grid container using the EXACT indexing formula from Chunk in world.js
class WorldBuilder {
  constructor() {
    this.chunks = new Map();
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
    // CRITICAL: Must match Chunk.getIndex(lx, ly, lz) = (ly * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx
    const idx = (y * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
    chunk[idx] = blockId;
  }

  getVoxel(x, y, z) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return BLOCKS.AIR;
    const cx = Math.floor(x / CHUNK_SIZE_X);
    const cz = Math.floor(z / CHUNK_SIZE_Z);
    const lx = ((x % CHUNK_SIZE_X) + CHUNK_SIZE_X) % CHUNK_SIZE_X;
    const lz = ((z % CHUNK_SIZE_Z) + CHUNK_SIZE_Z) % CHUNK_SIZE_Z;
    const chunk = this.getChunk(cx, cz);
    const idx = (y * CHUNK_SIZE_Z + lz) * CHUNK_SIZE_X + lx;
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

console.log('Building authentic Dragon Ball World Martial Arts Tournament Map (Tenkaichi Budokai)...');
const builder = new WorldBuilder();

// 1. Terrain Base (Chunks CX: -2..2, CZ: -2..2 -> X: -36..36, Z: -36..36)
// NO ceiling stone! Y=21..63 is open air.
const minX = -36;
const maxX = 36;
const minZ = -36;
const maxZ = 36;

for (let x = minX; x <= maxX; x++) {
  for (let z = minZ; z <= maxZ; z++) {
    builder.setVoxel(x, 0, z, BLOCKS.BEDROCK);
    for (let y = 1; y <= 15; y++) {
      builder.setVoxel(x, y, z, BLOCKS.STONE);
    }
    for (let y = 16; y <= 19; y++) {
      builder.setVoxel(x, y, z, BLOCKS.DIRT);
    }
    // Ground level at Y=20
    const dist = Math.hypot(x, z);
    if (dist < 26) {
      // Paved courtyard in front of and around the stage
      if (Math.abs(x) <= 3 || z >= 9 || (Math.abs(x) >= 9 && Math.abs(x) <= 12)) {
        builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
      } else {
        builder.setVoxel(x, 20, z, BLOCKS.COBBLESTONE);
      }
    } else {
      builder.setVoxel(x, 20, z, BLOCKS.GRASS);
    }
  }
}

// 2. The Tournament Fighting Stage (Exact match to Dragon Ball Screenshot 2 & 3)
// 16x16 square elevated stage: X: -8 to 8, Z: -8 to 8
// Elevated 4 blocks above ground (ground Y=20, stage top Y=24)

// Foundation interior (solid stone)
builder.fillBox(-8, 21, -8, 8, 23, 8, BLOCKS.STONE);

// Blue vertical base rim (Screenshot 2 & 3: solid blue vertical wall on all 4 sides)
builder.fillBox(-8, 21, -8, 8, 23, -8, BLOCKS.BLUE_WOOL); // North edge
builder.fillBox(-8, 21, 8, 8, 23, 8, BLOCKS.BLUE_WOOL);   // South edge
builder.fillBox(-8, 21, -8, -8, 23, 8, BLOCKS.BLUE_WOOL); // West edge
builder.fillBox(8, 21, -8, 8, 23, 8, BLOCKS.BLUE_WOOL);  // East edge

// Stage Surface (Y = 24):
// Outer perimeter has a thin red edge lip (just like Screenshot 2 & 3)
for (let x = -8; x <= 8; x++) {
  for (let z = -8; z <= 8; z++) {
    const isEdge = (Math.abs(x) === 8 || Math.abs(z) === 8);
    if (isEdge) {
      builder.setVoxel(x, 24, z, BLOCKS.RED_WOOL); // Red rim lip
    } else {
      // Light gray tiled floor with grid lines
      const isGrid = (x % 2 === 0 || z % 2 === 0);
      builder.setVoxel(x, 24, z, isGrid ? BLOCKS.STONE_BRICKS : BLOCKS.STONE);
    }
  }
}

// 3. Center Entrance Stairs from Stage into Gate (Z: -8 to -13, X: -2 to 2)
// In Screenshot 2 & 3, purple/stone steps lead up from the back of the stage into the red gateway
for (let step = 0; step < 4; step++) {
  const z = -9 - step;
  const y = 24 + step;
  builder.fillBox(-2, 21, z, 2, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-2, y, z, 2, y, z, BLOCKS.SANDSTONE); // step tread
}

// 4. Red Gateway & Demon Monster Wall Reliefs (Screenshot 2 & 3)
// Located at Z: -13 to -16, X: -12 to 12
// Gateposts framing the center entrance
builder.fillBox(-3, 24, -14, -3, 30, -14, BLOCKS.STONE_BRICKS);
builder.fillBox(3, 24, -14, 3, 30, -14, BLOCKS.STONE_BRICKS);
builder.setVoxel(-3, 31, -14, BLOCKS.RED_WOOL);
builder.setVoxel(3, 31, -14, BLOCKS.RED_WOOL);

// Gate Arch / Lintel
builder.fillBox(-3, 29, -14, 3, 29, -14, BLOCKS.RED_WOOL);
builder.fillBox(-3, 30, -14, 3, 30, -14, BLOCKS.STONE_BRICKS);

// Red walls on left (X: -11 to -4) and right (X: 4 to 11) at Z = -14
// Wall foundation (Y = 24..27)
builder.fillBox(-11, 21, -14, -4, 27, -14, BLOCKS.RED_WOOL);
builder.fillBox(4, 21, -14, 11, 27, -14, BLOCKS.RED_WOOL);
// Sandstone / white border frame around the red wall panels
builder.fillBox(-11, 27, -14, -4, 27, -14, BLOCKS.SANDSTONE);
builder.fillBox(4, 27, -14, 11, 27, -14, BLOCKS.SANDSTONE);
builder.fillBox(-12, 21, -14, -12, 28, -14, BLOCKS.STONE_BRICKS);
builder.fillBox(12, 21, -14, 12, 28, -14, BLOCKS.STONE_BRICKS);

// Demon Head Reliefs on the red walls (Screenshot 2 & 3)
// Left demon head at X = -7..-9, Y = 24..26
builder.fillBox(-9, 24, -13, -7, 26, -13, BLOCKS.STONE);
builder.setVoxel(-8, 25, -13, BLOCKS.COBBLESTONE); // nose/snout
builder.setVoxel(-9, 26, -13, BLOCKS.BLACK_WOOL);  // left eye
builder.setVoxel(-7, 26, -13, BLOCKS.BLACK_WOOL);  // right eye
builder.setVoxel(-10, 27, -14, BLOCKS.WHITE_WOOL); // left horn
builder.setVoxel(-6, 27, -14, BLOCKS.WHITE_WOOL);  // right horn

// Right demon head at X = 7..9, Y = 24..26
builder.fillBox(7, 24, -13, 9, 26, -13, BLOCKS.STONE);
builder.setVoxel(8, 25, -13, BLOCKS.COBBLESTONE);  // nose/snout
builder.setVoxel(7, 26, -13, BLOCKS.BLACK_WOOL);   // left eye
builder.setVoxel(9, 26, -13, BLOCKS.BLACK_WOOL);   // right eye
builder.setVoxel(6, 27, -14, BLOCKS.WHITE_WOOL);   // left horn
builder.setVoxel(10, 27, -14, BLOCKS.WHITE_WOOL);  // right horn

// 5. The Main Tournament House (Screenshot 2 & 3)
// Located at Z: -16 to -27, X: -18 to 18
// White walls (Y = 24..28)
builder.fillBox(-18, 21, -27, 18, 28, -27, BLOCKS.WHITE_WOOL); // Back wall
builder.fillBox(-18, 21, -26, -18, 28, -16, BLOCKS.WHITE_WOOL); // West wall
builder.fillBox(18, 21, -26, 18, 28, -16, BLOCKS.WHITE_WOOL);  // East wall
builder.fillBox(-18, 21, -16, 18, 28, -16, BLOCKS.WHITE_WOOL);  // Front wall

// Red horizontal accent band on the white wall (Y = 28)
builder.fillBox(-18, 28, -16, 18, 28, -16, BLOCKS.RED_WOOL);
builder.fillBox(-18, 28, -27, 18, 28, -27, BLOCKS.RED_WOOL);

// Blue rectangular windows (Screenshot 2 & 3) at Y = 26
builder.fillBox(-14, 26, -16, -11, 26, -16, BLOCKS.BLUE_WOOL);
builder.fillBox(-7, 26, -16, -4, 26, -16, BLOCKS.BLUE_WOOL);
builder.fillBox(4, 26, -16, 7, 26, -16, BLOCKS.BLUE_WOOL);
builder.fillBox(11, 26, -16, 14, 26, -16, BLOCKS.BLUE_WOOL);

// 6. Thatched Straw Roof (Golden-Brown / Amber, Screenshot 2 & 3)
// Slopes upwards from Y = 29 to Y = 34
for (let layer = 0; layer < 6; layer++) {
  const y = 29 + layer;
  const xSpan = 20 - layer * 2;
  const zMin = -28 + layer;
  const zMax = -15 - layer;
  for (let x = -xSpan; x <= xSpan; x++) {
    for (let z = zMin; z <= zMax; z++) {
      const isPerimeter = (Math.abs(x) === xSpan || z === zMin || z === zMax);
      // Outer perimeter is golden sandstone thatch, interior is oak planks
      builder.setVoxel(x, y, z, isPerimeter ? BLOCKS.SANDSTONE : BLOCKS.OAK_PLANKS);
    }
  }
}

// 7. Center Upper Roof Cupola with White Horns (Screenshot 2 & 3)
// At Y = 35..37, X: -6 to 6, Z: -23 to -19
builder.fillBox(-6, 35, -23, 6, 36, -19, BLOCKS.SANDSTONE);
builder.fillBox(-5, 37, -22, 5, 37, -20, BLOCKS.OAK_PLANKS);

// White Crescent Horns pointing upwards on cupola top
// Left horn
builder.setVoxel(-4, 37, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(-5, 38, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(-6, 39, -21, BLOCKS.WHITE_WOOL);
// Right horn
builder.setVoxel(4, 37, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(5, 38, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(6, 39, -21, BLOCKS.WHITE_WOOL);

// 8. Spectator Bleachers (East & West)
// West Bleachers: X: -24 to -14, Z: -12 to 12
for (let r = 0; r < 5; r++) {
  const x = -14 - r * 2;
  const y = 21 + r;
  builder.fillBox(x - 1, 21, -12, x, y, 12, BLOCKS.STONE_BRICKS);
  builder.fillBox(x - 1, y, -12, x, y, 12, BLOCKS.OAK_PLANKS); // wooden seating bench
}
// East Bleachers: X: 14 to 24, Z: -12 to 12
for (let r = 0; r < 5; r++) {
  const x = 14 + r * 2;
  const y = 21 + r;
  builder.fillBox(x, 21, -12, x + 1, y, 12, BLOCKS.STONE_BRICKS);
  builder.fillBox(x, y, -12, x + 1, y, 12, BLOCKS.OAK_PLANKS); // wooden seating bench
}

// 9. Tropical Palm Trees flanking the pavilion (Screenshot 2 & 3)
const palmSpots = [
  [-22, -18], [-26, -22], [-20, -28],
  [22, -18], [26, -22], [20, -28],
  [-24, 14], [24, 14]
];
for (const [px, pz] of palmSpots) {
  builder.fillBox(px, 21, pz, px, 27, pz, BLOCKS.OAK_LOG);
  builder.fillBox(px - 2, 28, pz - 2, px + 2, 28, pz + 2, BLOCKS.OAK_LEAVES);
  builder.fillBox(px - 3, 27, pz, px + 3, 27, pz, BLOCKS.OAK_LEAVES);
  builder.fillBox(px, 27, pz - 3, px, 27, pz + 3, BLOCKS.OAK_LEAVES);
}

// 10. Low Courtyard Perimeter Wall
builder.fillBox(-30, 21, 28, 30, 23, 28, BLOCKS.STONE_BRICKS);
builder.fillBox(-30, 24, 28, 30, 24, 28, BLOCKS.SANDSTONE); // coping
// South Entrance Gap
builder.fillBox(-4, 21, 28, 4, 24, 28, BLOCKS.AIR);

// 11. RLE Encode All Generated Chunks
const chunksData = [];
for (const [key, voxels] of builder.chunks.entries()) {
  const [cx, cz] = key.split(',').map(Number);
  chunksData.push({
    cx,
    cz,
    voxels: encodeVoxelsRLE(voxels)
  });
}

// 12. Custom Mobs (Host standing proudly facing the stage, Spectators)
const mobsData = [
  {
    type: 'tournament_host',
    position: { x: 0.0, y: 24.0, z: -8.0 }, // Standing on stage in front of the gate (Screenshot 3)
    yaw: 0,
    health: 100
  },
  // Friendly spectators in the bleachers
  { type: 'villager', position: { x: -16.0, y: 23.0, z: -4.0 }, yaw: Math.PI / 2, health: 20 },
  { type: 'villager', position: { x: -18.0, y: 24.0, z: 2.0 }, yaw: Math.PI / 2, health: 20 },
  { type: 'villager', position: { x: 16.0, y: 23.0, z: -2.0 }, yaw: -Math.PI / 2, health: 20 },
  { type: 'villager', position: { x: 18.0, y: 24.0, z: 5.0 }, yaw: -Math.PI / 2, health: 20 }
];

// 13. Player Inventory
const hotbar = Array(9).fill(null);
hotbar[0] = { id: 'diamond_sword', isBlock: false, count: 1 };
hotbar[1] = { id: 'golden_apple', isBlock: false, count: 16 };
hotbar[2] = { id: 'firework_rocket', isBlock: false, count: 64 };
hotbar[3] = { id: BLOCKS.GOLD_ORE, isBlock: true, count: 64 };
hotbar[4] = { id: BLOCKS.STONE_BRICKS, isBlock: true, count: 64 };

const storage = Array(27).fill(null);

// 14. Final Map Object
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
    position: { x: 0.0, y: 24.0, z: 12.0 }, // Standing in front of the stage looking north at the host and building
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 3.14159, // Looking north
    pitch: -0.05,
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
        min: { x: -30, y: 20, z: -28 },
        max: { x: 30, y: 39, z: 28 },
        center: { x: 0, y: 24, z: 0 },
        createdPrompt: 'Dragon Ball World Martial Arts Tournament (Tenkaichi Budokai)',
        timestamp: Date.now()
      }
    ],
    lastBuiltStructure: 'tournament_arena_1',
    conversationHistory: []
  }
};

// 15. Save Map File directly in default saves directory
const defaultSaveDir = path.resolve(__dirname, '..', 'saves');
if (!fs.existsSync(defaultSaveDir)) {
  fs.mkdirSync(defaultSaveDir, { recursive: true });
}

const outputPath = path.join(defaultSaveDir, 'World_Martial_Arts_Tournament.json');
fs.writeFileSync(outputPath, JSON.stringify(tournamentMapData, null, 2), 'utf-8');

console.log(`Successfully generated and saved tournament map to: ${outputPath}`);
console.log(`Total Chunks: ${chunksData.length}, Total Mobs: ${mobsData.length}`);
