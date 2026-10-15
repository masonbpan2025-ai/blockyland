import { BLOCKS } from '../../../src/blocks.js';
export const SCENARIOS = [{
  id: 'probe.piglin', tutorial: 'probe', wiki: '',
  async run(t) {
    const { game, player } = t;
    game.switchDimension('nether', { x: 0.5, y: 30, z: 14.5 });
    const y = 30;
    t.fill(-12, y - 1, 8, 12, y - 1, 32, BLOCKS.NETHERRACK); t.fill(-12, y, 8, 12, y + 10, 32, BLOCKS.AIR);
    player.position.set(0.5, y, 14.5); await t.wait(1);
    const piglin = t.spawn('piglin', 0.5, y, 19.5); piglin.frozen = true;
    t.give('gold_ingot', 1); await t.run('equip gold ingot');
    game.playerBot.lookAt({ x: 0.5, y: y + 0.5, z: 19.5 }); await t.wait(0.2);
    game.dropHeldItem(); const d = game.entities.droppedItems.at(-1);
    piglin.frozen = false;
    for (let i = 0; i < 150; i++) { t.step(); if (i % 10 === 0) { const pos = piglin.mesh.position; const mm = game.mobs; const beh = mm.hostileBehaviors ?? mm.hostileMobBehaviors ?? mm.behaviors; t.notes.push(`${i} dist ${d.group.position.distanceTo(pos).toFixed(2)} count ${d.count} inList ${game.entities.droppedItems.includes(d)} behWorld ${beh?.world === game.world} behEnt ${beh?.entities === game.entities} keys ${Object.keys(mm).filter(k=>/behav/i.test(k)).join('|')} barter ${piglin.isBartering} target ${piglin.target === player} disabled ${piglin.admireDisabledTime} item ${d.group.position.toArray().map((v) => v.toFixed(1))} pig ${piglin.mesh.position.toArray().map((v) => v.toFixed(1))} adv ${player.advancements?.has('nether/distract_piglin')} hp ${player.health} grief ${game.world.mobGriefing}`); await Promise.resolve(); } }
    t.check('x', true, 1, 1);
  },
}];
