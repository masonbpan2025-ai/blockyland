// node scripts/fetch-wiki-structure.mjs <Wiki_Page_Name> [out-dir]
//
// Downloads what a parity audit must compare against, from the Minecraft Wiki's API:
//   * the raw wikitext (the infobox "Blocks" list, mobs, generation rules),
//   * every image on the page, so they can be LOOKED AT next to the Inspector's textured view.
// Output goes to docs/structure-audit/wiki/<Page>/ (wiki.txt, infobox-blocks.txt, images/). The wiki's text and
// images are only for comparison and are not committed to the game's assets.
import { mkdirSync, writeFileSync } from 'node:fs';

const page = process.argv[2];
if (!page) { console.error('usage: node scripts/fetch-wiki-structure.mjs <Page_Name> [out-dir]'); process.exit(2); }
const out = process.argv[3] ?? `docs/structure-audit/wiki/${page}`;
const api = (params) => fetch(`https://minecraft.wiki/api.php?format=json&${params}`).then((r) => r.json());

const wikitext = (await api(`action=parse&page=${encodeURIComponent(page)}&prop=wikitext`)).parse.wikitext['*'];
mkdirSync(`${out}/images`, { recursive: true });
writeFileSync(`${out}/wiki.txt`, wikitext);

// The infobox's "| blocks =" list: {{BlockLink|Name}} entries.
const blocksSection = wikitext.match(/\|\s*blocks\s*=([\s\S]*?)\n\|\s*\w+\s*=|\|\s*blocks\s*=([\s\S]*?)\n\}\}/);
const blocks = [...(blocksSection?.[1] ?? blocksSection?.[2] ?? '').matchAll(/\{\{(?:Block|Item)Link\|([^}|]+)/gi)]
  .map((m) => m[1].trim().toLowerCase().replace(/\s+/g, '_'));
writeFileSync(`${out}/infobox-blocks.txt`, blocks.join('\n') + '\n');

const files = [...wikitext.matchAll(/\[\[File:([^|\]]+)/g)].map((m) => m[1].trim());
const galleries = [...wikitext.matchAll(/^File:([^|\n]+)\|/gm)].map((m) => m[1].trim());
const infoboxImage = wikitext.match(/\|\s*image\s*=\s*([^\n|]+)/)?.[1]?.trim();
const names = [...new Set([infoboxImage, ...files, ...galleries].filter(Boolean))];
for (const name of names) {
  const info = Object.values((await api(`action=query&titles=${encodeURIComponent('File:' + name)}&prop=imageinfo&iiprop=url`)).query.pages)[0];
  const url = info.imageinfo?.[0]?.url;
  if (!url) { console.log('no url for', name); continue; }
  const file = `${out}/images/${name.replace(/[^\w.-]+/g, '_')}`;
  writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));
  console.log('saved', file);
}
console.log(`infobox blocks (${blocks.length}): ${blocks.join(', ') || 'none found'}`);
