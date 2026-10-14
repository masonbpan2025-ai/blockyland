// Round 4 of the wiki parity work: the 31 Java commands that had no system, Adventure and Spectator modes, the
// post-1.21.4 content src/futureContent.js registers (its stats, recipes, shapes, drops and door states, now from
// the wiki data), furnace experience, chicken jockeys and the music discs. Each rule quotes its wiki page in the
// module that implements it; these tests drive the modules directly or through the command dispatcher.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand, buildCommandContext } from '../src/commandRunner.js';
import { getCommandState, tickCommandState, blocksOutsideBorder } from '../src/commandState.js';
import { selectTargets, parseRange } from '../src/targetSelectors.js';
import { parseSnbt, toSnbt, getPath } from '../src/snbt.js';
import { attributeValue, applyItemModifier } from '../src/advancedCommands.js';
import { modeRules, resolveGameMode, takesDamage, playerAsSeenByWorld } from '../src/gameModeRules.js';
import { BLOCKS, BLOCK_DEFS, ITEMS, stackLimitFor } from '../src/blocks.js';
import { maxDurabilityFor } from '../src/durability.js';
import { harvestDataFor } from '../src/blockHarvestData.js';
import { harvestDrops, BONUS_DROPS } from '../src/blockDrops.js';
import { recordSmelt, takeExperience, dropAllExperience, roundExperience } from '../src/furnaceExperience.js';
import { getSmeltingXp } from '../src/furnace.js';
import { applyNaturalZombieSpawn, lavaChickenDrop, tearsDrop, jockeyRoll } from '../src/chickenJockey.js';
import { DISC_SOURCES_ELSEWHERE } from '../src/musicDiscs.js';
import { cellForName } from '../src/wikiNames.js';
import { searchResources, registry } from '../src/resourceRegistry.js';
import { RECIPES_3X3, findMatchingRecipe } from '../src/crafting.js';

// --- a game stub the dispatcher can run against -------------------------------------------------------------------

function stubGame({ functions = {} } = {}) {
  const chat = [];
  const voxels = new Map();
  const zombie = { type: 'zombie', health: 20, maxHealth: 20, speed: 1, mesh: { position: { x: 3, y: 64, z: 0 }, scale: { setScalar() {} } } };
  const game = {
    chat, voxels, zombie, worldTime: 0, seed: 5, gamerules: {},
    settings: { gameMode: 'creative', cheats: true },
    ui: { addChatMessage: (t, k) => chat.push({ t, k }), updateHotbar() {}, renderCommandHud(m) { game.hud = m; } },
    player: { gamemode: 'creative', name: 'Player', position: { x: 0, y: 64, z: 0 }, health: 20, maxHealth: 20, statusEffects: new Map(), takeDamage(n) { game.damaged = (game.damaged ?? 0) + n; } },
    inventory: { hotbar: Array(9).fill(null), storage: Array(27).fill(null), armor: { head: null }, activeSlot: 0, getActiveItem() { return this.hotbar[0]; }, addItem(id, isBlock, count) { const i = this.hotbar.findIndex((s) => !s); this.hotbar[i] = { id, isBlock, count }; return true; } },
    mobs: { mobs: [zombie], spawnMob(t, x, y, z) { const m = { type: t, health: 10, mesh: { position: { x, y, z } } }; this.mobs.push(m); return m; }, getMobDeathDrops: () => [['rotten_flesh', false, 2, 2]] },
    world: { getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? 0, setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id), getBiome: (x, z) => game.world.biomeOverrides?.get(`${x},${z}`) ?? 'plains', getChunk: () => ({}) },
    dataPacks: { packs: new Map([['p', { name: 'p', enabled: true, files: Object.fromEntries(Object.entries(functions).map(([k, v]) => [`data/t/function/${k}.mcfunction`, v])) }]]), order: ['p'] },
  };
  return game;
}
const run = (game, line) => runCommand(buildCommandContext(game), line);
const said = (game) => game.chat[game.chat.length - 1]?.t;

// --- the commands -------------------------------------------------------------------------------------------------

test('/scoreboard: objectives, scores, operations, the sidebar; /trigger once per enable', () => {
  const g = stubGame();
  run(g, '/scoreboard objectives add points dummy');
  assert.equal(said(g), 'Created new objective [points]');
  run(g, '/scoreboard players set @s points 3');
  run(g, '/scoreboard players add Player points 2');
  run(g, '/scoreboard players get @s points');
  assert.equal(said(g), 'Player has 5 [points]');
  run(g, '/scoreboard objectives add other dummy');
  run(g, '/scoreboard players set @s other 4');
  run(g, '/scoreboard players operation @s points *= @s other');
  run(g, '/scoreboard players get @s points');
  assert.equal(said(g), 'Player has 20 [points]');
  run(g, '/scoreboard objectives setdisplay sidebar points');
  assert.deepEqual(g.hud.sidebar.rows, [{ name: 'Player', score: 20 }]);
  run(g, '/scoreboard objectives add vote trigger');
  run(g, '/trigger vote');
  assert.match(said(g), /cannot trigger this objective yet/);
  run(g, '/scoreboard players enable @s vote');
  run(g, '/trigger vote set 3');
  assert.equal(said(g), 'Triggered [vote] (set value to 3)');
  run(g, '/trigger vote');
  assert.match(said(g), /cannot trigger/, 'once per enable');
});

test('/tag, /team and /teammsg; selectors read tags, types and limits', () => {
  const g = stubGame();
  run(g, '/tag @e[type=zombie] add boss');
  assert.equal(g.zombie.tags.has('boss'), true);
  const ctx = buildCommandContext(g);
  assert.deepEqual(selectTargets(ctx, '@e[tag=boss]').entities, [g.zombie]);
  assert.equal(selectTargets(ctx, '@e[type=!zombie]').entities.length, 1, 'the player');
  assert.equal(selectTargets(ctx, '@e[limit=1,sort=furthest]').entities[0], g.zombie);
  assert.deepEqual(parseRange('..5'), [-Infinity, 5]);
  run(g, '/team add red');
  run(g, '/team join red @s');
  run(g, '/team modify red color red');
  run(g, '/teammsg hello');
  assert.equal(said(g), '-> [red] <Player> hello');
  run(g, '/team modify red color pinkish');
  assert.equal(g.chat.at(-1).k, 'error');
});

test('/execute: as, at, conditions, store; functions with /return, scheduled by game ticks', () => {
  const g = stubGame({ functions: { hello: 'say hi\nscoreboard players add @s points 5\nreturn 7\nsay never' } });
  run(g, '/scoreboard objectives add points dummy');
  run(g, '/tag @e[type=zombie] add boss');
  run(g, '/execute if entity @e[tag=boss]');
  assert.equal(said(g), 'Test passed');
  run(g, '/execute as @e[type=zombie] at @s run summon zombie');
  run(g, '/execute store result score @s points run function t:hello');
  run(g, '/scoreboard players get @s points');
  assert.equal(said(g), 'Player has 7 [points]', 'the function added 5, then /return 7 was stored');
  assert.equal(g.chat.some((c) => c.t === '[Player] never'), false, '/return stops the function');
  run(g, '/execute unless score @s points matches 10..');
  assert.equal(said(g), 'Test passed');
  run(g, '/schedule function t:hello 2t');
  const state = getCommandState(g);
  tickCommandState(state, 0.05, { runFunction: () => { g.ran = (g.ran ?? 0) + 1; } });
  tickCommandState(state, 0.05, { runFunction: () => { g.ran = (g.ran ?? 0) + 1; } });
  assert.equal(g.ran, 1, 'two ticks later');
});

test('/data, /attribute and /item: entity data, storage, attribute modifiers, slots', () => {
  const g = stubGame();
  run(g, '/data get entity @s Health');
  assert.equal(said(g), 'Player has the following entity data: 20');
  run(g, '/data merge storage t:s {a: 1b, b: [1, 2], name: "x y"}');
  run(g, '/data get storage t:s b');
  assert.equal(said(g), 'Storage minecraft:t:s has the following contents: [1, 2]'.replace('minecraft:t:s', 't:s'));
  run(g, '/data merge entity @e[type=zombie,limit=1] {CustomName: \'"Bob"\', Health: 5}');
  assert.equal(g.zombie.customName, 'Bob'); assert.equal(g.zombie.health, 5);
  run(g, '/attribute @s max_health base set 40');
  assert.equal(g.player.maxHealth, 40);
  run(g, '/attribute @s movement_speed modifier add t:fast 0.5 add_multiplied_base');
  assert.ok(Math.abs(attributeValue(g.player, 'movement_speed') - 0.15) < 1e-9);
  assert.ok(Math.abs(g.player.speedAttributeScale - 1.5) < 1e-9);
  run(g, '/item replace entity @s weapon.mainhand with diamond_sword');
  assert.equal(g.inventory.hotbar[0].id, 'diamond_sword');
  assert.deepEqual(applyItemModifier({ id: 'x', count: 1 }, [{ function: 'minecraft:set_count', count: 4 }]).count, 4);
  assert.deepEqual(parseSnbt('{a: 1b, b: [1, 2], c: {d: "e"}}'), { a: 1, b: [1, 2], c: { d: 'e' } });
  assert.equal(getPath({ Inventory: [{ id: 'x' }] }, 'Inventory[0].id'), 'x');
  assert.equal(toSnbt({ a: [1, 2] }), '{a: [1, 2]}');
});

test('/bossbar, /worldborder, /tick, /forceload, /fillbiome', () => {
  const g = stubGame();
  run(g, '/bossbar add t:b "Boss"');
  run(g, '/bossbar set t:b players @s');
  run(g, '/bossbar set t:b value 50');
  run(g, '/bossbar set t:b color pink');
  assert.deepEqual(g.hud.bars, [{ id: 't:b', name: 'Boss', color: 'pink', style: 'progress', fraction: 0.5 }]);
  run(g, '/worldborder set 100');
  run(g, '/worldborder get');
  assert.equal(said(g), 'The world border is currently 100 block(s) wide');
  const state = getCommandState(g);
  assert.equal(blocksOutsideBorder(state, 60, 0), 10);
  // "0.2 damage per second per block" past the 5-block buffer: 5 blocks past it is 1 per second.
  tickCommandState(state, 1, { player: { position: { x: 60, y: 64, z: 0 }, takeDamage: (n) => { g.border = n; } } });
  assert.ok(Math.abs(g.border - 1) < 1e-9);
  run(g, '/tick rate 0.5');
  assert.equal(g.chat.at(-1).k, 'error', 'the rate is 1.0 to 10000');
  run(g, '/tick rate 40');
  assert.equal(tickCommandState(state, 0.05).scale, 2);
  run(g, '/tick freeze');
  assert.equal(tickCommandState(state, 0.05).ticks, 0);
  run(g, '/forceload add 0 0 20 20');
  assert.equal(state.forced.size, 4);
  run(g, '/fillbiome 0 60 0 3 60 3 desert');
  assert.equal(g.world.getBiome(2, 2), 'desert');
});

test('/loot, /particle, /playsound, /recipe, /advancement, /spectate, /kick, /debug, /datapack', () => {
  const g = stubGame();
  run(g, '/loot give @s kill @e[type=zombie,limit=1]');
  assert.equal(said(g), 'Dropped 2 item(s)');
  run(g, '/particle flame ~ ~ ~'); assert.equal(said(g), 'Displaying particle flame');
  run(g, '/particle not_a_particle'); assert.equal(g.chat.at(-1).k, 'error');
  run(g, '/playsound minecraft:entity.player.levelup master @s'); assert.match(said(g), /^Played sound/);
  g.recipeIds = () => new Set(['minecraft:stick']);
  run(g, '/recipe give @s *'); assert.equal(said(g), 'Unlocked 1 recipe(s) for Player');
  run(g, '/advancement grant @s until minecraft:story/smelt_iron');
  assert.deepEqual([...g.player.advancements].sort(), ['story/mine_stone', 'story/root', 'story/smelt_iron', 'story/upgrade_tools']);
  run(g, '/spectate @e[type=zombie,limit=1]'); assert.equal(said(g), 'Player is not in spectator mode');
  g.player.gamemode = 'spectator';
  run(g, '/spectate @e[type=zombie,limit=1]'); assert.equal(g.player.spectating, g.zombie);
  run(g, '/kick @s'); assert.equal(said(g), 'Cannot kick an owner of singleplayer game');
  run(g, '/debug start'); run(g, '/debug stop'); assert.match(said(g), /^Stopped tick profiling/);
  run(g, '/datapack disable p'); assert.equal(g.dataPacks.packs.get('p').enabled, false);
});

// --- game modes ---------------------------------------------------------------------------------------------------

test('Adventure and Spectator: what each may do', () => {
  assert.equal(resolveGameMode('2'), 'adventure'); assert.equal(resolveGameMode('sp'), 'spectator');
  assert.equal(modeRules('adventure').breakBlocks, false); assert.equal(modeRules('adventure').placeBlocks, false);
  assert.equal(modeRules('adventure').interact, true); assert.equal(modeRules('adventure').attack, true);
  assert.equal(modeRules('spectator').interact, false); assert.equal(modeRules('spectator').noclip, true);
  assert.equal(takesDamage('spectator', 'generic'), false); assert.equal(takesDamage('spectator', 'void'), true);
  assert.equal(takesDamage('adventure'), true);
  const player = { gamemode: 'spectator', position: { x: 1, y: 70, z: 2 } };
  const seen = playerAsSeenByWorld(player);
  assert.ok(seen.position.y < -1000, 'mobs do not notice a spectator'); assert.equal(seen.takeDamage(5), 0);
  assert.equal(playerAsSeenByWorld({ gamemode: 'survival', position: {} }).gamemode, 'survival');
});

// --- the future content, from the wiki data -----------------------------------------------------------------------

test('post-1.21.4 items and blocks carry the wiki\'s numbers', () => {
  assert.equal(maxDurabilityFor('copper_sword'), 190); assert.equal(ITEMS.copper_sword.attack, 5);
  assert.equal(ITEMS.copper_helmet.armor, 2); assert.equal(ITEMS.copper_helmet.armorSlot, 'head');
  assert.equal(ITEMS.copper_pickaxe.speed, 5, 'Tiers: copper mining efficiency 5');
  assert.equal(stackLimitFor('blue_egg'), 16); assert.equal(stackLimitFor('poplar_sign'), 16);
  const bars = cellForName('Copper Bars').id;
  assert.equal(harvestDataFor(bars).hardness, 5); assert.equal(BLOCK_DEFS[bars].pane, true);
  const bush = cellForName('Bush').id;
  assert.deepEqual(harvestDrops(bush, {}), [], 'a bush drops nothing by hand');
  assert.equal(harvestDrops(bush, { toolId: 'shears' })[0].id, bush, 'shears collect it');
  assert.ok(BONUS_DROPS.orange_poplar_leaves.some(([id]) => id === 'poplar_sapling'));
  assert.equal(BLOCK_DEFS[BLOCKS.POPLAR_DOOR].openId, BLOCKS.POPLAR_DOOR_OPEN);
  assert.equal(BLOCK_DEFS[BLOCKS.POPLAR_TRAPDOOR].trapdoor, true);
  const chest = findMatchingRecipe(Array(9).fill(null).map((_, i) => (i === 4 ? null : { id: cellForName('Poplar Planks').id, isBlock: true, count: 1 })), 3, 3, RECIPES_3X3);
  assert.equal(chest?.id, BLOCKS.CHEST, 'poplar planks make a chest');
});

test('furnace experience: banked per item, paid when taken, fractions as a chance', () => {
  assert.equal(getSmeltingXp({ id: 'copper_nugget' }, 'copper_horse_armor'), 0.1);
  assert.equal(getSmeltingXp({ id: 'copper_nugget' }, 'copper_axe'), 0);
  const furnace = {};
  recordSmelt(furnace, 0.7); recordSmelt(furnace, 0.7); recordSmelt(furnace, 0.7);
  // 2 x 0.7 = 1.4: one point, and a 40% chance of a second.
  assert.equal(takeExperience(furnace, 2, () => 0.5), 1);
  assert.equal(takeExperience({ xpQueue: [{ items: 2, xp: 0.7 }] }, 2, () => 0.3), 2);
  assert.equal(dropAllExperience(furnace, () => 0.99), 0, 'the one left was worth 0.7');
  assert.equal(roundExperience(3, () => 0), 3);
});

test('chicken jockeys, and the Lava Chicken and Tears discs', () => {
  const baby = applyNaturalZombieSpawn({ type: 'zombie', mesh: { position: { x: 0, y: 0, z: 0 }, scale: { setScalar() {} } }, width: 0.6, height: 1.95, speed: 1 },
    { chickens: [], spawnChicken: () => ({ type: 'chicken', health: 4 }), random: () => 0.01 });
  assert.equal(baby.isBaby, true); assert.equal(baby.vehicle.type, 'chicken'); assert.equal(baby.vehicle.isJockey, true);
  baby.playerDamaged = true;
  assert.deepEqual(lavaChickenDrop(baby), [['music_disc_lava_chicken', false, 1, 1]]);
  baby.vehicle.health = 0;
  assert.deepEqual(lavaChickenDrop(baby), [], 'not once the chicken is dead');
  assert.equal(jockeyRoll(false, () => 0.04), 'new'); assert.equal(jockeyRoll(false, () => 0.5), null);
  assert.deepEqual(tearsDrop({ type: 'ghast', killedByDeflectedFireball: true }), [['music_disc_tears', false, 1, 1]]);
  for (const id of ['music_disc_tears', 'music_disc_lava_chicken', 'music_disc_bounce']) assert.equal(typeof DISC_SOURCES_ELSEWHERE[id], 'string');
});

test('the Inspector lists every resource: potions, shelves, buttons, plates', () => {
  const items = searchResources('', { kind: 'item', limit: Infinity, reg: registry() }).map((e) => e.key);
  assert.ok(items.includes('potion_of_turtle_master'));
  const blocks = searchResources('', { kind: 'block', limit: Infinity, reg: registry(), placeable: true }).map((e) => e.key);
  for (const key of ['oak_button', 'oak_pressure_plate', 'oak_shelf']) assert.ok(blocks.includes(key), key);
});
