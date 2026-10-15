// Introductory / Newcomer survival tutorials, played by the bot in the real game.
import { BLOCKS, ITEMS } from '../../../src/blocks.js';
import { facingLabel } from '../../../src/ui.js';

const W = (page) => `https://minecraft.wiki/w/Tutorial:${page.replace(/ /g, '_')}`;

// The ground: grass at y=4 over three dirt and bedrock (the harness default), so the player stands at y=5 and a hole
// dug in the ground has a floor.

/** An oak tree: a five-log trunk with a leaf canopy, the way the bot meets one in the wild. */
export function oakTree(t, x, z, y0 = 5) {
  for (let y = y0; y < y0 + 5; y++) t.set(x, y, z, BLOCKS.OAK_LOG);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let y = y0 + 3; y <= y0 + 5; y++) {
    if ((dx || dz || y === y0 + 5) && Math.abs(dx) + Math.abs(dz) < 4 && t.world.getVoxel(x + dx, y, z + dz) === BLOCKS.AIR) t.set(x + dx, y, z + dz, BLOCKS.OAK_LEAVES);
  }
}

const countBlocks = (t, id, x1, y1, z1, x2, y2, z2) => {
  let n = 0;
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) for (let z = z1; z <= z2; z++) if (t.world.getVoxel(x, y, z) === id) n++;
  return n;
};

/** Mobs the bot hunts: real game mobs, spawned by the game's own dispatcher. */
const herd = (t, type, n, x, z, options) => Array.from({ length: n }, (_, i) => t.spawn(type, x + i * 2 + 0.5, 5, z + 0.5, options));


/** Hunger state the game is using (the model in hunger.js mirrors onto the player). */
const hungerOf = (player) => player._hungerState ?? player;
function setHunger(player, hunger, saturation, exhaustion = 0) {
  player.hunger = hunger; player.saturation = saturation; player.exhaustion = exhaustion; player.ensureHungerState?.();
  if (player._hungerState) Object.assign(player._hungerState, { hunger, saturation, exhaustion });
}
/** Exhaustion spent since `from`: what saturation and hunger lost (4.0 per point) plus the running exhaustion. */
const spent = (player, from) => { const h = hungerOf(player); return (from.saturation - h.saturation) * 4 + (from.hunger - h.hunger) * 4 + (h.exhaustion - from.exhaustion); };
const snapshot = (player) => { const h = hungerOf(player); return { hunger: h.hunger, saturation: h.saturation, exhaustion: h.exhaustion }; };
/** Hold movement keys the way a player does, for `seconds`. */
async function hold(t, controls, seconds) {
  const p = t.player; let jumps = 0, wasGround = p.onGround; const start = p.position.clone();
  for (let i = 0; i < Math.round(seconds / t.dt); i++) {
    p.botControls = { ...controls }; t.step();
    if (wasGround && !p.onGround && p.velocity.y > 0) jumps++;
    wasGround = p.onGround; if (i % 20 === 0) await Promise.resolve();
  }
  p.botControls = null;
  return { jumps, metres: Math.hypot(p.position.x - start.x, p.position.z - start.z) };
}
/** Kill a mob through the game's own death path (scenery cleanup, not a tutorial step). */
const remove = (game, m) => { if (m?.health > 0) { m.hitCooldown = 0; game.mobs.damageMob(m, 999, m.mesh.position, false, null); } };

export const SCENARIOS = [
  {
    id: 'newcomer.first10',
    tutorial: 'Your first 10 minutes',
    wiki: W('Your first 10 minutes'),
    async run(t) {
      const { game, player } = t;
      // The landscape: three oaks, a stone hillside with coal in it, a sand patch, short grass, open ground.
      for (const [x, z] of [[6, -6], [10, -6], [14, -6]]) oakTree(t, x, z);
      t.fill(-12, 5, -10, -6, 7, -4, BLOCKS.STONE);
      t.fill(4, 4, 8, 6, 4, 9, BLOCKS.SAND);
      for (let x = -4; x <= 4; x += 2) for (let z = 4; z <= 18; z += 2) t.set(x, 5, z, BLOCKS.SHORT_GRASS);

      // Minute Zero.
      t.check('the inventory starts empty', t.items().length === 0, t.items(), []);
      const dir = game.camera.getWorldDirection(new game.camera.position.constructor());
      t.check('the player starts facing north', dir.z < -0.99 && facingLabel(player.yaw).startsWith('north'),
        { look: dir.toArray().map((v) => +v.toFixed(2)), f3: facingLabel(player.yaw) }, 'north (-Z)',
        '"you are always facing north at the start of the game"');
      // "dig the blocks adjacent to the block you are standing on and then place one on top of the other to form a pillar"
      await t.run('mine 2 dirt'); await t.wait(1);
      const dirt = t.count(BLOCKS.DIRT);
      const y0 = player.position.y;
      await t.run('pillar 2 dirt');
      t.check('a two-block landmark pillar from the dug dirt', dirt >= 2 && player.position.y >= y0 + 1.9,
        { dirtCollected: dirt, rose: +(player.position.y - y0).toFixed(2) }, 'dirt 2, rose 2', '"form a pillar below your feet"');
      await t.run('goto 1 5 3');

      // 00:20-01:00 "hit any short grass you come across as seeds are going to come in handy later"
      await t.run('mine 40 short grass'); await t.wait(1);
      t.check('short grass yields wheat seeds', t.count('wheat_seeds') >= 1, t.count('wheat_seeds'), '>= 1 from 40 short grass (12.5% each)',
        '"hit any short grass you come across as seeds are going to come in handy"');

      // Minute One: "cut it down by holding down destroy ... and collect all of the logs"
      t.resetMining();
      await t.run('mine 15 oak log'); await t.wait(2);
      const logs = t.count(BLOCKS.OAK_LOG);
      const perLog = (t.miningTicks * t.dt) / Math.max(1, logs);
      t.check('fifteen logs punched from three trees', logs === 15, logs, 15);
      t.check('a log takes 3 s by hand', Math.abs(perLog - 3) < 0.25, +perLog.toFixed(2), 3, 'Log: hardness 2, 3 s by hand');
      // "the leaves automatically decay after a few minutes"
      const leavesBefore = countBlocks(t, BLOCKS.OAK_LEAVES, 3, 5, -9, 17, 11, -3);
      await t.wait(150);
      const leavesAfter = countBlocks(t, BLOCKS.OAK_LEAVES, 3, 5, -9, 17, 11, -3);
      t.check('leaves without logs decay within a few minutes', leavesAfter < leavesBefore * 0.5,
        { before: leavesBefore, afterTwoAndAHalfMinutes: leavesAfter }, 'most gone', '"the leaves automatically decay after a few minutes"');

      // Minute Two: "Put one log ... 4 planks appear"; "1 log = 4 planks = 8 sticks"
      await t.run('craft 1 oak planks');
      t.check('one log makes four planks', t.count(BLOCKS.OAK_PLANKS) === 4, t.count(BLOCKS.OAK_PLANKS), 4);
      await t.run('craft crafting table');
      t.check('four planks make a crafting table, in the 2x2 grid', t.count(BLOCKS.CRAFTING_TABLE) === 1 && t.count(BLOCKS.OAK_PLANKS) === 0,
        { table: t.count(BLOCKS.CRAFTING_TABLE), planks: t.count(BLOCKS.OAK_PLANKS) }, { table: 1, planks: 0 });
      await t.run('craft 5 oak planks');
      await t.run('goto 1 5 1');
      const placed = await t.run('place crafting table at 2 5 0');
      t.check('the crafting table is placed', placed.ok && t.world.getVoxel(2, 5, 0) === BLOCKS.CRAFTING_TABLE, t.world.getVoxel(2, 5, 0), BLOCKS.CRAFTING_TABLE);
      // Decaying leaves drop the odd stick (2%), so counts are compared before and after each craft.
      const sticks0 = t.count('stick'), planks0 = t.count(BLOCKS.OAK_PLANKS);
      await t.run('craft 1 stick');
      t.check('two planks make four sticks (1 log = 4 planks = 8 sticks)', t.count('stick') - sticks0 === 4 && planks0 - t.count(BLOCKS.OAK_PLANKS) === 2,
        { sticks: t.count('stick') - sticks0, planks: planks0 - t.count(BLOCKS.OAK_PLANKS) }, { sticks: 4, planks: 2 }, '"(1 log = 4 planks = 8 sticks)"');
      const sticks1 = t.count('stick');
      await t.run('craft wooden pickaxe');
      t.check('a wooden pickaxe from three planks and two sticks', t.count('wooden_pickaxe') === 1 && sticks1 - t.count('stick') === 2, { pick: t.count('wooden_pickaxe'), sticksUsed: sticks1 - t.count('stick') }, { pick: 1, sticksUsed: 2 });
      const planksBeforeBoat = t.count(BLOCKS.OAK_PLANKS);
      await t.run('craft oak boat');
      t.check('a boat from five planks', t.count('oak_boat') === 1 && planksBeforeBoat - t.count(BLOCKS.OAK_PLANKS) === 5,
        { boat: t.count('oak_boat'), planksUsed: planksBeforeBoat - t.count(BLOCKS.OAK_PLANKS) }, { boat: 1, planksUsed: 5 }, '"a boat ... can be crafted with 5 planks"');

      // Minute Three: "using your fist on the dirt and then use the pickaxe to gather at least 19 blocks of stone, which
      // drops as cobblestone when mined"
      t.resetMining();
      await t.run('mine 19 stone'); await t.wait(2);
      const cobble = t.count(BLOCKS.COBBLESTONE);
      // The bot may dig a little extra stone to reach the face; every stone mined gives one cobblestone.
      t.check('19 stone mined with the wooden pickaxe drop 19 cobblestone', cobble >= 19, cobble, '>= 19', '"stone, which drops as cobblestone when mined"');
      const perStone = (t.miningTicks * t.dt) / Math.max(1, cobble);
      t.check('stone takes 1.15 s with a wooden pickaxe', Math.abs(perStone - 1.15) < 0.15, +perStone.toFixed(2), 1.15, 'Stone: hardness 1.5; wooden pickaxe 1.15 s');
      await t.run('goto 1 5 1');
      await t.run('craft 2 stick');
      const cobble0 = t.count(BLOCKS.COBBLESTONE);
      for (const tool of ['stone axe', 'stone pickaxe', 'stone sword']) await t.run(`craft ${tool}`);
      t.check('a stone axe, pickaxe and sword', ['stone_axe', 'stone_pickaxe', 'stone_sword'].every((id) => t.count(id) === 1) && cobble0 - t.count(BLOCKS.COBBLESTONE) === 8,
        { axe: t.count('stone_axe'), pickaxe: t.count('stone_pickaxe'), sword: t.count('stone_sword'), cobbleSpent: cobble0 - t.count(BLOCKS.COBBLESTONE) }, 'one each, 8 cobblestone spent');
      const axe = ITEMS.stone_axe, sword = ITEMS.stone_sword;
      t.check('"axes deal more damage than swords but have lower DPS"', axe.attack > sword.attack && axe.attack * 0.8 < sword.attack * 1.6,
        { axeHit: axe.attack, swordHit: sword.attack, axeDps: axe.attack * 0.8, swordDps: sword.attack * 1.6 }, 'axe hit > sword hit; axe DPS < sword DPS');
      // "Break the crafting table, collect it"
      await t.run('mine 1 crafting table'); await t.wait(1.5);
      t.check('a broken crafting table drops itself', t.count(BLOCKS.CRAFTING_TABLE) === 1 && t.world.getVoxel(2, 5, 0) === BLOCKS.AIR, t.count(BLOCKS.CRAFTING_TABLE), 1, '"Break the crafting table, collect it"');

      // Minute Four: hunting. "Go after sheep ... they drop wool ... and also give mutton"; "Leather is better acquired
      // from cows as they also drop raw beef"; "Horses only drop leather"; wolves "don't have any item drops";
      // cats' "only drop is string".
      await t.run('equip stone sword');
      herd(t, 'sheep', 3, 10, 10, { woolColor: 'white' });
      for (let i = 0; i < 3; i++) { await t.run('attack sheep'); await t.wait(1.5); }
      console.log('[playtest] sheep loot sweep', JSON.stringify(game.playerBot.lastSweepInfo), 'drops left', JSON.stringify(game.entities.droppedItems.map((d) => [d.itemType, d.count, d.group.position.toArray().map((v) => +v.toFixed(1))])));
      t.check('three white sheep give three white wool', t.count(BLOCKS.WHITE_WOOL) === 3, t.count(BLOCKS.WHITE_WOOL), 3, 'Sheep: drops 1 wool');
      t.check('and 1-2 raw mutton each', t.count('mutton') >= 3 && t.count('mutton') <= 6, t.count('mutton'), '3-6', 'Sheep: 1-2 raw mutton');
      herd(t, 'cow', 2, 10, 14);
      for (let i = 0; i < 2; i++) { await t.run('attack cow'); await t.wait(1.5); }
      t.check('two cows give 2-6 raw beef', t.count('beef') >= 2 && t.count('beef') <= 6, { beef: t.count('beef'), leather: t.count('leather') }, 'beef 2-6, leather 0-4', 'Cow: 1-3 raw beef, 0-2 leather');
      // What each kill leaves on the ground, read the moment the corpse drops its loot (before the bot collects it).
      const dropsOf = async (type) => {
        const p = player.position;
        const mob = t.spawn(type, Math.floor(p.x) + 3.5, 5, Math.floor(p.z) + 0.5);
        const fresh = [];
        const before = new Set(game.entities.droppedItems);
        const watch = () => { for (const d of game.entities.droppedItems) if (!before.has(d) && d.group.position.distanceTo(mob.mesh.position) < 2.5) { before.add(d); fresh.push(d.itemType); } };
        const run = game.playerBot.run(`attack ${type}`); let done = false; run.then(() => { done = true; }, () => { done = true; });
        for (let i = 0; i < 2400 && !done; i++) { t.step(); watch(); await Promise.resolve(); }
        return { killed: mob.health <= 0, fresh };
      };
      const horse = await dropsOf('horse');
      t.check('a horse drops only leather', horse.killed && horse.fresh.every((id) => id === 'leather'), horse, 'killed; leather only', '"Horses only drop leather"');
      const wolf = await dropsOf('wolf');
      t.check('a wolf drops nothing', wolf.killed && wolf.fresh.length === 0, wolf, 'killed; nothing', '"they don\'t have any item drops"');
      const cat = await dropsOf('cat');
      t.check('a cat drops only string', cat.killed && cat.fresh.every((id) => id === 'string'), cat, 'killed; string only', '"their only drop is string"');
      // "rather dangerous if you attack them": a wolf that is hit and survives turns on the attacker.
      const angry = t.spawn('wolf', Math.floor(player.position.x) + 3.5, 5, Math.floor(player.position.z) + 0.5);
      const attack = game.playerBot.run('attack wolf');
      for (let i = 0; i < 300 && angry.health >= angry.maxHealth; i++) { t.step(); await Promise.resolve(); }
      game.playerBot.stop('one hit is enough'); await attack.catch(() => {});
      t.check('a wolf hit and not killed turns hostile', angry.health > 0 && angry.isAngry && angry.angerTarget === player,
        { health: angry.health, angry: !!angry.isAngry, target: angry.angerTarget === player ? 'player' : angry.angerTarget?.type }, 'angry at the player',
        '"rather dangerous if you attack them"');
      // ...so it is fought to the end, with the sword, before anything else.
      await t.run('attack wolf');
      const wolvesLeft = game.mobs.mobs.filter((m) => m.type === 'wolf' && m.health > 0).length;
      t.check('the angry wolf is killed', angry.health <= 0 && wolvesLeft === 0, { health: angry.health, wolvesLeft, hp: +player.health.toFixed(1) }, 'dead, no wolf left');

      // Coal, torches. "You can craft a torch by putting coal or charcoal on top of a stick"
      await t.run('equip stone pickaxe');
      // A coal seam in a fresh face of the hill (the stone mining earlier may have opened the old one).
      t.fill(-3, 5, -14, -1, 7, -12, BLOCKS.STONE); t.set(-2, 5, -12, BLOCKS.COAL_ORE); t.set(-2, 6, -12, BLOCKS.COAL_ORE);
      await t.run('goto -2 5 -10');
      const coal0 = t.count('coal');
      await t.run('mine 2 coal ore'); await t.wait(1.5);
      t.check('coal ore drops coal with a pickaxe', t.count('coal') - coal0 === 2, t.count('coal') - coal0, 2);
      await t.run('goto 1 5 1'); await t.run('place crafting table at 2 5 0');
      await t.run('craft 1 torch');
      t.check('coal on a stick makes four torches', t.count(BLOCKS.TORCH) === 4, t.count(BLOCKS.TORCH), 4);

      // Shelter recipes the tutorial lists: more wood first ("Collect any more wood you need").
      for (const [x, z] of [[10, -14], [14, -14]]) oakTree(t, x, z); // the next grove over
      await t.run('mine 10 oak log'); await t.wait(2);
      await t.run('goto 1 5 1');
      await t.run('craft 10 oak planks');
      const make = async (item, n, id, expect, quote) => {
        const before = t.count(id);
        const r = await t.run(`craft ${n} ${item}`);
        t.check(`${item}: ${quote}`, r.ok && t.count(id) - before === expect, t.count(id) - before, expect);
      };
      await t.run('craft 4 stick');
      await make('ladder', 1, BLOCKS.LADDER, 3, 'seven sticks in an H make 3');
      await make('oak trapdoor', 1, BLOCKS.OAK_TRAPDOOR, 2, 'six planks make 2');
      await make('oak stairs', 1, BLOCKS.OAK_STAIRS, 4, 'six planks make 4');
      await make('oak slab', 1, BLOCKS.OAK_SLAB, 6, 'three planks make 6');
      await make('oak door', 1, BLOCKS.OAK_DOOR, 3, 'six planks make 3');
      await make('chest', 1, BLOCKS.CHEST, 1, 'eight planks');
      await t.run('mine 5 sand'); await t.wait(1.5); await t.run('goto 1 5 1');
      await make('sandstone', 1, BLOCKS.SANDSTONE, 1, 'four sand');
      // "if you use sand, it will fall down": the bot places sand against the side of a three-high dirt post.
      t.fill(-3, 5, 6, -3, 7, 6, BLOCKS.DIRT);
      await t.run('goto -1 5 5');
      const sandPlaced = await t.run('place sand at -2 7 6');
      await t.wait(2);
      t.check('sand placed in the air falls to the ground', sandPlaced.ok && t.world.getVoxel(-2, 7, 6) === BLOCKS.AIR && t.world.getVoxel(-2, 5, 6) === BLOCKS.SAND,
        { placed: sandPlaced.ok, at3: t.world.getVoxel(-2, 7, 6), at1: t.world.getVoxel(-2, 5, 6) }, 'landed on the ground', '"if you use sand, it will fall down"');

      // Furnace. "A furnace batch always takes ten seconds"; "Coal and charcoal last 80 seconds, and so do 8 batches";
      // "Planks last 15 seconds, so two can do three batches"; wooden tools "as fuel to smelt single items".
      await t.run('goto 1 5 1');
      await t.run('craft furnace');
      await t.run('place furnace at 3 5 2');
      const fuel = async (cmd) => { const before = t.ticks; const r = await t.run(cmd, { maxTicks: 30000 }); await t.wait(0.5); return { r, seconds: (t.ticks - before) * t.dt }; };
      const one = await fuel('cook 1 oak log with 1 oak planks at 3 5 2');
      t.check('a log smelts to charcoal in ten seconds', t.count('charcoal') === 1 && one.seconds >= 9.5 && one.seconds <= 13,
        { charcoal: t.count('charcoal'), seconds: +one.seconds.toFixed(1) }, '1 in ~10 s', '"A furnace batch always takes ten seconds"');
      const eight = await fuel('cook 8 oak log with 1 coal at 3 5 2');
      t.check('one coal smelts eight logs', t.count('charcoal') === 9 && t.count('coal') === 0, { charcoal: t.count('charcoal'), coalLeft: t.count('coal') }, { charcoal: 9, coal: 0 },
        '"Coal and charcoal last 80 seconds, and so do 8 batches"');
      await fuel('cook 3 mutton with 2 oak planks at 3 5 2');
      t.check('two planks cook three mutton', t.count('cooked_mutton') === 3, t.count('cooked_mutton'), 3, '"Planks last 15 seconds, so two can do three batches"');
      await fuel('cook 1 beef with 1 wooden pickaxe at 3 5 2');
      t.check('a wooden tool smelts a single item', t.count('cooked_beef') === 1 && t.count('wooden_pickaxe') === 0, { steak: t.count('cooked_beef'), pick: t.count('wooden_pickaxe') }, { steak: 1, pick: 0 },
        '"you can use them as fuel to smelt single items"');

      // Ores: "If you come across any ore other than coal, copper or iron, get an iron pickaxe before you mine it, as
      // using an inferior pickaxe ... breaks the ore without dropping the resource."
      t.set(-6, 5, -5, BLOCKS.GOLD_ORE); t.set(-6, 6, -5, BLOCKS.DIAMOND_ORE); t.set(-6, 7, -5, BLOCKS.REDSTONE_ORE); t.set(-6, 5, -4, BLOCKS.EMERALD_ORE);
      await t.run('equip stone pickaxe');
      // The bot refuses to waste an ore it cannot harvest, so a player's hand does it: hold attack on each.
      await t.run('goto -5 5 -4');
      const oreTimes = [];
      for (const [x, y, z] of [[-6, 5, -5], [-6, 6, -5], [-6, 7, -5], [-6, 5, -4]]) oreTimes.push((await t.breakBlock(x, y, z)).seconds);
      // Breaking: a pickaxe too weak to harvest still mines at its own speed, but the damage is divided by 100 instead
      // of 30 -- gold ore (hardness 3) with a stone pickaxe (speed 4) takes 3 x 100 / (4 x 20) = 3.75 s.
      t.check('the wrong-tier pickaxe still breaks the ore, at the "/100" rate', Math.abs(oreTimes[0] - 3.75) < 0.1, +oreTimes[0].toFixed(2), 3.75,
        'Breaking: "If the tool cannot harvest the block ... divided by 100"');
      await t.wait(1.5);
      const got = ['raw_gold', 'diamond', 'redstone', 'emerald'].map((id) => t.count(id));
      t.check('a stone pickaxe breaks gold, diamond, redstone and emerald ore without a drop', got.every((n) => n === 0) &&
        [[-6, 5, -5], [-6, 6, -5], [-6, 7, -5], [-6, 5, -4]].every(([x, y, z]) => t.world.getVoxel(x, y, z) === BLOCKS.AIR), got, [0, 0, 0, 0],
        '"breaks the ore without dropping the resource"');

      // Minute Nine & Ten: a bed from three matching wool and any planks, and sleeping in it.
      await t.run('goto 1 5 1');
      await t.run('craft white bed');
      t.check('three white wool and three planks make a white bed', t.count('white_bed') === 1, t.count('white_bed'), 1, '"You need three wool blocks of the same color"');
      await t.run('goto 6 5 1');
      await t.run('place white bed at 7 5 3');
      game.worldTime = 13000;
      const slept = await t.run('sleep at 7 5 3', { maxTicks: 2000 }); await t.wait(6);
      t.check('sleeping skips the night and sets the spawn point', slept.ok && game.worldTime < 1000 && !!player.bedSpawnPosition,
        { slept: slept.ok, time: Math.round(game.worldTime), spawn: player.bedSpawnPosition?.toArray?.() }, 'morning, spawn at the bed',
        '"sleep in it to place your respawn point on the bed"');

      // Dusk: rotten flesh "can inflict you with Hunger for 30 seconds"; "the hunger penalty doesn't stack".
      game.worldTime = 15000;
      t.spawn('zombie', 6.5, 5, 6.5);
      await t.run('equip stone sword');
      await t.run('attack zombie'); await t.wait(1.5);
      t.check('a zombie drops rotten flesh (0-2)', t.count('rotten_flesh') <= 2, t.count('rotten_flesh'), '0-2');
      if (t.count('rotten_flesh') === 0) t.give('rotten_flesh', 3);
      player.hunger = 8; player.saturation = 0; player.ensureHungerState?.(); if (player._hungerState) Object.assign(player._hungerState, { hunger: 8, saturation: 0 });
      let hungerSeen = 0;
      for (let tries = 0; t.count('rotten_flesh') > 0 && hungerSeen < 2 && tries < 6; tries++) {
        const ate = await t.run('eat rotten flesh');
        if (!ate.ok) break;
        const fx = player.statusEffects?.get?.('hunger');
        if (fx) hungerSeen++;
      }
      const fx = player.statusEffects?.get?.('hunger');
      // The game stores the effect's level (1 = Hunger I). 80% a bite, so two bites nearly always give it.
      const fxLevel = fx ? (fx.level ?? (fx.amplifier ?? 0) + 1) : null;
      t.check('rotten flesh gives Hunger I for 30 s, without stacking', !!fx && fx.duration <= 30.5 && fxLevel === 1,
        fx ? { duration: +(fx.duration ?? fx.remaining ?? 0).toFixed(1), level: fxLevel } : 'no effect rolled', '<= 30 s, level I',
        '"can inflict you with Hunger for 30 seconds"; "the hunger penalty doesn\'t stack"');
    },
  },
  {
    id: 'newcomer.second_day',
    tutorial: 'The second day',
    wiki: W('The second day'),
    async run(t) {
      const { game, player } = t;
      const { EXHAUSTION, createHungerState } = await import('/src/hunger.js');
      // "When the game starts, the hunger bar is full, but you have only 5 saturation points."
      const fresh = createHungerState();
      t.check('a new player has full hunger and 5 saturation', fresh.hunger === 20 && fresh.saturation === 5, { hunger: fresh.hunger, saturation: fresh.saturation }, { hunger: 20, saturation: 5 });

      // The costs of activity, measured on the player as they move. Plenty of saturation so hunger itself stays put.
      player.yaw = 0;
      setHunger(player, 20, 20); let s0 = snapshot(player);
      const walk = await hold(t, { KeyW: true }, 4);
      t.check('"Walking around at normal speed uses no hunger"', walk.metres > 10 && Math.abs(spent(player, s0)) < 1e-6, { metres: +walk.metres.toFixed(1), exhaustion: +spent(player, s0).toFixed(3) }, 0);
      setHunger(player, 20, 20); s0 = snapshot(player);
      player.yaw = Math.PI;
      const sprint = await hold(t, { KeyW: true, ControlLeft: true }, 4);
      const perMetre = spent(player, s0) / sprint.metres;
      t.check('sprinting costs 0.1 exhaustion per metre ("60 meters matches healing 1 HP")', Math.abs(perMetre - EXHAUSTION.sprint) < 0.012, { metres: +sprint.metres.toFixed(1), perMetre: +perMetre.toFixed(3) }, 0.1);
      setHunger(player, 20, 20); s0 = snapshot(player);
      const jumping = await hold(t, { Space: true }, 6);
      const perJump = spent(player, s0) / Math.max(1, jumping.jumps);
      t.check('a jump costs 0.05 ("120 jumps matches healing 1 HP")', jumping.jumps >= 5 && Math.abs(perJump - 0.05) < 0.006, { jumps: jumping.jumps, perJump: +perJump.toFixed(3) }, 0.05);
      setHunger(player, 20, 20); s0 = snapshot(player);
      player.yaw = 0;
      const sj = await hold(t, { KeyW: true, ControlLeft: true, Space: true }, 5);
      const perSprintJump = (spent(player, s0) - EXHAUSTION.sprint * sj.metres) / Math.max(1, sj.jumps);
      t.check('a sprint-jump costs 4x a jump (0.2)', sj.jumps >= 4 && Math.abs(perSprintJump - 0.2) < 0.03, { jumps: sj.jumps, perJump: +perSprintJump.toFixed(3) }, 0.2,
        '"Sprinting jumps are especially costly, 4 times as much as a regular jump"');
      // "Well before this point (under 3.5 shanks or 7 hunger), you can no longer sprint."
      setHunger(player, 6, 0);
      await hold(t, { KeyW: true, ControlLeft: true }, 1);
      const sprintAt6 = player.isSprinting;
      setHunger(player, 7, 0);
      await hold(t, { KeyW: true, ControlLeft: true }, 1);
      t.check('no sprinting at 6 hunger, sprinting at 7', !sprintAt6 && player.isSprinting, { at6: sprintAt6, at7: player.isSprinting }, { at6: false, at7: true });
      await t.run('goto 0 5 0');

      // Fighting: "Both attacking mobs and receiving damage costs hunger ... (60 blows either way matches healing 1 HP.)"
      t.give('stone_sword', 1); await t.run('equip stone sword');
      // One sword hit through the game's own click, read before anything else can spend exhaustion.
      const pig = t.spawn('pig', 2.2, 5, 0.5);
      for (let i = 0; i < 20; i++) { game.playerBot.lookAt({ x: pig.mesh.position.x, y: pig.mesh.position.y + 0.5, z: pig.mesh.position.z }); t.step(); await Promise.resolve(); }
      setHunger(player, 20, 20); s0 = snapshot(player);
      const aimed = game.targetMob === pig, pigHp = pig.health;
      game.handleLeftClick();
      t.check('an attack costs 0.1 exhaustion', aimed && pig.health < pigHp && Math.abs(spent(player, s0) - EXHAUSTION.attack) < 1e-6, { aimed, hit: pigHp - pig.health, exhaustion: +spent(player, s0).toFixed(3) }, 0.1,
        'Food: "Attacking an enemy" 0.1');
      remove(game, pig);
      setHunger(player, 20, 20); s0 = snapshot(player);
      // Read straight after each hit: the healing that follows spends exhaustion of its own (6 per HP).
      player.takeDamage(1, null, 'generic'); const small = spent(player, s0);
      await t.wait(1); s0 = snapshot(player); player.takeDamage(5, null, 'generic'); const big = spent(player, s0);
      // Each instance counts once: "each time you take damage it counts as one 'blow' no matter how much damage".
      t.check('each hit taken costs 0.1, whatever its size', Math.abs(small - 0.1) < 1e-6 && Math.abs(big - 0.1) < 1e-6, { oneHp: +small.toFixed(3), fiveHp: +big.toFixed(3) }, 0.1);
      player.health = 20;

      // Starvation: "take damage until you are down to half health in Easy difficulty, or a single hit point in Normal".
      for (const [difficulty, floor] of [['easy', 10], ['normal', 1]]) {
        game.difficulty = difficulty; player.health = 20; setHunger(player, 0, 0);
        await t.wait(difficulty === 'easy' ? 50 : 90);
        t.check(`starving on ${difficulty} stops at ${floor} HP`, Math.abs(player.health - floor) < 0.01, +player.health.toFixed(2), floor);
      }
      game.difficulty = 'normal'; setHunger(player, 20, 5); player.health = 20;

      // Mobs by day. "Spiders are neutral in the daytime"; "Attacking a spider doesn't anger other spiders nearby".
      const { spiderIsAngry } = await import('/src/spiderBehavior.js');
      game.worldTime = 6000;
      const sp1 = t.spawn('spider', 4.5, 5, 4.5), sp2 = t.spawn('spider', -3.5, 5, 4.5);
      const hp0 = player.health; await t.wait(4);
      t.check('spiders leave the player alone by day', player.health === hp0 && !spiderIsAngry(sp1) && !spiderIsAngry(sp2), { hp: player.health, angry: [spiderIsAngry(sp1), spiderIsAngry(sp2)] }, 'untouched');
      game.mobs.damageMob(sp1, 1, player.position, false, player);
      await t.wait(0.5);
      t.check('hitting one spider angers it, not its neighbour', spiderIsAngry(sp1) && !spiderIsAngry(sp2), { hit: spiderIsAngry(sp1), other: spiderIsAngry(sp2) }, { hit: true, other: false });
      remove(game, sp1); remove(game, sp2);
      // "Endermen are neutral unless you look directly at their faces"
      const { isProvoked } = await import('/src/endermanBehavior.js');
      const ender = t.spawn('enderman', 0.5, 5, -8.5);
      player.yaw = Math.PI; player.pitch = 0; await t.wait(3);
      const calm = !isProvoked(ender);
      for (let i = 0; i < 60; i++) { const e = ender.mesh.position; game.playerBot.lookAt({ x: e.x, y: e.y + 2.55, z: e.z }); t.step(); await Promise.resolve(); }
      t.check('an enderman ignores you until you look at its face', calm && isProvoked(ender), { lookingAway: calm ? 'calm' : 'provoked', staring: isProvoked(ender) }, 'calm, then provoked');
      remove(game, ender);
      player.health = 20;
      // "lead them into the sun ... until they burn to death"
      const zombie = t.spawn('zombie', 10.5, 5, 10.5), skeleton = t.spawn('skeleton', -10.5, 5, 10.5);
      await t.wait(4);
      const burning = (m) => !!(m.isBurning || m.isOnFire || m.fireTicks > 0);
      t.check('zombies and skeletons burn in daylight', (burning(zombie) || zombie.health < zombie.maxHealth) && (burning(skeleton) || skeleton.health < skeleton.maxHealth),
        { zombie: { fire: burning(zombie), hp: zombie.health }, skeleton: { fire: burning(skeleton), hp: skeleton.health } }, 'on fire');
      remove(game, zombie); remove(game, skeleton);
      await t.wait(2); player.health = 20;

      // "collect your items within 5 minutes"
      game.entities.spawnDroppedItem(new player.position.constructor(20.5, 5.3, 20.5), 'bone', false, 1);
      const bone = game.entities.droppedItems.at(-1);
      await t.wait(298);
      const stillThere = game.entities.droppedItems.includes(bone);
      await t.wait(4);
      t.check('a dropped item despawns after five minutes', stillThere && !game.entities.droppedItems.includes(bone), { at298s: stillThere, at302s: game.entities.droppedItems.includes(bone) }, { at298s: true, at302s: false });
      game.worldTime = 6000;

      // Food: mushroom stew, campfire cooking.
      t.set(3, 5, -3, BLOCKS.RED_MUSHROOM); t.set(4, 5, -3, BLOCKS.BROWN_MUSHROOM);
      await t.run('mine 1 red mushroom');
      // Reaching the red one may cut the brown one first (it is in the way); a player picks up both either way.
      if (t.world.getVoxel(4, 5, -3) === BLOCKS.BROWN_MUSHROOM) await t.run('mine 1 brown mushroom');
      await t.wait(1.5);
      t.give(BLOCKS.OAK_LOG, 6); // the first day's wood
      await t.run('craft 2 oak planks');
      t.set(1, 5, 1, BLOCKS.CRAFTING_TABLE); await t.run('goto 0 5 2');
      await t.run('craft bowl');
      await t.run('craft mushroom stew');
      t.check('a red and a brown mushroom and a bowl make mushroom stew', t.count('mushroom_stew') === 1, t.count('mushroom_stew'), 1, '"If you can get both kinds of mushrooms, you can make mushroom stew"');
      setHunger(player, 10, 0);
      const bowls = t.count('bowl');
      await t.run('eat mushroom stew');
      t.check('eating stew restores 6 hunger and gives the bowl back', hungerOf(player).hunger === 16 && t.count('bowl') === bowls + 1, { hunger: hungerOf(player).hunger, bowls: t.count('bowl') - bowls }, { hunger: 16, bowls: 1 });
      // Campfire: "it has a cheap crafting recipe and uses no additional fuel"
      t.give('coal', 1); await t.run('craft 1 stick'); await t.run('craft campfire');
      await t.run('place campfire at 3 5 1');
      t.give('beef', 1);
      const coal0 = t.count('coal');
      const put = await t.run('use beef at 3 5 1');
      await t.wait(31);
      const cooked = game.entities.droppedItems.some((d) => d.itemType === 'cooked_beef') || t.count('cooked_beef') > 0;
      t.check('a campfire cooks beef in 30 s with no fuel', put.ok && cooked && t.count('coal') === coal0, { placedFood: put.ok, cooked, coalUsed: coal0 - t.count('coal') }, 'cooked, no fuel', 'Campfire: 30 s per item');

      // Sand, gravel and stone. Glass "cannot be recovered once placed"; gravel sometimes gives flint; cobblestone smelts back.
      t.give(BLOCKS.FURNACE, 1); await t.run('place furnace at 1 5 3');
      t.give(BLOCKS.SAND, 1); t.give(BLOCKS.COBBLESTONE, 1); t.give('coal', 2);
      await t.run('cook 1 sand with 1 coal at 1 5 3', { maxTicks: 9000 });
      await t.run('cook 1 cobblestone with 1 coal at 1 5 3', { maxTicks: 9000 });
      t.check('sand smelts to glass, cobblestone back to stone', t.count(BLOCKS.GLASS) === 1 && t.count(BLOCKS.STONE) === 1, { glass: t.count(BLOCKS.GLASS), stone: t.count(BLOCKS.STONE) }, 1);
      await t.run('place glass at 2 5 5'); await t.run('mine 1 glass'); await t.wait(1.5);
      t.check('mined glass drops nothing', t.world.getVoxel(2, 5, 5) === BLOCKS.AIR && t.count(BLOCKS.GLASS) === 0, t.count(BLOCKS.GLASS), 0);
      t.fill(-6, 5, -2, -2, 7, -2, BLOCKS.GRAVEL);
      t.give('stone_shovel', 1);
      await t.run('mine 15 gravel'); await t.wait(2);
      t.check('gravel gives gravel or, sometimes, flint', t.count(BLOCKS.GRAVEL) + t.count('flint') === 15, { gravel: t.count(BLOCKS.GRAVEL), flint: t.count('flint') }, '15 in all', 'Gravel: 10% flint');
      // "All these minerals including coal (but not charcoal) ... can be crafted into storage blocks ... 9 pieces"
      t.give('coal', 9); t.give('charcoal', 9);
      await t.run('goto 0 5 2');
      await t.run('craft coal block');
      t.check('nine coal make a block of coal', t.count(BLOCKS.COAL_BLOCK) === 1, t.count(BLOCKS.COAL_BLOCK), 1);
      t.check('charcoal makes no block', t.count('charcoal') === 9, t.count('charcoal'), 9, '"(but not charcoal)"');

      // Repairing: two damaged tools of the same kind in the grid, through the inventory's own crafting grid.
      const inv = game.inventory;
      inv.craft2x2 = [{ id: 'wooden_pickaxe', isBlock: false, count: 1, durability: 20 }, null, { id: 'wooden_pickaxe', isBlock: false, count: 1, durability: 25 }, null];
      inv.checkCrafting(); inv.takeCraftResult(false);
      const repaired = inv.cursorItem; inv.cursorItem = null;
      t.check('two worn wooden pickaxes repair into one (+5%)', repaired?.id === 'wooden_pickaxe' && repaired.durability === 20 + 25 + 2, repaired?.durability, 47,
        '"put two damaged tools of the same type and material in ... your crafting grid"; Item repair: + floor(59 / 20)');

      // Iron: "The full set requires 24 ingots"; shield, pickaxe, sword, bucket, armour -- "you have used 33 ingots".
      t.give('iron_ingot', 40); t.give(BLOCKS.OAK_PLANKS, 6); t.give('stick', 3);
      const iron0 = t.count('iron_ingot');
      for (const item of ['shield', 'iron pickaxe', 'iron sword', 'bucket', 'iron helmet', 'iron chestplate', 'iron leggings', 'iron boots']) await t.run(`craft ${item}`);
      t.check('shield, pickaxe, sword, bucket and full armour use 33 iron', iron0 - t.count('iron_ingot') === 33, iron0 - t.count('iron_ingot'), 33, '"At this point, you have used 33 ingots"');
      const before = t.count('iron_ingot');
      await t.run('craft shears');
      t.check('shears take 2 iron', before - t.count('iron_ingot') === 2, before - t.count('iron_ingot'), 2);
      // "a second bucket (to hold a second water source, milk a cow ...)"; shears "you don't need to kill any sheep"
      const cow = t.spawn('cow', 3.5, 5, 6.5), sheep = t.spawn('sheep', -2.5, 5, 6.5, { woolColor: 'white' });
      await t.run('feed bucket to cow');
      t.check('a bucket milks a cow', t.count('milk_bucket') === 1 && cow.health > 0, t.count('milk_bucket'), 1);
      const wool0 = t.count(BLOCKS.WHITE_WOOL);
      await t.run('feed shears to sheep'); await t.wait(2);
      for (let i = 0; i < 3; i++) { const d = game.entities.droppedItems.find((x) => x.itemType === BLOCKS.WHITE_WOOL); if (!d) break; await t.run(`goto ${Math.floor(d.group.position.x)} 5 ${Math.floor(d.group.position.z)}`); await t.wait(1); }
      const sheared = t.count(BLOCKS.WHITE_WOOL) - wool0;
      t.check('shearing a sheep gives 1-3 wool and leaves it alive', sheep.isSheared && sheared >= 1 && sheared <= 3 && sheep.health > 0, { sheared: !!sheep.isSheared, wool: sheared }, '1-3');

      // Sleeping: "make sure it's either night-time or storming ... and there are no monsters around you"
      t.give('white_bed', 1);
      await t.run('goto 3 5 -2');
      await t.run('place white bed at 5 5 -2');
      game.worldTime = 6000;
      const dayNap = await t.run('sleep at 5 5 -2', { maxTicks: 300, expectFail: true });
      game.worldTime = 14000;
      const near = t.spawn('zombie', 7.5, 5, -2.5);
      const nearNap = await t.run('sleep at 5 5 -2', { maxTicks: 300, expectFail: true });
      remove(game, near); await t.wait(2);
      t.check('no sleeping by day, nor with a monster near', !dayNap.ok && !nearNap.ok, { day: dayNap.message, monster: nearNap.message }, 'both refused');
    },
  },
  {
    id: 'newcomer.third_day',
    tutorial: 'The third day',
    wiki: W('The third day'),
    async run(t) {
      const { game, player } = t;
      const fm = game.furnaceManager;
      // "Lava buckets are a very good fuel source -- they can smelt 100 items per bucket. However ... once 64 items are
      // smelted and they are not removed, the furnace will still be using up the fuel but will not smelt anymore."
      t.set(4, 5, 0, BLOCKS.LAVA); t.give('bucket', 1);
      await t.run('goto 2 5 0');
      const scooped = await t.run('use bucket at 4 5 0');
      t.check('an empty bucket scoops up lava', scooped.ok && t.count('lava_bucket') === 1 && t.world.getVoxel(4, 5, 0) === BLOCKS.AIR, { lava_bucket: t.count('lava_bucket'), cell: t.world.getVoxel(4, 5, 0) }, 'lava bucket, empty cell');
      t.give(BLOCKS.FURNACE, 1); await t.run('place furnace at 2 5 2');
      // The furnace screen, slot by slot, as a player fills it: 64 cobblestone and the lava bucket, the output taken
      // as it comes, 36 more when the first stack is in.
      fm.addItem(2, 5, 2, BLOCKS.COBBLESTONE, true, 64, 'input');
      fm.addItem(2, 5, 2, 'lava_bucket', false, 1, 'fuel'); game.inventory.removeItem?.('lava_bucket', 1);
      const f = fm.getFurnace(2, 5, 2);
      let smelted = 0, refilled = false, guard = 0;
      do {
        await t.wait(5);
        while (fm.extractItem(2, 5, 2, 'output')) smelted++;
        if (!f.input && !refilled) { fm.addItem(2, 5, 2, BLOCKS.COBBLESTONE, true, 36, 'input'); refilled = true; }
      } while ((f.burnTime > 0 || f.cookTime > 0) && f.input && ++guard < 300);
      while (fm.extractItem(2, 5, 2, 'output')) smelted++;
      t.check('one lava bucket smelts 100 items, and leaves the bucket', smelted === 100 && f.fuel?.id === 'bucket', { smelted, fuelSlot: f.fuel?.id }, { smelted: 100, fuelSlot: 'bucket' }, 'Furnace: lava bucket burns 1000 s');
      // ...but "once 64 items are smelted and they are not removed, the furnace will still be using up the fuel".
      t.give(BLOCKS.FURNACE, 1); await t.run('place furnace at 2 5 -2');
      fm.addItem(2, 5, -2, BLOCKS.COBBLESTONE, true, 64, 'input'); fm.addItem(2, 5, -2, 'lava_bucket', false, 1, 'fuel');
      const g = fm.getFurnace(2, 5, -2);
      await t.wait(650);
      fm.addItem(2, 5, -2, BLOCKS.COBBLESTONE, true, 30, 'input');
      const burn0 = g.burnTime; await t.wait(30);
      t.check('a full output stack stops smelting while the fuel burns on', (g.output?.count ?? 0) === 64 && g.input?.count === 30 && Math.abs(burn0 - g.burnTime - 30) < 0.5,
        { output: g.output?.count, inputLeft: g.input?.count, fuelBurnt: +(burn0 - g.burnTime).toFixed(1) }, { output: 64, inputLeft: 30, fuelBurnt: 30 });

      // "Sleeping also fends off phantoms for three days": lying in a bed resets the player's time since rest.
      const phantomTimer = game.spawnManager?.specialSpawners?.phantom;
      if (phantomTimer) phantomTimer.insomniaTicks = 80000;
      if (game.mobs.hostileBehaviors) game.mobs.hostileBehaviors.insomniaTicks = 80000;
      t.give('white_bed', 1); await t.run('goto -3 5 1'); await t.run('place white bed at -2 5 2');
      game.worldTime = 14000;
      await t.run('sleep at -2 5 2', { maxTicks: 2000 }); await t.wait(6);
      t.check('sleeping resets the phantom three-day timer', (phantomTimer?.insomniaTicks ?? 0) < 72000 && (game.mobs.hostileBehaviors?.insomniaTicks ?? 0) < 72000,
        { spawner: Math.round(phantomTimer?.insomniaTicks ?? -1), behaviours: Math.round(game.mobs.hostileBehaviors?.insomniaTicks ?? -1) }, '< 72000 ticks');
      await t.breakBlock(-2, 5, 2); await t.wait(1);

      // "Cats can be tamed with raw fish, and wolves with bones."
      const wolf = t.spawn('wolf', 3.5, 5, -3.5); t.give('bone', 20);
      for (let i = 0; i < 20 && !wolf.isTamed; i++) await t.run('feed bone to wolf');
      t.check('bones tame a wolf', !!wolf.isTamed && wolf.owner !== undefined, { tamed: !!wolf.isTamed, bonesUsed: 20 - t.count('bone') }, 'tamed', 'Wolf: each bone a 1/3 chance');
      const cat = t.spawn('cat', -3.5, 5, -3.5); t.give('cod', 20);
      for (let i = 0; i < 20 && !cat.isTamed; i++) await t.run('feed cod to cat');
      t.check('raw fish tames a cat', !!cat.isTamed, { tamed: !!cat.isTamed, codUsed: 20 - t.count('cod') }, 'tamed', 'Cat: each raw cod or salmon a 1/3 chance');
      remove(game, wolf); remove(game, cat);

      // "Just be careful not to jump on your seeds, as that will destroy the farmland."
      t.set(0, 4, 3, BLOCKS.FARMLAND); t.give('wheat_seeds', 1);
      await t.run('goto 0 5 2');
      await t.run('plant wheat_seeds at 0 5 3');
      await t.run('goto 0 5 3');
      await hold(t, { Space: true }, 6);
      t.check('jumping on farmland tramples it back to dirt', t.world.getVoxel(0, 4, 3) === BLOCKS.DIRT, t.world.getVoxel(0, 4, 3), BLOCKS.DIRT, 'Farmland: trampled by a fall of more than 0.5');

      // "stepping into water will put out the fire"
      t.fill(6, 4, 6, 7, 4, 7, BLOCKS.WATER);
      await t.run('goto 5 5 6');
      const { igniteActor } = await import('/src/heat.js');
      igniteActor(player, 8);
      const lit = player.isOnFire;
      player.botControls = null; await t.run('goto 6 5 6');
      await t.wait(0.5);
      t.check('walking into water puts out a burning player', lit && !player.isOnFire, { litBefore: lit, burningAfter: !!player.isOnFire }, 'extinguished');
      await t.run('goto 4 5 4');

      // "Dungeon chests can provide ... pumpkin, melon, and beetroot seeds, but not cocoa beans."
      const { STRUCTURE_LOOT } = await import('/src/structureLootData.js');
      const table = JSON.stringify(STRUCTURE_LOOT['minecraft:chests/simple_dungeon'] ?? {}).replace(/-/g, '_');
      t.check('dungeon chests hold pumpkin, melon and beetroot seeds, never cocoa', ['pumpkin_seeds', 'melon_seeds', 'beetroot_seeds'].every((s) => table.includes(`"${s}"`)) && !table.includes('cocoa'),
        { pumpkin: table.includes('"pumpkin_seeds"'), melon: table.includes('"melon_seeds"'), beetroot: table.includes('"beetroot_seeds"'), cocoa: table.includes('cocoa') }, 'three seeds, no cocoa');

      // Bees: "put a campfire under it. Wait until the nest is full of honey ... and then shear the nest for 3
      // honeycombs. Craft a beehive".
      t.fill(-6, 5, 6, -6, 7, 6, BLOCKS.OAK_LOG); t.set(-6, 8, 7, BLOCKS.OAK_LOG); t.set(-6, 7, 7, BLOCKS.BEE_NEST);
      const bee = t.spawn('bee', -5.5, 6, 8.5);
      t.give(BLOCKS.CAMPFIRE, 1); t.give('shears', 1);
      await t.run('goto -5 5 8');
      await t.run('place campfire at -6 5 7');
      game.hiveManager.ensure(-6, 7, 7, 5);
      const combs0 = t.count('honeycomb');
      const shorn = await t.run('use shears at -6 7 7');
      await t.wait(1);
      t.check('shearing a full nest over a campfire gives 3 honeycomb and calm bees', shorn.ok && t.count('honeycomb') - combs0 === 3 && !(bee.angerTimer > 0),
        { honeycomb: t.count('honeycomb') - combs0, beeAngry: (bee.angerTimer ?? 0) > 0 }, { honeycomb: 3, beeAngry: false });
      t.give(BLOCKS.OAK_PLANKS, 6); t.set(-4, 5, 9, BLOCKS.CRAFTING_TABLE);
      await t.run('craft beehive');
      t.check('six planks and three honeycomb make a beehive', t.count(BLOCKS.BEEHIVE) === 1 && t.count('honeycomb') === combs0, t.count(BLOCKS.BEEHIVE), 1);
      remove(game, bee);

      // "Any items placed in a chest will not be lost if you die."
      t.give(BLOCKS.CHEST, 1); t.give('diamond', 3);
      await t.run('place chest at -2 5 -6');
      await t.run('store 3 diamond in chest at -2 5 -6');
      t.give('iron_ingot', 1);
      player.takeDamage(100, null, 'generic');
      await t.wait(1);
      const chest = game.chestManager?.getChest?.(-2, 5, -6) ?? game.chests?.getChest?.(-2, 5, -6);
      const inChest = (chest?.items ?? chest?.slots ?? []).filter(Boolean).reduce((n, s) => n + (s.id === 'diamond' ? s.count : 0), 0);
      t.check('items stored in a chest survive the owner\'s death', player.isDead && inChest === 3, { dead: player.isDead, diamondsInChest: inChest }, 3);
      game.player.respawn?.();
    },
  },
  {
    id: 'newcomer.durability',
    tutorial: 'Durability management',
    wiki: W('Durability management'),
    async run(t) {
      const { game, player } = t;
      const inv = game.inventory;
      const held = () => inv.getActiveItem();
      const wearOf = (s) => (s.maxDurability ?? 0) - (s.durability ?? s.maxDurability ?? 0);
      /** Give one fresh tool, select it, and return its stack. */
      const take = async (id) => { t.give(id, 1); await t.run(`equip ${id.replace(/_/g, ' ')}`); return held(); };
      // Blocks: "do not use the wrong tool to mine blocks with non-zero hardness ... This ... only wastes durability";
      // "Using a sword to mine any block with non-zero hardness consumes 2 durability points".
      t.set(1, 5, -2, BLOCKS.STONE); t.set(2, 5, -2, BLOCKS.SHORT_GRASS); t.set(0, 5, -2, BLOCKS.DIRT); t.set(-1, 5, -2, BLOCKS.DIRT);
      const pick = await take('stone_pickaxe');
      await t.breakBlock(2, 5, -2); const onGrass = wearOf(pick);
      await t.breakBlock(1, 5, -2); const onStone = wearOf(pick) - onGrass;
      await t.breakBlock(0, 5, -2); const onDirt = wearOf(pick) - onGrass - onStone;
      t.check('a pickaxe: 0 for an instant block, 1 for stone, 1 for dirt (wasted)', onGrass === 0 && onStone === 1 && onDirt === 1, { grass: onGrass, stone: onStone, dirt: onDirt }, { grass: 0, stone: 1, dirt: 1 });
      const sword = await take('iron_sword');
      await t.breakBlock(-1, 5, -2);
      t.check('a sword mining dirt spends 2', wearOf(sword) === 2, wearOf(sword), 2, '"Using a sword to mine any block with non-zero hardness consumes 2 durability points"');
      // Mobs: "Using a pickaxe, axe, shovel, or hoe to attack mobs consumes 2 durability points per hit" (a hoe is 1
      // in Java, per the Durability page).
      const hitWith = async (id) => {
        const tool = await take(id);
        const pig = t.spawn('pig', 2.2, 5, 0.5);
        for (let i = 0; i < 25; i++) { game.playerBot.lookAt({ x: pig.mesh.position.x, y: pig.mesh.position.y + 0.5, z: pig.mesh.position.z }); t.step(); await Promise.resolve(); }
        const before = wearOf(tool); game.handleLeftClick(); const cost = wearOf(tool) - before;
        remove(game, pig); await t.wait(0.5);
        return cost;
      };
      const costs = { axe: await hitWith('stone_axe'), shovel: await hitWith('stone_shovel'), hoe: await hitWith('stone_hoe'), sword: await hitWith('stone_sword') };
      t.check('a hit costs an axe or shovel 2, a hoe or sword 1', costs.axe === 2 && costs.shovel === 2 && costs.hoe === 1 && costs.sword === 1, costs, { axe: 2, shovel: 2, hoe: 1, sword: 1 });
      // "When durability reaches 0, the item is destroyed and disappears"
      t.set(3, 5, -4, BLOCKS.STONE);
      t.give('wooden_pickaxe', 1); await t.run('equip wooden pickaxe'); held().durability = 1; held().maxDurability = 59;
      await t.breakBlock(3, 5, -4);
      t.check('a tool used at its last point breaks and is gone', t.count('wooden_pickaxe') === 0, t.count('wooden_pickaxe'), 0);
      // Shield: "a shield only has 336 durability points"; it takes (damage rounded down) + 1 for a hit over 3.
      game.difficulty = 'hard';
      const shield = await take('shield'); shield.durability = 336; shield.maxDurability = 336;
      game.worldTime = 18000; player.yaw = 0; player.pitch = 0;
      // The shield is raised first: it blocks from 5 ticks after it goes up.
      const block = game.playerBot.run('shield 5'); await t.wait(0.5);
      const z = t.spawn('zombie', 0.5, 5, -2.5);
      await t.drive(block); // stepped: a bare await would wait for a game that is not running
      t.check('a shield is 336, and a Hard zombie\'s 4.5 hit costs it floor(4.5) + 1 = 5', shield.maxDurability === 336 && (336 - shield.durability) % 5 === 0 && shield.durability < 336 && player.health === 20,
        { max: shield.maxDurability, spent: 336 - shield.durability, hp: player.health }, 'multiples of 5, no damage taken');
      remove(game, z); game.difficulty = 'normal'; game.worldTime = 6000;
      // "Brushing an armadillo with a brush consumes 16 durability points per use, and the brush only has 64"
      const brush = await take('brush');
      const armadillo = t.spawn('armadillo', 2.2, 5, 2.5);
      const scutes0 = t.count('armadillo_scute');
      await t.run('feed brush to armadillo'); await t.wait(2);
      for (let i = 0; i < 3; i++) { const d = game.entities.droppedItems.find((x) => x.itemType === 'armadillo_scute'); if (!d) break; await t.run(`goto ${Math.floor(d.group.position.x)} 5 ${Math.floor(d.group.position.z)}`); await t.wait(1); }
      t.check('brushing an armadillo costs the brush 16 of its 64 and drops a scute', brush.maxDurability === 64 && wearOf(brush) === 16 && t.count('armadillo_scute') - scutes0 === 1,
        { max: brush.maxDurability, spent: wearOf(brush), scutes: t.count('armadillo_scute') - scutes0 }, { max: 64, spent: 16, scutes: 1 });
      remove(game, armadillo);
      // "Mending and Infinity are mutually exclusive"
      const { ENCHANTMENT_REGISTRY } = await import('/src/enchanting.js');
      const ex = (a, b) => (ENCHANTMENT_REGISTRY[a]?.incompatible ?? []).includes(b) || (ENCHANTMENT_REGISTRY[b]?.incompatible ?? []).includes(a);
      t.check('Mending and Infinity cannot share a bow', ex('mending', 'infinity'), ex('mending', 'infinity'), true);
    },
  },
  {
    id: 'newcomer.hunger_management',
    tutorial: 'Hunger management',
    wiki: W('Hunger management'),
    async run(t) {
      const { game, player } = t;
      const hp = () => +player.health.toFixed(2);
      // "if the player's hunger bar is completely filled and they have left over saturation ... healing at a rate of
      // 2 HP every second"; "You stop healing naturally at 17 hunger or lower"; at 18-19, 1 HP every 4 s.
      player.health = 10; setHunger(player, 20, 20); await t.wait(2);
      const fast = hp() - 10;
      player.health = 10; setHunger(player, 18, 0); await t.wait(8);
      const slow = hp() - 10;
      player.health = 10; setHunger(player, 17, 5); await t.wait(8);
      const none = hp() - 10;
      // At 18 with no saturation the first heal (4 s in) costs 6 exhaustion, which drops hunger to 17 and ends it.
      t.check('healing: 2 HP/s with full hunger and saturation, 1 HP after 4 s at 18 (then it is 17), none at 17', fast >= 3.5 && fast <= 4.1 && slow === 1 && none === 0,
        { fullAndSaturated2s: fast, at18for8s: slow, at17for8s: none }, { fullAndSaturated2s: 4, at18for8s: 1, at17for8s: 0 });
      player.health = 20;
      // "Swimming 600 meters costs as much as healing one point" (0.01 per metre); breaking a block 0.005.
      // A shallow channel: wading costs the same 0.01 a metre as swimming, and nobody drowns in it.
      t.fill(-30, 4, 8, 30, 4, 10, BLOCKS.WATER);
      await t.run('goto -20 4 9');
      setHunger(player, 20, 20); let s0 = snapshot(player);
      player.yaw = -Math.PI / 2;
      const swim = await hold(t, { KeyW: true }, 8);
      const perMetre = spent(player, s0) / Math.max(1, swim.metres);
      t.check('swimming costs 0.01 per metre', swim.metres > 8 && Math.abs(perMetre - 0.01) < 0.003, { metres: +swim.metres.toFixed(1), perMetre: +perMetre.toFixed(4) }, 0.01);
      await t.run('goto 0 5 0');
      t.fill(-3, 5, -4, 3, 5, -4, BLOCKS.DIRT);
      setHunger(player, 20, 20); s0 = snapshot(player);
      for (let x = -3; x <= 2; x++) await t.breakBlock(x, 5, -4);
      t.check('breaking a block costs 0.005', Math.abs(spent(player, s0) / 6 - 0.005) < 1e-6, +(spent(player, s0) / 6).toFixed(4), 0.005);
      // Hunger effect: "0.1 per second, per Hunger status effect level"
      setHunger(player, 20, 20); s0 = snapshot(player);
      player.applyStatusEffect('hunger', 10, 2);
      await t.wait(5);
      t.check('Hunger II drains 0.2 exhaustion a second', Math.abs(spent(player, s0) / 5 - 0.2) < 0.02, +(spent(player, s0) / 5).toFixed(3), 0.2);
      player.statusEffects?.clear?.();
      // "saturation cannot exceed your hunger"
      setHunger(player, 4, 0); t.give('golden_carrot', 1);
      await t.run('eat golden carrot');
      const h = hungerOf(player);
      t.check('a golden carrot (6, 14.4) leaves saturation no higher than hunger', h.hunger === 10 && h.saturation <= h.hunger && h.saturation === 10, { hunger: h.hunger, saturation: h.saturation }, { hunger: 10, saturation: 10 });
      // "On Peaceful difficulty, hunger drain is disabled."
      game.difficulty = 'peaceful'; setHunger(player, 10, 0); s0 = snapshot(player);
      player.yaw = 0; await hold(t, { KeyW: true, ControlLeft: true }, 3);
      t.check('no hunger is lost on Peaceful', hungerOf(player).hunger >= 10, { hunger: hungerOf(player).hunger }, '>= 10', 'Peaceful also refills hunger');
      game.difficulty = 'normal';
    },
  },
  {
    // Beginner's guide, Things to do, Things not to do, Tips and tricks, Best biomes to play: the general guides.
    // Their concrete Java claims, each played or read from the game's own data.
    id: 'newcomer.guides',
    tutorial: "Beginner's guide; Things to do; Things not to do; Tips and tricks; Best biomes to play",
    wiki: W("Beginner's guide"),
    async run(t) {
      const { game, player } = t;
      // Tips and tricks: on Peaceful "all hostile mobs instantly despawn"; Beginner's guide: "Hostile mobs do not spawn
      // in Peaceful difficulty."
      game.difficulty = 'peaceful';
      const z = t.spawn('zombie', 4.5, 5, 4.5);
      await t.wait(1);
      t.check('Peaceful removes a hostile mob at once', !game.mobs.mobs.includes(z) || z.health <= 0, { present: game.mobs.mobs.includes(z), hp: z?.health }, 'gone');
      game.difficulty = 'normal';

      // Beginner's guide: "On death, you will drop any items that you were holding"; "you will respawn at the world spawn";
      // "You can then retrieve your items by returning to where you died".
      t.give('iron_ingot', 5); t.give(BLOCKS.COBBLESTONE, 12);
      await t.run('goto 8 5 8');
      const deathAt = player.position.clone();
      player.takeDamage(100, null, 'generic'); await t.wait(1.5);
      const dropped = game.entities.droppedItems.filter((d) => d.group.position.distanceTo(deathAt) < 4).map((d) => [d.itemType, d.count]);
      t.check('dying drops the inventory where the player fell', player.isDead && t.items().length === 0 && dropped.some(([id]) => id === 'iron_ingot'),
        { dead: player.isDead, inventoryLeft: t.items().length, dropped }, 'items on the ground');
      player.respawn(); await t.wait(1);
      const spawn = game.world.spawnPoint ?? game.spawnPoint ?? { x: 0.5, z: 0.5 };
      t.check('respawning without a bed puts the player near the world spawn', Math.hypot(player.position.x - (spawn.x ?? 0), player.position.z - (spawn.z ?? 0)) < 21,
        { at: player.position.toArray().map((v) => +v.toFixed(1)), spawn }, 'within 20 blocks of the world spawn');
      await t.run('goto 8 5 7'); await t.wait(2);
      t.check('walking back picks the items up again', t.count('iron_ingot') === 5 && t.count(BLOCKS.COBBLESTONE) === 12, { iron: t.count('iron_ingot'), cobble: t.count(BLOCKS.COBBLESTONE) }, { iron: 5, cobble: 12 });
      // Tips and tricks (keepInventory): "players who die respawn with their items".
      game.gamerules = { ...(game.gamerules ?? {}), keepInventory: true };
      player.takeDamage(100, null, 'generic'); await t.wait(1); player.respawn(); await t.wait(0.5);
      t.check('with keepInventory the items stay with the player', t.count('iron_ingot') === 5, t.count('iron_ingot'), 5);
      game.gamerules.keepInventory = false;

      // Beginner's guide: "Villagers also drop nothing upon death"; the iron golem "drops iron when killed".
      const dropsAt = async (type) => {
        const mob = t.spawn(type, 3.5, 5, -3.5); const before = new Set(game.entities.droppedItems);
        game.mobs.damageMob(mob, 999, player.position, false, player); await t.wait(1.5);
        return game.entities.droppedItems.filter((d) => !before.has(d)).map((d) => [d.itemType, d.count]);
      };
      const villager = await dropsAt('villager');
      t.check('a villager drops nothing', villager.length === 0, villager, []);
      const golem = await dropsAt('iron_golem');
      const iron = golem.filter(([id]) => id === 'iron_ingot').reduce((n, [, c]) => n + c, 0);
      t.check('an iron golem drops 3-5 iron ingots', iron >= 3 && iron <= 5, golem, '3-5 iron (and 0-2 poppies)');
      await t.wait(3);

      // Beginner's guide: "hay bales ... craft them back into wheat ... or make bread out of it"; Things to do: a
      // fletcher's "32 sticks for an emerald".
      t.set(1, 5, 1, BLOCKS.CRAFTING_TABLE); await t.run('goto 0 5 2');
      t.give(BLOCKS.HAY_BLOCK, 1);
      await t.run('craft 1 wheat'); await t.run('craft 3 bread'); // one craft of a bale gives 9 wheat
      t.check('a hay bale gives 9 wheat, and 3 wheat make a loaf', t.count('bread') === 3 && t.count('wheat') === 0, { bread: t.count('bread'), wheat: t.count('wheat') }, { bread: 3, wheat: 0 });
      const { PROFESSION_TRADES } = await import('/src/villagerEconomy.js');
      const stickTrade = PROFESSION_TRADES.fletcher?.find((tr) => tr.cost?.id === 'stick');
      t.check('a novice fletcher buys 32 sticks for an emerald', stickTrade?.level === 1 && stickTrade.cost.count === 32 && stickTrade.reward?.id === 'emerald' && stickTrade.reward.count === 1,
        stickTrade && { level: stickTrade.level, cost: [stickTrade.cost.id, stickTrade.cost.count], reward: [stickTrade.reward?.id, stickTrade.reward?.count] }, { level: 1, cost: ['stick', 32], reward: ['emerald', 1] });

      // Things not to do: "Four iron ingots and a piece of redstone are the ingredients needed to craft a compass. It
      // points toward the world's spawn point"; Things to do: flint and steel "only cost 1 iron ingot and 1 flint".
      t.give('iron_ingot', 5); t.give('redstone', 1); t.give('flint', 1);
      const iron0 = t.count('iron_ingot');
      await t.run('craft compass'); await t.run('craft flint and steel');
      t.check('a compass is 4 iron and redstone, flint and steel 1 iron and a flint', t.count('compass') === 1 && t.count('flint_and_steel') === 1 && iron0 - t.count('iron_ingot') === 5 && t.count('flint') === 0,
        { compass: t.count('compass'), flintAndSteel: t.count('flint_and_steel'), ironUsed: iron0 - t.count('iron_ingot') }, { compass: 1, flintAndSteel: 1, ironUsed: 5 });
      // Where the compass points is checked with Navigation (shelters group).

      // Things not to do: "avoid eating pufferfish, spider eyes, and poisonous potatoes because they cause the poison
      // effect" (a poisonous potato only 60% of the time).
      const poisoned = {};
      for (const food of ['pufferfish', 'spider_eye']) {
        player.statusEffects.clear(); setHunger(player, 10, 0); t.give(food, 1);
        await t.run(`eat ${food.replace(/_/g, ' ')}`);
        poisoned[food] = player.statusEffects.has('poison');
      }
      let potatoPoison = 0;
      for (let i = 0; i < 10; i++) { player.statusEffects.clear(); setHunger(player, 10, 0); t.give('poisonous_potato', 1); await t.run('eat poisonous potato'); if (player.statusEffects.has('poison')) potatoPoison++; }
      t.check('pufferfish and spider eyes always poison, a poisonous potato often does', poisoned.pufferfish && poisoned.spider_eye && potatoPoison >= 2 && potatoPoison <= 10,
        { ...poisoned, poisonousPotato: `${potatoPoison}/10` }, 'poison, poison, ~6/10');
      player.statusEffects.clear(); setHunger(player, 20, 5); player.health = 20;

      // Things not to do: armadillos "drop scutes once every 5-10 minutes".
      const { ARMADILLO_SCUTE_SECONDS } = await import('/src/armadilloBehavior.js');
      t.check('an armadillo sheds a scute every 5-10 minutes', ARMADILLO_SCUTE_SECONDS?.min === 300 && ARMADILLO_SCUTE_SECONDS?.max === 600, ARMADILLO_SCUTE_SECONDS, { min: 300, max: 600 });

      // Best biomes to play: "In meadows, only sheep, donkeys, and rabbits spawn"; foxes in taiga; polar bears in
      // snowy biomes; "Decaying jungle leaves have only a 2.5% chance to drop saplings".
      const { biomeSpawnsFor } = await import('/src/spawning/biomeSpawnResolver.js');
      const kinds = (b) => (biomeSpawnsFor(b, 'creature') ?? []).map((e) => e.type).sort();
      t.check('meadows spawn only donkeys, rabbits and sheep', JSON.stringify(kinds('meadow')) === JSON.stringify(['donkey', 'rabbit', 'sheep']), kinds('meadow'), ['donkey', 'rabbit', 'sheep']);
      t.check('foxes spawn in taiga, polar bears on snowy plains', kinds('taiga').includes('fox') && kinds('snowy_plains').includes('polar_bear'), { taiga: kinds('taiga'), snowyPlains: kinds('snowy_plains') }, 'fox; polar_bear');
      const { blockDrops } = await import('/src/blockDrops.js');
      let jungle = 0, oak = 0; const N = 8000;
      for (let i = 0; i < N; i++) { jungle += blockDrops(BLOCKS.JUNGLE_LEAVES).filter((d) => d.id === BLOCKS.JUNGLE_SAPLING || d.id === 'jungle_sapling').length; oak += blockDrops(BLOCKS.OAK_LEAVES).filter((d) => d.id === BLOCKS.OAK_SAPLING || d.id === 'oak_sapling').length; }
      t.check('jungle leaves give a sapling 2.5% of the time, oak 5%', Math.abs(jungle / N - 0.025) < 0.008 && Math.abs(oak / N - 0.05) < 0.01, { jungle: +(jungle / N).toFixed(4), oak: +(oak / N).toFixed(4) }, { jungle: 0.025, oak: 0.05 });
      t.notes.push('Not checked, not Java: "In plains biomes zombie horsemen can spawn" (Java spawns zombie horses only from commands and spawn eggs) and "The old growth variants always generate with lush caves below them" (lush caves follow cave biome noise, not the surface biome).');
    },
  },
];
