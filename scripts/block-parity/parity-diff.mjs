// Parity audit: diff this game's block registry against the wiki Block page list.
//
// Removed blocks and April Fools' joke blocks are reported separately and excluded from the parity gap
// count. Name matching lives in src/blockNameMatch.js so this script, the vanilla-data comparison and
// the test suite all agree on what "the same block" means.
//
// Run: node scripts/parity-audit/parity-diff.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS } from '../../src/blocks.js';
import { compareBlockLists, gameKeysNamedByVanilla } from '../../src/blockNameMatch.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// --- wiki list ---------------------------------------------------------------
// The in-scope sections of the wiki list, extracted by parity-extract.mjs into a tracked fixture.
// Reading the fixture rather than the network keeps this reproducible.
const fixturePath = path.join(root, 'tests/fixtures/wiki-block-list.json');
if (!existsSync(fixturePath)) {
  console.error('missing fixture; run: node scripts/parity-audit/parity-extract.mjs');
  process.exit(1);
}
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const IN_SCOPE = ['item', 'technical', 'education'];
const EXCLUDED = ['removed', 'joke'];

const counts = {};
for (const [section, names] of Object.entries(fixture.sections)) counts[section] = names.length;

const uniqueInScope = [...new Set(IN_SCOPE.flatMap((s) => fixture.sections[s] ?? []))];
const excludedDistinct = new Set(EXCLUDED.flatMap((s) => fixture.sections[s] ?? []));

// --- comparison --------------------------------------------------------------
const { covered, missing } = compareBlockLists(uniqueInScope);

// Which registry keys does the wiki list name? A key it never names is either a state of a named block
// (expected) or a block with no wiki page (a finding worth reading).
const { named, unnamed } = gameKeysNamedByVanilla(uniqueInScope);
const gameKeys = Object.keys(BLOCKS).filter((k) => typeof BLOCKS[k] === 'number' && k !== 'GRASS_BLOCK');
const unreached = unnamed.filter((k) => gameKeys.includes(k));

// Group the missing names by family so the report is actionable rather than a wall of 500 lines.
// The families are written against registry-style snake_case, so each missing display name is folded
// back to that shape first -- matching "Shulker Box" against /shulker_box/ silently put all 526 names
// in one bucket the first time this ran.
const toKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

const FAMILIES = [
  ['shulker/glazed/candle-cake', /shulker_box|glazed_terracotta|candle_cake/],
  ['saplings and potted plants', /sapling|potted_/],
  ['coral', /coral/],
  ['crops, stems and wart', /_stem$|nether_wart|cocoa|beetroots|_crop$|attached_/],
  ['small plants, grass and vines', /fern|grass|seagrass|vine|bush|kelp|azalea|dripleaf|eyeblossom|propagule|cobweb|hanging_roots|spore_blossom|leaf_litter|wildflower|firefly/],
  ['ores and infested stone', /_ore$|infested/],
  ['wall-mounted states', /wall_sign|wall_torch|wall_head|wall_skull|wall_fan/],
  ['mob heads', /_head$|_skull$/],
  ['amethyst', /amethyst/],
  ['cauldron fill states', /cauldron/],
  ['spawners and vaults', /spawner|vault/],
  ['eggs', /_egg$/],
  ['command / structure / debug', /command_block|structure_block|structure_void|jigsaw|barrier|end_gateway|end_portal_frame|reinforced_deepslate|^test/],
  ['ungrouped', /.*/],
];

const byFamily = [];
const claimed = new Set();
for (const [label, re] of FAMILIES) {
  const hits = missing.filter((n) => !claimed.has(n) && re.test(toKey(n)));
  for (const h of hits) claimed.add(h);
  if (hits.length) byFamily.push([label, hits]);
}

const report = {
  wikiSections: counts,
  wikiInScopeDistinct: uniqueInScope.length,
  wikiExcludedDistinct: excludedDistinct.size,
  gameBlockKeys: gameKeys.length,
  matchedWikiNames: covered.length,
  missingWikiNames: missing.length,
  namedGameKeys: named.size,
  gameKeysNotNamedByWiki: unreached.length,
  missingByFamily: Object.fromEntries(byFamily),
  gameKeysNotNamedByWikiList: [...unreached].sort(),
};
writeFileSync(path.join(here, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({
  wikiInScopeDistinct: report.wikiInScopeDistinct,
  wikiExcludedDistinct: report.wikiExcludedDistinct,
  gameBlockKeys: report.gameBlockKeys,
  matched: report.matchedWikiNames,
  missing: report.missingWikiNames,
  namedGameKeys: report.namedGameKeys,
  gameKeysNotNamedByWiki: report.gameKeysNotNamedByWiki,
}, null, 2));

console.log('\nmissing by family:');
for (const [label, hits] of byFamily) console.log(`  ${String(hits.length).padStart(4)}  ${label}`);

console.log(`\ngame keys the wiki list never names (${unreached.length}):`);
console.log([...unreached].sort().join(', '));

// Guard against the matcher silently degrading: if almost nothing matches, the vocabulary broke
// rather than the game having lost its blocks.
if (covered.length < gameKeys.length * 0.5) {
  console.error('\nWARNING: fewer than half the game keys matched a wiki name; the matcher is suspect.');
  process.exitCode = 1;
}
