// Cross-check the flat-skin set against the Inspector's DEBUG_MOBS list.
//
// The Inspector reads `?mob=` and falls back to `blaze` when the value is not in DEBUG_MOBS, WITHOUT saying so. A
// screenshot of such a mob therefore shows a blaze, and any verification based on it is worthless. That happened this
// round with `zombie_villager`.
//
// The mob KEY is not always derivable from the display name: `Zombified Piglin` is `zombified_piglin`, and several
// spawners return another mob's type entirely (`spawnSkeletonVariant`, `spawnZombieVariant`). A first cut lowercased the
// display name and reported 18 misses, most of them artifacts of my own derivation. The reliable source is the
// `type:` string the spawner assigns, or its `spawnMob('key')` call.
import { readFileSync } from 'node:fs';

const session = readFileSync('src/mobDebugSession.js', 'utf8');
const dm = session.match(/DEBUG_MOBS\s*=\s*'([^']+)'/);
if (!dm) { console.log('  DEBUG_MOBS not found'); process.exit(0); }
const debugMobs = new Set(dm[1].trim().split(/\s+/));

const src = readFileSync('src/mobs.js', 'utf8');
const lines = src.split('\n');
const spawners = [];
lines.forEach((line, i) => {
  const g = line.match(/^  (spawn[A-Z]\w*)\(([^)]*)\)\s*\{/);
  if (g) spawners.push({ name: g[1], start: i });
});
spawners.forEach((s, i) => { s.end = i + 1 < spawners.length ? spawners[i + 1].start : lines.length; });

const flat = [];
for (const s of spawners) {
  const body = lines.slice(s.start, s.end).join('\n');
  const binds = /this\.textures\??[.[]/.test(body) || /loadTexture\(/.test(body)
    || /adoptTexture\(/.test(body) || /adoptWhenReady\(/.test(body) || /skinPath/.test(body) || /SKIN_PATH/.test(body);
  if (binds) continue;

  // Prefer the `type:` the spawner sets, then a delegated `spawnMob('key')`, then the display name.
  const typeMatch = body.match(/^\s*type:\s*'([^']+)'/m);
  const delegate = body.match(/this\.spawnMob\(\s*'([^']+)'/);
  const named = (body.match(/name: '([^']+)'/) || [, s.name.replace(/^spawn/, '')])[1];
  const key = typeMatch?.[1] ?? delegate?.[1] ?? named.toLowerCase().replace(/\s+/g, '_');
  flat.push({ method: s.name, named, key, inInspector: debugMobs.has(key) });
}

const missing = flat.filter((f) => !f.inInspector);
console.log(`  DEBUG_MOBS entries: ${debugMobs.size}`);
console.log(`  spawners with no real sheet: ${flat.length}`);
console.log(`  of those, IN the Inspector: ${flat.length - missing.length}`);
console.log(`  of those, NOT spawnable in the Inspector: ${missing.length}`);
for (const f of missing.sort((a, b) => a.named.localeCompare(b.named))) {
  console.log(`    ${f.named.padEnd(20)} key='${f.key}'  (${f.method})`);
}
