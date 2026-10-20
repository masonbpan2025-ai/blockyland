import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';

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

function savePNG(filePath, fn, width = 16, height = 16) {
  const buf = createPNG(width, height, fn);
  fs.writeFileSync(filePath, buf);
}

const itemsDir = path.resolve('public/assets/items');
const blocksDir = path.resolve('public/assets/blocks');

// =============================================================================
// PHASE 1: Replace dummy block icons in public/assets/items with real block textures
// =============================================================================
console.log('--- Phase 1: Fixing block item icons ---');
let copiedBlocks = 0;
for (const [key, it] of Object.entries(ITEMS)) {
  if (it.isBlock && it.icon) {
    const itemPath = path.resolve('public' + it.icon);
    const def = it.blockId ? BLOCK_DEFS[it.blockId] : null;
    let texName = null;
    if (def && def.textures) {
      texName = def.textures.all || def.textures.side || def.textures.top;
    }
    if (texName) {
      const blockTexPath = path.resolve(blocksDir, texName);
      if (fs.existsSync(blockTexPath)) {
        // Only replace if item is missing or is dummy <= 102 bytes
        const isDummy = !fs.existsSync(itemPath) || fs.statSync(itemPath).size <= 102;
        if (isDummy) {
          fs.copyFileSync(blockTexPath, itemPath);
          copiedBlocks++;
        }
      }
    }
  }
}
console.log(`Copied ${copiedBlocks} authentic block textures into public/assets/items/`);

// =============================================================================
// PHASE 2: Generate authentic pixel art for all remaining non-block dummy items
// =============================================================================
console.log('--- Phase 2: Generating non-block item icons ---');

// 1. Spawn Eggs
function generateSpawnEgg(shellHex, spotHex) {
  const SHELL = hexToRgba(shellHex);
  const SHELL_DARK = [Math.floor(SHELL[0] * 0.7), Math.floor(SHELL[1] * 0.7), Math.floor(SHELL[2] * 0.7), 255];
  const SHELL_LIGHT = [Math.min(255, Math.floor(SHELL[0] * 1.3)), Math.min(255, Math.floor(SHELL[1] * 1.3)), Math.min(255, Math.floor(SHELL[2] * 1.3)), 255];
  const SPOT = hexToRgba(spotHex);
  const SPOT_DARK = [Math.floor(SPOT[0] * 0.7), Math.floor(SPOT[1] * 0.7), Math.floor(SPOT[2] * 0.7), 255];

  const eggMask = [
    [0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]
  ];

  const spotPattern = (x, y) => {
    if ((x === 6 || x === 7) && (y === 3 || y === 4)) return true;
    if ((x >= 3 && x <= 5) && (y === 6 || y === 7)) return true;
    if ((x >= 9 && x <= 11) && (y === 8 || y === 9)) return true;
    if ((x >= 5 && x <= 7) && (y === 10 || y === 11)) return true;
    if ((x === 10) && (y === 4)) return true;
    if ((x === 3) && (y === 10)) return true;
    return false;
  };

  return (x, y) => {
    if (!eggMask[y] || !eggMask[y][x]) return [0, 0, 0, 0];
    if (spotPattern(x, y)) {
      if (x === 6 || x === 3 || x === 9 || x === 5) return SPOT;
      return SPOT_DARK;
    }
    if (x <= 4 || y <= 3) return SHELL_LIGHT;
    if (x >= 12 || y >= 12) return SHELL_DARK;
    return SHELL;
  };
}

const SPAWN_EGGS = {
  bat_spawn_egg: { shell: '#4c3e30', spot: '#0f0f0f' },
  wandering_trader_spawn_egg: { shell: '#405ea6', spot: '#992222' },
  husk_spawn_egg: { shell: '#786b51', spot: '#dfc688' },
  stray_spawn_egg: { shell: '#5c6a6d', spot: '#cfd7d8' },
  bogged_spawn_egg: { shell: '#616a4f', spot: '#8b7e66' },
  skeleton_horse_spawn_egg: { shell: '#686868', spot: '#e2e2e2' },
  zombie_horse_spawn_egg: { shell: '#315234', spot: '#97a478' },
  camel_spawn_egg: { shell: '#f39b4b', spot: '#be671f' },
  sniffer_spawn_egg: { shell: '#852220', spot: '#22b24c' },
  donkey_spawn_egg: { shell: '#534539', spot: '#34271d' },
  mule_spawn_egg: { shell: '#1b120c', spot: '#534539' }
};

for (const [id, def] of Object.entries(SPAWN_EGGS)) {
  savePNG(path.join(itemsDir, `${id}.png`), generateSpawnEgg(def.shell, def.spot));
}

// 2. Armor Trims / Smithing Templates
const ARMOR_TRIMS = [
  'bolt_armor_trim_smithing_template', 'netherite_upgrade_smithing_template',
  'sentry_armor_trim_smithing_template', 'dune_armor_trim_smithing_template',
  'coast_armor_trim_smithing_template', 'wild_armor_trim_smithing_template',
  'ward_armor_trim_smithing_template', 'eye_armor_trim_smithing_template',
  'vex_armor_trim_smithing_template', 'tide_armor_trim_smithing_template',
  'snout_armor_trim_smithing_template', 'rib_armor_trim_smithing_template',
  'spire_armor_trim_smithing_template', 'wayfinder_armor_trim_smithing_template',
  'shaper_armor_trim_smithing_template', 'silence_armor_trim_smithing_template',
  'raiser_armor_trim_smithing_template', 'host_armor_trim_smithing_template',
  'flow_armor_trim_smithing_template'
];

function generateSmithingTemplate(name) {
  const isNetherite = name.includes('netherite');
  const isFlow = name.includes('flow') || name.includes('bolt');
  const BASE = isNetherite ? hexToRgba('#423c3d') : (isFlow ? hexToRgba('#4a6b82') : hexToRgba('#4f586b'));
  const LIGHT = isNetherite ? hexToRgba('#61595a') : (isFlow ? hexToRgba('#739db8') : hexToRgba('#727e99'));
  const DARK = isNetherite ? hexToRgba('#292526') : (isFlow ? hexToRgba('#2c4354') : hexToRgba('#333845'));
  const EMBLEM = isNetherite ? hexToRgba('#b53f2a') : (isFlow ? hexToRgba('#72e5ff') : hexToRgba('#66e2d5'));

  return (x, y) => {
    // Notch tablet shape
    if (x < 3 || x > 12 || y < 2 || y > 14) return [0, 0, 0, 0];
    if ((x === 3 || x === 12) && (y === 2 || y === 14)) return [0, 0, 0, 0];
    // Center notch at top
    if ((x === 7 || x === 8) && y === 2) return [0, 0, 0, 0];
    // Border
    if (x === 3 || x === 12 || y === 2 || y === 14) return DARK;
    if (x === 4 || y === 3) return LIGHT;

    // Emblem in center
    if ((x >= 6 && x <= 9) && (y >= 6 && y <= 9)) {
      if ((x === 7 || x === 8) && (y === 7 || y === 8)) return EMBLEM;
      if ((x === 6 || x === 9) && (y === 6 || y === 9)) return EMBLEM;
      return DARK;
    }
    if ((x === 7 || x === 8) && (y === 5 || y === 11)) return EMBLEM;
    return BASE;
  };
}

for (const trim of ARMOR_TRIMS) {
  savePNG(path.join(itemsDir, `${trim}.png`), generateSmithingTemplate(trim));
}

// 3. Pottery Sherds
const POTTERY_SHERDS = [
  'angler_pottery_sherd', 'archer_pottery_sherd', 'arms_up_pottery_sherd',
  'blade_pottery_sherd', 'brewer_pottery_sherd', 'burn_pottery_sherd',
  'danger_pottery_sherd', 'explorer_pottery_sherd', 'flow_pottery_sherd',
  'friend_pottery_sherd', 'guster_pottery_sherd', 'heart_pottery_sherd',
  'heartbreak_pottery_sherd', 'howl_pottery_sherd', 'miner_pottery_sherd',
  'mourner_pottery_sherd', 'plenty_pottery_sherd', 'prize_pottery_sherd',
  'scrape_pottery_sherd', 'sheaf_pottery_sherd', 'shelter_pottery_sherd',
  'skull_pottery_sherd', 'snort_pottery_sherd'
];

function generatePotterySherd(name) {
  const BASE = hexToRgba('#b56543');
  const LIGHT = hexToRgba('#cb7a58');
  const DARK = hexToRgba('#8a4325');
  const ENGRAVED = hexToRgba('#562410');

  return (x, y) => {
    // Pottery sherd curved shard contour (triangular/trapezoidal shard)
    if (y < 2 || y > 13) return [0, 0, 0, 0];
    const minX = Math.max(2, 6 - Math.floor(y / 2));
    const maxX = Math.min(13, 9 + Math.floor(y / 2));
    if (x < minX || x > maxX) return [0, 0, 0, 0];
    if (x === minX || y === 2) return LIGHT;
    if (x === maxX || y === 13) return DARK;

    // Etched central symbol
    if (x >= 6 && x <= 9 && y >= 6 && y <= 9) {
      if ((x + y) % 2 === 0) return ENGRAVED;
    }
    if ((x === 7 || x === 8) && (y === 5 || y === 10)) return ENGRAVED;
    return BASE;
  };
}

for (const sherd of POTTERY_SHERDS) {
  savePNG(path.join(itemsDir, `${sherd}.png`), generatePotterySherd(sherd));
}

// 4. Banner Patterns
const BANNER_PATTERNS = [
  'flower_banner_pattern', 'creeper_banner_pattern', 'skull_banner_pattern',
  'mojang_banner_pattern', 'field_masoned_banner_pattern', 'bordure_indented_banner_pattern',
  'globe_banner_pattern'
];

function generateBannerPattern(name) {
  const PAPER = hexToRgba('#ded6a9');
  const PAPER_LIGHT = hexToRgba('#efe7bf');
  const PAPER_DARK = hexToRgba('#b3aa7f');
  const INK = hexToRgba('#222222');

  return (x, y) => {
    // Document sheet silhouette (x: 3..12, y: 2..13)
    if (x < 3 || x > 12 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Dog-eared folded corner at top-right
    if (x >= 11 && y <= 3) return [0, 0, 0, 0];
    if (x === 10 && y === 2) return PAPER_DARK;
    if (x === 10 && y === 3) return PAPER_DARK;
    if (x === 11 && y === 4) return PAPER_DARK;

    if (x === 3 || y === 2) return PAPER_LIGHT;
    if (x === 12 || y === 13) return PAPER_DARK;

    // Central emblem
    if (name.includes('creeper')) {
      if ((x === 6 || x === 9) && y >= 6 && y <= 7) return INK;
      if ((x === 7 || x === 8) && y === 8) return INK;
      if ((x >= 6 && x <= 9) && y === 9) return INK;
    } else if (name.includes('skull')) {
      if (x >= 6 && x <= 9 && y >= 6 && y <= 8) return INK;
      if ((x === 7 || x === 8) && y === 9) return INK;
    } else if (name.includes('flower')) {
      if ((x === 7 || x === 8) && (y === 6 || y === 8)) return INK;
      if ((x === 6 || x === 9) && y === 7) return INK;
    } else {
      if ((x >= 6 && x <= 9) && (y >= 6 && y <= 9)) {
        if ((x + y) % 2 === 0) return INK;
      }
    }

    return PAPER;
  };
}

for (const pat of BANNER_PATTERNS) {
  savePNG(path.join(itemsDir, `${pat}.png`), generateBannerPattern(pat));
}

// 5. Special Items & Buckets
function generateGhastTear() {
  const WHITE = hexToRgba('#ffffff');
  const CYAN_LIGHT = hexToRgba('#e0f8ff');
  const CYAN = hexToRgba('#bce8f5');
  const CYAN_DARK = hexToRgba('#84c3db');

  return (x, y) => {
    if (x < 4 || x > 11 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Teardrop shape: sharp at top (x=7,8 at y=2..4), bulging at bottom (y=7..12)
    if (y === 2 && (x < 7 || x > 8)) return [0, 0, 0, 0];
    if (y === 3 && (x < 6 || x > 9)) return [0, 0, 0, 0];
    if (y >= 4 && y <= 6 && (x < 5 || x > 10)) return [0, 0, 0, 0];
    if (y >= 12 && (x < 6 || x > 9)) return [0, 0, 0, 0];

    if (x <= 6 && y <= 6) return WHITE;
    if (x <= 7 && y <= 9) return CYAN_LIGHT;
    if (x >= 9 || y >= 11) return CYAN_DARK;
    return CYAN;
  };
}
savePNG(path.join(itemsDir, 'ghast_tear.png'), generateGhastTear());

function generatePhantomMembrane() {
  const BASE = hexToRgba('#876d7b');
  const LIGHT = hexToRgba('#ad93a1');
  const DARK = hexToRgba('#553e4c');

  return (x, y) => {
    if (x < 2 || x > 13 || y < 3 || y > 12) return [0, 0, 0, 0];
    if ((x === 2 || x === 13) && (y < 5 || y > 10)) return [0, 0, 0, 0];
    // Scalloped edges
    if (y === 12 && (x === 5 || x === 10)) return [0, 0, 0, 0];
    if (y <= 4 || x <= 4) return LIGHT;
    if (y >= 11 || x >= 11) return DARK;
    return BASE;
  };
}
savePNG(path.join(itemsDir, 'phantom_membrane.png'), generatePhantomMembrane());

function generatePrismarineShard() {
  const TEAL = hexToRgba('#63a79c');
  const LIGHT = hexToRgba('#8eefe0');
  const DARK = hexToRgba('#3c7169');

  return (x, y) => {
    // Angular shard diamond
    if (x + y < 8 || x + y > 22 || (x - y) > 6 || (y - x) > 6) return [0, 0, 0, 0];
    if (x <= 7 && y <= 7) return LIGHT;
    if (x >= 9 || y >= 9) return DARK;
    return TEAL;
  };
}
savePNG(path.join(itemsDir, 'prismarine_shard.png'), generatePrismarineShard());

function generateEchoShard() {
  const DEEP = hexToRgba('#051d24');
  const GLOW = hexToRgba('#00ffff');
  const GLOW_MID = hexToRgba('#0b777a');

  return (x, y) => {
    if (x + y < 10 || x + y > 20 || Math.abs(x - y) > 3) return [0, 0, 0, 0];
    if (x === y) return GLOW;
    if (Math.abs(x - y) === 1) return GLOW_MID;
    return DEEP;
  };
}
savePNG(path.join(itemsDir, 'echo_shard.png'), generateEchoShard());

function generateWolfArmor() {
  const PLATE = hexToRgba('#9c5339');
  const PLATE_LIGHT = hexToRgba('#c27355');
  const PLATE_DARK = hexToRgba('#6b3420');
  const RIVET = hexToRgba('#d48348');

  return (x, y) => {
    // Vest shape
    if (x < 3 || x > 12 || y < 2 || y > 14) return [0, 0, 0, 0];
    if ((x === 7 || x === 8) && y <= 4) return [0, 0, 0, 0]; // Neck hole
    if (x === 3 || x === 12 || y === 14) return PLATE_DARK;
    if (y === 2 || x === 4) return PLATE_LIGHT;
    if ((x === 5 || x === 10) && (y === 5 || y === 11)) return RIVET;
    return PLATE;
  };
}
savePNG(path.join(itemsDir, 'wolf_armor.png'), generateWolfArmor());

function generateGlowItemFrame() {
  const GLOW = hexToRgba('#22ffdd');
  const WOOD = hexToRgba('#85542e');
  const BACK = hexToRgba('#c4ab80');

  return (x, y) => {
    if (x < 2 || x > 13 || y < 2 || y > 13) return [0, 0, 0, 0];
    if (x === 2 || x === 13 || y === 2 || y === 13) return GLOW;
    if (x === 3 || x === 12 || y === 3 || y === 12) return WOOD;
    return BACK;
  };
}
savePNG(path.join(itemsDir, 'glow_item_frame.png'), generateGlowItemFrame());

function generateMusicDisc5() {
  const VINYL = hexToRgba('#1c1c1c');
  const GROOVE = hexToRgba('#2e2e2e');
  const CENTER = hexToRgba('#2ec4b6');

  return (x, y) => {
    const dx = x - 7.5;
    const dy = y - 7.5;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 6.5) return [0, 0, 0, 0];
    if (dist < 1.0) return [0, 0, 0, 0]; // hole
    if (dist < 2.5) return CENTER;
    if (Math.floor(dist) === 4) return GROOVE;
    return VINYL;
  };
}
savePNG(path.join(itemsDir, 'music_disc_5.png'), generateMusicDisc5());

function generateDiscFragment5() {
  const VINYL = hexToRgba('#1c1c1c');
  const CENTER = hexToRgba('#2ec4b6');

  return (x, y) => {
    if (x < 5 || x > 11 || y < 5 || y > 11) return [0, 0, 0, 0];
    if (x + y < 13) return [0, 0, 0, 0];
    if (x === 6 && y === 6) return CENTER;
    return VINYL;
  };
}
savePNG(path.join(itemsDir, 'disc_fragment_5.png'), generateDiscFragment5());

function generateArmadilloScute() {
  const BASE = hexToRgba('#995439');
  const LIGHT = hexToRgba('#c27453');
  const DARK = hexToRgba('#63311e');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 4 || y > 12) return [0, 0, 0, 0];
    if ((x === 3 || x === 12) && (y === 4 || y === 12)) return [0, 0, 0, 0];
    if (x <= 5 || y <= 5) return LIGHT;
    if (x >= 10 || y >= 11) return DARK;
    return BASE;
  };
}
savePNG(path.join(itemsDir, 'armadillo_scute.png'), generateArmadilloScute());

function generatePoppedChorusFruit() {
  const PURPLE = hexToRgba('#a25ca2');
  const WHITE = hexToRgba('#ffffff');
  const DARK = hexToRgba('#632f63');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 3 || y > 12) return [0, 0, 0, 0];
    if ((x < 5 || x > 10) && (y < 5 || y > 10)) return [0, 0, 0, 0];
    if (x >= 6 && x <= 9 && y >= 6 && y <= 9) return WHITE;
    if (x >= 10 || y >= 10) return DARK;
    return PURPLE;
  };
}
savePNG(path.join(itemsDir, 'popped_chorus_fruit.png'), generatePoppedChorusFruit());

function generateRabbitHide() {
  const BASE = hexToRgba('#a87950');
  const LIGHT = hexToRgba('#cca078');
  const DARK = hexToRgba('#734e30');

  return (x, y) => {
    if (x < 3 || x > 12 || y < 2 || y > 13) return [0, 0, 0, 0];
    // Pelt legs shape
    if (y >= 6 && y <= 9 && (x === 3 || x === 12)) return [0, 0, 0, 0];
    if (x <= 5 || y <= 4) return LIGHT;
    if (x >= 10 || y >= 11) return DARK;
    return BASE;
  };
}
savePNG(path.join(itemsDir, 'rabbit_hide.png'), generateRabbitHide());

function generateShulkerShell() {
  const PURPUR = hexToRgba('#966996');
  const LIGHT = hexToRgba('#bd8cbd');
  const DARK = hexToRgba('#663f66');

  return (x, y) => {
    // Bowl dome shape
    if (x < 2 || x > 13 || y < 6 || y > 12) return [0, 0, 0, 0];
    if (y === 6 && (x < 5 || x > 10)) return [0, 0, 0, 0];
    if (y === 7 && (x < 3 || x > 12)) return [0, 0, 0, 0];
    if (y === 6 || x === 3) return LIGHT;
    if (y === 12 || x === 12) return DARK;
    return PURPUR;
  };
}
savePNG(path.join(itemsDir, 'shulker_shell.png'), generateShulkerShell());

function generateMap(filled = false) {
  const PAPER = hexToRgba('#dfd5aa');
  const PAPER_LIGHT = hexToRgba('#f2ebcc');
  const BORDER = hexToRgba('#755938');
  const MAP_GREEN = hexToRgba('#60993e');
  const MAP_BLUE = hexToRgba('#41739c');

  return (x, y) => {
    if (x < 2 || x > 13 || y < 2 || y > 13) return [0, 0, 0, 0];
    if (x === 2 || x === 13 || y === 2 || y === 13) return BORDER;
    if (x === 3 || y === 3) return PAPER_LIGHT;
    if (filled) {
      if ((x >= 5 && x <= 8) && (y >= 5 && y <= 8)) return MAP_GREEN;
      if ((x >= 9 && x <= 11) && (y >= 8 && y <= 11)) return MAP_BLUE;
    }
    return PAPER;
  };
}
savePNG(path.join(itemsDir, 'map.png'), generateMap(false));
savePNG(path.join(itemsDir, 'filled_map.png'), generateMap(true));

function generateBreezeRod() {
  const CYAN_LIGHT = hexToRgba('#def3f7');
  const CYAN = hexToRgba('#9bd7e3');
  const CYAN_DARK = hexToRgba('#569ab0');

  return (x, y) => {
    // Diagonal swirling rod from (12, 3) to (3, 12)
    const lineDist = Math.abs((x + y) - 15);
    if (x < 2 || x > 13 || y < 2 || y > 13 || lineDist > 2) return [0, 0, 0, 0];
    if (x + y < 7 || x + y > 23) return [0, 0, 0, 0];
    if (lineDist === 0) return CYAN_LIGHT;
    if (lineDist === 1) return CYAN;
    return CYAN_DARK;
  };
}
savePNG(path.join(itemsDir, 'breeze_rod.png'), generateBreezeRod());

function generatePotion(colorHex, type = 'normal') {
  const GLASS = hexToRgba('#e4f6f8', 210);
  const CORK = hexToRgba('#9c663a');
  const LIQUID = hexToRgba(colorHex, 240);
  const LIQUID_LIGHT = hexToRgba('#ffffff', 200);

  return (x, y) => {
    // Cork at (7..8, 1..2)
    if ((x === 7 || x === 8) && (y === 1 || y === 2)) return CORK;
    // Neck at (7..8, 3..5)
    if ((x === 7 || x === 8) && (y >= 3 && y <= 5)) return GLASS;
    // Bottle body (4..11, 6..13)
    if (x < 4 || x > 11 || y < 6 || y > 13) return [0, 0, 0, 0];
    if (y === 6 && (x === 4 || x === 11)) return [0, 0, 0, 0];
    if (y === 13 && (x === 4 || x === 11)) return [0, 0, 0, 0];
    // Outline
    if (x === 4 || x === 11 || y === 6 || y === 13) return GLASS;
    // Highlight
    if (x === 5 && y >= 7 && y <= 9) return LIQUID_LIGHT;
    // Fluid
    if (y >= 7 && y <= 12) return LIQUID;
    return GLASS;
  };
}

const slowFallingPotions = [
  'potion_of_slow_falling.png',
  'potion_of_slow_falling_long.png',
  'splash_potion_of_slow_falling.png',
  'splash_potion_of_slow_falling_long.png',
  'lingering_potion_of_slow_falling.png',
  'lingering_potion_of_slow_falling_long.png'
];
for (const p of slowFallingPotions) {
  savePNG(path.join(itemsDir, p), generatePotion('#fbf4df'));
}

function generateBucketWithCreature(waterHex, critterHex) {
  const IRON = hexToRgba('#d8d8d8');
  const IRON_DARK = hexToRgba('#8a8a8a');
  const WATER = hexToRgba(waterHex);
  const CRITTER = hexToRgba(critterHex);

  return (x, y) => {
    // Bucket silhouette (x: 3..12, y: 5..14)
    if (x < 3 || x > 12 || y < 5 || y > 14) return [0, 0, 0, 0];
    if (y === 5 && (x === 3 || x === 12)) return [0, 0, 0, 0];
    // Outer rim & sides
    if (x === 3 || x === 12 || y === 14) return IRON_DARK;
    if (y === 6 && (x >= 4 && x <= 11)) return IRON;
    // Inside water
    if (y >= 7 && y <= 13) {
      // Creature inside
      if (x >= 6 && x <= 9 && y >= 9 && y <= 11) return CRITTER;
      return WATER;
    }
    return IRON;
  };
}

const FISH_BUCKETS = {
  cod_bucket: { water: '#3d6dbf', critter: '#b08b67' },
  salmon_bucket: { water: '#3d6dbf', critter: '#a83232' },
  pufferfish_bucket: { water: '#3d6dbf', critter: '#d6b633' },
  tropical_fish_bucket: { water: '#3d6dbf', critter: '#f06222' },
  axolotl_bucket: { water: '#3d6dbf', critter: '#f09ebd' },
  tadpole_bucket: { water: '#3d6dbf', critter: '#785b37' }
};

for (const [id, def] of Object.entries(FISH_BUCKETS)) {
  savePNG(path.join(itemsDir, `${id}.png`), generateBucketWithCreature(def.water, def.critter));
}

console.log('Successfully generated all non-block item icons!');
