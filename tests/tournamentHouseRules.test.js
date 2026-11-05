// The World Martial Arts Tournament's house rules (src/mods/dragonball-tournament/trainingGrounds.js), driven through
// the mod's real registration and the game's own mob update, at noon under an open sky:
//   * the announcer, the trainers and the spectating villagers cannot be hurt by the player;
//   * zombies and skeletons do not burn in daylight;
//   * zombies, skeletons and pillagers stay on their training ground.
// And none of it outside the tournament world.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { MobManager } from '../src/mobs.js';
import { installTournamentProviders } from './helpers/tournamentProviders.js';

/** A real mob manager with the tournament mod loaded, on a stone floor in full sunlight at noon. */
function noon({ tournament = true } = {}) {
  const world = {
    getVoxel: (x, y, z) => (y < 1 ? BLOCKS.STONE : BLOCKS.AIR),
    getHeightAt: () => 0, surfaceHeightAt: () => 1, getLightLevel: () => 15, setVoxel() {},
  };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene: new THREE.Scene(), sounds: new Proxy({}, { get: () => () => {} }), mobs: [], arrows: [],
    customProjectiles: [], textures: {}, random: Math.random,
    entities: { spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {}, spawnParticleBurst() {}, spawnEndermanParticles() {} },
    isBlockSolid: (x, y, z) => world.getVoxel(x, y, z) === BLOCKS.STONE,
  });
  const player = {
    position: new THREE.Vector3(300, 1, 300), velocity: new THREE.Vector3(), gamemode: 'survival', health: 20,
    keys: {}, takeDamage() {}, applyStatusEffect() {}, hasStatusEffect: () => false,
  };
  const game = {
    player, mobs: manager, difficulty: 'normal', worldTime: 6000, controls: {}, weather: { weatherType: 'clear' },
    tournament: { isTournamentMap: tournament, update() {} },
  };
  manager.game = game;
  installTournamentProviders(game);
  const run = (seconds) => { for (let t = 0; t < seconds; t += 0.05) manager.update(0.05, player); };
  return { manager, player, run };
}

// --- who cannot be hurt ----------------------------------------------------------

test('the announcer, the trainers and the villagers take no damage from the player', () => {
  const { manager, player, run } = noon();
  const people = ['tournament_host', 'site_manager', 'villager'].map((type) => manager.spawnMob(type, 0, 1, 0));
  run(0.1);
  for (const mob of people) {
    const before = mob.health;
    manager.damageMob(mob, 50, player.position, true, player);   // a punch
    manager.damageMob(mob, 50, player.position);                  // a ki blast (it names no attacker)
    assert.equal(mob.health, before, `${mob.type} is unhurt`);
  }
});

test('the opponent can still be hurt, and outside the tournament a villager can be', () => {
  const inside = noon();
  const jackie = inside.manager.spawnMob('jackie_chun', 0, 1, 0);
  inside.run(0.1);
  const before = jackie.health;
  inside.manager.damageMob(jackie, 5, inside.player.position, true, inside.player);
  assert.ok(jackie.health < before, 'Jackie Chun takes the hit');

  const outside = noon({ tournament: false });
  const villager = outside.manager.spawnMob('villager', 0, 1, 0);
  outside.run(0.1);
  outside.manager.damageMob(villager, 5, outside.player.position, true, outside.player);
  assert.ok(villager.health < villager.maxHealth, 'an ordinary villager does');
});

// --- the sun ------------------------------------------------------------------------

test('in the tournament, zombies and skeletons at noon do not burn', () => {
  const { manager, run } = noon();
  const mobs = ['zombie', 'skeleton'].map((type, i) => manager.spawnMob(type, 40 + i * 4, 1, 0));
  run(6);
  for (const mob of mobs) {
    assert.ok(!mob.isBurning, `${mob.type} is not on fire`);
    assert.equal(mob.health, mob.maxHealth, `${mob.type} is unhurt`);
  }
});

test('outside it, they still burn', () => {
  const { manager, run } = noon({ tournament: false });
  const mobs = ['zombie', 'skeleton'].map((type, i) => manager.spawnMob(type, i * 4, 1, 0));
  run(6);
  for (const mob of mobs) assert.ok(mob.health < mob.maxHealth || !manager.mobs.includes(mob), `${mob.type} burned`);
});

// --- the training grounds -------------------------------------------------------------

test('a zombie, a skeleton and a pillager chasing the player off their training ground stop at its edge', () => {
  const { manager, player, run } = noon();
  // The Punching Yard runs x 28 to 72; the player stands past its east edge.
  const mobs = ['zombie', 'skeleton', 'pillager'].map((type, i) => manager.spawnMob(type, 68, 1, -4 + i * 4));
  player.position.set(80, 1, 0);
  run(8);
  for (const mob of mobs) {
    assert.ok(mob.mesh.position.x <= 72, `${mob.type} is still in the yard (x ${mob.mesh.position.x.toFixed(2)})`);
    assert.ok(mob.mesh.position.x > 69, `${mob.type} came to the edge, chasing (x ${mob.mesh.position.x.toFixed(2)})`);
  }
  // Knocked out by a blow, it is put straight back.
  const zombie = mobs[0];
  zombie.mesh.position.x = 75;
  run(0.05);
  assert.ok(zombie.mesh.position.x <= 72, 'put back on the yard');
});

test('outside the tournament a zombie follows the player wherever', () => {
  const { manager, player, run } = noon({ tournament: false });
  const zombie = manager.spawnMob('zombie', 68, 1, 0);
  player.position.set(80, 1, 0);
  // Night, so the sun does not take it first.
  manager.game.worldTime = 18000;
  run(8);
  assert.ok(zombie.mesh.position.x > 72, `it left the yard (x ${zombie.mesh.position.x.toFixed(2)})`);
});
