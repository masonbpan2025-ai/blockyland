// Parity audit helper: fetch the wiki Item page's item-list sections and save them locally
// so the item parity diff can run without hitting the network again.
//
//   node scripts/parity-audit/item-fetch-wiki.mjs
//
// Sections 2..5 are the in-scope vanilla lists; 6 is Minecraft Education (reported separately);
// 7..9 are Unimplemented / Removed / Joke items, which the gap report excludes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, '.cache', 'wiki');
fs.mkdirSync(outDir, { recursive: true });

const api = 'https://minecraft.wiki/api.php';
const get = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'parity-audit/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const toc = await get(`${api}?action=parse&page=Item&prop=sections&format=json&formatversion=2`);
fs.writeFileSync(path.join(outDir, 'item-sections.json'), JSON.stringify(toc, null, 2), 'utf8');

// "Lists of items" is the subtree we care about.
const wanted = toc.parse.sections.filter((s) => /item|spawn egg|education|unimplemented|removed|joke|block/i.test(s.line)
  && Number(s.index) >= 2);
const parts = [];
for (const s of wanted) {
  const data = await get(
    `${api}?action=parse&page=Item&section=${s.index}&prop=wikitext&format=json&formatversion=2`
  );
  const wt = data.parse.wikitext;
  fs.writeFileSync(path.join(outDir, `item-section-${s.index}.txt`), wt, 'utf8');
  parts.push(`\n===SECTION ${s.index}: ${s.line}===\n` + wt);
  console.log(s.index, s.line, wt.length);
}
fs.writeFileSync(path.join(outDir, 'item-list-sections.txt'), parts.join('\n'), 'utf8');
console.log('sections', toc.parse.sections.map((s) => `${s.index}:${s.line}`).join(' | '));
