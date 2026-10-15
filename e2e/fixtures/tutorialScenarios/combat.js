// Combat tutorials, played by the bot in the real game.
import { BLOCKS, ITEMS } from '../../../src/blocks.js';
import { W, remove, dropFrom } from './_shared.js';

/** Aim at a mob for a moment, so the game's raycast targets it. */
async function aimAt(t, mob) {
  for (let i = 0; i < 15; i++) { t.game.playerBot.lookAt({ x: mob.mesh.position.x, y: mob.mesh.position.y + 0.6, z: mob.mesh.position.z }); t.step(); await Promise.resolve(); }
  return t.game.targetMob === mob;
}

export const SCENARIOS = [
  {
    id: 'combat.melee',
    tutorial: 'Combat; Hitboxes',
    wiki: W('Combat'),
    async run(t) {
      const { game, player } = t;
      // Combat: "a wooden axe deals the same damage as a diamond sword"; axes "attack only once per second, while a
      // sword can attack faster at 1.6 times per second".
      const { attackSpeedFor } = await import('/src/attackCooldown.js');
      t.check('a wooden axe hits as hard as a diamond sword (7); axes swing ~1/s, swords 1.6/s', ITEMS.wooden_axe.attack === ITEMS.diamond_sword.attack && attackSpeedFor('diamond_sword') === 1.6 && attackSpeedFor('iron_axe') <= 1,
        { woodenAxe: ITEMS.wooden_axe.attack, diamondSword: ITEMS.diamond_sword.attack, swordSpeed: attackSpeedFor('diamond_sword'), axeSpeed: attackSpeedFor('iron_axe') }, '7 = 7; 1.6; <= 1');
      // A critical hit: "performed when a player attacks an entity while falling", +50%.
      t.give('iron_sword', 1); await t.run('equip iron sword');
      const plainTarget = t.spawn('cow', 2.2, 5, 0.5); plainTarget.maxHealth = plainTarget.health = 100; plainTarget.frozen = true;
      await aimAt(t, plainTarget); await t.wait(1);
      let hp = plainTarget.health; game.handleLeftClick(); const plain = +(hp - plainTarget.health).toFixed(2);
      await t.wait(1.2);
      // Jump, and swing on the way down.
      player.botControls = { Space: true }; t.step(); player.botControls = null;
      for (let i = 0; i < 40 && !(player.velocity.y < -0.5 && !player.onGround); i++) { game.playerBot.lookAt({ x: plainTarget.mesh.position.x, y: plainTarget.mesh.position.y + 0.6, z: plainTarget.mesh.position.z }); t.step(); await Promise.resolve(); }
      plainTarget.hitCooldown = 0; hp = plainTarget.health;
      game.playerBot.lookAt({ x: plainTarget.mesh.position.x, y: plainTarget.mesh.position.y + 0.6, z: plainTarget.mesh.position.z }); t.step();
      const airborne = { falling: player.velocity.y < 0, onGround: player.onGround, fall: +player.fallDistance.toFixed(2), target: game.targetMob === plainTarget };
      game.handleLeftClick(); const crit = +(hp - plainTarget.health).toFixed(2);
      t.notes.push(`critical attempt: ${JSON.stringify(airborne)}`);
      t.check('a hit while falling is a critical hit: 1.5x', plain === 6 && Math.abs(crit - 9) < 0.01 && player.lastAttackCritical === true, { plain, crit, critical: player.lastAttackCritical }, { plain: 6, crit: 9 });
      plainTarget.frozen = false; remove(game, plainTarget); await t.wait(1);
      // Hitboxes: "baby chickens don't drop anything" (an adult does).
      const before = new Set(game.entities.droppedItems);
      const baby = t.spawn('chicken', -8.5, 5, 8.5); baby.isBaby = true; baby.babyGrowthTimer = 1200; baby.mesh.scale.setScalar(0.5); const adult = t.spawn('chicken', 8.5, 5, 8.5);
      game.mobs.damageMob(baby, 99, player.position, false, player); game.mobs.damageMob(adult, 99, player.position, false, player); await t.wait(1.5);
      const fresh = game.entities.droppedItems.filter((d) => !before.has(d));
      const nearBaby = fresh.filter((d) => d.group.position.distanceTo(baby.mesh.position) < 1.5).length, nearAdult = fresh.filter((d) => d.group.position.distanceTo(adult.mesh.position) < 1.5).length;
      t.check('a baby chicken drops nothing, an adult drops', nearBaby === 0 && nearAdult >= 1, { baby: nearBaby, adult: nearAdult }, { baby: 0, adult: '>= 1' });
      // Hitboxes: "Most mobs cannot see through glass": a zombie behind a glass wall does not bite.
      t.fill(-4, 5, -5, 4, 7, -5, BLOCKS.GLASS);
      game.worldTime = 18000; player.health = 20; await t.run('goto 0 5 -4');
      const z = t.spawn('zombie', 0.5, 5, -6.5); await t.wait(6);
      t.check('a zombie behind glass cannot hit the player', player.health === 20, player.health, 20);
      remove(game, z); game.worldTime = 6000;
    },
  },
  {
    id: 'combat.falls',
    tutorial: 'Breaking a fall',
    wiki: W('Breaking a fall'),
    async run(t) {
      const { game, player } = t;
      const fall = async (x, z, h, under) => { player.health = 20; if (under !== undefined) t.set(x, 4, z, under); return dropFrom(t, x, 5 + h, z); };
      // "This clutch uses hay bales to reduce fall damage by 80%"; "a bed to reduce the fall damage by 50%"; water and
      // cobwebs cancel it.
      const plain = await fall(0, 0, 13);
      const hay = await fall(4, 0, 13, BLOCKS.HAY_BLOCK);
      t.set(8, 5, 0, BLOCKS.WATER); const water = await fall(8, 0, 13);
      t.set(12, 5, 0, BLOCKS.COBWEB); const web = await fall(12, 0, 13);
      t.check('a 13-block fall: 10 on grass, 2 on hay (-80%), 0 into water or a cobweb', plain === 10 && hay === 2 && water === 0 && web === 0,
        { grass: plain, hay, water, cobweb: web }, { grass: 10, hay: 2, water: 0, cobweb: 0 });
      // "The player must have a water bucket in their inventory and quickly place the water just before hitting the ground."
      t.give('water_bucket', 1); await t.run('equip water bucket');
      player.health = 20; player.position.set(16.5, 25, 0.5); player.velocity.set(0, 0, 0); player.onGround = false; player.fallDistance = 0;
      let placed = false;
      for (let i = 0; i < 200 && !player.onGround; i++) {
        if (!placed && player.position.y < 7.5) { game.playerBot.lookAt({ x: 16.5, y: 4, z: 0.5 }); t.step(); game.handleRightClick(); placed = true; }
        t.step(); await Promise.resolve();
      }
      await t.wait(0.5);
      t.check('a water bucket emptied just before landing cancels a 20-block fall', placed && player.health === 20 && t.count('bucket') === 1, { hp: player.health, bucketBack: t.count('bucket') }, { hp: 20, bucketBack: 1 });
    },
  },
  {
    id: 'combat.offhand',
    tutorial: 'Dual wielding',
    wiki: W('Dual wielding'),
    async run(t) {
      const { game } = t;
      const inv = game.inventory;
      // "The item in the off-hand will only be used if the item in the main hand lacks a use": a torch in the off-hand
      // is placed while a sword is held.
      t.give('iron_sword', 1); await t.run('equip iron sword');
      inv.offhand = { id: BLOCKS.TORCH, isBlock: true, count: 4 };
      game.playerBot.lookAt({ x: 2.5, y: 4.99, z: 0.5 }); await t.wait(0.2);
      game.handleRightClick(); await t.wait(0.2);
      t.check('a sword in hand, a torch in the off-hand: right-click places the torch', t.world.getVoxel(2, 5, 0) === BLOCKS.TORCH && inv.offhand?.count === 3 && inv.getActiveItem()?.id === 'iron_sword',
        { placed: t.world.getVoxel(2, 5, 0), torchesLeft: inv.offhand?.count, main: inv.getActiveItem()?.id }, 'torch placed, 3 left, sword still held');
      // "For example, if you had stone in your main hand and dirt in your off-hand, you will always place the stone."
      t.give(BLOCKS.STONE, 1); await t.run('equip stone'); inv.offhand = { id: BLOCKS.DIRT, isBlock: true, count: 4 };
      game.playerBot.lookAt({ x: -1.5, y: 4.99, z: 0.5 }); await t.wait(0.2); game.handleRightClick(); await t.wait(0.2);
      t.check('the main hand comes first', t.world.getVoxel(-2, 5, 0) === BLOCKS.STONE, t.world.getVoxel(-2, 5, 0), BLOCKS.STONE);
      // "Arrows that are held on the off-hand take priority over arrows in any other slot."
      inv.offhand = { id: 'spectral_arrow', isBlock: false, count: 2 }; t.give('arrow', 5);
      t.check('a bow takes its arrows from the off-hand first', game.bow?.ammo?.()?.id === 'spectral_arrow', game.bow?.ammo?.()?.id, 'spectral_arrow');
    },
  },
  {
    id: 'combat.siege',
    tutorial: 'Zombie siege defense',
    wiki: W('Zombie siege defense'),
    async run(t) {
      const { game } = t;
      // A small village: beds, around the player. The night's roll is forced to the 10% case.
      t.give('white_bed', 3);
      for (const [x, z] of [[4, 4], [-6, 4], [4, -6]]) { await t.run(`goto ${x - 1} 5 ${z - 1}`); await t.run(`place white bed at ${x} 5 ${z}`); }
      await t.run('goto 0 5 0');
      const siege = game.zombieSiege; siege.random = () => 0.05;
      game.worldTime = 17900; await t.wait(1); game.worldTime = 17995; await t.wait(8);
      const zombies = game.mobs.mobs.filter((m) => m.type === 'zombie').length;
      t.check('at midnight in a village a siege starts and zombies spawn', siege.log.some((e) => e.event === 'started') && zombies >= 5,
        { log: siege.log.map((e) => e.event), zombies }, 'started, a wave of zombies');
      // "If all players in the Overworld sleep before midnight, sieges will not be able to start."
      for (const m of game.mobs.mobs.filter((m) => m.type === 'zombie')) remove(game, m);
      siege.log.length = 0; game.worldTime = 6000; await t.wait(0.5);
      game.worldTime = 13000; await t.run('sleep at 4 5 4', { maxTicks: 2000 }); await t.wait(6);
      t.check('sleeping before midnight skips the night, and the siege with it', !siege.log.some((e) => e.event === 'started') && game.worldTime < 13000,
        { log: siege.log.map((e) => e.event), time: Math.round(game.worldTime) }, 'no siege, morning');
      siege.random = Math.random;
    },
  },
];
