import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter type: None
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
    crc.writeInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filter
  ihdr[12] = 0; // non-interlaced

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
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return c ^ -1;
}

const ITEMS_DIR = 'public/assets/items';
const BLOCKS_DIR = 'public/assets/blocks';
if (!fs.existsSync(ITEMS_DIR)) fs.mkdirSync(ITEMS_DIR, { recursive: true });
if (!fs.existsSync(BLOCKS_DIR)) fs.mkdirSync(BLOCKS_DIR, { recursive: true });

function savePNG(filepath, fn) {
  if (fs.existsSync(filepath)) return; // don't overwrite if present
  const png = createPNG(16, 16, fn);
  fs.writeFileSync(filepath, png);
}

// 1. Wither Skeleton Skull
savePNG(path.join(ITEMS_DIR, 'wither_skeleton_skull.png'), (x, y) => {
  if (x >= 4 && x <= 11 && y >= 3 && y <= 12) {
    if ((x === 5 || x === 6 || x === 9 || x === 10) && (y === 6 || y === 7)) return [0, 0, 0, 0]; // Eye sockets
    if (x >= 6 && x <= 9 && y === 9) return [0, 0, 0, 0]; // Nose
    if ((x === 6 || x === 8) && y === 11) return [10, 10, 12, 255]; // Teeth gap
    const shade = (x + y) % 2 === 0 ? 30 : 20;
    return [shade, shade, shade + 4, 255];
  }
  return [0, 0, 0, 0];
});

// 2. Nether Star
savePNG(path.join(ITEMS_DIR, 'nether_star.png'), (x, y) => {
  const cx = 7.5, cy = 7.5;
  const dist = Math.abs(x - cx) + Math.abs(y - cy);
  const cross = Math.abs(x - cx) <= 1.5 || Math.abs(y - cy) <= 1.5;
  if (dist <= 6 && cross) {
    if (dist <= 2) return [255, 255, 255, 255];
    if (dist <= 4) return [200, 245, 255, 255];
    return [130, 220, 250, 255];
  }
  return [0, 0, 0, 0];
});

// 3. Ghast Tear
savePNG(path.join(ITEMS_DIR, 'ghast_tear.png'), (x, y) => {
  if (x >= 6 && x <= 9 && y >= 4 && y <= 12) {
    const isEdge = x === 6 || x === 9 || y === 4 || y === 12;
    if (isEdge) return [210, 210, 215, 255];
    return [245, 245, 255, 255];
  }
  return [0, 0, 0, 0];
});

// 4. Phantom Membrane
savePNG(path.join(ITEMS_DIR, 'phantom_membrane.png'), (x, y) => {
  if (x >= 4 && x <= 11 && y >= 4 && y <= 11 && (x + y) > 9 && (x + y) < 21) {
    const dark = (x === 4 || y === 4 || x === 11 || y === 11);
    return dark ? [110, 130, 100, 255] : [195, 210, 180, 255];
  }
  return [0, 0, 0, 0];
});

// 5. Carrot on a Stick
savePNG(path.join(ITEMS_DIR, 'carrot_on_a_stick.png'), (x, y) => {
  if (x === y && x >= 3 && x <= 12) return [139, 69, 19, 255]; // Stick
  if (x >= 10 && y <= 6) return [245, 120, 20, 255]; // Carrot
  if (x === 11 && y === 2) return [40, 180, 40, 255]; // Green leafy top
  return [0, 0, 0, 0];
});

// 6. Warped Fungus on a Stick
savePNG(path.join(ITEMS_DIR, 'warped_fungus_on_a_stick.png'), (x, y) => {
  if (x === y && x >= 3 && x <= 12) return [139, 69, 19, 255];
  if (x >= 10 && y <= 6) return [20, 150, 140, 255];
  return [0, 0, 0, 0];
});

// 7. Dragon Egg
savePNG(path.join(ITEMS_DIR, 'dragon_egg.png'), (x, y) => {
  const dx = Math.abs(x - 7.5);
  const dy = Math.abs(y - 8);
  if (dx * 1.3 + dy <= 6.5) {
    if ((x + y * 3) % 5 === 0) return [160, 50, 200, 255]; // Purple speckles
    return [24, 18, 30, 255];
  }
  return [0, 0, 0, 0];
});

// 8. End Crystal
savePNG(path.join(ITEMS_DIR, 'end_crystal.png'), (x, y) => {
  if (x >= 5 && x <= 10 && y >= 5 && y <= 10) {
    if (x === 7 && y === 7) return [255, 100, 255, 255];
    return [180, 60, 220, 240];
  }
  if (x >= 4 && x <= 11 && (y === 4 || y === 11 || x === 4 || x === 11)) {
    return [220, 220, 240, 150]; // Glass frame
  }
  return [0, 0, 0, 0];
});

// 9. Prismarine Shard
savePNG(path.join(ITEMS_DIR, 'prismarine_shard.png'), (x, y) => {
  if (x >= 5 && x <= 10 && y >= 4 && y <= 11 && Math.abs(x - 7.5) + Math.abs(y - 7.5) <= 5) {
    return [85, 165, 150, 255];
  }
  return [0, 0, 0, 0];
});

// 10. Prismarine Crystals
savePNG(path.join(ITEMS_DIR, 'prismarine_crystals.png'), (x, y) => {
  if (Math.abs(x - 7.5) + Math.abs(y - 7.5) <= 4) {
    return [190, 240, 230, 255];
  }
  return [0, 0, 0, 0];
});

// 11. Glow Ink Sac
savePNG(path.join(ITEMS_DIR, 'glow_ink_sac.png'), (x, y) => {
  if (Math.abs(x - 7.5) + Math.abs(y - 7.5) <= 4.5) {
    return [30, 220, 200, 255];
  }
  return [0, 0, 0, 0];
});

// 12. Ink Sac
savePNG(path.join(ITEMS_DIR, 'ink_sac.png'), (x, y) => {
  if (Math.abs(x - 7.5) + Math.abs(y - 7.5) <= 4.5) {
    return [25, 25, 30, 255];
  }
  return [0, 0, 0, 0];
});

// Helper for standard Minecraft spawn egg pattern
function makeSpawnEgg(baseColor, spotColor) {
  return (x, y) => {
    const dx = Math.abs(x - 7.5);
    const dy = (y - 8.5) * 0.9;
    if (dx * dx + dy * dy <= 22) {
      // Spots pattern
      if ((x === 6 && y === 6) || (x === 7 && y === 6) ||
          (x === 9 && y === 8) || (x === 10 && y === 8) ||
          (x === 5 && y === 10) || (x === 6 && y === 10) ||
          (x === 8 && y === 11)) {
        return spotColor;
      }
      return baseColor;
    }
    return [0, 0, 0, 0];
  };
}

const EGG_COLORS = {
  chicken: [[240, 240, 240, 255], [240, 50, 50, 255]],
  horse: [[195, 140, 85, 255], [75, 45, 25, 255]],
  donkey: [[115, 100, 90, 255], [60, 50, 45, 255]],
  wolf: [[210, 205, 195, 255], [190, 40, 40, 255]],
  cat: [[235, 160, 45, 255], [40, 40, 40, 255]],
  slime: [[80, 180, 60, 255], [120, 225, 100, 255]],
  magma_cube: [[50, 10, 10, 255], [240, 150, 20, 255]],
  witch: [[50, 40, 55, 255], [40, 160, 40, 255]],
  ghast: [[240, 240, 245, 255], [180, 180, 185, 255]],
  blaze: [[245, 160, 20, 255], [255, 240, 80, 255]],
  wither_skeleton: [[30, 30, 32, 255], [70, 70, 75, 255]],
  piglin: [[185, 125, 105, 255], [245, 235, 180, 255]],
  strider: [[155, 55, 55, 255], [85, 80, 80, 255]],
  guardian: [[90, 145, 135, 255], [225, 110, 60, 255]],
  elder_guardian: [[195, 190, 175, 255], [180, 120, 90, 255]],
  drowned: [[70, 125, 120, 255], [195, 235, 95, 255]],
  glow_squid: [[35, 120, 115, 255], [115, 240, 220, 255]],
  phantom: [[65, 80, 125, 255], [140, 220, 70, 255]],
  vindicator: [[145, 150, 150, 255], [110, 125, 140, 255]],
  evoker: [[145, 150, 150, 255], [185, 170, 80, 255]],
  ravager: [[115, 120, 120, 255], [85, 90, 95, 255]],
  warden: [[15, 45, 55, 255], [10, 180, 210, 255]],
  ender_dragon: [[20, 20, 22, 255], [200, 60, 230, 255]],
  wither: [[20, 20, 25, 255], [80, 130, 220, 255]]
};

for (const [mob, [base, spot]] of Object.entries(EGG_COLORS)) {
  savePNG(path.join(ITEMS_DIR, `${mob}_spawn_egg.png`), makeSpawnEgg(base, spot));
}

console.log('Mob expansion item assets generated successfully!');
