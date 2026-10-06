#!/usr/bin/env node
/**
 * IMPORTANT -- READ BEFORE TRUSTING THE OUTPUT.
 *
 * This tool models the layout arithmetically. That is enough to find a rectangle landing on EMPTY sheet (which is
 * how the turtle shell fault was found), but it is NOT authoritative for the legacy createBoxWithUV helper, whose
 * face ordering and scaling differ from the model here in ways this script has not resolved.
 *
 * CONCRETELY: it flagged the warden as broken, I halved its 	exW on that evidence, and RENDERING PROVED THE CHANGE
 * MADE THE MOB WORSE. The warden was already correct and the flag was a false positive of this tool. It has been
 * reverted.
 *
 * So: treat a flag as a QUESTION to verify in the Inspector, never as a defect. The render is the authority.
 */
/**
 * Audit every declared UV rectangle against the texture it claims to sample.
 *
 * WHY THIS EXISTS. A texture that is never bound, a bitmap that is missing, and a rectangle that is empty sheet ALL
 * look the same: the mob renders, in its fallback colour, and looks plausible. The turtle's shell shipped mapped to a
 * rectangle that was 0% opaque, so it rendered as its fallback colour and a screenshot looked reasonable. Nothing
 * caught it, because "the mob renders" is not the claim "the texture is bound".
 *
 * This walks the source for `applyQuadUvs(...)` and `createBoxWithUV(...)` calls, finds the asset each one belongs
 * to, and reports the opacity of the rectangles vanilla's layout derives from the arguments. A part sitting near 0%
 * is silently untextured.
 *
 * It is a REPORT, not a gate: some rectangles legitimately carry little art (a part whose faces are mostly the
 * transparent part of a sheet), and a few call sites use non-vanilla layouts the tool cannot interpret. Read the
 * output, do not just count it.
 *
 * Usage: node scripts/mob-visual/audit-uv-coverage.mjs [--min 0.25] [--src src]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng } from './png.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

const args = process.argv.slice(2);
const minIndex = args.indexOf('--min');
const MIN = minIndex >= 0 ? Number(args[minIndex + 1]) : 0.25;
const srcIndex = args.indexOf('--src');
const SRC = resolve(repoRoot, srcIndex >= 0 ? args[srcIndex + 1] : 'src');

/** Vanilla's layout rectangles for a box, in createEntityBox's own face order. */
function rects(u, v, tw, th, td) {
  return [
    { x: u + td, y: v + td, w: td, h: th },
    { x: u + td + tw + td, y: v + td, w: td, h: th },
    { x: u + td, y: v, w: tw, h: td },
    { x: u + td + tw, y: v, w: tw, h: td },
    { x: u + td, y: v + td, w: tw, h: th },
    { x: u + td + tw, y: v + td, w: tw, h: th }
  ];
}

function opacity(image, r) {
  let opaque = 0;
  let total = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      total++;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if (image.rgba[(y * image.width + x) * 4 + 3] >= 128) opaque++;
    }
  }
  return total ? opaque / total : 0;
}

const cache = new Map();
function loadImage(assetPath) {
  // assetPath is a served path such as /assets/entity/fox/fox.png.
  const file = join(repoRoot, 'public', assetPath.replace(/^\//, ''));
  if (cache.has(file)) return cache.get(file);
  let image = null;
  if (existsSync(file)) {
    try { image = decodePng(readFileSync(file)); } catch { image = null; }
  }
  cache.set(file, image);
  return image;
}

/** Every .js file under src. */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : (p.endsWith('.js') ? [p] : []);
  });
}

/**
 * Skin paths are declared once per mob. Build `CONSTANT -> assetPath` so a call site's variable can be resolved.
 */
function skinConstants() {
  const map = new Map();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*'(\/assets\/[^']+)'/g)) {
      map.set(m[1], m[2]);
    }
    // Object tables such as LLAMA_SKIN_PATHS = { creamy: '/assets/...' }
    for (const m of text.matchAll(/const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([\s\S]*?)\n\}/g)) {
      const values = [...m[2].matchAll(/'(?:[a-z_]+)'\s*:\s*'(\/assets\/[^']+)'/g)].map((x) => x[1]);
      if (values.length) map.set(m[1], values[0]);
    }
  }
  return map;
}

const SKINS = skinConstants();
const findings = [];

for (const file of sourceFiles(SRC)) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // The skin a FILE works on: the asset whose constant this file references most often.
  //
  // Per-line attribution is not available for the behaviour modules: `goatBehavior.js` calls `applyQuadUvs` but never
  // names GOAT_SKIN_PATH, because that constant lives in mobs.js. Taking the most-referenced skin in the file is
  // accurate for these single-mob modules, and a file that references no skin constant is skipped rather than
  // guessed at -- an earlier version attributed all ninety rows in mobs.js to husk.png, which was worse than nothing.
  const counts = new Map();
  for (const [name, path] of SKINS) {
    const hits = (text.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
    if (hits) counts.set(path, (counts.get(path) ?? 0) + hits);
  }
  // mobs.js holds every spawner, so its most-referenced skin says nothing about any individual call: use per-line
  // attribution there and skip the lines that name no skin at all.
  const fileSkin = basename(file) === 'mobs.js'
    ? null
    : ([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);

  // In mobs.js every spawner lives in one file, so neither per-line nor per-file attribution works: the skin a call
  // belongs to is the one its enclosing FUNCTION references. Tracking the current function gives each spawner its
  // own skin, which is what makes this report about a mob rather than about a file.
  const fnStartLine = (i) => {
    for (let k = i; k >= 0 && k > i - 60; k--) {
      if (/^  [A-Za-z_$][\w$]*\([^)]*\)\s*\{/.test(lines[k])) return k;
    }
    return -1;
  };
  const fnSkinCache = new Map();
  const skinForFunction = (startLine) => {
    if (startLine < 0) return null;
    if (fnSkinCache.has(startLine)) return fnSkinCache.get(startLine);
    // The function body runs to the next top-level method.
    let end = lines.length;
    for (let k = startLine + 1; k < lines.length; k++) {
      if (/^  [A-Za-z_$][\w$]*\([^)]*\)\s*\{/.test(lines[k])) { end = k; break; }
    }
    const body = lines.slice(startLine, end).join('\n');
    const counts = new Map();
    for (const [name, path] of SKINS) {
      const hits = (body.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
      if (hits) counts.set(path, (counts.get(path) ?? 0) + hits);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    fnSkinCache.set(startLine, best);
    return best;
  };

  lines.forEach((line, i) => {
    const calls = [];
    const quad = line.match(/applyQuadUvs\(\s*([A-Za-z_$][\w$]*)\s*,\s*([^)]*)\)/);
    if (quad) {
      const nums = quad[2].split(',').map((n) => Number(n.trim()));
      if (nums.length >= 5 && nums.slice(0, 5).every((n) => Number.isFinite(n))) {
        calls.push({ kind: 'applyQuadUvs', target: quad[1], u: nums[0], v: nums[1], tw: nums[2], th: nums[3], td: nums[4], texW: nums[5] ?? 64, texH: nums[6] ?? 64 });
      }
    }
    const legacy = line.match(/createBoxWithUV\(\s*([^)]*)\)/);
    if (legacy) {
      const nums = legacy[1].split(',').map((n) => Number(n.trim()));
      if (nums.length >= 6 && nums.slice(3, 6).every((n) => Number.isFinite(n))) {
        calls.push({ kind: 'createBoxWithUV', target: 'box', w: nums[0], h: nums[1], d: nums[2], u: nums[3], v: nums[4], texW: nums[5], texH: nums[6], pw: nums[7], ph: nums[8], pd: nums[9] });
      }
    }

    for (const c of calls) {
      // Prefer a skin named on the line itself; otherwise use the file's own skin.
      let asset = null;
      for (const [name, path] of SKINS) {
        if (new RegExp(`\\b${name}\\b`).test(line)) { asset = path; break; }
      }
      if (!asset) asset = fileSkin;
      if (!asset) asset = skinForFunction(fnStartLine(i));
      if (!asset) continue;

      // For the legacy helper, the pixel dimensions are explicit when given, else derived from world units.
      const tw = c.kind === 'applyQuadUvs' ? c.tw : (c.pw ?? Math.round((c.w ?? 0) * 16));
      const th = c.kind === 'applyQuadUvs' ? c.th : (c.ph ?? Math.round((c.h ?? 0) * 16));
      const td = c.kind === 'applyQuadUvs' ? c.td : (c.pd ?? Math.round((c.d ?? 0) * 16));
      if (!tw || !th || !td || td > tw) continue;

      findings.push({ file: basename(file), line: i + 1, target: c.target, asset, u: c.u, v: c.v, tw, th, td, texW: c.texW, texH: c.texH });
    }
  });
}

// ------------------------------------------------------------------ report
console.log(`auditing ${findings.length} declared UV rectangle set(s) against ${cache.size || 'their'} textures`);
console.log(`flagging anything whose worst face is below ${(MIN * 100).toFixed(0)}% opaque\n`);

let flagged = 0;
let unknown = 0;
for (const f of findings) {
  const image = loadImage(f.asset);
  if (!image) { unknown++; continue; }
  const faces = rects(f.u, f.v, f.tw, f.th, f.td).map((r) => opacity(image, r));
  const worst = Math.min(...faces);
  if (worst >= MIN) continue;
  flagged++;
  const detail = faces.map((o) => `${Math.round(o * 100)}%`).join('/');
  console.log(`  ${String(f.line).padStart(5)}  ${f.file.padEnd(24)} ${f.target.padEnd(12)} ${basename(f.asset).padEnd(24)} worst=${(worst * 100).toFixed(0).padStart(3)}%  faces=${detail}`);
}

console.log(`\n${flagged} flagged, ${findings.length - flagged - unknown} looked fine, ${unknown} skipped (texture not on disk)`);
