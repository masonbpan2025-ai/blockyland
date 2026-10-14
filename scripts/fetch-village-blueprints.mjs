// node scripts/fetch-village-blueprints.mjs
// Downloads every village blueprint subpage listed on https://minecraft.wiki/w/Village/Structure/Blueprints into
// docs/structure-audit/wiki/Village_Blueprints/<Type>/<Name>.txt (raw wikitext, following redirects).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const api = async (params) => (await fetch(`https://minecraft.wiki/api.php?format=json&${params}`)).json();
const index = (await api('action=parse&page=' + encodeURIComponent('Village/Structure/Blueprints') + '&prop=wikitext')).parse.wikitext['*'];
mkdirSync('docs/structure-audit/wiki/Village_Structure_Blueprints', { recursive: true });
writeFileSync('docs/structure-audit/wiki/Village_Structure_Blueprints/wiki.txt', index);
const subpages = [...index.matchAll(/\{\{LoadPage\|\{\{FULLPAGENAME\}\}\/([^|]+)\|/g)].map((m) => m[1]);
console.log(subpages.length, 'subpages');
let saved = 0;
for (const sub of subpages) {
  const title = 'Village/Structure/Blueprints/' + sub;
  const page = await api('action=parse&redirects=1&page=' + encodeURIComponent(title) + '&prop=wikitext');
  if (!page.parse) { console.log('missing', title); continue; }
  const resolved = page.parse.title.replace('Village/Structure/Blueprints/', '');
  const file = `docs/structure-audit/wiki/Village_Blueprints/${resolved.replace(/[^\w/ -]/g, '_')}.txt`;
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  writeFileSync(file, page.parse.wikitext['*']);
  saved++;
}
console.log(saved, 'saved');
