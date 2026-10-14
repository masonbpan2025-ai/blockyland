// node scripts/fetch-system-wiki.mjs
// Saves the wiki pages and data modules the game-systems audit (src/systemsWikiAudit.js) reads, under
// docs/block-item-audit/wiki/systems/: trading, brewing, enchanting, effects, smithing, commands and redstone.
import { mkdirSync, writeFileSync } from 'node:fs';

const DIR = 'docs/block-item-audit/wiki/systems';
mkdirSync(DIR, { recursive: true });
const TITLES = process.argv.slice(2).length ? process.argv.slice(2) : [
  'Trading', 'Brewing', 'Potion', 'Enchanting', 'Enchanting/Levels', 'Enchantment', 'Effect', 'Smithing', 'Smithing Template',
  'Commands', 'Redstone circuits', 'Redstone Dust', 'Redstone Repeater', 'Redstone Comparator', 'Piston', 'Observer', 'Redstone Torch',
  'Daylight Detector', 'Target', 'Lever', 'Button', 'Pressure Plate', 'Hopper', 'Dropper', 'Dispenser', 'Note Block',
  'Module:TradeTable', 'Module:Get trade info', 'Module:Brewing', 'Module:Smithing', 'Module:Command',
];
for (const title of TITLES) {
  const url = `https://minecraft.wiki/api.php?${new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content|ids', rvslots: 'main', redirects: '1', titles: title, format: 'json', formatversion: '2' })}`;
  const json = await (await fetch(url, { headers: { 'User-Agent': 'MinecraftInBrowserParityAudit/1.0' } })).json();
  const page = json.query.pages[0];
  if (page.missing) { console.log('missing', title); continue; }
  const rev = page.revisions[0];
  writeFileSync(`${DIR}/${title.replace(/[:/ ]/g, '_')}.json`, JSON.stringify({ title: page.title, revid: rev.revid, text: rev.slots.main.content }));
  console.log(title, '->', page.title, rev.revid, rev.slots.main.content.length);
}
