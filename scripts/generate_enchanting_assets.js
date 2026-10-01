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
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk('IHDR', ihdrData);

  const compressedData = zlib.deflateSync(raw);
  const idat = makeChunk('IDAT', compressedData);
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

const itemsDir = path.resolve('public/assets/items');
const blocksDir = path.resolve('public/assets/blocks');

// 1. Enchanted Book (16x16)
const bookBuffer = createPNG(16, 16, (x, y) => {
  // Diagonal tilted leather book with magenta/purple glow ribbon
  const inBook = (x >= 2 && x <= 13 && y >= 2 && y <= 13);
  if (!inBook) return [0, 0, 0, 0];

  // Border
  if (x === 2 || x === 13 || y === 2 || y === 13) {
    return [45, 20, 50, 255]; // Dark enchanted outline
  }

  // Purple ribbon across center (x == y || x == y - 1)
  const isRibbon = Math.abs(x - y) <= 1 || (x >= 7 && x <= 8);
  if (isRibbon) {
    // Glowing magenta ribbon
    const shimmer = (x + y) % 3 === 0 ? 30 : 0;
    return [190 + shimmer, 40, 220 + shimmer, 255];
  }

  // Pages corner
  if (x >= 10 && y <= 5) {
    return [240, 230, 200, 255]; // Paper edge
  }

  // Rich mystical purple/brown leather
  const noise = ((x * 7 + y * 13) % 17) * 2;
  return [110 + noise, 35 + noise, 95 + noise, 255];
});
fs.writeFileSync(path.join(itemsDir, 'enchanted_book.png'), bookBuffer);

// 2. Experience Bottle (Bottle o' Enchanting) (16x16)
const bottleBuffer = createPNG(16, 16, (x, y) => {
  // Flask shape
  // Cork at top (x: 7..8, y: 1..2)
  if (x >= 7 && x <= 8 && y >= 1 && y <= 2) {
    return [160, 110, 60, 255]; // Cork
  }
  // Neck (x: 7..8, y: 3..4)
  if (x >= 7 && x <= 8 && y >= 3 && y <= 4) {
    return [200, 240, 255, 200]; // Glass neck
  }
  // Body (round flask x: 4..11, y: 5..14)
  const dx = x - 7.5;
  const dy = y - 9.5;
  const distSq = dx * dx + dy * dy;

  if (distSq <= 24) {
    // Glass outline
    if (distSq >= 18) {
      return [180, 230, 255, 230]; // Glass reflection
    }
    // Highlighting reflection
    if (x === 6 && y === 7) return [255, 255, 255, 255];

    // Swirling glowing green/yellow XP fluid
    const swirl = (x + y * 2) % 4;
    if (swirl === 0) return [130, 255, 30, 255]; // Lime glow
    if (swirl === 1) return [255, 240, 40, 255]; // Gold spark
    if (swirl === 2) return [80, 220, 20, 255];  // Green
    return [180, 255, 60, 255];                  // Bright lime
  }

  return [0, 0, 0, 0];
});
fs.writeFileSync(path.join(itemsDir, 'experience_bottle.png'), bottleBuffer);

// 3. Enchanting Table Side Texture (16x16)
const tableSideBuffer = createPNG(16, 16, (x, y) => {
  // Top 4 pixels: red cloth trim with gold runes
  if (y <= 3) {
    if (y === 0) return [140, 20, 25, 255]; // Dark red trim
    if ((x === 4 || x === 11) && y === 2) return [100, 230, 240, 255]; // Diamond rune inlay
    return [180, 28, 35, 255]; // Velvet red
  }

  // Corner diamonds (x <= 1 || x >= 14) and (y >= 12)
  if ((x <= 1 || x >= 14) && y >= 12) {
    return [90, 220, 235, 255]; // Diamond corner
  }

  // Obsidian body: deep purplish black with subtle texture
  const noise = ((x * 11 + y * 17) % 19) * 2;
  const isSpeck = (x * 5 + y * 7) % 13 === 0;
  if (isSpeck) return [55 + noise, 35 + noise, 75 + noise, 255];
  return [22 + noise, 16 + noise, 32 + noise, 255];
});
fs.writeFileSync(path.join(blocksDir, 'enchanting_table_side.png'), tableSideBuffer);

console.log('Enchanting assets generated successfully!');
