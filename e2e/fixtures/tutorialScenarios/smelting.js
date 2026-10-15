// Smelting tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'smelting.fuel',
    tutorial: 'Smelting',
    wiki: W('Smelting'),
    async run(t) {
      const { getFuelBurnTime } = await import('/src/furnace.js');
      // "you can smelt 1 item with 2 sticks/saplings or 4 bamboo"; "wooden slabs smelt 0.75 items"; dried kelp blocks
      // smelt 20; coal 8; planks 1.5.
      const items = (id) => getFuelBurnTime({ id }) / 10;
      const got = { stick: items('stick'), sapling: items(BLOCKS.OAK_SAPLING), bamboo: items(BLOCKS.BAMBOO), slab: items(BLOCKS.OAK_SLAB), kelpBlock: items(BLOCKS.DRIED_KELP_BLOCK), coal: items('coal'), planks: items(BLOCKS.OAK_PLANKS) };
      t.check('fuel values: stick and sapling 0.5, bamboo 0.25, slab 0.75, dried kelp block 20, coal 8, planks 1.5',
        got.stick === 0.5 && got.sapling === 0.5 && got.bamboo === 0.25 && got.slab === 0.75 && got.kelpBlock === 20 && got.coal === 8 && got.planks === 1.5, got, { stick: 0.5, sapling: 0.5, bamboo: 0.25, slab: 0.75, kelpBlock: 20, coal: 8, planks: 1.5 });
      // Played: "smelt 1 item with 2 sticks".
      t.give(BLOCKS.FURNACE, 1); await t.run('place furnace at 2 5 0');
      t.give(BLOCKS.COBBLESTONE, 1); t.give('stick', 2);
      const cooked = await t.run('cook 1 cobblestone with 2 stick at 2 5 0', { maxTicks: 900 });
      t.check('two sticks smelt one item', cooked.ok && t.count(BLOCKS.STONE) === 1 && t.count('stick') === 0, { stone: t.count(BLOCKS.STONE), sticksLeft: t.count('stick') }, { stone: 1, sticksLeft: 0 });
    },
  },
  {
    id: 'smelting.automatic',
    tutorial: 'Automatic smelting',
    wiki: W('Automatic smelting'),
    async run(t) {
      const { game } = t;
      const red = game.world.redstone, cm = game.chestManager;
      // "Step 1: Place down a chest ... Step 2: Attach a hopper to the chest. Step 3: Place the furnace on top of the
      // hopper. Step 4: Place one hopper on the top and 1 hopper on the side ... Step 5: Place a chest on top of each
      // hopper attached to the furnace." Built with the game's own block placement records.
      const place = (x, y, z, id) => t.set(x, y, z, id);
      cm.placeChest(game.world, [0, 5, 4], 0);                // output chest
      place(0, 6, 4, BLOCKS.HOPPER); red.configure([0, 6, 4], 3); // hopper under the furnace, pointing down into the chest
      place(0, 7, 4, BLOCKS.FURNACE);
      place(0, 8, 4, BLOCKS.HOPPER); red.configure([0, 8, 4], 3); // input hopper, pointing down into the furnace
      cm.placeChest(game.world, [0, 9, 4], 0);                // input chest
      place(1, 7, 4, BLOCKS.HOPPER); red.configure([1, 7, 4], 1); // fuel hopper on the side, pointing -x into the furnace
      cm.placeChest(game.world, [1, 8, 4], 0);                // fuel chest
      cm.addItem(0, 9, 4, BLOCKS.COBBLESTONE, true, 8);
      cm.addItem(1, 8, 4, 'coal', false, 1);
      await t.wait(100);
      const out = (cm.getChest(0, 5, 4)?.items ?? []).filter(Boolean).reduce((n, s) => n + (s.id === BLOCKS.STONE ? s.count : 0), 0);
      t.check('a chest-hopper-furnace-hopper-chest stack smelts on its own: 8 cobblestone and a coal give 8 stone', out === 8, out, 8,
        '"The fuel hopper on the side never needs to be switched off"');
    },
  },
];
