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
  const num = parseInt(hex.replace('#', ''), 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
}

// 1. Oak Door Item Icon (16x16)
// A classic Minecraft 16x16 oak door item: 2 window panes on top, 2 recessed panels on bottom, handle on left
function getOakDoorItemPixel(x, y) {
  // Border of door is columns 3 to 12, rows 1 to 15
  if (x < 3 || x > 12 || y < 1 || y > 14) return [0, 0, 0, 0];
  
  // Outer frame outline
  if (x === 3 || x === 12 || y === 1 || y === 14) {
    return hexToRgba('#4c3319');
  }

  // Handle
  if (x === 4 && y === 8) return hexToRgba('#26180c');
  if (x === 5 && y === 8) return hexToRgba('#3a2412');

  // Upper section (y from 2 to 7): 2 windows
  if (y >= 2 && y <= 6) {
    // Window columns: 5..6 and 8..9
    const isWindow = (x === 5 || x === 6 || x === 8 || x === 9) && (y >= 3 && y <= 5);
    if (isWindow) {
      // Hollow window hole (transparent or very dark see-through)
      return [0, 0, 0, 0];
    }
    // Window inner frame
    if ((x === 4 || x === 7 || x === 10 || x === 11 || y === 2 || y === 6)) {
      return hexToRgba('#8a5f32');
    }
  }

  // Cross divider between top and bottom
  if (y === 7) return hexToRgba('#5d4022');

  // Lower section (y from 8 to 13): 2 recessed panels
  if (y >= 8 && y <= 13) {
    const isPanel = (x === 5 || x === 6 || x === 8 || x === 9) && (y >= 9 && y <= 12);
    if (isPanel) {
      if (x === 5 || y === 9) return hexToRgba('#6f4c28'); // shadow inside panel
      return hexToRgba('#a27440'); // lighter fill
    }
    // Panel border
    if (x === 4 || x === 7 || x === 10 || x === 11 || y === 8 || y === 13) {
      return hexToRgba('#8a5f32');
    }
  }

  // Wood base
  return ((x + y) % 2 === 0) ? hexToRgba('#936637') : hexToRgba('#855b30');
}

// 2. Iron Door Item Icon (16x16)
function getIronDoorItemPixel(x, y) {
  if (x < 3 || x > 12 || y < 1 || y > 14) return [0, 0, 0, 0];

  // Outer border
  if (x === 3 || x === 12 || y === 1 || y === 14) {
    return hexToRgba('#5e5e5e');
  }

  // Handle
  if (x === 4 && y === 8) return hexToRgba('#333333');
  if (x === 5 && y === 8) return hexToRgba('#444444');

  // Upper section windows (with metal grill)
  if (y >= 2 && y <= 6) {
    const isWindow = (x === 5 || x === 6 || x === 8 || x === 9) && (y >= 3 && y <= 5);
    if (isWindow) {
      return [0, 0, 0, 0]; // see-through window
    }
    return hexToRgba('#b5b5b5');
  }

  if (y === 7) return hexToRgba('#8a8a8a');

  // Lower section panels
  if (y >= 8 && y <= 13) {
    const isPanel = (x === 5 || x === 6 || x === 8 || x === 9) && (y >= 9 && y <= 12);
    if (isPanel) {
      if (x === 5 || y === 9) return hexToRgba('#949494');
      return hexToRgba('#d1d1d1');
    }
    return hexToRgba('#b0b0b0');
  }

  return ((x + y) % 2 === 0) ? hexToRgba('#c2c2c2') : hexToRgba('#b8b8b8');
}

// 3. Oak Trapdoor Item Icon (16x16)
function getOakTrapdoorItemPixel(x, y) {
  if (x < 1 || x > 14 || y < 1 || y > 14) return [0, 0, 0, 0];

  // Outer frame
  if (x === 1 || x === 14 || y === 1 || y === 14) return hexToRgba('#4e351b');
  if (x === 2 || x === 13 || y === 2 || y === 13) return hexToRgba('#754f27');

  // Center crossbars (x === 7 or 8, y === 7 or 8)
  if (x === 7 || x === 8 || y === 7 || y === 8) {
    return ((x + y) % 2 === 0) ? hexToRgba('#6b4823') : hexToRgba('#5c3e1e');
  }

  // 4 window / recessed openings
  // Quadrants:
  // Top-left: x 3..6, y 3..6
  // Top-right: x 9..12, y 3..6
  // Bottom-left: x 3..6, y 9..12
  // Bottom-right: x 9..12, y 9..12
  const inOpening = ((x >= 4 && x <= 5) || (x >= 10 && x <= 11)) &&
                    ((y >= 4 && y <= 5) || (y >= 10 && y <= 11));
  if (inOpening) {
    return [0, 0, 0, 0]; // cut-out openings
  }

  // Inner frame edges
  if (x === 3 || x === 6 || x === 9 || x === 12 || y === 3 || y === 6 || y === 9 || y === 12) {
    return hexToRgba('#8a5f32');
  }

  return hexToRgba('#9e6e39');
}

// 4. Iron Trapdoor Item Icon (16x16)
function getIronTrapdoorItemPixel(x, y) {
  if (x < 1 || x > 14 || y < 1 || y > 14) return [0, 0, 0, 0];

  if (x === 1 || x === 14 || y === 1 || y === 14) return hexToRgba('#555555');
  if (x === 2 || x === 13 || y === 2 || y === 13) return hexToRgba('#808080');

  // Rivets on corners
  if ((x === 3 || x === 12) && (y === 3 || y === 12)) return hexToRgba('#383838');

  // Center cross
  if (x === 7 || x === 8 || y === 7 || y === 8) {
    return ((x + y) % 2 === 0) ? hexToRgba('#8c8c8c') : hexToRgba('#9c9c9c');
  }

  // 4 recessed openings / grills
  const inOpening = ((x >= 4 && x <= 5) || (x >= 10 && x <= 11)) &&
                    ((y >= 4 && y <= 5) || (y >= 10 && y <= 11));
  if (inOpening) {
    return [0, 0, 0, 0]; // see through
  }

  return ((x + y) % 2 === 0) ? hexToRgba('#c2c2c2') : hexToRgba('#b5b5b5');
}

// 5. Oak Door Top Block Texture (16x16)
function getOakDoorTopPixel(x, y) {
  // Border
  if (x === 0 || x === 15 || y === 0) return hexToRgba('#4c3319');
  if (x === 1 || x === 14 || y === 1) return hexToRgba('#6f4c28');
  if (y === 15) return hexToRgba('#5d4022'); // bottom joint

  // Center divider
  if (x === 7 || x === 8) return hexToRgba('#6f4c28');

  // Left window (x 2..6, y 3..13) and Right window (x 9..13, y 3..13)
  const isLeftWin = (x >= 3 && x <= 5) && (y >= 3 && y <= 12);
  const isRightWin = (x >= 10 && x <= 12) && (y >= 3 && y <= 12);

  if (isLeftWin || isRightWin) {
    // Semi-transparent glass / cut-out opening
    return [0, 0, 0, 0];
  }

  // Frame highlights
  if (x === 2 || x === 6 || x === 9 || x === 13 || y === 2 || y === 13) {
    return hexToRgba('#8a5f32');
  }

  return ((x + y) % 2 === 0) ? hexToRgba('#9e6e39') : hexToRgba('#916433');
}

// 6. Oak Door Bottom Block Texture (16x16)
function getOakDoorBottomPixel(x, y) {
  if (x === 0 || x === 15 || y === 15) return hexToRgba('#4c3319');
  if (x === 1 || x === 14 || y === 14) return hexToRgba('#6f4c28');
  if (y === 0) return hexToRgba('#5d4022'); // top joint

  // Door Knob / Handle at x = 12..13, y = 3..5
  if ((x === 12 || x === 13) && (y >= 3 && y <= 5)) {
    return hexToRgba('#22180e');
  }

  // Center divider
  if (x === 7 || x === 8) return hexToRgba('#6f4c28');

  // Left recessed panel (x 3..5, y 3..12) and Right recessed panel (x 10..12, y 6..12)
  const isLeftPanel = (x >= 3 && x <= 5) && (y >= 3 && y <= 12);
  const isRightPanel = (x >= 10 && x <= 12) && (y >= 6 && y <= 12);

  if (isLeftPanel || isRightPanel) {
    if (x === 3 || x === 10 || y === 3 || (y === 6 && x >= 10)) {
      return hexToRgba('#634323'); // panel shadow
    }
    return hexToRgba('#a27440'); // panel center
  }

  if (x === 2 || x === 6 || x === 9 || x === 13 || y === 2 || y === 13) {
    return hexToRgba('#8a5f32');
  }

  return ((x + y) % 2 === 0) ? hexToRgba('#9e6e39') : hexToRgba('#916433');
}

// 7. Iron Door Top Block Texture (16x16)
function getIronDoorTopPixel(x, y) {
  if (x === 0 || x === 15 || y === 0) return hexToRgba('#5e5e5e');
  if (x === 1 || x === 14 || y === 1) return hexToRgba('#808080');
  if (y === 15) return hexToRgba('#737373');

  if (x === 7 || x === 8) return hexToRgba('#808080');

  const isLeftWin = (x >= 3 && x <= 5) && (y >= 3 && y <= 12);
  const isRightWin = (x >= 10 && x <= 12) && (y >= 3 && y <= 12);

  if (isLeftWin || isRightWin) {
    return [0, 0, 0, 0];
  }

  if (x === 2 || x === 6 || x === 9 || x === 13 || y === 2 || y === 13) {
    return hexToRgba('#b5b5b5');
  }

  return ((x + y) % 2 === 0) ? hexToRgba('#c7c7c7') : hexToRgba('#bdbdbd');
}

// 8. Iron Door Bottom Block Texture (16x16)
function getIronDoorBottomPixel(x, y) {
  if (x === 0 || x === 15 || y === 15) return hexToRgba('#5e5e5e');
  if (x === 1 || x === 14 || y === 14) return hexToRgba('#808080');
  if (y === 0) return hexToRgba('#737373');

  // Handle at x = 12..13, y = 3..5
  if ((x === 12 || x === 13) && (y >= 3 && y <= 5)) {
    return hexToRgba('#383838');
  }

  if (x === 7 || x === 8) return hexToRgba('#808080');

  const isLeftPanel = (x >= 3 && x <= 5) && (y >= 3 && y <= 12);
  const isRightPanel = (x >= 10 && x <= 12) && (y >= 6 && y <= 12);

  if (isLeftPanel || isRightPanel) {
    if (x === 3 || x === 10 || y === 3 || (y === 6 && x >= 10)) {
      return hexToRgba('#949494');
    }
    return hexToRgba('#dcdcdc');
  }

  if (x === 2 || x === 6 || x === 9 || x === 13 || y === 2 || y === 13) {
    return hexToRgba('#b5b5b5');
  }

  return ((x + y) % 2 === 0) ? hexToRgba('#c7c7c7') : hexToRgba('#bdbdbd');
}

// 9. Dark Oak Door Item Icon (16x16)
function getDarkOakDoorItemPixel(x, y) {
  if (x < 3 || x > 12 || y < 1 || y > 14) return [0, 0, 0, 0];
  if (x === 3 || x === 12 || y === 1 || y === 14) return hexToRgba('#24160a');
  if (x === 4 && y === 7) return hexToRgba('#fff176');
  if (x === 4 && y === 8) return hexToRgba('#fbc02d');
  if (x === 5 && y === 8) return hexToRgba('#b27e02');
  if (x === 11 && (y === 3 || y === 12)) return hexToRgba('#666666');
  if (y === 7) return hexToRgba('#2c1b0c');
  if (x === 7 || x === 8) return ((x + y) % 2 === 0) ? hexToRgba('#382312') : hexToRgba('#321e0f');

  const isUpperPanel = (x === 5 || x === 6 || x === 9 || x === 10) && (y >= 3 && y <= 5);
  if (isUpperPanel) {
    if (x === 5 || x === 9 || y === 3) return hexToRgba('#211409');
    if (x === 6 || x === 10 || y === 5) return hexToRgba('#55371c');
    return hexToRgba('#3d2714');
  }

  const isLowerPanel = (x === 5 || x === 6 || x === 9 || x === 10) && (y >= 9 && y <= 12);
  if (isLowerPanel) {
    if (x === 5 || x === 9 || y === 9) return hexToRgba('#211409');
    if (x === 6 || x === 10 || y === 12) return hexToRgba('#55371c');
    return hexToRgba('#3d2714');
  }

  if (x === 4 || x === 11 || y === 2 || y === 6 || y === 8 || y === 13) return hexToRgba('#4c331a');
  return ((x + y) % 2 === 0) ? hexToRgba('#462f18') : hexToRgba('#3e2915');
}

// 10. Dark Oak Trapdoor Item Icon (16x16)
function getDarkOakTrapdoorItemPixel(x, y) {
  if (x < 1 || x > 14 || y < 1 || y > 14) return [0, 0, 0, 0];
  if (x === 1 || x === 14 || y === 1 || y === 14) return hexToRgba('#24160a');
  if (x === 2 || x === 13 || y === 2 || y === 13) return hexToRgba('#382312');
  if (x === 7 || x === 8 || y === 7 || y === 8) return ((x + y) % 2 === 0) ? hexToRgba('#321e0f') : hexToRgba('#2a190c');

  const isPanelX = (x >= 3 && x <= 6) || (x >= 9 && x <= 12);
  const isPanelY = (y >= 3 && y <= 6) || (y >= 9 && y <= 12);
  if (isPanelX && isPanelY) {
    if (x === 3 || x === 9 || y === 3 || y === 9) return hexToRgba('#1c1107');
    if (x === 6 || x === 12 || y === 6 || y === 12) return hexToRgba('#55371c');
    return hexToRgba('#3d2714');
  }
  return hexToRgba('#462f18');
}

// 11. Dark Oak Door Top Block Texture (16x16)
function getDarkOakDoorTopPixel(x, y) {
  if (x === 0 || x === 15 || y === 0) return hexToRgba('#24160a');
  if (x === 1 || x === 14 || y === 1) return hexToRgba('#382312');
  if (y === 15) return hexToRgba('#2c1b0c');
  if (x === 7 || x === 8) return hexToRgba('#321e0f');
  if ((x === 0 || x === 1) && (y === 3 || y === 4)) return hexToRgba('#666666');
  if ((x === 12 || x === 13) && (y === 14 || y === 15)) return y === 14 ? hexToRgba('#fff176') : hexToRgba('#fbc02d');

  const isLeftPanel = (x >= 3 && x <= 6) && (y >= 3 && y <= 14);
  const isRightPanel = (x >= 9 && x <= 12) && (y >= 3 && y <= (x >= 11 ? 12 : 13));
  if (isLeftPanel || isRightPanel) {
    if (x === 3 || x === 9 || y === 3) return hexToRgba('#1c1107');
    if (x === 6 || x === 12 || y === 14 || (isRightPanel && y === 13)) return hexToRgba('#55371c');
    return hexToRgba('#3d2714');
  }
  if (x === 2 || x === 6 || x === 9 || x === 13 || y === 2) return hexToRgba('#4c331a');
  return ((x + y) % 2 === 0) ? hexToRgba('#462f18') : hexToRgba('#3e2915');
}

// 12. Dark Oak Door Bottom Block Texture (16x16)
function getDarkOakDoorBottomPixel(x, y) {
  if (x === 0 || x === 15 || y === 15) return hexToRgba('#24160a');
  if (x === 1 || x === 14 || y === 14) return hexToRgba('#382312');
  if (y === 0) return hexToRgba('#2c1b0c');
  if ((x >= 11 && x <= 13) && (y >= 1 && y <= 4)) {
    if (x === 11 && y === 1) return hexToRgba('#fff176');
    if (x === 13 || y === 4) return hexToRgba('#b27e02');
    return hexToRgba('#fbc02d');
  }
  if (x === 7 || x === 8) return hexToRgba('#321e0f');
  if ((x === 0 || x === 1) && (y === 11 || y === 12)) return hexToRgba('#666666');

  const isLeftPanel = (x >= 3 && x <= 6) && (y >= 3 && y <= 13);
  const isRightPanel = (x >= 9 && x <= 12) && (y >= 6 && y <= 13);
  if (isLeftPanel || isRightPanel) {
    if (x === 3 || x === 9 || y === 3 || (isRightPanel && y === 6)) return hexToRgba('#1c1107');
    if (x === 6 || x === 12 || y === 13) return hexToRgba('#55371c');
    return hexToRgba('#3d2714');
  }
  if (x === 2 || x === 6 || x === 9 || x === 13 || y === 13) return hexToRgba('#4c331a');
  return ((x + y) % 2 === 0) ? hexToRgba('#462f18') : hexToRgba('#3e2915');
}

// Ensure target directories exist
const itemDir = path.resolve('public/assets/items');
const blockDir = path.resolve('public/assets/blocks');
fs.mkdirSync(itemDir, { recursive: true });
fs.mkdirSync(blockDir, { recursive: true });

// Write all textures
const assets = [
  { path: path.join(itemDir, 'oak_door.png'), fn: getOakDoorItemPixel },
  { path: path.join(itemDir, 'iron_door.png'), fn: getIronDoorItemPixel },
  { path: path.join(itemDir, 'oak_trapdoor.png'), fn: getOakTrapdoorItemPixel },
  { path: path.join(itemDir, 'iron_trapdoor.png'), fn: getIronTrapdoorItemPixel },
  { path: path.join(itemDir, 'dark_oak_door.png'), fn: getDarkOakDoorItemPixel },
  { path: path.join(itemDir, 'dark_oak_trapdoor.png'), fn: getDarkOakTrapdoorItemPixel },
  { path: path.join(blockDir, 'oak_door_top.png'), fn: getOakDoorTopPixel },
  { path: path.join(blockDir, 'oak_door_bottom.png'), fn: getOakDoorBottomPixel },
  { path: path.join(blockDir, 'iron_door_top.png'), fn: getIronDoorTopPixel },
  { path: path.join(blockDir, 'iron_door_bottom.png'), fn: getIronDoorBottomPixel },
  { path: path.join(blockDir, 'oak_trapdoor.png'), fn: getOakTrapdoorItemPixel },
  { path: path.join(blockDir, 'iron_trapdoor.png'), fn: getIronTrapdoorItemPixel },
  { path: path.join(blockDir, 'dark_oak_door_top.png'), fn: getDarkOakDoorTopPixel },
  { path: path.join(blockDir, 'dark_oak_door_bottom.png'), fn: getDarkOakDoorBottomPixel },
  { path: path.join(blockDir, 'dark_oak_trapdoor.png'), fn: getDarkOakTrapdoorItemPixel }
];

for (const a of assets) {
  const buf = createPNG(16, 16, a.fn);
  fs.writeFileSync(a.path, buf);
  console.log(`Generated: ${a.path} (${buf.length} bytes)`);
}

// Also generate clean SVG fallbacks for oak_door, iron_door, oak_trapdoor, iron_trapdoor, dark_oak_door
const svgOakDoor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><rect width="16" height="16" fill="none"/><rect x="3" y="1" width="10" height="14" rx="1" fill="#8a5f32" stroke="#4c3319" stroke-width="1"/><rect x="5" y="3" width="2" height="3" fill="#2d1c0b"/><rect x="9" y="3" width="2" height="3" fill="#2d1c0b"/><rect x="5" y="9" width="2" height="4" fill="#a27440"/><rect x="9" y="9" width="2" height="4" fill="#a27440"/><circle cx="5" cy="8" r="0.8" fill="#26180c"/></svg>`;
const svgIronDoor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><rect width="16" height="16" fill="none"/><rect x="3" y="1" width="10" height="14" rx="1" fill="#b5b5b5" stroke="#5e5e5e" stroke-width="1"/><rect x="5" y="3" width="2" height="3" fill="#2b2b2b"/><rect x="9" y="3" width="2" height="3" fill="#2b2b2b"/><rect x="5" y="9" width="2" height="4" fill="#d1d1d1"/><rect x="9" y="9" width="2" height="4" fill="#d1d1d1"/><circle cx="5" cy="8" r="0.8" fill="#333333"/></svg>`;
const svgOakTrapdoor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><rect width="16" height="16" fill="none"/><rect x="1" y="1" width="14" height="14" fill="#8a5f32" stroke="#4e351b" stroke-width="1"/><path d="M1 8h14M8 1v14" stroke="#5c3e1e" stroke-width="1.5"/><rect x="3.5" y="3.5" width="3" height="3" fill="#2d1c0b"/><rect x="9.5" y="3.5" width="3" height="3" fill="#2d1c0b"/><rect x="3.5" y="9.5" width="3" height="3" fill="#2d1c0b"/><rect x="9.5" y="9.5" width="3" height="3" fill="#2d1c0b"/></svg>`;
const svgIronTrapdoor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><rect width="16" height="16" fill="none"/><rect x="1" y="1" width="14" height="14" fill="#b5b5b5" stroke="#555555" stroke-width="1"/><path d="M1 8h14M8 1v14" stroke="#808080" stroke-width="1.5"/><rect x="3.5" y="3.5" width="3" height="3" fill="#2b2b2b"/><rect x="9.5" y="3.5" width="3" height="3" fill="#2b2b2b"/><rect x="3.5" y="9.5" width="3" height="3" fill="#2b2b2b"/><rect x="9.5" y="9.5" width="3" height="3" fill="#2b2b2b"/></svg>`;
const svgDarkOakDoor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><rect width="16" height="16" fill="none"/><rect x="3" y="1" width="10" height="14" rx="1" fill="#462f18" stroke="#24160a" stroke-width="1"/><rect x="5" y="3" width="2" height="3" fill="#3d2714" stroke="#211409" stroke-width="0.5"/><rect x="9" y="3" width="2" height="3" fill="#3d2714" stroke="#211409" stroke-width="0.5"/><rect x="5" y="9" width="2" height="4" fill="#3d2714" stroke="#211409" stroke-width="0.5"/><rect x="9" y="9" width="2" height="4" fill="#3d2714" stroke="#211409" stroke-width="0.5"/><circle cx="4.5" cy="8" r="0.8" fill="#fbc02d"/></svg>`;

fs.writeFileSync(path.join(blockDir, 'oak_door.svg'), svgOakDoor);
fs.writeFileSync(path.join(blockDir, 'iron_door.svg'), svgIronDoor);
fs.writeFileSync(path.join(blockDir, 'oak_trapdoor.svg'), svgOakTrapdoor);
fs.writeFileSync(path.join(blockDir, 'iron_trapdoor.svg'), svgIronTrapdoor);
fs.writeFileSync(path.join(blockDir, 'dark_oak_door.svg'), svgDarkOakDoor);
console.log('SVG fallbacks generated successfully!');
