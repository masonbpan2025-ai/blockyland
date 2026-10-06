// Summarise the block parity gap, split into the two baselines that matter:
//
//   A. absent against the repo's own pinned vanilla data (pc/1.21.4) -- implementable today
//   B. named by the wiki but absent from that pinned data     -- newer than the cache
//
// Run: node scripts/block-parity/gap-summary.mjs
import { readFileSync } from 'node:fs';
import { compareBlockLists } from '../../src/blockNameMatch.js';

const vanilla = JSON.parse(readFileSync('.cache/mc-data/blocks.json', 'utf8')).map((b) => b.name);
const fixture = JSON.parse(readFileSync('tests/fixtures/wiki-block-list.json', 'utf8'));
const wiki = [...new Set(['item', 'technical', 'education'].flatMap((s) => fixture.sections[s] ?? []))];

const a = compareBlockLists(vanilla);
const b = compareBlockLists(wiki);

const vanillaSet = new Set(vanilla);
const toKey = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Reconcile the two totals. The wiki list and the pinned cache do not cover exactly the same blocks
// (the wiki has newer content; the cache has technical blocks the wiki files elsewhere), so the same
// gap is counted from each side and the overlap is computed explicitly rather than assumed.
const wikiKeys = new Set(wiki.map(toKey));
// Pinned-cache blocks that are missing AND appear on the wiki list: the shared part of the gap.
const pinnedMissingOnWiki = a.missing.filter((n) => wikiKeys.has(toKey(n)));
const pinnedMissingNotOnWiki = a.missing.filter((n) => !wikiKeys.has(toKey(n)));
// Wiki names absent from the pinned cache entirely: content newer than the cache.
const newer = b.missing.filter((n) => !vanillaSet.has(toKey(n)));
// Wiki names the cache does have but the game lacks.
const genuine = b.missing.filter((n) => vanillaSet.has(toKey(n)));

const FAMILIES = [
  ['Colour families needing a tile entity or oriented model', /shulker_box|glazed_terracotta|candle_cake|_wool_slab|_wool_stairs|_concrete_slab|_concrete_stairs/],
  ['Coral (five types, alive and dead, four shapes)', /coral/],
  ['Saplings and potted plants', /sapling|potted_|propagule/],
  ['Small plants, grass, ferns and vines', /fern|grass|seagrass|vine|bush|kelp|azalea|dripleaf|eyeblossom|cobweb|hanging_roots|spore_blossom|leaf_litter|wildflower|firefly|_shoot/],
  ['Ores, deepslate ores and infested stone', /_ore$|infested/],
  ['Wall-mounted states (signs, torches, heads, fans)', /wall_sign|wall_torch|wall_head|wall_skull|wall_fan|copper_torch/],
  ['Mob heads', /_head$|_skull$/],
  ['Crops, stems and wart', /_stem$|nether_wart|cocoa|beetroots|_crop$|attached_/],
  ['Amethyst buds and clusters', /amethyst/],
  ['Cauldron fill states', /cauldron/],
  ['Spawners, trial spawners and vaults', /spawner|vault/],
  ['Eggs', /_egg$/],
  ['Command, structure and debug blocks', /command_block|building_block|building_void|jigsaw|barrier|end_gateway|end_portal_frame|reinforced_deepslate|^test|light$/],
  ['Fluid and light helper states', /bubble_column|frosted_ice|soul_fire|cave_air|void_air|moving_piston|dirt_path/],
  ['Copper family additions (bars, chest, lantern, golem)', /copper_bars|copper_chain|copper_chest|copper_lantern|golem|lightning_rod|copper_grate/],
  ['Cinnabar and sulfur families (newer content)', /cinnabar|sulfur/],
  ['Resin family', /resin/],
  ['Shelves', /shelf/],
  ['Poplar wood set', /poplar/],
  ['Ungrouped', /.*/],
];

const group = (list) => {
  const out = [];
  const claimed = new Set();
  for (const [label, re] of FAMILIES) {
    const hits = list.filter((n) => !claimed.has(n) && re.test(toKey(n)));
    for (const h of hits) claimed.add(h);
    if (hits.length) out.push([label, hits]);
  }
  return out;
};

const report = {
  pinnedBaseline: {
    total: vanilla.length,
    implemented: a.covered.length,
    missing: a.missing.length,
    pct: +(100 * a.covered.length / vanilla.length).toFixed(1),
  },
  wikiBaseline: {
    inScope: wiki.length,
    resolved: b.covered.length,
    missing: b.missing.length,
    pct: +(100 * b.covered.length / wiki.length).toFixed(1),
  },
  missingBreakdown: {
    absentVsPinnedData: a.missing.length,
    ofWhichListedOnWiki: pinnedMissingOnWiki.length,
    ofWhichNotOnWikiList: pinnedMissingNotOnWiki.length,
    newerThanPinnedData: newer.length,
    genuineWikiNamesAbsentFromCache: genuine.length,
  },
  missingVsPinnedByFamily: Object.fromEntries(group(a.missing).map(([k, v]) => [k, v.length])),
  newerByFamily: Object.fromEntries(group(newer).map(([k, v]) => [k, v.length])),
};

console.log(JSON.stringify(report, null, 2));
console.log('\n--- absent vs pinned data, by family ---');
for (const [label, hits] of group(a.missing)) {
  console.log(`\n${label} (${hits.length})`);
  console.log('  ' + hits.join(', '));
}
console.log('\n--- newer than pinned data, by family ---');
for (const [label, hits] of group(newer)) {
  console.log(`\n${label} (${hits.length})`);
  console.log('  ' + hits.slice(0, 30).join(', ') + (hits.length > 30 ? ` … +${hits.length - 30}` : ''));
}
