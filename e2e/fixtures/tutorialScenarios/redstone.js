// Redstone tutorials, played by the bot in the real game. Circuits are laid out with the game's own redstone engine
// (the facing a player gives a repeater by looking is set with `configure`); the bot flips the levers, walks, sneaks and
// places blocks, and the checks read lamps, pistons and comparators.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove } from './_shared.js';

const EAST = 0, WEST = 1, UP = 2, SOUTH = 4;

/** Right-click a block the way a player does: look at it, then use. */
async function use(t, x, y, z) {
  t.game.playerBot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }); t.step();
  t.game.handleRightClick(); t.step();
}
/** A lever on the top of a block. */
function lever(t, x, y, z) { t.set(x, y, z, BLOCKS.LEVER); t.game.world.redstone.attach([x, y, z], { x: 0, y: 1, z: 0 }); }
const lit = (t, x, y, z) => t.game.world.redstone.state([x, y, z])?.on === true;
const red = (t) => t.game.world.redstone;
/** Place the held block on top of the block below (x, y, z) by right-click, without walking (no footsteps). */
async function placeHere(t, x, y, z) { t.game.playerBot.lookAt({ x: x + 0.5, y: y - 0.02, z: z + 0.5 }); t.step(); t.game.handleRightClick(); t.step(); return t.world.getVoxel(x, y, z); }
/** Redstone ticks (0.1 s) until `cond` holds, up to `max`. */
async function ticksUntil(t, cond, max = 40) { for (let i = 0; i <= max * 3; i++) { if (cond()) return +(i / 3).toFixed(2); t.step(); if (i % 15 === 0) await Promise.resolve(); } return null; }

export const SCENARIOS = [
  {
    id: 'redstone.basics',
    tutorial: 'Redstone; Redstone tips; Advanced redstone circuits; Arithmetic logic',
    wiki: W('Redstone'),
    async run(t) {
      const { game } = t;
      // Dust carries a signal 15 blocks: a lamp at the end of 15 dust lights, one more block of dust and it does not.
      t.give('lever', 1);
      lever(t, 0, 5, -6);
      for (let x = 1; x <= 15; x++) t.set(x, 5, -6, BLOCKS.REDSTONE_WIRE);
      t.set(16, 5, -6, BLOCKS.REDSTONE_LAMP);
      lever(t, 0, 5, -8);
      for (let x = 1; x <= 16; x++) t.set(x, 5, -8, BLOCKS.REDSTONE_WIRE);
      t.set(17, 5, -8, BLOCKS.REDSTONE_LAMP);
      await t.run('goto 0 5 -7'); await use(t, 0, 5, -6); await use(t, 0, 5, -8); await t.wait(1);
      t.check('a signal runs 15 blocks of dust: the lamp at 15 lights, the one at 16 does not', lit(t, 16, 5, -6) && !lit(t, 17, 5, -8),
        { at15: lit(t, 16, 5, -6), at16: lit(t, 17, 5, -8) }, { at15: true, at16: false });
      // Redstone tips: "placing a redstone torch on a powered block ... won't realize that it should be turned off until
      // the next tick": the NOT gate answers one redstone tick later.
      t.set(4, 5, 4, BLOCKS.STONE); t.set(4, 6, 4, BLOCKS.REDSTONE_TORCH); lever(t, 3, 5, 4);
      await t.run('goto 2 5 5'); await t.wait(0.5);
      const torch = () => red(t).state([4, 6, 4])?.output ?? 0;
      const before = torch(); await use(t, 3, 5, 4);
      const torchLag = await ticksUntil(t, () => torch() === 0);
      t.check('a torch on a powered block turns off, a redstone tick later (a NOT gate)', before === 15 && torchLag !== null && torchLag >= 0.9 && torchLag <= 2.1,
        { before, offAfterRedstoneTicks: torchLag }, { before: 15, offAfter: 1 });
      // Repeaters: 1 to 4 redstone ticks of delay, set by using them.
      const repeaterRun = async (z, clicks) => {
        lever(t, 6, 5, z); t.set(7, 5, z, BLOCKS.REPEATER); red(t).configure([7, 5, z], EAST); t.set(8, 5, z, BLOCKS.REDSTONE_LAMP);
        await t.run(`goto 7 5 ${z + 1}`);
        for (let i = 0; i < clicks; i++) await use(t, 7, 5, z);
        await t.wait(0.5); await use(t, 6, 5, z);
        return ticksUntil(t, () => lit(t, 8, 5, z));
      };
      const fast = await repeaterRun(8, 0), slow = await repeaterRun(11, 3);
      t.check('a repeater set to 4 delays 3 redstone ticks more than one set to 1', fast !== null && slow !== null && Math.abs(slow - fast - 3) <= 0.4,
        { delay1: fast, delay4: slow }, 'delay 4 = delay 1 + 3 redstone ticks');
      // Arithmetic logic: a comparator in subtract mode outputs the rear signal minus the side signal.
      t.set(12, 5, 0, BLOCKS.REDSTONE_BLOCK);
      t.set(13, 5, 0, BLOCKS.COMPARATOR); red(t).configure([13, 5, 0], EAST);
      // A side input of strength 5: a lever 10 dust away.
      lever(t, 13, 5, 11); for (let z = 1; z <= 10; z++) t.set(13, 5, z, BLOCKS.REDSTONE_WIRE);
      await t.run('goto 14 5 10'); await use(t, 13, 5, 11);
      await t.run('goto 14 5 1'); await use(t, 13, 5, 0); await t.wait(1);
      const cmp = red(t).state([13, 5, 0]);
      t.check('a comparator in subtract mode outputs 15 minus its side signal', cmp?.subtract === true && (red(t).state([13, 5, 1])?.power ?? 0) > 0 && cmp.output === 15 - red(t).state([13, 5, 1]).power,
        { subtract: cmp?.subtract, side: red(t).state([13, 5, 1])?.power, output: cmp?.output }, '15 - side');
      // Redstone tips: "renewable sources of redstone: killing witches ... or trading with Clerics".
      const { MOB_LOOT } = await import('/src/mobLootData.js');
      const witchDrops = JSON.stringify(MOB_LOOT.witch ?? '');
      const { PROFESSION_TRADES } = await import('/src/villagerEconomy.js');
      const clericSells = JSON.stringify(PROFESSION_TRADES.cleric ?? '').includes('redstone');
      t.check('a witch can drop redstone, and a cleric sells it', witchDrops.includes('redstone') && clericSells, { witch: witchDrops.includes('redstone'), cleric: clericSells }, 'both');
      void game;
    },
  },
  {
    id: 'redstone.detectors',
    tutorial: 'Block update detector; Comparator update detector; Daylight detector; Sculk redstone',
    wiki: W('Sculk redstone'),
    async run(t) {
      const { game, player } = t;
      // BUD: an observer facing a block pulses when the block changes.
      t.set(0, 5, -5, BLOCKS.OBSERVER); red(t).configure([0, 5, -5], EAST); t.set(-1, 5, -5, BLOCKS.REDSTONE_LAMP);
      await t.run('goto 1 5 -3'); await t.wait(1);
      t.give(BLOCKS.COBBLESTONE, 1); await t.run('place cobblestone at 1 5 -5');
      const flashed = await ticksUntil(t, () => lit(t, -1, 5, -5), 10);
      t.check('an observer pulses when the block it faces changes', flashed !== null, flashed, 'the lamp behind it flashes');
      // CUD: a comparator reads a chest through a solid block.
      game.chestManager.placeChest(game.world, [4, 5, 0], 0); t.set(5, 5, 0, BLOCKS.STONE);
      t.set(6, 5, 0, BLOCKS.COMPARATOR); red(t).configure([6, 5, 0], EAST); t.set(7, 5, 0, BLOCKS.REDSTONE_LAMP);
      await t.wait(0.5); const empty = lit(t, 7, 5, 0);
      game.chestManager.addItem(4, 5, 0, BLOCKS.COBBLESTONE, true, 64); await t.wait(0.6);
      t.check('a comparator reads a chest through a solid block', !empty && lit(t, 7, 5, 0), { empty, filled: lit(t, 7, 5, 0) }, { empty: false, filled: true });
      // Daylight detector: on at noon, off at night; inverted it is on at night ("lights that turn on at night").
      t.set(10, 5, 0, BLOCKS.DAYLIGHT_DETECTOR); t.set(11, 5, 0, BLOCKS.REDSTONE_WIRE);
      game.worldTime = 6000; await t.wait(1.2); const noon = red(t).state([10, 5, 0])?.output;
      game.worldTime = 18000; await t.wait(1.2); const night = red(t).state([10, 5, 0])?.output;
      await t.run('goto 10 5 1'); await use(t, 10, 5, 0); await t.wait(0.2); const inverted = red(t).state([10, 5, 0])?.output;
      t.check('a daylight detector: 15 at noon, 0 at midnight, 11 at midnight inverted', noon === 15 && night === 0 && inverted === 11, { noon, night, invertedAtNight: inverted }, { noon: 15, night: 0, inverted: 11 });
      game.worldTime = 6000;
      // Sculk redstone: a sensor hears a block placed nearby, more strongly when closer; a sneaking step is silent;
      // wool hides what is behind it.
      t.set(-6, 5, 6, BLOCKS.SCULK_SENSOR); t.set(-5, 5, 6, BLOCKS.REDSTONE_WIRE); t.set(-4, 5, 6, BLOCKS.REDSTONE_LAMP);
      player.position.set(-9.5, 5, 3.5); player.velocity.set(0, 0, 0); await t.wait(3.5);
      const sensor = () => red(t).state([-6, 5, 6]);
      t.give(BLOCKS.COBBLESTONE, 2); await t.run('equip cobblestone'); await placeHere(t, -8, 5, 6);
      const heard = await ticksUntil(t, () => sensor()?.output > 0, 10);
      const strength = sensor()?.output;
      t.check('a sculk sensor hears a block placed 2 blocks away: strength 15 - floor(15/8 x 2) = 12, and lights the lamp', heard !== null && strength === 12 && lit(t, -4, 5, 6),
        { heardAfter: heard, strength, lamp: lit(t, -4, 5, 6) }, { strength: 12, lamp: true });
      await t.wait(3);
      // Sneaking past it.
      player.position.set(-10.5, 5, 4.5); await t.wait(3.5);
      player.botControls = { KeyD: true, ShiftLeft: true };
      let sneakHeard = false; for (let i = 0; i < 60; i++) { t.step(); if (sensor()?.output > 0) sneakHeard = true; if (i % 15 === 0) await Promise.resolve(); }
      player.botControls = null; await t.wait(2.5);
      player.botControls = { KeyA: true };
      let walkHeard = false; for (let i = 0; i < 60; i++) { t.step(); if (sensor()?.output > 0) walkHeard = true; if (i % 15 === 0) await Promise.resolve(); }
      player.botControls = null;
      t.check('sneaking past a sensor is silent; walking past it is heard', !sneakHeard && walkHeard, { sneaking: sneakHeard, walking: walkHeard }, { sneaking: false, walking: true });
      await t.wait(3);
      // Wool between.
      t.fill(-7, 5, 5, -7, 7, 7, BLOCKS.WHITE_WOOL);
      player.position.set(-10.5, 5, 6.5); player.velocity.set(0, 0, 0); await t.wait(3.5); // behind the wool, still
      await t.run('equip cobblestone'); await placeHere(t, -9, 5, 7);
      const behindWool = await ticksUntil(t, () => sensor()?.output > 0, 10);
      t.check('wool between hides the vibration', behindWool === null, behindWool, null);
      // A lectern with a 15-page book: page 7 gives a comparator 7.
      t.set(12, 5, 6, BLOCKS.LECTERN); t.set(13, 5, 6, BLOCKS.COMPARATOR); red(t).configure([13, 5, 6], EAST);
      game.inventory.addItem('writable_book', false, 1);
      const book = game.inventory.hotbar.find((s) => s?.id === 'writable_book'); book.itemData = { pages: Array.from({ length: 15 }, (_, i) => `page ${i + 1}`) };
      await t.run('equip writable book'); await t.run('goto 12 5 7'); await use(t, 12, 5, 6);
      game.inventory.hotbar[game.inventory.activeSlot] = null;
      for (let i = 0; i < 6; i++) await use(t, 12, 5, 6);
      await t.wait(0.5);
      t.check('"page #7 makes it output power level 7"', red(t).state([13, 5, 6])?.output === 7, red(t).state([13, 5, 6])?.output, 7);
      void remove;
    },
  },
  {
    id: 'redstone.pistons',
    tutorial: 'Piston uses; Quasi-connectivity; Soft inversion; Zero-ticking; Instant repeaters',
    wiki: W('Quasi-connectivity'),
    async run(t) {
      // A sticky piston pulls its block back; a plain one leaves it.
      const door = async (z, sticky) => {
        t.set(0, 5, z, sticky ? BLOCKS.STICKY_PISTON : BLOCKS.PISTON); red(t).configure([0, 5, z], EAST);
        t.set(1, 5, z, BLOCKS.STONE); lever(t, -1, 5, z); await t.wait(0.3);
        await t.run(`goto -1 5 ${z + 1}`); await use(t, -1, 5, z); await t.wait(0.6);
        const pushed = t.world.getVoxel(2, 5, z) === BLOCKS.STONE;
        await use(t, -1, 5, z); await t.wait(0.6);
        return { pushed, back: t.world.getVoxel(1, 5, z) === BLOCKS.STONE };
      };
      const sticky = await door(0, true), plain = await door(3, false);
      t.check('a sticky piston pulls its block back; a plain one leaves it pushed', sticky.pushed && sticky.back && plain.pushed && !plain.back, { sticky, plain }, 'sticky back, plain left');
      // Quasi-connectivity: pistons are "activated by anything that would activate the space above them", but "A piston
      // does not always realize it's receiving a redstone signal" until it is updated. A redstone block diagonally above
      // leaves it latent; a block placed beside it then updates it, and it extends. A lamp in the same spot never lights.
      t.set(6, 5, 0, BLOCKS.PISTON); red(t).configure([6, 5, 0], EAST);
      t.set(6, 5, 3, BLOCKS.REDSTONE_LAMP); await t.wait(0.3);
      t.give(BLOCKS.REDSTONE_BLOCK, 2); t.give(BLOCKS.COBBLESTONE, 1); t.set(5, 5, 0, BLOCKS.STONE); t.set(5, 5, 3, BLOCKS.STONE);
      await t.run('goto 4 5 2');
      await t.run('place redstone block at 5 6 0'); await t.run('place redstone block at 5 6 3'); await t.wait(0.6);
      const latent = !!red(t).state([6, 5, 0])?.extended;
      await t.run('place cobblestone at 6 5 -1'); await t.wait(0.6);
      const extended = !!red(t).state([6, 5, 0])?.extended;
      t.check('quasi-connectivity: latent until updated, then the piston extends; the lamp stays dark', !latent && extended && !lit(t, 6, 5, 3), { beforeUpdate: latent, afterUpdate: extended, lamp: lit(t, 6, 5, 3) }, { beforeUpdate: false, afterUpdate: true, lamp: false });
      // Zero-ticking: "All 0-tick pulses are created by powering a redstone line then removing the power source with
      // pistons later in the tick"; a sticky piston given one "instantly drop[s] their block". A repeater powers block X,
      // X powers the line to sticky piston P, and piston A under X pushes X away in the same tick.
      const zx = 20;
      t.fill(zx - 1, 4, -2, zx + 4, 4, 6, BLOCKS.STONE);
      lever(t, zx, 5, 0); t.set(zx + 1, 5, 0, BLOCKS.REPEATER); red(t).configure([zx + 1, 5, 0], EAST);
      t.set(zx + 2, 5, 0, BLOCKS.STONE); t.set(zx + 2, 4, 0, BLOCKS.STICKY_PISTON); red(t).configure([zx + 2, 4, 0], UP);
      t.set(zx + 2, 5, 1, BLOCKS.REDSTONE_WIRE); t.set(zx + 2, 5, 2, BLOCKS.REDSTONE_WIRE);
      t.set(zx + 2, 5, 3, BLOCKS.STICKY_PISTON); red(t).configure([zx + 2, 5, 3], SOUTH); t.set(zx + 2, 5, 4, BLOCKS.COBBLESTONE);
      await t.wait(0.5); await t.run(`goto ${zx} 5 2`);
      let seenExtended = false; await use(t, zx, 5, 0);
      for (let i = 0; i < 30; i++) { t.step(); if (red(t).state([zx + 2, 5, 3])?.extended) seenExtended = true; }
      t.check('a 0-tick pulse teleports the block a sticky piston pushes, the piston never seen extended', t.world.getVoxel(zx + 2, 5, 5) === BLOCKS.COBBLESTONE && t.world.getVoxel(zx + 2, 5, 4) === BLOCKS.AIR && !seenExtended,
        { block: t.world.getVoxel(zx + 2, 5, 5) === BLOCKS.COBBLESTONE ? 'moved one on' : 'not moved', pistonSeenExtended: seenExtended }, { block: 'moved one on', pistonSeenExtended: false });
      // Instant repeaters: "refresh a redstone signal with absolutely no delay" -- the tutorial's schematic, side view:
      // lever, dust, dust, wool under a sticky piston (east) with a block of redstone on its face, a sticky piston (west)
      // holding the wool, and the output dust on the far block.
      const ix = 30, iz = 8;
      t.fill(ix - 1, 4, iz, ix + 9, 4, iz, BLOCKS.STONE);
      lever(t, ix, 5, iz); t.set(ix + 1, 5, iz, BLOCKS.REDSTONE_WIRE); t.set(ix + 2, 5, iz, BLOCKS.REDSTONE_WIRE);
      t.set(ix + 3, 5, iz, BLOCKS.WHITE_WOOL);
      t.set(ix + 5, 5, iz, BLOCKS.STICKY_PISTON); red(t).configure([ix + 5, 5, iz], WEST);
      t.set(ix + 6, 5, iz, BLOCKS.BLACK_WOOL); t.set(ix + 7, 5, iz, BLOCKS.REDSTONE_WIRE);
      t.set(ix + 3, 6, iz, BLOCKS.STICKY_PISTON); red(t).configure([ix + 3, 6, iz], EAST);
      t.set(ix + 4, 6, iz, BLOCKS.REDSTONE_BLOCK); t.set(ix + 6, 6, iz, BLOCKS.REDSTONE_WIRE);
      await t.wait(1); await t.run(`goto ${ix} 5 ${iz + 1}`);
      const outPower = () => red(t).state([ix + 6, 6, iz])?.power ?? 0, inPower = () => red(t).state([ix + 2, 5, iz])?.power ?? 0;
      await use(t, ix, 5, iz);
      let inTick = null, outTick = null; const tick0 = red(t).tickNumber;
      for (let i = 0; i < 30 && outTick === null; i++) { t.step(); if (inTick === null && inPower() > 0) inTick = red(t).tickNumber; if (outPower() > 0) outTick = red(t).tickNumber; }
      const refreshed = outPower();
      await t.wait(1); await use(t, ix, 5, iz); await t.wait(1); const reset = outPower();
      t.check('an instant repeater: the output comes on in the same redstone tick as the input, at full strength, and resets', inTick !== null && outTick === inTick && refreshed === 15 && reset === 0,
        { inputTick: inTick === null ? null : inTick - tick0, outputTick: outTick === null ? null : outTick - tick0, strength: refreshed, afterInputOff: reset }, { sameTick: true, strength: 15, afterInputOff: 0 });
      t.notes.push('Soft inversion is a Bedrock Edition mechanic ("optimized for bedrock redstone tick speeds"), not checked. The instant repeater here holds its output while the input is on, where the tutorial says the Java build emits 2-redstone-tick pulses.');
    },
  },
  {
    id: 'redstone.circuits',
    tutorial: 'Tripwire techniques; Hourly clock; Morse code; Telegraph; Printing; Calculator; Redstone computers; Command stats; 360 degree ender pearl cannon',
    wiki: W('Tripwire techniques'),
    async run(t) {
      const { game, player } = t;
      // A tripwire: two hooks and string; walking through it powers the hooks. "Sheared tripwire never signals".
      t.set(0, 5, 0, BLOCKS.TRIPWIRE_HOOK); red(t).configure([0, 5, 0], SOUTH);
      for (let z = 1; z <= 3; z++) t.set(0, 5, z, BLOCKS.TRIPWIRE);
      t.set(0, 5, 4, BLOCKS.TRIPWIRE_HOOK); red(t).configure([0, 5, 4], 5);
      t.set(-1, 5, 0, BLOCKS.REDSTONE_LAMP);
      await t.run('goto -2 5 2'); await t.wait(0.5);
      player.botControls = { KeyW: true }; let tripped = false;
      for (let i = 0; i < 60; i++) { game.playerBot.lookAt({ x: 3, y: 5.6, z: 2.5 }); t.step(); if ((red(t).state([0, 5, 0])?.output ?? 0) > 0) tripped = true; if (i % 15 === 0) await Promise.resolve(); }
      player.botControls = null; await t.wait(1.5);
      t.check('walking through a tripwire powers its hooks', tripped, tripped, true);
      // "A tripwire hook activates for 5 redstone ticks ... when any of its tripwires are destroyed, except when shears
      // are used": broken by hand it fires; cut with shears it does not.
      const hook0 = () => red(t).state([0, 5, 0])?.output ?? 0;
      const breakString = async (z) => { const r = await t.breakBlock(0, 5, z, { maxTicks: 60 }); let fired = false; for (let i = 0; i < 20; i++) { t.step(); if (hook0() > 0) fired = true; } return { cut: r.broken, fired }; };
      await t.run('goto -1 5 2'); t.game.inventory.hotbar[t.game.inventory.activeSlot] = null;
      const byHand = await breakString(2);
      t.set(0, 5, 2, BLOCKS.TRIPWIRE); await t.wait(1);
      t.give('shears', 1); await t.run('equip shears');
      const sheared = await breakString(3);
      t.check('string broken by hand trips the hooks; cut with shears it does not', byHand.cut && byHand.fired && sheared.cut && !sheared.fired, { byHand, sheared }, { byHand: 'fired', sheared: 'silent' });
      // Hourly clock: "one in-game hour is equal to 50 seconds of real-time" -- a day is 24,000 ticks, 20 minutes.
      const t0 = game.worldTime; await t.wait(50); const hour = Math.round(game.worldTime - t0);
      t.check('an in-game hour (1,000 ticks) passes in 50 seconds', Math.abs(hour - 1000) <= 2, hour, 1000);
      // Telegraph / Morse code: a note block sounds on each rising edge of its input.
      t.set(4, 5, 0, BLOCKS.NOTE_BLOCK); lever(t, 4, 5, 1);
      let notes = 0; const play = red(t).playNote?.bind(red(t)); red(t).playNote = (s) => { notes++; return play?.(s); };
      await t.run('goto 5 5 2');
      for (let i = 0; i < 3; i++) { await use(t, 4, 5, 1); await t.wait(0.3); await use(t, 4, 5, 1); await t.wait(0.3); }
      red(t).playNote = play;
      t.check('a note block sounds once per signal (three dots, three notes)', notes === 3, notes, 3);
      t.notes.push('Printing, Calculator and Redstone computers are large builds out of the same gates checked in redstone.basics; Command stats needs command blocks (not in this game); the 360 degree ender pearl cannon is a TNT cannon (mechanisms group).');
    },
  },
];
