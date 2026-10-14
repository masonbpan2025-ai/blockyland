// node scripts/fetch-structure-subpages.mjs <Page/Structure> ...
// Fetches every {{LoadPage|...}} subpage a saved Structure page transcludes, into <dir>/sub/<name>.txt.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const api = async (params) => {
  for (let attempt = 0; ; attempt++) {
    try { return await (await fetch(`https://minecraft.wiki/api.php?format=json&${params}`)).json(); }
    catch (error) { if (attempt >= 4) throw error; await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
  }
};
for (const title of process.argv.slice(2)) {
  const dir = `docs/structure-audit/wiki/${title.replace(/[ /]/g, '_')}`;
  const text = readFileSync(`${dir}/wiki.txt`, 'utf8');
  const subs = [...text.matchAll(/\{\{LoadPage\|((?:\{\{(?:FULL)?PAGENAME\}\})?[^|}]+)/gi)].map((m) => m[1].trim().replace(/\{\{(?:FULL)?PAGENAME\}\}/, title));
  mkdirSync(`${dir}/sub`, { recursive: true });
  let n = 0; let bps = 0;
  for (const sub of subs) {
    const full = sub.startsWith('/') ? title + sub : sub;
    const j = await api('action=parse&redirects=1&prop=wikitext&page=' + encodeURIComponent(full));
    if (!j.parse) { console.log('  missing', full); continue; }
    const t = j.parse.wikitext['*'];
    bps += (t.match(/\{\{layered blueprint/gi) || []).length;
    writeFileSync(`${dir}/sub/${full.split('/').pop().replace(/[^\w -]/g, '_')}.txt`, t);
    n++;
  }
  console.log(title, subs.length, 'subpages,', n, 'saved,', bps, 'blueprints');
}
