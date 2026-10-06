// Audit which mob spawners FALL BACK TO A PROCEDURALLY GENERATED texture.
//
// Round forty-two found the chicken in exactly that state: correct geometry and correct UVs, but the texture came from
// `createChickenTexture()` rather than the asset. A mob in that state looks deliberate rather than broken, so it hides
// in the flat-colour list indefinitely.
//
// A first cut of this script flagged any spawner with no `loadTexture`/`adoptTexture` call and produced mostly FALSE
// POSITIVES: `this.textures.pig` IS the real preloaded sheet, so a spawner can be correctly textured while never
// calling a loader. The reliable signal is narrower -- a `create*Texture()` call in the spawner's own body, since that
// is a generated pattern by definition.
//
// The second signal is a spawner that reads a preloaded sheet by a KEY THAT MIGHT NOT EXIST, since the preloaded atlas
// has fallen back to a canvas texture before (the ocelot's `cat_<breed>` lookup). Those are reported separately because
// they are latent rather than active faults.
import { readFileSync } from 'node:fs';

const src = readFileSync('src/mobs.js', 'utf8');
const lines = src.split('\n');

const spawners = [];
lines.forEach((line, i) => {
  const m = line.match(/^  (spawn[A-Z]\w*)\(([^)]*)\)\s*\{/);
  if (m) spawners.push({ name: m[1], start: i });
});
spawners.forEach((s, i) => { s.end = i + 1 < spawners.length ? spawners[i + 1].start : lines.length; });

/** Texture keys the preloaded atlas is known to provide (`this.textures.<key>` reads across the source). */
const provided = new Set();
for (const m of src.matchAll(/this\.textures\??\.(\w+)/g)) provided.add(m[1]);

const procedural = [];
const latent = [];

for (const s of spawners) {
  const body = lines.slice(s.start, s.end).join('\n');
  const gen = [...body.matchAll(/this\.(create\w*Texture)\(/g)].map((m) => m[1]);
  if (gen.length) {
    // A generator alongside a real-texture read is only a FALLBACK; alone, it is the source.
    const readsAtlas = /this\.textures\??[.\[]/.test(body);
    procedural.push({ name: s.name, gen: [...new Set(gen)], readsAtlas });
  }
  // Keys read by a fallback chain that the preloaded atlas may not have.
  for (const m of body.matchAll(/this\.textures\??\.(\w+)/g)) {
    if (!provided.has(m[1])) latent.push({ name: s.name, key: m[1] });
  }
}

const atlas = new Set([...src.matchAll(/this\.textures\.(\w+)\s*=/g)].map((m) => m[1]));
console.log(`  spawners: ${spawners.length}`);
console.log(`  spawners that generate a texture: ${procedural.length}`);
for (const r of procedural) {
  const kind = r.readsAtlas ? 'FALLBACK after a real sheet' : 'GENERATOR ONLY -- no real sheet read';
  console.log(`    ${r.name}  [${r.gen.join(', ')}]  ${kind}`);
}
console.log(`  texture keys referenced but never assigned: ${new Set(latent.map((l) => l.key)).size}`);
for (const key of [...new Set(latent.map((l) => l.key))].sort()) {
  const who = [...new Set(latent.filter((l) => l.key === key).map((l) => l.name))].join(', ');
  console.log(`    ${key}  <- ${who}`);
}
