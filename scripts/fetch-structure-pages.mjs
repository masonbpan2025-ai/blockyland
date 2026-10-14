// node scripts/fetch-structure-pages.mjs <Page> ...
// Saves each page and its "/Structure" subpage (when it exists) under docs/structure-audit/wiki/, and reports how many
// {{layered blueprint}} drawings each holds.
import { mkdirSync, writeFileSync } from 'node:fs';
const api = async (params) => {
  for (let attempt = 0; ; attempt++) {
    try { return await (await fetch(`https://minecraft.wiki/api.php?format=json&${params}`)).json(); }
    catch (error) { if (attempt >= 4) throw error; await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); }
  }
};
for (const page of process.argv.slice(2)) {
  for (const title of [page, `${page}/Structure`]) {
    const j = await api('action=parse&redirects=1&prop=wikitext&page=' + encodeURIComponent(title));
    if (!j.parse) { console.log(title.padEnd(36), 'missing'); continue; }
    const text = j.parse.wikitext['*'];
    const dir = `docs/structure-audit/wiki/${title.replace(/[ /]/g, '_')}`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/wiki.txt`, text);
    const blueprints = (text.match(/\{\{layered blueprint/gi) || []).length;
    const loads = (text.match(/\{\{LoadPage/gi) || []).length;
    console.log(title.padEnd(36), String(text.length).padStart(6), 'blueprints', blueprints, 'loadpages', loads);
  }
}
