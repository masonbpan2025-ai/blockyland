#!/usr/bin/env node
/**
 * Decompile a mob's real entity model out of the client JAR, and report its cube definitions.
 *
 * WHY THIS EXISTS. Every mob that came out right was solved from a REAL layout, and every mob that resisted was being
 * reverse-engineered from texture pixels. Reaching the real definitions took a portable JRE, the Vineflower jar, the
 * Yarn mappings and a decompile invocation -- all of it assembled by hand across several rounds. This script is that
 * whole chain in one command, so the remaining forty-odd mobs can be done the same way instead of re-deriving it.
 *
 * WHAT IT DOES
 *   1. Finds a Java runtime: PATH, a Temurin zip already unpacked under %TEMP%\jdk, or the system Java.
 *   2. Fetches the Yarn mappings for the version (cached) to translate intermediary ids to readable class names.
 *   3. Runs Vineflower against the Fabric intermediary JAR for the classes you name.
 *   4. Prints each decompiled model's `method_32101` (uv) / `method_32097` (cube) / `method_32098` (dilated cube) /
 *      `method_32110` (texture size) lines paired with the part name they belong to.
 *
 * Usage:
 *   node scripts/mob-visual/decompile-model.mjs --list
 *   node scripts/mob-visual/decompile-model.mjs WolfEntityModel VexEntityModel
 *   node scripts/mob-visual/decompile-model.mjs --grep Frog
 *   node scripts/mob-visual/decompile-model.mjs CowEntityModel --raw
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const scratch = join(process.env.TEMP ?? repoRoot, 'mob-decompile');
const MC_VERSION = process.env.MC_VERSION ?? '1.20.4';
const YARN_BUILD = process.env.YARN_BUILD ?? '1.20.4+build.3';

mkdirSync(scratch, { recursive: true });

// ---------------------------------------------------------------- java
/** A usable `java`, from PATH, an unpacked Temurin, or a known install location. */
function findJava() {
  const candidates = [];
  const jdkDir = join(process.env.TEMP ?? '', 'jdk');
  if (existsSync(jdkDir)) {
    const walk = (d, depth = 0) => {
      if (depth > 4) return;
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p, depth + 1);
        else if (e.name === 'java.exe') candidates.push(p);
      }
    };
    try { walk(jdkDir); } catch { /* unreadable */ }
  }
  for (const p of ['java', 'java.exe']) candidates.push(p);
  for (const c of candidates) {
    try {
      execFileSync(c, ['-version'], { stdio: 'ignore' });
      return c;
    } catch { /* not runnable */ }
  }
  return null;
}

// ---------------------------------------------------------------- jars and mappings
function findFabricJar() {
  const base = join(process.env.APPDATA ?? '', '.minecraft', '.fabric', 'remappedJars');
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    for (const f of readdirSync(join(base, d))) {
      if (f.endsWith('.jar') && f.includes('intermediary')) return join(base, d, f);
    }
  }
  return null;
}

function readZipEntries(buf, want) {
  let e = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) return null;
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const cs = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const lo = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl);
    if (name === want) {
      const nl2 = buf.readUInt16LE(lo + 26);
      const el2 = buf.readUInt16LE(lo + 28);
      const raw = buf.subarray(lo + 30 + nl2 + el2, lo + 30 + nl2 + el2 + cs);
      return method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
    }
    p += 46 + nl + el + cl;
  }
  return null;
}

/** intermediary id -> readable class name, from the Yarn mappings. */
function loadMappings() {
  const cached = join(scratch, `yarn-${MC_VERSION}.tiny`);
  if (!existsSync(cached)) {
    const url = `https://maven.fabricmc.net/net/fabricmc/yarn/${YARN_BUILD}/yarn-${YARN_BUILD}-mergedv2.jar`;
    const jarPath = join(scratch, `yarn-${MC_VERSION}.jar`);
    if (!existsSync(jarPath)) {
      console.log(`fetching Yarn mappings for ${YARN_BUILD}...`);
      const out = execFileSync('powershell', ['-NoProfile', '-Command',
        `Invoke-WebRequest -Uri '${url}' -OutFile '${jarPath}' -UseBasicParsing -TimeoutSec 180 -UserAgent 'Mozilla/5.0'`],
        { stdio: 'inherit' });
      void out;
    }
    const tiny = readZipEntries(readFileSync(jarPath), 'mappings/mappings.tiny');
    if (!tiny) throw new Error('mappings.tiny not found in the Yarn jar');
    writeFileSync(cached, tiny);
  }
  const map = new Map();
  for (const line of readFileSync(cached, 'utf8').split('\n')) {
    if (!line.startsWith('c\t')) continue;
    const parts = line.split('\t');
    // tiny v2: c <official> <intermediary> <named>
    // `.trim()` every field: the mappings file has CRLF line endings, so a bare `split('\n')` leaves a trailing `\r`
    // on the last field. That silent carriage return made the jar lookup search for "class_553.class\r" and fail.
    const intermediary = parts[2]?.trim();
    const named = parts[3]?.trim();
    if (intermediary && named) map.set(named.split('/').pop(), intermediary);
  }
  return map;
}

/** Every model class in the mappings, for --list and --grep. */
function modelClasses(mappings) {
  return [...mappings.entries()].filter(([named]) => /EntityModel$/.test(named)).sort((a, b) => a[0].localeCompare(b[0]));
}

/** Pair each cube-builder call with the part name it belongs to, and format one line each. */
function summarise(source) {
  const out = [];
  let part = '(unnamed)';
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    // Names are tracked ACROSS lines. The decompiler emits `"name",` on its own line with the cube chain on the next,
    // so matching only the same-line form left every row reading "(unnamed)" -- which defeated the report's purpose.
    const name = line.match(/^(?:"([a-z_]+)"|method_32117\(\s*"([a-z_]+)")/);
    if (name) part = name[1] ?? name[2];
    if (/method_32101|method_32097|method_32098|method_32096|method_32106|method_32110/.test(line)) {
      out.push(`  ${part.padEnd(14)} ${line}`);
    }
  }
  return out;
}

/** Locate a decompiled file by name, since Vineflower's output layout depends on how the class was addressed. */
function findDecompiled(dir, fileName) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === fileName) return p;
    }
  }
  return null;
}

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
const java = findJava();
if (!java) {
  console.error('no Java runtime found. Install one with: winget install EclipseAdoptium.Temurin.21.JRE');
  console.error('or unpack a portable Temurin zip under %TEMP%\\jdk.');
  process.exit(2);
}
const jar = findFabricJar();
if (!jar) { console.error('no Fabric intermediary jar found under %APPDATA%\\.minecraft\\.fabric\\remappedJars'); process.exit(2); }
const vineflower = join(process.env.TEMP ?? '', 'decompiler', 'vineflower.jar');
if (!existsSync(vineflower)) {
  console.error(`Vineflower not found at ${vineflower}.`);
  console.error('Download it with:');
  console.error('  Invoke-WebRequest https://repo1.maven.org/maven2/org/vineflower/vineflower/1.10.1/vineflower-1.10.1.jar -OutFile $env:TEMP\\decompiler\\vineflower.jar');
  process.exit(2);
}

const mappings = loadMappings();

if (args.includes('--list') || args.includes('--grep')) {
  const needle = args.includes('--grep') ? (args[args.indexOf('--grep') + 1] ?? '') : '';
  const list = modelClasses(mappings).filter(([named]) => named.toLowerCase().includes(needle.toLowerCase()));
  console.log(`${list.length} entity model class(es)${needle ? ` matching "${needle}"` : ''}:`);
  for (const [named, intermediary] of list) console.log(`  ${named.padEnd(38)} ${intermediary}`);
  process.exit(0);
}

const names = args.filter((a) => !a.startsWith('--'));
if (names.length === 0) {
  console.error('usage: decompile-model.mjs <EntityModelName ...> | --list | --grep <str>');
  process.exit(2);
}

const targets = [];
for (const n of names) {
  const entry = [...mappings.entries()].find(([named]) => named === n || named === `${n}EntityModel`);
  if (!entry) { console.error(`  no mapping for ${n}`); continue; }
  const full = entry[1];                     // e.g. net/minecraft/class_553
  const short = full.split('/').pop();       // e.g. class_553
  targets.push({ named: entry[0], intermediary: full, short, file: `${short}.class` });
}
if (targets.length === 0) process.exit(1);

const outDir = join(scratch, 'decompiled');
mkdirSync(outDir, { recursive: true });

// Stage each class as its own FILE. Vineflower is then given a path, not a filter, which is unambiguous.
const stage = join(scratch, 'stage');
mkdirSync(stage, { recursive: true });
const jarBuf = readFileSync(jar);
const staged = [];
for (const t of targets) {
  // The mappings give the FULL intermediary path (`net/minecraft/class_553`), so the entry name is `file` itself --
  // prepending the package again produced `net/minecraft/net/minecraft/...` and found nothing.
  const bytes = readZipEntries(jarBuf, `net/minecraft/${t.file}`);
  if (!bytes) { console.error(`  ${t.named}: ${t.file} not found in the jar`); continue; }
  const dest = join(stage, t.file);
  writeFileSync(dest, bytes);
  staged.push({ ...t, staged: dest });
}
if (staged.length === 0) { console.error('nothing to decompile'); process.exit(1); }

console.log(`java:      ${java}`);
console.log(`jar:       ${jar}`);
console.log(`classes:   ${staged.map((t) => `${t.named} (${t.file})`).join(', ')}\n`);

execFileSync(java, ['-jar', vineflower, ...staged.map((t) => t.staged), outDir], { stdio: 'inherit' });

for (const t of targets) {
  const file = findDecompiled(outDir, t.file.replace(/\.class$/, '.java'));
  if (!file) { console.error(`  ${t.named}: no decompiled output found under ${outDir}`); continue; }
  console.log(`\n=== ${t.named}  (${t.file} -> ${file}) ===`);
  if (args.includes('--raw')) { console.log(readFileSync(file, 'utf8')); continue; }
  for (const line of summarise(readFileSync(file, 'utf8'))) console.log(line);
}
