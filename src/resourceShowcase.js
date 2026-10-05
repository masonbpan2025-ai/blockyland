// Resource Inspector: the checks that decide whether a block or item works, and the runner that
// reports them.
//
// The shape mirrors `src/mobShowcase.js` on purpose -- a list of named checks and a runner that
// records one of four statuses per check -- because that vocabulary is already what the project uses
// to talk about parity:
//
//   observed       the behaviour is present
//   not observed   the behaviour is absent or wrong: a real gap
//   unsupported    the check cannot be evaluated here (no vanilla data, no asset probe, a feature
//                  this branch does not have). A missing capability is not the resource failing its
//                  own test, and collapsing the two is what buries the checks that do work.
//   error          the check itself threw
//
// The important difference from the mob showcase is that these checks are synchronous. A mob
// scenario has to tick a simulated world; an item check reads registries and tables. So there is no
// per-frame loop here, and `run()` completes in one call -- which is what lets the CLI and the tests
// drive whole-registry audits.
//
// Checks receive the data they need through a context object rather than importing it, so this module
// stays free of Three.js and of the DOM, and a caller can supply vanilla data or an asset probe when
// it has one.
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import {
  VANILLA_ID_ALIASES,
  danglingReferences,
  normaliseCell,
  registry as defaultRegistry,
  resolveResource,
} from './resourceRegistry.js';
import { getItemEnchantCategory, NOT_ENCHANTABLE } from './enchanting.js';
import { describeTool, NON_MINING_TOOLS } from './miningRules.js';
import { blockDrops, baseBlockDrop } from './blockDrops.js';

/**
 * Returned by a check that cannot be evaluated in this environment. Distinct from `false`, because
 * reporting a missing capability as a failed resource buries the failures that are real.
 */
export const CHECK_SKIP = Symbol('resource-check-skip');

const isTechnical = (entry) =>
  entry.internal ||
  entry.blockDef?.liquid ||
  entry.blockDef?.technical ||
  entry.blockDef?.fluid ||
  ['air', 'void_air', 'cave_air', 'moving_piston'].includes(entry.blockAliases?.[0]);

/** Vanilla block defs with no gameplay identity: nothing to mine, nothing to hold. */
const NON_SOLID_NAMES = new Set(['air', 'void_air', 'cave_air', 'light', 'moving_piston', 'bubble_column']);

/**
 * Blocks whose vanilla harvest row is about one growth stage rather than about the block.
 *
 * A pumpkin stem's row is `['air']` and a wheat crop's is `['wheat_seeds']`, because the row describes the
 * immature stage: the mature wheat crop gives wheat and seeds together, and the game models the stages as
 * separate ids. Comparing a stage's row against the game's drop is comparing two different things, so these
 * vanilla names are skipped. Named rather than matched, and a test requires each name to still be a block
 * here, so a typo cannot quietly exempt something else.
 */
const STAGE_SPECIFIC_ROWS = new Set([
  'wheat', 'carrots', 'potatoes', 'beetroots', 'pumpkin_stem', 'attached_pumpkin_stem',
  'melon_stem', 'attached_melon_stem', 'sweet_berry_bush', 'cave_vines', 'cave_vines_plant',
  'torchflower_crop', 'pitcher_crop', 'nether_wart', 'cocoa',
]);

/**
 * Blocks with no vanilla counterpart to take harvest data from.
 *
 * pressure_plate is this game's own generic block; sulfur_block and dried_ghast postdate the pinned
 * 1.21.4 data. Named rather than patterned, and a test requires each name to still be a block the game has, so
 * the list cannot rot into a place where real gaps hide.
 */
const NO_VANILLA_HARVEST = new Set(['pressure_plate', 'sulfur_block', 'dried_ghast']);
const skipTechnical = (entry) =>
  NON_SOLID_NAMES.has(entry.blockAliases?.[0]) || entry.blockAliases?.some((a) => NON_SOLID_NAMES.has(a));

/**
 * Ids that are a placement of another item rather than an item of their own.
 *
 * A wall banner, a bed's head and a wall hanging sign are the same object as their standing counterpart,
 * placed against a wall or laid out as a bed. Vanilla models them as block states of one item; this game
 * registers each as its own block, so each looks like an item with no source. Nothing crafts a
 * `black_wall_banner`, and nothing should -- you get one by placing a `black_banner` on a wall.
 *
 * Declared as `[suffix, replacement]` rather than matched by a pattern, and the exemption only applies
 * when the counterpart is registered: if `black_banner` were missing, `black_wall_banner` would correctly
 * be reported as unobtainable. `tests/resourceInspector.test.js` pins both halves.
 */
const PLACEMENT_VARIANTS = [
  ['_wall_banner', '_banner'],
  // A wall sign is a sign placed against a wall, and vanilla drops the sign.
  ['_wall_sign', '_sign'],
  ['_bed_head', '_bed'],
  ['_wall_hanging_sign', '_hanging_sign'],
  // A door's and a trapdoor's states, which vanilla models with block states and this game with separate
  // block ids: an open door, the top half of a door, and the top half of an open door are all still that
  // door, and vanilla drops the door. Longest first, because "Spruce Door Top Open" ends with neither
  // "_door_open" nor "_door_top" -- it ends with the two of them together.
  ['_door_top_open', '_door'],
  ['_door_open', '_door'],
  ['_door_top', '_door'],
  ['_trapdoor_open', '_trapdoor'],
];

/** The item a placement variant is a placement of, or null when it is an item in its own right. */
export function placementVariantOf(id, has = () => false) {
  const text = String(id);
  for (const [suffix, replacement] of PLACEMENT_VARIANTS) {
    if (!text.endsWith(suffix)) continue;
    const base = text.slice(0, -suffix.length) + replacement;
    if (has(base)) return base;
  }
  return null;
}

/**
 * The vanilla registry key for a resource.
 *
 * An item entry is keyed by its own id. A block with no item form is keyed by a `BLOCKS` alias, and
 * the alias order in `BLOCKS` is not vanilla's order -- `GRASS` is declared before `GRASS_BLOCK`, so
 * the first alias is `grass` while vanilla calls the item `grass_block`. Preferring an alias vanilla
 * knows fixes that class of miss without hand-maintaining a rename table.
 */
function vanillaIdOf(entry, vanilla) {
  if (entry.kind === 'item') return entry.id;
  const aliases = entry.blockAliases ?? [];
  if (!aliases.length) return null;
  if (vanilla) {
    const known = aliases.find((alias) => vanilla.itemByName.has(alias));
    if (known) return known;
  }
  // The alias table is for exactly this: an id this game defines under a spelling vanilla does not use. The
  // game's block 71 is "Target Block" and vanilla's is `target`, and without consulting the table the
  // Inspector reported the block dropping itself as a wrong drop.
  const mapped = aliases.map((alias) => VANILLA_ID_ALIASES[alias]).find(Boolean);
  return mapped ?? aliases[0];
}

/**
 * Does the game have any way to obtain this resource?
 *
 * Deliberately does not count "it is in the creative menu", because a creative-only entry is exactly
 * the failure mode this project keeps hitting: the item exists, has an icon, appears in the menu, and
 * is unobtainable in survival.
 */
function sourceSummary(entry) {
  return {
    crafting: entry.recipesAsResult.length,
    smelting: entry.smeltingFrom.length,
    brewing: entry.brewingFrom.length,
    mobLoot: entry.lootFrom.length,
    smithing: entry.smithingFrom.length,
    interaction: entry.codeFrom.length,
    blockDrops: entry.droppedBy.length,
    total:
      entry.recipesAsResult.length +
      entry.smeltingFrom.length +
      entry.brewingFrom.length +
      entry.lootFrom.length +
      entry.droppedBy.length +
      entry.smithingFrom.length +
      entry.codeFrom.length,
  };
}

/**
 * The check list.
 *
 * Each check is `{id, label, group, run(ctx)}` where `ctx` is
 * `{entry, registry, vanilla, assetExists, mobTypes}` and `run` returns `true`, `false`,
 * `CHECK_SKIP`, or `{ok, detail}` when a bare boolean would lose the reason.
 */
export const RESOURCE_CHECKS = [
  // --- identity --------------------------------------------------------------
  {
    id: 'identifier',
    label: 'Has a registry definition',
    group: 'identity',
    run: ({ entry }) => {
      if (entry.kind === 'item') return ITEMS[entry.id] !== undefined;
      return BLOCK_DEFS[entry.blockId] !== undefined;
    },
  },
  {
    id: 'display-name',
    label: 'Has a real display name',
    group: 'identity',
    run: ({ entry }) => {
      const name = entry.name;
      if (typeof name !== 'string' || !name.trim()) return { ok: false, detail: 'name is empty' };
      if (name === String(entry.id)) return { ok: false, detail: `name is the raw id (${name})` };
      if (/^undefined$|^null$/i.test(name.trim())) return { ok: false, detail: 'name is a placeholder' };
      try {
        // Inventory tooltips render the name directly; a lone surrogate or a HTML tag would show up.
        if (/[<>]/.test(name)) return { ok: false, detail: `name contains markup: ${name}` };
      } catch { /* the regex cannot throw; kept for clarity of intent */ }
      return true;
    },
  },
  {
    id: 'icon-declared',
    label: 'Declares an icon or block textures',
    group: 'identity',
    run: ({ entry }) => {
      // Air and the fluid/technical helper states have no inventory form, so demanding an icon of
      // them reports a failure nobody can fix and buries the ones that matter.
      if (skipTechnical(entry)) return CHECK_SKIP;
      if (entry.icon) return true;
      if (entry.blockDef?.textures) return { ok: true, detail: 'block textures, no item icon' };
      return { ok: false, detail: 'no icon and no textures' };
    },
  },
  {
    id: 'icon-asset',
    label: 'Icon file exists',
    group: 'identity',
    run: ({ entry, assetExists }) => {
      if (!assetExists) return CHECK_SKIP;
      if (!entry.icon) return CHECK_SKIP;
      return assetExists(entry.icon);
    },
  },

  // --- stacking and durability ----------------------------------------------
  {
    id: 'stack-size',
    label: 'Stack size agrees with vanilla',
    group: 'stacking',
    run: ({ entry, vanilla }) => {
      const expected = vanilla?.itemByName.get(vanillaIdOf(entry, vanilla))?.stackSize;
      if (expected === undefined) return CHECK_SKIP;
      const effective = entry.declared ?? entry.applied;
      if (effective === expected) return true;
      return {
        ok: false,
        detail: `vanilla ${expected}, definition ${entry.declared ?? 'undeclared'} (applied ${entry.applied})`,
      };
    },
  },
  {
    id: 'stack-size-declared',
    label: 'Stack size is declared, not defaulted',
    group: 'stacking',
    run: ({ entry, vanilla }) => {
      const expected = vanilla?.itemByName.get(vanillaIdOf(entry, vanilla))?.stackSize;
      // Only worth reporting when vanilla's value differs from the fallback the code applies: an
      // item that stacks to 64 needs no declaration.
      if (expected === undefined || expected === 64) return CHECK_SKIP;
      if (entry.declared === expected) return true;
      return { ok: false, detail: `vanilla ${expected} but nothing declares it, so 64 is used` };
    },
  },
  {
    id: 'durability-tracked',
    label: 'Durability is tracked where vanilla has it',
    group: 'stacking',
    run: ({ entry, durabilityHas }) => {
      if (!durabilityHas) return CHECK_SKIP;
      const tool = describeTool(entry.id);
      const armoured = Boolean(entry.def?.armorSlot);
      if (!tool && !armoured && !['shield', 'elytra', 'fishing_rod', 'flint_and_steel', 'shears', 'brush'].includes(entry.id)) {
        return CHECK_SKIP;
      }
      return durabilityHas(entry.id)
        ? true
        : { ok: false, detail: 'vanilla wears this item out; nothing here tracks durability for it' };
    },
  },

  // --- obtainability --------------------------------------------------------
  {
    id: 'has-source',
    label: 'Can be obtained in survival',
    group: 'obtainable',
    run: ({ entry, registry }) => {
      // A spawn egg is creative-only in vanilla: no recipe, no drop, no trade. Asking for a survival
      // source reported all ninety of them as gaps, which is a fifth of the report and buries the items
      // that genuinely have no source. The one case is named rather than matched by a pattern, and
      // tests/resourceInspector.test.js pins it, so this cannot quietly widen into "skip what is hard".
      if (entry.type === 'spawn_egg') return CHECK_SKIP;
      // An `internal` block is a state of a block, not something a player holds: an open door, a door's top
      // half, a crop's third growth stage. This check was asking all eighty-five of them where they could
      // be obtained, which is not a question about an item. `block-drop` and `harvest-data` cover blocks.
      if (entry.internal) return CHECK_SKIP;
      // A wall banner, a bed head and a wall hanging sign are one item placed differently. See
      // PLACEMENT_VARIANTS; the exemption needs the standing counterpart to be registered.
      // Item entries are keyed by their bare id (`black_banner`); a block with no item form is keyed
      // `block:<id>`. Both are tried so this keeps working if the key format changes.
      const hasItem = (id) => Boolean(registry?.entries?.get(id) ?? registry?.entries?.get(`item:${id}`));
      if (placementVariantOf(entry.id, hasItem)) return CHECK_SKIP;
      const sources = sourceSummary(entry);
      if (sources.total > 0) return true;
      return {
        ok: false,
        detail: 'no crafting, smelting, brewing, mob-loot, smithing, interaction or block-drop source',
      };
    },
  },
  {
    id: 'recipe-parity',
    label: 'Vanilla crafting recipe exists here too',
    group: 'obtainable',
    run: ({ entry, vanilla }) => {
      // Air is not something anyone crafts. The pinned recipe data carries one `paper + filled_map` entry
      // whose result is air, which is how minecraft-data represents the map-zooming recipe; without this it
      // reads as "vanilla has a recipe for air and this game does not".
      if (entry.blockId === BLOCKS.AIR) return CHECK_SKIP;
      const expected = vanilla?.recipesByResultName.get(vanillaIdOf(entry, vanilla));
      if (!expected || !expected.length) return CHECK_SKIP;
      if (entry.recipesAsResult.length) return true;
      return { ok: false, detail: `vanilla has ${expected.length} recipe(s) for this; none here` };
    },
  },
  {
    id: 'ingredient-parity',
    label: 'Usable as an ingredient like vanilla',
    group: 'obtainable',
    run: ({ entry, vanilla }) => {
      const expected = vanilla?.recipesByIngredientName.get(vanillaIdOf(entry, vanilla));
      if (!expected || !expected.length) return CHECK_SKIP;
      if (entry.recipesAsIngredient.length) return true;
      return {
        ok: false,
        detail: `vanilla uses this in ${expected.length} recipe(s); nothing here consumes it`,
      };
    },
  },

  // --- block behaviour ------------------------------------------------------
  {
    id: 'block-id-resolves',
    label: 'Item places a block that exists',
    group: 'block',
    run: ({ entry }) => {
      if (entry.blockId === null) return CHECK_SKIP;
      return BLOCK_DEFS[entry.blockId] !== undefined
        ? true
        : { ok: false, detail: `blockId ${entry.blockId} has no BLOCK_DEFS entry` };
    },
  },
  {
    id: 'harvest-data',
    label: 'Block has hardness and tool data',
    group: 'block',
    run: ({ entry }) => {
      if (entry.blockId === null) return CHECK_SKIP;
      if (skipTechnical(entry)) return CHECK_SKIP;
      // Nothing to compare these against. `pressure_plate` is this game's own generic block -- vanilla names
      // its eight variants instead -- and `sulfur_block` and `dried_ghast` are newer than the pinned 1.21.4
      // data, which is why neither appears in it. Reporting "no row" for them is reporting the cache's age,
      // not a gap in the game, so they are named here with that reason rather than exempted by a pattern.
      if (NO_VANILLA_HARVEST.has(entry.blockAliases?.[0])) return CHECK_SKIP;
      return entry.harvest
        ? true
        : { ok: false, detail: `${entry.blockDef?.name ?? entry.id} has no BLOCK_HARVEST row` };
    },
  },
  {
    id: 'block-drop',
    label: 'A block vanilla says drops something drops something here',
    group: 'block',
    run: ({ entry }) => {
      if (entry.blockId === null) return CHECK_SKIP;
      if (skipTechnical(entry)) return CHECK_SKIP;
      // The game's own rule, which is the same one the registry records sources with. A block that declares
      // neither `drop` nor `dropItem` gives itself, and `drop: null` deliberately gives nothing -- so asking
      // only the vanilla harvest row and the explicit fields reported 149 blocks as yielding nothing, every
      // bed among them, while the game handed every one of them over.
      //
      // `blockDrops` rather than `baseBlockDrop`, because a block whose only drop is probabilistic -- a grass
      // plant's wheat seed -- declares `drop: null` and is not barren. `random` is pinned to zero so those
      // paths fire.
      const dropped = blockDrops(entry.blockId, () => 0);
      if (dropped.length) return true;
      // Yielding nothing is a fact about some blocks rather than a defect: bedrock, water and lava, glass and
      // ice by hand, every infested block, cake, a spawner, the archaeology blocks. Vanilla's own row says so,
      // and there are forty-six of them. The defect is the other direction -- vanilla lists a drop and this
      // block gives none -- which is what this check is for.
      //
      // `air` is how the generated data spells "nothing" -- a pumpkin stem's row is literally `['air']` -- so
      // it is filtered out rather than read as a drop.
      const vanillaDrops = (entry.harvest?.drops ?? [])
        .filter((drop) => String(drop).toLowerCase() !== 'air');
      if (!vanillaDrops.length) return CHECK_SKIP;
      return { ok: false, detail: `vanilla drops ${vanillaDrops.join(', ')} and this block drops nothing` };
    },
  },
  {
    id: 'block-drop-parity',
    label: 'Block drops what vanilla drops',
    group: 'block',
    run: ({ entry, registry, vanilla }) => {
      if (entry.blockId === null) return CHECK_SKIP;
      if (skipTechnical(entry)) return CHECK_SKIP;
      // A placement is obtained by placing its base, and this game models several of vanilla's block states
      // as blocks of their own: a wall banner, a bed's head, an open door. Their drops follow the game's own
      // model, and vanilla has one row for the base block, so comparing them is comparing two shapes.
      //
      // Matched on a *name*, not on the entry's key: a block with no item form is keyed `block:788`, and
      // `'block:788'` ends with none of the state suffixes.
      const names = entry.blockAliases ?? [];
      const baseName = names[0] ?? String(entry.id);
      if (placementVariantOf(baseName, (id) => registry.entries.has(id)) !== null) return CHECK_SKIP;
      // A farm block's row names the *seed* an immature stage gives up -- a pumpkin stem's is `air`, a wheat
      // crop's is `wheat_seeds` -- so the row is about one stage rather than about the block. Named blocks,
      // not a pattern: these are the vanilla names whose rows are stage-specific. Any alias, because a wheat
      // crop carries both `wheat_stage_7` and `wheat`.
      if (names.some((name) => STAGE_SPECIFIC_ROWS.has(name))) return CHECK_SKIP;

      const vanillaDrops = (entry.harvest?.drops ?? [])
        .filter((drop) => String(drop).toLowerCase() !== 'air');
      // Only a row that names exactly one item is comparable. A row naming several is a shape this check
      // does not model (a bookshelf's books and a gravel's flint are both single, but a crop's item plus
      // seeds is not), and a row naming none is the other check's business.
      if (vanillaDrops.length !== 1) return CHECK_SKIP;

      // The game's *base* drop -- what it gives up before the bonus and replacement rolls, both of which are
      // this game's way of spelling vanilla's probabilities (gravel gives flint, a grass plant gives a seed).
      const base = baseBlockDrop(entry.blockId);
      // The drop's name as vanilla knows it, which is neither the block's display name nor its registry key:
      // block 151 is "Block of Coal" here and `coal_block` to vanilla, and a bare block's entry is keyed
      // `block:3` rather than `stone`. Without the vanilla index nothing can be compared.
      if (base !== null && !vanilla) return CHECK_SKIP;
      const droppedEntry = base === null ? null : resolveResource(base.id, registry);
      const gameName = droppedEntry === null ? null : vanillaIdOf(droppedEntry, vanilla);
      if (gameName === vanillaDrops[0]) return true;
      return {
        ok: false,
        detail: `drops ${gameName ?? 'nothing'}, vanilla drops ${vanillaDrops[0]}`,
      };
    },
  },
  {
    id: 'block-drop-roundtrip',
    label: 'Block drops map back to a real item',
    group: 'block',
    run: ({ entry, registry }) => {
      if (entry.blockId === null) return CHECK_SKIP;
      if (skipTechnical(entry)) return CHECK_SKIP;
      const def = entry.blockDef ?? {};
      const declaredDrop = def.dropItem ?? def.drop;
      if (declaredDrop === undefined || declaredDrop === null) return CHECK_SKIP;
      const target = typeof declaredDrop === 'number' ? declaredDrop : String(declaredDrop);
      const resolved = resolveResource(target, registry);
      if (!resolved) return { ok: false, detail: `drop ${declaredDrop} is not a resource` };
      return true;
    },
  },

  // --- item behaviour -------------------------------------------------------
  {
    id: 'enchantable',
    label: 'Enchantable items have an enchantment category',
    group: 'behaviour',
    run: ({ entry }) => {
      const wants = ['weapon', 'tool', 'armor', 'shield'].includes(entry.def?.type);
      if (!wants) return CHECK_SKIP;
      // This game types a bucket, a clock, a compass, a name tag and a saddle as `tool` -- a reasonable
      // classification for "something you hold" and the wrong answer to "can an enchanting table take it".
      // Vanilla refuses all of them, so the named list is what separates a real gap from a loose type.
      if (NOT_ENCHANTABLE.has(entry.id)) return CHECK_SKIP;
      const category = getItemEnchantCategory(entry.id);
      return category
        ? true
        : { ok: false, detail: `${entry.def?.type} has no enchantment category` };
    },
  },
  {
    id: 'tool-facts',
    label: 'Tools declare a class and a tier',
    group: 'behaviour',
    run: ({ entry }) => {
      const wants = ['tool', 'weapon'].includes(entry.def?.type);
      if (!wants) return CHECK_SKIP;
      // Not every tool mines. A bow, a bucket, a fishing rod and a name tag are tools this game types as
      // such and have no mining class, which `describeTool` answers correctly with null.
      if (NON_MINING_TOOLS.has(entry.id)) return CHECK_SKIP;
      const described = describeTool(entry.id);
      if (!described) return { ok: false, detail: 'not described by miningRules.describeTool' };
      // A sword is a weapon class with no tier requirement; shears mine specific blocks and vanilla gives
      // them no tier either. Everything else on the ladder needs one.
      if (described.tool === 'sword' || described.tool === 'shears') return true;
      return described.tier
        ? true
        : { ok: false, detail: `${described.tool} has no tier, so it mines nothing` };
    },
  },
  {
    id: 'edible',
    label: 'Foods feed the player and agree with vanilla',
    group: 'behaviour',
    run: ({ entry, vanilla }) => {
      const declared = entry.food;
      const vanillaFood = vanilla?.foodByName.get(vanillaIdOf(entry, vanilla));
      if (!declared && !vanillaFood) return CHECK_SKIP;
      // `foodData.js` stores saturation as vanilla's saturation modifier (half of vanilla's
      // saturation points), which is a consistent convention across every food, so the comparison
      // doubles it rather than flagging all 41 entries as wrong.
      if (vanillaFood && declared) {
        if (declared.hunger !== vanillaFood.foodPoints) {
          return { ok: false, detail: `hunger ${declared.hunger}, vanilla ${vanillaFood.foodPoints}` };
        }
        if (Math.abs(declared.saturation * 2 - vanillaFood.saturation) > 0.001) {
          return {
            ok: false,
            detail: `saturation ${declared.saturation} (as modifier), vanilla ${vanillaFood.saturation} points`,
          };
        }
      }
      if (!entry.def?.food) {
        return { ok: false, detail: 'declared in foodData.js but the item has no food value, so it cannot be eaten' };
      }
      // The item's own number is what the eating code uses, and this check used to stop at "has one".
      // A golden apple declared 8 where `foodData.js` and vanilla both say 4, so it fed twice what it
      // should have while every assertion above passed: the table was compared against vanilla, and the
      // item was never compared against the table. This is the assertion that catches the whole class.
      if (entry.def.food !== declared.hunger) {
        return {
          ok: false,
          detail: `the item feeds ${entry.def.food} but foodData.js says ${declared.hunger}`,
        };
      }
      return true;
    },
  },
  {
    id: 'spawn-egg-target',
    label: 'Spawn egg names a mob',
    group: 'behaviour',
    run: ({ entry, mobTypes }) => {
      if (entry.def?.type !== 'spawn_egg') return CHECK_SKIP;
      const mob = entry.def?.mob;
      if (typeof mob !== 'string' || !mob) return { ok: false, detail: 'no mob id on the definition' };
      if (!mobTypes) return { ok: true, detail: `names ${mob}` };
      return mobTypes.has(mob)
        ? true
        : { ok: false, detail: `names ${mob}, which no spawner implements` };
    },
  },
  {
    id: 'block-places-block',
    label: 'Block items place their block',
    group: 'behaviour',
    run: ({ entry }) => {
      if (entry.def?.type !== 'block') return CHECK_SKIP;
      return entry.def?.isBlock
        ? true
        : { ok: false, detail: 'typed as a block item but isBlock is not set' };
    },
  },
];

/**
 * Index the pinned vanilla data so a check can ask "does vanilla have this, and how?".
 *
 * Mirrors the mapper in `scripts/parity-coverage.mjs`, which is the project's established way of
 * turning vanilla's numeric-id recipe data into names. Kept as a separate function so a caller
 * without the cache can still run every check that does not need vanilla.
 */
export function buildVanillaIndex({ items = [], recipes = {}, foods = [], blocks = [] } = {}) {
  const nameById = new Map(items.map((i) => [i.id, i.name]));
  const push = (map, key, value) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(value);
  };
  const recipesByResultName = new Map();
  const recipesByIngredientName = new Map();
  for (const [key, list] of Object.entries(recipes ?? {})) {
    for (const rec of list ?? []) {
      push(recipesByResultName, nameById.get(rec.result?.id ?? Number(key)), rec);
      const cells = rec.inShape ? rec.inShape.flat() : (rec.ingredients ?? []);
      // A material used in several cells of one shaped recipe is one recipe that needs it, not
      // several. Counting per cell reported "vanilla uses this in 3 recipes" for an ingredient that
      // appears three times in a single one, which overstates how much a missing item matters.
      const names = new Set();
      for (const cell of cells) {
        if (cell === null || cell === undefined) continue;
        const name = nameById.get(Array.isArray(cell) ? cell[0] : cell);
        if (name) names.add(name);
      }
      for (const name of names) push(recipesByIngredientName, name, rec);
    }
  }
  return {
    itemByName: new Map(items.map((i) => [i.name, i])),
    blockByName: new Map(blocks.map((b) => [b.name, b])),
    foodByName: new Map(foods.map((f) => [f.name, f])),
    recipesByResultName,
    recipesByIngredientName,
    itemNames: items.map((i) => i.name),
    // Block names were not exposed, so the shadowing report could only see item spellings -- and the two
    // worst duplicates shadowed a *block* name (`hay_bale`) or differed by vocabulary rather than by
    // spelling (`slimeball`), so both would have been missed.
    blockNames: blocks.map((b) => b.name),
  };
}

/**
 * Run the checks for one resource or for the whole registry.
 *
 * `options` carries the data the checks may or may not have:
 *   vanilla        from `buildVanillaIndex`, or null
 *   assetExists    `(iconPath) => boolean`, or null
 *   mobTypes       a `Set` of implemented mob ids, or null
 *   durabilityHas  `(itemId) => boolean`, or null
 *
 * `entry`/`ref` are resolved through the registry, so a caller can pass `'oak_planks'`, `10` or an
 * entry object.
 */
export class ResourceShowcase {
  constructor({ registry = defaultRegistry(), ...options } = {}) {
    this.registry = registry;
    this.options = options;
    this.results = [];
    this.selection = null;
  }

  /** Every check that applies to a resource, evaluated in one call. */
  run(ref) {
    const entry = resolveResource(ref, this.registry);
    if (!entry) {
      // One result, not one per check. Nineteen identical "no resource matches" errors bury the
      // answer, which is simply that the id does not exist -- and that is itself the most common
      // item-parity gap (a loot table or recipe naming something the registry never defined).
      this.selection = String(ref);
      this.results = [{
        id: 'exists',
        label: 'Resource exists in the registry',
        group: 'identity',
        status: 'not observed',
        detail: `no item or block is registered as ${JSON.stringify(ref)}`,
      }];
      return this.results;
    }
    this.selection = entry.key;
    const ctx = { entry, registry: this.registry, ...this.options };
    this.results = RESOURCE_CHECKS.map((check) => {
      const base = { id: check.id, label: check.label, group: check.group };
      try {
        const outcome = check.run(ctx);
        if (outcome === CHECK_SKIP) return { ...base, status: 'unsupported' };
        if (outcome === true) return { ...base, status: 'observed' };
        if (outcome === false) return { ...base, status: 'not observed' };
        if (outcome && typeof outcome === 'object') {
          return { ...base, status: outcome.ok ? 'observed' : 'not observed', detail: outcome.detail ?? '' };
        }
        return { ...base, status: 'error', detail: `check returned ${String(outcome)}` };
      } catch (error) {
        return { ...base, status: 'error', detail: error.message };
      }
    });
    return this.results;
  }

  /** Scored / skipped / failed counts, with `unsupported` excluded from the score as with mobs. */
  summary() {
    const scored = this.results.filter((r) => r.status !== 'unsupported');
    return {
      selection: this.selection,
      passed: scored.filter((r) => r.status === 'observed').length,
      failed: scored.filter((r) => r.status === 'not observed').length,
      skipped: this.results.length - scored.length,
      errors: this.results.filter((r) => r.status === 'error').length,
      scored: scored.length,
      total: this.results.length,
    };
  }

  /**
   * Audit a whole selection synchronously and return per-check counts.
   *
   * This is the progress metric for parity work: increase `observed` for a check without decreasing
   * any other. Because it needs no renderer, `node scripts/inspect-resource.mjs audit` and the tests
   * measure the same thing.
   */
  audit(refs = [...this.registry.entries.values()]) {
    const perCheck = new Map();
    const failures = [];
    for (const check of RESOURCE_CHECKS) {
      perCheck.set(check.id, { id: check.id, label: check.label, group: check.group, observed: 0, failed: 0, skipped: 0, error: 0 });
    }
    for (const ref of refs) {
      for (const result of this.run(ref)) {
        const row = perCheck.get(result.id);
        if (!row) continue;
        if (result.status === 'observed') row.observed++;
        else if (result.status === 'unsupported') row.skipped++;
        else if (result.status === 'error') row.error++;
        else {
          row.failed++;
          failures.push({ resource: this.selection, check: result.id, detail: result.detail ?? '' });
        }
      }
    }
    return { checks: [...perCheck.values()], failures };
  }
}

export { danglingReferences };
