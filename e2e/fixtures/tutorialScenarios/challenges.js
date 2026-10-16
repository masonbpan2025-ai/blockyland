// Challenge tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'challenges.zombie_villagers',
    tutorial: 'Curing a zombie villager; Defeating a village raid',
    wiki: W('Curing a zombie villager'),
    async run(t) {
      const { game } = t;
      // "a villager killed by a zombie has a chance of converting into a zombie villager (0% on Easy, 50% on Normal,
      // and 100% on Hard)". The player stays far away, so the zombie goes for the villager.
      const trial = async (difficulty, x) => {
        game.difficulty = difficulty; game.worldTime = 18000;
        // A small room, as a village house is: the villager cannot simply outrun the zombie.
        t.fill(x - 1, 5, 4, x + 6, 6, 9, BLOCKS.STONE); t.fill(x, 5, 5, x + 5, 6, 8, BLOCKS.AIR);
        const v = t.spawn('villager', x + 0.5, 5, 6.5); v.profession = 'farmer';
        const z = t.spawn('zombie', x + 4.5, 5, 6.5); z.persistent = true;
        for (let i = 0; i < 30 * 40 && v.health > 0 && game.mobs.mobs.includes(v); i++) { t.step(); if (i % 30 === 0) await Promise.resolve(); }
        await t.wait(2);
        const zv = game.mobs.mobs.find((m) => m.type === 'zombie_villager' && m.mesh.position.distanceTo(v.mesh.position) < 4);
        remove(game, z);
        const result = { killed: v.health <= 0 || !game.mobs.mobs.includes(v), zombieVillager: !!zv, profession: zv?.savedProfession ?? null };
        if (zv) remove(game, zv);
        return result;
      };
      game.player.position.set(-30.5, 5, -30.5);
      const hard = await trial('hard', 0), easy = await trial('easy', 12);
      t.check('a zombie hunts a villager; killed on Hard it rises as a zombie villager keeping its job, on Easy it just dies', hard.killed && hard.zombieVillager && hard.profession === 'farmer' && easy.killed && !easy.zombieVillager,
        { hard, easy }, { hard: 'zombie villager (farmer)', easy: 'dead' });
      game.difficulty = 'normal'; game.worldTime = 6000;
    },
  },
  {
    id: 'challenges.bosses',
    tutorial: 'Defeating the wither; Defeating the wither/Getting rid of a rogue wither; Defeating the ender dragon; Locating a stronghold',
    wiki: W('Defeating the wither'),
    async run(t) {
      const { game, player } = t;
      // "you need to acquire three wither skeleton skulls"; "the only other ingredient needed to build the wither is soul
      // sand or soul soil". Built from soul soil.
      t.give(BLOCKS.SOUL_SOIL, 4); t.give('wither_skeleton_skull', 3);
      await t.run('goto 1 5 3');
      for (const [x, y] of [[0, 5], [0, 6], [-1, 6], [1, 6]]) await t.run(`place soul soil at ${x} ${y} 0`);
      // The skulls go on top faces, seen from above: the bot stands on a two-block pillar.
      t.fill(0, 5, 3, 0, 6, 3, BLOCKS.STONE); player.position.set(0.5, 7, 3.5); player.velocity.set(0, 0, 0); await t.wait(0.3);
      await t.run('equip wither skeleton skull');
      for (const x of [-1, 1, 0]) { game.playerBot.lookAt({ x: x + 0.5, y: 6.99, z: 0.5 }); t.step(); game.handleRightClick(); t.step(); }
      await t.wait(1);
      const wither = game.mobs.mobs.find((m) => m.type === 'wither');
      t.check('soul soil and three wither skeleton skulls summon the wither', !!wither, !!wither, true);
      // "Defeating the wither drops a Nether star".
      if (wither) {
        // Out of the way of the birth explosion and the fight; the kill itself is not what the tutorial teaches.
        player.position.set(40.5, 5, 40.5); player.gamemode = 'creative';
        await t.wait(12); // the 11-second birth charge, during which it cannot be hurt
        const before = new Set(game.entities.droppedItems);
        wither.health = 1;
        game.mobs.damageMob(wither, 999, wither.mesh.position, false, player); await t.wait(4);
        const star = game.entities.droppedItems.filter((d) => !before.has(d)).some((d) => d.itemType === 'nether_star');
        t.check('the wither drops a nether star', wither.health <= 0 && star, { dead: wither.health <= 0, star }, { star: true });
        if (wither.health > 0) remove(game, wither);
        player.gamemode = 'survival'; player.health = 20;
      }
      // Locating a stronghold: an eye of ender "has a 20% chance of shattering and an 80% chance of surviving per throw".
      player.position.set(0.5, 5, -10.5); t.give('ender_eye', 20); await t.run('equip ender eye');
      const eyes0 = game.entities.droppedItems.length;
      for (let i = 0; i < 20; i++) { game.playerBot.lookAt({ x: 10, y: 8, z: -10 }); t.step(); game.handleRightClick(); await t.wait(0.25); }
      await t.wait(5);
      const back = game.entities.droppedItems.slice(eyes0).filter((d) => d.itemType === 'ender_eye').reduce((n, d) => n + d.count, 0);
      t.check('about 80% of thrown eyes of ender fall back as items', back >= 11 && back <= 20, back, '~16 of 20');
      t.notes.push('The stronghold direction itself is checked by the Advancement guide (story/follow_ender_eye) and the End portal room by dimensions.end_tab.');
    },
  },
  {
    id: 'challenges.collecting',
    tutorial: 'Acquiring a conduit; Archaeology; Obtaining every music disc; Obtaining every block; Obtaining every item',
    wiki: W('Acquiring a conduit'),
    async run(t) {
      const { game, player } = t;
      // "a conduit, which requires a heart of the sea and eight nautilus shells to craft".
      t.set(1, 5, 1, BLOCKS.CRAFTING_TABLE); await t.run('goto 0 5 2');
      t.give('heart_of_the_sea', 1); t.give('nautilus_shell', 8);
      await t.run('craft conduit');
      t.check('a heart of the sea and 8 nautilus shells craft a conduit', t.count(BLOCKS.CONDUIT) === 1, t.count(BLOCKS.CONDUIT), 1);
      // "It activates if placed underwater with 5x5 rings around the conduit made of any prismarine type".
      t.fill(-12, 4, -12, -4, 4, -4, BLOCKS.PRISMARINE);
      t.fill(-12, 5, -12, -4, 9, -4, BLOCKS.WATER);
      const c = [-8, 7, -8];
      for (let d = -2; d <= 2; d++) { t.set(c[0] + d, c[1], c[2] - 2, BLOCKS.PRISMARINE); t.set(c[0] + d, c[1], c[2] + 2, BLOCKS.PRISMARINE); t.set(c[0] - 2, c[1], c[2] + d, BLOCKS.PRISMARINE); t.set(c[0] + 2, c[1], c[2] + d, BLOCKS.PRISMARINE); }
      t.set(...c, BLOCKS.CONDUIT); game.beaconManager?.onBlockPlaced?.(...c, BLOCKS.CONDUIT);
      player.position.set(-7.5, 5, -6.5); await t.wait(6);
      const power = player.statusEffects?.has?.('conduit_power');
      t.check('a conduit in a ring of 16 prismarine underwater gives Conduit Power', !!power, !!power, true);
      player.position.set(0.5, 5, 0.5);
      // Archaeology: brushing suspicious sand gives an item and leaves sand.
      t.set(4, 5, 4, BLOCKS.SUSPICIOUS_SAND); t.give('brush', 1); await t.run('equip brush'); await t.run('goto 4 5 6');
      const before = new Set(game.entities.droppedItems);
      const invBefore = JSON.stringify(t.items());
      for (let i = 0; i < 30 * 8 && t.world.getVoxel(4, 5, 4) === BLOCKS.SUSPICIOUS_SAND; i++) { game.playerBot.lookAt({ x: 4.5, y: 5.5, z: 4.5 }); game.isUsingItem = true; game.rightMouseDown = true; if (i % 6 === 0) game.handleRightClick(); t.step(); if (i % 30 === 0) await Promise.resolve(); }
      game.rightMouseDown = false; await t.wait(1);
      const loot = [...game.entities.droppedItems.filter((d) => !before.has(d)).map((d) => d.itemType), ...(JSON.stringify(t.items()) !== invBefore ? ['(picked up)'] : [])];
      t.check('brushing suspicious sand turns it to sand and gives an item', t.world.getVoxel(4, 5, 4) === BLOCKS.SAND && loot.length >= 1, { block: t.world.getVoxel(4, 5, 4), loot }, { block: BLOCKS.SAND, loot: '1 item' });
      // Obtaining every music disc: "Most ... music discs" come from a creeper killed by a skeleton.
      const creeper = t.spawn('creeper', 8.5, 5, -6.5); const skel = t.spawn('skeleton', 8.5, 5, -12.5);
      const b2 = new Set(game.entities.droppedItems);
      game.mobs.damageMob(creeper, 999, skel.mesh.position, false, skel); await t.wait(2);
      const disc = game.entities.droppedItems.filter((d) => !b2.has(d)).some((d) => String(d.itemType).startsWith('music_disc'));
      t.check('a creeper killed by a skeleton drops a music disc', disc, disc, true);
      remove(game, skel);
      t.notes.push('Obtaining every block / every item are collection goals over the whole game; the item and block audits (sections 1-7) cover them.');
    },
  },
];
