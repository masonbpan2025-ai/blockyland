// Verification helper: every registered spawn egg must reach a real mob type through the
// dispatcher rather than falling through to the Villager fallback.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEMS } from '../src/blocks.js';
import { MobManager } from '../src/mobs.js';

function fixture() {
  const scene = new THREE.Scene();
  const world = { getVoxel: () => 0, getLightLevel: () => 0, getHeightAt: () => 0 };
  const sounds = new Proxy({}, { get: () => () => {} });
  const entities = { drops: [], spawnDroppedItem() {}, spawnXpOrbs() {}, spawnDeathParticles() {} };
  const manager = Object.assign(Object.create(MobManager.prototype), {
    world, scene, sounds, entities, mobs: [], arrows: [], customProjectiles: [],
    textures: {}, isBlockSolid: () => false
  });
  manager.game = { difficulty: 'normal', weather: { weatherType: 'clear' }, player: null, controls: {} };
  return manager;
}

/**
 * Deliberate aliases: two egg ids deliberately resolve to an existing mob type.
 *
 * These are the codebase's own naming choices, not missing implementations, so they are
 * listed explicitly rather than silently tolerated.
 */
const KNOWN_ALIASES = {
  octopus: 'squid',
  zombie_pigman: 'zombified_piglin',
  // Wiki: The Killer Bunny "can only be spawned using commands", so it is a named entry that maps onto the
  // rabbit spawner's killer flag rather than a separate mob. Declared rather than silently tolerated,
  // because the alias is a design choice: it keeps the hunt, armour and coat in one place.
  killer_bunny: 'rabbit'
};

test('every spawn egg maps to a mob that spawns as its own type', () => {
  const manager = fixture();
  const eggs = Object.entries(ITEMS).filter(([, def]) => def && def.type === 'spawn_egg');
  assert.ok(eggs.length > 20, `expected a broad egg list, got ${eggs.length}`);

  const fellThrough = [];
  const resolvedByAlias = [];
  for (const [eggId, def] of eggs) {
    const mob = manager.spawnMob(def.mob, 0, 1, 0);
    assert.ok(mob, `${eggId} should spawn ${def.mob}`);
    if (mob.type === def.mob) continue;
    // An alias is only acceptable when it is declared above.
    if (KNOWN_ALIASES[def.mob] === mob.type) resolvedByAlias.push(`${def.mob} -> ${mob.type}`);
    else fellThrough.push(`${def.mob} -> ${mob.type}`);
  }

  assert.deepEqual(fellThrough, [],
    `these spawn eggs fall through to another mob, so the type has no native implementation: ${fellThrough.join(', ')}`);
  // Sanity: the alias list has not gone stale.
  for (const [from, to] of Object.entries(KNOWN_ALIASES)) {
    assert.ok(resolvedByAlias.includes(`${from} -> ${to}`),
      `${from} -> ${to} is declared as an alias but no longer behaves that way`);
  }
});
