// Measure which mob spawners bind NO real sheet at all: no `this.textures.<key>` read, no `loadTexture`, no
// `adoptTexture`, no `skinPath` option. That is the true "flat colour only" set, rather than a running tally.
import { readFileSync } from 'node:fs';

const src = readFileSync('src/mobs.js', 'utf8');
const lines = src.split('\n');

const spawners = [];
lines.forEach((line, i) => {
  const m = line.match(/^  (spawn[A-Z]\w*)\(([^)]*)\)\s*\{/);
  if (m) spawners.push({ name: m[1], start: i });
});
spawners.forEach((s, i) => { s.end = i + 1 < spawners.length ? spawners[i + 1].start : lines.length; });

/** Where the mob's display name lives, so the report reads like the audit. */
const flat = [];
const delegated = [];
const skinned = [];
for (const s of spawners) {
  const body = lines.slice(s.start, s.end).join('\n');
  const binds = /this\.textures\??[.[]/.test(body)
    // `loadTexture:` counts as much as `loadTexture(`: a spawner that PASSES a loader is binding a real sheet even though
    // it never calls the loader itself. Missing the colon form made this audit report false positives for the squid,
    // donkey and mule, each of which reaches its sheet through a delegated model.
    || /loadTexture\s*[(:]/.test(body)
    || /adoptTexture\(/.test(body)
    || /adoptWhenReady\(/.test(body)
    || /skinPath/.test(body)
    || /SKIN_PATH/.test(body);
  const named = (body.match(/name: '([^']+)'/) || [, s.name.replace(/^spawn/, '')])[1];
  // A body that is one forwarding call delegates its texture decision to another module. DELEGATED is NOT FLAT: this tool
  // cannot see the answer from here, and reporting it as flat has already produced false positives for the squid, donkey
  // and mule, each of which reaches its sheet through a delegated spawner.
  const forwards = /return\s+\w+\(this\s*,|return\s+spawn\w+\(this\s*,/.test(body);
  if (binds) skinned.push({ method: s.name, named });
  else if (forwards) delegated.push({ method: s.name, named });
  else flat.push({ method: s.name, named });
}

console.log(`  spawners total: ${spawners.length}`);
console.log(`  bind a real sheet: ${skinned.length}`);
console.log(`  no sheet in their own body: ${flat.length + delegated.length}`);
console.log(`    DELEGATED to another module (cannot be judged here): ${delegated.length}`);
for (const d of delegated.sort((a, b) => a.named.localeCompare(b.named))) {
  console.log(`      ${d.named.padEnd(22)} ${d.method}`);
}
console.log(`    GENUINELY FLAT (needs model work): ${flat.length}`);
for (const f of flat.sort((a, b) => a.named.localeCompare(b.named))) {
  console.log(`      ${f.named.padEnd(22)} ${f.method}`);
}
