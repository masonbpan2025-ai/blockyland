import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      const [r, g, b, a] = getPixel(x, y);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a !== undefined ? a : 255;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const body = Buffer.concat([typeBuf, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (-306674912 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function hexToRgba(hex, alpha = 255) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b, alpha];
}

function savePNG(filePath, fn, width = 16, height = 16) {
  const buf = createPNG(width, height, fn);
  fs.writeFileSync(filePath, buf);
}

const itemsDir = path.resolve('public/assets/items');
const blocksDir = path.resolve('public/assets/blocks');

// 1. Bamboo block items: copy bamboo_planks.png
const bambooBlocks = [
  'bamboo_button.png', 'bamboo_fence_gate.png', 'bamboo_fence.png',
  'bamboo_pressure_plate.png', 'bamboo_slab.png', 'bamboo_stairs.png',
  'bamboo_hanging_sign.png', 'bamboo_sign.png'
];
const bambooPlanks = path.join(blocksDir, 'bamboo_planks.png');
for (const b of bambooBlocks) {
  if (fs.existsSync(bambooPlanks)) {
    fs.copyFileSync(bambooPlanks, path.join(itemsDir, b));
  }
}

// 2. Music Discs
function generateMusicDisc(labelHex) {
  const VINYL = hexToRgba('#1c1c1c');
  const GROOVE = hexToRgba('#2e2e2e');
  const LABEL = hexToRgba(labelHex);

  return (x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 6.5) return [0, 0, 0, 0];
    if (dist < 1.0) return [0, 0, 0, 0]; // spindle hole
    if (dist < 2.8) return LABEL;
    if (Math.floor(dist) === 4 || Math.floor(dist) === 5) {
      if ((x + y) % 2 === 0) return GROOVE;
    }
    return VINYL;
  };
}

const MUSIC_DISCS = {
  music_disc_11: '#3a3a3a',
  music_disc_13: '#e7c844',
  music_disc_blocks: '#c85032',
  music_disc_cat: '#3cc472',
  music_disc_chirp: '#b02a2a',
  music_disc_creator: '#60a5fa',
  music_disc_creator_music_box: '#8b5cf6',
  music_disc_far: '#88e7b8',
  music_disc_mall: '#a864c0',
  music_disc_mellohi: '#d85ca8',
  music_disc_otherside: '#234975',
  music_disc_pigstep: '#9c301c',
  music_disc_precipice: '#0ea5e9',
  music_disc_relic: '#8c6239',
  music_disc_stal: '#141414',
  music_disc_strad: '#f3f4f6',
  music_disc_wait: '#3b82f6',
  music_disc_ward: '#166534'
};

for (const [id, color] of Object.entries(MUSIC_DISCS)) {
  savePNG(path.join(itemsDir, `${id}.png`), generateMusicDisc(color));
}

// 3. Meats & Foods
function generateMeat(isCooked, isMutton) {
  const MEAT_RAW = isMutton ? hexToRgba('#b54141') : hexToRgba('#d48c82');
  const MEAT_COOKED = isMutton ? hexToRgba('#783820') : hexToRgba('#945930');
  const MEAT_LIGHT = isCooked ? hexToRgba('#b36b44') : hexToRgba('#e8a59b');
  const MEAT_DARK = isCooked ? hexToRgba('#542311') : hexToRgba('#8a2727');
  const BONE = hexToRgba('#eae5d8');
  const BONE_DARK = hexToRgba('#b5af9e');

  const MEAT = isCooked ? MEAT_COOKED : MEAT_RAW;

  return (x, y) => {
    // Chop / roast silhouette
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    // Bone handle at bottom-left (3..5, 10..12)
    if (x <= 5 && y >= 10) {
      if (x === 3 || y === 12) return BONE_DARK;
      return BONE;
    }
    // Meat contour
    if (y < 4 && x < 6) return [0, 0, 0, 0];
    if (y > 11 && x > 9) return [0, 0, 0, 0];
    if (x === 12 || y === 11) return MEAT_DARK;
    if (y <= 5 || x <= 6) return MEAT_LIGHT;
    return MEAT;
  };
}

savePNG(path.join(itemsDir, 'mutton.png'), generateMeat(false, true));
savePNG(path.join(itemsDir, 'cooked_mutton.png'), generateMeat(true, true));
savePNG(path.join(itemsDir, 'rabbit.png'), generateMeat(false, false));
savePNG(path.join(itemsDir, 'cooked_rabbit.png'), generateMeat(true, false));

function generateRottenFlesh() {
  const FLESH = hexToRgba('#647d32');
  const FLESH_LIGHT = hexToRgba('#809e42');
  const FLESH_DARK = hexToRgba('#42541f');
  const ROTTEN_BLOOD = hexToRgba('#7f3b25');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 4 || y > 12) return [0, 0, 0, 0];
    if (y === 4 && (x < 6 || x > 9)) return [0, 0, 0, 0];
    if (y === 12 && (x < 4 || x > 10)) return [0, 0, 0, 0];
    if ((x === 6 || x === 7) && (y === 7 || y === 8)) return ROTTEN_BLOOD;
    if (x <= 5 || y <= 5) return FLESH_LIGHT;
    if (x >= 11 || y >= 11) return FLESH_DARK;
    return FLESH;
  };
}
savePNG(path.join(itemsDir, 'rotten_flesh.png'), generateRottenFlesh());

function generateTropicalFish() {
  const ORANGE = hexToRgba('#f06222');
  const WHITE = hexToRgba('#ffffff');
  const EYE = hexToRgba('#222222');
  const FIN = hexToRgba('#d14a0e');

  return (x, y) => {
    // Fish silhouette (x: 2..13, y: 5..10)
    if (x < 2 || x > 13 || y < 5 || y > 10) return [0, 0, 0, 0];
    // Tail at x: 2..4
    if (x <= 4 && (y === 7 || y === 8)) return [0, 0, 0, 0];
    // Eye at (11, 6)
    if (x === 11 && y === 6) return EYE;
    // White stripe down middle at x: 7..8
    if (x === 7 || x === 8) return WHITE;
    if (y === 5 || y === 10) return FIN;
    return ORANGE;
  };
}
savePNG(path.join(itemsDir, 'tropical_fish.png'), generateTropicalFish());

function generateChorusFruit() {
  const PURPLE = hexToRgba('#8c488c');
  const LIGHT = hexToRgba('#b86ab8');
  const DARK = hexToRgba('#4d204d');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    if ((x < 5 || x > 10) && (y < 5 || y > 10)) return [0, 0, 0, 0];
    if (x <= 5 || y <= 5) return LIGHT;
    if (x >= 10 || y >= 10) return DARK;
    return PURPLE;
  };
}
savePNG(path.join(itemsDir, 'chorus_fruit.png'), generateChorusFruit());

function generateDriedKelp() {
  const KELP = hexToRgba('#364324');
  const LIGHT = hexToRgba('#4c5e33');
  const DARK = hexToRgba('#212b15');
  const ROPE = hexToRgba('#876d47');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    if (x === 7 || x === 8) return ROPE;
    if (y <= 5) return LIGHT;
    if (y >= 10) return DARK;
    return KELP;
  };
}
savePNG(path.join(itemsDir, 'dried_kelp.png'), generateDriedKelp());

// 4. Special Items
function generateGoldNugget() {
  const GOLD = hexToRgba('#fad64a');
  const LIGHT = hexToRgba('#fff080');
  const DARK = hexToRgba('#b38612');

  return (x, y) => {
    if (x < 5 || x > 10 || y < 5 || y > 10) return [0, 0, 0, 0];
    if ((x === 5 || x === 10) && (y === 5 || y === 10)) return [0, 0, 0, 0];
    if (x === 6 && y === 6) return LIGHT;
    if (x === 9 || y === 9) return DARK;
    return GOLD;
  };
}
savePNG(path.join(itemsDir, 'gold_nugget.png'), generateGoldNugget());

function generateBrick(isNether = false) {
  const BRICK = isNether ? hexToRgba('#42232c') : hexToRgba('#9c4936');
  const LIGHT = isNether ? hexToRgba('#5c343f') : hexToRgba('#bd5f48');
  const DARK = isNether ? hexToRgba('#241117') : hexToRgba('#662d20');

  return (x, y) => {
    // 3D angled ingot/brick bar (x: 2..13, y: 5..10)
    if (x < 2 || x > 13 || y < 5 || y > 11) return [0, 0, 0, 0];
    if (y === 5 && (x < 5 || x > 11)) return [0, 0, 0, 0];
    if (y === 11 && (x < 4 || x > 10)) return [0, 0, 0, 0];
    if (y === 5 || y === 6 || x === 3) return LIGHT;
    if (y === 10 || y === 11 || x === 12) return DARK;
    return BRICK;
  };
}
savePNG(path.join(itemsDir, 'brick.png'), generateBrick(false));
savePNG(path.join(itemsDir, 'nether_brick.png'), generateBrick(true));

function generateBambooItem() {
  const STALK = hexToRgba('#7a9926');
  const LIGHT = hexToRgba('#99bd33');
  const DARK = hexToRgba('#546917');
  const LEAF = hexToRgba('#8db52b');

  return (x, y) => {
    // Diagonal cane
    const line = Math.abs((x + y) - 15);
    if (line > 1) {
      // Small shoots
      if ((x === 9 && y === 4) || (x === 4 && y === 9)) return LEAF;
      return [0, 0, 0, 0];
    }
    if (x < 2 || x > 13 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Nodes / segments
    if (x === y) return DARK;
    if (line === 0) return LIGHT;
    return STALK;
  };
}
savePNG(path.join(itemsDir, 'bamboo.png'), generateBambooItem());

function generateBrush() {
  const WOOD = hexToRgba('#85542e');
  const COPPER = hexToRgba('#c06c4e');
  const BRISTLE = hexToRgba('#f2efe9');
  const BRISTLE_DARK = hexToRgba('#c2beaf');

  return (x, y) => {
    if (x < 5 || x > 10 || y < 1 || y > 14) return [0, 0, 0, 0];
    // Bristles at top (1..5)
    if (y <= 5) {
      if (x < 6 || x > 9) return [0, 0, 0, 0];
      if (y === 5) return BRISTLE_DARK;
      return BRISTLE;
    }
    // Copper band at (6..7)
    if (y <= 7) return COPPER;
    // Wooden handle at (8..14)
    if (x === 7 || x === 8) return WOOD;
    return [0, 0, 0, 0];
  };
}
savePNG(path.join(itemsDir, 'brush.png'), generateBrush());

function generateGoatHorn() {
  const HORN = hexToRgba('#dcd6c8');
  const LIGHT = hexToRgba('#f5f2e9');
  const DARK = hexToRgba('#8a8275');
  const TIP = hexToRgba('#4f483d');

  return (x, y) => {
    // Curved horn shape
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    if (x + y < 8 || x + y > 22) return [0, 0, 0, 0];
    if (x >= 10 && y <= 4) return TIP;
    if (x <= 5 || y <= 5) return LIGHT;
    if (x >= 10 || y >= 10) return DARK;
    return HORN;
  };
}
savePNG(path.join(itemsDir, 'goat_horn.png'), generateGoatHorn());

function generateRabbitFoot() {
  const FUR = hexToRgba('#b58a5e');
  const LIGHT = hexToRgba('#d6ad82');
  const DARK = hexToRgba('#7d5a37');
  const CLAW = hexToRgba('#3b291a');

  return (x, y) => {
    if (x < 4 || x > 11 || y < 4 || y > 12) return [0, 0, 0, 0];
    if (y === 12) return CLAW;
    if (x <= 5 || y <= 5) return LIGHT;
    if (x >= 10 || y >= 10) return DARK;
    return FUR;
  };
}
savePNG(path.join(itemsDir, 'rabbit_foot.png'), generateRabbitFoot());

function generateTippedArrow() {
  const WOOD = hexToRgba('#85542e');
  const FEATHER = hexToRgba('#dedede');
  const POTION_TIP = hexToRgba('#bd33ff');

  return (x, y) => {
    const line = Math.abs((x + y) - 15);
    if (line > 1) return [0, 0, 0, 0];
    if (x < 2 || x > 13 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Tip at top-right
    if (x >= 10 && y <= 5) return POTION_TIP;
    // Fletching at bottom-left
    if (x <= 5 && y >= 10) return FEATHER;
    return WOOD;
  };
}
savePNG(path.join(itemsDir, 'tipped_arrow.png'), generateTippedArrow());

function generateHarness() {
  const LEATHER = hexToRgba('#613b1f');
  const BUCKLE = hexToRgba('#dcdcdc');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 4 || y > 11) return [0, 0, 0, 0];
    if (y === 4 || y === 11 || x === 3 || x === 12) return LEATHER;
    if ((x === 7 || x === 8) && (y === 7 || y === 8)) return BUCKLE;
    return [0, 0, 0, 0];
  };
}
savePNG(path.join(itemsDir, 'harness.png'), generateHarness());

// 5. Spawn Eggs: Snow Golem & Killer Bunny
function generateSimpleSpawnEgg(shellHex, spotHex) {
  const SHELL = hexToRgba(shellHex);
  const SPOT = hexToRgba(spotHex);
  return (x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    if (dx * dx * 1.3 + dy * dy > 30) return [0, 0, 0, 0];
    if ((x === 6 && y === 4) || (x === 9 && y === 8) || (x === 4 && y === 9)) return SPOT;
    return SHELL;
  };
}
savePNG(path.join(itemsDir, 'snow_golem_spawn_egg.png'), generateSimpleSpawnEgg('#ffffff', '#d8731e'));
savePNG(path.join(itemsDir, 'killer_bunny_spawn_egg.png'), generateSimpleSpawnEgg('#ffffff', '#cc1111'));

console.log('Successfully generated all remaining 47 items!');
