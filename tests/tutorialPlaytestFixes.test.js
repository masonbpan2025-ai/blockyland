// Defects found by the independent wiki-tutorial play-test (e2e/tutorialPlaytest.pw.js, docs/wiki-tutorials-bot-testing-plan.md
// section 8), each pinned here at the unit level so it cannot come back unseen. Every assertion quotes the wiki.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attackSpeedFor, attackCharge, cooldownSeconds, scaleBaseDamage, scaleEnchantDamage, HAND_ATTACK_SPEED } from '../src/attackCooldown.js';
import { createHungerState, tickHunger, addExhaustion, EXHAUSTION, EXHAUSTION_THRESHOLD } from '../src/hunger.js';
import { Player } from '../src/player.js';
import { facingLabel } from '../src/ui.js';

// Tutorial:Your first 10 minutes -- "axes deal more damage than swords but have lower DPS (damage per second)".
test('attack cooldown: an axe hits harder than a sword but deals less damage per second', () => {
  assert.equal(attackSpeedFor('stone_sword'), 1.6);
  assert.equal(attackSpeedFor('stone_axe'), 0.8);
  assert.equal(attackSpeedFor(null), HAND_ATTACK_SPEED);
  const sword = 5, axe = 9;
  assert.ok(axe > sword, 'the axe hit is bigger');
  // Fully charged every swing: damage x attack speed.
  assert.ok(sword * 1.6 > axe * 0.8, `sword ${sword * 1.6} DPS > axe ${axe * 0.8} DPS`);
  // Swinging the axe as fast as the sword (every 0.625 s) leaves it at half charge, under its sword-rate DPS.
  const half = attackCharge(0.625, 'stone_axe');
  assert.ok(Math.abs(half - (12.5 + 0.5) / 25) < 1e-9);
  assert.ok(scaleBaseDamage(axe, half) / 0.625 < sword / 0.625, 'spam-clicking the axe does not beat the sword');
});

// Damage: "The damage multiplier is then 0.2 + ((t + 0.5) / T) ^ 2 * 0.8, restricted to the range 0.2 - 1".
test('attack cooldown: the wiki formula, clamped, with enchantments scaled linearly', () => {
  assert.equal(cooldownSeconds('stone_sword'), 0.625);
  assert.equal(attackCharge(0, 'stone_sword'), 0.5 / 12.5);
  assert.equal(attackCharge(10, 'stone_sword'), 1);
  assert.ok(Math.abs(scaleBaseDamage(10, 0) - 2) < 1e-9, 'never below 0.2');
  assert.equal(scaleBaseDamage(10, 1), 10);
  assert.equal(scaleEnchantDamage(4, 0.5), 2, '"the multiplier is not squared"');
});

test('attack cooldown: the game and the bot use it', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const charge = attackCharge\(this\.player\.secondsSinceSwing \?\? Infinity/);
  assert.match(main, /damage = scaleBaseDamage\(damage, charge\) \* \(critical \? 1\.5 : 1\) \+ scaleEnchantDamage\(enchantDamage, charge\);/);
  assert.match(main, /this\.player\.secondsSinceSwing = 0;/);
  const bot = readFileSync(new URL('../src/playerBot.js', import.meta.url), 'utf8');
  assert.match(bot, /t\.attackTimer = cooldownSeconds\(/, 'the bot waits for a full charge');
});

test('attack cooldown: switching the held item restarts the charge', () => {
  const p = Object.create(Player.prototype);
  let held = { id: 'stone_sword' };
  Object.assign(p, { game: { inventory: { getActiveItem: () => held } }, health: 20, isDead: false });
  // Only the cooldown lines of update() are exercised here; run them through a minimal stand-in of update's start.
  const tick = (dt) => {
    p.secondsSinceSwing = (p.secondsSinceSwing ?? Infinity) + dt;
    const key = held ? `${held.id}` : '';
    if (p.lastHeldKey !== undefined && key !== p.lastHeldKey) p.secondsSinceSwing = 0;
    p.lastHeldKey = key;
  };
  tick(1); tick(1);
  assert.equal(p.secondsSinceSwing, Infinity);
  held = { id: 'stone_axe' }; tick(0.05);
  assert.equal(p.secondsSinceSwing, 0, '"ticks since the last attack or item switch"');
  const src = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(src, /if \(this\.lastHeldKey !== undefined && heldKey !== this\.lastHeldKey\) this\.secondsSinceSwing = 0;/);
});

// Food: "Once the exhaustion level reaches 4.0, it resets to 0.0 and reduces the saturation by 1".
test('hunger: one exhaustion payout costs one saturation point', () => {
  const s = createHungerState({ hunger: 20, saturation: 5 });
  addExhaustion(s, EXHAUSTION_THRESHOLD);
  assert.equal(s.saturation, 4);
});

// Food: natural regeneration costs 6.0 exhaustion per HP: "Saturation boost heals 1 HP by consuming 1.5 saturation".
test('hunger: regeneration costs 6 exhaustion per HP at full hunger and at 18-19', () => {
  for (const [hunger, saturation, seconds] of [[20, 20, 0.5], [19, 0, 4]]) {
    const s = createHungerState({ hunger, saturation });
    const { heal } = tickHunger(s, seconds, { health: 10 });
    const spent = (saturation - s.saturation) * 4 + (hunger - s.hunger) * 4 + s.exhaustion;
    assert.ok(heal === 1 && Math.abs(spent / heal - EXHAUSTION.regen) < 1e-9, `hunger ${hunger}`);
  }
});

// Food: "On Hard difficulty, starvation damage does not stop at any health threshold".
test('hunger: starvation kills on Hard', () => {
  const p = Object.create(Player.prototype);
  Object.assign(p, { game: { difficulty: 'hard' }, health: 0.02, maxHealth: 20, hunger: 0, saturation: 0, exhaustion: 0 });
  for (let i = 0; i < 100; i++) p.updateHungerModel(0.1);
  assert.equal(p.health, 0);
  const normal = Object.create(Player.prototype);
  Object.assign(normal, { game: { difficulty: 'normal' }, health: 3, maxHealth: 20, hunger: 0, saturation: 0, exhaustion: 0 });
  for (let i = 0; i < 400; i++) normal.updateHungerModel(0.1);
  assert.equal(normal.health, 1, '"On Normal difficulty, starvation damage stops when the player\'s health is at 1"');
});

// Your first 10 minutes: "you are always facing north at the start of the game" -- and the debug screen said south.
test('the debug screen names the direction the camera looks', () => {
  assert.equal(facingLabel(0), 'north (-Z)');
  assert.equal(facingLabel(Math.PI / 2), 'west (-X)');
  assert.equal(facingLabel(Math.PI), 'south (+Z)');
  assert.equal(facingLabel(-Math.PI / 2), 'east (+X)');
});

// A dispenser shearing a sheep imported a function sheepBehavior.js does not have, which stopped the game loading.
test('the dispenser shears through the sheep module\'s real wool function', async () => {
  const src = readFileSync(new URL('../src/redstone.js', import.meta.url), 'utf8');
  assert.match(src, /import \{sheepApplyWool as updateSheepWool,rollSheepWoolCount\} from '\.\/sheepBehavior\.js';/);
  await import('../src/redstone.js');
});

// The bot's `place` wrote the block straight into the world when its aim had not lined up after 1 s -- seeds became a
// crop on bare grass, doors and beds skipped their placement rules -- so "placed" did not mean a player could place it.
test('the bot places only through the game\'s right-click: no crop on bare grass', async () => {
  const { createTutorialFixture } = await import('./tutorials/harness.js');
  const { BLOCKS } = await import('../src/blocks.js');
  const f = createTutorialFixture({ playerPos: [0.5, 1, 0.5] });
  f.world.setVoxel(2, 0, 0, BLOCKS.GRASS);
  f.inventory.addItem('wheat_seeds', false, 4);
  const r = await f.runCommand('plant wheat_seeds at 2 1 0');
  assert.equal(r.ok, false, `refused: ${r.message}`);
  assert.equal(f.world.getVoxel(2, 1, 0), BLOCKS.AIR, 'no wheat appears on grass');
  assert.equal(f.bot.itemCount('wheat_seeds'), 4, 'and no seed is spent');
  // On farmland the same command plants through the game.
  f.world.setVoxel(2, 0, 0, BLOCKS.FARMLAND);
  const ok = await f.runCommand('plant wheat_seeds at 2 1 0');
  assert.equal(ok.ok, true, ok.message);
  assert.equal(f.bot.itemCount('wheat_seeds'), 3);
});

test('when no supporting face is visible, the bot steps to a spot that has one', () => {
  const src = readFileSync(new URL('../src/playerBotSurvival.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!matched && \(typeof this\.game\.handleRightClick === 'function'/, 'no direct write when the game can place');
  assert.match(src, /const spot = this\.vantagePoint\(x, y, z, t\.faces\);/);
  const bot = readFileSync(new URL('../src/playerBot.js', import.meta.url), 'utf8');
  assert.match(bot, /if \(SURVIVAL_ACTIONS\.includes\(t\.command\.type\) && !t\.survivalWalk\)/);
});

// Food: "food cannot be eaten while already at full hunger, with the exception of chorus fruit, golden apples,
// enchanted golden apples, honey bottles, and suspicious stew." The game let anything be eaten whenever health was low.
test('eating is gated by hunger alone, with the wiki\'s five exceptions', async () => {
  const { canEat, ALWAYS_EDIBLE } = await import('../src/hunger.js');
  assert.deepEqual([...ALWAYS_EDIBLE].sort(), ['chorus_fruit', 'enchanted_golden_apple', 'golden_apple', 'honey_bottle', 'suspicious_stew']);
  assert.equal(canEat('cooked_beef', 20), false, 'not at full hunger, however hurt');
  assert.equal(canEat('cooked_beef', 19), true);
  assert.equal(canEat('honey_bottle', 20), true);
  assert.equal(canEat('cooked_beef', 20, { creative: true }), true);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(canEat\(activeItem\.id, this\.player\.hunger/);
  assert.doesNotMatch(main, /this\.player\.hunger < this\.player\.maxHunger \|\| this\.player\.health < this\.player\.maxHealth/);
});

// Milk Bucket: "Drinking it immediately removes all status effects from the player and returns an empty bucket."
test('milk clears every effect and gives the bucket back', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const at = main.indexOf("bucketItem.id === 'milk_bucket'");
  const body = main.slice(at, main.indexOf('return;', at));
  assert.match(body, /this\.inventory\.addItem\('bucket', false, 1\)/, 'id, isBlock, count -- not (bucket, 1, false)');
  assert.match(body, /for \(const effect of \[\.\.\.\(this\.player\.statusEffects\?\.keys\?\.\(\) \?\? \[\]\)\]\) this\.player\.clearStatusEffect\?\.\(effect\);/);
  assert.doesNotMatch(body, /clearStatusEffect\?\.\('poison'\)/, 'not a fixed list of six');
});

// Food: "Attacking an enemy" costs 0.1 exhaustion. The charge sat in the Player constructor (an edit had dropped it
// there), so it ran once at start-up and fighting never cost hunger. Found by The second day's "60 blows" check.
test('a landed attack costs 0.1 exhaustion, charged where the hit lands', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const at = main.indexOf('this.mobs.damageMob(this.targetMob, damage, this.player.position, false, this.player);');
  assert.ok(at > 0);
  assert.match(main.slice(at, at + 400), /this\.player\.addExhaustion\?\.\(EXHAUSTION\.attack\);/);
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  const ctor = player.slice(player.indexOf('constructor('), player.indexOf('\n  }\n', player.indexOf('constructor(')));
  assert.doesNotMatch(ctor, /addExhaustion\(EXHAUSTION\.attack\)/, 'not at construction');
});

// The light engine's sky darkening was set once to 11 -- the NIGHT value, its comment calling it midday -- and nothing
// ever updated it, so open ground at noon read light 4 and undead never burned in the sun.
test('sky darkening follows the clock: 0 at noon, 11 at midnight', async () => {
  const { skyDarkenForDimension } = await import('../src/spawning/spawnClock.js');
  assert.equal(skyDarkenForDimension('overworld', 6000), 0);
  assert.equal(skyDarkenForDimension('overworld', 18000), 11);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = main.slice(main.indexOf('  updateDayNightCycle(dt) {'), main.indexOf('  updateDayNightCycle(dt) {') + 900);
  assert.match(body, /this\.world\.light\.skyDarken = skyDarkenForDimension\(/);
});

// The shared walking code writes `mob.state` ('idle', 'chase') every tick, and `isProvoked` read `state === 'provoked'`,
// so a gaze provocation was lost on the tick it happened: anger stayed at 20 and the enderman stayed calm.
test('an enderman stays provoked when the walking code rewrites its state', async () => {
  const { createWildEndermanState, provoke, isProvoked, tickAnger } = await import('../src/endermanBehavior.js');
  const mob = createWildEndermanState();
  provoke(mob, 'gaze');
  mob.state = 'chase';
  assert.equal(isProvoked(mob), true);
  tickAnger(mob, 1e6);
  assert.equal(isProvoked(mob), false, 'and calms when the anger runs out');
});

// A spider's feet rest at y = 4.98 on ground at 5; flooring that read the grass block's own light (0), so at noon every
// spider took itself to be in the dark and hunted ("Spiders are neutral in the daytime", The second day).
test('a spider reads the light of the cell it stands in, not the ground under its feet', async () => {
  const { lightAt } = await import('../src/spiderBehavior.js');
  const world = { getLightLevel: (x, y, z) => (Math.floor(y) < 5 ? 0 : 15) };
  assert.equal(lightAt({ world }, 0.5, 4.98, 0.5), 15);
});

// Every bucket use called `this.sounds.playWater()`, which the audio manager did not have: the call threw after the world
// had changed, so the hotbar and the chunk were never refreshed. Found scooping lava (The third day).
test('every sound main.js calls unguarded exists on the audio manager', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const audio = readFileSync(new URL('../src/audio.js', import.meta.url), 'utf8');
  const called = new Set([...main.matchAll(/this\.sounds\.(play[A-Za-z]+)\(/g)].map((m) => m[1]));
  // A call behind `if (this.sounds?.playX)` is guarded and allowed to be absent.
  const missing = [...called].filter((m) => !audio.includes(`\n  ${m}(`) && !main.includes(`sounds?.${m})`));
  assert.deepEqual(missing, []);
});

// Phantom: they come after three days without rest, and lying in a bed resets the clock -- which nothing did, so a
// player who slept every night was still visited (The third day: "Sleeping also fends off phantoms for three days").
test('lying down in a bed, or dying, resets both phantom insomnia timers', async () => {
  const { resetInsomnia } = await import('../src/bed.js');
  const behaviours = { insomniaTicks: 90000, resetSleep() { this.insomniaTicks = 0; } };
  const phantom = { insomniaTicks: 90000, reset() { this.insomniaTicks = 0; } };
  resetInsomnia({ mobs: { hostileBehaviors: behaviours }, spawnManager: { specialSpawners: { phantom } } });
  assert.equal(behaviours.insomniaTicks, 0);
  assert.equal(phantom.insomniaTicks, 0);
  const bed = readFileSync(new URL('../src/bed.js', import.meta.url), 'utf8');
  assert.match(bed.slice(bed.indexOf('  startSleeping(bed, player) {'), bed.indexOf('  startSleeping(bed, player) {') + 400), /resetInsomnia\(this\.game\);/);
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player.slice(player.indexOf('  respawn() {'), player.indexOf('  respawn() {') + 900), /specialSpawners\?\.phantom\?\.reset\?\.\(\);/);
});

// Food: the Hunger effect costs "0.1 per second, per Hunger status effect level". Its table entry and helper existed and
// nothing charged it, so food poisoning cost nothing (Hunger management play-test).
test('the Hunger effect drains 0.1 exhaustion a second per level', async () => {
  const p = Object.create(Player.prototype);
  Object.assign(p, { game: { difficulty: 'normal' }, health: 20, maxHealth: 20, hunger: 20, saturation: 20, exhaustion: 0, statusEffects: new Map([['hunger', { duration: 30, level: 2 }]]) });
  for (let i = 0; i < 100; i++) p.updateHungerModel(0.05);
  const spent = (20 - p.saturation) * 4 + p.exhaustion;
  assert.ok(Math.abs(spent - 1.0) < 1e-6, `5 s of Hunger II: ${spent}`);
});

// A brush on an armadillo "drops 1 armadillo scute and costs the brush 16 durability": `brushArmadillo` was written and
// never called from the game (Durability management play-test).
test('right-clicking an armadillo with a brush goes through brushArmadillo', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = main.slice(main.indexOf('  handleRightClick() {'), main.indexOf('  handleRightClick() {') + 3000);
  assert.match(body, /brushArmadillo\(this\.targetMob, held\.id/);
  assert.match(body, /'armadillo_scute'/);
});

// Sheep grazed twice over -- an invented 15-50 s timer in animalBehaviors.js and the wiki's per-tick chance in
// mobEnvironment.js -- so a sheared sheep regrew its wool within seconds. One pass now, at the wiki's 1/1000 a tick.
test('a sheep grazes on average every 50 s (1/1000 a tick), a lamb every 2.5 s', async () => {
  const { sheepGrazeWait } = await import('../src/animalBehaviors.js');
  let a = 0, b = 0; const n = 20000;
  for (let i = 0; i < n; i++) { a += sheepGrazeWait({}); b += sheepGrazeWait({ isBaby: true }); }
  assert.ok(Math.abs(a / n - 50) < 2, `adult ${a / n}`);
  assert.ok(Math.abs(b / n - 2.5) < 0.1, `lamb ${b / n}`);
  const mobs = readFileSync(new URL('../src/mobs.js', import.meta.url), 'utf8');
  assert.doesNotMatch(mobs, /^\s*updateSheepGrazing\(this, mob, dt\);/m, 'grazing runs once');
});

// Tips and tricks: on Peaceful "all hostile mobs instantly despawn". The removal ran only inside the natural spawner,
// which authored worlds switch off, so there a zombie lived on in Peaceful and kept biting.
test('Peaceful removes monsters even where the natural spawner is off', async () => {
  const { DespawnManager } = await import('../src/spawning/despawnManager.js');
  const removed = [];
  const mobs = [{ type: 'zombie', mesh: {}, health: 20 }, { type: 'cow', mesh: {}, health: 10 }];
  const manager = { difficulty: 'peaceful', mobs, removeMob: (m) => { removed.push(m.type); mobs.splice(mobs.indexOf(m), 1); }, shouldSurvivePeaceful: (m) => m.type !== 'zombie' };
  const dm = new DespawnManager({ mobSpawnManager: manager });
  assert.equal(dm.removePeaceful(), 1);
  assert.deepEqual(removed, ['zombie']);
  manager.difficulty = 'normal'; mobs.push({ type: 'zombie', mesh: {}, health: 20 });
  assert.equal(dm.removePeaceful(), 0, 'nothing off Peaceful');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(this\.difficulty === 'peaceful'\) \{ try \{ this\.spawnManager\?\.despawnManager\?\.removePeaceful\?\.\(\);/);
});

// Navigation: "Each player can change their individual spawn point by sleeping in a bed". The bed binding kept only the
// stand spot beside the bed, and respawn looked for a bed AT that spot -- air -- so every bed counted as missing.
test('respawn checks the bed block, not the stand spot beside it', () => {
  const bed = readFileSync(new URL('../src/bed.js', import.meta.url), 'utf8');
  assert.match(bed, /player\.bedBlockPosition = \{ x: bed\.footPos\[0\], y: bed\.footPos\[1\], z: bed\.footPos\[2\] \};/);
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /this\.bedBlockPosition \? this\.isBedStillThere\(this\.bedBlockPosition\)/);
});

// Shelters: a fall is "blocks fallen less 3". The landing step's overshoot below the block top was counted too, so a
// 22-block fall (19 damage) measured nearly 23 and killed.
test('a landing does not count the step that went below the ground', () => {
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /const overshoot = Math\.ceil\(newPos\.y\) - newPos\.y;\n\s*this\.fallDistance = Math\.max\(0, this\.fallDistance - overshoot\);/);
});

// Shelter types: "digging 3 blocks straight down and then capping off the hole" is the fastest shelter -- and a spider
// bit through it, because its bite measured only horizontal distance.
test('a melee mob cannot reach through the ground or across a wall', async () => {
  const { meleeCanReach } = await import('../src/mobEnvironment.js');
  const { BLOCKS } = await import('../src/blocks.js');
  const solid = new Set(['0,4,0', '0,3,0']);
  const world = { getVoxel: (x, y, z) => (solid.has(`${x},${y},${z}`) || y < 2 ? BLOCKS.DIRT : BLOCKS.AIR) };
  const mob = (x, y, z) => ({ mesh: { position: { x, y, z } } });
  assert.equal(meleeCanReach(world, mob(0.9, 5, 0.5), { position: { x: 0.5, y: 2, z: 0.5 } }), false, 'three blocks down, under a cap');
  assert.equal(meleeCanReach(world, mob(1.5, 2, 0.5), { position: { x: 2.5, y: 2, z: 0.5 } }), true, 'beside it in the open');
  const spider = readFileSync(new URL('../src/spiderBehavior.js', import.meta.url), 'utf8');
  assert.match(spider, /mob\.attackCooldown <= 0 && meleeCanReach\(manager\?\.world, mob, player\)/);
});

// Combat: critical hits ("while falling", x1.5 of the base damage after Strength, at 84.8% charge, not sprinting, in
// water, on a ladder, with Slow Falling or Blindness, riding or flying) did not exist.
test('a falling, fully charged hit is a critical hit', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const critical = charge >= 0\.848 && \(p\.fallDistance \?\? 0\) > 0 && !p\.onGround && !p\.inWater && !onClimbable && !p\.isFlying && !p\.isSprinting/);
});

test('a golden pickaxe harvests like wood: no diamonds, iron or gold ore drops, but stone and coal do', async () => {
  const { tierMeets, harvestsNothing } = await import('../src/miningRules.js');
  const { BLOCKS, ITEMS } = await import('../src/blocks.js');
  assert.equal(tierMeets('golden', 'iron'), false);
  assert.equal(tierMeets('golden', 'stone'), false);
  assert.equal(tierMeets('golden', 'wooden'), true);
  assert.equal(tierMeets('iron', 'golden'), true, 'a gold requirement is a wood requirement');
  assert.equal(harvestsNothing(BLOCKS.DIAMOND_ORE, ITEMS.golden_pickaxe, 'golden_pickaxe'), true);
  assert.equal(harvestsNothing(BLOCKS.IRON_ORE, ITEMS.golden_pickaxe, 'golden_pickaxe'), true);
  assert.equal(harvestsNothing(BLOCKS.COAL_ORE, ITEMS.golden_pickaxe, 'golden_pickaxe'), false);
  assert.equal(harvestsNothing(BLOCKS.DIAMOND_ORE, ITEMS.iron_pickaxe, 'iron_pickaxe'), false);
});

// Nether hub / Subspace Bubble: a base must still be there when the player comes back. Unloading deleted generated
// chunks and regenerated them from the seed, erasing every change made in them.
test('a generated chunk is only regenerated when nothing changed it since generation', async () => {
  const { World } = await import('../src/world.js');
  const { BLOCKS } = await import('../src/blocks.js');
  const world = new World(4242);
  const chunk = world.getOrCreateChunk(0, 0);
  assert.equal(chunk.modified, undefined, 'generation itself does not count as a change');
  world.setVoxel(3, 40, 3, BLOCKS.DIAMOND_BLOCK);
  assert.equal(chunk.modified, true);
  const streamer = readFileSync(new URL('../src/chunkStreamer.js', import.meta.url), 'utf8');
  assert.match(streamer, /generationMode !== 'authored' && !chunk\.modified\) \{\s*[^}]*chunks\.delete/);
  const save = readFileSync(new URL('../src/mapManager.js', import.meta.url), 'utf8');
  assert.ok((save.match(/modified ?= ?true/g) ?? []).length >= 3, 'chunks loaded from a save are kept too');
});

test('The End tab: the dragon egg teleports when hit, the gateway works from the hitbox and makes an island, tower crystals regrow invulnerable', () => {
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
  assert.match(src('main.js'), /blockIdOfTarget === BLOCKS\.DRAGON_EGG && this\.player\.gamemode !== 'creative'\) \{ this\.breakTargetBlock\(\)/);
  const end = src('endProgression.js');
  assert.match(end, /if\(!landing\)\{[\s\S]{0,200}END_STONE/, 'no island found: one is made');
  assert.match(end, /game\.player\.width\?\?0\.6/, 'the hitbox, not one cell, enters a gateway');
  assert.match(end, /world\.getOrCreateChunk\?\.\(cx,cz\);\s*const canvas=new CellCanvas\(\);buildGateway/, 'a gateway is written into a real chunk');
  const boss = src('bossFights.js');
  assert.match(boss, /spawnEndCrystal\(spike\.x\+\.5,spike\.top\+1\.5,spike\.z\+\.5,\{spikeIndex:state\.rebuiltSpikes,invulnerable:true\}\)/);
  assert.match(boss, /if\(crystal\.invulnerable&&!creative\)return false;/);
});
