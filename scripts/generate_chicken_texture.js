import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // Filter: none
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a !== undefined ? a : 255;
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

// 64x32 Minecraft Chicken Texture
const W = 64;
const H = 32;
const pixels = Array.from({ length: H }, () => Array.from({ length: W }, () => [0, 0, 0, 0]));

function fill(x0, y0, w, h, rgba) {
  for (let y = y0; y < y0 + h && y < H; y++) {
    for (let x = x0; x < x0 + w && x < W; x++) {
      pixels[y][x] = [...rgba];
    }
  }
}

// Helper colors
const WHITE = [250, 250, 250, 255];
const WHITE_SHADE = [235, 235, 235, 255];
const WHITE_DARK = [218, 218, 218, 255];
const BEAK_ORANGE = [238, 155, 20, 255];
const BEAK_DARK = [205, 125, 12, 255];
const WATTLE_RED = [204, 35, 35, 255];
const WATTLE_DARK = [160, 20, 20, 255];
const EYE_BLACK = [20, 20, 20, 255];
const EYE_WHITE = [255, 255, 255, 255];
const LEG_YELLOW = [238, 165, 25, 255];
const LEG_DARK = [210, 135, 15, 255];

// 1. Head (UV 0, 0 to 14, 9) - 4x6x3 box
// Head top & bottom: x: [0, 14], y: [0, 3]
fill(0, 0, 14, 9, WHITE);
for (let y = 0; y < 9; y++) {
  for (let x = 0; x < 14; x++) {
    if ((x + y * 3) % 4 === 0) pixels[y][x] = [...WHITE_SHADE];
  }
}
// Eyes: front face is x: [3, 6], y: [3, 8]
// Eyes on the sides and front:
pixels[5][3] = [...EYE_BLACK];
pixels[5][6] = [...EYE_BLACK];
pixels[4][3] = [...EYE_WHITE];
pixels[4][6] = [...EYE_WHITE];

// 2. Beak (UV 14, 0, 4x2x2)
fill(14, 0, 8, 4, BEAK_ORANGE);
fill(14, 2, 8, 2, BEAK_DARK);

// 3. Wattle (UV 14, 4, 2x4x2)
fill(14, 4, 6, 4, WATTLE_RED);
fill(14, 6, 6, 2, WATTLE_DARK);

// 4. Body (UV 0, 9 to 24, 23) - 6x6x8 box (top, bottom, sides)
fill(0, 9, 24, 14, WHITE);
for (let y = 9; y < 23; y++) {
  for (let x = 0; x < 24; x++) {
    if ((x * 2 + y) % 5 === 0) pixels[y][x] = [...WHITE_SHADE];
    else if ((x + y * 2) % 7 === 0) pixels[y][x] = [...WHITE_DARK];
  }
}

// 5. Wings (UV 24, 13 to 38, 23) - 1x4x6 box
fill(24, 13, 14, 10, WHITE);
for (let y = 13; y < 23; y++) {
  for (let x = 24; x < 38; x++) {
    if ((x + y) % 3 === 0) pixels[y][x] = [...WHITE_SHADE];
    if (y === 22 || x === 24 || x === 37) pixels[y][x] = [...WHITE_DARK];
  }
}

// 6. Legs (UV 26, 0 to 38, 11) - 3x5x3 box
fill(26, 0, 12, 11, LEG_YELLOW);
for (let y = 0; y < 11; y++) {
  for (let x = 26; x < 38; x++) {
    if (y >= 8 && (x % 3 === 0)) pixels[y][x] = [...LEG_DARK];
  }
}

const outBuffer = createPNG(W, H, (x, y) => pixels[y][x]);
const outPath = path.resolve('public/assets/entity/chicken.png');
fs.writeFileSync(outPath, outBuffer);
console.log(`Saved chicken texture to ${outPath} (${outBuffer.length} bytes)`);
