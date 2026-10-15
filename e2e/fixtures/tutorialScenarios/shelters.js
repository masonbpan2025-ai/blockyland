// Introductory / Shelters tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove, hold, dropFrom, compassNeedle } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'shelters.navigation',
    tutorial: 'Navigation',
    wiki: W('Navigation'),
    async run(t) {
      const { game, player } = t;
      const slotOf = (id) => game.inventory.hotbar.findIndex((s) => s?.id === id);
      // "A world's original spawn point can be found easily using a compass that is not attuned to any lodestone."
      t.give('compass', 1); await t.run('equip compass');
      await t.run('goto 12 5 12');
      const spawn = player.spawnPosition;
      game.playerBot.lookAt({ x: spawn.x, y: player.position.y + 1.6, z: spawn.z }); game.ui.updateHotbar(); await t.wait(0.2);
      const facing = compassNeedle(game, slotOf('compass'));
      player.yaw += Math.PI; game.ui.updateHotbar(); await t.wait(0.2);
      const away = compassNeedle(game, slotOf('compass'));
      t.check('the compass needle points at the world spawn', facing && Math.abs(facing.angle) < 0.15 && Math.abs(Math.abs(away.angle) - Math.PI) < 0.15 && !facing.spinning,
        { lookingAtSpawn: facing, lookingAway: away }, 'about 0, then about 180 degrees');
      // Compass: used on a lodestone it points there instead.
      t.give(BLOCKS.LODESTONE, 1);
      await t.run('place lodestone at 14 5 8');
      await t.run('use compass at 14 5 8');
      const compass = game.inventory.hotbar[slotOf('compass')];
      game.playerBot.lookAt({ x: 14.5, y: 5.5, z: 8.5 }); game.ui.updateHotbar(); await t.wait(0.2);
      const toStone = compassNeedle(game, slotOf('compass'));
      t.check('a compass used on a lodestone points at the lodestone', !!compass?.lodestone && toStone && Math.abs(toStone.angle) < 0.15,
        { linked: compass?.lodestone, needle: toStone }, 'linked, about 0');
      await t.breakBlock(14, 5, 8); game.ui.updateHotbar(); await t.wait(0.2);
      t.check('...and spins once the lodestone is gone', compassNeedle(game, slotOf('compass'))?.spinning === true, compassNeedle(game, slotOf('compass')), 'spinning');

      // "Each player can change their individual spawn point by sleeping in a bed"; "If the bed is removed ... the
      // player respawns near their world's original spawn point."
      t.give('white_bed', 1);
      await t.run('goto 18 5 18'); await t.run('place white bed at 19 5 19');
      game.worldTime = 14000;
      const slept = await t.run('sleep at 19 5 19', { maxTicks: 2000 }); await t.wait(6);
      player.takeDamage(100, null, 'generic'); await t.wait(0.5); player.respawn(); await t.wait(0.5);
      const atBed = player.position.distanceTo({ x: 19.5, y: 5, z: 19.5 }) < 3;
      await t.breakBlock(19, 5, 19); await t.wait(0.5);
      player.takeDamage(100, null, 'generic'); await t.wait(0.5); player.respawn(); await t.wait(0.5);
      const nearSpawn = Math.hypot(player.position.x - spawn.x, player.position.z - spawn.z) < 21;
      t.check('a bed sets the respawn point, and a broken bed loses it', slept.ok && atBed && nearSpawn && !player.bedSpawnPosition,
        { slept: slept.ok, respawnedAtBed: atBed, thenNearWorldSpawn: nearSpawn }, 'bed, then world spawn');

      // "Dirt paths: An ideal navigation block for marking a trail when exploring, requiring only a shovel."
      t.give('iron_shovel', 1);
      await t.run('goto 2 5 2');
      const shovel = (await t.run('equip iron shovel'), game.inventory.getActiveItem());
      await t.run('use iron shovel at 3 4 3');
      t.check('a shovel turns grass into a dirt path, for one durability', t.world.getVoxel(3, 4, 3) === BLOCKS.DIRT_PATH && (shovel.maxDurability - shovel.durability) === 1,
        { block: t.world.getVoxel(3, 4, 3), wear: (shovel.maxDurability ?? 0) - (shovel.durability ?? 0) }, { block: BLOCKS.DIRT_PATH, wear: 1 });
      // "Torches ... stop monsters from spawning nearby": since 1.18 a monster needs block light 0.
      const { monsterIsDarkEnoughToSpawn } = await import('/src/spawning/mobSpawnPredicates.js');
      const random = { nextInt: () => 0 };
      t.check('block light from a torch forbids monster spawns; darkness allows them', !monsterIsDarkEnoughToSpawn({ skyLight: 0, blockLight: 1, skyDarken: 11, dimension: 'overworld', random })
        && monsterIsDarkEnoughToSpawn({ skyLight: 0, blockLight: 0, skyDarken: 11, dimension: 'overworld', random }), 'light 1 refused, 0 allowed', 'refused, allowed');
      // "Their paths are always the same": the sun rises in the east (+X) and sets in the west.
      game.worldTime = 500; await t.wait(0.2); const morning = game.sky?.sunDirection?.x;
      game.worldTime = 11500; await t.wait(0.2); const evening = game.sky?.sunDirection?.x;
      t.check('the sun rises in the east and sets in the west', morning > 0.3 && evening < -0.3, { morningX: morning, eveningX: evening }, 'east (+X) then west (-X)');
      game.worldTime = 6000;
      t.notes.push(`"Water level is at Y level 63": this game's world is 64 blocks tall and its sea level is ${game.world.seaLevel}, a deliberate scale-down, not checked.`);
    },
  },
  {
    id: 'shelters.emergency',
    tutorial: 'Shelters; Shelter types',
    wiki: W('Shelters'),
    async run(t) {
      const { game, player } = t;
      // "Build a tall 1x1 column under you, by pillar jumping ... Zombies can track a player 30 blocks up, but they
      // cannot reach the player."
      t.give(BLOCKS.DIRT, 14);
      const y0 = player.position.y;
      await t.run('pillar 12 dirt');
      t.check('pillar-jumping twelve dirt raises the player twelve blocks', Math.round(player.position.y - y0) === 12, +(player.position.y - y0).toFixed(2), 12);
      game.worldTime = 18000;
      const z1 = t.spawn('zombie', 3.5, 5, 0.5), z2 = t.spawn('zombie', -2.5, 5, 0.5);
      const hp = player.health; await t.wait(15);
      t.check('zombies below cannot reach a player on a 12-block pillar', player.health === hp, { hp: player.health, zombies: [z1, z2].map((z) => +z.mesh.position.y.toFixed(1)) }, 'untouched');
      remove(game, z1); remove(game, z2);
      // "Don't just jump off your tower unless there's water below you": fall damage is the fall less 3.
      game.worldTime = 6000; player.health = 20;
      const four = await dropFrom(t, 8, 9, 0);
      player.health = 20;
      const twentyTwo = await dropFrom(t, 8, 27, 4);
      const survived22 = !player.isDead;
      if (player.isDead) player.respawn();
      player.health = 20;
      const twentyThree = await dropFrom(t, 8, 28, 8);
      const died23 = player.isDead;
      if (player.isDead) player.respawn();
      player.health = 20;
      t.fill(12, 3, 12, 13, 4, 13, BLOCKS.WATER);
      const intoWater = await dropFrom(t, 12, 25, 12);
      t.check('fall damage is blocks fallen less 3, and water cancels it', four === 1 && survived22 && died23 && intoWater === 0,
        { fall4: four, survives22: survived22, dies23: died23, intoWater }, { fall4: 1, survives22: true, dies23: true, intoWater: 0 },
        'The tutorial says 22 blocks can kill; at full health a 22-block fall leaves half a heart (19 damage), 23 kills');
      // "If you got at least 40 or 50 sand ... you can make enough sandstone for a pillar, even without your crafting
      // table: ... divide the sand among all four boxes of your crafting grid".
      t.give(BLOCKS.SAND, 8);
      const sandstone = await t.run('craft 2 sandstone');
      t.check('sandstone from four sand in the 2x2 grid, no table', sandstone.ok && t.count(BLOCKS.SANDSTONE) === 2, t.count(BLOCKS.SANDSTONE), 2);
      // Shelter types: "The simplest, yet the fastest possible shelter can be made by digging 3 blocks straight down
      // and then capping off the hole".
      await t.run('goto -6 5 -6');
      for (const y of [4, 3, 2]) await t.breakBlock(-6, y, -6);
      for (let i = 0; i < 60 && player.position.y > 2.2; i++) { t.step(); await Promise.resolve(); }
      t.set(-6, 4, -6, BLOCKS.DIRT); // the cap, placed from below
      game.worldTime = 18000;
      const zs = [t.spawn('zombie', -3.5, 5, -6.5), t.spawn('spider', -8.5, 5, -3.5)];
      const hp2 = player.health; await t.wait(15);
      t.check('a capped three-deep hole keeps zombies and spiders off', player.health === hp2 && player.position.y < 3, { hp: player.health, y: +player.position.y.toFixed(2) }, 'untouched');
      for (const m of zs) remove(game, m);
      game.worldTime = 6000;
    },
  },
  {
    id: 'shelters.materials',
    tutorial: 'Best building materials; Best biomes for homes; Construction',
    wiki: W('Best building materials'),
    async run(t) {
      const { game, player } = t;
      // Best building materials / The second day: stone resists a creeper or TNT where dirt and wood do not.
      // A dirt wall and an obsidian wall either side of the TNT, approached from the open end.
      t.fill(-2, 5, 6, 2, 7, 6, BLOCKS.DIRT); t.fill(-2, 5, 10, 2, 7, 10, BLOCKS.OBSIDIAN);
      t.set(0, 5, 8, BLOCKS.TNT); t.give('flint_and_steel', 1);
      await t.run('goto 4 5 8');
      // TNT is lit with flint and steel, not by any click.
      const emptySlot = () => { const i = game.inventory.hotbar.findIndex((x) => !x); if (i >= 0) game.inventory.activeSlot = i; };
      emptySlot();
      game.playerBot.lookAt({ x: 0.9, y: 5.5, z: 8.5 }); await t.wait(0.2); game.handleRightClick(); await t.wait(0.1);
      const unlit = t.world.getVoxel(0, 5, 8) === BLOCKS.TNT;
      await t.run('use flint_and_steel at 0 5 8');
      await t.run('goto 14 5 8');
      await t.wait(5);
      let dirtLeft = 0, obsidianLeft = 0;
      for (let x = -1; x <= 1; x++) for (let y = 5; y <= 6; y++) { if (t.world.getVoxel(x, y, 6) === BLOCKS.DIRT) dirtLeft++; if (t.world.getVoxel(x, y, 10) === BLOCKS.OBSIDIAN) obsidianLeft++; }
      t.check('a right-click alone does not light TNT; flint and steel does, and it breaks dirt but not obsidian', unlit && dirtLeft === 0 && obsidianLeft === 6,
        { unlitByClick: unlit, dirtLeftNearBlast: dirtLeft, obsidianLeftNearBlast: obsidianLeft }, { unlitByClick: true, dirtLeftNearBlast: 0, obsidianLeftNearBlast: 6 });
      // Construction: "every expansion requires a pickaxe" in an underground base -- stone cannot be harvested by hand.
      t.set(10, 5, 10, BLOCKS.STONE); await t.run('goto 9 5 9');
      emptySlot();
      await t.breakBlock(10, 5, 10); await t.wait(1.5);
      t.check('stone mined by hand gives nothing', t.count(BLOCKS.COBBLESTONE) === 0 && t.world.getVoxel(10, 5, 10) === BLOCKS.AIR, t.count(BLOCKS.COBBLESTONE), 0);
      // Best biomes for homes: the Overworld "is also the only place you can use a bed, without it exploding".
      t.give('white_bed', 1); await t.run('goto 6 5 -2'); await t.run('place white bed at 7 5 -1');
      const was = game.currentDimension; game.currentDimension = 'nether'; game.worldTime = 18000;
      const hp = player.health;
      const used = await t.run('sleep at 7 5 -1', { maxTicks: 300, expectFail: true });
      game.currentDimension = was; game.worldTime = 6000;
      t.check('a bed used outside the Overworld explodes', !used.ok && t.world.getVoxel(7, 5, -1) !== BLOCKS.RED_BED_FOOT && player.health < hp,
        { message: used.message, bedLeft: t.world.getVoxel(7, 5, -1), hpLost: +(hp - player.health).toFixed(1) }, 'explodes and hurts');
      player.health = 20;
    },
  },
];
