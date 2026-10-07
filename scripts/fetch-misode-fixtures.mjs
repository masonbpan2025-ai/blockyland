// Fetch real vanilla data pack JSON from misode/mcmeta, as misode.github.io's generators emit it.
//
// These become checked-in fixtures so the adapters are validated against the real shape rather than against
// an idea of it. The URL shape is `<tag>/data/minecraft/<type>/<name>.json`; the tag is what pins the
// version, which is why it is written down here and in the fixtures' README rather than fetched "latest".
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const REF = '1.21.4-data';
const BASE = `https://raw.githubusercontent.com/misode/mcmeta/${REF}/data/minecraft`;

const WANTED = [
  ['worldgen/biome/plains', 'biome/plains.json'],
  ['worldgen/biome/warped_forest', 'biome/warped_forest.json'],
  ['worldgen/biome/the_end', 'biome/the_end.json'],
  ['dimension_type/overworld', 'dimension_type/overworld.json'],
  ['dimension_type/the_nether', 'dimension_type/the_nether.json'],
  ['dimension_type/the_end', 'dimension_type/the_end.json'],
  ['recipe/oak_planks', 'recipe/oak_planks.json'],
  ['recipe/stick', 'recipe/stick.json'],
  ['recipe/shield', 'recipe/shield.json'],
  ['recipe/iron_ingot_from_smelting_raw_iron', 'recipe/iron_ingot_from_smelting_raw_iron.json'],
  ['loot_table/blocks/oak_log', 'loot_table/oak_log.json'],
  ['loot_table/blocks/oak_leaves', 'loot_table/oak_leaves.json'],
  ['loot_table/blocks/diamond_ore', 'loot_table/diamond_ore.json'],
  ['tags/item/logs', 'tags/item/logs.json'],
  ['tags/item/oak_logs', 'tags/item/oak_logs.json'],
  ['tags/block/mineable/pickaxe', 'tags/block/mineable_pickaxe.json'],
  ['worldgen/placed_feature/trees_plains', 'placed_feature/trees_plains.json'],
  ['worldgen/structure/village_plains', 'structure/village_plains.json'],
];

mkdirSync('tests/fixtures/misode', { recursive: true });
let ok = 0;
const failed = [];
for (const [remote, local] of WANTED) {
  const url = `${BASE}/${remote}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) { failed.push(`${remote} HTTP ${res.status}`); continue; }
    const json = JSON.parse(await res.text());
    const target = `tests/fixtures/misode/${local}`;
    // The fixtures are grouped by type, so the directory has to exist before the file is written. The first
    // version created only the root and every write failed with ENOENT after a successful fetch.
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(json, null, 2) + '\n', 'utf8');
    ok++;
    console.log(`  ok   ${remote}`);
  } catch (err) {
    failed.push(`${remote}: ${err.message}`);
  }
}
writeFileSync('tests/fixtures/misode/SOURCE.md',
  `# Where these came from\n\n`
  + `Vanilla data pack JSON from [misode/mcmeta](https://github.com/misode/mcmeta), tag \`${REF}\`,\n`
  + `under \`data/minecraft/\`. This is the same source and the same shape that\n`
  + `[misode.github.io](https://misode.github.io/)'s data pack generators emit, so the loader's adapters are\n`
  + `validated against real generator output rather than against a hand-written sample.\n\n`
  + `Refetch with \`node scripts/fetch-misode-fixtures.mjs\` after changing \`REF\`.\n`, 'utf8');
console.log(`\n  fetched ${ok}/${WANTED.length} from ${REF}`);
for (const f of failed) console.log('  FAILED ' + f);
