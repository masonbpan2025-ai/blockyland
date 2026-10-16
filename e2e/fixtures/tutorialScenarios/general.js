// General tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove, hold, oakTree, setHunger } from './_shared.js';

const has = (game, id) => game.player.advancements?.has?.(id) ?? false;

export const SCENARIOS = [
  {
    id: 'general.advancements',
    tutorial: 'Advancement guide; Advancement guide/Minecraft tab; Advancement guide/Adventure tab; Advancement guide/Husbandry tab; Achievement guide',
    wiki: W('Advancement guide/Minecraft tab'),
    async run(t) {
      const { game, player } = t;
      player.advancements = new Set();
      // Minecraft tab: "Get a crafting table in your inventory"; "Stone Age"; "Getting an Upgrade".
      oakTree(t, 4, -4);
      await t.run('mine 4 oak log'); await t.wait(2);
      await t.run('craft 4 oak planks'); await t.run('craft crafting table');
      await t.wait(0.5);
      t.check('"Minecraft": a crafting table in the inventory', has(game, 'story/root'), [...player.advancements], 'story/root');
      await t.run('place crafting table at 1 5 1'); await t.run('goto 0 5 2');
      await t.run('craft 2 stick'); await t.run('craft wooden pickaxe');
      t.fill(-6, 5, -2, -4, 6, 0, BLOCKS.STONE);
      await t.run('mine 3 stone'); await t.wait(2);
      t.check('"Stone Age": cobblestone mined with the pickaxe', has(game, 'story/mine_stone'), [...player.advancements], 'story/mine_stone');
      await t.run('goto 0 5 2'); await t.run('craft stone pickaxe'); await t.wait(0.5);
      t.check('"Getting an Upgrade": a stone pickaxe', has(game, 'story/upgrade_tools'), [...player.advancements], 'story/upgrade_tools');
      // Adventure tab: "Monster Hunter" for a hostile kill; a passive kill is only "Adventure".
      t.give('stone_sword', 1); await t.run('equip stone sword');
      t.spawn('pig', 4.5, 5, 4.5); await t.run('attack pig');
      const afterPig = { adventure: has(game, 'adventure/root'), monsterHunter: has(game, 'adventure/kill_a_mob') };
      game.worldTime = 18000; t.spawn('zombie', 4.5, 5, 4.5); await t.run('attack zombie'); game.worldTime = 6000;
      t.check('"Adventure" for a kill, "Monster Hunter" only for a hostile one', afterPig.adventure && !afterPig.monsterHunter && has(game, 'adventure/kill_a_mob'),
        { afterPig, afterZombie: has(game, 'adventure/kill_a_mob') }, 'pig: Adventure; zombie: Monster Hunter');
      // "Sweet Dreams": sleep in a bed.
      t.give('white_bed', 1); await t.run('goto 6 5 1'); await t.run('place white bed at 7 5 3');
      game.worldTime = 14000; await t.run('sleep at 7 5 3', { maxTicks: 2000 }); await t.wait(6);
      t.check('"Sweet Dreams": sleeping in a bed', has(game, 'adventure/sleep_in_bed'), [...player.advancements], 'adventure/sleep_in_bed');
      // Husbandry tab: "Husbandry" (eat), "A Seedy Place" (plant), "The Parrots and the Bats" (breed), "Best Friends Forever" (tame).
      setHunger(player, 10, 0); t.give('bread', 1); await t.run('eat bread');
      t.set(-2, 4, 3, BLOCKS.FARMLAND); t.give('wheat_seeds', 1); await t.run('goto -2 5 2'); await t.run('plant wheat_seeds at -2 5 3');
      const cows = [t.spawn('cow', 3.5, 5, -6.5), t.spawn('cow', 5.5, 5, -6.5)]; t.give('wheat', 2);
      await t.run('feed wheat to cow'); await t.run('feed wheat to cow'); await t.wait(8);
      const wolf = t.spawn('wolf', -5.5, 5, -6.5); t.give('bone', 20);
      for (let i = 0; i < 20 && !wolf.isTamed; i++) await t.run('feed bone to wolf');
      await t.wait(0.5);
      t.check('Husbandry: eating, planting, breeding and taming', ['husbandry/root', 'husbandry/plant_seed', 'husbandry/breed_an_animal', 'husbandry/tame_an_animal'].every((id) => has(game, id)),
        ['husbandry/root', 'husbandry/plant_seed', 'husbandry/breed_an_animal', 'husbandry/tame_an_animal'].map((id) => [id, has(game, id)]), 'all four');
      for (const m of [...cows, wolf]) remove(game, m);
      // "Postmortal": a Totem of Undying cheats death.
      t.give('totem_of_undying', 1); await t.run('equip totem of undying');
      player.takeDamage(100, null, 'generic'); await t.wait(0.5);
      t.check('"Postmortal": a held Totem of Undying cheats death', !player.isDead && player.health >= 1 && has(game, 'adventure/totem_of_undying'),
        { dead: player.isDead, hp: player.health, earned: has(game, 'adventure/totem_of_undying') }, 'alive');
      // "We Need to Go Deeper" is earned on entering the Nether (dimensions group).
    },
  },
  {
    id: 'general.movement',
    tutorial: 'Pillar jumping; Bridging; Parkour; Measuring distance; Units of measure',
    wiki: W('Pillar jumping'),
    async run(t) {
      const { game, player } = t;
      // Pillar jumping: up, then a ladder on the side to climb back up after coming down.
      t.give(BLOCKS.DIRT, 8); const y0 = player.position.y;
      await t.run('pillar 6 dirt');
      t.check('pillar-jumping raises the player one block per block', Math.round(player.position.y - y0) === 6, +(player.position.y - y0).toFixed(2), 6);
      await t.breakBlock(0, 10, 0); // a player digs the pillar down under them
      for (let y = 9; y >= 5; y--) { await t.breakBlock(0, y, 0); await t.wait(0.4); }
      await t.wait(1);
      t.check('digging the pillar back down returns the player to the ground', player.position.y < y0 + 0.5 && player.health >= 19, { y: +player.position.y.toFixed(2), hp: player.health }, 'on the ground, unhurt');
      // Bridging: sneak-bridge over a gap without falling.
      t.fill(2, 0, -3, 12, 4, 3, BLOCKS.AIR);
      t.give(BLOCKS.COBBLESTONE, 16);
      await t.run('goto 1 5 0'); player.yaw = -Math.PI / 2;
      const bridged = await t.run('bridge 8 east with cobblestone', { maxTicks: 6000 });
      let laid = 0; for (let x = 2; x <= 9; x++) if (t.world.getVoxel(x, 4, 0) === BLOCKS.COBBLESTONE) laid++;
      t.check('sneak-bridging across a gap lays a block per step and does not fall', bridged.ok && laid >= 7 && player.position.y >= 4.9, { ok: bridged.ok, laid, y: +player.position.y.toFixed(2) }, 'eight blocks, still on top');
      await t.run('goto 1 5 0');
      // Parkour: a sprint-jump clears a 3-block gap, a walking jump does not. A 1-deep gap, so a miss lands in it.
      for (const sprint of [true, false]) {
        t.fill(-30, 4, 9, -6, 4, 9, BLOCKS.STONE); t.fill(-30, 5, 8, -6, 7, 10, BLOCKS.AIR);
        t.fill(-19, 4, 9, -17, 4, 9, BLOCKS.AIR); // the gap: x -19..-17; the ledge's edge at x = -19
        player.position.set(-24.5, 5, 9.5); player.velocity.set(0, 0, 0); player.yaw = -Math.PI / 2; await t.wait(0.3);
        const controls = sprint ? { KeyW: true, ControlLeft: true } : { KeyW: true };
        for (let i = 0; i < 90; i++) { const jump = player.position.x > -19.35 && player.position.x < -19; player.botControls = { ...controls, ...(jump ? { Space: true } : {}) }; t.step(); await Promise.resolve(); if (player.position.x > -12) break; }
        player.botControls = null; await t.wait(0.5);
        const across = player.position.y > 4.9 && player.position.x > -16;
        if (sprint) t.check('a sprint-jump clears a 3-block gap', across, { x: +player.position.x.toFixed(2), y: +player.position.y.toFixed(2) }, 'across, on the far side');
        else t.notes.push(`walking jump over a 3-block gap: ${across ? 'made it' : 'fell'} (x ${player.position.x.toFixed(2)}); Java's is borderline, the tutorial gives no figure`);
        player.position.set(0.5, 5, 0.5); player.velocity.set(0, 0, 0); player.health = 20; await t.wait(0.5);
      }
      // Measuring distance: "if you press F3, the debug screen shows your present location in X, Y and Z coordinates".
      const debug = game.ui?.getDebugText?.() ?? game.ui?.debugEl?.textContent ?? document.getElementById('debug-info')?.textContent ?? '';
      t.notes.push(`debug screen sample: ${String(debug).slice(0, 120)}`);
      // Units of measure: a day is 20 minutes (24000 ticks), stacks of 64, eggs and ender pearls in 16s, a hopper has
      // 5 slots and a dispenser 9.
      const { stackLimitFor } = await import('/src/blocks.js');
      t.check('stacks: 64 for most, 16 for eggs, ender pearls, snowballs and signs, 1 for tools', stackLimitFor('stick') === 64 && stackLimitFor('egg') === 16 && stackLimitFor('ender_pearl') === 16 && stackLimitFor('snowball') === 16 && stackLimitFor('oak_sign') === 16 && stackLimitFor('diamond_pickaxe') === 1,
        { stick: stackLimitFor('stick'), egg: stackLimitFor('egg'), pearl: stackLimitFor('ender_pearl'), snowball: stackLimitFor('snowball'), sign: stackLimitFor('oak_sign'), pick: stackLimitFor('diamond_pickaxe') }, '64, 16, 16, 16, 16, 1');
      const t0 = game.worldTime; await t.wait(10);
      t.check('the clock runs 20 ticks a second: a day is 24000 ticks, 20 minutes', Math.abs(game.worldTime - t0 - 200) < 2, +(game.worldTime - t0).toFixed(1), 200);
    },
  },
  {
    id: 'general.spawnproofing',
    tutorial: 'Spawn-proofing; Phantom-proofing',
    wiki: W('Spawn-proofing'),
    async run(t) {
      const { game } = t;
      // Spawn-proofing: what a hostile mob can be placed on by the game's own spawn validation.
      const { validateSpawnSpace } = await import('/src/spawning/spawnValidation.js');
      const floors = { stone: BLOCKS.STONE, bottom_slab: BLOCKS.OAK_SLAB, carpet: BLOCKS.WHITE_CARPET, glass: BLOCKS.GLASS, leaves: BLOCKS.OAK_LEAVES, dirt_path: BLOCKS.DIRT_PATH, farmland: BLOCKS.FARMLAND, soul_sand: BLOCKS.SOUL_SAND, glowstone: BLOCKS.GLOWSTONE };
      const result = {}; let x = -20;
      for (const [name, id] of Object.entries(floors)) {
        t.set(x, 4, -20, id);
        result[name] = validateSpawnSpace({ world: game.world, x: x + 0.5, y: 5, z: -19.5, width: 0.6, height: 1.95, mobType: 'zombie' }).ok;
        x += 3;
      }
      t.check('monsters spawn on stone and soul sand, not on bottom slabs, carpet, glass, leaves, paths, farmland or glowstone',
        result.stone && result.soul_sand && !result.bottom_slab && !result.carpet && !result.glass && !result.leaves && !result.dirt_path && !result.farmland && !result.glowstone,
        result, 'stone, soul sand only');
      // "Hostile mobs spawn ... at zero block light level": a torch's light stops them.
      const { monsterIsDarkEnoughToSpawn } = await import('/src/spawning/mobSpawnPredicates.js');
      t.check('block light 1 stops monster spawns, 0 allows them', !monsterIsDarkEnoughToSpawn({ skyLight: 0, blockLight: 1, skyDarken: 11, dimension: 'overworld', random: { nextInt: () => 0 } }) && monsterIsDarkEnoughToSpawn({ skyLight: 0, blockLight: 0, skyDarken: 11, dimension: 'overworld', random: { nextInt: () => 0 } }), '', 'refused, allowed');
      // Phantom-proofing: a roof keeps phantoms away; "Phantoms spawn at night ... only above sea level ... 20-34 blocks above".
      const mech = game.spawnManager?.specialSpawners?.phantom;
      t.check('the phantom spawner exists and follows the sky, sea level and height rules', !!mech && String(mech.tick).includes('20 + random.nextInt(15)') && String(mech.tick).includes('getSkyLight') && String(mech.tick).includes('seaLevel'),
        !!mech, 'see tests/phantomSpawning.test.js');
    },
  },
  {
    id: 'general.travel',
    tutorial: 'Transportation methods; Mapping; Horses; Adventuring',
    wiki: W('Transportation methods'),
    async run(t) {
      const { game, player } = t;
      // Transportation methods: "1 block travelled in the Nether equals 8 blocks travelled in the Overworld".
      const { getDestinationCoordinates } = await import('/src/netherPortal.js');
      const toNether = getDestinationCoordinates('overworld', 800, 30, -401), back = getDestinationCoordinates('nether', 100, 30, -51);
      t.check('the Nether is 1:8 (floored): overworld 800, -401 is Nether 100, -51, and back again', toNether.x === 100 && toNether.z === -51 && back.x === 800 && back.z === -408,
        { toNether, back }, { toNether: [100, -51], back: [800, -408] });
      // Mapping: "For every three sugar cane ... make three paper"; a map draws itself as it is carried.
      t.set(1, 5, 1, BLOCKS.CRAFTING_TABLE); await t.run('goto 0 5 2');
      t.give(BLOCKS.SUGAR_CANE, 3); await t.run('craft paper');
      t.check('three sugar cane make three paper', t.count('paper') === 3, t.count('paper'), 3);
      t.give('map', 1); await t.run('equip map');
      game.playerBot.lookAt({ x: 0.5, y: 20, z: 0.5 }); game.handleRightClick(); await t.wait(0.5);
      const filled = game.inventory.getActiveItem();
      const drawn = filled?.mapData ? [...filled.mapData.colors].filter(Boolean).length : 0;
      t.check('using an empty map makes a map centred here that draws the ground', filled?.id === 'filled_map' && filled.mapData?.centerX === 0 && drawn > 1000,
        { id: filled?.id, center: filled?.mapData && [filled.mapData.centerX, filled.mapData.centerZ], pixelsDrawn: drawn }, 'a drawn map');
      t.check('holding it shows it on screen', document.getElementById('held-map')?.style.display === 'block', document.getElementById('held-map')?.style.display, 'block');
      // Transportation methods: "Boats travel at 8 m/s in water".
      const { BOAT_WATER_MAX_SPEED } = await import('/src/rails.js').catch(() => ({}));
      t.notes.push(`boat top speed on water: ${BOAT_WATER_MAX_SPEED ?? 'see rails.js (8.0)'} m/s`);
      // Horses: "Wild horses spawn with random speeds up to 14.57 m/s".
      const horses = Array.from({ length: 40 }, (_, i) => t.spawn('horse', -10 + (i % 8) * 2.5, 5, 10 + Math.floor(i / 8) * 2.5));
      // The movement_speed attribute, 0.1125-0.3375; a block a tick is 20 m/s and Java's horse moves 43.17 m/s per unit.
      const speeds = horses.map((h) => h.movementSpeed).filter((v) => typeof v === 'number');
      t.notes.push(`horse speed stats (first 5): ${speeds.slice(0, 5).map((v) => v.toFixed?.(3)).join(', ')}`);
      t.check('wild horse speeds stay under 14.57 m/s', speeds.length === 40 && speeds.every((v) => v * 43.17 <= 14.58 && v >= 0.1125), { n: speeds.length, maxMs: +(Math.max(...speeds) * 43.17).toFixed(2) }, '<= 14.57 m/s (0.3375 attribute)');
      for (const h of horses) remove(game, h);
    },
  },
  {
    id: 'general.gear',
    tutorial: 'Best enchantments guide; Getting max gear; Organization; Things to do when bored; Time-saving tips',
    wiki: W('Best enchantments guide'),
    async run(t) {
      const { game } = t;
      // Getting max gear: "two steps costing 2 and 4 levels require more XP than two steps costing 3 levels each" --
      // the prior-work penalty doubles with each anvil use (2^n - 1).
      const { calculateAnvilResult } = await import('/src/anvil.js');
      const helmet = { id: 'diamond_helmet', count: 1 };
      const first = calculateAnvilResult(helmet, { id: 'enchanted_book', count: 1, enchantments: [{ id: 'protection', level: 4 }] });
      const second = calculateAnvilResult(first.result, { id: 'enchanted_book', count: 1, enchantments: [{ id: 'unbreaking', level: 3 }] });
      t.check('anvil: Protection IV costs 4, then Unbreaking III costs 3 + a prior-work penalty of 1', first.levelCost === 4 && first.result.repairCost === 1 && second.levelCost === 4 && second.result.repairCost === 3,
        { first: [first.levelCost, first.result.repairCost], second: [second.levelCost, second.result.repairCost] }, { first: [4, 1], second: [4, 3] });
      // Best enchantments guide: "Unbreaking III only makes a piece of armor last about 43% longer but effectively
      // quadruples the durability of a tool".
      const { spendDurability } = await import('/src/durability.js');
      const wear = (id) => { const s = { id, enchantments: [{ id: 'unbreaking', level: 3 }] }; let spent = 0; for (let i = 0; i < 20000; i++) spent += spendDurability(s, 1).spent, s.durability = s.maxDurability; return spent / 20000; };
      const tool = wear('diamond_pickaxe'), armour = wear('diamond_chestplate');
      t.check('Unbreaking III: a tool spends ~1/4 of its uses, armour ~0.7', Math.abs(tool - 0.25) < 0.02 && Math.abs(armour - 0.7) < 0.02, { tool: +tool.toFixed(3), armour: +armour.toFixed(3) }, { tool: 0.25, armour: 0.7 });
      // Organization: chests and double chests hold 27 and 54 stacks.
      t.give(BLOCKS.CHEST, 2); await t.run('goto 2 5 3'); await t.run('place chest at 2 5 0'); await t.run('place chest at 3 5 0'); // from the front, so both face south
      const chest = game.chestManager?.getChest?.(2, 5, 0);
      const size = chest?.items?.length ?? chest?.slots?.length ?? chest?.inventory?.length;
      t.notes.push(`a placed chest pair reports ${size} slots`);
      t.check('two chests side by side join into one double chest', chest?.isDouble === true && game.chestManager?.getChest?.(3, 5, 0)?.isDouble === true, { isDouble: chest?.isDouble, halfSlots: size }, 'double (2 x 27 = 54)');
    },
  },
  {
    id: 'general.village',
    tutorial: 'Creating a village; Trading',
    wiki: W('Creating a village'),
    async run(t) {
      const { game } = t;
      // Creating a village: villagers need beds, and willing (fed) villagers breed.
      t.give('white_bed', 3);
      await t.run('goto 4 5 4');
      for (const x of [6, 9, 12]) await t.run(`place white bed at ${x} 5 6`);
      const v1 = t.spawn('villager', 6.5, 5, 2.5), v2 = t.spawn('villager', 8.5, 5, 2.5);
      const before = game.mobs.mobs.filter((m) => m.type === 'villager').length;
      for (const v of [v1, v2]) game.entities.spawnDroppedItem(v.mesh.position.clone(), 'bread', false, 3);
      await t.wait(4);
      const babies = game.mobs.mobs.filter((m) => m.type === 'villager' && m.isBaby);
      t.check('fed villagers with free beds breed', game.mobs.mobs.filter((m) => m.type === 'villager').length === before + 1 && babies.length === 1,
        { villagers: game.mobs.mobs.filter((m) => m.type === 'villager').length, babies: babies.length }, { villagers: 3, babies: 1 }, 'Villager: 3 bread each, a free bed');
      // Trading: "For a villager to offer useful items, you must level it up by trading."
      for (const m of game.mobs.mobs.filter((m) => m.type === 'villager')) remove(game, m);
      await t.wait(1);
      const farmer = t.spawn('villager', 2.5, 5, -3.5);
      farmer.profession = 'farmer';
      const { unlockTradesForLevel } = await import('/src/villagerEconomy.js');
      farmer.trades = []; unlockTradesForLevel(farmer, 1);
      // The offer that pays emeralds (a novice farmer's offers are rolled; one of them can be bread for emeralds).
      farmer.trades.sort((a, b) => (b.reward?.id === 'emerald') - (a.reward?.id === 'emerald'));
      const cost = farmer.trades[0]?.cost;
      if (cost) t.give(cost.id, cost.count * 6);
      for (let i = 0; i < 6; i++) await t.run('trade with villager');
      t.check('trading earns emeralds and levels the villager up', t.count('emerald') >= 1 && (farmer.level ?? 1) >= 2,
        { emeralds: t.count('emerald'), level: farmer.level, xp: farmer.xp, trades: farmer.trades?.length }, 'emeralds, apprentice');
      for (const m of game.mobs.mobs.filter((m) => m.type === 'villager')) remove(game, m);
    },
  },
  {
    id: 'general.glitches',
    tutorial: 'Breaking bedrock; Summoning jockeys; X-ray glitches; Headless pistons; Chunk loader',
    wiki: W('Summoning jockeys'),
    async run(t) {
      const { game } = t;
      // Breaking bedrock: it cannot be mined or blown up in Survival -- which is why the tutorial needs glitches.
      t.set(3, 5, 0, BLOCKS.BEDROCK);
      const tried = await t.breakBlock(3, 5, 0, { maxTicks: 300 });
      t.check('bedrock cannot be mined in Survival', !tried.broken && t.world.getVoxel(3, 5, 0) === BLOCKS.BEDROCK, tried, 'unbroken');
      // Summoning jockeys: "A spider jockey has a 1% chance of spawning out of every spider".
      const r = game.mobs.random;
      game.mobs.random = () => 0.005; const lucky = t.spawn('spider', 8.5, 5, 8.5);
      game.mobs.random = () => 0.5; const plain = t.spawn('spider', 12.5, 5, 8.5);
      game.mobs.random = r;
      const riders = (m) => game.mobs.mobs.filter((x) => x.vehicle === m || m.rider === x || m.passenger === x).length;
      t.check('a spider rolls a skeleton rider 1% of the time', riders(lucky) >= 1 && riders(plain) === 0, { lucky: riders(lucky), plain: riders(plain) }, { lucky: 1, plain: 0 });
      for (const m of game.mobs.mobs.filter((x) => ['spider', 'skeleton'].includes(x.type))) remove(game, m);
      t.notes.push('X-ray glitches, Headless pistons and Chunk loader depend on Java engine behaviour (face culling under a falling block in a composter, a piston extended during an explosion, portal chunk tickets) that this game does not share: there is nothing to exploit, so they are recorded as not applicable rather than failed.');
    },
  },
];
