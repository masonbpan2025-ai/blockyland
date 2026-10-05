// Blocking costs the shield durability.
//
// The shield was registered as durable -- `FIXED_DURABILITY` gives it 336 -- and nothing ever spent any of
// it, so a shield was permanent. It is the third and last piece of the same gap: tool durability was
// missing, then armour durability, and the shield was the one left.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { maxDurabilityFor } from '../src/durability.js';

/**
 * A Player shaped object that can block, with a controllable random.
 *
 * `takeDamage` needs a fair amount of state before it reaches the shield branch, so it is all set here
 * rather than per test.
 */
function blocker({ damage = 5, sourcePos = null, offhand = true, blocking = true, gamemode = 'survival',
  random = () => 0.999 } = {}) {
  const p = Object.create(Player.prototype);
  const shield = { id: 'shield' };
  p.gamemode = gamemode;
  p.isDead = false;
  p.invulnerableTimer = 0;
  p.health = 20;
  p.maxHealth = 20;
  p.position = new THREE.Vector3(0, 1, 0);
  p.velocity = new THREE.Vector3();
  p.statusEffects = new Map();
  p.isBlocking = blocking;
  // Facing -Z, so a source at -Z is in front and one at +Z is behind.
  p.yaw = 0;
  p.isGatheringKi = false;
  p.random = random;
  p.messages = [];
  p.ui = { addChatMessage: (m) => p.messages.push(m) };
  p.sounds = { playShieldBlock() {}, playHurt() {} };
  p.addExhaustion = () => {};
  p.inventory = {
    armor: { head: null, chest: null, legs: null, feet: null },
    getOffhandItem: () => (offhand ? shield : null),
    getActiveItem: () => null,
    getTotalArmorPoints: () => 0,
    getTotalArmorToughness: () => 0,
    getArmorPoints: () => 0,
  };
  p.armourEnchantmentLists = () => [];
  p.hasStatusEffect = () => false;
  p.updateCameraAndModel = () => {};
  p.takeDamage(damage, sourcePos, 'generic', null);
  return { p, shield };
}

test('a blocked hit costs the shield one point', () => {
  const { shield } = blocker();
  assert.equal(shield.maxDurability, maxDurabilityFor('shield'), 'the shield should be sized by the table');
  assert.equal(shield.maxDurability, 336);
  assert.equal(shield.maxDurability - shield.durability, 1, 'blocking should cost exactly one point');
});

test('a hit from behind is not blocked and costs nothing', () => {
  // The cone check is the reason blocking is not simply "isBlocking is true": a source behind the player
  // has to land. This also proves the durability charge sits inside the blocked branch.
  //
  // The player faces -Z at yaw 0, so a source at +Z is behind.
  const behind = blocker({ sourcePos: new THREE.Vector3(0, 1, 5) });
  assert.equal(behind.shield.durability, undefined, 'a hit from behind must not wear the shield');
  assert.ok(behind.p.health < 20, 'and must actually deal damage');
  // And a source in front is blocked.
  const front = blocker({ sourcePos: new THREE.Vector3(0, 1, -5) });
  assert.equal(front.p.health, 20, 'a hit from the front should be fully deflected');
  assert.equal(front.shield.durability, 335, 'and cost the shield a point');
});

test('each blocked hit costs one point, and the shield lasts its full 336', () => {
  // Repeated blocking, to show the charge accumulates rather than resetting.
  const p = Object.create(Player.prototype);
  const shield = { id: 'shield' };
  Object.assign(p, {
    gamemode: 'survival', isDead: false, health: 20, maxHealth: 20, yaw: 0, isGatheringKi: false,
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), statusEffects: new Map(),
    isBlocking: true, random: () => 0.999, sounds: { playShieldBlock() {}, playHurt() {} },
    addExhaustion() {}, armourEnchantmentLists: () => [], hasStatusEffect: () => false,
    updateCameraAndModel() {}, ui: { addChatMessage() {} },
    inventory: { armor: {}, getOffhandItem: () => shield, getActiveItem: () => null,
        getTotalArmorPoints: () => 0, getTotalArmorToughness: () => 0, getArmorPoints: () => 0 },
  });
  for (let i = 0; i < 10; i++) {
    p.invulnerableTimer = 0;
    p.takeDamage(5, new THREE.Vector3(0, 1, -3));
  }
  assert.equal(shield.maxDurability - shield.durability, 10, 'ten blocked hits should be ten points');
});

test('unbreaking reduces shield wear', () => {
  // `spendDurability` applies unbreaking, so a shield with it lasts longer. A roll of zero passes every
  // keep check, so an unbreaking III shield spends nothing at all while a plain one spends its point --
  // which is the discriminating pair. Giving both shields the same roll is what makes this a test of the
  // enchantment rather than of the dice.
  const build = (enchantments) => {
    const p = Object.create(Player.prototype);
    const shield = { id: 'shield' };
    if (enchantments) shield.enchantments = enchantments;
    Object.assign(p, {
      gamemode: 'survival', isDead: false, health: 20, maxHealth: 20, yaw: 0, isGatheringKi: false,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), statusEffects: new Map(),
      isBlocking: true, random: () => 0, sounds: { playShieldBlock() {}, playHurt() {} },
      addExhaustion() {}, armourEnchantmentLists: () => [], hasStatusEffect: () => false,
      updateCameraAndModel() {}, ui: { addChatMessage() {} },
      inventory: { armor: {}, getOffhandItem: () => shield, getActiveItem: () => null,
        getTotalArmorPoints: () => 0, getTotalArmorToughness: () => 0, getArmorPoints: () => 0 },
    });
    p.takeDamage(5, new THREE.Vector3(0, 1, -3));
    return shield;
  };
  const plain = build(null);
  const warded = build([{ id: 'unbreaking', level: 3 }]);
  assert.equal(plain.maxDurability - plain.durability, 1,
    'a plain shield spends its point even on a passing roll, because unbreaking level 0 keeps nothing');
  // The stack is initialised to full BEFORE the keep loop, so spending nothing leaves it at max rather
  // than undefined. That is what the first version of this assertion got wrong.
  assert.equal(warded.maxDurability - warded.durability, 0,
    'an unbreaking III shield spends nothing when the keep roll passes');
});

test('a shield that reaches zero breaks and says so', () => {
  const p = Object.create(Player.prototype);
  const shield = { id: 'shield', durability: 1, maxDurability: 336 };
  const messages = [];
  Object.assign(p, {
    gamemode: 'survival', isDead: false, health: 20, maxHealth: 20, yaw: 0, isGatheringKi: false,
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), statusEffects: new Map(),
    isBlocking: true, random: () => 0.999, sounds: { playShieldBlock() {}, playHurt() {} },
    addExhaustion() {}, armourEnchantmentLists: () => [], hasStatusEffect: () => false,
    updateCameraAndModel() {}, ui: { addChatMessage: (m) => messages.push(m) },
    inventory: { armor: {}, getOffhandItem: () => shield, getActiveItem: () => null,
        getTotalArmorPoints: () => 0, getTotalArmorToughness: () => 0, getArmorPoints: () => 0 },
  });
  p.takeDamage(5, new THREE.Vector3(0, 1, -3));
  assert.equal(shield.durability, 0, 'the last point should be spent');
  assert.ok(messages.some(m => /shield broke/i.test(m)), 'and the player told, got ' + JSON.stringify(messages));
});

test('a shield held in the main hand blocks too', () => {
  const p = Object.create(Player.prototype);
  const shield = { id: 'shield' };
  Object.assign(p, {
    gamemode: 'survival', isDead: false, health: 20, maxHealth: 20, yaw: 0, isGatheringKi: false,
    position: new THREE.Vector3(), velocity: new THREE.Vector3(), statusEffects: new Map(),
    isBlocking: true, random: () => 0.999, sounds: { playShieldBlock() {}, playHurt() {} },
    addExhaustion() {}, armourEnchantmentLists: () => [], hasStatusEffect: () => false,
    updateCameraAndModel() {}, ui: { addChatMessage() {} },
    inventory: { armor: {}, getOffhandItem: () => null, getActiveItem: () => shield,
        getTotalArmorPoints: () => 0, getTotalArmorToughness: () => 0, getArmorPoints: () => 0 },
  });
  p.takeDamage(5, new THREE.Vector3(0, 1, -3));
  assert.equal(shield.durability, 335, 'a main-hand shield should wear the same way');
});

test('creative blocking does not consume the shield', () => {
  const { shield } = blocker({ gamemode: 'creative' });
  assert.equal(shield.durability, undefined, 'nothing is spent in creative');
});

test('damage that bypasses a shield does not wear it', () => {
  // Fall, starvation, void and wither are excluded from blocking entirely, so they must not reach the charge.
  for (const damageType of ['fall', 'starvation', 'void', 'wither']) {
    const p = Object.create(Player.prototype);
    const shield = { id: 'shield' };
    Object.assign(p, {
      gamemode: 'survival', isDead: false, health: 20, maxHealth: 20, yaw: 0, isGatheringKi: false,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), statusEffects: new Map(),
      isBlocking: true, random: () => 0.999, sounds: { playShieldBlock() {}, playHurt() {} },
      addExhaustion() {}, armourEnchantmentLists: () => [], hasStatusEffect: () => false,
      updateCameraAndModel() {}, ui: { addChatMessage() {} },
      inventory: { armor: {}, getOffhandItem: () => shield, getActiveItem: () => null,
        getTotalArmorPoints: () => 0, getTotalArmorToughness: () => 0, getArmorPoints: () => 0 },
    });
    p.takeDamage(5, new THREE.Vector3(0, 1, -3), damageType);
    assert.equal(shield.durability, undefined, damageType + ' should bypass the shield entirely');
  }
});
