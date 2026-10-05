import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createPNG(width, height, getPixel) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // Filter: none
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = getPixel(x, y);
      raw[pxOffset] = r;
      raw[pxOffset + 1] = g;
      raw[pxOffset + 2] = b;
      raw[pxOffset + 3] = a !== undefined ? a : 255;
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

function hexToRgb(hex) {
  const c = parseInt(hex.replace('#', ''), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t))
  ];
}

function hash(x, y, s = 1) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + s * 43.123) * 43758.5453;
  return n - Math.floor(n);
}

// Authentic Minecraft 16x16 leaf pattern map (0 = cutout, 1 = highlight, 2 = mid1, 3 = mid2, 4 = shadow)
const LEAF_PATTERN = [
  [4, 4, 0, 1, 0, 2, 2, 0, 3, 3, 4, 2, 0, 0, 1, 3],
  [2, 0, 0, 0, 4, 4, 3, 2, 0, 2, 3, 2, 0, 1, 2, 1],
  [0, 0, 3, 3, 0, 2, 2, 3, 1, 0, 2, 0, 0, 1, 1, 1],
  [0, 2, 3, 4, 4, 0, 1, 2, 1, 4, 0, 0, 0, 0, 1, 0],
  [2, 3, 2, 3, 0, 0, 2, 1, 0, 0, 0, 4, 2, 2, 0, 0],
  [2, 2, 3, 0, 0, 1, 3, 4, 4, 4, 0, 0, 4, 3, 2, 0],
  [3, 3, 0, 4, 1, 2, 1, 2, 0, 3, 3, 0, 2, 2, 3, 1],
  [3, 4, 4, 0, 1, 1, 1, 0, 4, 4, 3, 2, 0, 1, 3, 2],
  [1, 2, 0, 4, 4, 1, 2, 2, 0, 3, 2, 3, 2, 0, 2, 3],
  [1, 0, 0, 0, 4, 4, 4, 3, 2, 0, 2, 2, 2, 0, 1, 2],
  [0, 2, 2, 0, 4, 0, 2, 2, 3, 1, 0, 2, 0, 0, 0, 1],
  [1, 3, 4, 4, 0, 0, 0, 1, 2, 1, 0, 3, 2, 0, 0, 0],
  [3, 2, 2, 0, 2, 2, 0, 0, 1, 0, 4, 4, 3, 1, 0, 1],
  [2, 1, 0, 1, 3, 4, 4, 0, 0, 4, 0, 2, 1, 3, 2, 1],
  [1, 0, 1, 2, 1, 2, 0, 0, 3, 3, 0, 0, 1, 2, 1, 0],
  [2, 0, 1, 1, 1, 0, 0, 4, 4, 4, 3, 0, 0, 1, 0, 2]
];

function generateLeaves(palette) {
  // palette: [c1 (lightest), c2, c3, c4 (darkest)] in hex
  const colors = palette.map(hexToRgb);
  return (x, y) => {
    const val = LEAF_PATTERN[y][x];
    if (val === 0) return [0, 0, 0, 0];
    const c = colors[val - 1];
    // Add subtle noise
    const n = (hash(x, y, 99) - 0.5) * 8;
    return [
      Math.max(0, Math.min(255, Math.round(c[0] + n))),
      Math.max(0, Math.min(255, Math.round(c[1] + n))),
      Math.max(0, Math.min(255, Math.round(c[2] + n))),
      255
    ];
  };
}

function generatePlanks(baseHex, darkHex, lightHex) {
  const base = hexToRgb(baseHex);
  const dark = hexToRgb(darkHex);
  const light = hexToRgb(lightHex);

  return (x, y) => {
    // 4 horizontal boards of 4 pixels height each
    const boardIdx = Math.floor(y / 4);
    const boardY = y % 4;

    // Dark groove at board separator
    if (boardY === 3) {
      return [...dark, 255];
    }
    // Highlight at top of board
    if (boardY === 0) {
      return [...light, 255];
    }

    // Vertical seam divider at alternating X offsets
    const seamX = boardIdx % 2 === 0 ? 8 : (boardIdx === 1 ? 4 : 12);
    if (x === seamX) {
      return [...dark, 255];
    }

    // Wood grain lines and subtle noise
    const grain = (hash(x * 2.3 + boardIdx * 5, y * 0.4, 12) - 0.5) * 20;
    // Nail heads at seams
    if ((x === seamX - 1 || x === seamX + 1) && boardY === 1 && hash(boardIdx, x, 7) > 0.4) {
      return [Math.round(dark[0] * 0.8), Math.round(dark[1] * 0.8), Math.round(dark[2] * 0.8), 255];
    }

    return [
      Math.max(0, Math.min(255, Math.round(base[0] + grain))),
      Math.max(0, Math.min(255, Math.round(base[1] + grain))),
      Math.max(0, Math.min(255, Math.round(base[2] + grain))),
      255
    ];
  };
}

function generateLogSide(baseHex, darkHex, lightHex, streakFreq = 0.5) {
  const base = hexToRgb(baseHex);
  const dark = hexToRgb(darkHex);
  const light = hexToRgb(lightHex);

  return (x, y) => {
    // Vertical bark striations
    const vLine = hash(x, 0, 42);
    const n = hash(x, y, 77);
    let c = base;

    if (vLine < 0.25 || n < 0.2) {
      c = dark;
    } else if (vLine > 0.75 || n > 0.8) {
      c = light;
    } else {
      c = mixColor(base, n > 0.5 ? light : dark, Math.abs(n - 0.5) * streakFreq);
    }

    const grain = (hash(x, y, 101) - 0.5) * 12;
    return [
      Math.max(0, Math.min(255, Math.round(c[0] + grain))),
      Math.max(0, Math.min(255, Math.round(c[1] + grain))),
      Math.max(0, Math.min(255, Math.round(c[2] + grain))),
      255
    ];
  };
}

function generateLogTop(barkHex, woodLightHex, woodDarkHex) {
  const bark = hexToRgb(barkHex);
  const light = hexToRgb(woodLightHex);
  const dark = hexToRgb(woodDarkHex);

  return (x, y) => {
    // Distance from center (7.5, 7.5)
    const dx = x - 7.5;
    const dy = y - 7.5;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Outer bark ring
    if (dist >= 6.8 || x === 0 || x === 15 || y === 0 || y === 15) {
      const n = (hash(x, y, 12) - 0.5) * 20;
      return [
        Math.max(0, Math.min(255, Math.round(bark[0] + n))),
        Math.max(0, Math.min(255, Math.round(bark[1] + n))),
        Math.max(0, Math.min(255, Math.round(bark[2] + n))),
        255
      ];
    }

    // Concentric growth rings
    const ring = Math.sin(dist * 2.5);
    const c = ring > 0.2 ? light : dark;
    const n = (hash(x, y, 34) - 0.5) * 14;

    return [
      Math.max(0, Math.min(255, Math.round(c[0] + n))),
      Math.max(0, Math.min(255, Math.round(c[1] + n))),
      Math.max(0, Math.min(255, Math.round(c[2] + n))),
      255
    ];
  };
}

// Dictionary of texture filename -> pixel generator function
const TEXTURE_GENERATORS = {};

// ============================================================================
// 1. LEAVES
// ============================================================================

// Birch Leaves: bright yellow-green birch canopy with leaf clusters
TEXTURE_GENERATORS['birch_leaves.png'] = generateLeaves(['#97c65c', '#80ab46', '#668d34', '#4e6d23']);

// Spruce Leaves: dark pine conifer needles
TEXTURE_GENERATORS['spruce_leaves.png'] = generateLeaves(['#4b6b47', '#3c5838', '#2e452a', '#1e301b']);

// Jungle Leaves: lush vibrant tropical green
TEXTURE_GENERATORS['jungle_leaves.png'] = generateLeaves(['#4cb330', '#3b9222', '#2a7016', '#1a500c']);

// Acacia Leaves: dry olive savanna canopy
TEXTURE_GENERATORS['acacia_leaves.png'] = generateLeaves(['#828f34', '#6c7728', '#545d1d', '#3d4413']);

// Dark Oak Leaves: deep dense forest green
TEXTURE_GENERATORS['dark_oak_leaves.png'] = generateLeaves(['#36611c', '#274712', '#1a3209', '#102104']);

// Cherry Leaves: sakura pink blossom with floral petals
TEXTURE_GENERATORS['cherry_leaves.png'] = (x, y) => {
  const val = LEAF_PATTERN[y][x];
  if (val === 0) return [0, 0, 0, 0];
  const pinks = ['#fbcfe8', '#f472b6', '#ec4899', '#db2777'].map(hexToRgb);
  // Occasional leaf twig
  if (hash(x, y, 55) < 0.12) {
    return [75, 120, 45, 255];
  }
  const c = pinks[val - 1];
  const n = (hash(x, y, 7) - 0.5) * 10;
  return [
    Math.max(0, Math.min(255, Math.round(c[0] + n))),
    Math.max(0, Math.min(255, Math.round(c[1] + n))),
    Math.max(0, Math.min(255, Math.round(c[2] + n))),
    255
  ];
};

// Mangrove Leaves: rich warm swamp leaves
TEXTURE_GENERATORS['mangrove_leaves.png'] = generateLeaves(['#5f8f35', '#497425', '#355617', '#223a0d']);

// Pale Oak Leaves: pale sage/silvery ash leaves
TEXTURE_GENERATORS['pale_oak_leaves.png'] = generateLeaves(['#cbd5e1', '#94a3b8', '#64748b', '#475569']);

// Azalea Leaves: rich green with occasional pink floral blooms
TEXTURE_GENERATORS['azalea_leaves.png'] = (x, y) => {
  const val = LEAF_PATTERN[y][x];
  if (val === 0) return [0, 0, 0, 0];
  // 10% chance of blooming azalea flower cluster
  const isFlower = (x >= 4 && x <= 6 && y >= 3 && y <= 5) || (x >= 10 && x <= 12 && y >= 10 && y <= 12);
  if (isFlower) {
    const fPinks = ['#f472b6', '#ec4899', '#fdf2f8', '#be185d'].map(hexToRgb);
    return [...fPinks[val - 1], 255];
  }
  const green = ['#699e32', '#538224', '#3d6317', '#2b470e'].map(hexToRgb);
  return [...green[val - 1], 255];
};

// ============================================================================
// 2. LOGS & TOPS
// ============================================================================

// Birch Log Side: distinctive white bark with horizontal dark notches
TEXTURE_GENERATORS['birch_log.png'] = (x, y) => {
  const base = [235, 238, 240];
  const darkNotch = [35, 42, 50];
  const medNotch = [100, 110, 120];

  // Specific horizontal notches like Minecraft birch
  const isNotch = (
    (y === 3 && x >= 3 && x <= 7) ||
    (y === 4 && x >= 4 && x <= 6) ||
    (y === 9 && x >= 10 && x <= 14) ||
    (y === 10 && x >= 11 && x <= 13) ||
    (y === 14 && x >= 1 && x <= 4) ||
    (y === 13 && x >= 2 && x <= 3) ||
    (y === 7 && x >= 6 && x <= 7)
  );

  if (isNotch) {
    const n = (hash(x, y, 12) - 0.5) * 16;
    return [Math.round(darkNotch[0] + n), Math.round(darkNotch[1] + n), Math.round(darkNotch[2] + n), 255];
  }

  // Soft grey horizontal bark banding
  const band = (hash(0, y, 88) - 0.5) * 15;
  const grain = (hash(x, y, 31) - 0.5) * 10;
  return [
    Math.max(0, Math.min(255, Math.round(base[0] + band + grain))),
    Math.max(0, Math.min(255, Math.round(base[1] + band + grain))),
    Math.max(0, Math.min(255, Math.round(base[2] + band + grain))),
    255
  ];
};

TEXTURE_GENERATORS['birch_log_top.png'] = generateLogTop('#e2e8f0', '#fef08a', '#d4b76a');

// Spruce Log
TEXTURE_GENERATORS['spruce_log.png'] = generateLogSide('#3d2719', '#25150c', '#533826');
TEXTURE_GENERATORS['spruce_log_top.png'] = generateLogTop('#2d1a10', '#6d482c', '#482f1b');

// Jungle Log
TEXTURE_GENERATORS['jungle_log.png'] = generateLogSide('#584428', '#382a17', '#735b38');
TEXTURE_GENERATORS['jungle_log_top.png'] = generateLogTop('#3f301b', '#8c6b41', '#5e4627');

// Acacia Log
TEXTURE_GENERATORS['acacia_log.png'] = generateLogSide('#67625e', '#494440', '#7f7a75');
TEXTURE_GENERATORS['acacia_log_top.png'] = generateLogTop('#524e4a', '#ba6333', '#87421e');

// Dark Oak Log
TEXTURE_GENERATORS['dark_oak_log.png'] = generateLogSide('#2d2115', '#1a110a', '#3f3020');
TEXTURE_GENERATORS['dark_oak_log_top.png'] = generateLogTop('#1e140b', '#4a3723', '#312314');

// Cherry Log
TEXTURE_GENERATORS['cherry_log.png'] = generateLogSide('#3e2729', '#271719', '#55373a');
TEXTURE_GENERATORS['cherry_log_top.png'] = generateLogTop('#311e20', '#f3b4c6', '#d68fa3');

// Mangrove Log
TEXTURE_GENERATORS['mangrove_log.png'] = generateLogSide('#4d2a23', '#331914', '#683b32');
TEXTURE_GENERATORS['mangrove_log_top.png'] = generateLogTop('#391c16', '#874033', '#5c2a21');

// Mangrove Roots: woody interlaced roots with cutouts
TEXTURE_GENERATORS['mangrove_roots.png'] = (x, y) => {
  const isRoot = (
    (x >= 3 && x <= 6) ||
    (x >= 10 && x <= 13) ||
    (y >= 6 && y <= 9 && x >= 5 && x <= 11) ||
    (y >= 12 && x >= 2 && x <= 8)
  );
  if (!isRoot) return [0, 0, 0, 0];
  const wood = hexToRgb('#452119');
  const n = (hash(x, y, 8) - 0.5) * 20;
  return [Math.round(wood[0] + n), Math.round(wood[1] + n), Math.round(wood[2] + n), 255];
};

// Pale Oak Log
TEXTURE_GENERATORS['pale_oak_log.png'] = generateLogSide('#d8dede', '#a8b0b0', '#f0f5f5');
TEXTURE_GENERATORS['pale_oak_log_top.png'] = generateLogTop('#bec5c5', '#e8eded', '#ced4d4');

// Crimson Stem & Top
TEXTURE_GENERATORS['crimson_stem.png'] = generateLogSide('#631d33', '#3c0e1e', '#882b48', 0.8);
TEXTURE_GENERATORS['crimson_stem_top.png'] = generateLogTop('#4a1324', '#922949', '#631830');

// Warped Stem & Top
TEXTURE_GENERATORS['warped_stem.png'] = generateLogSide('#25625c', '#133a36', '#35857e', 0.8);
TEXTURE_GENERATORS['warped_stem_top.png'] = generateLogTop('#18433f', '#3ca199', '#246b65');

// Mushroom Stem
TEXTURE_GENERATORS['mushroom_stem.png'] = generateLogSide('#d3c9b7', '#b5a995', '#ebe4d5', 0.3);

// ============================================================================
// 3. PLANKS
// ============================================================================

TEXTURE_GENERATORS['birch_planks.png'] = generatePlanks('#c4b079', '#8a794e', '#ded09e');
TEXTURE_GENERATORS['spruce_planks.png'] = generatePlanks('#684e32', '#412f1c', '#836544');
TEXTURE_GENERATORS['jungle_planks.png'] = generatePlanks('#9d6f51', '#6d4b34', '#be8967');
TEXTURE_GENERATORS['acacia_planks.png'] = generatePlanks('#a85a32', '#763b1d', '#c97344');
TEXTURE_GENERATORS['dark_oak_planks.png'] = generatePlanks('#422a15', '#291809', '#583a20');
TEXTURE_GENERATORS['cherry_planks.png'] = generatePlanks('#e09aa8', '#b56d7d', '#f3b6c3');
TEXTURE_GENERATORS['mangrove_planks.png'] = generatePlanks('#753630', '#4e201b', '#974841');
TEXTURE_GENERATORS['pale_oak_planks.png'] = generatePlanks('#dcdfd9', '#aab0a5', '#eff2ec');

// ============================================================================
// 4. NETHER & END BLOCKS
// ============================================================================

// Crimson Nylium: netherrack with crimson fungal sprouts
TEXTURE_GENERATORS['crimson_nylium.png'] = (x, y) => {
  const sprouts = ['#831c36', '#a22343', '#561022', '#be2c51'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 14) * 4);
  return [...sprouts[n], 255];
};

TEXTURE_GENERATORS['crimson_nylium_side.png'] = (x, y) => {
  const rack = hexToRgb('#652323');
  const sprouts = hexToRgb('#9e2343');
  const drip = 2 + Math.floor(hash(x, 0, 7) * 3);
  if (y <= drip) {
    const n = (hash(x, y, 4) - 0.5) * 16;
    return [Math.round(sprouts[0] + n), Math.round(sprouts[1] + n), Math.round(sprouts[2] + n), 255];
  }
  const n = (hash(x, y, 9) - 0.5) * 20;
  return [Math.round(rack[0] + n), Math.round(rack[1] + n), Math.round(rack[2] + n), 255];
};

// Warped Nylium: netherrack with cyan warped sprouts
TEXTURE_GENERATORS['warped_nylium.png'] = (x, y) => {
  const sprouts = ['#16615b', '#1f837b', '#104642', '#29a79d'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 14) * 4);
  return [...sprouts[n], 255];
};

TEXTURE_GENERATORS['warped_nylium_side.png'] = (x, y) => {
  const rack = hexToRgb('#652323');
  const sprouts = hexToRgb('#1f837b');
  const drip = 2 + Math.floor(hash(x, 0, 7) * 3);
  if (y <= drip) {
    const n = (hash(x, y, 4) - 0.5) * 16;
    return [Math.round(sprouts[0] + n), Math.round(sprouts[1] + n), Math.round(sprouts[2] + n), 255];
  }
  const n = (hash(x, y, 9) - 0.5) * 20;
  return [Math.round(rack[0] + n), Math.round(rack[1] + n), Math.round(rack[2] + n), 255];
};

// Wart Blocks: knobby organic fungal clusters
TEXTURE_GENERATORS['nether_wart_block.png'] = (x, y) => {
  const wart = ['#721217', '#93181d', '#550a0d', '#b02026'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 22) * 4);
  return [...wart[n], 255];
};

TEXTURE_GENERATORS['warped_wart_block.png'] = (x, y) => {
  const wart = ['#13534f', '#19736e', '#0c3633', '#21928c'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 22) * 4);
  return [...wart[n], 255];
};

// Soul Soil: swirling earthy dark brown
TEXTURE_GENERATORS['soul_soil.png'] = (x, y) => {
  const dark = hexToRgb('#35261f');
  const light = hexToRgb('#4c382e');
  const wave = Math.sin(x * 0.4 + y * 0.8) + (hash(x, y, 5) - 0.5);
  const c = wave > 0.1 ? light : dark;
  const n = (hash(x, y, 17) - 0.5) * 12;
  return [Math.round(c[0] + n), Math.round(c[1] + n), Math.round(c[2] + n), 255];
};

// Basalt
TEXTURE_GENERATORS['basalt_side.png'] = (x, y) => {
  const c = hexToRgb('#3f3f46');
  const line = (hash(x, 0, 88) > 0.4 ? 15 : -15) + (hash(x, y, 11) - 0.5) * 14;
  return [Math.round(c[0] + line), Math.round(c[1] + line), Math.round(c[2] + line), 255];
};

TEXTURE_GENERATORS['basalt_top.png'] = (x, y) => {
  const c = hexToRgb('#52525b');
  const dx = x - 7.5, dy = y - 7.5;
  const edge = (Math.abs(dx) > 6 || Math.abs(dy) > 6) ? -20 : 0;
  const n = (hash(x, y, 99) - 0.5) * 15;
  return [Math.round(c[0] + edge + n), Math.round(c[1] + edge + n), Math.round(c[2] + edge + n), 255];
};

// Blackstone
TEXTURE_GENERATORS['blackstone.png'] = (x, y) => {
  const base = hexToRgb('#27272a');
  const seam = (x % 4 === 0 || y % 4 === 0) ? -12 : (hash(x, y, 3) - 0.5) * 18;
  return [Math.max(10, Math.round(base[0] + seam)), Math.max(10, Math.round(base[1] + seam)), Math.max(10, Math.round(base[2] + seam)), 255];
};

TEXTURE_GENERATORS['blackstone_top.png'] = TEXTURE_GENERATORS['blackstone.png'];

// Magma Block: dark stone with glowing hot magma veins
TEXTURE_GENERATORS['magma.png'] = (x, y) => {
  const stone = hexToRgb('#3f1a16');
  const lavaHot = hexToRgb('#ffaa00');
  const lavaDeep = hexToRgb('#dd3300');

  // Veins pattern
  const isVein = (
    (x + y * 2) % 7 === 0 ||
    (x * 2 - y + 16) % 9 === 0 ||
    (x === 4 && y >= 2 && y <= 6) ||
    (x === 11 && y >= 8 && y <= 13)
  );

  if (isVein) {
    const isHot = hash(x, y, 44) > 0.4;
    return [...(isHot ? lavaHot : lavaDeep), 255];
  }
  const n = (hash(x, y, 71) - 0.5) * 14;
  return [Math.round(stone[0] + n), Math.round(stone[1] + n), Math.round(stone[2] + n), 255];
};

// Chorus Plant & Flower
TEXTURE_GENERATORS['chorus_plant.png'] = (x, y) => {
  const c = hexToRgb('#5a1a68');
  const border = (x === 0 || x === 15 || y === 0 || y === 15) ? -20 : 0;
  const n = (hash(x, y, 12) - 0.5) * 15;
  return [Math.round(c[0] + border + n), Math.round(c[1] + border + n), Math.round(c[2] + border + n), 255];
};

TEXTURE_GENERATORS['chorus_flower.png'] = (x, y) => {
  const c = hexToRgb('#a855b5');
  const petal = (Math.abs(x - 7.5) < 3 && Math.abs(y - 7.5) < 3) ? 30 : -10;
  const n = (hash(x, y, 8) - 0.5) * 12;
  return [Math.round(c[0] + petal + n), Math.round(c[1] + petal + n), Math.round(c[2] + petal + n), 255];
};

// ============================================================================
// 5. DEEPSLATE, STONE & MINERALS
// ============================================================================

TEXTURE_GENERATORS['deepslate.png'] = (x, y) => {
  const c = hexToRgb('#334155');
  // Chiseled horizontal wave layers
  const wave = Math.sin(y * 1.5 + x * 0.3) > 0.3 ? 12 : -12;
  const n = (hash(x, y, 4) - 0.5) * 10;
  return [Math.round(c[0] + wave + n), Math.round(c[1] + wave + n), Math.round(c[2] + wave + n), 255];
};

TEXTURE_GENERATORS['deepslate_top.png'] = TEXTURE_GENERATORS['deepslate.png'];

// Cobbled deepslate is deepslate broken into cobbles: the same dark base, but with block-scale seams
// and per-cobble faceting instead of deepslate's smooth horizontal banding. Without this the slab,
// stair and wall variants -- which all point at cobbled_deepslate.png -- named a file that did not
// exist and fell through to the grey placeholder tile.
TEXTURE_GENERATORS['cobbled_deepslate.png'] = (x, y) => {
  const c = hexToRgb('#333a45');
  const seam = (x % 4 === 0 || y % 4 === 0) ? -16 : 0;
  const cell = hash(Math.floor(x / 4), Math.floor(y / 4), 27) - 0.5;
  const facet = cell * 26;
  const n = (hash(x, y, 9) - 0.5) * 8;
  return [Math.round(c[0] + seam + facet + n), Math.round(c[1] + seam + facet + n), Math.round(c[2] + seam + facet + n), 255];
};

TEXTURE_GENERATORS['tuff.png'] = (x, y) => {
  const c = hexToRgb('#64748b');
  const n = (hash(x, y, 19) - 0.5) * 28;
  return [Math.round(c[0] + n), Math.round(c[1] + n), Math.round(c[2] + n), 255];
};

TEXTURE_GENERATORS['calcite.png'] = (x, y) => {
  const c = hexToRgb('#e2e8f0');
  const facet = (Math.sin(x * 0.9 + y * 0.7) > 0.2 ? 15 : -15) + (hash(x, y, 3) - 0.5) * 12;
  return [Math.min(255, Math.round(c[0] + facet)), Math.min(255, Math.round(c[1] + facet)), Math.min(255, Math.round(c[2] + facet)), 255];
};

TEXTURE_GENERATORS['dripstone_block.png'] = (x, y) => {
  const c = hexToRgb('#85543c');
  const n = (hash(x, y, 22) - 0.5) * 22;
  return [Math.round(c[0] + n), Math.round(c[1] + n), Math.round(c[2] + n), 255];
};

TEXTURE_GENERATORS['pointed_dripstone.png'] = (x, y) => {
  // Stalactite spike shape with transparency
  const spikeWidth = Math.max(1, Math.round((y / 16) * 6));
  if (Math.abs(x - 7.5) > spikeWidth) return [0, 0, 0, 0];
  const c = hexToRgb('#85543c');
  const n = (hash(x, y, 1) - 0.5) * 18;
  return [Math.round(c[0] + n), Math.round(c[1] + n), Math.round(c[2] + n), 255];
};

TEXTURE_GENERATORS['sculk.png'] = (x, y) => {
  const base = [11, 22, 28];
  // Glowing cyan soul specks
  if (hash(x, y, 54) < 0.15) {
    const cyan = [0, 210, 200];
    return [cyan[0], cyan[1], cyan[2], 255];
  }
  const n = (hash(x, y, 10) - 0.5) * 8;
  return [Math.round(base[0] + n), Math.round(base[1] + n), Math.round(base[2] + n), 255];
};

TEXTURE_GENERATORS['sculk_catalyst_top.png'] = TEXTURE_GENERATORS['sculk.png'];
TEXTURE_GENERATORS['sculk_catalyst_bottom.png'] = TEXTURE_GENERATORS['deepslate.png'];
TEXTURE_GENERATORS['sculk_catalyst_side.png'] = (x, y) => {
  if (y <= 5) return TEXTURE_GENERATORS['sculk.png'](x, y);
  return TEXTURE_GENERATORS['deepslate.png'](x, y);
};

TEXTURE_GENERATORS['smooth_stone.png'] = (x, y) => {
  const isBorder = (x === 0 || x === 15 || y === 0 || y === 15);
  const base = isBorder ? [130, 130, 130] : [168, 168, 168];
  const n = (hash(x, y, 42) - 0.5) * 8;
  return [Math.round(base[0] + n), Math.round(base[1] + n), Math.round(base[2] + n), 255];
};

TEXTURE_GENERATORS['coal_block.png'] = (x, y) => {
  const c = hexToRgb('#1c1917');
  const seam = (x % 4 === 0 || y % 4 === 0) ? -10 : (hash(x, y, 12) - 0.5) * 16;
  return [Math.max(5, Math.round(c[0] + seam)), Math.max(5, Math.round(c[1] + seam)), Math.max(5, Math.round(c[2] + seam)), 255];
};

TEXTURE_GENERATORS['sulfur_block.png'] = (x, y) => {
  const c = hexToRgb('#eab308');
  const n = (hash(x, y, 55) - 0.5) * 25;
  return [Math.round(c[0] + n), Math.round(c[1] + n), Math.round(c[2] + n), 255];
};

TEXTURE_GENERATORS['packed_ice.png'] = (x, y) => {
  const c = hexToRgb('#93c5fd');
  const fracture = (x === y || x === 15 - y || (x * 3 + y) % 8 === 0) ? 25 : (hash(x, y, 2) - 0.5) * 12;
  return [Math.min(255, Math.round(c[0] + fracture)), Math.min(255, Math.round(c[1] + fracture)), Math.min(255, Math.round(c[2] + fracture)), 255];
};

TEXTURE_GENERATORS['blue_ice.png'] = (x, y) => {
  const c = hexToRgb('#38bdf8');
  const fracture = (x === y || x === 15 - y || (x * 2 + y * 3) % 7 === 0) ? 35 : (hash(x, y, 8) - 0.5) * 15;
  return [Math.min(255, Math.round(c[0] + fracture)), Math.min(255, Math.round(c[1] + fracture)), Math.min(255, Math.round(c[2] + fracture)), 255];
};

// ============================================================================
// 6. GROUND COVER & FLORA
// ============================================================================

TEXTURE_GENERATORS['podzol_top.png'] = (x, y) => {
  const needles = ['#5b3e2b', '#482f1f', '#6e4c34', '#3d2618'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 11) * 4);
  return [...needles[n], 255];
};

TEXTURE_GENERATORS['podzol_side.png'] = (x, y) => {
  const dirt = hexToRgb('#866043');
  const needle = hexToRgb('#5b3e2b');
  const top = 2 + Math.floor(hash(x, 0, 3) * 2);
  if (y <= top) return [...needle, 255];
  const n = (hash(x, y, 9) - 0.5) * 20;
  return [Math.round(dirt[0] + n), Math.round(dirt[1] + n), Math.round(dirt[2] + n), 255];
};

TEXTURE_GENERATORS['mycelium_top.png'] = (x, y) => {
  const my = ['#6e5d6d', '#5a4959', '#7e6c7d', '#4f3f4e'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 31) * 4);
  return [...my[n], 255];
};

TEXTURE_GENERATORS['mycelium_side.png'] = (x, y) => {
  const dirt = hexToRgb('#866043');
  const my = hexToRgb('#6e5d6d');
  const top = 2 + Math.floor(hash(x, 0, 7) * 2);
  if (y <= top) return [...my, 255];
  const n = (hash(x, y, 9) - 0.5) * 20;
  return [Math.round(dirt[0] + n), Math.round(dirt[1] + n), Math.round(dirt[2] + n), 255];
};

TEXTURE_GENERATORS['moss_block.png'] = (x, y) => {
  const moss = ['#4d7c0f', '#3f660c', '#5b9112', '#335409'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 4) * 4);
  return [...moss[n], 255];
};

TEXTURE_GENERATORS['mud.png'] = (x, y) => {
  const mud = ['#382e2b', '#2c2421', '#453935', '#241d1a'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 55) * 4);
  return [...mud[n], 255];
};

TEXTURE_GENERATORS['red_sand.png'] = (x, y) => {
  const sand = ['#c2410c', '#b03707', '#d94d12', '#9a2f05'].map(hexToRgb);
  const n = Math.floor(hash(x, y, 8) * 4);
  return [...sand[n], 255];
};

TEXTURE_GENERATORS['red_sandstone.png'] = (x, y) => {
  const c = hexToRgb('#b45309');
  const band = (y % 4 === 0) ? -20 : (hash(x, y, 14) - 0.5) * 16;
  return [Math.round(c[0] + band), Math.round(c[1] + band), Math.round(c[2] + band), 255];
};
TEXTURE_GENERATORS['red_sandstone_top.png'] = TEXTURE_GENERATORS['red_sandstone.png'];
TEXTURE_GENERATORS['red_sandstone_bottom.png'] = TEXTURE_GENERATORS['red_sandstone.png'];

TEXTURE_GENERATORS['bamboo.png'] = (x, y) => {
  if (x < 6 || x > 9) return [0, 0, 0, 0];
  const isNode = y % 8 === 0;
  const c = isNode ? hexToRgb('#84cc16') : hexToRgb('#4d7c0f');
  return [...c, 255];
};

TEXTURE_GENERATORS['sunflower.png'] = (x, y) => {
  const dx = x - 7.5, dy = y - 7.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 7) return [0, 0, 0, 0];
  if (dist < 3) return [...hexToRgb('#451a03'), 255]; // Dark center
  return [...hexToRgb('#eab308'), 255]; // Yellow petals
};

TEXTURE_GENERATORS['lily_pad.png'] = (x, y) => {
  const dx = x - 7.5, dy = y - 7.5;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 7) return [0, 0, 0, 0];
  // Notch cutout
  if (dx > 0 && dy > -1 && dy < 3) return [0, 0, 0, 0];
  const c = hexToRgb('#15803d');
  const n = (hash(x, y, 88) - 0.5) * 18;
  return [Math.round(c[0] + n), Math.round(c[1] + n), Math.round(c[2] + n), 255];
};

TEXTURE_GENERATORS['red_mushroom_block.png'] = (x, y) => {
  const red = hexToRgb('#b91c1c');
  const white = [240, 240, 240];
  const isSpot = (
    (x >= 3 && x <= 5 && y >= 3 && y <= 5) ||
    (x >= 10 && x <= 12 && y >= 10 && y <= 12)
  );
  if (isSpot) return [...white, 255];
  const n = (hash(x, y, 7) - 0.5) * 16;
  return [Math.round(red[0] + n), Math.round(red[1] + n), Math.round(red[2] + n), 255];
};

TEXTURE_GENERATORS['brown_mushroom_block.png'] = (x, y) => {
  const brown = hexToRgb('#78350f');
  const n = (hash(x, y, 19) - 0.5) * 20;
  return [Math.round(brown[0] + n), Math.round(brown[1] + n), Math.round(brown[2] + n), 255];
};

// ============================================================================
// 7. TERRACOTTA & PRISMARINE
// ============================================================================

function generateTerracotta(baseHex) {
  const c = hexToRgb(baseHex);
  return (x, y) => {
    const band = Math.sin(y * 0.8 + x * 0.1) * 8 + (hash(x, y, 3) - 0.5) * 12;
    return [
      Math.max(0, Math.min(255, Math.round(c[0] + band))),
      Math.max(0, Math.min(255, Math.round(c[1] + band))),
      Math.max(0, Math.min(255, Math.round(c[2] + band))),
      255
    ];
  };
}

TEXTURE_GENERATORS['terracotta.png'] = generateTerracotta('#985f46');
TEXTURE_GENERATORS['white_terracotta.png'] = generateTerracotta('#d1b399');
TEXTURE_GENERATORS['orange_terracotta.png'] = generateTerracotta('#a05325');
TEXTURE_GENERATORS['yellow_terracotta.png'] = generateTerracotta('#ba8523');
TEXTURE_GENERATORS['brown_terracotta.png'] = generateTerracotta('#4d3324');
TEXTURE_GENERATORS['red_terracotta.png'] = generateTerracotta('#8e3d2c');

TEXTURE_GENERATORS['prismarine.png'] = (x, y) => {
  const c = hexToRgb('#0d9488');
  const facet = (hash(x, y, 18) - 0.5) * 25;
  return [Math.round(c[0] + facet), Math.round(c[1] + facet), Math.round(c[2] + facet), 255];
};

TEXTURE_GENERATORS['prismarine_bricks.png'] = (x, y) => {
  const c = hexToRgb('#0f766e');
  const isBorder = (x % 8 === 0 || y % 4 === 0);
  const seam = isBorder ? -20 : (hash(x, y, 4) - 0.5) * 15;
  return [Math.round(c[0] + seam), Math.round(c[1] + seam), Math.round(c[2] + seam), 255];
};

TEXTURE_GENERATORS['dark_prismarine.png'] = (x, y) => {
  const c = hexToRgb('#064e3b');
  const isBorder = (x === 0 || x === 15 || y === 0 || y === 15);
  const seam = isBorder ? -18 : (hash(x, y, 12) - 0.5) * 14;
  return [Math.round(c[0] + seam), Math.round(c[1] + seam), Math.round(c[2] + seam), 255];
};

// ============================================================================
// EXECUTE GENERATION
// ============================================================================

const outputDir = path.resolve('public/assets/blocks');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

let generatedCount = 0;
for (const [filename, generator] of Object.entries(TEXTURE_GENERATORS)) {
  const filePath = path.join(outputDir, filename);
  const pngBuffer = createPNG(16, 16, generator);
  fs.writeFileSync(filePath, pngBuffer);
  generatedCount++;
}

console.log(`Successfully generated ${generatedCount} detailed 16x16 block textures in ${outputDir}!`);
