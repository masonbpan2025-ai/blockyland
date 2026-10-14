// The item and block parity audit: every block and item this game defines, asked the questions the Minecraft
// Wiki answers for it, and answered by the same functions the game itself calls.
//
// The wiki's facts are in src/resourceWikiData.js (generated from the wiki's data modules and infoboxes, revisions
// pinned there). Each case reads the game's live value through the production path -- the harvest table the
// mining code reads, `blastResistanceFor` that explosions call, `stackLimitFor` the inventory calls,
// `maxDurabilityFor`, `foodFor`, `enchantabilityOf`, `isFireproof`, the item table combat and armour read -- and
// compares it with the wiki's. Free of the DOM and Three.js, so the Node tests and the Resource Inspector run the
// same cases and show the same verdicts.
//
// Verdicts: PASS, FAIL, KNOWN (a documented, source-backed difference, listed in KNOWN_DIFFERENCES with its
// reason -- never counted as a pass), NA (the question does not apply), NO_DATA (the wiki gives no single value,
// e.g. a light level that depends on how many candles are lit).
import { BLOCK_DEFS, ITEMS, stackLimitFor } from './blocks.js';
import { harvestDataFor, blastResistanceFor } from './blockHarvestData.js';
import { harvestsNothing, breakTimeSeconds } from './miningRules.js';
import { harvestDrops } from './blockDrops.js';
import { getCropInfo } from './farming.js';
import { maxDurabilityFor } from './durability.js';
import { foodFor } from './foodData.js';
import { enchantabilityOf } from './enchanting.js';
import { isFireproof } from './smithing.js';
import { HORSE_ARMOR, HORSE_ARMOR_TOUGHNESS } from './horseBehavior.js';
import { absorbWithWolfArmor, equipWolfArmor, WOLF_ARMOR_DURABILITY } from './wolfBehavior.js';
import { WIKI_BLOCKS, WIKI_ITEMS, WIKI_ITEM_PAGES, WIKI_MODULE_REVISIONS } from './resourceWikiData.js';
import { baseBlockName } from './resourceWikiNames.js';

export const WIKI = 'https://minecraft.wiki/w/';
const pageUrl = (title) => (title ? WIKI + encodeURIComponent(title.replace(/ /g, '_')) : null);

/** Tool speed by tier (wiki, Breaking: wooden 2, stone 4, iron 6, diamond 8, netherite 9, golden 12). */
const TIER_SPEED = { wooden: 2, stone: 4, iron: 6, diamond: 8, netherite: 9, golden: 12 };

/** Hardness and blast resistance at or past these are the wiki's "unbreakable" / "immune". */
const UNBREAKABLE_HARDNESS = 99999;
const IMMUNE_BLAST = 3_600_000;

/**
 * Differences between the game and the wiki that are deliberate or version-bound, each with its reason. Keyed
 * `<case id>:<block name or item id>`. A KNOWN case is reported apart from PASS, never as one.
 */
export const KNOWN_DIFFERENCES = {
};

/**
 * Where a page's {{breaking row}} contradicts the same page's prose, the prose wins; each entry quotes it.
 * Keyed by block name, then the breaking-row field corrected.
 */
export const WIKI_CORRECTIONS = {
  'Short Grass': { selfDrop: false, silk: undefined, quote: 'Short Grass: "Short grass can be obtained as an item by destroying it with shears."' },
  'Hanging Roots': { selfDrop: false, silk: undefined, quote: 'Hanging Roots: "can only be collected using shears. In BE, any Silk Touch tool also works."' },
  'Cave Vines': { selfDrop: false, silk: undefined, quote: 'Cave Vines: "yielding one unit of glow berries if the vine has berries or nothing when it does not."' },
  'Cave Vines Plant': { selfDrop: false, silk: undefined, quote: 'Cave Vines: "yielding one unit of glow berries if the vine has berries or nothing when it does not."' },
  Cobweb: { selfDrop: false, tool: 'sword', requires: true, quote: 'Cobweb: "Cobwebs can be obtained as an item using shears ... A cobweb drops one piece of string if broken with a non-Silk Touch sword ... It drops nothing when broken using anything else."' },
  // The game names vanilla's bamboo_sapling by its id; the wiki's row calls it "Bamboo Shoot", whose tool is "any".
  'Bamboo Sapling': { tool: 'any', quote: 'Bamboo: "{{breaking row|Bamboo; Bamboo Shoot|Axe; any}}" -- the shoot is the sapling.' },
};

// --- reading the game ------------------------------------------------------------------------------------

/** The game's hardness for a block id: the harvest row the mining code reads, else the block definition's. */
function gameHardness(blockId) {
  const row = harvestDataFor(blockId);
  const h = typeof row?.hardness === 'number' ? row.hardness : BLOCK_DEFS[blockId]?.hardness;
  if (typeof h !== 'number') return undefined;
  return h < 0 || h >= UNBREAKABLE_HARDNESS ? -1 : h;
}

const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;
const fmt = (v) => (v === undefined ? '—' : v === null ? 'none' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** One case's result. */
function verdict(id, label, expected, actual, ok, { source = null, note = null, key = null } = {}) {
  const known = key ? KNOWN_DIFFERENCES[`${id}:${key}`] : null;
  const status = ok === null ? 'NA' : ok === 'NO_DATA' ? 'NO_DATA' : ok ? 'PASS' : known ? 'KNOWN' : 'FAIL';
  return { id, label, status, expected: fmt(expected), actual: fmt(actual), source, note: status === 'KNOWN' ? known : note };
}

// --- block cases -----------------------------------------------------------------------------------------

/** The wiki facts for a block id, by its display name (a state's name falls back to its base block's). */
export function wikiBlockFacts(blockId) {
  const name = BLOCK_DEFS[blockId]?.name;
  if (!name) return null;
  return WIKI_BLOCKS[name] ?? WIKI_BLOCKS[baseBlockName(name)] ?? null;
}

/**
 * Does a drop count as the block "dropping itself"? Its own id or item form; or, for a state or placement, the
 * block it is a state of ("Oak Door Top" -> Oak Door, "Wall Torch" -> Torch, "Water Cauldron" -> the Cauldron page);
 * an infested block's Silk Touch drop is the plain block.
 */
export function selfDropMatcher(blockId, page = null) {
  const name = BLOCK_DEFS[blockId]?.name ?? '';
  const selfNames = new Set([name, baseBlockName(name), name.replace(/ Wall /, ' '), name.replace(/^Infested /, ''), page]
    .filter(Boolean).map((n) => n.toLowerCase()));
  return (d) => {
    const named = d.isBlock ? (typeof d.id === 'number' ? BLOCK_DEFS[d.id]?.name : String(d.id).replace(/_/g, ' ')) : ITEMS[d.id]?.name;
    if (d.isBlock && d.id === blockId) return true;
    if (!d.isBlock && ITEMS[d.id]?.blockId === blockId) return true;
    return Boolean(named) && selfNames.has(named.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase());
  };
}

/** The proper tool's item id for a breaking row: null for "any", the tier's tool otherwise (wooden by default). */
function properToolId(breaking) {
  if (breaking.tool === 'any') return null;
  if (breaking.tool === 'shears') return 'shears';
  return `${breaking.tier ?? 'wooden'}_${breaking.tool}`;
}

/**
 * The Inspector's drop demonstration: the block broken by hand, with its proper tool, with shears and with a Silk
 * Touch tool, each through `harvestDrops` -- what the game spawns -- and, where the wiki says, whether it should
 * have given itself. One random roll each: the Inspector shows a real break, not the audit's high/low sweep.
 */
export function dropDemonstrations(blockId, random = Math.random) {
  const def = BLOCK_DEFS[blockId];
  const facts = wikiBlockFacts(blockId);
  if (!def || !facts?.breaking || def.liquid || def.internal || getCropInfo(blockId) || gameHardness(blockId) === -1) return [];
  const correction = WIKI_CORRECTIONS[def.name];
  const breaking = correction ? { ...facts.breaking, ...correction } : facts.breaking;
  const proper = properToolId(breaking);
  const silkTool = proper && proper !== 'shears' ? proper : 'iron_pickaxe';
  const isSelf = selfDropMatcher(blockId, facts.page);
  const modes = [
    { id: 'hand', label: 'by hand', toolId: null, silkTouch: false, expectedSelf: proper ? null : breaking.selfDrop },
    ...(proper && proper !== 'shears'
      ? [{ id: 'tool', label: `with a ${proper.replace(/_/g, ' ')}`, toolId: proper, silkTouch: false, expectedSelf: breaking.selfDrop }]
      : []),
    { id: 'shears', label: 'with shears', toolId: 'shears', silkTouch: false, expectedSelf: proper === 'shears' ? breaking.selfDrop : null },
    { id: 'silk', label: `with a Silk Touch ${silkTool.replace(/_/g, ' ')}`, toolId: silkTool, silkTouch: true,
      expectedSelf: breaking.silk === undefined ? (breaking.selfDrop ? true : null) : breaking.silk },
  ];
  return modes.map((mode) => {
    const harvested = mode.silkTouch || !harvestsNothing(blockId, mode.toolId ? ITEMS[mode.toolId] ?? null : null, mode.toolId);
    const drops = harvested ? harvestDrops(blockId, { toolId: mode.toolId, silkTouch: mode.silkTouch }, random) : [];
    const actualSelf = drops.some(isSelf);
    const ok = mode.expectedSelf === null || mode.expectedSelf === undefined ? null : mode.expectedSelf === actualSelf;
    return { ...mode, drops, harvested, actualSelf, ok };
  });
}

/** Every wiki case for one block id. */
export function blockCases(blockId) {
  const def = BLOCK_DEFS[blockId];
  if (!def) return [];
  const name = def.name;
  const facts = wikiBlockFacts(blockId);
  const correction = WIKI_CORRECTIONS[name];
  const wiki = facts && correction && facts.breaking ? { ...facts, breaking: { ...facts.breaking, ...correction } } : facts;
  const source = pageUrl(wiki?.page ?? name);
  const out = [];

  // B-HARDNESS: how long the block takes to mine.
  {
    const expected = wiki?.hardness === undefined ? undefined : wiki.hardness < 0 ? -1 : wiki.hardness;
    const actual = gameHardness(blockId);
    out.push(verdict('B-HARDNESS', 'Hardness (mining time)', expected === -1 ? 'unbreakable (-1)' : expected,
      actual === -1 ? 'unbreakable (-1)' : actual,
      expected === undefined ? 'NO_DATA' : near(expected, actual),
      { source, key: name, note: wiki?.hardnessKey ? `wiki row "${wiki.hardnessKey}"` : null }));
  }

  // B-BLAST: what explosions do to it (`blastResistanceFor`, which explosions call).
  {
    const expected = wiki?.blast === undefined ? undefined : wiki.blast >= IMMUNE_BLAST ? null : wiki.blast;
    const actual = blastResistanceFor(blockId);
    const ok = expected === undefined ? 'NO_DATA' : expected === null ? actual === null || actual >= IMMUNE_BLAST : near(expected, actual);
    out.push(verdict('B-BLAST', 'Blast resistance', expected === null ? 'immune' : expected, actual === null ? 'immune' : actual, ok,
      { source, key: name, note: wiki?.blastKey ? `wiki row "${wiki.blastKey}"` : null }));
  }

  // B-LIGHT: the light the block gives off.
  {
    const expected = wiki && 'light' in wiki ? wiki.light : undefined;
    const actual = def.light ?? 0;
    out.push(verdict('B-LIGHT', 'Light level emitted', expected, actual, expected === undefined || expected === null ? 'NO_DATA' : expected === actual, { source, key: name }));
  }

  // B-TOOL: which tool mines it fastest, and whether one (and of what tier) is needed for a drop. The page's
  // {{breaking row}} is the source (its proper-tool and minimum-grade columns); the infobox's tool fields are the
  // fallback for a page without one.
  {
    const tool = wiki?.tool;
    const breaking = wiki?.breaking;
    const row = harvestDataFor(blockId);
    const actual = row ? { tool: row.tool ?? 'any', ...(row.requiresTool ? { requires: row.tier ?? true } : {}) } : undefined;
    let ok = 'NO_DATA';
    let expected;
    if (breaking && row) {
      expected = { tool: breaking.tool, ...(breaking.tier ? { requires: breaking.tier } : {}) };
      // A block that breaks instantly is not sped up by any tool; whether it drops is B-SELF-DROP's question.
      if (gameHardness(blockId) === 0 && !breaking.tier) ok = null;
      else {
        const toolOk = breaking.tool === 'any' ? !row.tool || !row.requiresTool : row.tool === breaking.tool;
        // Shears and swords have no grade: a block they alone collect (cobweb) "requires" them without a tier.
        const requiresOk = breaking.tier ? row.requiresTool === true && (row.tier ?? null) === breaking.tier
          : !row.requiresTool || ['sword', 'shears'].includes(row.tool);
        ok = toolOk && requiresOk;
      }
    } else if (tool && row) {
      expected = tool.tools.length ? { tool: tool.tools.join('/'), ...(tool.tier ? { requires: tool.tier } : {}) } : { tool: 'any' };
      const requiresOk = tool.tier ? row.requiresTool === true && (row.tier ?? null) === tool.tier
        : tool.mixed ? true : !row.requiresTool;
      const toolOk = !tool.tools.length ? !row.requiresTool : !row.tool || tool.tools.includes(row.tool) || tool.mixed === true;
      ok = requiresOk && toolOk;
    } else if (tool && !row) ok = 'NO_DATA';
    out.push(verdict('B-TOOL', 'Preferred tool and required tier', expected, actual, ok, { source, key: name }));
  }

  // B-BREAK-TIME: seconds to break it by hand and with its proper tool, against the wiki's Breaking formula fed the
  // wiki's own hardness and proper tool: ceil(hardness x (harvestable ? 30 : 100) / speed) ticks, instant when the
  // speed passes hardness x 30; tool speeds wooden 2, stone 4, iron 6, diamond 8, netherite 9, golden 12. Read from
  // `breakTimeSeconds`, which the mining loop calls. One tick of slack: the wiki's own tables round some exact
  // tick counts up by one (wool by hand: 1.25 s for 24 ticks).
  {
    const breaking = wiki?.breaking;
    const hardness = wiki?.hardness;
    if (!breaking || typeof hardness !== 'number' || hardness < 0 || gameHardness(blockId) === -1) {
      out.push(verdict('B-BREAK-TIME', 'Break time (hand / proper tool)', undefined, '—', breaking ? null : 'NO_DATA', { source }));
    } else {
      const requires = Boolean(breaking.tier) || breaking.requires === true;
      const ticks = (speed, harvestable) => (speed > hardness * 30 ? 0 : Math.ceil(hardness * (harvestable ? 30 : 100) / speed - 1e-9) / 20);
      const tierTool = ['pickaxe', 'axe', 'shovel', 'hoe'].includes(breaking.tool) ? `${breaking.tier ?? 'wooden'}_${breaking.tool}` : null;
      const expected = { hand: ticks(1, !requires), ...(tierTool ? { [tierTool]: ticks(TIER_SPEED[breaking.tier ?? 'wooden'], true) } : {}) };
      const actual = { hand: breakTimeSeconds(blockId, null, null), ...(tierTool ? { [tierTool]: breakTimeSeconds(blockId, ITEMS[tierTool] ?? null, tierTool) } : {}) };
      const ok = Object.keys(expected).every((k) => Math.abs(expected[k] - actual[k]) <= 0.05 + 1e-9);
      out.push(verdict('B-BREAK-TIME', 'Break time in seconds (hand / proper tool)', expected, actual, ok, { source, key: name }));
    }
  }

  // B-SELF-DROP: broken with its proper tool (by hand when any tool will do) and no Silk Touch, does the block
  // give itself back? The breaking row's drop=0 says no (stone gives cobblestone, glass nothing). Read through the
  // game's own path: `harvestsNothing` gates the drop on the tool, then `harvestDrops` -- what the game spawns --
  // says what falls, rolled both high and low so a chance drop (a stem's seeds) is seen.
  // B-SILK: the same with a Silk Touch tool, against the page's own sentence about Silk Touch.
  {
    const breaking = wiki?.breaking;
    if (getCropInfo(blockId)) {
      // A crop's drops come from the farming path (CROP_DROPS in farming.js), pinned by tests/farming*.test.js.
      out.push(verdict('B-SELF-DROP', 'Drops itself with the proper tool (no Silk Touch)', 'n/a', 'crop', null, { source, note: 'drops through farming.js' }));
      out.push(verdict('B-SILK', 'Silk Touch collects it', 'n/a', 'crop', null, { source, note: 'drops through farming.js' }));
    } else if (!breaking || def.liquid || def.internal || gameHardness(blockId) === -1) {
      out.push(verdict('B-SELF-DROP', 'Drops itself with the proper tool (no Silk Touch)', breaking ? 'n/a' : undefined, '—', breaking ? null : 'NO_DATA', { source }));
      out.push(verdict('B-SILK', 'Silk Touch collects it', breaking ? 'n/a' : undefined, '—', breaking ? null : 'NO_DATA', { source }));
    } else {
      const toolId = breaking.tool === 'any' ? null : breaking.tool === 'shears' ? 'shears' : `${breaking.tier ?? 'wooden'}_${breaking.tool}`;
      const isSelf = selfDropMatcher(blockId, wiki.page);
      const harvested = !harvestsNothing(blockId, toolId ? ITEMS[toolId] ?? null : null, toolId);
      const roll = (silkTouch) => (harvested || silkTouch
        ? [...harvestDrops(blockId, { toolId, silkTouch }, () => 0.999), ...harvestDrops(blockId, { toolId, silkTouch }, () => 0)]
        : []);
      const drops = roll(false);
      const actual = drops.some(isSelf);
      const with_ = toolId ? `with ${toolId.replace(/_/g, ' ')}` : 'by hand';
      const list = (ds) => (ds.length ? `drops ${[...new Set(ds.map((d) => (d.isBlock ? BLOCK_DEFS[d.id]?.name ?? d.id : d.id)))].join(', ')}` : 'drops nothing');
      out.push(verdict('B-SELF-DROP', `Drops itself ${with_} (no Silk Touch)`, breaking.selfDrop, actual, breaking.selfDrop === actual,
        { source, key: name, note: correction ? `${list(drops)}; wiki row corrected by the page: ${correction.quote}` : list(drops) }));
      const silkDrops = roll(true);
      const silkActual = silkDrops.some(isSelf);
      const silkExpected = breaking.silk === undefined ? (breaking.selfDrop ? true : undefined) : breaking.silk;
      out.push(verdict('B-SILK', `Silk Touch ${toolId ? toolId.replace(/_/g, ' ') : 'tool'} collects it`, silkExpected, silkActual,
        silkExpected === undefined ? 'NO_DATA' : silkExpected === silkActual, { source, key: name, note: list(silkDrops) }));
    }
  }
  return out;
}

// --- item cases ------------------------------------------------------------------------------------------

const ITEM_ID_ALIASES = { snow: 'snow_block', target_block: 'target', water_bottle: 'potion', chain: 'iron_chain' };

/** The vanilla item id a game item answers to on the wiki, or null. */
export function wikiItemIdFor(id) {
  if (WIKI_ITEMS[id]) return id;
  if (ITEM_ID_ALIASES[id] && WIKI_ITEMS[ITEM_ID_ALIASES[id]]) return ITEM_ID_ALIASES[id];
  // Potions: this game registers each effect as its own item; vanilla has three items with a contents component.
  const potion = /^(splash_|lingering_)?(potion_of_|awkward_potion|thick_potion|mundane_potion)/.exec(id);
  if (potion) return `${potion[1] ?? ''}potion`.replace(/^potion$/, 'potion').replace(/^splash_potion$/, 'splash_potion').replace(/^lingering_potion$/, 'lingering_potion');
  if (/^tipped_arrow_/.test(id)) return 'tipped_arrow';
  return null;
}

/** A game id that is a placed state of another item (a wall banner, a bed's head), not an item of its own. */
const PLACEMENT = /_(wall_banner|wall_sign|wall_hanging_sign|bed_head|wall_head|wall_skull|door_open|door_top|door_top_open|trapdoor_open)$/;

/** Every wiki case for one item id. */
export function itemCases(id) {
  const def = ITEMS[id];
  if (!def) return [];
  if (PLACEMENT.test(id)) {
    return [verdict('I-ITEM', 'A vanilla item', 'a placement of another item', id, null, { note: 'a placed state, not an item' })];
  }
  const wikiId = wikiItemIdFor(id);
  const wiki = wikiId ? WIKI_ITEMS[wikiId] : null;
  const source = pageUrl(WIKI_ITEM_PAGES[def.name?.replace(/\s*\([^)]*\)\s*$/, '')] ?? def.name);
  const out = [];
  out.push(verdict('I-ITEM', 'A vanilla item', wikiId ?? 'no vanilla item of this id', id, wiki ? true : 'NO_DATA',
    { source, note: wikiId && wikiId !== id ? `vanilla id ${wikiId}` : null }));
  if (!wiki) return out;
  const key = id;

  out.push(verdict('I-STACK', 'Maximum stack size', wiki.stack, stackLimitFor(id), wiki.stack === stackLimitFor(id), { source, key }));
  {
    const actual = maxDurabilityFor(id);
    out.push(verdict('I-DURABILITY', 'Durability', wiki.durability ?? null, actual, (wiki.durability ?? null) === actual, { source, key }));
  }
  {
    const food = foodFor(id);
    const actual = food ? [food.hunger, food.saturation] : null;
    const expected = wiki.food ?? null;
    const ok = !expected && !actual ? null : !!expected && !!actual && expected[0] === actual[0] && near(expected[1], actual[1]);
    out.push(verdict('I-FOOD', 'Food: hunger and saturation', expected, actual, ok, { source, key }));
  }
  if (wiki.attack !== undefined || def.attack !== undefined) {
    out.push(verdict('I-ATTACK', 'Attack damage', wiki.attack ?? 1, def.attack ?? 1, near(wiki.attack ?? 1, def.attack ?? 1), { source, key }));
  }
  if (id === 'wolf_armor') {
    // Wolf Armor: its "+11 Armor" tooltip "is a result of a bug (MC-268913)"; the armour "absorbs all damage done to
    // the wolf ... until its durability runs out", one point per point of damage. Checked on a test wolf.
    const wolf = equipWolfArmor({ type: 'wolf' });
    const hit = absorbWithWolfArmor(wolf, 6);
    const actual = { damageTaken: hit.damage, durabilityLeft: wolf.wolfArmorDurability };
    const expected = { damageTaken: 0, durabilityLeft: WIKI_ITEMS.wolf_armor.durability - 6 };
    out.push(verdict('I-ARMOR', 'Absorbs a wolf\'s damage until it breaks', expected, actual,
      actual.damageTaken === 0 && actual.durabilityLeft === expected.durabilityLeft && WOLF_ARMOR_DURABILITY === WIKI_ITEMS.wolf_armor.durability, { source, key }));
  } else if (wiki.armor !== undefined || def.armor !== undefined) {
    const expected = { armor: wiki.armor ?? 0, toughness: wiki.toughness ?? 0, knockbackResistance: wiki.knockbackResistance ?? 0 };
    // Horse armour's figures live in the horse's table, which is what a horse's damage reads.
    const actual = HORSE_ARMOR[id] !== undefined
      ? { armor: HORSE_ARMOR[id], toughness: HORSE_ARMOR_TOUGHNESS[id] ?? 0, knockbackResistance: 0 }
      : { armor: def.armor ?? 0, toughness: def.toughness ?? 0, knockbackResistance: def.knockbackResistance ?? 0 };
    const ok = near(expected.armor, actual.armor) && near(expected.toughness, actual.toughness) && near(expected.knockbackResistance, actual.knockbackResistance);
    out.push(verdict('I-ARMOR', 'Armour, toughness, knockback resistance', expected, actual, ok, { source, key }));
  }
  if (wiki.enchantability !== undefined) {
    const actual = enchantabilityOf(id);
    out.push(verdict('I-ENCHANTABILITY', 'Enchantability', wiki.enchantability, actual, wiki.enchantability === actual, { source, key }));
  }
  {
    const expected = Boolean(wiki.fireResistant);
    const actual = isFireproof(id);
    out.push(verdict('I-FIREPROOF', 'Survives fire and lava when dropped', expected, actual, expected || actual ? expected === actual : null, { source, key }));
  }
  return out;
}

/**
 * The item cases for a block the player holds as the block itself (planks, glass: numeric ids, no ITEMS entry): its
 * stack size and whether it survives fire as a dropped item, against the vanilla item of the block's harvest name.
 */
export function blockItemCases(blockId) {
  const def = BLOCK_DEFS[blockId];
  if (!def?.name || def.internal || baseBlockName(def.name) !== def.name) return [];
  const vanillaId = harvestDataFor(blockId)?.name;
  const wiki = vanillaId ? WIKI_ITEMS[vanillaId] : null;
  if (!wiki || ITEMS[vanillaId] || Object.values(ITEMS).some((it) => it?.blockId === blockId)) return [];
  const source = pageUrl(wikiBlockFacts(blockId)?.page ?? def.name);
  const key = vanillaId;
  return [
    verdict('I-STACK', 'Maximum stack size (as an item)', wiki.stack, stackLimitFor(blockId), wiki.stack === stackLimitFor(blockId), { source, key }),
    verdict('I-FIREPROOF', 'Survives fire and lava when dropped', Boolean(wiki.fireResistant), isFireproof(blockId),
      wiki.fireResistant || isFireproof(blockId) ? Boolean(wiki.fireResistant) === isFireproof(blockId) : null, { source, key }),
  ];
}

// --- per resource and for everything --------------------------------------------------------------------

/**
 * The cases for a Resource Inspector entry: an item's own cases, then (for an item that places a block, or a
 * block entry) the block's.
 */
export function wikiCasesForEntry(entry) {
  if (!entry) return [];
  const cases = [];
  if (entry.kind === 'item') cases.push(...itemCases(entry.id).map((c) => ({ ...c, subject: entry.id })));
  if (entry.blockId !== null && entry.blockId !== undefined && BLOCK_DEFS[entry.blockId]) {
    cases.push(...blockCases(entry.blockId).map((c) => ({ ...c, subject: BLOCK_DEFS[entry.blockId].name })));
    if (entry.kind === 'block') cases.push(...blockItemCases(entry.blockId).map((c) => ({ ...c, subject: BLOCK_DEFS[entry.blockId].name })));
  }
  return cases;
}

const tally = (rows) => {
  const out = { PASS: 0, FAIL: 0, KNOWN: 0, NA: 0, NO_DATA: 0 };
  for (const r of rows) out[r.status]++;
  return out;
};

/** Every block id and every item, with every case and the totals. */
export function auditEverythingAgainstWiki() {
  const rows = [];
  for (const [blockId, def] of Object.entries(BLOCK_DEFS)) {
    if (!def?.name) continue;
    for (const c of blockCases(Number(blockId))) rows.push({ kind: 'block', subject: def.name, blockId: Number(blockId), ...c });
    for (const c of blockItemCases(Number(blockId))) rows.push({ kind: 'block-item', subject: def.name, blockId: Number(blockId), ...c });
  }
  for (const id of Object.keys(ITEMS)) for (const c of itemCases(id)) rows.push({ kind: 'item', subject: id, ...c });
  const byCase = {};
  for (const r of rows) (byCase[r.id] ??= []).push(r);
  return {
    rows,
    totals: tally(rows),
    byCase: Object.fromEntries(Object.entries(byCase).map(([id, list]) => [id, tally(list)])),
    failures: rows.filter((r) => r.status === 'FAIL'),
    sources: WIKI_MODULE_REVISIONS,
  };
}

/** Vanilla items (per the wiki's component list) this game does not define under any id. */
export function vanillaItemsMissing() {
  const answered = new Set(Object.keys(ITEMS).map(wikiItemIdFor).filter(Boolean));
  // A block held as itself answers to its harvest row's vanilla name (oak_planks), or to its display name.
  for (const [id, def] of Object.entries(BLOCK_DEFS)) {
    const row = harvestDataFor(Number(id));
    if (row?.name) answered.add(row.name);
    if (def?.name) answered.add(def.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
  }
  for (const [alias, vanilla] of Object.entries(ITEM_ID_ALIASES)) if (answered.has(alias)) answered.add(vanilla);
  return Object.keys(WIKI_ITEMS).filter((id) => !answered.has(id)).sort();
}

export const WIKI_CASE_LABELS = {
  'B-HARDNESS': 'Hardness', 'B-BLAST': 'Blast resistance', 'B-LIGHT': 'Light level', 'B-TOOL': 'Tool / tier', 'B-BREAK-TIME': 'Break time', 'B-SELF-DROP': 'Drops itself', 'B-SILK': 'Silk Touch',
  'I-ITEM': 'Vanilla item', 'I-STACK': 'Stack size', 'I-DURABILITY': 'Durability', 'I-FOOD': 'Food',
  'I-ATTACK': 'Attack damage', 'I-ARMOR': 'Armour', 'I-ENCHANTABILITY': 'Enchantability', 'I-FIREPROOF': 'Fireproof',
};
