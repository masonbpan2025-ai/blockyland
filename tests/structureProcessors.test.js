// Tests for the processor framework and the template placement pipeline.
//
// These are the tests that decide whether a placed structure is *trustworthy*: a processor that silently
// drops or mangles blocks produces something that looks like a structure and is not one. Every processor
// is exercised, including the ones whose data the wiki does not publish -- those assert the *reported*
// approximation instead of pretending to exactness.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createProcessor, createProcessorList, ProcessorList, PROCESSOR_TYPES, PROCESSOR_REQUIREMENTS
} from '../src/worldgen/processors.js';
import { placeTemplate, describePlacement, TERRAIN_MATCHING_GRAVITY_OFFSET } from '../src/worldgen/templatePlacement.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { LegacyRandom } from '../src/worldgen/random.js';
import { parseBlockState } from '../src/worldgen/blockState.js';

const block = (state) => ({ state: parseBlockState(state), nbt: null });
const context = (overrides = {}) => ({
  random: new LegacyRandom(12345),
  pos: { x: 0, y: 64, z: 0 },
  localPos: { x: 0, y: 0, z: 0 },
  world: null,
  state: {},
  jigsawFinalState: 'minecraft:air',
  ...overrides
});

test('all eleven vanilla processor types exist and construct', () => {
  assert.equal(PROCESSOR_TYPES.length, 11);
  for (const type of PROCESSOR_TYPES) {
    const processor = createProcessor({ processor_type: `minecraft:${type}` });
    assert.equal(processor.type, type);
  }
  assert.deepEqual(Object.keys(PROCESSOR_REQUIREMENTS).sort(), [...PROCESSOR_TYPES].sort());
  // An unknown type must throw rather than being dropped, because a data pack could introduce one and
  // silently skipping it would change the structure without saying so.
  assert.throws(() => createProcessor({ processor_type: 'minecraft:not_a_processor' }), /unsupported processor_type/);
});

test('nop and block_ignore behave as documented', () => {
  const original = block('minecraft:stone');
  assert.equal(createProcessor({ processor_type: 'nop' }).apply(original, context()), original);

  const ignore = createProcessor({ processor_type: 'block_ignore', blocks: ['minecraft:stone', 'minecraft:dirt'] });
  // null means "leave the world's block alone" -- not "write air". This is what keeps ruins buried.
  assert.equal(ignore.apply(original, context()), null);
  assert.deepEqual(ignore.apply(block('minecraft:oak_planks'), context()).state.name, 'minecraft:oak_planks');
  // A tag-based ignore reports the missing world query instead of pretending it matched nothing.
  const tagged = createProcessor({ processor_type: 'block_ignore', blocks: ['#minecraft:planks'] });
  assert.deepEqual(tagged.requires, ['hasBlockTag']);
});

test('block_rot drops blocks with 1 - integrity, and never writes air', () => {
  const intact = createProcessor({ processor_type: 'block_rot', integrity: 1 });
  const cell = block('minecraft:stone');
  const intactContext = context();
  for (let i = 0; i < 20; i++) assert.notEqual(intact.apply(cell, intactContext), null);

  const destroyed = createProcessor({ processor_type: 'block_rot', integrity: 0 });
  assert.equal(destroyed.apply(cell, context()), null);

  // Half integrity keeps roughly half. The context must be SHARED across iterations: a fresh context
  // rebuilds the random source from the same seed, so every draw would be the first one and the outcome
  // would be 0 or 400 rather than a spread.
  const half = createProcessor({ processor_type: 'block_rot', integrity: 0.5 });
  const shared = context();
  let kept = 0;
  for (let i = 0; i < 400; i++) if (half.apply(cell, shared) !== null) kept++;
  assert.ok(kept > 120 && kept < 280, `expected roughly half of 400, kept ${kept}`);

  // The same seed must keep the same blocks: a second shared context reproduces the sequence exactly.
  const repeatProcessor = createProcessor({ processor_type: 'block_rot', integrity: 0.5 });
  const repeatContext = context();
  let repeated = 0;
  for (let i = 0; i < 400; i++) if (repeatProcessor.apply(cell, repeatContext) !== null) repeated++;
  assert.equal(repeated, kept, 'the same seed must keep the same blocks');
});

test('jigsaw_replacement uses the block final state, and structure_void removes', () => {
  const jigsaw = createProcessor({ processor_type: 'jigsaw_replacement' });
  const source = block('minecraft:jigsaw[orientation=up_north]');

  const replaced = jigsaw.apply(source, context({ jigsawFinalState: 'minecraft:oak_planks' }));
  assert.equal(replaced.state.name, 'minecraft:oak_planks');
  assert.equal(replaced.nbt, null, 'the jigsaw block entity must not survive');

  assert.equal(jigsaw.apply(source, context({ jigsawFinalState: 'minecraft:structure_void' })), null);
  assert.equal(jigsaw.apply(source, context()).state.name, 'minecraft:air', 'the default final state is air');
  // A non-jigsaw block is untouched.
  const stone = block('minecraft:stone');
  assert.equal(jigsaw.apply(stone, context()), stone);
});

test('rule applies the first matching rule and honours every documented rule test', () => {
  const list = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [
        { input_predicate: { predicate_type: 'block_match', block: 'minecraft:stone' }, location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:mossy_stone_bricks' },
        { input_predicate: { predicate_type: 'blockstate_match', block_state: 'minecraft:oak_log[axis=y]' }, location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:stripped_oak_log[axis=y]' },
        { input_predicate: { predicate_type: 'block_match', block: 'minecraft:stone' }, location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:diamond_block' }
      ]
    }]
  });
  const process = (state) => list.process(block(state), context()).block;

  // First match wins: the second stone rule must never be reached.
  assert.equal(process('minecraft:stone').state.name, 'minecraft:mossy_stone_bricks');
  assert.equal(process('minecraft:oak_log[axis=y]').state.name, 'minecraft:stripped_oak_log');
  // blockstate_match requires every listed property, so a different axis does not match.
  assert.equal(process('minecraft:oak_log[axis=x]').state.name, 'minecraft:oak_log');
  // No rule matches: the block passes through.
  assert.equal(process('minecraft:dirt').state.name, 'minecraft:dirt');
});

test('random rule tests honour probability 0 and 1 exactly', () => {
  const never = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [{
        input_predicate: { predicate_type: 'random_block_match', block: 'minecraft:stone', probability: 0 },
        location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:gold_block'
      }]
    }]
  });
  const always = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [{
        input_predicate: { predicate_type: 'random_block_match', block: 'minecraft:stone', probability: 1 },
        location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:gold_block'
      }]
    }]
  });
  const shared = context();
  for (let i = 0; i < 50; i++) {
    assert.equal(never.process(block('minecraft:stone'), shared).block.state.name, 'minecraft:stone');
    assert.equal(always.process(block('minecraft:stone'), shared).block.state.name, 'minecraft:gold_block');
  }
});

test('position rule tests use the local distance from the template origin', () => {
  const list = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [
        // Near the origin (distance 0) nothing may change; past distance 5 everything must.
        { input_predicate: { predicate_type: 'block_match', block: 'minecraft:stone' }, location_predicate: { predicate_type: 'linear_pos', min_chance: 0, max_chance: 1, min_dist: 0, max_dist: 5 }, output_state: 'minecraft:mossy_stone_bricks' },
        { input_predicate: { predicate_type: 'block_match', block: 'minecraft:stone' }, location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:stone' }
      ]
    }]
  });
  const near = list.process(block('minecraft:stone'), context({ localPos: { x: 0, y: 0, z: 0 } })).block;
  assert.equal(near.state.name, 'minecraft:stone', 'chance 0 at the origin');
  const far = list.process(block('minecraft:stone'), context({ localPos: { x: 9, y: 0, z: 0 } })).block;
  assert.equal(far.state.name, 'minecraft:mossy_stone_bricks', 'chance 1 beyond max_dist');

  // The axis-aligned variant measures only along its axis.
  const axisList = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [{
        input_predicate: { predicate_type: 'block_match', block: 'minecraft:stone' },
        location_predicate: { predicate_type: 'axis_aligned_linear_pos', axis: 'y', min_chance: 0, max_chance: 1, min_dist: 0, max_dist: 4 },
        output_state: 'minecraft:deepslate'
      }]
    }]
  });
  assert.equal(axisList.process(block('minecraft:stone'), context({ localPos: { x: 100, y: 0, z: 0 } })).block.state.name, 'minecraft:stone',
    'distance on another axis must not count');
  assert.equal(axisList.process(block('minecraft:stone'), context({ localPos: { x: 0, y: 9, z: 0 } })).block.state.name, 'minecraft:deepslate');
});

test('block entity modifiers append loot, merge static data, clear, or pass through', () => {
  const withLoot = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [{
        input_predicate: { predicate_type: 'always_true' }, location_predicate: { predicate_type: 'always_true' },
        output_state: 'minecraft:chest',
        block_entity_modifier: { type: 'minecraft:append_loot', loot_table: 'minecraft:chests/shipwreck_treasure' }
      }]
    }]
  });
  const looted = withLoot.process(block('minecraft:chest'), context()).block;
  assert.equal(looted.nbt.LootTable, 'minecraft:chests/shipwreck_treasure');
  // A seed per container, or every chest in the world would roll identical contents.
  assert.equal(typeof looted.nbt.LootTableSeed, 'bigint');

  const staticMerge = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [{ input_predicate: { predicate_type: 'always_true' }, location_predicate: { predicate_type: 'always_true' }, block_entity_modifier: { type: 'minecraft:append_static', data: { CustomName: '"x"' } } }]
    }]
  });
  assert.deepEqual(staticMerge.process({ state: parseBlockState('minecraft:chest'), nbt: { a: 1 } }, context()).block.nbt,
    { a: 1, CustomName: '"x"' });

  const cleared = createProcessorList({
    processors: [{
      processor_type: 'minecraft:rule',
      rules: [{ input_predicate: { predicate_type: 'always_true' }, location_predicate: { predicate_type: 'always_true' }, block_entity_modifier: { type: 'minecraft:clear' } }]
    }]
  });
  assert.equal(cleared.process({ state: parseBlockState('minecraft:chest'), nbt: { a: 1 } }, context()).block.nbt, null);
});

test('blackstone_replace maps the documented stone family and iron bars', () => {
  const processor = createProcessor({ processor_type: 'blackstone_replace' });
  const map = (state) => processor.apply(block(state), context()).state.name;
  assert.equal(map('minecraft:stone'), 'minecraft:blackstone');
  assert.equal(map('minecraft:stone_bricks'), 'minecraft:polished_blackstone_bricks');
  assert.equal(map('minecraft:stone_brick_stairs[facing=east]'), 'minecraft:polished_blackstone_brick_stairs');
  // Properties are copied, so a rotated stair stays rotated.
  assert.equal(map('minecraft:stone_stairs[facing=east,half=bottom]'), 'minecraft:blackstone_stairs');
  assert.equal(map('minecraft:iron_bars[north=true]'), 'minecraft:chain');
  // An unmapped block is untouched, and the processor says its table is not the published-complete one.
  assert.equal(map('minecraft:oak_planks'), 'minecraft:oak_planks');
  assert.match(processor.notes, /does not publish/);
});

test('capped applies its delegate to at most the limit', () => {
  const capped = createProcessorList({
    processors: [{
      processor_type: 'minecraft:capped',
      limit: 3,
      delegate: {
        processor_type: 'minecraft:rule',
        rules: [{ input_predicate: { predicate_type: 'always_true' }, location_predicate: { predicate_type: 'always_true' }, output_state: 'minecraft:gold_block' }]
      }
    }]
  });
  const shared = context();
  let changed = 0;
  for (let i = 0; i < 10; i++) {
    if (capped.process(block('minecraft:stone'), shared).block.state.name === 'minecraft:gold_block') changed++;
  }
  assert.equal(changed, 3, 'exactly the limit may be modified');
});

test('protected_blocks leaves a protected world block alone', () => {
  const processor = createProcessor({ processor_type: 'protected_blocks', blocks: ['minecraft:bedrock'] });
  const world = { getBlockState: (x, y, z) => (y === 64 ? 'minecraft:bedrock' : 'minecraft:stone') };
  assert.equal(processor.apply(block('minecraft:stone'), context({ world, pos: { x: 0, y: 64, z: 0 } })), null);
  assert.deepEqual(processor.apply(block('minecraft:stone'), context({ world, pos: { x: 0, y: 65, z: 0 } })).state.name, 'minecraft:stone');
  // Without a world query the processor cannot protect anything, and says so.
  assert.deepEqual(createProcessorList({ processors: [processor] }).unmetRequirements(null), ['protected_blocks:getBlockState']);
});

test('gravity needs a heightmap, and moves blocks to the terrain when given one', () => {
  const processor = createProcessor({ processor_type: 'gravity', offset: -1 });
  const noWorld = processor.apply(block('minecraft:dirt_path'), context());
  assert.equal(noWorld.state.name, 'minecraft:dirt_path', 'without a heightmap the block passes through');

  const world = { heightmap: () => 70 };
  const moved = processor.apply(block('minecraft:dirt_path'), context({ world, pos: { x: 4, y: 64, z: 9 } }));
  assert.equal(moved.moved, 5, 'the block moves from Y 64 to 70 - 1');
  assert.equal(moved.y, 69);
  assert.deepEqual(createProcessorList({ processors: [processor] }).unmetRequirements(null), ['gravity:heightmap']);
});

test('lava_submerged_block reports the queries it needs and passes through without them', () => {
  const processor = createProcessor({ processor_type: 'lava_submerged_block' });
  const list = createProcessorList({ processors: [processor] });
  assert.deepEqual(list.unmetRequirements(null), ['lava_submerged_block:getBlockState', 'lava_submerged_block:isFullShape']);
  const result = processor.apply(block('minecraft:oak_slab'), context());
  assert.equal(result.state.name, 'minecraft:oak_slab');

  const world = {
    getBlockState: () => 'minecraft:lava',
    isFullShape: (state) => state.name === 'minecraft:stone'
  };
  // An incomplete-shape block may not overwrite lava...
  assert.equal(processor.apply(block('minecraft:oak_slab'), context({ world })), null);
  // ...but a full block may.
  assert.equal(processor.apply(block('minecraft:stone'), context({ world })).state.name, 'minecraft:stone');
});

test('block_age publishes its approximation and ages stone and obsidian', () => {
  const processor = createProcessor({ processor_type: 'block_age', mossiness: 0.5 });
  assert.match(processor.notes, /approximation/);
  // A SHARED context, so the random source actually advances between draws; a fresh context per draw would
  // rebuild the same seed and every block would take the same branch.
  const shared = context();
  const outcomes = new Set();
  for (let i = 0; i < 500; i++) outcomes.add(processor.apply(block('minecraft:obsidian'), shared).state.name);
  assert.deepEqual([...outcomes].sort(), ['minecraft:crying_obsidian', 'minecraft:obsidian']);

  const stoneOutcomes = new Set();
  for (let i = 0; i < 500; i++) stoneOutcomes.add(processor.apply(block('minecraft:stone'), shared).state.name);
  for (const name of stoneOutcomes) {
    assert.ok(['minecraft:stone', 'minecraft:cracked_stone_bricks', 'minecraft:stone_brick_stairs',
      'minecraft:mossy_stone_bricks', 'minecraft:mossy_stone_brick_stairs'].includes(name), `unexpected ${name}`);
  }
  assert.ok(stoneOutcomes.size > 1, 'the 0.5 roll must produce both outcomes over 500 draws');
});

// ---------------------------------------------------------------------------------------------
// Placement pipeline
// ---------------------------------------------------------------------------------------------

/** Two-block template: a stair facing east, and a jigsaw that becomes stone. */
function pipelineTemplate() {
  return StructureTemplate.fromJson({
    size: [3, 1, 3],
    palette: [
      { Name: 'minecraft:oak_stairs', Properties: { facing: 'east', half: 'bottom', shape: 'straight', waterlogged: 'false' } },
      { Name: 'minecraft:jigsaw', Properties: { orientation: 'up_north' } }
    ],
    blocks: [
      { pos: [0, 0, 0], state: 0 },
      { pos: [2, 0, 2], state: 1, nbt: { final_state: 'minecraft:chiseled_stone_bricks' } }
    ]
  }, 'pipeline');
}

test('placement transforms positions and states, and turns the jigsaw into its final state', () => {
  const template = pipelineTemplate();
  const placement = placeTemplate({
    template,
    origin: { x: 100, y: 64, z: 200 },
    rotation: 1,
    random: new LegacyRandom(7),
    processors: { processors: [{ processor_type: 'minecraft:jigsaw_replacement' }] }
  });

  assert.equal(placement.blocks.length, 2);
  const stair = placement.blocks.find((entry) => entry.blockName === 'minecraft:oak_stairs');
  // east under a clockwise quarter turn becomes south, and (0,0) of a 3x3 grid becomes (2,0).
  assert.equal(stair.state.properties.facing, 'south');
  assert.deepEqual([stair.x, stair.y, stair.z], [102, 64, 200]);
  const replaced = placement.blocks.find((entry) => entry.blockName === 'minecraft:chiseled_stone_bricks');
  assert.ok(replaced, 'the jigsaw must become the block named by its final_state');
  assert.equal(replaced.nbt, null);
  // The stair `shape` property could not be rotated, and that is reported rather than hidden.
  assert.deepEqual(placement.unhandledProperties, ['shape']);
});

test('a terrain_matching piece gets gravity appended with vanilla offset -1', () => {
  const template = pipelineTemplate();
  const rigid = placeTemplate({ template, origin: { x: 0, y: 64, z: 0 }, random: new LegacyRandom(1) });
  assert.equal(rigid.processorTypes.includes('gravity'), false);
  assert.deepEqual(rigid.notes, []);

  const matching = placeTemplate({
    template,
    origin: { x: 0, y: 64, z: 0 },
    random: new LegacyRandom(1),
    projection: 'terrain_matching',
    world: { heightmap: () => 70 }
  });
  assert.ok(matching.processorTypes.includes('gravity'));
  assert.match(matching.notes.join(' '), /hardcodes this with offset -1/);
  assert.equal(TERRAIN_MATCHING_GRAVITY_OFFSET, -1);
  // The blocks really moved: 64 -> 70 - 1.
  assert.equal(Math.min(...matching.blocks.map((entry) => entry.y)), 69);
});

test('placement can be clipped to one chunk without changing anything else', () => {
  const template = pipelineTemplate();
  const whole = placeTemplate({ template, origin: { x: 0, y: 64, z: 0 }, random: new LegacyRandom(3) });
  assert.equal(whole.blocks.length, 2);
  // Chunk 1,1 covers blocks 16..31, so a template at the origin falls entirely outside it.
  const clipped = placeTemplate({ template, origin: { x: 0, y: 64, z: 0 }, random: new LegacyRandom(3), clip: { chunkX: 1, chunkZ: 1 } });
  assert.equal(clipped.blocks.length, 0, 'nothing may be written into a chunk the template does not touch');
});

test('placement refuses a non-deterministic random source', () => {
  const template = pipelineTemplate();
  assert.throws(() => placeTemplate({ template, origin: { x: 0, y: 0, z: 0 } }), /deterministic random/);
  assert.throws(() => placeTemplate({ template, origin: { x: 0, y: 0, z: 0 }, random: Math }), /deterministic random/);
});

test('describePlacement summarises what was placed and what was not', () => {
  const placement = placeTemplate({
    template: pipelineTemplate(),
    origin: { x: 0, y: 64, z: 0 },
    random: new LegacyRandom(5),
    processors: { processors: [{ processor_type: 'minecraft:block_rot', integrity: 0 }] }
  });
  const summary = describePlacement(placement);
  assert.equal(summary.blockCount, 0);
  assert.equal(summary.skipped, 2, 'an integrity of 0 drops everything, and the count is reported');
  assert.deepEqual(summary.bounds, [0, 64, 0, 2, 64, 2]);
  assert.deepEqual(summary.processorTypes, ['block_rot']);

  const intact = describePlacement(placeTemplate({ template: pipelineTemplate(), origin: { x: 0, y: 64, z: 0 }, random: new LegacyRandom(5) }));
  assert.equal(intact.blockCount, 2);
  assert.equal(intact.blockTypes.length, 2);
  assert.equal(intact.requirements.length, 0, 'no processor needs a world query here');
});
