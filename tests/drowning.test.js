// Drowning, against the wiki's numbers.
//
// Wiki (Water, "Drowning"): "Players and mobs (except aquatic mobs, undead mobs and iron golems) have a breath
// meter that lasts 15 seconds. After they run out of breath, they take 2 HP drowning damage every second until
// they die, surface, or enter bubble columns."
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { BLOCKS } from '../src/blocks.js';

/** A player stub with just the fields tickBreath touches. `head` is what the world returns at eye height. */
function stub({ head = BLOCKS.WATER, effects = [], respiration = 0 } = {}) {
  const player = Object.create(Player.prototype);
  const damage = [];
  Object.assign(player, {
    position: { x: 0.5, y: 1, z: 0.5 },
    eyeHeight: 1.62,
    health: 20,
    maxHealth: 20,
    gamemode: 'survival',
    breath: 15,
    drownTimer: 0,
    statusEffects: new Map(effects.map((id) => [id, { duration: 30, level: 1 }])),
    armourEnchantmentLevel: (id) => (id === 'respiration' ? respiration : 0),
    hasStatusEffect(id) { return this.statusEffects.has(id); },
    world: { getVoxel: () => head },
    takeDamage(amount) { damage.push(amount); this.health -= amount; },
  });
  player.damage = damage;
  return player;
}

const tick = (player, seconds, step = 0.1) => {
  for (let t = 0; t < seconds; t += step) player.tickBreath(step);
};

test('the meter lasts fifteen seconds, then drowning costs 2 HP a second', () => {
  const player = stub();
  tick(player, 14.9);
  assert.equal(player.damage.length, 0, 'nothing inside the meter');
  assert.ok(player.breath > 0, 'and breath to spare');

  tick(player, 2.0);
  assert.equal(player.damage.length, 1, 'the first second past the meter costs one hit');
  assert.equal(player.damage[0], 2, 'of 2 HP');

  tick(player, 3);
  assert.ok(player.damage.length >= 3 && player.damage.length <= 5,
    `roughly one hit a second, got ${player.damage.length}`);
  assert.ok(player.damage.every((amount) => amount === 2), 'always 2 HP');
});

test('surfacing refills the meter instantly', () => {
  const player = stub();
  tick(player, 20);
  assert.ok(player.damage.length > 0, 'drowning by now');

  player.world.getVoxel = () => BLOCKS.AIR;
  player.tickBreath(0.1);
  assert.equal(player.breath, 15, 'full again');
  assert.equal(player.drownTimer, 0, 'and the damage timer is cleared');

  player.world.getVoxel = () => BLOCKS.WATER;
  const before = player.damage.length;
  tick(player, 10);
  assert.equal(player.damage.length, before, 'the refilled meter has to run out again before it hurts');
});

test('a one-block puddle does not drown you: the head decides, not the feet', () => {
  const player = stub({ head: BLOCKS.AIR });
  player.inWater = true;
  tick(player, 30);
  assert.equal(player.damage.length, 0, 'wet feet are not drowning');
  assert.equal(player.breath, 15, 'the meter never started');
});

test('a bubble column is air to breathe', () => {
  const player = stub({ head: BLOCKS.BUBBLE_COLUMN });
  tick(player, 30);
  assert.equal(player.damage.length, 0, 'bubble columns let you breathe');
});

test('water breathing pauses the meter', () => {
  const player = stub({ effects: ['water_breathing'] });
  tick(player, 40);
  assert.equal(player.damage.length, 0, 'no drowning under water breathing');
});

test('Respiration extends the meter', () => {
  // Measured against the same run without the enchantment rather than against an assumed 30 seconds: if the
  // wiring is wrong, the difference is zero and this says so instead of pinning a number.
  const plain = stub({ respiration: 0 });
  const breathed = stub({ respiration: 1 });
  tick(plain, 29.5);
  tick(breathed, 29.5);
  assert.ok(plain.damage.length > 0, 'without Respiration the player is drowning by now');
  assert.ok(breathed.damage.length < plain.damage.length,
    `Respiration I should buy time: ${breathed.damage.length} hits vs ${plain.damage.length}`);
});
