import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Blocks definitions matching src/blocks.js
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

// World grid container using the EXACT indexing formula from Chunk in world.js: (ly * 16 + lz) * 16 + lx
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

console.log('Generating Dragon Ball World Martial Arts Tournament Map with 4 Training Sites...');
const builder = new WorldBuilder();

// 1. Terrain Base (Chunks covering X: -72..72, Z: -72..72)
// Bedrock at Y=0, Stone at Y=1..15, Dirt at Y=16..19, Ground surface at Y=20.
// Open air above Y=20 (NO stone ceiling).
const minX = -72;
const maxX = 72;
const minZ = -72;
const maxZ = 72;

for (let x = minX; x <= maxX; x++) {
  for (let z = minZ; z <= maxZ; z++) {
    builder.setVoxel(x, 0, z, BLOCKS.BEDROCK);
    for (let y = 1; y <= 15; y++) {
      builder.setVoxel(x, y, z, BLOCKS.STONE);
    }
    for (let y = 16; y <= 19; y++) {
      builder.setVoxel(x, y, z, BLOCKS.DIRT);
    }

    // Default surface: Grass
    builder.setVoxel(x, 20, z, BLOCKS.GRASS);

    // Central Arena courtyard
    const dist = Math.hypot(x, z);
    if (dist < 26) {
      if (Math.abs(x) <= 3 || z >= 9 || (Math.abs(x) >= 9 && Math.abs(x) <= 12)) {
        builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
      } else {
        builder.setVoxel(x, 20, z, BLOCKS.COBBLESTONE);
      }
    }

    // Connecting stone walkways from central courtyard to the 4 training sites
    // South walkway (to Parkour Park)
    if (Math.abs(x) <= 2 && z >= 24 && z <= 32) {
      builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
    }
    // East walkway (to Punching Yard)
    if (Math.abs(z) <= 2 && x >= 24 && x <= 32) {
      builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
    }
    // West walkway (to Kamehameha Range)
    if (Math.abs(z) <= 2 && x <= -24 && x >= -32) {
      builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
    }
    // North walkway (around pavilion to Genki Dama Crater)
    if (Math.abs(x) <= 2 && z <= -26 && z >= -34) {
      builder.setVoxel(x, 20, z, BLOCKS.SANDSTONE);
    }
  }
}

// ========================================================
// 2. CENTRAL WORLD MARTIAL ARTS TOURNAMENT ARENA
// ========================================================
// 16x16 square elevated stage: X: -8 to 8, Z: -8 to 8, elevated to Y=24
builder.fillBox(-8, 21, -8, 8, 23, 8, BLOCKS.STONE);

// Blue vertical base rim (all 4 sides)
builder.fillBox(-8, 21, -8, 8, 23, -8, BLOCKS.BLUE_WOOL); // North edge
builder.fillBox(-8, 21, 8, 8, 23, 8, BLOCKS.BLUE_WOOL);   // South edge
builder.fillBox(-8, 21, -8, -8, 23, 8, BLOCKS.BLUE_WOOL); // West edge
builder.fillBox(8, 21, -8, 8, 23, 8, BLOCKS.BLUE_WOOL);  // East edge

// Stage Surface (Y = 24)
for (let x = -8; x <= 8; x++) {
  for (let z = -8; z <= 8; z++) {
    const isEdge = (Math.abs(x) === 8 || Math.abs(z) === 8);
    if (isEdge) {
      builder.setVoxel(x, 24, z, BLOCKS.RED_WOOL); // Red rim lip
    } else {
      const isGrid = (x % 2 === 0 || z % 2 === 0);
      builder.setVoxel(x, 24, z, isGrid ? BLOCKS.STONE_BRICKS : BLOCKS.STONE);
    }
  }
}

// Center Entrance Stairs from Stage into Gate (Z: -8 to -13, X: -2 to 2)
for (let step = 0; step < 4; step++) {
  const z = -9 - step;
  const y = 24 + step;
  builder.fillBox(-2, 21, z, 2, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-2, y, z, 2, y, z, BLOCKS.SANDSTONE);
}

// Grand Access Stairs from Courtyard (Y=20) up to Stage Surface (Y=24)
// 1. South Stage Stairs (facing entrance and announcer)
for (let step = 0; step < 4; step++) {
  const z = 9 + step;
  const y = 23 - step;
  builder.fillBox(-4, 20, z, 4, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-4, y, z, 4, y, z, BLOCKS.SANDSTONE);
}
builder.fillBox(-4, 24, 8, 4, 24, 8, BLOCKS.STONE_BRICKS); // Clear red rim for smooth south walk-in

// 2. East Stage Stairs (facing Punching Yard)
for (let step = 0; step < 4; step++) {
  const x = 9 + step;
  const y = 23 - step;
  builder.fillBox(x, 20, -4, x, y, 4, BLOCKS.STONE_BRICKS);
  builder.fillBox(x, y, -4, x, y, 4, BLOCKS.SANDSTONE);
}
builder.fillBox(8, 24, -4, 8, 24, 4, BLOCKS.STONE_BRICKS); // Clear red rim for smooth east walk-in

// 3. West Stage Stairs (facing Kamehameha Range)
for (let step = 0; step < 4; step++) {
  const x = -9 - step;
  const y = 23 - step;
  builder.fillBox(x, 20, -4, x, y, 4, BLOCKS.STONE_BRICKS);
  builder.fillBox(x, y, -4, x, y, 4, BLOCKS.SANDSTONE);
}
builder.fillBox(-8, 24, -4, -8, 24, 4, BLOCKS.STONE_BRICKS); // Clear red rim for smooth west walk-in

// Red Gateway & Demon Monster Wall Reliefs (Z: -13 to -16, X: -12 to 12)
builder.fillBox(-3, 24, -14, -3, 30, -14, BLOCKS.STONE_BRICKS);
builder.fillBox(3, 24, -14, 3, 30, -14, BLOCKS.STONE_BRICKS);
builder.setVoxel(-3, 31, -14, BLOCKS.RED_WOOL);
builder.setVoxel(3, 31, -14, BLOCKS.RED_WOOL);
builder.fillBox(-3, 29, -14, 3, 29, -14, BLOCKS.RED_WOOL);
builder.fillBox(-3, 30, -14, 3, 30, -14, BLOCKS.STONE_BRICKS);

// Red walls on left and right
builder.fillBox(-11, 21, -14, -4, 27, -14, BLOCKS.RED_WOOL);
builder.fillBox(4, 21, -14, 11, 27, -14, BLOCKS.RED_WOOL);
builder.fillBox(-11, 27, -14, -4, 27, -14, BLOCKS.SANDSTONE);
builder.fillBox(4, 27, -14, 11, 27, -14, BLOCKS.SANDSTONE);
builder.fillBox(-12, 21, -14, -12, 28, -14, BLOCKS.STONE_BRICKS);
builder.fillBox(12, 21, -14, 12, 28, -14, BLOCKS.STONE_BRICKS);

// Demon Head Reliefs
// Left demon head
builder.fillBox(-9, 24, -13, -7, 26, -13, BLOCKS.STONE);
builder.setVoxel(-8, 25, -13, BLOCKS.COBBLESTONE);
builder.setVoxel(-9, 26, -13, BLOCKS.BLACK_WOOL);
builder.setVoxel(-7, 26, -13, BLOCKS.BLACK_WOOL);
builder.setVoxel(-10, 27, -14, BLOCKS.WHITE_WOOL);
builder.setVoxel(-6, 27, -14, BLOCKS.WHITE_WOOL);
// Right demon head
builder.fillBox(7, 24, -13, 9, 26, -13, BLOCKS.STONE);
builder.setVoxel(8, 25, -13, BLOCKS.COBBLESTONE);
builder.setVoxel(7, 26, -13, BLOCKS.BLACK_WOOL);
builder.setVoxel(9, 26, -13, BLOCKS.BLACK_WOOL);
builder.setVoxel(6, 27, -14, BLOCKS.WHITE_WOOL);
builder.setVoxel(10, 27, -14, BLOCKS.WHITE_WOOL);

// Main Tournament House (Z: -16 to -27, X: -18 to 18)
builder.fillBox(-18, 21, -27, 18, 28, -27, BLOCKS.WHITE_WOOL);
builder.fillBox(-18, 21, -26, -18, 28, -16, BLOCKS.WHITE_WOOL);
builder.fillBox(18, 21, -26, 18, 28, -16, BLOCKS.WHITE_WOOL);
builder.fillBox(-18, 21, -16, 18, 28, -16, BLOCKS.WHITE_WOOL);

// Red horizontal band
builder.fillBox(-18, 28, -16, 18, 28, -16, BLOCKS.RED_WOOL);
builder.fillBox(-18, 28, -27, 18, 28, -27, BLOCKS.RED_WOOL);

// Windows
builder.fillBox(-14, 26, -16, -11, 26, -16, BLOCKS.BLUE_WOOL);
builder.fillBox(-7, 26, -16, -4, 26, -16, BLOCKS.BLUE_WOOL);
builder.fillBox(4, 26, -16, 7, 26, -16, BLOCKS.BLUE_WOOL);
builder.fillBox(11, 26, -16, 14, 26, -16, BLOCKS.BLUE_WOOL);

// Thatched Roof
for (let layer = 0; layer < 6; layer++) {
  const y = 29 + layer;
  const xSpan = 20 - layer * 2;
  const zMin = -28 + layer;
  const zMax = -15 - layer;
  for (let x = -xSpan; x <= xSpan; x++) {
    for (let z = zMin; z <= zMax; z++) {
      const isPerimeter = (Math.abs(x) === xSpan || z === zMin || z === zMax);
      builder.setVoxel(x, y, z, isPerimeter ? BLOCKS.SANDSTONE : BLOCKS.OAK_PLANKS);
    }
  }
}

// Center Upper Roof Cupola with White Horns
builder.fillBox(-6, 35, -23, 6, 36, -19, BLOCKS.SANDSTONE);
builder.fillBox(-5, 37, -22, 5, 37, -20, BLOCKS.OAK_PLANKS);
// Horns
builder.setVoxel(-4, 37, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(-5, 38, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(-6, 39, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(4, 37, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(5, 38, -21, BLOCKS.WHITE_WOOL);
builder.setVoxel(6, 39, -21, BLOCKS.WHITE_WOOL);

// Spectator Bleachers
for (let r = 0; r < 5; r++) {
  const x = -14 - r * 2;
  const y = 21 + r;
  builder.fillBox(x - 1, 21, -12, x, y, 12, BLOCKS.STONE_BRICKS);
  builder.fillBox(x - 1, y, -12, x, y, 12, BLOCKS.OAK_PLANKS);
}
for (let r = 0; r < 5; r++) {
  const x = 14 + r * 2;
  const y = 21 + r;
  builder.fillBox(x, 21, -12, x + 1, y, 12, BLOCKS.STONE_BRICKS);
  builder.fillBox(x, y, -12, x + 1, y, 12, BLOCKS.OAK_PLANKS);
}

// Palm Trees around the courtyard
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

// Low Courtyard Perimeter Wall
builder.fillBox(-30, 21, 28, 30, 23, 28, BLOCKS.STONE_BRICKS);
builder.fillBox(-30, 24, 28, 30, 24, 28, BLOCKS.SANDSTONE);
builder.fillBox(-4, 21, 28, 4, 24, 28, BLOCKS.AIR); // South opening

// ========================================================
// 3. SITE 1: SOUTH - PARKOUR TRAINING GROUND (Z: 30..70, X: -16..16)
// ========================================================
console.log('Building Site 1: South Parkour Park...');
// Starting Entrance Terrace (Z: 30..33, X: -6..6)
builder.fillBox(-6, 21, 30, 6, 21, 33, BLOCKS.SANDSTONE);

// Entrance stairs from Courtyard walkway (Y=20) up to Terrace (Y=21)
builder.fillBox(-4, 20, 28, 4, 20, 28, BLOCKS.SANDSTONE);
builder.fillBox(-4, 20, 29, 4, 21, 29, BLOCKS.SANDSTONE);

// Torii Entrance Gateposts
builder.fillBox(-4, 21, 31, -4, 26, 31, BLOCKS.RED_WOOL);
builder.fillBox(4, 21, 31, 4, 26, 31, BLOCKS.RED_WOOL);
builder.fillBox(-5, 26, 31, 5, 26, 31, BLOCKS.RED_WOOL);
builder.fillBox(-6, 27, 31, 6, 27, 31, BLOCKS.GOLD_ORE);

// Deep Parkour Water Basin below (X: -14..14, Z: 34..68, sunken to Y=17..19, filled with water)
builder.fillBox(-15, 17, 33, 15, 17, 69, BLOCKS.STONE_BRICKS); // basin floor
builder.fillBox(-15, 18, 33, 15, 20, 69, BLOCKS.WATER);        // deep water pool
// Basin perimeter walls
builder.fillBox(-15, 18, 33, -15, 21, 69, BLOCKS.STONE_BRICKS);
builder.fillBox(15, 18, 33, 15, 21, 69, BLOCKS.STONE_BRICKS);
builder.fillBox(-15, 18, 69, 15, 21, 69, BLOCKS.STONE_BRICKS);

// Basin Exit Stairs: easy staircase out of water basin back up to starting terrace (Y=18 to Y=21)
for (let step = 0; step < 4; step++) {
  const z = 33 + step;
  const y = 21 - step;
  builder.fillBox(-3, 17, z, 3, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-3, y, z, 3, y, z, BLOCKS.SANDSTONE);
}
// Basin Side Staircases (along West and East walls so players can climb out anywhere)
for (let step = 0; step < 4; step++) {
  const z = 35 + step;
  const y = 21 - step;
  builder.fillBox(-14, 17, z, -13, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-14, y, z, -13, y, z, BLOCKS.SANDSTONE);
  builder.fillBox(13, 17, z, 14, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(13, y, z, 14, y, z, BLOCKS.SANDSTONE);
}

// Parkour Jumps (Challenging elevation and gap progression)
// Jump 1: X=0, Z=36, Y=22 (Sandstone 2x2)
builder.fillBox(-1, 18, 36, 1, 22, 37, BLOCKS.SANDSTONE);
builder.fillBox(-1, 22, 36, 1, 22, 37, BLOCKS.OAK_PLANKS);

// Jump 2: X=3, Z=41, Y=23 (Stone Bricks 2x2)
builder.fillBox(2, 18, 40, 4, 23, 41, BLOCKS.STONE_BRICKS);

// Jump 3: X=-3, Z=45, Y=24 (Oak Planks 2x2)
builder.fillBox(-4, 18, 44, -2, 24, 45, BLOCKS.OAK_PLANKS);

// Jump 4: X=1, Z=49, Y=25 (Gold Ore 1x1 precision jump)
builder.fillBox(1, 18, 49, 1, 25, 49, BLOCKS.GOLD_ORE);

// Jump 5: X=-4, Z=53, Y=25 (Sandstone 2x1)
builder.fillBox(-4, 18, 53, -3, 25, 53, BLOCKS.SANDSTONE);

// Jump 6: X=0, Z=57, Y=26 (Red Wool 1x1)
builder.fillBox(0, 18, 57, 0, 26, 57, BLOCKS.RED_WOOL);

// Jump 7: X=4, Z=61, Y=27 (Sea Lantern 1x1 glowing leap)
builder.fillBox(4, 18, 61, 4, 27, 61, BLOCKS.SEA_LANTERN);

// Final Victory Platform (X: -3..3, Z: 64..68, Y: 28)
builder.fillBox(-3, 18, 64, 3, 28, 68, BLOCKS.STONE_BRICKS);
builder.fillBox(-3, 28, 64, 3, 28, 68, BLOCKS.SANDSTONE);
// Golden Beacon Tower
builder.fillBox(-1, 29, 66, 1, 33, 66, BLOCKS.GOLD_ORE);
builder.setVoxel(0, 34, 66, BLOCKS.SEA_LANTERN);
builder.setVoxel(0, 35, 66, BLOCKS.GLOWSTONE);

// ========================================================
// 4. SITE 2: EAST - PUNCHING TRAINING SITE (X: 30..70, Z: -16..16)
// ========================================================
console.log('Building Site 2: East Punching Combat Yard...');
// Entrance Platform at X: 30..33, Z: -4..4, Y=21
builder.fillBox(30, 21, -4, 33, 21, 4, BLOCKS.SANDSTONE);

// Entrance Stairs from Courtyard walkway (Y=20) up to Dojo Gate (Y=21)
builder.fillBox(28, 20, -4, 28, 20, 4, BLOCKS.SANDSTONE);
builder.fillBox(29, 20, -4, 29, 21, 4, BLOCKS.SANDSTONE);

// Dojo Gate
builder.fillBox(31, 21, -4, 31, 26, -4, BLOCKS.OAK_LOG);
builder.fillBox(31, 21, 4, 31, 26, 4, BLOCKS.OAK_LOG);
builder.fillBox(31, 26, -4, 31, 26, 4, BLOCKS.OAK_PLANKS);

// Clear, step-free passage from Dojo Gate straight into the Sparring Yard (X: 33..36, Z: -4..4)
builder.fillBox(33, 20, -4, 36, 21, 4, BLOCKS.SANDSTONE);

// Wide Sparring Arena (X: 36..66, Z: -14..14, floor Y=20..21)
builder.fillBox(36, 21, -14, 66, 21, 14, BLOCKS.SAND); // Sand sparring pit
// Border curb around the combat yard with stepping stones
for (let x = 35; x <= 67; x++) {
  builder.setVoxel(x, 22, -15, BLOCKS.STONE_BRICKS);
  builder.setVoxel(x, 22, 15, BLOCKS.STONE_BRICKS);
  builder.setVoxel(x, 21, -16, BLOCKS.STONE_BRICKS);
  builder.setVoxel(x, 21, 16, BLOCKS.STONE_BRICKS);
}
for (let z = -15; z <= 15; z++) {
  builder.setVoxel(67, 22, z, BLOCKS.STONE_BRICKS);
  builder.setVoxel(68, 21, z, BLOCKS.STONE_BRICKS);
}

// Punching Practice Dummies (Oak logs + wool head)
const dummySpots = [
  [40, -8], [40, 8], [48, -10], [48, 10], [58, -8], [58, 8]
];
for (const [dx, dz] of dummySpots) {
  builder.setVoxel(dx, 22, dz, BLOCKS.OAK_LOG);
  builder.setVoxel(dx, 23, dz, BLOCKS.OAK_LOG);
  builder.setVoxel(dx, 24, dz, BLOCKS.YELLOW_WOOL);
}

// Corner Torches / Sea Lanterns for bright lighting
builder.fillBox(36, 22, -14, 36, 24, -14, BLOCKS.STONE_BRICKS);
builder.setVoxel(36, 25, -14, BLOCKS.GLOWSTONE);
builder.fillBox(36, 22, 14, 36, 24, 14, BLOCKS.STONE_BRICKS);
builder.setVoxel(36, 25, 14, BLOCKS.GLOWSTONE);
builder.fillBox(66, 22, -14, 66, 24, -14, BLOCKS.STONE_BRICKS);
builder.setVoxel(66, 25, -14, BLOCKS.GLOWSTONE);
builder.fillBox(66, 22, 14, 66, 24, 14, BLOCKS.STONE_BRICKS);
builder.setVoxel(66, 25, 14, BLOCKS.GLOWSTONE);

// ========================================================
// 5. SITE 3: WEST - KAMEHAMEHA TARGET RANGE (X: -70..-30, Z: -16..16)
// ========================================================
console.log('Building Site 3: West Kamehameha Target Range...');
// Elevated Firing Platform (X: -35..-31, Z: -6..6, Y=22)
builder.fillBox(-35, 21, -6, -31, 22, 6, BLOCKS.STONE_BRICKS);
builder.fillBox(-34, 22, -5, -31, 22, 5, BLOCKS.SANDSTONE);

// Entrance Stairs from Courtyard walkway (Y=20) up to Elevated Firing Platform (Y=22)
builder.fillBox(-29, 20, -4, -29, 20, 4, BLOCKS.SANDSTONE);
builder.fillBox(-30, 20, -4, -30, 21, 4, BLOCKS.STONE_BRICKS);
builder.fillBox(-30, 21, -4, -30, 21, 4, BLOCKS.SANDSTONE);

// Descending Stairs from Firing Platform (Y=22) down into Target Shooting Lane (Y=20)
builder.fillBox(-36, 20, -4, -36, 21, 4, BLOCKS.STONE_BRICKS);
builder.fillBox(-36, 21, -4, -36, 21, 4, BLOCKS.SANDSTONE);
builder.fillBox(-37, 20, -4, -37, 20, 4, BLOCKS.SANDSTONE);

// Firing station canopy / banner posts
builder.fillBox(-31, 23, -5, -31, 27, -5, BLOCKS.BLUE_WOOL);
builder.fillBox(-31, 23, 5, -31, 27, 5, BLOCKS.BLUE_WOOL);
builder.fillBox(-31, 27, -5, -31, 27, 5, BLOCKS.BLUE_WOOL);

// Long Firing Range Floor (X: -68..-36, Z: -12..12)
builder.fillBox(-68, 20, -12, -36, 20, 12, BLOCKS.STONE_BRICKS);
// Luminous Blue Guiding Strips down the target lane
for (let x = -68; x <= -36; x++) {
  builder.setVoxel(x, 21, -12, BLOCKS.BLUE_WOOL);
  builder.setVoxel(x, 21, 12, BLOCKS.BLUE_WOOL);
  if (x % 3 === 0) {
    builder.setVoxel(x, 21, 0, BLOCKS.SEA_LANTERN);
  }
}

// Distance Marker Lines:
// 10m Marker (X = -45)
builder.fillBox(-45, 21, -11, -45, 21, 11, BLOCKS.YELLOW_WOOL);
// 20m Marker (X = -55)
builder.fillBox(-55, 21, -11, -55, 21, 11, BLOCKS.YELLOW_WOOL);
// 30m Marker (X = -65)
builder.fillBox(-65, 21, -11, -65, 21, 11, BLOCKS.RED_WOOL);

// Target Platforms for Hostile Mobs:
// Platform 1 (X: -46..-44, Z: -2..2, Y=21..22)
builder.fillBox(-46, 21, -2, -44, 21, 2, BLOCKS.STONE_BRICKS);
// Platform 2 (X: -56..-54, Z: -5..-1, Y=21..22)
builder.fillBox(-56, 21, -5, -54, 21, -1, BLOCKS.STONE_BRICKS);
// Platform 3 (X: -56..-54, Z: 1..5, Y=21..22)
builder.fillBox(-56, 21, 1, -54, 21, 5, BLOCKS.STONE_BRICKS);
// Platform 4 (X: -66..-64, Z: -3..3, Y=21..22)
builder.fillBox(-66, 21, -3, -64, 21, 3, BLOCKS.RED_WOOL);

// Rear Blast Wall to stop beams safely
builder.fillBox(-69, 21, -12, -69, 26, 12, BLOCKS.OBSIDIAN);

// ========================================================
// 6. SITE 4: NORTH - GENKI DAMA (SPIRIT BOMB) CRATER (Z: -70..-30, X: -16..16)
// ========================================================
console.log('Building Site 4: North Genki Dama Crater...');
// Overlook Platform (Z: -33..-29, X: -6..6, Y=24..25)
builder.fillBox(-6, 21, -33, 6, 24, -29, BLOCKS.STONE_BRICKS);
builder.fillBox(-5, 24, -32, 5, 24, -30, BLOCKS.SANDSTONE);

// 1. Entrance Stairs from Courtyard walkway (Y=20) up to Overlook Platform (Y=24)
for (let step = 0; step < 4; step++) {
  const z = -26 - step;
  const y = 21 + step;
  builder.fillBox(-4, 20, z, 4, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-4, y, z, 4, y, z, BLOCKS.SANDSTONE);
}

// Railing along overlook cliff edge with wide staircase opening at center (X: -2..2)
builder.fillBox(-6, 25, -34, -3, 25, -34, BLOCKS.STONE_BRICKS);
builder.fillBox(3, 25, -34, 6, 25, -34, BLOCKS.STONE_BRICKS);

// 2. Grand Descending Staircase from Overlook (Y=24) down into the Sunken Crater Floor (Y=18)
for (let step = 0; step < 7; step++) {
  const z = -34 - step;
  const y = 24 - step;
  builder.fillBox(-3, 18, z, 3, y, z, BLOCKS.STONE_BRICKS);
  builder.fillBox(-3, y, z, 3, y, z, BLOCKS.SANDSTONE);
  if (step % 2 === 0) {
    builder.setVoxel(-4, y + 1, z, BLOCKS.SEA_LANTERN);
    builder.setVoxel(4, y + 1, z, BLOCKS.SEA_LANTERN);
  }
}

// Sunken Crater Basin (Z: -66..-36, X: -14..14, floor sunk to Y=18..19)
for (let x = -14; x <= 14; x++) {
  for (let z = -66; z <= -36; z++) {
    const cx = 0;
    const cz = -51;
    const r = Math.hypot(x - cx, (z - cz) * 0.9);
    if (r <= 13) {
      // Clear out air above crater floor (except for staircase)
      for (let y = 19; y <= 26; y++) {
        if (z > -41 && Math.abs(x) <= 3) continue; // preserve descending staircase
        builder.setVoxel(x, y, z, BLOCKS.AIR);
      }
      // Crater bed (Obsidian, Netherrack, Cobblestone scorch marks)
      builder.setVoxel(x, 18, z, (r > 10) ? BLOCKS.OBSIDIAN : (Math.random() < 0.3 ? BLOCKS.NETHERRACK : BLOCKS.COBBLESTONE));
    }
  }
}

// Crater Rim Exit Steps: allowing players to climb out on West, East, and North rims (Y=18 up to Y=20)
// West rim steps (X = -13..-11, Z = -52..-50)
builder.fillBox(-12, 18, -52, -12, 19, -50, BLOCKS.STONE_BRICKS);
builder.fillBox(-13, 18, -52, -13, 20, -50, BLOCKS.STONE_BRICKS);
// East rim steps (X = 11..13, Z = -52..-50)
builder.fillBox(12, 18, -52, 12, 19, -50, BLOCKS.STONE_BRICKS);
builder.fillBox(13, 18, -52, 13, 20, -50, BLOCKS.STONE_BRICKS);
// North rim steps (Z = -65..-63, X = -2..2)
builder.fillBox(-2, 18, -64, 2, 19, -64, BLOCKS.STONE_BRICKS);
builder.fillBox(-2, 18, -65, 2, 20, -65, BLOCKS.STONE_BRICKS);

// Glowing energy crystals / sea lanterns embedded in crater floor
builder.setVoxel(-6, 18, -51, BLOCKS.SEA_LANTERN);
builder.setVoxel(6, 18, -51, BLOCKS.SEA_LANTERN);
builder.setVoxel(0, 18, -57, BLOCKS.SEA_LANTERN);
builder.setVoxel(0, 18, -45, BLOCKS.SEA_LANTERN);

// ========================================================
// 7. RLE ENCODE ALL GENERATED CHUNKS
// ========================================================
const chunksData = [];
for (const [key, voxels] of builder.chunks.entries()) {
  const [cx, cz] = key.split(',').map(Number);
  chunksData.push({
    cx,
    cz,
    voxels: encodeVoxelsRLE(voxels)
  });
}

// ========================================================
// 8. MOBS & NPCS (Host, Spectators, Site Managers, Training Mobs)
// ========================================================
const mobsData = [
  // 1. World Martial Arts Tournament Host
  {
    type: 'tournament_host',
    position: { x: 0.0, y: 24.0, z: -8.0 },
    yaw: 0,
    health: 100
  },
  // Friendly spectators in the bleachers
  { type: 'villager', position: { x: -16.0, y: 23.0, z: -4.0 }, yaw: Math.PI / 2, health: 20 },
  { type: 'villager', position: { x: -18.0, y: 24.0, z: 2.0 }, yaw: Math.PI / 2, health: 20 },
  { type: 'villager', position: { x: 16.0, y: 23.0, z: -2.0 }, yaw: -Math.PI / 2, health: 20 },
  { type: 'villager', position: { x: 18.0, y: 24.0, z: 5.0 }, yaw: -Math.PI / 2, health: 20 },

  // 2. The 4 Dedicated Site Managers
  // South - Parkour Master
  {
    type: 'site_manager',
    siteId: 'parkour',
    position: { x: 0.0, y: 21.0, z: 32.0 },
    yaw: 0,
    health: 100
  },
  // East - Punching Combat Master
  {
    type: 'site_manager',
    siteId: 'punching',
    position: { x: 32.0, y: 21.0, z: 0.0 },
    yaw: -Math.PI / 2,
    health: 100
  },
  // West - Kamehameha Grandmaster
  {
    type: 'site_manager',
    siteId: 'kamehameha',
    position: { x: -32.0, y: 21.0, z: 0.0 },
    yaw: Math.PI / 2,
    health: 100
  },
  // North - Spirit Bomb Tutor
  {
    type: 'site_manager',
    siteId: 'genki_dama',
    position: { x: 0.0, y: 24.0, z: -32.0 },
    yaw: Math.PI,
    health: 100
  },

  // 3. Punching Site Hostile Mobs (Sparring combatants to chase and punch)
  { type: 'zombie', position: { x: 42.0, y: 21.0, z: -4.0 }, yaw: 0, health: 30 },
  { type: 'zombie', position: { x: 48.0, y: 21.0, z: 5.0 }, yaw: 0, health: 30 },
  { type: 'pillager', position: { x: 54.0, y: 21.0, z: -3.0 }, yaw: 0, health: 30 },
  { type: 'zombie', position: { x: 58.0, y: 21.0, z: 4.0 }, yaw: 0, health: 30 },

  // 4. Kamehameha Target Range Hostile Mobs (Targets lined up down the lane)
  { type: 'skeleton', position: { x: -45.0, y: 22.0, z: 0.0 }, yaw: Math.PI / 2, health: 25 },
  { type: 'zombie', position: { x: -55.0, y: 22.0, z: -3.0 }, yaw: Math.PI / 2, health: 30 },
  { type: 'skeleton', position: { x: -55.0, y: 22.0, z: 3.0 }, yaw: Math.PI / 2, health: 25 },
  { type: 'zombie', position: { x: -65.0, y: 22.0, z: 0.0 }, yaw: Math.PI / 2, health: 40 },

  // 5. Genki Dama Crater Hostile Mobs (Dense cluster in the sunken basin for AoE)
  { type: 'zombie', position: { x: -3.0, y: 19.0, z: -48.0 }, yaw: 0, health: 35 },
  { type: 'zombie', position: { x: 3.0, y: 19.0, z: -48.0 }, yaw: 0, health: 35 },
  { type: 'skeleton', position: { x: 0.0, y: 19.0, z: -52.0 }, yaw: 0, health: 30 },
  { type: 'zombie', position: { x: -4.0, y: 19.0, z: -54.0 }, yaw: 0, health: 35 },
  { type: 'pillager', position: { x: 4.0, y: 19.0, z: -54.0 }, yaw: 0, health: 35 },
  { type: 'zombie', position: { x: 0.0, y: 19.0, z: -58.0 }, yaw: 0, health: 40 }
];

// ========================================================
// 9. PLAYER INVENTORY & MAP OBJECT
// ========================================================
const hotbar = Array(9).fill(null);
hotbar[0] = null; // Fist in hand at start
hotbar[1] = { id: 'golden_apple', isBlock: false, count: 16 };
hotbar[2] = { id: 'firework_rocket', isBlock: false, count: 64 };
hotbar[3] = { id: BLOCKS.GOLD_ORE, isBlock: true, count: 64 };
hotbar[4] = { id: BLOCKS.STONE_BRICKS, isBlock: true, count: 64 };

const storage = Array(27).fill(null);
storage[0] = { id: 'diamond_sword', isBlock: false, count: 1 };

const tournamentMapData = {
  format: 'minecraft-web-map',
  version: 1,
  name: 'World Martial Arts Tournament',
  description: 'Authentic Tenkaichi Budokai arena with 4 training sites, Goku Ki skills (Kamehameha/Genki Dama), and top-down dungeon battle mode.',
  worldType: 'designed',
  mechanism: 'dragonball_tournament',
  mechanismName: 'Dragon Ball World Tournament',
  savedAt: new Date().toISOString(),
  seed: 777777,
  worldTime: 6000,
  weather: {
    isRaining: false,
    rainIntensity: 0
  },
  player: {
    position: { x: 0.0, y: 22.0, z: 12.0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 3.14159,
    pitch: -0.05,
    gamemode: 'survival', // World Martial Arts Tournament is Survival Mode Only
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
    builtBuildings: [
      {
        id: 'tournament_arena_1',
        name: 'World Martial Arts Tournament',
        type: 'tournament_arena',
        min: { x: -70, y: 17, z: -70 },
        max: { x: 70, y: 39, z: 70 },
        center: { x: 0, y: 24, z: 0 },
        createdPrompt: 'Dragon Ball World Martial Arts Tournament with 4 Training Sites',
        timestamp: Date.now()
      }
    ],
    lastBuiltBuilding: 'tournament_arena_1',
    conversationHistory: []
  }
};

const designedWorldsDir = path.resolve(__dirname, '..', 'designed_worlds');
if (!fs.existsSync(designedWorldsDir)) {
  fs.mkdirSync(designedWorldsDir, { recursive: true });
}

const outputPath = path.join(designedWorldsDir, 'World_Martial_Arts_Tournament.json');
fs.writeFileSync(outputPath, JSON.stringify(tournamentMapData, null, 2), 'utf-8');

console.log(`Successfully generated and saved tournament map to designed worlds: ${outputPath}`);
console.log(`Total Chunks: ${chunksData.length}, Total Mobs: ${mobsData.length}`);
