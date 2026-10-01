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

const itemsDir = path.resolve('public/assets/items');
if (!fs.existsSync(itemsDir)) {
  fs.mkdirSync(itemsDir, { recursive: true });
}

// Map of item name -> pixel painter (16x16)
const itemPainters = {
  'chicken.png': (x, y) => {
    // Pale pink/beige poultry leg shape
    const dx = x - 8, dy = y - 8;
    if (x >= 4 && x <= 11 && y >= 4 && y <= 11 && Math.hypot(dx, dy) <= 4.5) {
      if (x >= 5 && x <= 8 && y >= 5 && y <= 8) return [240, 195, 175, 255];
      return [215, 160, 145, 255];
    }
    if (x >= 9 && x <= 13 && y >= 10 && y <= 13) return [225, 220, 205, 255]; // bone part
    return [0, 0, 0, 0];
  },
  'cooked_chicken.png': (x, y) => {
    // Roasted brown drumstick
    const dx = x - 8, dy = y - 8;
    if (x >= 4 && x <= 11 && y >= 4 && y <= 11 && Math.hypot(dx, dy) <= 4.5) {
      if (x >= 5 && x <= 8 && y >= 5 && y <= 8) return [190, 105, 40, 255];
      return [135, 70, 25, 255];
    }
    if (x >= 9 && x <= 13 && y >= 10 && y <= 13) return [235, 230, 215, 255];
    return [0, 0, 0, 0];
  },
  'mutton.png': (x, y) => {
    // Raw mutton reddish cut
    if (x >= 4 && x <= 12 && y >= 5 && y <= 11) {
      if (x >= 10 && y <= 7) return [230, 225, 220, 255]; // fat
      if (x <= 6 || y >= 10) return [140, 45, 45, 255];
      return [195, 65, 65, 255];
    }
    return [0, 0, 0, 0];
  },
  'cooked_mutton.png': (x, y) => {
    // Cooked mutton hearty brown
    if (x >= 4 && x <= 12 && y >= 5 && y <= 11) {
      if (x >= 10 && y <= 7) return [180, 140, 100, 255];
      if (x <= 6 || y >= 10) return [85, 45, 25, 255];
      return [130, 75, 45, 255];
    }
    return [0, 0, 0, 0];
  },
  'rabbit.png': (x, y) => {
    // Raw rabbit meat pale pinkish
    if (x >= 5 && x <= 11 && y >= 4 && y <= 12) {
      if (x >= 6 && x <= 10 && y >= 6 && y <= 10) return [225, 160, 160, 255];
      return [175, 110, 110, 255];
    }
    return [0, 0, 0, 0];
  },
  'cooked_rabbit.png': (x, y) => {
    // Cooked rabbit
    if (x >= 5 && x <= 11 && y >= 4 && y <= 12) {
      if (x >= 6 && x <= 10 && y >= 6 && y <= 10) return [175, 115, 60, 255];
      return [115, 70, 35, 255];
    }
    return [0, 0, 0, 0];
  },
  'kelp.png': (x, y) => {
    // Wavy green kelp stalk
    const mid = 8 + Math.round(Math.sin(y * 0.8) * 2);
    if (Math.abs(x - mid) <= 1 && y >= 2 && y <= 14) {
      return [45, 120, 45, 255];
    }
    if ((x === mid - 2 && y % 3 === 0) || (x === mid + 2 && y % 3 === 1)) {
      return [60, 155, 55, 255];
    }
    return [0, 0, 0, 0];
  },
  'dried_kelp.png': (x, y) => {
    // Dark brownish-green dried kelp roll/strip
    if (x >= 5 && x <= 11 && y >= 4 && y <= 12) {
      if ((x + y) % 3 === 0) return [40, 55, 30, 255];
      return [25, 40, 20, 255];
    }
    return [0, 0, 0, 0];
  },
  'raw_iron.png': (x, y) => {
    // Raw iron nugget / chunk
    const d = Math.hypot(x - 8, y - 8);
    if (d <= 4.2) {
      if (x <= 7 && y <= 7) return [215, 185, 160, 255];
      if (d <= 2.5) return [175, 140, 120, 255];
      return [120, 95, 80, 255];
    }
    return [0, 0, 0, 0];
  },
  'raw_gold.png': (x, y) => {
    // Raw gold chunk
    const d = Math.hypot(x - 8, y - 8);
    if (d <= 4.2) {
      if (x <= 7 && y <= 7) return [255, 230, 70, 255];
      if (d <= 2.5) return [225, 185, 30, 255];
      return [160, 125, 15, 255];
    }
    return [0, 0, 0, 0];
  },
  'raw_copper.png': (x, y) => {
    // Raw copper chunk
    const d = Math.hypot(x - 8, y - 8);
    if (d <= 4.2) {
      if (x <= 7 && y <= 7) return [235, 140, 95, 255];
      if (d <= 2.5) return [185, 95, 60, 255];
      return [125, 60, 40, 255];
    }
    return [0, 0, 0, 0];
  },
  'clay_ball.png': (x, y) => {
    // Gray-blue round ball
    const d = Math.hypot(x - 8, y - 8);
    if (d <= 4) {
      if (x <= 7 && y <= 7) return [180, 190, 205, 255];
      if (d <= 2.5) return [150, 160, 175, 255];
      return [115, 125, 140, 255];
    }
    return [0, 0, 0, 0];
  },
  'brick.png': (x, y) => {
    // Red clay brick rectangular
    if (x >= 4 && x <= 12 && y >= 6 && y <= 10) {
      if (x === 4 || y === 6) return [180, 85, 65, 255];
      if (x === 12 || y === 10) return [105, 45, 35, 255];
      return [145, 65, 50, 255];
    }
    return [0, 0, 0, 0];
  },
  'green_dye.png': (x, y) => {
    // Cactus green dye pouch
    const d = Math.hypot(x - 8, y - 9);
    if (d <= 3.8 || (x >= 7 && x <= 9 && y >= 4 && y <= 6)) {
      if (y <= 6) return [150, 140, 110, 255]; // string tie
      if (x <= 7 && y <= 9) return [70, 165, 50, 255];
      return [35, 105, 25, 255];
    }
    return [0, 0, 0, 0];
  },
  'nether_brick.png': (x, y) => {
    // Dark maroon brick
    if (x >= 4 && x <= 12 && y >= 6 && y <= 10) {
      if (x === 4 || y === 6) return [75, 35, 45, 255];
      if (x === 12 || y === 10) return [30, 12, 18, 255];
      return [50, 22, 30, 255];
    }
    return [0, 0, 0, 0];
  }
};

for (const [filename, painter] of Object.entries(itemPainters)) {
  const filePath = path.join(itemsDir, filename);
  if (!fs.existsSync(filePath)) {
    const buf = createPNG(16, 16, painter);
    fs.writeFileSync(filePath, buf);
    console.log('Created icon:', filename);
  }
}
