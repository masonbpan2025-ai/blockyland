#!/usr/bin/env node
/**
 * Read entity-model cube definitions straight out of the client JAR's COMPILED CLASSES.
 *
 * STATUS: WORK IN PROGRESS -- the ZIP reader is verified, the class reader is NOT yet working.
 *
 * WHY THIS EXISTS. Three mobs (the vex, the warden's eyes, the wolf) resisted being reverse-engineered from texture
 * pixels, while every mob that came out right was solved from a REAL layout. Entity models in 1.20.4 are compiled Java
 * rather than JSON, and there is no JVM on this machine to run a decompiler (checked: no `java.exe` anywhere on the
 * system, though `winget` is available to install one). This was meant to answer "what rectangle does this cube use"
 * without a JVM.
 *
 * WHAT IS VERIFIED. `readZipIndex` and `readEntry` list and inflate all 23,109 entries of the Fabric intermediary jar
 * correctly, and an early debug pass confirmed the target classes are present under intermediary names
 * (net/minecraft/class_602 etc). That part is reusable.
 *
 * WHAT IS NOT. The constant-pool and method-table walk does not yet reach `Code` attributes: on `class_602` it reports
 * a pool of 51,712 entries against a real count far smaller, and finds zero invoked method names. So it never reaches
 * a `uv()` call and always reports nothing. DO NOT TRUST ITS OUTPUT.
 *
 * NEXT STEP, which is the one with a track record: install a JVM (`winget install EclipseAdoptium.Temurin.21.JRE`)
 * and run the decompiler already downloaded at %TEMP%\decompiler\vineflower.jar against the Fabric jar. That is how
 * the cow was solved -- from QuadrupedModel.createBodyMesh(stanceWidth, Dilation) via the Fabric javadoc and its
 * published intermediary mappings -- and it is far more likely to work than finishing this parser.
 *
 * Usage (once working):
 *   node scripts/mob-visual/read-model-classes.mjs --grep <str> | --class <path> | --list
 */
import { readFileSync, readdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

const APPDATA = process.env.APPDATA ?? '';

/** Client JARs under the Fabric remapped-jars tree, intermediary first (its names are readable). */
function candidateJars() {
  const out = [];
  const fw = join(APPDATA, '.minecraft', '.fabric', 'remappedJars');
  try {
    for (const d of readdirSync(fw)) {
      const sub = join(fw, d);
      for (const f of readdirSync(sub)) {
        if (f.endsWith('.jar')) out.push(join(sub, f));
      }
    }
  } catch { /* no fabric directory */ }
  out.sort((a, b) => (b.includes('intermediary') ? 1 : 0) - (a.includes('intermediary') ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------- ZIP (VERIFIED)
export function readZipIndex(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 70000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('not a zip');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const m = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const cs = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const lo = buf.readUInt32LE(p + 42);
    m.set(buf.toString('utf8', p + 46, p + 46 + nl), { method, cs, lo });
    p += 46 + nl + el + cl;
  }
  return m;
}

export function readEntry(buf, entry) {
  const p = entry.lo;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error('bad local header');
  const nl = buf.readUInt16LE(p + 26);
  const el = buf.readUInt16LE(p + 28);
  const start = p + 30 + nl + el;
  const raw = buf.subarray(start, start + entry.cs);
  return entry.method === 0 ? Buffer.from(raw) : inflateRawSync(raw);
}

// ---------------------------------------------------------------- class file (BROKEN)
function poolEnd(buf) {
  const count = buf.readUInt16LE(8);
  let p = 10;
  for (let i = 1; i < count; i++) {
    const tag = buf[p];
    if (tag === 1) p += 3 + buf.readUInt16LE(p + 1);
    else if (tag === 3 || tag === 4) p += 5;
    else if (tag === 5 || tag === 6) { p += 9; i++; }
    else if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) p += 3;
    else if (tag === 15) p += 4;
    else if (tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) p += 5;
    else return -1;
  }
  return p;
}

function parseConstantPool(buf) {
  const count = buf.readUInt16LE(8);
  const pool = new Array(count);
  let p = 10;
  for (let i = 1; i < count; i++) {
    const tag = buf[p];
    if (tag === 1) { const len = buf.readUInt16LE(p + 1); pool[i] = { tag, utf8: buf.toString('utf8', p + 3, p + 3 + len) }; p += 3 + len; }
    else if (tag === 3) { pool[i] = { tag, int: buf.readInt32BE(p + 1) }; p += 5; }
    else if (tag === 4) { pool[i] = { tag, float: buf.readFloatBE(p + 1) }; p += 5; }
    else if (tag === 5 || tag === 6) { p += 9; i++; }
    else if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) { pool[i] = { tag, index: buf.readUInt16BE(p + 1) }; p += 3; }
    else if (tag === 15) { p += 4; }
    else if (tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) {
      pool[i] = { tag, a: buf.readUInt16BE(p + 1), b: buf.readUInt16BE(p + 3) }; p += 5;
    } else return pool;
  }
  return pool;
}

function resolve(pool, i) {
  const e = pool[i];
  if (!e) return null;
  if (e.tag === 1) return e.utf8;
  if (e.tag === 7 || e.tag === 8 || e.tag === 16 || e.tag === 19 || e.tag === 20) return resolve(pool, e.index);
  if (e.tag === 12) return resolve(pool, e.a);
  return null;
}

/** Every method's `uv(u, v)` arguments. KNOWN BROKEN: always returns {} in practice. */
export function analyseClass(bytes) {
  const pool = parseConstantPool(bytes);
  let p = poolEnd(bytes);
  if (p < 0 || p > bytes.length) return {};
  p += 6;
  if (p + 2 > bytes.length) return {};
  const ifaces = bytes.readUInt16BE(p); p += 2 + ifaces * 2;
  if (p + 2 > bytes.length) return {};
  const fields = bytes.readUInt16BE(p); p += 2;
  for (let i = 0; i < fields; i++) {
    p += 6;
    const n = bytes.readUInt16BE(p); p += 2 + n;
    const attr = bytes.readUInt16BE(p); p += 2;
    for (let a = 0; a < attr; a++) { const len = bytes.readUInt32BE(p + 2); p += 6 + len; }
  }
  if (p + 2 > bytes.length) return {};
  const methods = bytes.readUInt16BE(p); p += 2;
  const out = {};
  for (let i = 0; i < methods && p < bytes.length; i++) {
    const name = resolve(pool, bytes.readUInt16BE(p + 2));
    p += 6;
    const attrCount = bytes.readUInt16BE(p); p += 2;
    for (let a = 0; a < attrCount; a++) {
      const an = resolve(pool, bytes.readUInt16BE(p));
      const len = bytes.readUInt32BE(p + 2);
      if (an === 'Code' && p + 10 + len <= bytes.length) {
        const clen = bytes.readUInt32BE(p + 6);
        const calls = readUvCalls(bytes, pool, p + 10, clen);
        if (calls.length) out[name] = calls;
      }
      p += 6 + len;
    }
  }
  return out;
}

function readUvCalls(buf, pool, codeStart, codeLength) {
  const calls = [];
  const stack = [];
  let p = codeStart;
  const end = Math.min(codeStart + codeLength, buf.length);
  while (p < end) {
    const op = buf[p];
    if (op === 0x10) { stack.push(buf.readInt8(p + 1)); p += 2; continue; }
    if (op === 0x11) { stack.push(buf.readInt16BE(p + 1)); p += 3; continue; }
    if (op >= 0x02 && op <= 0x08) { stack.push(op - 3); p += 1; continue; }
    if (op === 0x13 || op === 0x14) {
      const idx = op === 0x13 ? buf[p + 1] : buf.readUInt16BE(p + 1);
      const c = pool[idx];
      stack.push(c && c.tag === 3 ? c.int : c && c.tag === 4 ? c.float : null);
      p += op === 0x13 ? 2 : 3;
      continue;
    }
    if (op === 0xb6 || op === 0xb7 || op === 0xb8 || op === 0xb9) {
      const idx = buf.readUInt16BE(p + 1);
      const ref = pool[idx];
      const nt = ref ? pool[ref.b] : null;
      const name = nt ? resolve(pool, nt.a) : null;
      if (name === 'uv' || name === 'method_35500') {
        const v = stack.pop();
        const u = stack.pop();
        if (Number.isFinite(u) && Number.isFinite(v)) calls.push({ u, v });
      }
      stack.length = 0;
      p += op === 0xb9 ? 5 : 3;
      continue;
    }
    stack.length = 0;
    p += opcodeLength(buf, p, op);
  }
  return calls;
}

function opcodeLength(buf, p, op) {
  if (op === 0xc4) return 6;
  if (op === 0xc5) return 4;
  if (op === 0xaa) {
    const pad = (4 - ((p + 1) % 4)) % 4;
    const base = p + 1 + pad;
    return 1 + pad + 12 + (buf.readInt32BE(base + 8) - buf.readInt32BE(base + 4) + 1) * 4;
  }
  if (op === 0xab) {
    const pad = (4 - ((p + 1) % 4)) % 4;
    return 1 + pad + 8 + buf.readInt32BE(p + 1 + pad + 4) * 8;
  }
  const three = new Set([
    0x84, 0x99, 0x9a, 0x9b, 0x9c, 0x9d, 0x9e, 0x9f, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9,
    0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xbb, 0xbd, 0xc0, 0xc1, 0xc6, 0xc7
  ]);
  return three.has(op) ? 3 : 1;
}

// ---------------------------------------------------------------- main
function main() {
  const args = process.argv.slice(2);
  const jars = candidateJars();
  if (jars.length === 0) { console.error('no client jar found'); process.exit(2); }
  const jar = jars[0];
  console.log(`jar: ${jar}`);
  const buf = readFileSync(jar);
  const index = readZipIndex(buf);
  console.log(`entries: ${index.size}`);

  const grepIdx = args.indexOf('--grep');
  const classIdx = args.indexOf('--class');
  const listIdx = args.indexOf('--list');

  let targets;
  if (classIdx >= 0) targets = [args[classIdx + 1]];
  else if (grepIdx >= 0) {
    const needle = (args[grepIdx + 1] ?? '').toLowerCase();
    targets = [...index.keys()].filter((n) => n.endsWith('.class') && n.toLowerCase().includes(needle));
  } else if (listIdx >= 0) {
    targets = [...index.keys()].filter((n) => n.includes('/net/minecraft/') && n.endsWith('.class'));
    console.log(`${targets.length} classes`);
    return;
  } else {
    console.error('usage: read-model-classes.mjs --grep <str> | --class <path> | --list');
    process.exit(2);
  }

  console.log(`${targets.length} candidate class(es)`);
  if (targets.length === 0) {
    console.log('NOTE: entity-model classes are named by INTERMEDIARY id (e.g. class_602), not by mob name,');
    console.log('      so --grep wolf will never match. This tool is documented as WORK IN PROGRESS.');
    return;
  }
  let shown = 0;
  for (const name of targets.slice(0, 500)) {
    const entry = index.get(name);
    if (!entry) continue;
    let result;
    try { result = analyseClass(readEntry(buf, entry)); } catch { continue; }
    const methods = Object.entries(result);
    if (methods.length === 0) continue;
    shown++;
    console.log(name);
    for (const [method, calls] of methods) console.log(`  ${method}: ${calls.map((c) => `(${c.u},${c.v})`).join(' ')}`);
  }
  console.log(`\n${shown} class(es) with uv() calls`);
  if (shown === 0) console.log('KNOWN BROKEN: the class reader does not reach Code attributes yet.');
}

main();
