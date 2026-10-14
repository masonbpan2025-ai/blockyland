// node scripts/fetch-loot-modules.mjs
// Saves the wiki's chest loot modules (Module:LootChest, /chests, /items) under docs/structure-audit/wiki/_modules/,
// for scripts/generate-structure-loot.mjs.
import { mkdirSync, writeFileSync } from 'node:fs';

const DIR = 'docs/structure-audit/wiki/_modules';
mkdirSync(DIR, { recursive: true });
for (const [title, file] of [['Module:LootChest', 'LootChest.lua'], ['Module:LootChest/chests', 'chests.lua'], ['Module:LootChest/items', 'items.lua']]) {
  for (let attempt = 0; ; attempt++) {
    try {
      const url = `https://minecraft.wiki/api.php?format=json&action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(title)}`;
      const page = Object.values((await (await fetch(url)).json()).query.pages)[0];
      const text = page.revisions[0].slots.main['*'];
      writeFileSync(`${DIR}/${file}`, text);
      console.log(title, text.length);
      break;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
}
