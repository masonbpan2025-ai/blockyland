// Diagnostics used while investigating a play-test failure (not a tutorial). Run with TUTORIALS=probe.
import { BLOCKS } from '../../../src/blocks.js';
import { setHunger } from './_shared.js';
export const SCENARIOS = [{
  id: 'probe.stew', tutorial: '-', wiki: '-',
  async run(t) {
    const { game, player } = t;
    for (let i = 0; i < 8; i++) t.give(BLOCKS.DIRT, 64);
    t.give('bowl', 3); t.give('mushroom_stew', 1);
    setHunger(player, 10, 0);
    const p = game.playerBot.run('eat mushroom stew'); let done = false, res; p.then((r) => { done = true; res = r; });
    let last = null;
    for (let i = 0; i < 120 && !done; i++) {
      t.step(); await Promise.resolve();
      const held = game.inventory.getActiveItem();
      if (i % 6 === 0) console.log(`[playtest] i${i} slot=${game.inventory.activeSlot} held=${held?.id} same=${held === last} eating=${game.eating?.active} time=${game.eating?.time?.toFixed(2)} item=${game.eating?.item?.id} hunger=${player.hunger}`);
      last = held;
    }
    console.log('[playtest] result', JSON.stringify(res));
  },
}];
