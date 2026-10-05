// Generate 16x16 PNG icons for the items this project adds from vanilla data.
//
// Why this is needed. tests/item_icons.test.js enforces that 100% of ITEMS entries have an existing
// icon asset, which is a good contract: an item whose icon 404s is an item the player cannot identify.
// Adding 86 items from minecraft-data therefore requires 86 icons, and there is no icon generator in
// the repo, so this is it.
//
// PNGs are written with zlib and a hand-built IHDR/IDAT/IEND chunk sequence. That is deliberate: the
// project has no image dependency, node-canvas is a native module, and zlib is in the standard library.
// A 16x16 RGBA PNG is small enough that encoding one directly is simpler than adding a dependency.
//
// Icons are deterministic -- the same item always produces the same pixels -- so regeneration is a
// no-op and review diffs stay empty.
//
// Run: node scripts/generate-item-icons.mjs
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { ITEMS } from '../src/blocks.js';
import { EXTRA_ITEMS } from '../src/extraItems.js';

const OUT = 'public/assets/items';
const SIZE = 16;

// --- minimal PNG encoder ----------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode a 16x16 RGBA buffer (already width*height*4 bytes) as a PNG. */
function encodePNG(rgba) {
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0;                                     // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- colour and shape -------------------------------------------------------
function hash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

function hslToRgb(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const COLOUR_OVERRIDES = {
  // Colours that are recognisable, so the icons are not all arbitrary hues.
  red_dye: '#b02e26', orange_dye: '#f9801d', yellow_dye: '#fed83d', lime_dye: '#80c71f',
  green_dye: '#5e7c16', cyan_dye: '#169c9c', light_blue_dye: '#3ab3da', blue_dye: '#3c44a0',
  purple_dye: '#8932b8', magenta_dye: '#c74ebd', pink_dye: '#f38baa', brown_dye: '#835432',
  gray_dye: '#474f52', light_gray_dye: '#9d9d97', white_dye: '#f9fffe', black_dye: '#1d1d21',
  gold_nugget: '#fcdb4d', iron_nugget: '#d8d8d8', flint: '#4b4b4b', charcoal: '#3a3a3a',
  coal: '#1a1a1a', honeycomb: '#f0a92a', bowl: '#8a5a2b', stick: '#8a6a3b', string: '#e8e8e8',
  leather: '#a06a3a', paper: '#f2f2f2', brick: '#9a5a44', gunpowder: '#5a5a5a',
  suspicious_stew: '#9a7b3a', rabbit_stew: '#a9773f', beetroot_soup: '#8e2b3a',
  mushroom_stew: '#b08a5a', pumpkin_pie: '#e3a13c',
  // Hand-written items the sweep below now covers too.
  rotten_flesh: '#8a5a44', tropical_fish: '#f28c28', chorus_fruit: '#8a5aa8',
  seagrass: '#4a7a2a', tipped_arrow: '#8a8a9a',
};

/** Which pixel shape to draw, from the item name. Keeps icons distinguishable at 16x16. */
function shapeFor(name) {
  if (/_dye$/.test(name)) return 'pile';
  // Checked before the generic suffixes, because "bowl" is an item in its own right and the stews
  // merely use it. Without this, bowl fell through to the default and drew the same rounded square as
  // a nugget, which is exactly the kind of collision these shapes exist to avoid.
  if (name === 'bowl' || /(stew|soup)$/.test(name)) return 'bowl';
  if (/_nugget$/.test(name)) return 'nugget';
  if (/_ingot$/.test(name)) return 'ingot';
  if (/(pie|cake|cookie)$/.test(name)) return 'round';
  if (/(boat|raft)$/.test(name)) return 'boat';
  if (/(_stick|_rod)$/.test(name)) return 'rod';
  if (/(_seeds|_pod)$/.test(name)) return 'seeds';
  if (/(_template|_pattern|_banner)/.test(name)) return 'sheet';
  if (/_bucket$/.test(name)) return 'bucket';
  if (/(honeycomb|flint|charcoal)/.test(name)) return 'shard';
  if (/_dust$/.test(name)) return 'pile';
  if (/mushroom/.test(name)) return 'mushroom';
  return 'nugget';
}

// Each shape is a list of [x, y] cells in a 16x16 grid, plus an optional darker outline pass.
function cells(shape) {
  const out = [];
  const add = (x, y) => { if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) out.push([x, y]); };
  switch (shape) {
    case 'pile':
      for (let y = 8; y <= 12; y++) for (let x = 4; x <= 11; x++) add(x, y);
      for (let y = 5; y <= 7; y++) for (let x = 6; x <= 9; x++) add(x, y);
      break;
    case 'nugget':
      for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) add(x, y);
      break;
    case 'ingot':
      for (let y = 6; y <= 9; y++) for (let x = 3; x <= 12; x++) add(x, y);
      break;
    case 'bowl':
      for (let x = 3; x <= 12; x++) add(x, 7);
      for (let y = 8; y <= 11; y++) { add(3, y); add(12, y); }
      for (let x = 4; x <= 11; x++) add(x, 12);
      break;
    case 'round':
      for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) {
        const dx = x - 7.5, dy = y - 7.5;
        if (dx * dx + dy * dy <= 16) add(x, y);
      }
      break;
    case 'boat':
      for (let x = 2; x <= 13; x++) add(x, 9);
      for (let y = 10; y <= 11; y++) { add(3, y); add(12, y); }
      for (let x = 4; x <= 11; x++) add(x, 12);
      for (let y = 5; y <= 8; y++) add(7, y);
      break;
    case 'rod':
      for (let i = 0; i < 10; i++) { add(4 + i, 12 - i); add(5 + i, 12 - i); }
      break;
    case 'seeds':
      for (const [x, y] of [[5, 6], [8, 5], [10, 8], [6, 9], [9, 11], [4, 11]]) { add(x, y); add(x + 1, y); }
      break;
    case 'shard':
      // An irregular lump, so a flint or a honeycomb does not read as a metal nugget.
      for (let y = 6; y <= 10; y++) add(5 + (y % 2), y), add(9 - (y % 2), y);
      for (let x = 6; x <= 9; x++) { add(x, 6); add(x, 10); }
      add(4, 8); add(11, 8); add(7, 4); add(8, 12);
      break;
    case 'sheet':
      for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) add(x, y);
      break;
    case 'bucket':
      for (let y = 4; y <= 11; y++) for (let x = 5; x <= 10; x++) add(x, y);
      break;
    case 'mushroom':
      for (let x = 4; x <= 11; x++) add(x, 6);
      for (let x = 5; x <= 10; x++) add(x, 7);
      for (let y = 8; y <= 11; y++) { add(7, y); add(8, y); }
      break;
    default:
      for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) add(x, y);
  }
  return out;
}

// --- generate ---------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
const existing = new Set(readdirSync(OUT).map(f => f.replace(/\.(png|svg)$/, '')));

let written = 0;
let skipped = 0;
// Every registered item, not only the generated batch. A hand-written item added to `src/blocks.js`
// needs an icon just as much, and `tests/item_icons.test.js` requires one for all of `ITEMS` -- so
// leaving hand-written items out of this sweep meant the test could only be satisfied by hand-drawing
// a PNG. Existing assets are kept, so this adds files rather than replacing art.
//
// The file written is the path the item DECLARES, not `<key>.png` in this directory. Seventeen items
// point at a shared or block asset (`anvil` at `/assets/blocks/anvil.png`, every potion variant at
// `/assets/items/potion.png`); naming the output after the key invented 34 unreferenced duplicates
// that no code path could ever load, and the "every ITEMS entry has an icon" check could not see them
// because it follows the declared path.
const names = [...new Set([...Object.keys(EXTRA_ITEMS), ...Object.keys(ITEMS)])];
const ITEM_ASSET = '/assets/items/';
for (const name of names) {
  const declared = ITEMS[name]?.icon ?? EXTRA_ITEMS[name]?.icon ?? null;
  if (!declared || !declared.startsWith(ITEM_ASSET)) { skipped++; continue; }
  const file = `public${declared}`;
  // Never overwrite a hand-authored asset, and do not rewrite identical output.
  if (existing.has(name)) { skipped++; continue; }
  if (existsSync(file)) { skipped++; continue; }

  const h = hash(name);
  const override = COLOUR_OVERRIDES[name];
  const [r, g, b] = override
    ? [parseInt(override.slice(1, 3), 16), parseInt(override.slice(3, 5), 16), parseInt(override.slice(5, 7), 16)]
    : hslToRgb(h % 360, 45 + (h % 20), 48 + (h % 12));

  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  const shape = shapeFor(name);
  const body = cells(shape);
  const set = (x, y, cr, cg, cb, ca) => {
    const i = (y * SIZE + x) * 4;
    rgba[i] = cr; rgba[i + 1] = cg; rgba[i + 2] = cb; rgba[i + 3] = ca;
  };
  // Darker outline one pixel out from the body, so the icon reads against any background.
  const bodySet = new Set(body.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of body) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (bodySet.has(`${nx},${ny}`)) continue;
      if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
      set(nx, ny, Math.round(r * 0.45), Math.round(g * 0.45), Math.round(b * 0.45), 255);
    }
  }
  for (const [x, y] of body) set(x, y, r, g, b, 255);
  // A single lighter highlight pixel keeps the flat shapes from looking like solid blocks.
  if (body.length) {
    const [hx, hy] = body[Math.floor(body.length / 3)];
    set(hx, hy, Math.min(255, r + 60), Math.min(255, g + 60), Math.min(255, b + 60), 255);
  }

  writeFileSync(file, encodePNG(rgba));
  written++;
}

console.log('item icons: wrote ' + written + ', kept ' + skipped + ' existing');
console.log('  of ' + names.length + ' generated items');

// Verify every generated item now has an icon file, which is the contract the test enforces.
const missing = [];
for (const [id, def] of Object.entries(ITEMS)) {
  if (!def.icon) { missing.push(id + ' (no icon field)'); continue; }
  const p = 'public/' + (def.icon.startsWith('/') ? def.icon.slice(1) : def.icon);
  if (!existsSync(p)) missing.push(id);
}
if (missing.length) {
  console.error('  STILL MISSING ICONS (' + missing.length + '): ' + missing.slice(0, 20).join(', '));
  process.exit(1);
}
console.log('  every ITEMS entry now has an icon file on disk');
void readFileSync;
