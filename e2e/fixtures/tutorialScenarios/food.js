// Food tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove, setHunger } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'food.gathering',
    tutorial: 'Gathering food',
    wiki: W('Gathering food'),
    async run(t) {
      const { game, player } = t;
      // "if they are killed with fire they will drop cooked meat which is more nourishing" -- a Fire Aspect sword.
      t.give('iron_sword', 1);
      const sword = game.inventory.hotbar.find((s) => s?.id === 'iron_sword'); sword.enchantments = [{ id: 'fire_aspect', level: 2 }];
      await t.run('equip iron sword');
      const before = new Set(game.entities.droppedItems);
      t.spawn('pig', 3.5, 5, 0.5); await t.run('attack pig'); await t.wait(2);
      const got = { porkchop: t.count('porkchop'), cooked: t.count('cooked_porkchop') };
      t.check('a pig killed with Fire Aspect drops cooked porkchops', got.cooked >= 1 && got.porkchop === 0, got, 'cooked only');
      // "(1 Hay Bale = 9 Wheat = 3 Bread = 15 food points)"
      t.set(1, 5, 1, BLOCKS.CRAFTING_TABLE); await t.run('goto 0 5 2');
      t.give(BLOCKS.HAY_BLOCK, 1); await t.run('craft 1 wheat'); await t.run('craft 3 bread');
      setHunger(player, 0, 0);
      for (let i = 0; i < 3; i++) await t.run('eat bread');
      t.check('a hay bale is 9 wheat, 3 bread, 15 hunger', t.count('bread') === 0 && game.player.hunger === 15, { hunger: game.player.hunger }, 15);
      setHunger(player, 20, 5);
      // "Note that salmon and cod drop their respective fish".
      const cod = t.spawn('cod', 6.5, 5, 6.5); const fishBefore = new Set(game.entities.droppedItems);
      game.mobs.damageMob(cod, 99, player.position, false, player); await t.wait(1.5);
      const dropped = game.entities.droppedItems.filter((d) => !fishBefore.has(d)).map((d) => d.itemType);
      t.check('a cod drops raw cod', dropped.includes('cod'), dropped, ['cod']);
      remove(game, cod);
    },
  },
];
