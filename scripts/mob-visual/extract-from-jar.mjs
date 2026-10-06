#!/usr/bin/env node
/**
 * Extract entity textures from the locally installed Minecraft client JAR.
 *
 * The client JAR is the plan's preferred source: it is the exact release's original bytes, so nothing has to be
 * trusted to a third-party mirror, and it resolves paths a mirror may not carry (vanilla nests several mobs one
 * directory deeper than a flat mirror suggests -- `entity/spider/spider.png`, `entity/turtle/big_sea_turtle.png`).
 *
 * ZIP reading is done here in Node rather than by shelling out to a zip tool, because the archive is a plain
 * container and spawning an external program made this depend on whatever happened to be on PATH.
 *
 * The lock file and the downloadable copy stay the responsibility of fetch-assets.mjs, which is what CI can
 * reproduce without a Minecraft install; this script is for local provenance and for files a mirror lacks.
 *
 * Usage:
 *   node scripts/mob-visual/extract-from-jar.mjs --find spider     # search entry names
 *   node scripts/mob-visual/extract-from-jar.mjs entity/spider/spider.png [...]
 *   node scripts/mob-visual/extract-from-jar.mjs --jar <path> ...
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');

/** The newest installed client JAR, preferring a release over a snapshot. */
function findJar(explicit) {
  if (explicit) return explicit;
  const base = join(process.env.APPDATA ?? '', '.minecraft', 'versions');
  if (!existsSync(base)) return null;
  const versions = readdirSync(base).filter((v) => existsSync(join(base, v, `${v}.jar`)));
  versions.sort((a, b) => {
    const release = (s) => (/^\d+\.\d+(\.\d+)?$/.test(s) ? 1 : 0);
    if (release(a) !== release(b)) return release(b) - release(a);
    return b.localeCompare(a, undefined, { numeric: true });
  });
  return versions.length ? join(base, versions[0], `${versions[0]}.jar`) : null;
}

/** Walk a ZIP's central directory and return { name -> { offset, method, sizes } }. */
function readZipIndex(buffer) {
  // Locate the end-of-central-directory record by scanning back for its signature.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 70000; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a ZIP (no end-of-central-directory)');
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(p + 10);
    const compressedSize = buffer.readUInt32LE(p + 20);
    const uncompressedSize = buffer.readUInt32LE(p + 24);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Read one entry's bytes, undeflating when it was stored compressed. */
function readEntry(buffer, entry) {
  const p = entry.localOffset;
  if (buffer.readUInt32LE(p) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = buffer.readUInt16LE(p + 26);
  const extraLen = buffer.readUInt16LE(p + 28);
  const dataStart = p + 30 + nameLen + extraLen;
  const raw = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  return entry.method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
}

const args = process.argv.slice(2);
const jarIndex = args.indexOf('--jar');
const jar = findJar(jarIndex >= 0 ? args[jarIndex + 1] : null);
if (!jar || !existsSync(jar)) { console.error('no client JAR found; pass --jar <path>'); process.exit(2); }
console.log(`client JAR: ${jar}`);

const buffer = readFileSync(jar);
const entries = readZipIndex(buffer);
const entityPngs = [...entries.keys()].filter((n) => n.startsWith('assets/minecraft/textures/entity/') && n.endsWith('.png'));
console.log(`  ${entries.size} entries, ${entityPngs.length} entity PNGs`);

const findIndex = args.indexOf('--find');
if (findIndex >= 0) {
  const needle = args[findIndex + 1] ?? '';
  for (const n of entityPngs.filter((p) => p.includes(needle))) console.log('  ' + n);
  process.exit(0);
}

const wanted = args.filter((a) => !a.startsWith('--') && (a.startsWith('entity/') || a.startsWith('assets/')));
if (wanted.length === 0) {
  console.error('usage: extract-from-jar.mjs <entity/....png ...> | --find <substr>');
  process.exit(2);
}

for (const rel of wanted) {
  const name = rel.startsWith('assets/') ? rel : `assets/minecraft/textures/${rel}`;
  const entry = entries.get(name);
  if (!entry) { console.log(`  MISSING ${name}`); continue; }
  const dest = resolve(repoRoot, 'public/assets/' + name.replace('assets/minecraft/textures/', ''));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, readEntry(buffer, entry));
  console.log(`  ${String(entry.uncompressedSize).padStart(7)}b  ${name}`);
}
