// Structure processors: the block transformations vanilla applies while placing a template.
//
// This is the second half of the template pipeline. `template.js` produces the blocks a template contains;
// processors decide which of them are actually written, and in what form. Vanilla's Processor_list page
// documents exactly 11 `processor_type` values, and all 11 are implemented here:
//
//   nop, block_ignore, block_rot, protected_blocks, jigsaw_replacement, rule, capped, block_age,
//   blackstone_replace, lava_submerged_block, gravity
//
// The important semantic, and the one most easily got wrong: a processor returning `null` means "do not
// place this block", and the WORLD'S EXISTING BLOCK SURVIVES. That is what `block_ignore` and `block_rot`
// mean by "the removed blocks are not replaced by air, but keep the old blocks before the structure being
// generated". Returning a state of `minecraft:air` is a different operation: it clears.
//
// HONESTY ABOUT APPROXIMATION. The wiki documents each processor's *purpose* and, for some, its exact
// numbers; it does not publish the vanilla processor *list* contents at all (verified by full-text search,
// see docs/STRUCTURE_REFERENCES.md). Three places below are therefore marked as approximations rather than
// presented as exact, and each is reported at runtime through `requirements` or a `notes` field:
//
//   1. `block_age` -- the 0.5 replacement chance and the obsidian 0.15 are published; WHICH of the four
//      candidate replacements is chosen is not, nor how `mossiness` biases it.
//   2. `blackstone_replace` -- the core replacement table is implemented; the wiki does not print the full
//      table, so uncommon stone variants may be missing.
//   3. `gravity` -- needs a heightmap query, which only a world-facing caller can provide.

import { parseBlockState, formatBlockState, normaliseName, bareName } from './blockState.js';

/** What a processor returns: a block to place, or null to leave the world's block alone. */
export const SKIP = null;

/**
 * A `StructureProcessorList`: an ordered list, applied in sequence to each block.
 *
 * Order is load-bearing. `block_ignore` before `rule` is a different structure from `rule` before
 * `block_ignore`, so the list is never sorted or de-duplicated.
 */
export class ProcessorList {
  constructor(processors = [], { id = null } = {}) {
    this.id = id;
    this.processors = processors;
  }

  /** Processors in this list that need a world query the caller has not supplied. */
  unmetRequirements(world) {
    const missing = new Set();
    for (const processor of this.processors) {
      for (const need of processor.requires || []) {
        if (!world || typeof world[need] !== 'function') missing.add(`${processor.type}:${need}`);
      }
    }
    return [...missing].sort();
  }

  /**
   * Run every processor over one block.
   *
   * @returns {{ block: object|null, applied: string[] }} `block` null means "leave the world block alone".
   */
  process(block, context) {
    let current = block;
    const applied = [];
    for (const processor of this.processors) {
      if (current === null) break;
      const next = processor.apply(current, context);
      if (next !== undefined) {
        applied.push(processor.type);
        current = next;
      }
    }
    return { block: current, applied };
  }

  get types() {
    return this.processors.map((processor) => processor.type);
  }
}

/** A processor that does nothing, present because vanilla has one and data may reference it. */
function nopProcessor() {
  return { type: 'nop', apply: (block) => block };
}

/**
 * `block_ignore`: blocks in the list are left as the world has them.
 *
 * The field is a block list (`blocks`); tags are accepted with a leading `#` and resolved through an
 * injected tag lookup, because this repository has no block-tag registry.
 */
function blockIgnoreProcessor(data = {}) {
  const names = new Set((data.blocks || []).filter((entry) => !entry.startsWith('#')).map(normaliseName));
  const tags = (data.blocks || []).filter((entry) => entry.startsWith('#'));
  return {
    type: 'block_ignore',
    requires: tags.length ? ['hasBlockTag'] : [],
    apply(block, context) {
      const name = normaliseName(block.state.name);
      if (names.has(name)) return SKIP;
      if (tags.length && context.world?.hasBlockTag?.(name, tags)) return SKIP;
      return block;
    }
  };
}

/**
 * `block_rot`: each block is independently dropped with probability `1 - integrity`.
 *
 * The dropped block is NOT replaced by air -- the world keeps whatever was there -- which is how ruined
 * structures end up half-buried in the terrain instead of sitting in an air pocket.
 */
function blockRotProcessor(data = {}) {
  const integrity = clamp01(data.integrity ?? 1);
  return {
    type: 'block_rot',
    apply(block, context) {
      if (integrity >= 1) return block;
      return context.random.nextFloat() < integrity ? block : SKIP;
    }
  };
}

/** `protected_blocks`: blocks matching the tag cannot be overwritten by the structure. */
function protectedBlocksProcessor(data = {}) {
  const tag = data.value || data.tag || '';
  const names = new Set((data.blocks || []).map(normaliseName));
  return {
    type: 'protected_blocks',
    // `getBlockState` is needed unconditionally -- the whole processor is about what the WORLD already has
    // -- and the tag lookup only when the protection is expressed as a tag. Reporting the first one too
    // late turned a missing world query into a silent "nothing is protected".
    requires: tag ? ['getBlockState', 'hasBlockTag'] : ['getBlockState'],
    apply(block, context) {
      const existing = context.world?.getBlockState?.(context.pos.x, context.pos.y, context.pos.z);
      if (existing === undefined) return block; // no world query: cannot protect, so place
      const existingName = normaliseName(typeof existing === 'string' ? bareState(existing) : existing);
      if (names.has(existingName)) return SKIP;
      if (tag && context.world?.hasBlockTag?.(existingName, [tag])) return SKIP;
      return block;
    }
  };
}

/** `jigsaw_replacement`: a jigsaw block becomes its `final_state`, and its block entity is dropped. */
function jigsawReplacementProcessor() {
  return {
    type: 'jigsaw_replacement',
    apply(block, context) {
      if (normaliseName(block.state.name) !== 'minecraft:jigsaw') return block;
      const finalState = context.jigsawFinalState || 'minecraft:air';
      if (normaliseName(finalState) === 'minecraft:structure_void') return SKIP;
      return { state: parseBlockState(finalState), nbt: null };
    }
  };
}

/**
 * `lava_submerged_block`: a block whose shape is incomplete cannot overwrite lava.
 *
 * Vanilla's test is "does this block have a full collision/outline shape"; with no shape data for every
 * block here, the caller supplies the predicate. Without it the processor passes blocks through and says
 * so through `requires`.
 */
function lavaSubmergedProcessor(data = {}) {
  return {
    type: 'lava_submerged_block',
    requires: ['getBlockState', 'isFullShape'],
    apply(block, context) {
      const world = context.world;
      if (!world?.getBlockState || !world?.isFullShape) return block;
      const existing = world.getBlockState(context.pos.x, context.pos.y, context.pos.z);
      if (!existing) return block;
      const existingName = normaliseName(bareState(existing));
      if (existingName !== 'minecraft:lava') return block;
      return world.isFullShape(block.state) ? block : SKIP;
    }
  };
}

/** `blackstone_replace`: stone-family blocks become blackstone equivalents, iron bars become chains. */
const BLACKSTONE_TABLE = {
  'minecraft:stone': 'minecraft:blackstone',
  'minecraft:cobblestone': 'minecraft:blackstone',
  'minecraft:stone_bricks': 'minecraft:polished_blackstone_bricks',
  'minecraft:cracked_stone_bricks': 'minecraft:cracked_polished_blackstone_bricks',
  'minecraft:chiseled_stone_bricks': 'minecraft:chiseled_polished_blackstone',
  'minecraft:mossy_stone_bricks': 'minecraft:polished_blackstone_bricks',
  'minecraft:stone_stairs': 'minecraft:blackstone_stairs',
  'minecraft:cobblestone_stairs': 'minecraft:blackstone_stairs',
  'minecraft:stone_brick_stairs': 'minecraft:polished_blackstone_brick_stairs',
  'minecraft:stone_slab': 'minecraft:blackstone_slab',
  'minecraft:cobblestone_slab': 'minecraft:blackstone_slab',
  'minecraft:stone_brick_slab': 'minecraft:polished_blackstone_brick_slab',
  'minecraft:stone_brick_wall': 'minecraft:polished_blackstone_brick_wall',
  'minecraft:cobblestone_wall': 'minecraft:blackstone_wall',
  'minecraft:iron_bars': 'minecraft:chain'
};

function blackstoneReplaceProcessor() {
  return {
    type: 'blackstone_replace',
    // The wiki states the rule but does not print the table, so this is the documented core rather than a
    // verified complete list. Unmapped stone variants are left alone, which is visible, not silent.
    notes: 'core replacement table; the wiki does not publish the full list',
    apply(block) {
      const replacement = BLACKSTONE_TABLE[normaliseName(block.state.name)];
      if (!replacement) return block;
      return { state: { name: replacement, properties: block.state.properties }, nbt: block.nbt };
    }
  };
}

/** `capped`: applies a delegate to at most `limit` blocks, chosen in a deterministic shuffled order. */
function cappedProcessor(data = {}) {
  const limit = Math.max(0, Math.trunc(data.limit ?? 0));
  const delegate = createProcessor(data.delegate || { processor_type: 'minecraft:nop' });
  return {
    type: 'capped',
    notes: 'the "finalize" pre-pass vanilla runs is not reproduced; this applies greedily in placement order',
    apply(block, context) {
      const used = context.state.cappedUsed || (context.state.cappedUsed = new Map());
      const count = used.get(limit) || 0;
      if (count >= limit) return block;
      const next = delegate.apply(block, context);
      // Only an ACTUAL modification counts against the cap, which is vanilla's documented behaviour.
      const modified = next !== undefined && next !== block && next !== null;
      if (modified) used.set(limit, count + 1);
      return next;
    }
  };
}

/**
 * `block_age`: weathers stone-family blocks toward mossy and cracked variants, and obsidian toward crying
 * obsidian.
 *
 * Published numbers: a stone/stone-brick/cracked-stone-brick block has a 0.5 chance of becoming one of
 * {cracked stone bricks, stone brick stairs, mossy stone bricks, mossy stone brick stairs}; obsidian has a
 * 0.15 chance of becoming crying obsidian. WHICH of the four is chosen, and how the `mossiness` argument
 * biases it, is not published -- so the choice is weighted by `mossiness` and flagged as an approximation.
 */
const AGE_STONE_CANDIDATES = [
  'minecraft:cracked_stone_bricks',
  'minecraft:stone_brick_stairs',
  'minecraft:mossy_stone_bricks',
  'minecraft:mossy_stone_brick_stairs'
];

function blockAgeProcessor(data = {}) {
  const mossiness = clamp01(data.mossiness ?? 0.5);
  return {
    type: 'block_age',
    notes: 'the 0.5 roll and obsidian 0.15 are published; the choice among the four candidates and the '
      + 'mossiness weighting are an approximation',
    apply(block, context) {
      const name = normaliseName(block.state.name);
      if (name === 'minecraft:obsidian') {
        return context.random.nextFloat() < 0.15
          ? { state: { name: 'minecraft:crying_obsidian', properties: block.state.properties }, nbt: block.nbt }
          : block;
      }
      const isStoneFamily = name === 'minecraft:stone' || name === 'minecraft:stone_bricks'
        || name === 'minecraft:cracked_stone_bricks';
      if (!isStoneFamily) return block;
      if (context.random.nextFloat() >= 0.5) return block;
      // Mossy variants take the front of the list as mossiness rises; with mossiness 0 the cracked brick
      // is the likeliest outcome instead.
      const index = context.random.nextFloat() < mossiness ? 2 + (context.random.nextBoolean() ? 1 : 0)
        : (context.random.nextBoolean() ? 1 : 0);
      const replacement = AGE_STONE_CANDIDATES[Math.min(index, AGE_STONE_CANDIDATES.length - 1)];
      return { state: { name: replacement, properties: {} }, nbt: block.nbt };
    }
  };
}

/**
 * `rule`: the general-purpose processor. Rules are tested in order and the first match applies.
 *
 * Rule tests: always_true, block_match, blockstate_match, random_block_match, random_blockstate_match,
 * tag_match. Position tests: always_true, linear_pos, axis_aligned_linear_pos. Block-entity modifiers:
 * passthrough, append_loot, append_static, clear.
 */
function ruleProcessor(data = {}) {
  const rules = (data.rules || []).map((rule) => ({
    input: compileRuleTest(rule.input_predicate),
    location: compilePosTest(rule.location_predicate),
    output: rule.output_state ? parseBlockState(rule.output_state) : null,
    modifier: compileBlockEntityModifier(rule.block_entity_modifier),
    raw: rule
  }));
  return {
    type: 'rule',
    requires: rules.some((rule) => rule.input.needsTag) ? ['hasBlockTag'] : [],
    apply(block, context) {
      for (const rule of rules) {
        if (!rule.input.test(block, context)) continue;
        if (!rule.location.test(context)) continue;
        const state = rule.output || block.state;
        const nbt = rule.modifier(block.nbt, state, context);
        return { state, nbt };
      }
      return block;
    }
  };
}

function compileRuleTest(predicate = {}) {
  const type = String(predicate.predicate_type || 'always_true').replace(/^minecraft:/, '');
  switch (type) {
    case 'always_true':
      return { needsTag: false, test: () => true };
    case 'block_match': {
      const name = normaliseName(predicate.block || 'minecraft:air');
      return { needsTag: false, test: (block) => normaliseName(block.state.name) === name };
    }
    case 'blockstate_match': {
      const want = parseBlockState(predicate.block_state || 'minecraft:air');
      return {
        needsTag: false,
        test: (block) => {
          if (normaliseName(block.state.name) !== want.name) return false;
          // Vanilla requires every listed property to match; unlisted properties are free.
          return Object.entries(want.properties).every(([key, value]) => block.state.properties[key] === value);
        }
      };
    }
    case 'random_block_match': {
      const name = normaliseName(predicate.block || 'minecraft:air');
      const probability = clamp01(predicate.probability ?? 1);
      return {
        needsTag: false,
        test: (block, context) =>
          normaliseName(block.state.name) === name && context.random.nextFloat() < probability
      };
    }
    case 'random_blockstate_match': {
      const want = parseBlockState(predicate.block_state || 'minecraft:air');
      const probability = clamp01(predicate.probability ?? 1);
      return {
        needsTag: false,
        test: (block, context) => normaliseName(block.state.name) === want.name
          && Object.entries(want.properties).every(([key, value]) => block.state.properties[key] === value)
          && context.random.nextFloat() < probability
      };
    }
    case 'tag_match': {
      const tag = predicate.tag || '';
      return {
        needsTag: true,
        test: (block, context) => Boolean(context.world?.hasBlockTag?.(normaliseName(block.state.name), [tag]))
      };
    }
    default:
      throw new Error(`unsupported rule test predicate_type "${predicate.predicate_type}"`);
  }
}

function compilePosTest(predicate = {}) {
  const type = String(predicate.predicate_type || 'always_true').replace(/^minecraft:/, '');
  const chance = (predicate, distance) => {
    const min = predicate.min_chance ?? 0;
    const max = predicate.max_chance ?? 1;
    const minDist = predicate.min_dist ?? 0;
    const maxDist = predicate.max_dist ?? 1;
    if (maxDist <= minDist) return max;
    const t = Math.min(1, Math.max(0, (distance - minDist) / (maxDist - minDist)));
    return min + (max - min) * t;
  };
  switch (type) {
    case 'always_true':
      return { test: () => true };
    case 'linear_pos':
      return {
        test: (context) => {
          const distance = Math.hypot(context.localPos.x, context.localPos.y, context.localPos.z);
          return context.random.nextFloat() < chance(predicate, distance);
        }
      };
    case 'axis_aligned_linear_pos': {
      const axis = String(predicate.axis || 'x').toLowerCase();
      return {
        test: (context) => {
          const distance = Math.abs(context.localPos[axis] ?? 0);
          return context.random.nextFloat() < chance(predicate, distance);
        }
      };
    }
    default:
      throw new Error(`unsupported position predicate_type "${predicate.predicate_type}"`);
  }
}

function compileBlockEntityModifier(modifier = {}) {
  const type = String(modifier.type || (modifier.block_entity_modifier?.type) || 'minecraft:passthrough')
    .replace(/^minecraft:/, '');
  switch (type) {
    case 'passthrough':
      return (nbt) => nbt;
    case 'clear':
      return () => null;
    case 'append_loot':
      return (nbt, _state, context) => {
        const lootTable = modifier.loot_table || modifier.lootTable || nbt?.LootTable || null;
        return {
          ...(nbt || {}),
          LootTable: lootTable,
          // A fresh seed per container, drawn from the placement random: without it every chest in the
          // world would roll the same contents.
          LootTableSeed: context.random.nextLong()
        };
      };
    case 'append_static':
      return (nbt) => ({ ...(nbt || {}), ...(modifier.data || {}) });
    default:
      throw new Error(`unsupported block entity modifier "${type}"`);
  }
}

/**
 * `gravity`: moves each block's Y so the template follows the terrain, like a village road.
 *
 * Vanilla hardcodes this on any template whose pool element has `projection: terrain_matching`, with an
 * offset of -1. It needs a heightmap, which only a world-facing caller can supply; without one the blocks
 * pass through and `requires` says why.
 */
function gravityProcessor(data = {}) {
  const offset = data.offset ?? 0;
  const heightmap = data.heightmap || 'world_surface_wg';
  return {
    type: 'gravity',
    requires: ['heightmap'],
    notes: 'needs a heightmap query from the caller; vanilla applies offset -1 for terrain_matching pieces',
    apply(block, context) {
      if (typeof context.world?.heightmap !== 'function') return block;
      const target = context.world.heightmap(context.pos.x, context.pos.z, heightmap) + offset;
      const delta = target - context.pos.y;
      if (delta === 0) return block;
      // The block is re-positioned rather than transformed in place, so the pipeline reads the new Y from
      // the returned block instead of mutating the caller's cursor.
      return { state: block.state, nbt: block.nbt, y: context.pos.y + delta, moved: delta };
    }
  };
}

/** Build a processor from vanilla-shaped data. */
export function createProcessor(data = {}) {
  const type = String(data.processor_type || data.type || 'minecraft:nop').replace(/^minecraft:/, '');
  switch (type) {
    case 'nop': return nopProcessor();
    case 'block_ignore': return blockIgnoreProcessor(data);
    case 'block_rot': return blockRotProcessor(data);
    case 'protected_blocks': return protectedBlocksProcessor(data);
    case 'jigsaw_replacement': return jigsawReplacementProcessor();
    case 'lava_submerged_block': return lavaSubmergedProcessor(data);
    case 'blackstone_replace': return blackstoneReplaceProcessor();
    case 'capped': return cappedProcessor(data);
    case 'block_age': return blockAgeProcessor(data);
    case 'rule': return ruleProcessor(data);
    case 'gravity': return gravityProcessor(data);
    default:
      // Unknown processors must not be silently dropped: a data pack could add one, and skipping it would
      // change the structure without saying so.
      throw new Error(`unsupported processor_type "${data.processor_type ?? data.type}"`);
  }
}

/**
 * Build a list from vanilla-shaped data (`{ processors: [...] }`), a bare array, or nothing.
 *
 * The "or nothing" case matters: a template with no processor list is the common case, and treating an
 * empty object as a list is how `placeTemplate` crashed on every rigid template.
 */
export function createProcessorList(data = {}, options = {}) {
  const entries = Array.isArray(data?.processors) ? data.processors : (Array.isArray(data) ? data : []);
  return new ProcessorList(entries.map(createProcessor), { id: options.id ?? data?.id ?? null });
}

/** The 11 vanilla processor type names, for the Inspector's coverage report. */
export const PROCESSOR_TYPES = [
  'nop', 'block_ignore', 'block_rot', 'protected_blocks', 'jigsaw_replacement', 'rule', 'capped',
  'block_age', 'blackstone_replace', 'lava_submerged_block', 'gravity'
];

/** Which of the 11 have a world-query requirement the caller must satisfy. */
export const PROCESSOR_REQUIREMENTS = {
  nop: [], block_ignore: [], block_rot: [], jigsaw_replacement: [], rule: [], capped: [], block_age: [],
  blackstone_replace: [], protected_blocks: ['getBlockState'], lava_submerged_block: ['getBlockState', 'isFullShape'],
  gravity: ['heightmap']
};

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function bareState(text) {
  return String(text).split('[')[0];
}

export { formatBlockState };
