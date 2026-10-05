// Bee nests and beehives, the only source of honeycomb.
//
// `honeycomb` is an ingredient in seventy-seven waxing recipes in `extraRecipes.js`, and this game already
// implements waxing -- `copperGolemBehavior` refuses to oxidise a waxed block. Nothing implemented the other
// end: a nest could be placed and never harvested, so no honeycomb existed, no copper could be waxed, and
// the Resource Inspector listed `honeycomb` with no source and `used as ingredient 195`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import {
  HiveManager, HONEY_LEVEL_MAX, HONEY_LEVEL_SECONDS, HONEYCOMB_PER_HARVEST,
  HIVE_WORK_RANGE, isHive, hiveHarvestFor,
} from '../src/hives.js';
import { registry } from '../src/resourceRegistry.js';
import { SMELTING_RECIPES } from '../src/furnace.js';
import { INTERACTION_SOURCES } from '../src/interactionSources.js';
import { codeDropSources } from '../src/codeDropSources.js';

/** A manager over a world holding one hive at (1, 2, 3), with a place to put the bees. */
function fixture({ blockId = BLOCKS.BEE_NEST, mobs = [] } = {}) {
  const game = {
    world: { getVoxel: () => blockId },
    mobs: { mobs },
    player: null,
  };
  return { manager: new HiveManager(game), game };
}

/** A bee homed to the hive, `distance` blocks away. */
function bee(hive, distance = 1) {
  return {
    isBee: true, health: 1,
    hive: { x: hive.x, y: hive.y, z: hive.z },
    mesh: { position: { x: hive.x + 0.5 + distance, y: hive.y + 0.5, z: hive.z + 0.5 } },
  };
}

function playerWith(id, { gamemode = 'survival', count = 1, durability } = {}) {
  const added = [];
  const item = { id, isBlock: false, count };
  if (durability !== undefined) item.durability = durability;
  return {
    added,
    player: {
      gamemode,
      inventory: {
        hotbar: [item],
        storage: [],
        activeSlot: 0,
        getActiveItem() { return this.hotbar[this.activeSlot]; },
        consumeActiveItem(n = 1) {
          const held = this.hotbar[this.activeSlot];
          if (!held) return;
          held.count -= n;
          if (held.count <= 0) this.hotbar[this.activeSlot] = null;
        },
        addItem(id2, isBlock, n) { added.push({ id: id2, isBlock, count: n }); return true; },
      },
    },
  };
}

// --- what can be harvested ------------------------------------------------------

test('only a nest or a hive is a hive, and only two things harvest one', () => {
  assert.equal(isHive(BLOCKS.BEE_NEST), true);
  assert.equal(isHive(BLOCKS.BEEHIVE), true);
  assert.equal(isHive(BLOCKS.HONEYCOMB_BLOCK), false);
  assert.equal(isHive(BLOCKS.STONE), false);

  assert.deepEqual(hiveHarvestFor('shears'), { id: 'honeycomb', isBlock: false, count: HONEYCOMB_PER_HARVEST, tool: 'shears' });
  assert.equal(HONEYCOMB_PER_HARVEST, 3, "vanilla's three");
  assert.deepEqual(hiveHarvestFor({ id: 'glass_bottle' }), { id: 'honey_bottle', isBlock: false, count: 1, tool: 'bottle' });
  assert.equal(hiveHarvestFor(null), null);
  assert.equal(hiveHarvestFor({ id: 'bucket' }), null);
  assert.equal(hiveHarvestFor('honeycomb'), null);
});

// --- filling --------------------------------------------------------------------

test('a hive fills only while bees are working it', () => {
  const { manager, game } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEE_NEST);
  assert.equal(manager.levelAt(1, 2, 3), 0, 'a placed hive starts empty');

  // Ten minutes with no bees at all: vanilla's rule is that the level does not move.
  manager.update(600);
  assert.equal(manager.levelAt(1, 2, 3), 0, 'no bees, no honey');

  game.mobs.mobs.push(bee({ x: 1, y: 2, z: 3 }));
  manager.update(HONEY_LEVEL_SECONDS);
  assert.equal(manager.levelAt(1, 2, 3), 1);
  manager.update(HONEY_LEVEL_SECONDS * 2);
  assert.equal(manager.levelAt(1, 2, 3), 3);
  // And it stops at the top rather than running away.
  manager.update(HONEY_LEVEL_SECONDS * 10);
  assert.equal(manager.levelAt(1, 2, 3), HONEY_LEVEL_MAX);
});

test('a bee that is homed elsewhere, or too far away, does not fill this hive', () => {
  const hive = { x: 1, y: 2, z: 3 };
  // Homed to another hive.
  const elsewhere = fixture({ mobs: [bee({ x: 9, y: 9, z: 9 })] });
  elsewhere.manager.onBlockPlaced(1, 2, 3, BLOCKS.BEEHIVE);
  elsewhere.manager.update(HONEY_LEVEL_SECONDS * 3);
  assert.equal(elsewhere.manager.levelAt(1, 2, 3), 0, 'another hive is another hive');

  // Homed correctly but off foraging, past the working range.
  const far = fixture({ mobs: [bee(hive, HIVE_WORK_RANGE + 5)] });
  far.manager.onBlockPlaced(1, 2, 3, BLOCKS.BEEHIVE);
  far.manager.update(HONEY_LEVEL_SECONDS * 3);
  assert.equal(far.manager.levelAt(1, 2, 3), 0, 'a bee out foraging is not at the hive');

  // And a dead bee counts for nothing.
  const dead = fixture({ mobs: [{ ...bee(hive), health: 0 }] });
  dead.manager.onBlockPlaced(1, 2, 3, BLOCKS.BEEHIVE);
  dead.manager.update(HONEY_LEVEL_SECONDS * 3);
  assert.equal(dead.manager.levelAt(1, 2, 3), 0);
});

test('breaking a hive forgets it', () => {
  const { manager } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEE_NEST);
  assert.equal(manager.levelAt(1, 2, 3), 0);
  assert.equal(manager.onBlockBroken(1, 2, 3), true);
  assert.equal(manager.levelAt(1, 2, 3), null);
});

// --- harvesting -----------------------------------------------------------------

test('an unripe hive refuses, and says how far along it is', () => {
  const { manager } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEE_NEST);
  const { player, added } = playerWith('shears');
  const outcome = manager.harvest(1, 2, 3, player);
  assert.equal(outcome.ok, false);
  assert.match(outcome.reason, new RegExp(`0/${HONEY_LEVEL_MAX}`), 'the reason should name the level');
  assert.deepEqual(added, [], 'and nothing is given');
  assert.equal(manager.levelAt(1, 2, 3), 0, 'and the level is untouched');
});

test('shearing a full hive gives three honeycomb and empties it', () => {
  const { manager, game } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEEHIVE);
  game.mobs.mobs.push(bee({ x: 1, y: 2, z: 3 }));
  manager.update(HONEY_LEVEL_SECONDS * HONEY_LEVEL_MAX);
  assert.equal(manager.levelAt(1, 2, 3), HONEY_LEVEL_MAX, 'full');

  const { player, added } = playerWith('shears', { durability: 10 });
  const outcome = manager.harvest(1, 2, 3, player);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.deepEqual(added.map((a) => [a.id, a.count]), [['honeycomb', 3]]);
  assert.equal(manager.levelAt(1, 2, 3), 0, 'and it starts again');
  assert.equal(player.inventory.hotbar[0].durability, 9, 'the shears wear, as they do on a sheep');
});

test('a bottle gives a honey bottle and leaves the shears alone', () => {
  const { manager, game } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEE_NEST);
  game.mobs.mobs.push(bee({ x: 1, y: 2, z: 3 }));
  manager.update(HONEY_LEVEL_SECONDS * HONEY_LEVEL_MAX);

  const { player, added } = playerWith('glass_bottle', { count: 4 });
  const outcome = manager.harvest(1, 2, 3, player);
  assert.equal(outcome.ok, true, outcome.reason);
  assert.deepEqual(added.map((a) => [a.id, a.count]), [['honey_bottle', 1]]);
  assert.equal(player.inventory.hotbar[0].count, 3, 'one bottle out of the stack');
  assert.equal(manager.levelAt(1, 2, 3), 0);
});

test('an empty hand harvests nothing, and neither does something that is not a hive', () => {
  const { manager, game } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEE_NEST);
  game.mobs.mobs.push(bee({ x: 1, y: 2, z: 3 }));
  manager.update(HONEY_LEVEL_SECONDS * HONEY_LEVEL_MAX);
  const { player, added } = playerWith('bucket');
  const wrongTool = manager.harvest(1, 2, 3, player);
  assert.equal(wrongTool.ok, false);
  assert.match(wrongTool.reason, /shears/i);
  assert.deepEqual(added, []);
  assert.equal(manager.levelAt(1, 2, 3), HONEY_LEVEL_MAX, 'and a refusal does not waste the honey');

  // A block that is not a hive at all.
  const notAHive = fixture({ blockId: BLOCKS.STONE });
  notAHive.manager.onBlockPlaced(1, 2, 3, BLOCKS.STONE);
  const { player: p2 } = playerWith('shears');
  assert.equal(notAHive.manager.harvest(1, 2, 3, p2).ok, false);
});

test('creative keeps the tool and still gets the honeycomb', () => {
  const { manager, game } = fixture();
  manager.onBlockPlaced(1, 2, 3, BLOCKS.BEEHIVE);
  game.mobs.mobs.push(bee({ x: 1, y: 2, z: 3 }));
  manager.update(HONEY_LEVEL_SECONDS * HONEY_LEVEL_MAX);
  const { player, added } = playerWith('shears', { gamemode: 'creative', durability: 5 });
  assert.equal(manager.harvest(1, 2, 3, player).ok, true);
  assert.equal(player.inventory.hotbar[0].durability, 5, 'the shears are not worn in creative');
  assert.deepEqual(added.map((a) => a.id), ['honeycomb']);
});

// --- what it unblocks -----------------------------------------------------------

test('the Inspector can see honeycomb, and copper can be waxed again', () => {
  const sources = [...INTERACTION_SOURCES, ...codeDropSources()];
  const reg = registry({ fresh: true, smelting: SMELTING_RECIPES, interactions: sources });
  const entry = reg.entries.get('honeycomb');
  assert.ok(entry, 'honeycomb should be registered');
  assert.equal(entry.codeFrom.length, 1, 'with the hive as its source');
  assert.match(entry.codeFrom[0].source, /hives\.js HiveManager\.harvest/);
  // It is an ingredient in a lot of recipes, which is why this mattered.
  assert.ok(entry.recipesAsIngredient.length > 50, `expected many waxing recipes, found ${entry.recipesAsIngredient.length}`);
  // A honey bottle is deliberately NOT in the table: it is already craftable from a honey block.
  const honeyBottle = reg.entries.get('honey_bottle');
  assert.equal(honeyBottle.codeFrom.length, 0, 'a craftable item must not claim a coded source');
  assert.ok(honeyBottle.recipesAsResult.length > 0, 'because it has a recipe');
  assert.ok(ITEMS.honeycomb, 'and the item is real');
});
