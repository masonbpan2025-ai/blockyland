// Minecraft Java's rules in the shared guest code (packages/blockyland-mcp/guestPeer.js), used by the MCP autopilot and
// the house bots alike: weapon recharge and charge, hunger, saturation, natural regeneration, eating, the bots' eating
// rule, speeds -- the same at every difficulty. Expected values are the Minecraft Wiki's (Damage, Hunger, Food,
// Golden Apple, Regeneration), worked by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GuestPeerSession, DIFFICULTY_PROFILES, attackCooldownMs, attackStrength, JAVA_FOODS, EAT_MS, BLOCKS,
} from '../packages/blockyland-mcp/guestPeer.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function guest() {
  const s = new GuestPeerSession({ code: '1234', name: 'G', url: 'ws://localhost:1/ws/share' });
  s.sendPacket = () => true;
  s.broadcastState = () => true;
  s.gamemode = 'survival';
  return s;
}

test('attack recharge by weapon (1 / attack speed): swords 0.625 s, axes 1-1.25 s, a fist 0.25 s', () => {
  for (const s of ['wooden_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'netherite_sword']) assert.equal(attackCooldownMs(s), 625);
  assert.equal(attackCooldownMs('wooden_axe'), 1250); // attack speed 0.8
  assert.equal(attackCooldownMs('stone_axe'), 1250);  // 0.8
  assert.equal(attackCooldownMs('iron_axe'), 1111);   // 0.9
  assert.equal(attackCooldownMs('diamond_axe'), 1000); // 1.0
  assert.equal(attackCooldownMs(null), 250);          // a fist: 4.0
});

test('a swing\'s strength: 0.2 + 0.8 x charge^2 -- 20% at once, 40% at half charge, full when recharged', () => {
  close(attackStrength(0, 625), 0.2);
  close(attackStrength(312.5, 625), 0.2 + 0.8 * 0.25);
  close(attackStrength(625, 625), 1);
  close(attackStrength(5000, 625), 1);
});

test('speeds are Java\'s at every difficulty; sprinting is easy\'s only lack', () => {
  for (const p of Object.values(DIFFICULTY_PROFILES)) { assert.equal(p.walkSpeed, 4.317); assert.equal(p.sprintSpeed, 5.612); }
  assert.equal(DIFFICULTY_PROFILES.easy.sprintAllowed, false);
  assert.equal(DIFFICULTY_PROFILES.normal.sprintAllowed, true);
  assert.equal(DIFFICULTY_PROFILES.hard.sprintAllowed, true);
});

test('natural regeneration: full hunger with saturation, 1 HP every 10 ticks; hunger 18+, 1 every 80; below 18, none', () => {
  const s = guest();
  s.health = 10; s.food = 20; s.saturation = 5;
  s.vitalsTick(0.45); assert.equal(s.health, 10, '9 ticks: not yet');
  s.vitalsTick(0.05); assert.equal(s.health, 11, '10 ticks: 1 HP');
  assert.equal(s.saturation, 4, 'healing cost 6 exhaustion: 1 saturation, 2 exhaustion left');
  close(s.exhaustion, 2);
  s.health = 10; s.food = 18; s.saturation = 0; s.regenTicks = 0;
  for (let i = 0; i < 79; i++) s.vitalsTick(0.05);
  assert.equal(s.health, 10, '79 ticks at hunger 18: not yet');
  s.vitalsTick(0.05); assert.equal(s.health, 11, '80 ticks: 1 HP');
  s.health = 10; s.food = 17; s.regenTicks = 0;
  for (let i = 0; i < 200; i++) s.vitalsTick(0.05);
  assert.equal(s.health, 10, 'hunger 17: no regeneration');
});

test('eating takes 1.6 s and restores Java\'s hunger and saturation; a full player cannot eat bread', async () => {
  const s = guest();
  s.inventory.addItem('bread', false, 2);
  s.food = 20;
  assert.equal(s.startEating('bread'), false, 'not hungry');
  s.food = 12; s.saturation = 0;
  assert.equal(s.startEating('bread'), true);
  assert.equal(s.isEating(), true);
  assert.equal(s.food, 12, 'nothing until it is eaten');
  await pause(EAT_MS + 60);
  assert.equal(s.isEating(), false);
  assert.equal(s.food, 12 + JAVA_FOODS.bread[0]);
  assert.equal(s.saturation, JAVA_FOODS.bread[1]);
});

test('a golden apple: Regeneration II (1 HP every 25 ticks: 4 HP in its 5 s) and 4 absorption, not an instant heal', async () => {
  const s = guest();
  s.inventory.addItem('golden_apple', false, 1);
  s.health = 6; s.food = 20; s.saturation = 0;
  assert.equal(s.startEating('golden_apple'), true, 'edible even when full');
  await pause(EAT_MS + 60);
  assert.equal(s.health, 6, 'no instant heal');
  assert.equal(s.absorption, 4);
  s.food = 17; // no natural regeneration: the effect alone
  for (let i = 0; i < 100; i++) s.vitalsTick(0.05);
  assert.equal(s.health, 10, '100 ticks of Regeneration II: 4 HP');
});

test('the bots\' eating rule is the same at every difficulty: a golden apple at 8 health, food when hungry and alone', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const s = guest();
    s.setDifficulty(difficulty);
    s.inventory.addItem('golden_apple', false, 1);
    s.inventory.addItem('cooked_beef', false, 1);
    s.health = 9; s.food = 20;
    assert.equal(s.healIfNeeded(), false, `${difficulty}: 9 health and full: nothing`);
    s.health = 8;
    assert.equal(s.healIfNeeded(), true, `${difficulty}: 8 health: the golden apple`);
    assert.equal(s.inventory.countItem('golden_apple'), 0);
    const t = guest();
    t.setDifficulty(difficulty);
    t.inventory.addItem('cooked_beef', false, 1);
    t.health = 20; t.food = 15;
    t.peers.set('p2', { id: 'p2', x: 3, y: 31, z: 0 });
    t.position = { x: 0, y: 31, z: 0 };
    assert.equal(t.healIfNeeded(), false, `${difficulty}: hungry but a foe 3 blocks off: no ordinary food`);
    t.peers.get('p2').x = 20;
    assert.equal(t.healIfNeeded(), true, `${difficulty}: hungry and alone: eats`);
  }
});

test('fall damage, as Java\'s: a fall of 9 blocks hurts 6 (each block past 3); a fall of 3 hurts nothing', () => {
  for (const [from, expect] of [[40, 14], [34, 20]]) {
    const s = guest();
    s.connected = true;
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) s.setVoxel(x, 30, z, BLOCKS.STONE); // ground: standing at 31
    s.position = { x: 0.5, y: from, z: 0.5 };
    s.onGround = false;
    for (let i = 0; i < 200 && !(s.onGround && s.position.y <= 31.001); i++) s.tick(0.05);
    assert.ok(Math.abs(s.position.y - 31) < 0.01, `landed at ${s.position.y}`);
    assert.equal(s.health, expect, `a fall from ${from}`);
  }
});
