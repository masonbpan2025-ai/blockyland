import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel + 1;
  const rawData = Buffer.alloc(scanlineLength * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None
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
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([len, body, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

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
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function hexToRgba(hex, alpha = 255) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b, alpha];
}

const itemDir = path.resolve('public/assets/items');
const blockDir = path.resolve('public/assets/blocks');
fs.mkdirSync(itemDir, { recursive: true });
fs.mkdirSync(blockDir, { recursive: true });

function savePNG(filePath, fn, width = 16, height = 16) {
  const buf = createPNG(width, height, fn);
  fs.writeFileSync(filePath, buf);
}

// =============================================================================
// 1. DOORS (All 17 wood and metal types)
// =============================================================================

const WOOD_DOOR_PROFILES = {
  oak: {
    border: '#4c3319', base: '#85542e', light: '#a27440', dark: '#5c3814',
    handle: '#26180c', handleX: 4, style: 'panes_6'
  },
  spruce: {
    border: '#382516', base: '#664c33', light: '#7c5e3f', dark: '#4a3320',
    handle: '#222222', handleX: 4, style: 'horizontal_3'
  },
  birch: {
    border: '#7c6d48', base: '#d7c185', light: '#f4e0a5', dark: '#b29c61',
    handle: '#333333', handleX: 4, style: 'slots_3'
  },
  jungle: {
    border: '#593e2b', base: '#a07455', light: '#bd8b67', dark: '#7e573a',
    handle: '#26180c', handleX: 4, style: 'circle_window'
  },
  acacia: {
    border: '#6e381c', base: '#ba6336', light: '#d67a48', dark: '#914922',
    handle: '#2b1b11', handleX: 4, style: 'grille_slats'
  },
  dark_oak: {
    border: '#24160a', base: '#462f18', light: '#5c3e20', dark: '#301f0f',
    handle: '#fbc02d', handleX: 4, style: 'panels_8'
  },
  mangrove: {
    border: '#461c1c', base: '#783636', light: '#964848', dark: '#5c2424',
    handle: '#221010', handleX: 4, style: 'slats_4'
  },
  cherry: {
    border: '#8f5669', base: '#e39bb0', light: '#f7b5c8', dark: '#be788e',
    handle: '#4a2832', handleX: 4, style: 'heart_window'
  },
  bamboo: {
    border: '#565c1c', base: '#98a33d', light: '#b8c454', dark: '#737a28',
    handle: '#424712', handleX: 4, style: 'bamboo_stalks'
  },
  crimson: {
    border: '#441624', base: '#7e354f', light: '#9e4665', dark: '#5e2336',
    handle: '#fff0a0', handleX: 4, style: 'vertical_grain'
  },
  warped: {
    border: '#163b3a', base: '#2f6d6c', light: '#418a89', dark: '#1e4f4e',
    handle: '#ff9050', handleX: 4, style: 'vertical_grain'
  },
  pale_oak: {
    border: '#6b6965', base: '#d4d0c8', light: '#e8e5de', dark: '#a8a59e',
    handle: '#363432', handleX: 4, style: 'center_slit'
  },
  poplar: {
    border: '#5c5438', base: '#b0a878', light: '#c8c090', dark: '#8c8458',
    handle: '#363220', handleX: 4, style: 'panes_6'
  },
  iron: {
    border: '#5e5e5e', base: '#b5b5b5', light: '#d8d8d8', dark: '#8a8a8a',
    handle: '#333333', handleX: 4, style: 'iron_grates'
  },
  copper: {
    border: '#663322', base: '#c06c4e', light: '#de8766', dark: '#91492e',
    handle: '#442211', handleX: 4, style: 'copper_squares'
  },
  exposed_copper: {
    border: '#554433', base: '#9c7a62', light: '#b8947a', dark: '#775943',
    handle: '#3a2d20', handleX: 4, style: 'copper_squares'
  },
  weathered_copper: {
    border: '#334c3e', base: '#5c8c74', light: '#74a88f', dark: '#426b56',
    handle: '#203328', handleX: 4, style: 'copper_squares'
  },
  oxidized_copper: {
    border: '#28554a', base: '#4da38e', light: '#68c2ac', dark: '#357c6b',
    handle: '#193a32', handleX: 4, style: 'copper_squares'
  }
};

function generateDoorItemIcon(profile) {
  const BORDER = hexToRgba(profile.border);
  const BASE   = hexToRgba(profile.base);
  const LIGHT  = hexToRgba(profile.light);
  const DARK   = hexToRgba(profile.dark);
  const HANDLE = hexToRgba(profile.handle);
  const CUTOUT = hexToRgba('#110b06');
  const GLASS  = hexToRgba('#aee6f7', 200);

  return (x, y) => {
    // Door silhouette is x: 3..12, y: 1..14
    if (x < 3 || x > 12 || y < 1 || y > 14) return [0, 0, 0, 0];
    // Outer perimeter border
    if (x === 3 || x === 12 || y === 1 || y === 14) return BORDER;
    // Horizontal divider between top and bottom half
    if (y === 7) return DARK;
    // Vertical center mullion
    if (x === 7 || x === 8) return DARK;

    // Handle at (handleX, 8)
    if (x === profile.handleX && (y === 7 || y === 8)) return HANDLE;

    // Top half specific styling (y: 2..6)
    if (y >= 2 && y <= 6) {
      if (profile.style === 'panes_6') {
        if ((x === 5 || x === 6 || x === 9 || x === 10) && (y >= 3 && y <= 5)) return GLASS;
      } else if (profile.style === 'iron_grates') {
        if ((x === 5 || x === 6 || x === 9 || x === 10) && (y >= 3 && y <= 5)) return CUTOUT;
      } else if (profile.style === 'horizontal_3') {
        if (y === 4) return DARK;
      } else if (profile.style === 'slots_3') {
        if ((x >= 5 && x <= 10) && (y === 3 || y === 5)) return CUTOUT;
      } else if (profile.style === 'circle_window') {
        if ((x >= 6 && x <= 9) && (y >= 3 && y <= 5)) return CUTOUT;
      } else if (profile.style === 'grille_slats') {
        if (y % 2 === 1 && x >= 5 && x <= 10) return CUTOUT;
      } else if (profile.style === 'heart_window') {
        if ((x === 6 || x === 9) && y === 3) return CUTOUT;
        if ((x >= 6 && x <= 9) && y === 4) return CUTOUT;
        if ((x === 7 || x === 8) && y === 5) return CUTOUT;
      } else if (profile.style === 'slats_4') {
        if ((x === 5 || x === 7 || x === 8 || x === 10) && y >= 3 && y <= 5) return CUTOUT;
      } else if (profile.style === 'copper_squares') {
        if ((x >= 5 && x <= 6 || x >= 9 && x <= 10) && (y >= 3 && y <= 5)) return CUTOUT;
      } else if (profile.style === 'center_slit') {
        if ((x === 7 || x === 8) && y >= 3 && y <= 12) return CUTOUT;
      } else {
        // Recessed panels
        if ((x === 5 || x === 6 || x === 9 || x === 10) && (y >= 3 && y <= 5)) return DARK;
      }
    }

    // Bottom half specific styling (y: 8..13)
    if (y >= 8 && y <= 13) {
      if (profile.style === 'horizontal_3') {
        if (y === 10 || y === 12) return DARK;
      } else if (profile.style === 'slots_3') {
        if ((x >= 5 && x <= 10) && y === 10) return CUTOUT;
      } else if (profile.style === 'grille_slats') {
        if (y % 2 === 1 && x >= 5 && x <= 10) return CUTOUT;
      } else if (profile.style === 'center_slit') {
        if ((x === 7 || x === 8) && y >= 3 && y <= 12) return CUTOUT;
      } else {
        // Standard recessed panels
        if ((x === 5 || x === 6 || x === 9 || x === 10) && (y >= 9 && y <= 12)) return DARK;
      }
    }

    // Background wood texture shading
    if (x === 4 || x === 11 || y === 2 || y === 8) return LIGHT;
    return ((x + y) % 2 === 0) ? BASE : DARK;
  };
}

function generateTrapdoorItemIcon(profile) {
  const BORDER = hexToRgba(profile.border);
  const BASE   = hexToRgba(profile.base);
  const LIGHT  = hexToRgba(profile.light);
  const DARK   = hexToRgba(profile.dark);
  const CUTOUT = hexToRgba('#110b06');

  return (x, y) => {
    // 14x14 square (x: 1..14, y: 1..14)
    if (x < 1 || x > 14 || y < 1 || y > 14) return [0, 0, 0, 0];
    if (x === 1 || x === 14 || y === 1 || y === 14) return BORDER;
    // Crossbars in center
    if (x === 7 || x === 8 || y === 7 || y === 8) return DARK;

    // 4 quadrants
    const isPanel = ((x >= 3 && x <= 6) || (x >= 9 && x <= 12)) &&
                    ((y >= 3 && y <= 6) || (y >= 9 && y <= 12));

    if (isPanel) {
      if (profile.style === 'panes_6' || profile.style === 'iron_grates' || profile.style === 'copper_squares') {
        return CUTOUT;
      }
      if (profile.style === 'slots_3' || profile.style === 'grille_slats') {
        if (y === 4 || y === 11) return CUTOUT;
      }
      return DARK;
    }

    if (x === 2 || x === 13 || y === 2 || y === 13) return LIGHT;
    return ((x + y) % 2 === 0) ? BASE : DARK;
  };
}

// Generate all door & trapdoor item icons
for (const [wood, profile] of Object.entries(WOOD_DOOR_PROFILES)) {
  const doorFile = path.join(itemDir, `${wood}_door.png`);
  savePNG(doorFile, generateDoorItemIcon(profile));

  const trapdoorFile = path.join(itemDir, `${wood}_trapdoor.png`);
  savePNG(trapdoorFile, generateTrapdoorItemIcon(profile));

  // Also handle waxed variants of copper doors
  if (wood.includes('copper')) {
    savePNG(path.join(itemDir, `waxed_${wood}_door.png`), generateDoorItemIcon(profile));
    savePNG(path.join(itemDir, `waxed_${wood}_trapdoor.png`), generateTrapdoorItemIcon(profile));
  }
}

// =============================================================================
// 2. MISSING BLOCK TEXTURES (Pale Oak & Copper Variants)
// =============================================================================

function generateDoorBlockTexture(profile, isTop) {
  const BORDER = hexToRgba(profile.border);
  const BASE   = hexToRgba(profile.base);
  const LIGHT  = hexToRgba(profile.light);
  const DARK   = hexToRgba(profile.dark);
  const CUTOUT = hexToRgba('#110b06');

  return (x, y) => {
    if (x === 0 || x === 15) return BORDER;
    if (isTop && y === 0) return BORDER;
    if (!isTop && y === 15) return BORDER;
    if (x === 7 || x === 8) return DARK;

    if (!isTop && x >= 11 && x <= 13 && y >= 2 && y <= 5) {
      return hexToRgba(profile.handle);
    }

    const isPanel = (x >= 3 && x <= 6 || x >= 9 && x <= 12) && (y >= 3 && y <= 12);
    if (isPanel) {
      if (profile.style === 'iron_grates' || profile.style === 'copper_squares') {
        if (isTop) return CUTOUT;
      }
      return DARK;
    }
    return ((x + y) % 2 === 0) ? BASE : LIGHT;
  };
}

function generateTrapdoorBlockTexture(profile) {
  const BORDER = hexToRgba(profile.border);
  const BASE   = hexToRgba(profile.base);
  const LIGHT  = hexToRgba(profile.light);
  const DARK   = hexToRgba(profile.dark);
  const CUTOUT = hexToRgba('#110b06');

  return (x, y) => {
    if (x === 0 || x === 15 || y === 0 || y === 15) return BORDER;
    if (x === 7 || x === 8 || y === 7 || y === 8) return DARK;
    const isPanel = ((x >= 3 && x <= 6) || (x >= 9 && x <= 12)) && ((y >= 3 && y <= 6) || (y >= 9 && y <= 12));
    if (isPanel) {
      if (profile.style === 'iron_grates' || profile.style === 'copper_squares') return CUTOUT;
      return DARK;
    }
    return ((x + y) % 2 === 0) ? BASE : LIGHT;
  };
}

// Generate missing block textures for pale_oak and copper
const extraDoorBlocks = ['pale_oak', 'copper', 'exposed_copper', 'weathered_copper', 'oxidized_copper'];
for (const wood of extraDoorBlocks) {
  const prof = WOOD_DOOR_PROFILES[wood];
  savePNG(path.join(blockDir, `${wood}_door_top.png`), generateDoorBlockTexture(prof, true));
  savePNG(path.join(blockDir, `${wood}_door_bottom.png`), generateDoorBlockTexture(prof, false));
  savePNG(path.join(blockDir, `${wood}_trapdoor.png`), generateTrapdoorBlockTexture(prof));
}

// =============================================================================
// 3. MOB SPAWN EGGS (Authentic Minecraft 16x16 Egg Silhouette with Dots)
// =============================================================================

const SPAWN_EGGS = {
  spider: ['#342d27', '#a80e0e'],
  cave_spider: ['#0c424e', '#a80e0e'],
  silverfish: ['#6e6e6e', '#303030'],
  endermite: ['#161616', '#6e6e6e'],
  rabbit: ['#995f3a', '#734524'],
  cat: ['#efde7d', '#564434'],
  fox: ['#d56320', '#ffffff'],
  panda: ['#e6e6e6', '#1b1b1b'],
  polar_bear: ['#f2f2f2', '#c4c4c4'],
  parrot: ['#0da70b', '#ff0000'],
  tadpole: ['#6d5337', '#3b2c1c'],
  frog: ['#d07444', '#734831'],
  turtle: ['#389a38', '#e5b326'],
  llama: ['#c09e75', '#995f3a'],
  goat: ['#baaa97', '#5f5548'],
  happy_ghast: ['#ffffff', '#ff99aa'],
  copper_golem: ['#c06c4e', '#4da38e'],
  camel_husk: ['#796030', '#c8923a'],
  piglin_brute: ['#592a18', '#f4b2a8'],
  giant: ['#00afaf', '#799c65'],
  enderman: ['#161616', '#cc00fa'],
  mooshroom: ['#a81012', '#b7b7b7'],
  ocelot: ['#efde7d', '#564434'],
  pufferfish: ['#e59c1c', '#3888c8'],
  shulker: ['#976797', '#4d334d'],
  trader_llama: ['#c09e75', '#465f8a'],
  tropical_fish: ['#ef6915', '#ffffff'],
  vex: ['#7a90a4', '#e8e8e8'],
  zoglin: ['#bf8383', '#5a3d3d'],
  allay: ['#00daf8', '#0076a3'],
  armadillo: ['#a97868', '#5e3931'],
  sniffer: ['#87201b', '#287556'],
  camel: ['#f6bc5e', '#c8923a'],
  creaking: ['#3a3835', '#e86a17'],
  parched: ['#8c6e4e', '#5a4632'],
  illusioner: ['#1b3263', '#9b9b9b'],
  wind_charge_breeze: ['#b6c9dc', '#8243be'],
  breeze: ['#b6c9dc', '#8243be'],
  undead_horse: ['#3a5a40', '#90b080'],
  warden: ['#0f4649', '#39ffd4'],
  bee: ['#edc343', '#43241b'],
  wolf: ['#d7d3d3', '#ceaf96'],
  creeper: ['#0da70b', '#000000'],
  zombie: ['#00afaf', '#799c65'],
  skeleton: ['#c1c1c1', '#494949'],
  slime: ['#51a03e', '#7ebf6e']
};

function generateSpawnEgg(primaryHex, spotHex) {
  const PRIMARY  = hexToRgba(primaryHex);
  const LIGHT    = [Math.min(255, PRIMARY[0] + 40), Math.min(255, PRIMARY[1] + 40), Math.min(255, PRIMARY[2] + 40), 255];
  const DARK     = [Math.max(0, PRIMARY[0] - 50), Math.max(0, PRIMARY[1] - 50), Math.max(0, PRIMARY[2] - 50), 255];
  const OUTLINE  = [Math.max(0, PRIMARY[0] - 90), Math.max(0, PRIMARY[1] - 90), Math.max(0, PRIMARY[2] - 90), 255];
  const SPOT     = hexToRgba(spotHex);
  const SPOT_DARK = [Math.max(0, SPOT[0] - 50), Math.max(0, SPOT[1] - 50), Math.max(0, SPOT[2] - 50), 255];

  // Canonical 16x16 Minecraft egg grid
  // Egg spans x: 4..11, y: 2..13
  const isEgg = (x, y) => {
    if (y < 2 || y > 13) return false;
    if (y === 2 || y === 13) return x >= 6 && x <= 9;
    if (y === 3 || y === 12) return x >= 5 && x <= 10;
    return x >= 4 && x <= 11;
  };

  const isOutline = (x, y) => {
    if (!isEgg(x, y)) return false;
    return !isEgg(x - 1, y) || !isEgg(x + 1, y) || !isEgg(x, y - 1) || !isEgg(x, y + 1);
  };

  const spots = new Set([
    '6,4', '7,4', '6,5',
    '9,6', '10,6', '10,7',
    '5,8', '6,8', '5,9',
    '8,10', '9,10', '8,11'
  ]);

  return (x, y) => {
    if (!isEgg(x, y)) return [0, 0, 0, 0];
    if (isOutline(x, y)) return OUTLINE;
    if (spots.has(`${x},${y}`)) return SPOT;
    if (spots.has(`${x - 1},${y}`) || spots.has(`${x},${y - 1}`)) return SPOT_DARK;

    if (x <= 6 && y <= 5) return LIGHT;
    if (x >= 9 || y >= 11) return DARK;
    return PRIMARY;
  };
}

for (const [mob, [prim, sec]] of Object.entries(SPAWN_EGGS)) {
  const eggPath = path.join(itemDir, `${mob}_spawn_egg.png`);
  savePNG(eggPath, generateSpawnEgg(prim, sec));
}

// =============================================================================
// 4. POTIONS (Bottle with Fluid Color)
// =============================================================================

const POTION_COLORS = {
  healing: '#f82423',
  regeneration: '#cd5cab',
  strength: '#932423',
  swiftness: '#7caafc',
  night_vision: '#1f1fa1',
  water_breathing: '#2e5299',
  leaping: '#22ff4c',
  poison: '#4e9331',
  weakness: '#484d48',
  harming: '#430a09',
  turtle_master: '#8d76d4',
  slowness: '#5a6c81',
  fire_resistance: '#e49a3a',
  invisibility: '#7f8392'
};

function generatePotion(colorHex, type = 'normal') {
  const FLUID = hexToRgba(colorHex);
  const FLUID_LIGHT = [Math.min(255, FLUID[0] + 50), Math.min(255, FLUID[1] + 50), Math.min(255, FLUID[2] + 50), 255];
  const GLASS = hexToRgba('#d0eef7', 220);
  const GLASS_OUTLINE = hexToRgba('#3a5360');
  const CORK = hexToRgba('#966336');

  return (x, y) => {
    // Cork at top (7..8, 1..2)
    if ((x === 7 || x === 8) && (y === 1 || y === 2)) return CORK;
    // Neck (7..8, 3..5)
    if ((x === 6 || x === 9) && (y >= 2 && y <= 5)) return GLASS_OUTLINE;
    if ((x === 7 || x === 8) && (y >= 3 && y <= 5)) return GLASS;

    // Body (4..11, 6..14)
    if (y < 6 || y > 14 || x < 4 || x > 11) return [0, 0, 0, 0];
    if (y === 6 && (x < 5 || x > 10)) return [0, 0, 0, 0];
    if (y === 14 && (x < 5 || x > 10)) return [0, 0, 0, 0];

    // Glass outline
    if (x === 4 || x === 11 || y === 14 || (y === 6 && (x === 5 || x === 10))) {
      return GLASS_OUTLINE;
    }

    // Glass highlight
    if (x === 5 && y >= 7 && y <= 10) return GLASS;

    // Fluid inside
    if (x >= 6 && x <= 8 && y === 8) return FLUID_LIGHT;
    return FLUID;
  };
}

for (const [effect, color] of Object.entries(POTION_COLORS)) {
  for (const prefix of ['', 'splash_', 'lingering_']) {
    for (const suffix of ['', '_2', '_long']) {
      const name = `${prefix}potion_of_${effect}${suffix}.png`;
      savePNG(path.join(itemDir, name), generatePotion(color));
    }
  }
}

// =============================================================================
// 5. SPECIAL NON-BLOCK ITEMS
// =============================================================================

// Gold Nugget
savePNG(path.join(itemDir, 'gold_nugget.png'), (x, y) => {
  if ((x >= 6 && x <= 9 && y >= 6 && y <= 8) || (x >= 7 && x <= 10 && y >= 7 && y <= 9)) {
    if (x === 6 || y === 6) return hexToRgba('#fffb80');
    if (x === 9 || y === 9) return hexToRgba('#b26500');
    return hexToRgba('#f1b017');
  }
  return [0, 0, 0, 0];
});

// Enchanted Golden Apple
savePNG(path.join(itemDir, 'enchanted_golden_apple.png'), (x, y) => {
  if (x < 4 || x > 11 || y < 3 || y > 13) return [0, 0, 0, 0];
  if (x === 7 && y === 2) return hexToRgba('#664422'); // stem
  if (x === 8 && y === 2) return hexToRgba('#338822'); // leaf
  if (x === 4 || x === 11 || y === 13 || (y === 3 && (x <= 5 || x >= 10))) return hexToRgba('#734209');
  if ((x + y) % 3 === 0) return hexToRgba('#ff66ff'); // enchanted shimmer
  if (x <= 6 && y <= 6) return hexToRgba('#ffffa0');
  return hexToRgba('#f5b82e');
});

// Netherite Scrap
savePNG(path.join(itemDir, 'netherite_scrap.png'), (x, y) => {
  if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
    if ((x === 5 || x === 9) && (y === 5 || y === 8)) return hexToRgba('#d18548'); // gold streak
    if (x === 4 || y === 4 || x === 11 || y === 11) return hexToRgba('#1c1a19');
    return ((x + y) % 2 === 0) ? hexToRgba('#3b3531') : hexToRgba('#4d4540');
  }
  return [0, 0, 0, 0];
});

// Spider Eye
savePNG(path.join(itemDir, 'spider_eye.png'), (x, y) => {
  const dx = x - 8, dy = y - 8;
  if (Math.hypot(dx, dy) <= 4.2) {
    if (x === 7 && y === 7) return hexToRgba('#ffffff'); // pupil glare
    if (x >= 6 && x <= 8 && y >= 6 && y <= 8) return hexToRgba('#220000'); // pupil
    if (x <= 6 && y <= 6) return hexToRgba('#ff4444');
    return hexToRgba('#881111');
  }
  return [0, 0, 0, 0];
});

// Turtle Scute
savePNG(path.join(itemDir, 'turtle_scute.png'), (x, y) => {
  if (x >= 4 && x <= 11 && y >= 4 && y <= 11) {
    if (x === 4 || x === 11 || y === 4 || y === 11) return hexToRgba('#163816');
    if (x === 7 || x === 8 || y === 7 || y === 8) return hexToRgba('#66cc66');
    return hexToRgba('#2e7a2e');
  }
  return [0, 0, 0, 0];
});

// Armadillo Scute
savePNG(path.join(itemDir, 'armadillo_scute.png'), (x, y) => {
  if (x >= 4 && x <= 11 && y >= 5 && y <= 11) {
    if (x === 4 || x === 11 || y === 5 || y === 11) return hexToRgba('#3d241d');
    if (y === 7 || y === 9) return hexToRgba('#bf8777');
    return hexToRgba('#8a5547');
  }
  return [0, 0, 0, 0];
});

// Heart of the Sea
savePNG(path.join(itemDir, 'heart_of_the_sea.png'), (x, y) => {
  const dx = x - 8, dy = y - 8;
  if (Math.hypot(dx, dy) <= 4.5) {
    if (x === 6 && y === 6) return hexToRgba('#ffffff');
    if (Math.hypot(dx, dy) <= 2) return hexToRgba('#00ffff');
    if (Math.hypot(dx, dy) <= 3.5) return hexToRgba('#00a8cc');
    return hexToRgba('#005577');
  }
  return [0, 0, 0, 0];
});

// Nautilus Shell
savePNG(path.join(itemDir, 'nautilus_shell.png'), (x, y) => {
  const dx = x - 8, dy = y - 8;
  if (Math.hypot(dx, dy) <= 4.8) {
    if (x % 3 === 0) return hexToRgba('#c2643a'); // orange stripe
    if (x <= 6 && y <= 6) return hexToRgba('#fffbf0');
    return hexToRgba('#e8d8be');
  }
  return [0, 0, 0, 0];
});

// Echo Shard
savePNG(path.join(itemDir, 'echo_shard.png'), (x, y) => {
  if (Math.abs(x - y) <= 2 && x >= 4 && x <= 12 && y >= 4 && y <= 12) {
    if (x === y) return hexToRgba('#00ffff');
    return hexToRgba('#05333d');
  }
  return [0, 0, 0, 0];
});

// Mace
savePNG(path.join(itemDir, 'mace.png'), (x, y) => {
  // Heavy head at top right
  if (x >= 9 && x <= 13 && y >= 2 && y <= 6) {
    if (x === 9 || x === 13 || y === 2 || y === 6) return hexToRgba('#222226');
    if (x === 11 && y === 4) return hexToRgba('#ffffff');
    return hexToRgba('#757582');
  }
  // Breeze core glow
  if (x === 10 && y === 5) return hexToRgba('#5cf0f8');
  // Handle rod running diagonally to bottom left
  if (x === y + 3 && x >= 4 && x <= 10) return hexToRgba('#543920');
  if (x === y + 4 && x >= 4 && x <= 10) return hexToRgba('#8a5e35');
  return [0, 0, 0, 0];
});

// Wind Charge
savePNG(path.join(itemDir, 'wind_charge.png'), (x, y) => {
  const dx = x - 8, dy = y - 8;
  const dist = Math.hypot(dx, dy);
  if (dist <= 4.5 && dist >= 1.5) {
    if ((x + y) % 2 === 0) return hexToRgba('#d4e8f7');
    return hexToRgba('#8ec6ed');
  }
  if (dist < 1.5) return hexToRgba('#ffffff');
  return [0, 0, 0, 0];
});

// Cocoa Beans
savePNG(path.join(itemDir, 'cocoa_beans.png'), (x, y) => {
  if (x >= 4 && x <= 11 && y >= 5 && y <= 11) {
    if (x === 7 || x === 8) return hexToRgba('#331808'); // division
    if (x === 4 || x === 11 || y === 5 || y === 11) return hexToRgba('#4a240c');
    return hexToRgba('#87451a');
  }
  return [0, 0, 0, 0];
});

// Writable Book (Book and Quill)
savePNG(path.join(itemDir, 'writable_book.png'), (x, y) => {
  // Book (x: 3..10, y: 5..13)
  if (x >= 3 && x <= 10 && y >= 5 && y <= 13) {
    if (x === 3 || y === 13) return hexToRgba('#471f0f');
    if (x === 10 || y === 5) return hexToRgba('#edd9b4'); // pages
    return hexToRgba('#7a3a1d');
  }
  // Quill feather (x: 9..14, y: 1..7)
  if (x >= 9 && x <= 14 && y >= 1 && y <= 7) {
    if (x + y >= 10 && x + y <= 15) {
      if (x === 9 && y === 7) return hexToRgba('#222222'); // ink tip
      return hexToRgba('#f0f0f0');
    }
  }
  return [0, 0, 0, 0];
});

console.log('Successfully generated all authentic door, trapdoor, spawn egg, potion, and special item assets!');
