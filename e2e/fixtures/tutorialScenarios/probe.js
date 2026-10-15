// Diagnostics used while investigating a play-test failure (not a tutorial). Run with TUTORIALS=probe.
import { BLOCKS } from '../../../src/blocks.js';
export const SCENARIOS = [{
  id: 'probe.death', tutorial: '-', wiki: '-',
  async run(t) {
    const { game, player } = t;
    t.give('iron_ingot', 5);
    console.log(`[playtest] before deathDropsDone=${player.deathDropsDone} isDead=${player.isDead} keep=${game.gamerules?.keepInventory}/${game.settings?.keepInventory} mod=${!!game.modRuntime?.keepInventoryOnDeath?.()} invSame=${player.inventory === game.inventory}`);
    const n0 = game.entities.droppedItems.length;
    player.takeDamage(100, null, 'generic');
    console.log(`[playtest] after isDead=${player.isDead} deathDropsDone=${player.deathDropsDone} drops+${game.entities.droppedItems.length - n0} inv=${JSON.stringify(t.items())}`);
    await t.wait(1);
    console.log(`[playtest] later drops=${game.entities.droppedItems.length - n0} inv=${JSON.stringify(t.items())} pos=${player.position.toArray()}`);
    player.respawn(); await t.wait(1);
    console.log(`[playtest] respawn pos=${player.position.toArray().map((v) => v.toFixed(2))} spawnPoint=${JSON.stringify(game.world.spawnPoint ?? game.spawnPoint ?? null)} worldSpawn=${JSON.stringify(game.worldSpawn ?? null)}`);
  },
}];
