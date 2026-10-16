// Farming tutorials (mob and animal farms), played in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove } from './_shared.js';

const xpOrbs = (game) => (game.entities.xpOrbs ?? game.entities.orbs ?? []).length;
const dropsNear = (game, before, x, z, r = 3) => game.entities.droppedItems.filter((d) => !before.has(d) && Math.hypot(d.group.position.x - x, d.group.position.z - z) < r);

export const SCENARIOS = [
  {
    id: 'farms.grinders',
    tutorial: 'Mob farm; Mob grinder; Monster spawner traps; Cave spider farming; Creeper farming; Witch farming; Blaze farming; Wither skeleton farming',
    wiki: W('Mob grinder'),
    async run(t) {
      const { game } = t;
      game.worldTime = 18000;
      // "Most common hostile mobs can be killed with a 24-block drop, although witches require 30 blocks"; "the mobs drop
      // experience only if killed by the player, not by automated means".
      const drop = async (type, x, h) => {
        const before = new Set(game.entities.droppedItems), orbs = xpOrbs(game);
        const m = t.spawn(type, x + 0.5, 5 + h, 0.5); m.fallDistance = 0; m.persistent = true;
        for (let i = 0; i < 30 * 6 && m.health > 0; i++) { t.step(); if (i % 15 === 0) await Promise.resolve(); }
        await t.wait(1.5);
        return { dead: m.health <= 0, hp: +m.health.toFixed(1), drops: dropsNear(game, before, x + 0.5, 0.5).length, orbs: xpOrbs(game) - orbs, mob: m };
      };
      const zombie24 = await drop('zombie', 0, 24), witch24 = await drop('witch', 6, 24);
      remove(game, witch24.mob);
      const witch30 = await drop('witch', 12, 30);
      t.check('a 24-block fall kills a zombie, not a witch; 30 blocks kills a witch', zombie24.dead && !witch24.dead && witch30.dead, { zombie24: zombie24.dead, witch24: witch24.hp, witch30: witch30.dead }, { zombie24: true, witch24: 'alive', witch30: true });
      t.check('mobs killed by the fall drop items but no experience', zombie24.drops + witch30.drops > 0 && zombie24.orbs === 0 && witch30.orbs === 0, { drops: zombie24.drops + witch30.drops, orbs: zombie24.orbs + witch30.orbs }, { orbs: 0 });
      // Witch farming: "They have 26 HP"; "The redstone is guaranteed to drop in 1.21 and above".
      const witch = t.spawn('witch', 18.5, 5, 0.5); const hp = witch.maxHealth;
      const before = new Set(game.entities.droppedItems);
      game.mobs.damageMob(witch, 99, game.player.position, false, game.player); await t.wait(1.5);
      const red = dropsNear(game, before, 18.5, 0.5).filter((d) => d.itemType === 'redstone').reduce((n, d) => n + d.count, 0);
      t.check('a witch has 26 HP and always drops 4-8 redstone', hp === 26 && red >= 4 && red <= 8, { hp, redstone: red }, { hp: 26, redstone: '4-8' });
      // Blaze farming: "Blazes drop twice as much experience as normal mobs while only having 20 health points".
      const blaze = t.spawn('blaze', 24.5, 6, 0.5);
      const { MobManager } = await import('/src/mobs.js');
      t.check('a blaze has 20 HP', blaze.maxHealth === 20, blaze.maxHealth, 20);
      remove(game, blaze); void MobManager;
      // Monster spawner traps: a spawner works only with a player within 16 blocks, in the dark.
      t.fill(-14, 5, -14, -6, 8, -6, BLOCKS.STONE); t.fill(-13, 5, -13, -7, 7, -7, BLOCKS.AIR);
      t.set(-10, 5, -10, BLOCKS.SPAWNER);
      game.world.structureOrientations.set('-10,5,-10', { x: -10, y: 5, z: -10, id: BLOCKS.SPAWNER, spawner: 'zombie' });
      game.player.position.set(30.5, 5, 30.5); await t.wait(8);
      const far = game.mobs.mobs.filter((m) => m.type === 'zombie' && m.mesh.position.distanceTo({ x: -9.5, y: 5, z: -9.5 }) < 6).length;
      game.player.position.set(-10.5, 9.5, -2.5); await t.wait(8);
      const near = game.mobs.mobs.filter((m) => m.type === 'zombie' && m.mesh.position.distanceTo({ x: -9.5, y: 5, z: -9.5 }) < 6).length;
      t.check('a zombie spawner stays idle with the player 50 blocks away and spawns with the player within 16', far === 0 && near >= 1 && near <= 6, { far, near }, { far: 0, near: '1-6' });
      for (const m of [...game.mobs.mobs]) remove(game, m);
      game.worldTime = 6000;
    },
  },
  {
    id: 'farms.animals',
    tutorial: 'Animal farming; Chicken farming; Cat farming; Wolf and fox farming; Goat farming; Turtle farming; Axolotl farming; Bee farming; Allay farming; Resin farming',
    wiki: W('Chicken farming'),
    async run(t) {
      const { game } = t;
      // Chicken farming: "Each adult chicken will lay an average of 8 eggs per hour" (one every 5-10 minutes).
      const hen = t.spawn('chicken', 3.5, 5, 3.5); hen.eggTimer = 0.01; await t.wait(0.2);
      t.check('after laying, a chicken waits 5 to 10 minutes for the next egg', hen.eggTimer >= 299 && hen.eggTimer <= 600, +hen.eggTimer.toFixed(0), '300-600 s');
      // "There is only a 1 in 8 chance of spawning a chicken when you throw an egg".
      const chicks = () => game.mobs.mobs.filter((m) => m.type === 'chicken' && m.isBaby).length;
      t.fill(-2, 5, 10, 2, 7, 10, BLOCKS.STONE);
      t.give('egg', 16); t.give('egg', 16); t.give('egg', 16); t.give('egg', 16); await t.run('equip egg');
      game.player.position.set(0.5, 5, 6.5);
      const eggs0 = t.count('egg');
      for (let i = 0; i < 64; i++) { if (game.inventory.getActiveItem()?.id !== 'egg') await t.run('equip egg'); game.playerBot.lookAt({ x: 0.5, y: 6, z: 10 }); t.step(); game.handleRightClick(); for (let k = 0; k < 6; k++) t.step(); if (i % 8 === 0) await Promise.resolve(); }
      await t.wait(2);
      const hatched = chicks();
      t.check('64 thrown eggs hatch about 8 chicks (1 in 8)', eggs0 - t.count('egg') === 64 && hatched >= 2 && hatched <= 18, { thrown: eggs0 - t.count('egg'), chicks: hatched }, { thrown: 64, chicks: 'about 8' });
      // Animal farming: "Two adults create one baby animal upon breeding, which take about 20 minutes to grow up"; sheep
      // shearing "yields 1-3 blocks of wool".
      const { BABY_GROWTH_SECONDS } = await import('/src/babyGrowth.js');
      const wool = [];
      t.give('shears', 1); await t.run('equip shears');
      for (let i = 0; i < 12; i++) {
        const sx = 8.5 + (i % 4) * 4, sz = -6.5 - Math.floor(i / 4) * 4;
        const sheep = t.spawn('sheep', sx, 5, sz); sheep.frozen = true;
        const before = new Set(game.entities.droppedItems);
        game.player.position.set(sx, 5, sz + 2);
        for (let k = 0; k < 20 && game.targetMob !== sheep; k++) { game.playerBot.lookAt({ x: sx, y: 5.7, z: sz }); t.step(); }
        game.handleRightClick(); await t.wait(0.4);
        wool.push(game.entities.droppedItems.filter((d) => !before.has(d) && Math.hypot(d.group.position.x - sx, d.group.position.z - sz) < 2.5).reduce((n, d) => n + d.count, 0));
      }
      t.check('babies grow up in 20 minutes; shearing gives 1 to 3 wool', BABY_GROWTH_SECONDS === 1200 && Math.min(...wool) >= 1 && Math.max(...wool) <= 3 && new Set(wool).size >= 2, { growth: BABY_GROWTH_SECONDS, wool }, { growth: 1200, wool: '1-3' });
    },
  },
  {
    id: 'farms.villagers',
    tutorial: 'Iron golem farming; Villager farming; Zombie villager farming; Raid farming; Pillager farming; Wandering trader farming',
    wiki: W('Iron golem farming'),
    async run(t) {
      const { game } = t;
      // "Panicking ... can be easily triggered by zombies without player intervention, and only requires three villagers":
      // three villagers with beds, a zombie they can see in a glass cell.
      t.give('white_bed', 3);
      for (const [x, z] of [[-6, 6], [-3, 6], [0, 6]]) { await t.run(`goto ${x - 1} 5 ${z - 1}`); await t.run(`place white bed at ${x} 5 ${z}`); }
      t.fill(-8, 5, -2, 2, 7, 3, BLOCKS.GLASS); t.fill(-7, 5, -1, 1, 6, 2, BLOCKS.AIR);
      const villagers = [-5.5, -3.5, -1.5].map((x) => { const v = t.spawn('villager', x, 5, 0.5); return v; });
      t.fill(-4, 5, 4, -4, 6, 4, BLOCKS.AIR);
      t.fill(-5, 5, 3, -3, 7, 5, BLOCKS.GLASS); t.set(-4, 5, 4, BLOCKS.AIR); t.set(-4, 6, 4, BLOCKS.AIR);
      const zombie = t.spawn('zombie', -3.5, 5, 4.5); zombie.persistent = true;
      game.worldTime = 18000; game.player.position.set(12.5, 5, 12.5);
      let golem = null;
      for (let i = 0; i < 40 && !golem; i++) { await t.wait(1); golem = game.mobs.mobs.find((m) => m.type === 'iron_golem'); }
      t.check('three panicking villagers with beds summon an iron golem', !!golem, { golem: !!golem, panicking: villagers.map((v) => !!v.isPanicking) }, 'a golem');
      // Iron golems "drop iron consistently": 3-5 ingots.
      if (golem) {
        const before = new Set(game.entities.droppedItems);
        game.mobs.damageMob(golem, 999, golem.mesh.position, false, game.player); await t.wait(2);
        const iron = game.entities.droppedItems.filter((d) => !before.has(d) && d.itemType === 'iron_ingot').reduce((n, d) => n + d.count, 0);
        t.check('an iron golem drops 3 to 5 iron ingots', iron >= 3 && iron <= 5, iron, '3-5');
      }
      remove(game, zombie); game.worldTime = 6000;
    },
  },
  {
    id: 'farms.slimes',
    tutorial: 'Slime farming; Magma cube farming',
    wiki: W('Slime farming'),
    async run(t) {
      const { isSlimeChunk } = await import('/src/spawning/mobSpawnPredicates.js');
      // "Every chunk that is generated in a world has a 10% chance of being a slime chunk", fixed per world.
      let a = 0, both = 0; for (let x = 0; x < 100; x++) for (let z = 0; z < 100; z++) { const p = isSlimeChunk(x, z, 11), q = isSlimeChunk(x, z, 12); a += p; both += p && q; }
      t.check('10% of chunks are slime chunks, and which ones depends on the world', Math.abs(a / 1e4 - 0.1) < 0.01 && both / 1e4 < 0.02, { share: a / 1e4, sharedBetweenTwoSeeds: both / 1e4 }, { share: 0.1 });
      // A big slime splits into smaller ones when killed.
      const { game } = t;
      const big = t.spawn('slime', 4.5, 5, 4.5, { size: 4 }); big.slimeSize = big.slimeSize ?? 4;
      const size = big.slimeSize; game.mobs.damageMob(big, 999, game.player.position, false, game.player); await t.wait(1.5);
      const smaller = game.mobs.mobs.filter((m) => m.type === 'slime' && m !== big && m.health > 0);
      t.check('a slime splits into 2-4 smaller slimes when killed', smaller.length >= 2 && smaller.length <= 4 && smaller.every((m) => m.slimeSize < size), { size, children: smaller.map((m) => m.slimeSize) }, '2-4 smaller');
      for (const m of [...game.mobs.mobs]) remove(game, m);
    },
  },
];
