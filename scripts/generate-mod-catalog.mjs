import { readdir, readFile, writeFile } from 'node:fs/promises';
import { normaliseManifest } from '../src/mods/registry.js';
import { resolvePackages } from '../src/mods/compatibility.js';

// Discovery happens at build time. Literal imports keep both Vite and Node safe.
const root = new URL('../src/mods/', import.meta.url);
const entries = [];
for (const directory of (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))) {
  let raw;
  try { raw = JSON.parse(await readFile(new URL(`${directory.name}/mod.json`, root), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const checked = normaliseManifest(raw);
  if (!checked.ok) throw new Error(`${directory.name}: ${checked.reason}`);
  for (const filename of [raw.entrypoint ?? './index.js', raw.serverEntrypoint, ...(raw.maps ?? []).map(m=>`maps/${m}`)].filter(Boolean)) {
    if (!/^(?:\.\/)?[a-zA-Z0-9_./-]+$/.test(filename) || filename.split('/').includes('..')) throw new Error('Package paths must stay inside their directory');
    await readFile(new URL(`${directory.name}/${filename.replace(/^\.\//,'')}`, root));
  }
  entries.push({ directory: directory.name, raw });
  await writeFile(new URL(`${directory.name}/manifest.js`, root), `// Generated from mod.json by scripts/generate-mod-catalog.mjs.\nexport default ${JSON.stringify(raw,null,2)};\n`);
}
for (const {raw} of entries) resolvePackages(raw.id, entries.map(e=>e.raw));
const header = '// Generated package discovery. Edit mod.json, then run npm run mods:generate.\n';
const catalog = entries.map(({directory,raw})=>`Object.freeze({id:${JSON.stringify(raw.id)},manifestPath:${JSON.stringify(`src/mods/${directory}/mod.json`)},manifest:${JSON.stringify(raw)},mapUrls:{${(raw.maps??[]).map(m=>`${JSON.stringify(m)}:new URL(${JSON.stringify(`./${directory}/maps/${m}`)},import.meta.url).href`).join(',')}},load:()=>import(${JSON.stringify(`./${directory}/${(raw.entrypoint??'./index.js').replace(/^\.\//,'')}`)})})`).join(',\n');
await writeFile(new URL('catalog.generated.js',root),`${header}export const BUILTIN_MODS=Object.freeze([\n${catalog}\n]);\n`);
const games = entries.filter(e=>e.raw.serverEntrypoint);
await writeFile(new URL('games.generated.js',root),header+games.map(({directory,raw},i)=>`import { createGame as factory${i} } from './${directory}/${raw.serverEntrypoint.replace(/^\.\//,'')}';`).join('\n')+`\nexport const GAME_FACTORIES=Object.freeze({${games.map((e,i)=>`${JSON.stringify(e.raw.id)}:factory${i}`).join(',')}});\nexport const GAME_MANIFESTS=Object.freeze(${JSON.stringify(games.map(e=>({...e.raw,packageDirectory:e.directory})))});\n`);
console.log(`Generated catalog: ${entries.length} packages, ${games.length} authoritative games.`);
