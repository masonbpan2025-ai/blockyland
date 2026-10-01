import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a;
    }
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(typeStr, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const type = Buffer.from(typeStr, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crcVal = crc32(Buffer.concat([type, data]));
    crcBuf.writeUInt32BE(crcVal, 0);
    return Buffer.concat([len, type, data, crcBuf]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);
  const compressed = zlib.deflateSync(raw);
  const idat = makeChunk('IDAT', compressed);
  const iend = makeChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

const blocksDir = path.resolve('public/assets/blocks');
const itemsDir = path.resolve('public/assets/items');
if (!fs.existsSync(blocksDir)) fs.mkdirSync(blocksDir, { recursive: true });
if (!fs.existsSync(itemsDir)) fs.mkdirSync(itemsDir, { recursive: true });

// 1. Farmland Dry (Brown tilled soil with furrow lines)
const farmlandDryPng = createPNG(16, 16, (x, y) => {
  const isFurrow = (y % 4 === 0) || ((x + y * 3) % 7 === 0);
  const noise = ((x * 13 + y * 37) % 19) / 19;
  if (isFurrow) {
    const v = Math.floor(65 + noise * 15);
    return [v, Math.floor(v * 0.7), Math.floor(v * 0.45), 255];
  }
  const v = Math.floor(95 + noise * 25);
  return [v, Math.floor(v * 0.72), Math.floor(v * 0.48), 255];
});
fs.writeFileSync(path.join(blocksDir, 'farmland_dry.png'), farmlandDryPng);

// 2. Farmland Moist (Dark saturated hydrated loam)
const farmlandMoistPng = createPNG(16, 16, (x, y) => {
  const isFurrow = (y % 4 === 0) || ((x + y * 3) % 7 === 0);
  const noise = ((x * 17 + y * 29) % 19) / 19;
  if (isFurrow) {
    const v = Math.floor(38 + noise * 10);
    return [v, Math.floor(v * 0.65), Math.floor(v * 0.42), 255];
  }
  const v = Math.floor(58 + noise * 18);
  return [v, Math.floor(v * 0.68), Math.floor(v * 0.45), 255];
});
fs.writeFileSync(path.join(blocksDir, 'farmland_moist.png'), farmlandMoistPng);

// 3. Wheat stages (0 to 7)
// Stage 0: 2 rows of tiny sprouts at y=14..15
// Stage 1: sprouts at y=12..15
// Stage 2: taller green at y=10..15
// Stage 3: half-grown green stalks y=8..15
// Stage 4: tall stalks starting to turn yellowish y=5..15
// Stage 5: golden-yellow stalks with developing heads y=3..15
// Stage 6: full height with grain spikes y=1..15
// Stage 7: mature golden wheat with ripe drooping ears y=0..15
for (let stage = 0; stage <= 7; stage++) {
  const minHeight = 15 - Math.round((stage / 7) * 14 + 1); // 14 down to 0
  const png = createPNG(16, 16, (x, y) => {
    if (y < minHeight) return [0, 0, 0, 0]; // empty air above crop

    // 4 vertical stems at x = 2, 6, 10, 14 (with slight organic flutter)
    const stemX = [2, 6, 10, 14];
    const isStem = stemX.some(sx => Math.abs(x - sx) <= (stage >= 3 ? 1 : 0));
    if (!isStem) return [0, 0, 0, 0];

    // Colors: Green at early stages -> golden amber at late stages
    const ripeness = stage / 7; // 0 (green) to 1 (golden)
    const isHead = y <= minHeight + 3 && stage >= 4;

    if (isHead) {
      // Golden grain heads
      return [225 + ((x + y) % 3) * 10, 180 + ((x * 2) % 4) * 10, 70, 255];
    }

    const r = Math.round(50 * (1 - ripeness) + 195 * ripeness);
    const g = Math.round(165 * (1 - ripeness) + 160 * ripeness);
    const b = Math.round(40 * (1 - ripeness) + 45 * ripeness);
    return [r, g, b, 255];
  });
  fs.writeFileSync(path.join(blocksDir, `wheat_stage_${stage}.png`), png);
}

// 4. Carrots stages (0 to 3)
// Stage 0: tiny green leaves at base
// Stage 1: bushy green tops
// Stage 2: tall green fronds with orange crown peaking
// Stage 3: full mature fronds with bright orange carrots
for (let stage = 0; stage <= 3; stage++) {
  const minHeight = 15 - Math.round((stage / 3) * 11 + 3); // 12 down to 1
  const png = createPNG(16, 16, (x, y) => {
    if (y < minHeight) return [0, 0, 0, 0];

    // Carrot plant spread
    const centerX = 8;
    const dist = Math.abs(x - centerX);
    const maxSpread = 2 + stage * 2;
    if (dist > maxSpread) return [0, 0, 0, 0];

    // Roots / orange carrot showing at bottom for stages 2 and 3
    if (stage >= 2 && y >= 12 && (x === 6 || x === 7 || x === 9 || x === 10)) {
      return [235, 115, 20, 255]; // bright orange carrot
    }

    // Lush green leafy carrot tops
    const greenShade = 140 + ((x * 7 + y * 13) % 40);
    return [40, greenShade, 30, 255];
  });
  fs.writeFileSync(path.join(blocksDir, `carrots_stage_${stage}.png`), png);
}

// 5. Potatoes stages (0 to 3)
// Stage 0: small green sprout
// Stage 1: bushy potato foliage
// Stage 2: full foliage with small white/purple blooms
// Stage 3: mature potato bush ready for harvest
for (let stage = 0; stage <= 3; stage++) {
  const minHeight = 15 - Math.round((stage / 3) * 11 + 3);
  const png = createPNG(16, 16, (x, y) => {
    if (y < minHeight) return [0, 0, 0, 0];

    const dist = Math.abs(x - 8);
    const maxSpread = 2 + stage * 2;
    if (dist > maxSpread) return [0, 0, 0, 0];

    // Flower blooms at stage 2
    if (stage === 2 && y === minHeight && (x === 5 || x === 11)) {
      return [240, 230, 255, 255]; // white/lilac potato bloom
    }

    // Earthy brown potato peaking at base in stage 3
    if (stage === 3 && y >= 13 && (x === 6 || x === 10)) {
      return [180, 140, 75, 255]; // potato tuber
    }

    // Potato foliage (deep rich green)
    const g = 120 + ((x * 5 + y * 11) % 45);
    return [35, g, 25, 255];
  });
  fs.writeFileSync(path.join(blocksDir, `potatoes_stage_${stage}.png`), png);
}

// 6. Wheat Seeds item (16x16 PNG)
const wheatSeedsPng = createPNG(16, 16, (x, y) => {
  // 3 small diagonal seeds scattered in center
  const isSeed1 = (x >= 4 && x <= 6 && y >= 6 && y <= 9 && (x + y) % 2 === 0);
  const isSeed2 = (x >= 8 && x <= 11 && y >= 4 && y <= 8 && (x + y) % 2 !== 0);
  const isSeed3 = (x >= 6 && x <= 9 && y >= 10 && y <= 13);
  if (isSeed1 || isSeed2 || isSeed3) {
    const isEdge = (x === 4 || x === 11 || y === 4 || y === 13);
    if (isEdge) return [130, 95, 40, 255];
    return [205, 170, 75, 255];
  }
  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(itemsDir, 'wheat_seeds.png'), wheatSeedsPng);

console.log('Successfully generated all farming textures and item icons!');
