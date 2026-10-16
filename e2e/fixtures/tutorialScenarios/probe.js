// Diagnostics used while investigating a play-test failure (not a tutorial). Run with TUTORIALS=probe.
export const SCENARIOS = [{
  id: 'probe.zombie', tutorial: '-', wiki: '-',
  async run(t) {
    const { game } = t;
    t.give('stone_sword', 1);
    game.worldTime = 15000;
    const z = t.spawn('zombie', 6.5, 5, 6.5);
    const p = game.playerBot.run('attack zombie'); let done = false, res; p.then((r) => { done = true; res = r; });
    for (let i = 0; i < 400 && !done; i++) { t.step(); if (i % 15 === 0) console.log(`[playtest] t${i} hp=${game.player.health.toFixed(1)} zhp=${z.health} hitCd=${z.hitCooldown?.toFixed?.(2)} atkCd=${z.attackCooldown?.toFixed?.(2)} dist=${z.mesh.position.distanceTo(game.player.position).toFixed(2)} target=${game.targetMob?.type ?? '-'} since=${game.player.secondsSinceSwing?.toFixed?.(2)} held=${game.inventory.getActiveItem()?.id}`); await Promise.resolve(); }
    console.log('[playtest] result', JSON.stringify(res));
  },
}];
