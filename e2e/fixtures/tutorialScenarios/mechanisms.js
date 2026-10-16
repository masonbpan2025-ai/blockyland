// Mechanism tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove } from './_shared.js';

const EAST = 0, UP = 2, DOWN = 3, SOUTH = 4;
const red = (t) => t.game.world.redstone;
const lit = (t, x, y, z) => red(t).state([x, y, z])?.on === true;
async function use(t, x, y, z) { t.game.playerBot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }); t.step(); t.game.handleRightClick(); t.step(); }
function lever(t, x, y, z) { t.set(x, y, z, BLOCKS.LEVER); red(t).attach([x, y, z], { x: 0, y: 1, z: 0 }); }
const chestCount = (game, x, y, z, id) => (game.chestManager.getChest(x, y, z)?.items ?? []).filter(Boolean).reduce((n, s) => n + (s.id === id ? s.count : 0), 0);

export const SCENARIOS = [
  {
    id: 'mechanisms.items',
    tutorial: 'Hopper; Item sorting; Item transportation; Crafter; Shulker box storage; Randomizers',
    wiki: W('Item transportation'),
    async run(t) {
      const { game } = t;
      const cm = game.chestManager;
      game.player.position.set(2.5, 5, -3.5); // clear of the hopper line built over the origin
      // "By placing a line of hoppers all pointing into each other, items can be transported at a throughput of 2.5"
      // items a second; "The hopper underneath is powered so that it cannot remove items".
      t.set(1, 6, 0, BLOCKS.HOPPER); red(t).configure([1, 6, 0], EAST); // fed from the chest above it
      cm.placeChest(game.world, [1, 7, 0], 0);
      for (let x = 2; x <= 4; x++) { t.set(x, 6, 0, BLOCKS.HOPPER); red(t).configure([x, 6, 0], EAST); }
      cm.placeChest(game.world, [5, 6, 0], 0);
      cm.addItem(1, 7, 0, BLOCKS.COBBLESTONE, true, 20);
      await t.wait(3); const at3 = chestCount(game, 5, 6, 0, BLOCKS.COBBLESTONE);
      await t.wait(4); const at7 = chestCount(game, 5, 6, 0, BLOCKS.COBBLESTONE);
      await t.wait(3); const after10 = chestCount(game, 5, 6, 0, BLOCKS.COBBLESTONE);
      t.check('a hopper line moves 2.5 items a second (10 in 4 s), and all 20 arrive', Math.abs((at7 - at3) / 4 - 2.5) <= 0.25 && after10 === 20, { at3s: at3, at7s: at7, perSecond: (at7 - at3) / 4, after10s: after10 }, { perSecond: 2.5, after10s: 20 });
      // A powered hopper is locked.
      cm.placeChest(game.world, [0, 7, 4], 0); t.set(0, 6, 4, BLOCKS.HOPPER); red(t).configure([0, 6, 4], DOWN); cm.placeChest(game.world, [0, 5, 4], 0);
      lever(t, 1, 6, 4); await t.run('goto 2 5 5'); await use(t, 1, 6, 4);
      cm.addItem(0, 7, 4, BLOCKS.COBBLESTONE, true, 4); await t.wait(3);
      const locked = chestCount(game, 0, 5, 4, BLOCKS.COBBLESTONE);
      await use(t, 1, 6, 4); await t.wait(3);
      t.check('a hopper powered by redstone passes nothing; unpowered it works again', locked === 0 && chestCount(game, 0, 5, 4, BLOCKS.COBBLESTONE) === 4, { whilePowered: locked, after: chestCount(game, 0, 5, 4, BLOCKS.COBBLESTONE) }, { whilePowered: 0, after: 4 });
      // Crafter: "If a crafter receives a redstone signal, the product drops out of the front"; a comparator reads "the
      // number of crafting slots that are either disabled or occupied".
      t.set(8, 5, 8, BLOCKS.CRAFTER); red(t).configure([8, 5, 8], EAST);
      const crafter = red(t).state([8, 5, 8]);
      crafter.inventory = Array.from({ length: 9 }, (_, i) => ([0, 1, 3, 4].includes(i) ? { id: BLOCKS.OAK_PLANKS, isBlock: true, count: 1 } : null));
      t.set(7, 5, 8, BLOCKS.COMPARATOR); red(t).configure([7, 5, 8], 1); await t.wait(0.5);
      const reads = red(t).state([7, 5, 8])?.output;
      const before = new Set(game.entities.droppedItems);
      lever(t, 8, 5, 9); await t.run('goto 9 5 10'); await use(t, 8, 5, 9); await t.wait(1);
      const out = game.entities.droppedItems.filter((d) => !before.has(d)).map((d) => d.itemType);
      t.check('a crafter with 4 planks reads 4 on a comparator, and a pulse drops a crafting table', reads === 4 && out.includes(BLOCKS.CRAFTING_TABLE), { comparator: reads, dropped: out }, { comparator: 4, dropped: 'crafting table' });
      // Water carries items: "water can flow only 7 blocks from the source".
      t.fill(-10, 4, -10, -2, 4, -10, BLOCKS.STONE); t.fill(-10, 5, -11, -2, 5, -11, BLOCKS.STONE); t.fill(-10, 5, -9, -2, 5, -9, BLOCKS.STONE);
      t.set(-10, 5, -10, BLOCKS.WATER); await t.wait(6);
      let reach = 0; for (let x = -9; x <= -2; x++) if (t.world.getVoxel(x, 5, -10) === BLOCKS.WATER) reach = x + 10;
      t.check('water flows 7 blocks from its source', reach === 7, reach, 7);
      // Randomizers: "droppers dispense items in random order".
      t.set(12, 5, 0, BLOCKS.DROPPER); red(t).configure([12, 5, 0], UP);
      const drop = red(t).state([12, 5, 0]);
      const firsts = new Set();
      for (let k = 0; k < 12; k++) {
        drop.inventory = [{ id: 'stick', isBlock: false, count: 1 }, { id: 'bone', isBlock: false, count: 1 }, { id: 'string', isBlock: false, count: 1 }];
        const seen = new Set(game.entities.droppedItems); red(t).dispense(drop);
        const d = game.entities.droppedItems.find((x) => !seen.has(x)); if (d) firsts.add(d.itemType);
      }
      t.check('a dropper picks a random filled slot', firsts.size >= 2, [...firsts], 'more than one kind first');
    },
  },
  {
    id: 'mechanisms.minecarts',
    tutorial: 'Minecarts; Storage minecarts; Digital minecart storage system; Minecart trains; Furnace minecarts',
    wiki: W('Minecarts'),
    async run(t) {
      const { game } = t;
      const rails = game.railSystem;
      // "Minecarts move at 8 m/s at top speed on a straight track"; "travels 309m from full speed".
      rails.layTrack([0, 5, 0], [100, 5, 0], { every: 1 });
      t.set(0, 4, 1, BLOCKS.REDSTONE_BLOCK);
      const cart = rails.spawnCart([0, 5, 0], { rider: { position: new (game.player.position.constructor)() } });
      cart.speed = 0.5; cart.heading = [1, 0, 0];
      for (const x of [0]) t.set(x, 5, -1, BLOCKS.REDSTONE_BLOCK);
      rails.railIsPowered = () => true;
      const x0 = cart.rail[0] + (cart.progress || 0); await t.wait(1); const x1 = cart.rail[0] + (cart.progress || 0);
      let peak = 0; for (let i = 0; i < 60; i++) { const a = cart.rail[0] + cart.progress; t.step(); peak = Math.max(peak, (cart.rail[0] + cart.progress - a) * 30); if (i % 15 === 0) await Promise.resolve(); }
      delete rails.railIsPowered;
      t.check('a cart on powered rail tops out at 8 blocks a second', Math.abs(peak - 8) < 0.5, { firstSecond: +(x1 - x0).toFixed(1), peak: +peak.toFixed(2) }, { peak: 8 });
      rails.remove(cart);
      // A furnace minecart: 4 blocks a second on coal.
      // On plain rail: an unpowered powered rail brakes any cart, a furnace minecart included.
      rails.layTrack([0, 5, 3], [100, 5, 3]);
      const furnace = rails.spawnCart([0, 5, 3], { subType: 'furnace_minecart' }); furnace.heading = [1, 0, 0];
      rails.addFuel(furnace, 3600); await t.wait(2);
      const f0 = furnace.rail[0] + furnace.progress; await t.wait(3); const fRate = (furnace.rail[0] + furnace.progress - f0) / 3;
      t.check('a furnace minecart moves at 4 blocks a second', Math.abs(fRate - 4) < 0.35, +fRate.toFixed(2), 4);
      rails.remove(furnace);
      // Storage minecarts: a hopper under the track fills a chest from a chest minecart.
      rails.layTrack([0, 6, 6], [4, 6, 6]);
      t.set(2, 5, 6, BLOCKS.HOPPER); red(t).configure([2, 5, 6], DOWN); game.chestManager.placeChest(game.world, [2, 4, 6], 0);
      const chestCart = rails.spawnCart([2, 6, 6], { subType: 'chest_minecart' });
      rails.addCartItem(chestCart, BLOCKS.COBBLESTONE, true, 10);
      await t.wait(6);
      t.check('a hopper under the rail empties a chest minecart into a chest', chestCount(game, 2, 4, 6, BLOCKS.COBBLESTONE) === 10, chestCount(game, 2, 4, 6, BLOCKS.COBBLESTONE), 10);
    },
  },
  {
    id: 'mechanisms.golems',
    tutorial: 'Iron golems; Snow golems',
    wiki: W('Iron golems'),
    async run(t) {
      const { game, player } = t;
      // "To create an iron golem, build cross consisting of 4 iron blocks and a carved pumpkin as the topmost block."
      t.give(BLOCKS.IRON_BLOCK, 4); t.give(BLOCKS.CARVED_PUMPKIN, 1);
      await t.run('goto 1 5 3');
      await t.run('place iron block at 0 5 0'); await t.run('place iron block at 0 6 0'); await t.run('place iron block at -1 6 0'); await t.run('place iron block at 1 6 0');
      // The head goes on the top face, which a player sees from above: the bot stands on a two-block pillar.
      t.fill(0, 5, 3, 0, 6, 3, BLOCKS.STONE); t.player.position.set(0.5, 7, 3.5); t.player.velocity.set(0, 0, 0); await t.wait(0.3);
      game.playerBot.lookAt({ x: 0.5, y: 6.99, z: 0.5 }); t.step();
      game.inventory.activeSlot = game.inventory.hotbar.findIndex((s) => s?.id === BLOCKS.CARVED_PUMPKIN); game.handleRightClick(); await t.wait(1);
      const golem = game.mobs.mobs.find((m) => m.type === 'iron_golem');
      t.check('four iron blocks and a carved pumpkin make an iron golem', !!golem && t.world.getVoxel(0, 6, 0) === BLOCKS.AIR, { golem: !!golem, blocksLeft: t.world.getVoxel(0, 6, 0) }, 'a golem, the blocks gone');
      if (golem) {
        // "Iron golems have 100 HP"; "repaired using iron ingots to heal them by 25 HP per iron ingot"; "immune to ...
        // taking damage from falls"; "iron golems created by a player won't attack you even if you attack them".
        const hp = golem.maxHealth;
        golem.health = 50; t.give('iron_ingot', 1); await t.run('equip iron ingot');
        for (let i = 0; i < 20 && game.targetMob !== golem; i++) { game.playerBot.lookAt({ x: golem.mesh.position.x, y: golem.mesh.position.y + 1.5, z: golem.mesh.position.z }); t.step(); }
        game.handleRightClick(); await t.wait(0.3);
        const healed = golem.health;
        golem.frozen = false; golem.mesh.position.y += 12; golem.fallDistance = 0; await t.wait(3);
        const afterFall = golem.health;
        player.health = 20; game.mobs.damageMob(golem, 1, player.position, true, player); await t.wait(5);
        t.check('a built golem: 100 HP, +25 per iron ingot, no fall damage, and it does not turn on its maker', hp === 100 && healed === 75 && afterFall === 75 - 1 * 0 && player.health === 20,
          { maxHp: hp, healed, afterFall, playerHp: player.health }, { maxHp: 100, healed: 75, afterFall: 75, playerHp: 20 });
        remove(game, golem);
      }
      // Snow golems: "small health (4 HP)"; "deal no damage to most mobs, except to blazes 3 HP".
      t.give(BLOCKS.SNOW, 2); t.give(BLOCKS.CARVED_PUMPKIN, 1);
      t.player.position.set(2.5, 5, 4.5); t.player.velocity.set(0, 0, 0); await t.wait(0.3);
      await t.run('goto 5 5 3'); await t.run('place snow at 4 5 0'); await t.run('place snow at 4 6 0');
      t.fill(4, 5, 3, 4, 6, 3, BLOCKS.STONE); t.player.position.set(4.5, 7, 3.5); t.player.velocity.set(0, 0, 0); await t.wait(0.3); game.playerBot.lookAt({ x: 4.5, y: 6.99, z: 0.5 }); t.step();
      game.inventory.activeSlot = game.inventory.hotbar.findIndex((s) => s?.id === BLOCKS.CARVED_PUMPKIN); game.handleRightClick(); await t.wait(1);
      const snowman = game.mobs.mobs.find((m) => m.type === 'snow_golem');
      t.check('two snow blocks and a carved pumpkin make a snow golem with 4 HP', !!snowman && snowman.maxHealth === 4, { golem: !!snowman, hp: snowman?.maxHealth }, { hp: 4 });
    },
  },
  {
    id: 'mechanisms.traps',
    tutorial: 'Traps; Trap design; Trapdoor uses; Combination locks; Automatic double doors; TNT cannons; Automatic respawn anchor recharger; Flying machines; Observer stabilizer; Mechanisms; Rube Goldberg machine; Redstone music; Command blocks and functions',
    wiki: W('Traps'),
    async run(t) {
      const { game } = t;
      // Traps: "Stone pressure plates measure only players and mobs"; a wooden one also counts items.
      t.set(0, 5, 0, BLOCKS.STONE_PRESSURE_PLATE ?? BLOCKS.PRESSURE_PLATE); t.set(3, 5, 0, BLOCKS.OAK_PRESSURE_PLATE);
      const plate = (x) => red(t).state([x, 5, 0])?.output ?? 0;
      const V = game.player.position.constructor;
      game.entities.spawnDroppedItem(new V(0.5, 5.3, 0.5), 'stick', false, 1); game.entities.spawnDroppedItem(new V(3.5, 5.3, 0.5), 'stick', false, 1);
      await t.wait(1.5);
      t.check('an item sets off a wooden pressure plate, not a stone one', plate(0) === 0 && plate(3) === 15, { stone: plate(0), wooden: plate(3) }, { stone: 0, wooden: 15 });
      // Trapdoor uses: "zombies cannot break down wooden trapdoors, despite them being able to break down wooden doors"
      // (on Hard). A zombie that can break doors, the player behind a door; another behind a trapdoor.
      game.difficulty = 'hard'; game.worldTime = 18000;
      // The player shut in a stone box; its only way in is a wooden door (the second box: a trapdoor).
      const box = (x0, opening) => { t.fill(x0, 5, 4, x0 + 4, 7, 8, BLOCKS.STONE); t.fill(x0 + 1, 5, 5, x0 + 3, 6, 7, BLOCKS.AIR); opening(x0); };
      box(5, (x0) => { t.set(x0, 5, 6, BLOCKS.OAK_DOOR); t.set(x0, 6, 6, BLOCKS.OAK_DOOR_TOP); });
      game.player.position.set(7.5, 5, 6.5); game.player.health = 20;
      const z = t.spawn('zombie', 2.5, 5, 6.5); z.canBreakDoors = true; z.attackCooldown = 99;
      await t.wait(13);
      const doorGone = t.world.getVoxel(5, 6, 6) !== BLOCKS.OAK_DOOR_TOP;
      t.notes.push(`zombie at ${z.mesh.position.toArray().map((v) => v.toFixed(1))}, breaking ${JSON.stringify(z.doorBreak)}`);
      remove(game, z);
      box(12, (x0) => { t.set(x0, 5, 6, BLOCKS.AIR); t.set(x0, 6, 6, BLOCKS.OAK_TRAPDOOR); });
      game.player.position.set(14.5, 5, 6.5);
      const z2 = t.spawn('zombie', 9.5, 5, 6.5); z2.canBreakDoors = true; z2.attackCooldown = 99;
      await t.wait(13);
      const trapKept = t.world.getVoxel(12, 6, 6) === BLOCKS.OAK_TRAPDOOR;
      remove(game, z2); game.difficulty = 'normal'; game.worldTime = 1000;
      t.check('on Hard a zombie breaks down a wooden door, never a trapdoor', doorGone && trapKept, { doorBroken: doorGone, trapdoorKept: trapKept }, { doorBroken: true, trapdoorKept: true });
      // Combination locks: "Items in item frames can be rotated into 8 different positions. This rotation can be detected
      // by a comparator which will output a signal strength from 1 to 8".
      t.set(14, 5, 0, BLOCKS.STONE); t.set(14, 5, 1, BLOCKS.COMPARATOR); red(t).configure([14, 5, 1], SOUTH);
      t.give('item_frame', 1); t.give('stick', 1);
      game.player.position.set(14.5, 5, -2.5); await t.wait(0.3);
      await t.run('equip item frame'); await use(t, 14, 5, 0);
      game.player.position.set(14.5, 5, -3.5); await t.wait(0.2);
      // The frame hangs on the stone's north face; the comparator on the far side reads it through the stone.
      const framed = game.itemFrames.frames[0];
      t.set(14, 5, 1, BLOCKS.AIR); t.set(14, 5, -1 + 2, BLOCKS.AIR);
      t.set(14, 5, 1, BLOCKS.COMPARATOR); red(t).configure([14, 5, 1], SOUTH);
      await t.run('equip stick');
      const turns = [];
      for (let i = 0; i < 5; i++) { await use(t, 14, 5, -1); await t.wait(0.3); turns.push(red(t).state([14, 5, 1])?.output); }
      t.check('a framed item turned 5 times reads 1 to 5 on a comparator', !!framed && JSON.stringify(turns) === JSON.stringify([1, 2, 3, 4, 5]), turns, [1, 2, 3, 4, 5]);
      // Automatic respawn anchor recharger: a dispenser "refill[s] the anchor as long as it's provided with glowstone".
      t.set(20, 5, 0, BLOCKS.RESPAWN_ANCHOR); t.set(19, 5, 0, BLOCKS.DISPENSER); red(t).configure([19, 5, 0], EAST);
      red(t).state([19, 5, 0]).inventory = [{ id: BLOCKS.GLOWSTONE, isBlock: true, count: 5 }];
      lever(t, 18, 5, 0); await t.run('goto 18 5 1');
      for (let i = 0; i < 5; i++) { await use(t, 18, 5, 0); await t.wait(0.3); await use(t, 18, 5, 0); await t.wait(0.3); }
      const { anchorCharges } = await import('/src/respawnAnchor.js');
      t.check('a dispenser charges a respawn anchor with glowstone, up to 4', anchorCharges(t.world, 20, 5, 0) === 4 && red(t).state([19, 5, 0]).inventory[0]?.count === 1, { charges: anchorCharges(t.world, 20, 5, 0), glowstoneLeft: red(t).state([19, 5, 0]).inventory[0]?.count }, { charges: 4, glowstoneLeft: 1 });
      // Flying machines: "A two-way engine can be made with as few as 6 blocks -- 2 observers, 2 slime blocks, and 2
      // sticky pistons" (Engine B in the Java engine gallery: each observer powers a slime block). "many engines stop only
      // when they run into an obstacle": an obsidian wall ahead stops it.
      const fy = 12, fx = 20, N = 5, S = 4, E = 0, Wd = 1;
      t.set(fx, fy, 0, BLOCKS.OBSERVER); red(t).configure([fx, fy, 0], N);
      t.set(fx, fy, 1, BLOCKS.SLIME_BLOCK); t.set(fx + 1, fy, 1, BLOCKS.STICKY_PISTON); red(t).configure([fx + 1, fy, 1], Wd);
      t.set(fx, fy, 2, BLOCKS.STICKY_PISTON); red(t).configure([fx, fy, 2], E); t.set(fx + 1, fy, 2, BLOCKS.SLIME_BLOCK);
      t.set(fx + 1, fy, 3, BLOCKS.OBSERVER); red(t).configure([fx + 1, fy, 3], S);
      t.fill(fx + 14, fy - 1, -1, fx + 14, fy + 1, 4, BLOCKS.OBSIDIAN);
      await t.wait(1);
      // Started by a single update in front of an observer, as the tutorial's "fully automatic engine".
      t.set(fx, fy, -1, BLOCKS.STONE); await t.wait(0.3); t.set(fx, fy, -1, BLOCKS.AIR);
      const slimeX = () => { let m = -1; for (let x = fx; x < fx + 14; x++) if (t.world.getVoxel(x, fy, 2) === BLOCKS.SLIME_BLOCK) m = x; return m; };
      await t.wait(2); const after2 = slimeX(); await t.wait(6); const after8 = slimeX(); await t.wait(2); const after10 = slimeX();
      t.check('a 6-block engine of observers, slime and sticky pistons flies, and stops at an obsidian wall', after2 > fx + 3 && after8 === fx + 13 && after10 === after8,
        { start: fx + 1, after2s: after2, after8s: after8, after10s: after10 }, { stopsAt: fx + 13 });
      t.notes.push('TNT cannons, the Rube Goldberg machine and Redstone music are builds from parts checked elsewhere (TNT, pistons, note blocks); Command blocks are not in this game.');
    },
  },
];
