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

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(raw);
  const idat = makeChunk('IDAT', compressed);

  // IEND
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdr, idat, iend]);
}

// 1. chest_top.png (16x16: dark oak border with rich golden-brown oak planks)
const chestTopPng = createPNG(16, 16, (x, y) => {
  const isBorder = x === 0 || x === 15 || y === 0 || y === 15;
  const isInnerBorder = (x === 1 || x === 14 || y === 1 || y === 14);
  if (isBorder) return [48, 28, 12, 255];
  if (isInnerBorder) return [74, 44, 20, 255];

  // Planks pattern
  const noise = ((x * 7 + y * 13) % 5);
  const r = 168 + noise * 4;
  const g = 108 + noise * 3;
  const b = 48 + noise * 2;
  return [r, g, b, 255];
});

// 2. chest_side.png (16x16: side view with lid seam at y=4)
const chestSidePng = createPNG(16, 16, (x, y) => {
  const isBorder = x === 0 || x === 15 || y === 0 || y === 15;
  const isLidSeam = y === 4;
  if (isBorder) return [48, 28, 12, 255];
  if (isLidSeam) return [32, 18, 8, 255];
  if (x === 1 || x === 14) return [74, 44, 20, 255];

  // Planks
  const noise = ((x * 11 + y * 5) % 6);
  const r = 160 + noise * 4;
  const g = 102 + noise * 3;
  const b = 44 + noise * 2;
  return [r, g, b, 255];
});

// 3. chest_front.png (16x16: front view with lid seam at y=4 and lock latch in center x=7..8, y=3..6)
const chestFrontPng = createPNG(16, 16, (x, y) => {
  // Silver Lock Latch
  if (x >= 7 && x <= 8 && y >= 3 && y <= 6) {
    if (x === 7 && y === 5) return [40, 40, 45, 255]; // keyhole
    if (y === 3 || x === 7) return [235, 238, 242, 255]; // highlight
    return [180, 185, 192, 255]; // lock body
  }
  // Lock shadow
  if (x >= 6 && x <= 9 && y >= 2 && y <= 7) {
    if (x === 6 || x === 9 || y === 2 || y === 7) {
      return [40, 24, 10, 255];
    }
  }

  const isBorder = x === 0 || x === 15 || y === 0 || y === 15;
  const isLidSeam = y === 4;
  if (isBorder) return [48, 28, 12, 255];
  if (isLidSeam) return [32, 18, 8, 255];
  if (x === 1 || x === 14) return [74, 44, 20, 255];

  const noise = ((x * 11 + y * 5) % 6);
  const r = 160 + noise * 4;
  const g = 102 + noise * 3;
  const b = 44 + noise * 2;
  return [r, g, b, 255];
});

// 4. chest_lock.png (16x16: metallic silver latch)
const chestLockPng = createPNG(16, 16, (x, y) => {
  if (x === 0 || x === 15 || y === 0 || y === 15) return [45, 45, 50, 255];
  if (x >= 7 && x <= 8 && y >= 8 && y <= 10) return [20, 20, 25, 255]; // keyhole
  const shine = (x + y < 14) ? 35 : 0;
  return [190 + shine, 195 + shine, 205 + shine, 255];
});

// 5. chest.png item icon (16x16: 3D isometric chest item icon)
const chestItemPng = createPNG(16, 16, (x, y) => {
  // Transparent background outside chest bounds
  if (y < 2 || y > 13 || x < 2 || x > 13) return [0, 0, 0, 0];

  // Chest outline
  const isOuter = (
    (y === 2 && x >= 3 && x <= 12) ||
    (y === 13 && x >= 3 && x <= 12) ||
    (x === 2 && y >= 3 && y <= 12) ||
    (x === 13 && y >= 3 && y <= 12)
  );
  if (isOuter) return [35, 20, 8, 255];

  // Lid seam
  if (y === 6 && x >= 3 && x <= 12) return [45, 26, 10, 255];

  // Silver latch at x=7..8, y=5..7
  if (x >= 7 && x <= 8 && y >= 5 && y <= 7) {
    if (x === 7 && y === 6) return [40, 40, 40, 255]; // keyhole
    if (y === 5) return [240, 240, 245, 255];
    return [190, 195, 200, 255];
  }

  // Corner metal bands
  if ((x === 3 || x === 12) && (y <= 4 || y >= 11)) return [70, 45, 20, 255];

  // Wood lid (y 3..5)
  if (y < 6) {
    const light = (13 - y) * 8;
    return [175 + light, 115 + light, 55 + light, 255];
  }

  // Wood body (y 7..12)
  const shade = (y - 7) * 5;
  return [150 - shade, 95 - shade, 40 - shade, 255];
});

// Write files
fs.writeFileSync('public/assets/blocks/chest_top.png', chestTopPng);
fs.writeFileSync('public/assets/blocks/chest_side.png', chestSidePng);
fs.writeFileSync('public/assets/blocks/chest_front.png', chestFrontPng);
fs.writeFileSync('public/assets/blocks/chest_lock.png', chestLockPng);
fs.writeFileSync('public/assets/items/chest.png', chestItemPng);

console.log('Successfully generated chest block and item assets!');
