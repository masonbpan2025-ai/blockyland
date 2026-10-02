import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPng(width, height, pixelData) {
  // pixelData is Buffer of RGBA values of length width * height * 4
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data with filter byte (0) before each scanline
  const scanlineLength = width * 4 + 1;
  const rawData = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rawOffset = y * scanlineLength;
    rawData[rawOffset] = 0; // Filter None
    const pixelOffset = y * width * 4;
    pixelData.copy(rawData, rawOffset + 1, pixelOffset, pixelOffset + width * 4);
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[n] = c;
}

function hexToRgba(hex) {
  const num = parseInt(hex.replace('#', ''), 16);
  return [
    (num >> 16) & 0xff,
    (num >> 8) & 0xff,
    num & 0xff,
    255
  ];
}

function generateGhastTexture(type) {
  const size = 64;
  const pixels = Buffer.alloc(size * size * 4);

  function setPixel(x, y, rgba) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    pixels[idx] = rgba[0];
    pixels[idx + 1] = rgba[1];
    pixels[idx + 2] = rgba[2];
    pixels[idx + 3] = rgba[3];
  }

  function fillRect(x, y, w, h, rgba) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        setPixel(px, py, rgba);
      }
    }
  }

  // 1. Base pale mottled ghost skin across 64x64
  fillRect(0, 0, 64, 64, hexToRgba('#f8fafc'));

  for (let gx = 0; gx < 16; gx++) {
    for (let gy = 0; gy < 16; gy++) {
      const n = (gx * 37 + gy * 73 + (gx ^ gy) * 11) % 19;
      if (n === 0) fillRect(gx * 4, gy * 4, 4, 4, hexToRgba('#ffffff'));
      else if (n === 1 || n === 2) fillRect(gx * 4, gy * 4, 4, 4, hexToRgba('#f1f5f9'));
      else if (n === 3) fillRect(gx * 4, gy * 4, 4, 4, hexToRgba('#e2e8f0'));
      else if (n === 4 && gy > 7) fillRect(gx * 4, gy * 4, 4, 4, hexToRgba('#cbd5e1'));
    }
  }

  // Seam shading
  for (let gx = 0; gx < 16; gx += 2) {
    fillRect(gx * 4, 60, 4, 4, hexToRgba('#94a3b8'));
  }

  if (type === 'ghast') {
    // 2. Idle Crying Face
    // Left eye fold & slit
    fillRect(12, 16, 12, 4, hexToRgba('#64748b'));
    fillRect(12, 20, 12, 4, hexToRgba('#1e293b'));
    fillRect(14, 21, 8, 2, hexToRgba('#0f172a'));

    // Right eye fold & slit
    fillRect(40, 16, 12, 4, hexToRgba('#64748b'));
    fillRect(40, 20, 12, 4, hexToRgba('#1e293b'));
    fillRect(42, 21, 8, 2, hexToRgba('#0f172a'));

    // Left tears
    fillRect(16, 24, 4, 16, hexToRgba('#334155'));
    fillRect(16, 40, 4, 14, hexToRgba('#475569'));
    fillRect(16, 54, 4, 6, hexToRgba('#64748b'));
    fillRect(12, 28, 4, 16, hexToRgba('#94a3b8'));

    // Right tears
    fillRect(44, 24, 4, 16, hexToRgba('#334155'));
    fillRect(44, 40, 4, 14, hexToRgba('#475569'));
    fillRect(44, 54, 4, 6, hexToRgba('#64748b'));
    fillRect(48, 28, 4, 16, hexToRgba('#94a3b8'));

    // Mouth
    fillRect(24, 44, 16, 4, hexToRgba('#1e293b'));
    fillRect(24, 46, 4, 3, hexToRgba('#334155'));
    fillRect(36, 46, 4, 3, hexToRgba('#334155'));
    fillRect(26, 45, 12, 2, hexToRgba('#0f172a'));
  } else if (type === 'ghast_shooting') {
    // 3. Charging/Shooting Face
    // Left eye open
    fillRect(12, 16, 12, 12, hexToRgba('#1c1917'));
    fillRect(14, 18, 8, 8, hexToRgba('#dc2626'));
    fillRect(16, 20, 4, 4, hexToRgba('#f97316'));
    fillRect(17, 21, 2, 2, hexToRgba('#fef08a'));

    // Right eye open
    fillRect(40, 16, 12, 12, hexToRgba('#1c1917'));
    fillRect(42, 18, 8, 8, hexToRgba('#dc2626'));
    fillRect(44, 20, 4, 4, hexToRgba('#f97316'));
    fillRect(45, 21, 2, 2, hexToRgba('#fef08a'));

    // Tears
    fillRect(16, 28, 4, 14, hexToRgba('#334155'));
    fillRect(16, 42, 4, 12, hexToRgba('#475569'));
    fillRect(16, 54, 4, 6, hexToRgba('#64748b'));
    fillRect(12, 30, 4, 14, hexToRgba('#94a3b8'));

    fillRect(44, 28, 4, 14, hexToRgba('#334155'));
    fillRect(44, 42, 4, 12, hexToRgba('#475569'));
    fillRect(44, 54, 4, 6, hexToRgba('#64748b'));
    fillRect(48, 30, 4, 14, hexToRgba('#94a3b8'));

    // Gaping mouth
    fillRect(20, 36, 24, 20, hexToRgba('#18181b'));
    fillRect(22, 38, 20, 16, hexToRgba('#7f1d1d'));
    fillRect(24, 40, 16, 12, hexToRgba('#b91c1c'));
    fillRect(26, 42, 12, 8, hexToRgba('#ea580c'));
    fillRect(28, 44, 8, 4, hexToRgba('#f97316'));
    fillRect(30, 45, 4, 2, hexToRgba('#fef08a'));
  }

  return createPng(size, size, pixels);
}

const dir = path.resolve('public/assets/entity');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

fs.writeFileSync(path.join(dir, 'ghast_plain.png'), generateGhastTexture('ghast_plain'));
fs.writeFileSync(path.join(dir, 'ghast.png'), generateGhastTexture('ghast'));
fs.writeFileSync(path.join(dir, 'ghast_shooting.png'), generateGhastTexture('ghast_shooting'));
console.log('Ghast textures written successfully.');
