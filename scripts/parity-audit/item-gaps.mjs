// Item parity diff: wiki Item page lists vs. this game's registries.
//
//   node scripts/parity-audit/item-gaps.mjs            summary to stdout
//   node scripts/parity-audit/item-gaps.mjs --json     machine-readable
//
// Resolution strategy: a wiki row's display name is matched against the pinned vanilla registry
// (`.cache/mc-data/items.json`, pc/1.21.4) by display name first and snake_case id second. That
// bridge matters because the wiki spells names the way the game shows them ("Block of Iron",
// "Bottle o' Enchanting") while this repo keys items by id ("iron_block", "experience_bottle").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../../src/blocks.js';
import { EXTRA_ITEMS } from '../../src/extraItems.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/wiki-item-list.json'), 'utf8'));
const vanillaItems = JSON.parse(fs.readFileSync(path.join(root, '.cache/mc-data/items.json'), 'utf8'));

const norm = (s) => String(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const snake = (s) => norm(s).replace(/ /g, '_');

// --- pinned vanilla registry -------------------------------------------------
const vanillaByDisplay = new Map();
const vanillaById = new Map();
for (const it of vanillaItems) {
  vanillaById.set(it.name, it);
  if (!vanillaByDisplay.has(norm(it.displayName))) vanillaByDisplay.set(norm(it.displayName), it);
}

// --- this game's registry ----------------------------------------------------
// `origin` records where a name comes from, so the report can distinguish "registered but inert"
// (a bare EXTRA_ITEMS entry generated only to unblock a recipe) from real content.
const game = new Map(); // id -> { origin:Set, def }
const add = (id, origin, def) => {
  const key = String(id);
  if (!game.has(key)) game.set(key, { id: key, origin: new Set(), def: null });
  const e = game.get(key);
  e.origin.add(origin);
  if (def && !e.def) e.def = def;
};

for (const [key, id] of Object.entries(BLOCKS)) {
  if (typeof id !== 'number') continue;
  add(key.toLowerCase(), 'BLOCKS', BLOCK_DEFS[id] || null);
}
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def?.name) continue;
  add(snake(def.name), 'BLOCK_DEFS', def);
}
for (const [id, def] of Object.entries(ITEMS)) add(id, 'ITEMS', def);
for (const [id, def] of Object.entries(EXTRA_ITEMS)) add(id, 'EXTRA_ITEMS', def);

// Names this repo spells differently from the vanilla id, so the diff does not report a false gap.
const ALIAS = new Map(Object.entries({
  cobbled_deepslate: 'cobblestone',
  nether_bricks: 'nether_brick',
  charcoal: 'coal',
  turtle_shell: 'turtle_helmet',
  leather_cap: 'leather_helmet',
  leather_tunic: 'leather_chestplate',
  leather_pants: 'leather_leggings',
  netherite_upgrade: 'netherite_upgrade_smithing_template',
}));

// The pinned cache has one generic display name for a whole family ("Music Disc" is the display
// name of all twenty discs, "Spawn Egg" of all eighty), so a display-name lookup cannot resolve
// them. These patterns recover the id the wiki's prose name refers to.
const PATTERNS = [
  [/^music disc (.+)$/i, (m) => `music_disc_${snake(m[1])}`],
  [/^(.+) spawn egg$/i, (m) => `${snake(m[1])}_spawn_egg`],
  [/^bucket of (.+)$/i, (m) => `${snake(m[1])}_bucket`],
  [/^block of (.+)$/i, (m) => `${snake(m[1])}_block`],
  [/^boat of (.+)$/i, (m) => `${snake(m[1])}_boat`],
  [/^(.+) boat with chest$/i, (m) => `${snake(m[1])}_chest_boat`],
  [/^(.+) armor trim$/i, (m) => `${snake(m[1])}_armor_trim_smithing_template`],
  [/^(.+) banner pattern$/i, (m) => `${snake(m[1])}_banner_pattern`],
  [/^(.+) pottery sherd$/i, (m) => `${snake(m[1])}_pottery_sherd`],
  [/^(.+) nautilus armor$/i, (m) => `${snake(m[1])}_nautilus_armor`],
  [/^(.+) horse armor$/i, (m) => `${snake(m[1])}_horse_armor`],
];

function resolveId(name) {
  const s = snake(name);
  if (vanillaById.has(s)) return vanillaById.get(s).name;
  const d = vanillaByDisplay.get(norm(name));
  if (d) return d.name;
  for (const [re, f] of PATTERNS) {
    const m = name.match(re);
    if (m) return f(m);
  }
  return s;
}

const rows = [];
const unresolved = [];
for (const [section, v] of Object.entries(fixture.sections)) {
  for (const [group, list] of Object.entries(v.groups)) {
    for (const row of list) {
      const wikiKey = snake(row.name);
      let id = resolveId(row.name);
      if (ALIAS.has(id)) id = ALIAS.get(id);
      const present = game.has(id) || game.has(wikiKey);
      if (!vanillaById.has(id)) unresolved.push({ section, name: row.name, id });
      rows.push({
        section,
        group,
        wikiName: row.name,
        resolvedId: vanillaById.has(id) ? id : null,
        gameId: present ? (game.has(wikiKey) ? wikiKey : id) : null,
        present,
        only: row.only,
        upcoming: row.upcoming,
        origin: present ? [...(game.get(id) || game.get(wikiKey)).origin] : [],
      });
    }
  }
}

const bySection = {};
for (const r of rows) {
  const s = (bySection[r.section] ||= { total: 0, present: 0, missing: [], inert: [], upcoming: [], platform: [] });
  s.total++;
  if (r.present) {
    s.present++;
    if (r.origin.length === 1 && r.origin[0] === 'EXTRA_ITEMS') s.inert.push(r.wikiName);
  } else if (r.upcoming) s.upcoming.push(r.wikiName);
  else s.missing.push(r.wikiName);
  if (r.only && !r.present) s.platform.push(`${r.wikiName} [${r.only}]`);
}

// --- classification of the gaps ---------------------------------------------
//
// Three questions the raw missing list cannot answer on its own:
//   1. Is the entry a vanilla item this game should already have, or a wiki revision newer than the
//      pinned pc/1.21.4 cache (Sulfur, Cinnabar, Poplar, Cushion, Shelf, Copper chest)?
//   2. Which family does it belong to, so a count of 300 colour variants does not look like 300
//      separate jobs?
//   3. Which platform-exclusive entries are out of scope for a Java-parity target?
const FAMILIES = [
  [/^(allow|border|deny|light)$/, 'Platform-exclusive Bedrock/Education blocks'],
  [/shulker_box$/, 'Shulker boxes (needs a tile entity + oriented model)'],
  [/glazed_terracotta$/, 'Glazed terracotta (oriented model, per-colour texture)'],
  [/_concrete_(slab|stairs)$/, 'Coloured concrete slabs/stairs'],
  [/_wool_(slab|stairs)$/, 'Coloured wool slabs/stairs'],
  [/^(dead_)?(tube|brain|bubble|fire|horn)_coral(_block|_fan)?$/, 'Coral (5 types x alive/dead x block/fan)'],
  [/^(bucket_of_|.*_bucket$)/, 'Buckets of fish and mobs'],
  [/(command_block|_command_block|jigsaw|building_block|building_void|^barrier$|debug_stick|knowledge_book|^test_.*block$|end_portal_frame|reinforced_deepslate)/, 'Command, structure and debug blocks'],
  [/^(cake|ender_chest|trapped_chest|monster_spawner|spawner|vault|trial_spawner)$/, 'Block entities that need a new system (cake, ender/trapped chest, spawner, vault)'],
  [/^(chain|iron_chain|copper_chain)$/, 'Chains'],
  [/^(suspicious_sand|suspicious_gravel|frogspawn|turtle_egg|sniffer_egg)$/, 'Archaeology and eggs'],
  [/^(spyglass|map|empty_map|recovery_compass|lodestone_compass|written_book|firework_star|ominous_bottle|trial_key|ominous_trial_key|.*_map)$/, 'Utility items with no implementation'],
  [/^(sea_pickle|shroomlight|scaffolding|cobweb|sculk_vein|pale_hanging_moss|creaking_heart|ancient_debris|cracked_nether_bricks|dirt_path|chorus_fruit|tipped_arrow|splash_potion|lingering_potion|rotten_flesh|tropical_fish|netherite_horse_armor)$/, 'Miscellaneous vanilla items'],
  [/^resin_|_resin_/, 'Resin (1.21.4)'],
  [/_sapling$|_propagule$/, 'Saplings and propagules (item exists, block form absent)'],
  [/_shelf$/, 'Shelves (26.x)'],
  [/^poplar_|_poplar_/, 'Poplar wood set (26.x)'],
  [/cinnabar/, 'Cinnabar set (26.x)'],
  [/sulfur/, 'Sulfur set (26.x)'],
  [/^(exposed_|weathered_|oxidized_)?copper_(bars|chain|chest|lantern|golem_statue|torch)$/, 'Copper fittings (26.x)'],
  [/^(exposed_|weathered_|oxidized_)?lightning_rod$/, 'Lightning rod oxidation states'],
  [/_cushion$/, 'Cushions (26.x)'],
  [/_harness$/, 'Harnesses (1.21.6)'],
  [/_(nautilus_armor|spear)$/, 'Nautilus armour and spears (1.21.11 / 26.x)'],
  [/^copper_(axe|pickaxe|shovel|hoe|sword|helmet|chestplate|leggings|boots|horse_armor|nugget)$/, 'Copper tool/armour tier (1.21.9+)'],
  [/^music_disc_/, 'Music discs'],
  [/^(_?[a-z_]*)_?bundle$/, 'Bundles'],
  [/_(pottery_sherd)$/, 'Pottery sherds'],
  [/(_armor_trim_smithing_template|netherite_upgrade)$/, 'Smithing templates / armour trims'],
  [/banner_pattern$/, 'Banner patterns'],
  [/_spawn_egg$/, 'Spawn eggs'],
  [/_head$|_skull$/, 'Mob heads'],
  [/amethyst/, 'Amethyst (budding block, buds, cluster)'],
  [/^lapis_lazuli_ore$|_ore$/, 'Ores and deepslate ores'],
  [/^bush$|_bush$|_flower$|^leaf_litter$|_shrub$|wildflowers|_mushroom$|_dry_grass$|^straw_bed$|^(blue|brown)_egg$/, 'Newer plants and decor (25.x/26.x)'],
  [/_vines$|^short_grass$|^tall_grass$|^fern$|^large_fern$|^dead_bush$|^hanging_roots$|^spore_blossom$|eyeblossom|^big_dripleaf$|^small_dripleaf$|^azalea$|^flowering_azalea/, 'Small plants, grass and vines'],
];

function familyOf(id) {
  for (const [re, label] of FAMILIES) if (re.test(id)) return label;
  return null;
}

const missingRows = rows.filter((r) => !r.present && !r.upcoming);
const classification = { preExistingVanilla: [], newerThanCache: [], platformExclusive: [] };
const familyCounts = new Map();
for (const r of missingRows) {
  const id = r.resolvedId || snake(r.wikiName);
  const inCache = vanillaById.has(id);
  let fam = familyOf(id);
  if (/_(slab|stairs)$/.test(id) && !fam) fam = 'Other slab/stair variants';
  if (/^(_?[a-z0-9]+_)?spawn_egg$/.test(id)) fam = 'Spawn eggs';
  if (!fam) fam = 'Ungrouped';
  if (!familyCounts.has(fam)) familyCounts.set(fam, []);
  familyCounts.get(fam).push(r.wikiName);
  // Agent and NPC are Education-only entities; the wiki lists their eggs in the vanilla spawn-egg
  // section only because the section transcludes the shared egg table.
  if (r.only === 'be' || r.only === 'bedrock') classification.platformExclusive.push(r.wikiName);
  else if (inCache) classification.preExistingVanilla.push(r.wikiName);
  else classification.newerThanCache.push(r.wikiName);
}

// Families present in the registry but with no behaviour attached: the entry satisfies a recipe
// ingredient lookup and nothing else.
const registryOnly = [];
{
  const ex = JSON.parse(JSON.stringify(EXTRA_ITEMS));
  const BEHAVIOUR = ['food', 'attack', 'armor', 'durability', 'mob', 'isBlock', 'effects', 'offhand'];
  for (const [id, def] of Object.entries(ex)) {
    if (BEHAVIOUR.some((k) => k in def)) continue;
    if (ITEMS[id] && ITEMS[id] !== def && BEHAVIOUR.some((k) => k in ITEMS[id])) continue;
    registryOnly.push(id);
  }
}

const result = {
  game: {
    BLOCKS: Object.keys(BLOCKS).length,
    BLOCK_DEFS: Object.keys(BLOCK_DEFS).length,
    ITEMS: Object.keys(ITEMS).length,
    EXTRA_ITEMS: Object.keys(EXTRA_ITEMS).length,
    distinctIds: game.size,
  },
  wiki: {
    total: rows.length,
    present: rows.filter((r) => r.present).length,
    missing: missingRows.length,
    upcoming: rows.filter((r) => !r.present && r.upcoming).length,
  },
  classification: {
    preExistingVanilla: classification.preExistingVanilla.length,
    newerThanCache: classification.newerThanCache.length,
    platformExclusive: classification.platformExclusive.length,
    preExistingNames: classification.preExistingVanilla.sort(),
    newerThanCacheNames: classification.newerThanCache.sort(),
    platformExclusiveNames: classification.platformExclusive.sort(),
  },
  families: [...familyCounts]
    .map(([family, names]) => ({ family, count: names.length, names: names.sort() }))
    .sort((a, b) => b.count - a.count),
  registryOnly: { count: registryOnly.length, names: registryOnly.sort() },
  bySection,
  unresolved: unresolved.map((u) => `${u.section}: ${u.name}`),
  excluded: Object.fromEntries(Object.entries(fixture.excluded).map(([k, v]) => [k, v.names.length])),
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const c = result.classification;
  console.log('game registry:', JSON.stringify(result.game));
  console.log('wiki in-scope:', JSON.stringify(result.wiki));
  console.log(`\nmissing ${result.wiki.missing}: `
    + `${c.preExistingVanilla} already in the pinned pc/1.21.4 registry, `
    + `${c.newerThanCache} newer than that cache, `
    + `${c.platformExclusive} platform-exclusive`);
  console.log(`registry-only (no behaviour): ${result.registryOnly.count}`);
  console.log('\n## missing by family');
  for (const f of result.families) console.log(`  ${String(f.count).padStart(4)}  ${f.family}`);
  console.log('\n## pre-existing vanilla items that are absent (should already exist)');
  console.log('  ' + c.preExistingNames.join(', '));
  console.log('\n## newer than the pinned cache (need a data refresh first)');
  console.log('  ' + c.newerThanCacheNames.join(', '));
  console.log('\n## platform-exclusive');
  console.log('  ' + c.platformExclusiveNames.join(', '));
  console.log('\n## registry-only entries (exist, no behaviour)');
  console.log('  ' + result.registryOnly.names.join(', '));
  console.log('\nunresolved (not in the pinned pc/1.21.4 registry):', result.unresolved.length);
}
