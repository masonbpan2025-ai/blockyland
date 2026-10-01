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

// 1. shield.png (16x16: Curved shield with iron rim, oak wood face, and central iron boss)
const shieldPng = createPNG(16, 16, (x, y) => {
  // Shape of shield (curved bottom)
  if (x < 2 || x > 13 || y < 1 || y > 14) return [0, 0, 0, 0];
  if (y >= 11 && (x < 3 || x > 12)) return [0, 0, 0, 0];
  if (y >= 13 && (x < 5 || x > 10)) return [0, 0, 0, 0];
  if (y === 14 && (x < 6 || x > 9)) return [0, 0, 0, 0];

  // Outer iron rim
  const isRim = (
    y === 1 ||
    x === 2 || x === 13 ||
    (y >= 11 && (x === 3 || x === 12)) ||
    (y >= 13 && (x === 5 || x === 10)) ||
    (y === 14 && (x >= 6 && x <= 9))
  );
  if (isRim) {
    const shine = (x <= 4 || y <= 2) ? 40 : 0;
    return [160 + shine, 165 + shine, 175 + shine, 255];
  }

  // Central iron boss (x 7..8, y 7..8)
  if (x >= 7 && x <= 8 && y >= 7 && y <= 8) {
    return [220, 225, 235, 255];
  }
  if (x >= 6 && x <= 9 && y >= 6 && y <= 9) {
    return [120, 125, 135, 255];
  }

  // Wood planks pattern
  const isSeam = x === 7 || x === 8;
  const noise = (x * 7 + y * 13) % 4;
  if (isSeam) return [110, 70, 30, 255];
  return [140 + noise * 6, 90 + noise * 4, 45 + noise * 2, 255];
});

// Helper for color palettes
const PALETTES = {
  netherite: { main: [52, 48, 56], dark: [34, 30, 38], light: [78, 72, 84] },
  leather: { main: [160, 95, 50], dark: [110, 60, 25], light: [195, 125, 75] },
  chainmail: { main: [145, 145, 155], dark: [85, 85, 95], light: [200, 200, 215] },
  turtle: { main: [45, 135, 75], dark: [25, 85, 45], light: [75, 175, 110] }
};

// Helmet generator
function makeHelmet(palette) {
  return createPNG(16, 16, (x, y) => {
    if (x < 3 || x > 12 || y < 2 || y > 11) return [0, 0, 0, 0];
    // Face opening: x 6..9, y 8..11
    if (x >= 6 && x <= 9 && y >= 8 && y <= 11) return [0, 0, 0, 0];

    const isEdge = x === 3 || x === 12 || y === 2 || (y === 7 && x >= 6 && x <= 9) || (y >= 8 && (x === 5 || x === 10));
    if (isEdge) return [...palette.dark, 255];
    if (x <= 5 || y <= 3) return [...palette.light, 255];
    return [...palette.main, 255];
  });
}

// Chestplate generator
function makeChestplate(palette) {
  return createPNG(16, 16, (x, y) => {
    if (x < 2 || x > 13 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Neck opening: x 6..9, y 2..4
    if (x >= 6 && x <= 9 && y >= 2 && y <= 4) return [0, 0, 0, 0];
    // Arm cutouts: x 5..10, y 5..13 is torso, x 2..4 is left arm, x 11..13 is right arm
    if (y >= 5 && y <= 6 && (x === 4 || x === 11)) return [0, 0, 0, 0];
    if (y > 7 && (x < 4 || x > 11)) return [0, 0, 0, 0];

    const isEdge = x === 2 || x === 13 || y === 2 || y === 13 || x === 4 || x === 11 || (y === 5 && (x >= 6 && x <= 9));
    if (isEdge) return [...palette.dark, 255];
    if (x <= 5 || y <= 4) return [...palette.light, 255];
    return [...palette.main, 255];
  });
}

// Leggings generator
function makeLeggings(palette) {
  return createPNG(16, 16, (x, y) => {
    if (x < 3 || x > 12 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Crotch gap between legs: x 7..8, y 6..13
    if (x >= 7 && x <= 8 && y >= 6) return [0, 0, 0, 0];

    const isEdge = x === 3 || x === 12 || y === 2 || y === 13 || (y >= 6 && (x === 6 || x === 9));
    if (isEdge) return [...palette.dark, 255];
    if (x <= 5 || y <= 4) return [...palette.light, 255];
    return [...palette.main, 255];
  });
}

// Boots generator
function makeBoots(palette) {
  return createPNG(16, 16, (x, y) => {
    if (y < 7 || y > 13) return [0, 0, 0, 0];
    // Left boot: x 3..6, Right boot: x 9..12
    if (x < 3 || (x > 6 && x < 9) || x > 12) return [0, 0, 0, 0];

    const isEdge = x === 3 || x === 6 || x === 9 || x === 12 || y === 7 || y === 13;
    if (isEdge) return [...palette.dark, 255];
    if (x === 4 || x === 10 || y === 8) return [...palette.light, 255];
    return [...palette.main, 255];
  });
}

fs.writeFileSync('public/assets/items/shield.png', shieldPng);
fs.writeFileSync('public/assets/items/netherite_helmet.png', makeHelmet(PALETTES.netherite));
fs.writeFileSync('public/assets/items/netherite_chestplate.png', makeChestplate(PALETTES.netherite));
fs.writeFileSync('public/assets/items/netherite_leggings.png', makeLeggings(PALETTES.netherite));
fs.writeFileSync('public/assets/items/netherite_boots.png', makeBoots(PALETTES.netherite));

fs.writeFileSync('public/assets/items/leather_helmet.png', makeHelmet(PALETTES.leather));
fs.writeFileSync('public/assets/items/leather_leggings.png', makeLeggings(PALETTES.leather));
fs.writeFileSync('public/assets/items/leather_boots.png', makeBoots(PALETTES.leather));

fs.writeFileSync('public/assets/items/chainmail_helmet.png', makeHelmet(PALETTES.chainmail));
fs.writeFileSync('public/assets/items/chainmail_leggings.png', makeLeggings(PALETTES.chainmail));
fs.writeFileSync('public/assets/items/chainmail_boots.png', makeBoots(PALETTES.chainmail));

fs.writeFileSync('public/assets/items/turtle_helmet.png', makeHelmet(PALETTES.turtle));

console.log('Successfully generated shield and all missing armor icons!');
