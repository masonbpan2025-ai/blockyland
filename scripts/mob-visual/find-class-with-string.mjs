// Find which CLASS FILE inside the client JAR contains a given string.
//
// Round one hundred and twenty established that `EnderDragonEntityRenderer$DragonEntityModel` is the RENDERER and holds no
// geometry -- it only looks parts up in a `class_630` it is handed. The geometry is in whichever class CONSTRUCTS that
// model, and neither `decompile-model.mjs --list` (entity models only) nor `--grep` (model classes only) finds it.
//
// This reads the JAR's class entries as RAW BYTES and reports which contain the search string, which is what a constant-pool
// string literal is before any decompilation. It does not need to name the class in advance, which is the whole point.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const [jarArg, needle] = process.argv.slice(2);
if (!jarArg || !needle) {
  console.log('  usage: node find-class-with-string.mjs <client.jar> <literal-string>');
  console.log('  e.g.   node find-class-with-string.mjs "$env:APPDATA\\.minecraft\\versions\\1.20.4\\1.20.4.jar" left_wing_tip');
  process.exit(0);
}

const buf = readFileSync(jarArg);

// Walk the ZIP central directory to list entries without unzipping the whole archive.
function findEocd(b) {
  for (let i = b.length - 22; i >= 0 && i > b.length - 66000; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}
const eocd = findEocd(buf);
if (eocd < 0) { console.log('  not a readable ZIP/JAR'); process.exit(1); }
const count = buf.readUInt16LE(eocd + 10);
let off = buf.readUInt32LE(eocd + 16);

const entries = [];
for (let i = 0; i < count; i++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) break;
  const method = buf.readUInt16LE(off + 10);
  const compSize = buf.readUInt32LE(off + 20);
  const nameLen = buf.readUInt16LE(off + 28);
  const extraLen = buf.readUInt16LE(off + 30);
  const commentLen = buf.readUInt16LE(off + 32);
  const localOff = buf.readUInt32LE(off + 42);
  const name = buf.subarray(off + 46, off + 46 + nameLen).toString('utf8');
  entries.push({ name, method, compSize, localOff });
  off += 46 + nameLen + extraLen + commentLen;
}

console.log(`  ${entries.length} entries; searching ${entries.length} of them for "${needle}"`);

const needleBuf = Buffer.from(needle, 'utf8');
const hits = [];
let scanned = 0;

for (const e of entries) {
  if (!e.name.endsWith('.class')) continue;
  // Read the local header to find the data start.
  const lo = e.localOff;
  if (buf.readUInt32LE(lo) !== 0x04034b50) continue;
  const lnameLen = buf.readUInt16LE(lo + 26);
  const lextraLen = buf.readUInt16LE(lo + 28);
  const dataStart = lo + 30 + lnameLen + lextraLen;
  const raw = buf.subarray(dataStart, dataStart + e.compSize);
  let data;
  try { data = e.method === 0 ? raw : inflateRawSync(raw); } catch { continue; }
  scanned++;
  if (data.includes(needleBuf)) hits.push(e.name);
}

console.log(`  scanned ${scanned} class file(s)`);
console.log(`  CONTAINS "${needle}": ${hits.length}`);
for (const h of hits) console.log(`    ${h}`);
