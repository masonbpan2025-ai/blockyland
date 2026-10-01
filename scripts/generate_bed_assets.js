import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // Filter type 0: None
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

// 16x16 isometric / side Minecraft red bed icon
function getBedPixel(x, y) {
  // Wood legs: bottom left and bottom right
  const isLeftLeg = (x >= 2 && x <= 3 && y >= 12 && y <= 15);
  const isRightLeg = (x >= 12 && x <= 13 && y >= 12 && y <= 15);
  if (isLeftLeg || isRightLeg) {
    return [115, 85, 52, 255]; // Oak leg
  }

  // Wood frame base (y = 10..12)
  if (y >= 10 && y <= 12 && x >= 1 && x <= 14) {
    if (y === 10) return [145, 105, 65, 255]; // Light wood edge
    return [115, 85, 52, 255]; // Wood frame
  }

  // Bed Mattress / Pillow & Blanket (y = 4..9)
  if (y >= 4 && y <= 9 && x >= 1 && x <= 14) {
    // Head / Pillow (x = 1..5)
    if (x <= 5 && y >= 4 && y <= 7) {
      if (y === 4 || x === 1) return [240, 240, 240, 255]; // White pillow highlight
      if (y === 7 || x === 5) return [200, 200, 200, 255]; // Pillow shadow
      return [230, 230, 230, 255]; // Pillow body
    }

    // Red blanket (x = 6..14, and y=8..9 under pillow)
    if (y === 4 || (y === 8 && x <= 5)) return [205, 40, 40, 255]; // Red highlight
    if (y === 9 || x === 14) return [145, 20, 20, 255]; // Red shadow
    return [180, 30, 30, 255]; // Red blanket
  }

  // White sheet fold line between pillow and blanket (x = 5..6, y = 5..7)
  if ((x === 5 || x === 6) && y >= 5 && y <= 7) {
    return [215, 215, 215, 255];
  }

  return [0, 0, 0, 0];
}

const outDir = path.resolve('public/assets/items');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const bedBuf = createPNG(16, 16, getBedPixel);
fs.writeFileSync(path.join(outDir, 'red_bed.png'), bedBuf);
fs.writeFileSync(path.join(outDir, 'bed.png'), bedBuf);

const blockDir = path.resolve('public/assets/blocks');
if (!fs.existsSync(blockDir)) fs.mkdirSync(blockDir, { recursive: true });
fs.writeFileSync(path.join(blockDir, 'red_bed.png'), bedBuf);

console.log('Successfully generated red_bed.png and bed.png!');
