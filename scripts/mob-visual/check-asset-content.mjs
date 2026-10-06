// Check that a texture asset actually CONTAINS something, BEFORE any pipeline work is built around it.
//
// Round ninety-one's lesson, made mechanical. Six consecutive rounds on the tropical fish asked questions about the
// pipeline -- is the path right, is the helper right, is the format right, is the tint right -- and NOT ONE asked whether
// the asset had anything in it. Reading the PNG's palette answered it in four lines.
//
// So this runs that check across every texture the project uses, and reports the ones that cannot draw a mob:
//
//   * NO COLOUR      -- every opaque pixel is grey or white, so there is nothing for a tint to colour
//   * NEARLY EMPTY   -- almost every pixel is transparent
//   * TINY PALETTE   -- the source is a palette image with a handful of entries, which is what a stub looks like
//
// It reads the PNG chunks directly, so it works on a palette (colour type 3) file WITHOUT converting it first -- which is
// the whole point, since converting hid the problem for two rounds.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.argv[2] ?? 'public/assets/entity';

/** Parse a PNG's chunks, returning the header, palette and whether it is interlaced or not. */
function chunks(file) {
  const buf = readFileSync(file);
  const out = { palette: null, trns: null, ihdr: null, idatSize: 0, width: 0, height: 0, depth: 0, colorType: 0 };
  let pos = 8;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString();
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      out.width = data.readUInt32BE(0); out.height = data.readUInt32BE(4);
      out.depth = data[8]; out.colorType = data[9]; out.interlace = data[12];
      out.ihdr = true;
    } else if (type === 'PLTE') {
      out.palette = [];
      for (let i = 0; i + 2 < data.length; i += 3) out.palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'tRNS') out.trns = data;
    else if (type === 'IDAT') out.idatSize += len;
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  return out;
}

/** Report a verdict for one file WITHOUT needing a full RGB decode, by reading the palette it declares. */
function verdict(file) {
  let c;
  try { c = chunks(file); } catch (e) { return { problem: 'unreadable: ' + e.message }; }
  if (!c.ihdr) return { problem: 'no IHDR' };
  if (c.interlace) return { problem: 'interlaced (not decoded here)' };

  const notes = [];

  // A palette of a handful of entries is what a stub looks like; a real mob sheet has dozens.
  if (c.colorType === 3 && c.palette) {
    const colours = c.palette.length;
    // How many entries are actually COLOURED rather than grey or white?
    const coloured = c.palette.filter(([r, g, b]) => !(r === g && g === b)).length;
    if (colours <= 8 && coloured === 0) {
      notes.push(`${colours}-entry palette with ZERO coloured entries (all grey/white)`);
    } else if (coloured === 0) {
      notes.push(`${colours}-entry palette, no coloured entries`);
    }
  }

  // Colour type 0 (greyscale) has no colour at all by definition.
  if (c.colorType === 0) notes.push('greyscale (colour type 0)');

  return {
    size: `${c.width}x${c.height}`, depth: c.depth, colorType: c.colorType,
    palette: c.palette ? c.palette.length : null,
    idat: c.idatSize, notes,
    bytes: statSync(file).size,
  };
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith('.png')) files.push(full);
  }
})(root);

console.log(`  scanning ${files.length} PNG(s) under ${root}\n`);

const suspect = [];
for (const f of files) {
  const v = verdict(f);
  const label = f.replace(/\\/g, '/').replace('public/assets/entity/', '');
  if (v.problem) { suspect.push([label, v.problem]); continue; }
  if (v.notes.length) suspect.push([label, v.notes.join('; ') + `  [${v.size} type ${v.colorType} palette ${v.palette}]`]);
}

console.log(`  SUSPECT assets (${suspect.length}):`);
for (const [label, why] of suspect) console.log(`    ${label.padEnd(46)} ${why}`);
if (!suspect.length) console.log('    (none)');
