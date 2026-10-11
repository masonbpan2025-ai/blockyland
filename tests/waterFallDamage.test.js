// Fall damage into water.
//
// Wiki (Water): "Water of any depth prevents any entity, including the player, from sustaining falling damage
// if they fall into it, regardless of the distance fallen."
//
// The bug this pins: a dive to the bottom of a pool is one long fall, and `applyFallDamage` only consulted the
// fall-absorbing blocks (hay, slime, honey), so landing in water cost full damage for the whole drop. Reported
// as "the player seems to take a lot of damage when falling to the bottom of water".
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';
import { BLOCKS } from '../src/blocks.js';

/** A player stub with just the fields applyFallDamage and takeDamage touch. */
function stub({ landed, inWater }) {
  const player = Object.create(Player.prototype);
  Object.assign(player, {
    position: { x: 0.5, y: 1, z: 0.5 },
    health: 20,
    maxHealth: 20,
    gamemode: 'survival',
    inWater,
    statusEffects: new Map(),
    world: { getVoxel: () => landed },
    takeDamage(amount) { this.health -= amount; },
    addExhaustion() {},
  });
  return player;
}

test('falling into water costs nothing, however far the fall', () => {
  const intoWater = stub({ landed: BLOCKS.WATER, inWater: true });
  assert.equal(intoWater.applyFallDamage(40, 0), 0, 'a 40-block dive into water is free');
  assert.equal(intoWater.health, 20, 'and health is untouched');

  // Submerged at the moment of landing even though the block below is solid: that is the bottom of a pool.
  const toTheBottom = stub({ landed: BLOCKS.STONE, inWater: true });
  assert.equal(toTheBottom.applyFallDamage(40, 0), 0, 'the bottom of a pool is still water');

  // Touching the surface is enough, even if the feet have not sunk in yet.
  const surface = stub({ landed: BLOCKS.WATER, inWater: false });
  assert.equal(surface.applyFallDamage(40, 0), 0, 'landing on the water surface counts');
});

test('a long fall onto dry ground still hurts', () => {
  const dry = stub({ landed: BLOCKS.STONE, inWater: false });
  assert.ok(dry.applyFallDamage(40, 0) > 0, 'stone is not forgiving');
  assert.ok(dry.health < 20, 'and it comes off the health');
});

test('a short fall onto dry ground is still free', () => {
  const hop = stub({ landed: BLOCKS.STONE, inWater: false });
  assert.equal(hop.applyFallDamage(2, 0), 0, 'a two-block drop is not damage');
});
