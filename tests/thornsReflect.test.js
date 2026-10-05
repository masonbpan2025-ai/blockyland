// Thorns reflection, wired through Player.takeDamage.
//
// The formula is tested in enchantmentEffects.test.js. What matters here is the WIRING: when the hook
// fires, what it receives, and the cases where it must not fire at all. Those are the parts a later edit
// could break without touching a formula.
//
// The attacker is identified from the source position rather than passed by the caller, because mobs.js
// passes `mob.mesh.position` in four places and that file is another agent's. Player takes the 4th
// parameter when given, and the receiver falls back to the position otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/player.js';

/** A Player-shaped object with armour and no engine behind it. */
function playerWith(armour, opts = {}) {
  const p = Object.create(Player.prototype);
  p.gamemode = 'survival';
  p.health = opts.health ?? 20;
  p.maxHealth = 20;
  p.isDead = false;
  p.invulnerableTimer = 0;
  p.statusEffects = new Map();
  p.saturation = 5;
  p.exhaustion = 0;
  p._hungerState = null;
  p.position = { x: 0, y: 0, z: 0, clone: () => ({ sub: () => ({ setY: () => ({ normalize: () => ({}) }) }) }) };
  // The death path touches more of the vector than the damage path does, so the stub carries the methods
  // a real THREE.Vector3 would answer to rather than only the ones the happy path calls.
  p.velocity = {
    x: 0, y: 0, z: 0,
    addScaledVector: () => {},
    set: () => {},
    setY: () => p.velocity,
    multiplyScalar: () => {},
    length: () => 0,
  };
  p.sounds = { playHurt: () => {}, playShieldBlock: () => {} };
  p.inventory = {
    armor: armour,
    getOffhandItem: () => null,
    getActiveItem: () => null,
    // takeDamage reads these before it reaches the thorns block, so the stub needs them even though this
    // test is not about armour points.
    getTotalArmorPoints: () => 0,
    getTotalArmorToughness: () => 0,
  };
  p.addExhaustion = () => {};
  p.ensureHungerState = () => {};
  // 0 passes every proc check and rolls the minimum damage, so the hook fires deterministically.
  p.random = opts.random ?? (() => 0);
  p.reflections = [];
  p.onThornsReflect = (attacker, damage, procs, sourcePos) => {
    p.reflections.push({ attacker, damage, procs, sourcePos });
  };
  return p;
}

const thorns = (level) => ({ id: 'thorns', level });

test('armourEnchantmentLists returns one list per worn piece', () => {
  const p = playerWith({
    head: { enchantments: [thorns(3)] },
    chest: null,
    legs: { enchantments: [] },
    feet: { enchantments: [{ id: 'feather_falling', level: 4 }] },
  });
  const lists = p.armourEnchantmentLists();
  assert.equal(lists.length, 4, 'four slots, worn or not');
  assert.deepEqual(lists[0], [thorns(3)]);
  assert.deepEqual(lists[1], [], 'an empty slot is an empty list, not undefined');
  assert.deepEqual(lists[2], []);
  assert.deepEqual(lists[3], [{ id: 'feather_falling', level: 4 }]);
  assert.deepEqual(playerWith(null).armourEnchantmentLists(), [], 'no armour at all');
});

test('thorns reflects on to the attacker identified by the source position', () => {
  const p = playerWith({ head: { enchantments: [thorns(3)] } });
  const sourcePos = { x: 1, y: 0, z: 0 };
  p.takeDamage(4, sourcePos, 'generic');
  assert.equal(p.reflections.length, 1, 'the hook should have fired');
  const r = p.reflections[0];
  assert.equal(typeof r.damage, 'number');
  assert.ok(r.damage >= 1 && r.damage <= 4, 'damage in vanilla range, got ' + r.damage);
  assert.equal(r.sourcePos, sourcePos, 'and the position is passed through for the receiver to resolve');
});

test('an explicit attacker is used instead of the position', () => {
  const p = playerWith({ chest: { enchantments: [thorns(3)] } });
  const mob = { type: 'zombie' };
  p.takeDamage(4, { x: 1, y: 0, z: 0 }, 'zombie', mob);
  assert.equal(p.reflections.length, 1);
  assert.equal(p.reflections[0].attacker, mob, 'the named attacker should win');
});

test('a fatal blow reflects nothing', () => {
  // Vanilla does not proc thorns on a killing hit, and there is nothing left to reflect from anyway.
  const p = playerWith({ head: { enchantments: [thorns(3)] } }, { health: 1 });
  p.takeDamage(20, { x: 1, y: 0, z: 0 }, 'generic');
  assert.equal(p.health, 0, 'the player should be dead');
  assert.deepEqual(p.reflections, [], 'and nothing reflected');
});

test('fall and void damage have no attacker to reflect on to', () => {
  // The random is 0 so the proc check PASSES: without it these assertions would hold half the time even
  // if the damage-type guard were removed entirely.
  for (const type of ['fall', 'void']) {
    const p = playerWith({ head: { enchantments: [thorns(3)] } }, { random: () => 0 });
    p.takeDamage(4, { x: 1, y: 0, z: 0 }, type);
    assert.deepEqual(p.reflections, [], type + ' should not proc thorns');
  }
});

test('no thorns means no hook call at all', () => {
  const p = playerWith({ head: { enchantments: [{ id: 'protection', level: 4 }] } });
  p.takeDamage(4, { x: 1, y: 0, z: 0 }, 'generic');
  assert.deepEqual(p.reflections, [], 'protection is not thorns');
  const bare = playerWith(null, { random: () => 0 });
  bare.takeDamage(4, { x: 1, y: 0, z: 0 }, 'generic');
  assert.deepEqual(bare.reflections, [], 'and bare skin is not either');
});

test('damage with no source position and no attacker does not fire', () => {
  // `player.takeDamage(p.damage)` is a real call site: a potion effect with no actor.
  const p = playerWith({ head: { enchantments: [thorns(3)] } }, { random: () => 0 });
  p.takeDamage(4);
  assert.deepEqual(p.reflections, [], 'nothing to reflect on to');
});

test('a player without the hook does not crash', () => {
  // The hook is optional, so a Player built by a test or a tool that never wires it must still take damage.
  const p = playerWith({ head: { enchantments: [thorns(3)] } }, { random: () => 0 });
  p.onThornsReflect = undefined;
  assert.doesNotThrow(() => p.takeDamage(4, { x: 1, y: 0, z: 0 }, 'generic'));
  assert.equal(p.health, 16, 'and still lose the health');
});

test('a failing proc roll reflects nothing, which is what the injectable random is for', () => {
  // 1 fails every proc check, so this is the same armour and the same hit as the positive test with only
  // the dice changed. If the random were ignored, this would fire and the test would say so.
  const p = playerWith({ head: { enchantments: [thorns(3)] } }, { random: () => 1 });
  p.takeDamage(4, { x: 1, y: 0, z: 0 }, 'generic');
  assert.deepEqual(p.reflections, [], 'a failed roll should not proc');
  assert.equal(p.health, 16, 'but the damage still lands');
});
