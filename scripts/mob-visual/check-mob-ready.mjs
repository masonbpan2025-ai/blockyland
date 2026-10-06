// Run the FIVE-STEP PREREQUISITE CHECK for a mob, in the order this project spent a hundred rounds earning.
//
// Each step was learned by spending rounds on the wrong layer:
//
//   1. ATLAS KEY      -- the camel had none, so four rounds of binding never took (round 99)
//   2. SHEET CONTENT  -- the tropical fish family has NO coloured pixels at all (rounds 86-93)
//   3. ANCHORS        -- pair part names to (u,v) in DECOMPILE ORDER, not by eye (rounds 97-98)
//   4. PROPORTIONS    -- a flat-colour assembly cannot take a sheet (rounds 95, 96, 105)
//   5. IMPORT         -- a grep cannot tell a call from a definition (round 110)
//
// Steps 1, 2 and 5 are one command each and each would have saved more rounds than every other technique combined. This runs
// all five and prints a verdict: BIND, REBUILD, or BLOCKED.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join } from 'node:path';

const [mobArg, sheetArg, classArg] = process.argv.slice(2);
if (!mobArg) {
  console.log('  usage: node check-mob-ready.mjs <mob_key> [sheet_path] [VanillaClass]');
  console.log('  e.g.   node check-mob-ready.mjs slime public/assets/entity/slime/slime.png class_609');
  process.exit(0);
}

const steps = [];
const record = (n, name, ok, detail) => { steps.push({ n, name, ok, detail }); return ok; };

// --- 1. ATLAS KEY -----------------------------------------------------------------------------------------
const mobsSrc = readFileSync('src/mobs.js', 'utf8');
// The atlas is a map of `key: this.loadTexture(...)` entries; a mob may also reach its sheet through the spawner.
const atlasKey = new RegExp(`^\\s+(?:'|")?${mobArg}(?:'|")?\\s*:\\s*this\\.loadTexture`, 'm').test(mobsSrc);
const spawnerBind = new RegExp(`this\\.textures\\?\\.${mobArg}\\b`).test(mobsSrc)
  || new RegExp(`this\\.textures\\.${mobArg}\\b`).test(mobsSrc);
record(1, 'atlas key exists', atlasKey || spawnerBind,
  atlasKey ? 'atlas entry found' : spawnerBind ? 'spawner reads this.textures.<key>' : 'NO ATLAS KEY and no spawner lookup');

// --- 2. SHEET CONTENT -------------------------------------------------------------------------------------
let sheet = sheetArg;
if (!sheet) {
  const dir = 'public/assets/entity';
  // Find a sheet whose path mentions the mob key.
  const found = [];
  (function walk(d) {
    for (const n of readdirSync(d)) {
      const f = join(d, n);
      try { if (readFileSync && require('node:fs').statSync(f).isDirectory()) walk(f); else if (n.endsWith('.png') && f.toLowerCase().includes(mobArg.split('_')[0])) found.push(f); }
      catch { /* ignore */ }
    }
  })(dir);
  sheet = found[0];
}

let sheetOk = false, sheetDetail = 'no sheet found on disk';
if (sheet && existsSync(sheet)) {
  const buf = readFileSync(sheet);
  let pos = 8, w = 0, h = 0, ct = 0, dp = 0, palette = null, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString();
    const d = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); dp = d[8]; ct = d[9]; interlace = d[12]; }
    else if (type === 'PLTE') { palette = []; for (let i = 0; i + 2 < d.length; i += 3) palette.push([d[i], d[i + 1], d[i + 2]]); }
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  // Palette colour count is the cheap tell; a full decode is what really settles it.
  if (palette) {
    const coloured = palette.filter(([r, g, b]) => !(r === g && g === b)).length;
    sheetOk = coloured > 0;
    sheetDetail = `${w}x${h} type ${ct}, ${palette.length}-entry palette, ${coloured} COLOURED` + (sheetOk ? '' : '  <- STUB');
  } else if (ct === 6 || ct === 2) {
    // 8-bit RGBA/RGB: decode enough to count coloured pixels.
    try {
      const raw = inflateSync(Buffer.concat(idat));
      const bpp = ct === 6 ? 4 : 3, stride = w * bpp;
      let prev = Buffer.alloc(stride), opaque = 0, coloured = 0;
      for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)];
        const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
        const A = (x) => (x >= bpp ? line[x - bpp] : 0), B = (x) => prev[x], C = (x) => (x >= bpp ? prev[x - bpp] : 0);
        for (let x = 0; x < stride; x++) {
          const a = A(x), b = B(x), c = C(x);
          if (f === 1) line[x] = (line[x] + a) & 255;
          else if (f === 2) line[x] = (line[x] + b) & 255;
          else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
          else if (f === 4) {
            const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          }
        }
        for (let x = 0; x < w; x++) {
          const i = x * bpp, alpha = ct === 6 ? line[i + 3] : 255;
          if (alpha === 0) continue;
          opaque++;
          if (!(line[i] === line[i + 1] && line[i + 1] === line[i + 2])) coloured++;
        }
        prev = line;
      }
      sheetOk = coloured > 0;
      sheetDetail = `${w}x${h} type ${ct}: ${opaque} opaque, ${coloured} COLOURED` + (sheetOk ? '' : '  <- STUB');
    } catch (e) { sheetDetail = `${w}x${h} type ${ct}: decode failed (${e.message})`; }
  } else {
    sheetDetail = `${w}x${h} type ${ct} depth ${dp}: not decoded here`;
    sheetOk = true;   // unknown encoding is not evidence of a stub
  }
}
record(2, 'sheet contains colour', sheetOk, sheetDetail);

// --- 5. IMPORT (checked before 3 and 4 because it is a one-command mechanical check) -----------------------
// Does the spawner use a helper it may not have imported?
const usesVanillaUVs = new RegExp(`spawn(${mobArg.split('_').map((s) => s[0].toUpperCase() + s.slice(1)).join('')})[\\s\\S]{0,4000}?applyVanillaBoxUVs\\(`).test(mobsSrc);
const importsVanillaUVs = /import \{[^}]*applyVanillaBoxUVs[^}]*\} from '\.\/mobVisuals\/modelBuilder\.js'/.test(mobsSrc);
const localVanillaUVs = /^function applyVanillaBoxUVs/m.test(mobsSrc);
record(5, 'UV helper in scope', !usesVanillaUVs || importsVanillaUVs || localVanillaUVs,
  usesVanillaUVs ? (importsVanillaUVs || localVanillaUVs ? 'used and imported' : 'USED BUT NOT IMPORTED  <- ReferenceError') : 'not used by this spawner');

// --- 3 and 4. ANCHORS and PROPORTIONS (need the vanilla class) --------------------------------------------
let anchorsOk = null, proportionsOk = null, vanillaParts = 0;
if (classArg) {
  const dir = process.env.TEMP + '/mob-decompile/decompiled';
  let tex = null, parts = [];
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith('.java'));
    const file = files.find((f) => f === classArg + '.java')
      ?? files.find((f) => f.replace(/\$.*/, '') === classArg + '.java')
      ?? files.find((f) => { try { return readFileSync(join(dir, f), 'utf8').includes(classArg); } catch { return false; } });
    if (file) {
      const src = readFileSync(join(dir, file), 'utf8');
      const tm = src.match(/method_32110\(\$\$?\d+,\s*(\d+)\s*,\s*(\d+)\s*\)/);
      tex = tm ? `${tm[1]}x${tm[2]}` : null;
      parts = [...src.matchAll(/"([a-z_0-9]+)",?\s*\n?[\s\S]{0,200}?method_32101\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)/g)].map((m) => m[1]);
      parts = [...new Set(parts)];
    }
  } catch { /* nothing decompiled */ }
  vanillaParts = parts.length;
  anchorsOk = parts.length > 0;
  record(3, 'anchors readable', anchorsOk, tex
    ? `${parts.length} part(s) with (u,v), texture ${tex}` + (anchorsOk ? '' : '  <- run pair-part-uv.mjs')
    : 'class not found in the decompile cache -- decompile it first');
  proportionsOk = null;   // needs a human or a model read; recorded as a note
  record(4, 'proportions / part structure', null,
    'needs the project model read: a FLAT-COLOUR ASSEMBLY (many hand-placed boxes, extra parts vanilla lacks) means REBUILD');
}

// --- verdict ----------------------------------------------------------------------------------------------
console.log(`\n  READINESS CHECK: ${mobArg}${classArg ? ' vs ' + classArg : ''}\n`);
for (const s of steps) {
  const mark = s.ok === true ? 'PASS' : s.ok === false ? 'FAIL' : ' ?? ';
  console.log(`   [${mark}] ${s.n}. ${s.name.padEnd(26)} ${s.detail}`);
}

const failed = steps.filter((s) => s.ok === false);
console.log('');
if (failed.some((s) => s.n === 2)) console.log('   VERDICT: BLOCKED -- the sheet has nothing to draw. No binding can fix this.');
else if (failed.some((s) => s.n === 1)) console.log('   VERDICT: add the atlas key FIRST, then re-run. Binding before this step silently does nothing.');
else if (failed.some((s) => s.n === 5)) console.log('   VERDICT: import the UV helper before applying rectangles, or the module throws ReferenceError.');
else console.log('   VERDICT: prerequisites met. Read the model (step 4): if it matches vanilla part for part, BIND; if it is a flat-colour assembly, REBUILD.');
