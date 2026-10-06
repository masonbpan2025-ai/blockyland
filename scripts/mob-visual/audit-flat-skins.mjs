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
const skinned = [];
for (const s of spawners) {
  const body = lines.slice(s.start, s.end).join('\n');
  const binds = /this\.textures\??[.[]/.test(body)
    || /loadTexture\(/.test(body)
    || /adoptTexture\(/.test(body)
    || /adoptWhenReady\(/.test(body)
    || /skinPath/.test(body)
    || /SKIN_PATH/.test(body);
  const named = (body.match(/name: '([^']+)'/) || [, s.name.replace(/^spawn/, '')])[1];
  (binds ? skinned : flat).push({ method: s.name, named });
}

console.log(`  spawners total: ${spawners.length}`);
console.log(`  bind a real sheet: ${skinned.length}`);
console.log(`  NO real sheet (the true flat set): ${flat.length}`);
for (const f of flat.sort((a, b) => a.named.localeCompare(b.named))) {
  console.log(`    ${f.named.padEnd(22)} ${f.method}`);
}
