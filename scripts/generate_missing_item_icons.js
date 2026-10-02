import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // Filter 0: None
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

function hexToRgba(hex, alpha = 255) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b, alpha];
}

// 1. Pumpkin Seeds (16x16): Authentic Minecraft clustered beige/tan oval seeds
function generatePumpkinSeeds() {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const OUTLINE = hexToRgba('#4c3a1d');
  const SHADE   = hexToRgba('#937b50');
  const BODY    = hexToRgba('#d1c098');
  const LIGHT   = hexToRgba('#f2e8d1');

  // Seed 1 (top-left flat oval)
  const seed1 = [
    [5, 3, OUTLINE], [6, 3, OUTLINE],
    [4, 4, OUTLINE], [5, 4, LIGHT], [6, 4, BODY], [7, 4, OUTLINE],
    [3, 5, OUTLINE], [4, 5, LIGHT], [5, 5, BODY], [6, 5, SHADE], [7, 5, OUTLINE],
    [4, 6, OUTLINE], [5, 6, BODY], [6, 6, SHADE], [7, 6, OUTLINE],
    [5, 7, OUTLINE], [6, 7, OUTLINE]
  ];

  // Seed 2 (middle-right upright seed)
  const seed2 = [
    [10, 4, OUTLINE], [11, 4, OUTLINE],
    [9, 5, OUTLINE], [10, 5, LIGHT], [11, 5, BODY], [12, 5, OUTLINE],
    [9, 6, OUTLINE], [10, 6, LIGHT], [11, 6, BODY], [12, 6, SHADE], [13, 6, OUTLINE],
    [9, 7, OUTLINE], [10, 7, BODY], [11, 7, SHADE], [12, 7, OUTLINE],
    [10, 8, OUTLINE], [11, 8, OUTLINE]
  ];

  // Seed 3 (bottom-left tilted seed)
  const seed3 = [
    [4, 8, OUTLINE], [5, 8, OUTLINE],
    [3, 9, OUTLINE], [4, 9, LIGHT], [5, 9, BODY], [6, 9, OUTLINE],
    [3, 10, OUTLINE], [4, 10, BODY], [5, 10, SHADE], [6, 10, OUTLINE],
    [4, 11, OUTLINE], [5, 11, OUTLINE]
  ];

  // Seed 4 (bottom-right seed)
  const seed4 = [
    [8, 9, OUTLINE], [9, 9, OUTLINE],
    [7, 10, OUTLINE], [8, 10, LIGHT], [9, 10, BODY], [10, 10, OUTLINE],
    [7, 11, OUTLINE], [8, 11, BODY], [9, 11, SHADE], [10, 11, OUTLINE],
    [8, 12, OUTLINE], [9, 12, OUTLINE]
  ];

  [...seed1, ...seed2, ...seed3, ...seed4].forEach(([x, y, col]) => {
    grid[y][x] = col;
  });

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// 2. Melon Seeds (16x16): Dark mahogany / black pointed teardrop seeds
function generateMelonSeeds() {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const OUTLINE = hexToRgba('#18100a');
  const BODY    = hexToRgba('#3c2317');
  const LIGHT   = hexToRgba('#6b422a');
  const HIGHLT  = hexToRgba('#996a4b');

  // Seed 1 (top-right teardrop)
  const s1 = [
    [10, 3, OUTLINE],
    [9, 4, OUTLINE], [10, 4, HIGHLT], [11, 4, OUTLINE],
    [9, 5, OUTLINE], [10, 5, LIGHT], [11, 5, BODY], [12, 5, OUTLINE],
    [9, 6, OUTLINE], [10, 6, BODY], [11, 6, BODY], [12, 6, OUTLINE],
    [10, 7, OUTLINE], [11, 7, OUTLINE]
  ];

  // Seed 2 (center-left teardrop)
  const s2 = [
    [5, 4, OUTLINE],
    [4, 5, OUTLINE], [5, 5, HIGHLT], [6, 5, OUTLINE],
    [4, 6, OUTLINE], [5, 6, LIGHT], [6, 6, BODY], [7, 6, OUTLINE],
    [4, 7, OUTLINE], [5, 7, BODY], [6, 7, BODY], [7, 7, OUTLINE],
    [5, 8, OUTLINE], [6, 8, OUTLINE]
  ];

  // Seed 3 (bottom-left)
  const s3 = [
    [3, 9, OUTLINE],
    [2, 10, OUTLINE], [3, 10, HIGHLT], [4, 10, OUTLINE],
    [2, 11, OUTLINE], [3, 11, LIGHT], [4, 11, BODY], [5, 11, OUTLINE],
    [3, 12, OUTLINE], [4, 12, BODY], [5, 12, OUTLINE],
    [4, 13, OUTLINE]
  ];

  // Seed 4 (bottom-right)
  const s4 = [
    [8, 9, OUTLINE],
    [7, 10, OUTLINE], [8, 10, HIGHLT], [9, 10, OUTLINE],
    [7, 11, OUTLINE], [8, 11, LIGHT], [9, 11, BODY], [10, 11, OUTLINE],
    [7, 12, OUTLINE], [8, 12, BODY], [9, 12, BODY], [10, 12, OUTLINE],
    [8, 13, OUTLINE], [9, 13, OUTLINE]
  ];

  [...s1, ...s2, ...s3, ...s4].forEach(([x, y, col]) => {
    grid[y][x] = col;
  });

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// 3. Beetroot Seeds (16x16): Irregular craggy seeds with earthy brown & pinkish-red tones
function generateBeetrootSeeds() {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const OUTLINE = hexToRgba('#331d16');
  const BROWN   = hexToRgba('#6b432e');
  const RED     = hexToRgba('#a33b3b');
  const PINK    = hexToRgba('#c25555');
  const LIGHT   = hexToRgba('#a67759');

  const pixels = [
    // Top granule
    [6, 3, OUTLINE], [7, 3, OUTLINE],
    [5, 4, OUTLINE], [6, 4, LIGHT], [7, 4, RED], [8, 4, OUTLINE],
    [5, 5, OUTLINE], [6, 5, RED], [7, 5, BROWN], [8, 5, OUTLINE],
    [6, 6, OUTLINE], [7, 6, OUTLINE],

    // Right granule
    [10, 5, OUTLINE], [11, 5, OUTLINE],
    [9, 6, OUTLINE], [10, 6, PINK], [11, 6, BROWN], [12, 6, OUTLINE],
    [9, 7, OUTLINE], [10, 7, RED], [11, 7, BROWN], [12, 7, OUTLINE],
    [10, 8, OUTLINE], [11, 8, OUTLINE],

    // Center-left granule
    [4, 7, OUTLINE], [5, 7, OUTLINE],
    [3, 8, OUTLINE], [4, 8, LIGHT], [5, 8, BROWN], [6, 8, OUTLINE],
    [3, 9, OUTLINE], [4, 9, RED], [5, 9, BROWN], [6, 9, OUTLINE],
    [4, 10, OUTLINE], [5, 10, OUTLINE],

    // Center-bottom granule
    [7, 9, OUTLINE], [8, 9, OUTLINE],
    [6, 10, OUTLINE], [7, 10, PINK], [8, 10, LIGHT], [9, 10, OUTLINE],
    [6, 11, OUTLINE], [7, 11, RED], [8, 11, BROWN], [9, 11, OUTLINE],
    [7, 12, OUTLINE], [8, 12, OUTLINE],

    // Bottom-right granule
    [10, 10, OUTLINE], [11, 10, OUTLINE],
    [9, 11, OUTLINE], [10, 11, LIGHT], [11, 11, RED], [12, 11, OUTLINE],
    [10, 12, OUTLINE], [11, 12, BROWN], [12, 12, OUTLINE],
    [11, 13, OUTLINE]
  ];

  pixels.forEach(([x, y, col]) => {
    grid[y][x] = col;
  });

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// 4. Torchflower Seeds (16x16)
function generateTorchflowerSeeds() {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const HUSK   = hexToRgba('#421c52');
  const AMBER  = hexToRgba('#d97706');
  const GOLD   = hexToRgba('#f59e0b');
  const YELLOW = hexToRgba('#fef08a');
  const BRIGHT = hexToRgba('#ffffff');

  const pixels = [
    [7, 2, HUSK], [8, 2, HUSK],
    [6, 3, HUSK], [7, 3, AMBER], [8, 3, GOLD], [9, 3, HUSK],
    [5, 4, HUSK], [6, 4, GOLD], [7, 4, YELLOW], [8, 4, BRIGHT], [9, 4, GOLD], [10, 4, HUSK],
    [5, 5, HUSK], [6, 5, AMBER], [7, 5, YELLOW], [8, 5, YELLOW], [9, 5, AMBER], [10, 5, HUSK],
    [5, 6, HUSK], [6, 6, HUSK], [7, 6, AMBER], [8, 6, GOLD], [9, 6, HUSK], [10, 6, HUSK],
    [6, 7, HUSK], [7, 7, HUSK], [8, 7, HUSK], [9, 7, HUSK],
    [6, 8, HUSK], [7, 8, HUSK], [8, 8, HUSK], [9, 8, HUSK],
    [7, 9, HUSK], [8, 9, HUSK],
    [7, 10, HUSK], [8, 10, HUSK],
    [7, 11, HUSK], [8, 11, HUSK],
    [7, 12, HUSK]
  ];

  pixels.forEach(([x, y, col]) => {
    grid[y][x] = col;
  });

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// 5. Pitcher Pod (16x16)
function generatePitcherPod() {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const DARK   = hexToRgba('#0f3f42');
  const TEAL   = hexToRgba('#0d9488');
  const CYAN   = hexToRgba('#14b8a6');
  const LIGHT  = hexToRgba('#5eead4');
  const MINT   = hexToRgba('#a7f3d0');

  const pixels = [
    [7, 2, DARK], [8, 2, DARK],
    [6, 3, DARK], [7, 3, LIGHT], [8, 3, MINT], [9, 3, DARK],
    [5, 4, DARK], [6, 4, CYAN], [7, 4, LIGHT], [8, 4, LIGHT], [9, 4, CYAN], [10, 4, DARK],
    [5, 5, DARK], [6, 5, TEAL], [7, 5, CYAN], [8, 5, CYAN], [9, 5, TEAL], [10, 5, DARK],
    [5, 6, DARK], [6, 6, TEAL], [7, 6, CYAN], [8, 6, CYAN], [9, 6, TEAL], [10, 6, DARK],
    [5, 7, DARK], [6, 7, TEAL], [7, 7, TEAL], [8, 7, TEAL], [9, 7, TEAL], [10, 7, DARK],
    [6, 8, DARK], [7, 8, TEAL], [8, 8, TEAL], [9, 8, DARK],
    [6, 9, DARK], [7, 9, DARK], [8, 9, DARK], [9, 9, DARK],
    [7, 10, DARK], [8, 10, DARK],
    [7, 11, DARK], [8, 11, DARK]
  ];

  pixels.forEach(([x, y, col]) => {
    grid[y][x] = col;
  });

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// 6. Minecart variants & Boat with Chest
function generateMinecartBase(overlayRenderer) {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const OUTLINE = hexToRgba('#222222');
  const RIM     = hexToRgba('#9e9e9e');
  const BODY    = hexToRgba('#616161');
  const SHADE   = hexToRgba('#424242');
  const WHEEL   = hexToRgba('#2b2b2b');

  // Minecart chassis
  // Rim top line: y: 8..9
  for (let x = 1; x <= 14; x++) {
    grid[9][x] = RIM;
    grid[8][x] = OUTLINE;
  }
  // Left wall
  grid[9][1] = OUTLINE;
  grid[10][1] = OUTLINE;
  grid[11][2] = OUTLINE;
  grid[12][3] = OUTLINE;
  grid[10][2] = BODY;
  grid[11][3] = BODY;

  // Right wall
  grid[9][14] = OUTLINE;
  grid[10][14] = OUTLINE;
  grid[11][13] = OUTLINE;
  grid[12][12] = OUTLINE;
  grid[10][13] = SHADE;
  grid[11][12] = SHADE;

  // Bottom body
  for (let x = 3; x <= 12; x++) {
    grid[10][x] = BODY;
    grid[11][x] = SHADE;
    grid[12][x] = OUTLINE;
  }

  // Wheels
  grid[13][3] = WHEEL; grid[13][4] = WHEEL;
  grid[13][11] = WHEEL; grid[13][12] = WHEEL;

  // Render payload overlay inside/on top of cart
  if (overlayRenderer) {
    overlayRenderer(grid);
  }

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// 7. Furnace Minecart
function generateFurnaceMinecart() {
  return generateMinecartBase((grid) => {
    const STONE = hexToRgba('#737373');
    const DARK  = hexToRgba('#404040');
    const FIRE  = hexToRgba('#ea580c');
    const GLOW  = hexToRgba('#facc15');
    const OUTL  = hexToRgba('#1c1917');

    for (let y = 3; y <= 8; y++) {
      for (let x = 4; x <= 11; x++) {
        if (y === 3 || x === 4 || x === 11) grid[y][x] = OUTL;
        else grid[y][x] = STONE;
      }
    }
    // Furnace opening with fire
    grid[6][6] = DARK; grid[6][7] = DARK; grid[6][8] = DARK; grid[6][9] = DARK;
    grid[7][6] = FIRE; grid[7][7] = GLOW; grid[7][8] = GLOW; grid[7][9] = FIRE;
  });
}

// 8. Hopper Minecart
function generateHopperMinecart() {
  return generateMinecartBase((grid) => {
    const HOP_DARK = hexToRgba('#374151');
    const HOP_MID  = hexToRgba('#4b5563');
    const HOP_LGT  = hexToRgba('#6b7280');
    const OUTL     = hexToRgba('#111827');

    // Funnel rim
    for (let x = 3; x <= 12; x++) {
      grid[4][x] = OUTL;
      grid[5][x] = (x === 3 || x === 12) ? OUTL : HOP_LGT;
    }
    // Funnel bowl
    for (let x = 5; x <= 10; x++) {
      grid[6][x] = (x === 5 || x === 10) ? OUTL : HOP_MID;
      grid[7][x] = (x === 5 || x === 10) ? OUTL : HOP_DARK;
    }
    grid[8][6] = HOP_DARK; grid[8][7] = HOP_DARK;
    grid[8][8] = HOP_DARK; grid[8][9] = HOP_DARK;
  });
}

// 9. TNT Minecart
function generateTntMinecart() {
  return generateMinecartBase((grid) => {
    const RED   = hexToRgba('#dc2626');
    const WHITE = hexToRgba('#f8fafc');
    const BLACK = hexToRgba('#0f172a');
    const FUSE  = hexToRgba('#78716c');

    // Fuse
    grid[2][7] = FUSE;
    grid[2][8] = hexToRgba('#f59e0b');

    // TNT block
    for (let y = 3; y <= 8; y++) {
      for (let x = 4; x <= 11; x++) {
        if (y === 3 || x === 4 || x === 11) grid[y][x] = BLACK;
        else if (y === 5 || y === 6) grid[y][x] = WHITE; // White stripe
        else grid[y][x] = RED;
      }
    }
    // "TNT" black text dots
    grid[5][5] = BLACK; grid[6][5] = BLACK; // T
    grid[5][7] = BLACK; grid[6][7] = BLACK; // N
    grid[5][8] = BLACK; grid[6][8] = BLACK;
    grid[5][10] = BLACK; grid[6][10] = BLACK; // T
  });
}

// 10. Chest Boat
function generateChestBoat() {
  const grid = Array(16).fill(null).map(() => Array(16).fill(null));

  const WOOD_OUTL = hexToRgba('#3e2716');
  const WOOD_BODY = hexToRgba('#85542e');
  const WOOD_LGT  = hexToRgba('#a66e3d');
  const CHEST_OUT = hexToRgba('#27170c');
  const CHEST_BOD = hexToRgba('#78471f');
  const CHEST_LCK = hexToRgba('#eab308');

  // Boat hull
  for (let x = 1; x <= 14; x++) {
    grid[10][x] = WOOD_LGT;
    grid[11][x] = WOOD_BODY;
    grid[12][x] = WOOD_OUTL;
  }
  grid[9][0] = WOOD_OUTL; grid[10][0] = WOOD_OUTL;
  grid[9][15] = WOOD_OUTL; grid[10][15] = WOOD_OUTL;
  for (let x = 3; x <= 12; x++) {
    grid[13][x] = WOOD_OUTL;
  }

  // Chest in center of boat
  for (let y = 4; y <= 9; y++) {
    for (let x = 5; x <= 10; x++) {
      if (y === 4 || x === 5 || x === 10) grid[y][x] = CHEST_OUT;
      else grid[y][x] = CHEST_BOD;
    }
  }
  // Chest latch line & lock
  for (let x = 5; x <= 10; x++) grid[6][x] = CHEST_OUT;
  grid[6][7] = CHEST_LCK; grid[7][7] = CHEST_LCK;

  return createPNG(16, 16, (x, y) => grid[y][x] || [0, 0, 0, 0]);
}

// SVG Assets for Rails & Tripwire
const railSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <!-- Wooden Ties -->
  <rect x="2" y="2" width="12" height="2" fill="#85542e" />
  <rect x="2" y="3" width="12" height="1" fill="#5c3814" />
  <rect x="2" y="7" width="12" height="2" fill="#85542e" />
  <rect x="2" y="8" width="12" height="1" fill="#5c3814" />
  <rect x="2" y="12" width="12" height="2" fill="#85542e" />
  <rect x="2" y="13" width="12" height="1" fill="#5c3814" />

  <!-- Iron Rails (Left & Right) -->
  <rect x="3" y="0" width="2" height="16" fill="#a0a0a0" />
  <rect x="3" y="0" width="1" height="16" fill="#e0e0e0" />
  <rect x="4" y="0" width="1" height="16" fill="#606060" />

  <rect x="11" y="0" width="2" height="16" fill="#a0a0a0" />
  <rect x="11" y="0" width="1" height="16" fill="#e0e0e0" />
  <rect x="12" y="0" width="1" height="16" fill="#606060" />
</svg>`;

const poweredRailSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <!-- Wooden Ties -->
  <rect x="2" y="2" width="12" height="2" fill="#85542e" />
  <rect x="2" y="7" width="12" height="2" fill="#85542e" />
  <rect x="2" y="12" width="12" height="2" fill="#85542e" />

  <!-- Redstone Core Power Line in center -->
  <rect x="7" y="0" width="2" height="16" fill="#dc2626" />
  <rect x="7" y="0" width="1" height="16" fill="#f87171" />

  <!-- Gold Rails (Left & Right) -->
  <rect x="3" y="0" width="2" height="16" fill="#facc15" />
  <rect x="3" y="0" width="1" height="16" fill="#fef08a" />
  <rect x="4" y="0" width="1" height="16" fill="#ca8a04" />

  <rect x="11" y="0" width="2" height="16" fill="#facc15" />
  <rect x="11" y="0" width="1" height="16" fill="#fef08a" />
  <rect x="12" y="0" width="1" height="16" fill="#ca8a04" />
</svg>`;

const tripwireHookSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <!-- Wood Baseplate -->
  <rect x="6" y="3" width="4" height="6" fill="#78350f" />
  <rect x="6" y="3" width="3" height="5" fill="#a16207" />
  <rect x="7" y="4" width="2" height="4" fill="#b45309" />

  <!-- Iron Hook Mechanism -->
  <rect x="7" y="6" width="2" height="2" fill="#9ca3af" />
  <rect x="7" y="8" width="4" height="2" fill="#6b7280" />
  <rect x="10" y="8" width="2" height="4" fill="#4b5563" />
  <rect x="9" y="11" width="2" height="2" fill="#374151" />
</svg>`;

const tripwireSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
  <!-- Horizontal Taut Tripwire String -->
  <rect x="0" y="7" width="16" height="1" fill="#f3f4f6" opacity="0.85" />
  <rect x="0" y="8" width="16" height="1" fill="#6b7280" opacity="0.5" />
</svg>`;

// Write all generated files
fs.writeFileSync('public/assets/items/pumpkin_seeds.png', generatePumpkinSeeds());
fs.writeFileSync('public/assets/items/melon_seeds.png', generateMelonSeeds());
fs.writeFileSync('public/assets/items/beetroot_seeds.png', generateBeetrootSeeds());
fs.writeFileSync('public/assets/items/torchflower_seeds.png', generateTorchflowerSeeds());
fs.writeFileSync('public/assets/items/pitcher_pod.png', generatePitcherPod());

fs.writeFileSync('public/assets/items/chest_boat.png', generateChestBoat());
fs.writeFileSync('public/assets/items/furnace_minecart.png', generateFurnaceMinecart());
fs.writeFileSync('public/assets/items/hopper_minecart.png', generateHopperMinecart());
fs.writeFileSync('public/assets/items/tnt_minecart.png', generateTntMinecart());

fs.writeFileSync('public/assets/blocks/rail.svg', railSVG);
fs.writeFileSync('public/assets/blocks/powered_rail.svg', poweredRailSVG);
fs.writeFileSync('public/assets/blocks/tripwire_hook.svg', tripwireHookSVG);
fs.writeFileSync('public/assets/blocks/tripwire.svg', tripwireSVG);

console.log('Successfully generated all missing item and block assets!');
