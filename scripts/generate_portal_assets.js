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

const blocksDir = path.resolve('public/assets/blocks');

// 1. Nether Portal block texture (16x16)
// Authentic Minecraft swirling deep-violet and bright magenta portal pattern
const portalBuffer = createPNG(16, 16, (x, y) => {
  // Swirling vortex math
  const cx = 7.5, cy = 7.5;
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const wave = Math.sin(dist * 0.8 - angle * 2.0) * 0.5 + 0.5;
  const noise = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;

  // Palette from deep obsidian violet to radiant magenta/white core
  let r, g, b, a;
  if (wave > 0.75) {
    // Bright magenta highlight
    r = 217; g = 70; b = 239; a = 220;
  } else if (wave > 0.5) {
    // Vibrant purple
    r = 168; g = 85; b = 247; a = 205;
  } else if (wave > 0.25) {
    // Deep royal purple
    r = 126; g = 34; b = 206; a = 195;
  } else {
    // Deep dark violet void
    r = 74; g = 14; b = 120; a = 190;
  }

  // Slight noise sparkle
  if (Math.abs(noise) > 0.8) {
    r = Math.min(255, r + 45);
    g = Math.min(255, g + 25);
    b = Math.min(255, b + 45);
  }

  return [r, g, b, a];
});

fs.writeFileSync(path.join(blocksDir, 'nether_portal.png'), portalBuffer);
console.log('Successfully generated nether_portal.png!');
