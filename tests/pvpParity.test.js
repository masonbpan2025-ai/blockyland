// Player-versus-player melee against Java Edition (minecraft.wiki Tutorial:PvP (Java Edition), Damage, Knockback,
// Sweep attack, Particles). Each test names the rule it checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PVP_REACH, reachFor, classifyAttack, applyKnockback, hitKnockback, hurtWindow, hitParticles, extraKnockbackLevel,
  sweepVictims, disablesShield, HURT_INVULNERABLE_SECONDS, HURT_OVERLAY_SECONDS, SPRINT_HIT_SLOWDOWN,
} from '../src/pvpCombat.js';
import { CombatParticles, PARTICLE_STYLE } from '../src/combatParticles.js';
import { Player } from '../src/player.js';
import { RemotePlayerManager } from '../src/multiplayer/remotePlayerManager.js';
import { sanitizeAttack } from '../src/multiplayer/shareProtocol.js';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/**
 * The player and the avatars look up page elements and draw name tags; none of that matters here. Installed only for
 * the test that asks, and removed after it: the test files share one process, and others bring their own.
 */
function withDom(t) {
  const added = [];
  const stub = (name, value) => { if (globalThis[name] === undefined) { globalThis[name] = value; added.push(name); } };
  const context = new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => {}), set: (target, key, v) => { target[key] = v; return true; } });
  stub('document', {
    createElement: () => ({ getContext: () => context, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } }),
    getElementById: () => null,
  });
  stub('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  stub('window', { addEventListener() {}, removeEventListener() {}, location: { href: 'http://localhost/' } });
  t.after(() => { for (const name of added) delete globalThis[name]; });
}

function testPlayer(t) {
  withDom(t);
  const camera = new THREE.PerspectiveCamera();
  const dom = { addEventListener() {}, removeEventListener() {}, requestPointerLock() {} };
  const player = new Player(camera, dom, { getVoxel: () => 0, setVoxel() {} }, { playHurt() {}, playShieldBlock() {}, playBreak() {} });
  player.health = 20;
  player.position.set(0, 0, 0);
  player.velocity.set(0, 0, 0);
  player.onGround = true;
  return player;
}

// --- reach -----------------------------------------------------------------------------------------------------

test('reach: "the 3 block attack reach" in Survival, 5 in Creative, none for a spectator', () => {
  assert.equal(PVP_REACH.survival, 3);
  assert.equal(reachFor('survival'), 3);
  assert.equal(reachFor('adventure'), 3);
  assert.equal(reachFor('creative'), 5);
  assert.equal(reachFor('spectator'), 0);
  assert.equal(reachFor(undefined), 3);
});

test('reach: the crosshair must be on the exact 0.6 x 1.8 box -- no margin around it', (t) => {
  withDom(t);
  const rpm = new RemotePlayerManager({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), player: { position: new THREE.Vector3() } });
  const peer = { peerId: 'p1', name: 'Ann', currentPos: new THREE.Vector3(0, 0, -2.5), isSneaking: false };
  rpm.remotePlayers.set('p1', peer);
  const eye = new THREE.Vector3(0, 1.62, 0);
  const ahead = new THREE.Vector3(0, 0, -1);
  assert.equal(rpm.pickPlayer(eye, ahead, 3)?.peerId, 'p1', 'front face 2.2 blocks away');
  assert.ok(near(rpm.pickPlayer(eye, ahead, 3).distance, 2.2, 1e-6));
  // Just past the side of the box.
  const offset = new THREE.Vector3(0.32, 1.62, 0);
  assert.equal(rpm.pickPlayer(offset, ahead, 3), null);
  // Out of reach: the front face is 3.2 blocks away.
  peer.currentPos.set(0, 0, -3.5);
  assert.equal(rpm.pickPlayer(eye, ahead, 3), null);
  assert.equal(rpm.pickPlayer(eye, ahead, 5)?.peerId, 'p1', 'a Creative player reaches it');
  // A sneaking player is 1.5 tall.
  peer.currentPos.set(0, 0, -2);
  peer.isSneaking = true;
  assert.equal(rpm.pickPlayer(new THREE.Vector3(0, 1.6, 0), ahead, 3), null);
  assert.equal(rpm.pickPlayer(new THREE.Vector3(0, 1.4, 0), ahead, 3)?.peerId, 'p1');
});

// --- the kinds of hit ------------------------------------------------------------------------------------------

test('a strong attack needs 84.8% of full damage: a cooldown charge of 0.9', () => {
  assert.equal(classifyAttack({ charge: 0.9 }).strong, true);
  assert.equal(classifyAttack({ charge: 0.89 }).strong, false);
  assert.equal(classifyAttack({ charge: 0.5, onGround: false, fallDistance: 1 }).critical, false, 'a weak swing cannot crit');
  assert.equal(classifyAttack({ charge: 0.5, sprinting: true }).sprintKnockback, false, 'or sprint-knockback');
});

test('critical hits "are dealt when the attacker is falling", never while sprinting', () => {
  const falling = { charge: 1, onGround: false, fallDistance: 0.3 };
  assert.equal(classifyAttack(falling).critical, true);
  assert.equal(classifyAttack({ ...falling, fallDistance: 0 }).critical, false, 'rising, not falling');
  assert.equal(classifyAttack({ ...falling, onGround: true }).critical, false);
  assert.equal(classifyAttack({ ...falling, sprinting: true }).critical, false, '"impossible to critical hit while in a sprint"');
  assert.equal(classifyAttack({ ...falling, inWater: true }).critical, false);
  assert.equal(classifyAttack({ ...falling, climbing: true }).critical, false);
});

test('sprint-knockback: a strong attack while sprinting; it is not also a crit or a sweep', () => {
  const k = classifyAttack({ charge: 1, sprinting: true, itemId: 'diamond_sword' });
  assert.equal(k.sprintKnockback, true);
  assert.equal(k.critical, false);
  assert.equal(k.sweep, false);
  assert.equal(k.sound, 'knockback');
  assert.equal(extraKnockbackLevel(0, true), 1, 'one extra level of knockback');
  assert.equal(extraKnockbackLevel(2, true), 3, 'on top of the Knockback enchantment');
  assert.equal(extraKnockbackLevel(1, false), 1);
});

test('sweep: a strong sword hit on the ground, not critical, not sprinting, while barely moving', () => {
  const base = { charge: 1, onGround: true, itemId: 'iron_sword', horizontalSpeed: 0 };
  assert.equal(classifyAttack(base).sweep, true);
  assert.equal(classifyAttack(base).sound, 'sweep');
  assert.equal(classifyAttack({ ...base, itemId: 'iron_axe' }).sweep, false, 'only a sword sweeps');
  assert.equal(classifyAttack({ ...base, itemId: null }).sweep, false);
  assert.equal(classifyAttack({ ...base, horizontalSpeed: 5 }).sweep, false, 'not while running');
  assert.equal(classifyAttack({ ...base, onGround: false, fallDistance: 0.2 }).sweep, false, 'a crit instead');
});

test('the attack sound tells the kinds apart: weak, strong, crit, knockback, sweep', () => {
  assert.equal(classifyAttack({ charge: 0.4 }).sound, 'weak');
  assert.equal(classifyAttack({ charge: 1, itemId: 'iron_axe' }).sound, 'strong');
  assert.equal(classifyAttack({ charge: 1, onGround: false, fallDistance: 1 }).sound, 'crit');
});

// --- knockback -------------------------------------------------------------------------------------------------

test('knockback: 0.4 blocks/tick away from the attacker, old speed halved, a grounded target lifted to 0.4', () => {
  const v = applyKnockback({ x: 2, y: 0, z: 0 }, { strength: 0.4, dx: 0, dz: 1, onGround: true });
  assert.ok(near(v.x, 1), 'old horizontal speed halved');
  assert.ok(near(v.z, 8), '0.4 b/tick = 8 b/s');
  assert.ok(near(v.y, 8));
  const air = applyKnockback({ x: 0, y: -3, z: 0 }, { strength: 0.4, dx: 1, dz: 0, onGround: false });
  assert.equal(air.y, -3, 'no lift in the air');
  const resisted = applyKnockback({ x: 0, y: 0, z: 0 }, { strength: 0.4, dx: 1, dz: 0, onGround: true, resistance: 1 });
  assert.deepEqual(resisted, { x: 0, y: 0, z: 0 }, 'full knockback resistance');
});

test('knockback: a sprint hit pushes along the attacker\'s facing as well as away from it', () => {
  // The attacker stands west of the target, facing north-east-ish; the extra push follows the facing.
  const yaw = -Math.PI / 4; // forward (-sin, -cos) = (0.707, -0.707)
  const v = hitKnockback({ x: 0, y: 0, z: 0 }, { position: { x: 0, z: 0 }, from: { x: -2, z: 0 }, fromYaw: yaw, onGround: true, extraLevel: 1 });
  assert.ok(v.x > 0, 'still away from the attacker');
  assert.ok(v.z < 0, 'and along the facing');
  assert.ok(near(v.x, 4 + 10 * Math.SQRT1_2, 1e-9));
});

test('a sprint hit slows the attacker to 60% and ends the sprint until forward is pressed again (W-tap)', (t) => {
  assert.equal(SPRINT_HIT_SLOWDOWN, 0.6);
  const p = testPlayer(t);
  p.gamemode = 'survival';
  p.hunger = 20;
  p.keys = { KeyW: true, ControlLeft: true };
  p.update(0.05);
  assert.equal(p.isSprinting, true);
  p.sprintResetPending = true; // what main.js sets after a sprint-knockback hit
  p.update(0.05);
  assert.equal(p.isSprinting, false, 'holding the keys does not restart it');
  p.keys.KeyW = false;
  p.update(0.05);
  p.keys.KeyW = true;
  p.update(0.05);
  assert.equal(p.isSprinting, true, 'released and pressed again: sprinting');
});

// --- the hurt window ------------------------------------------------------------------------------------------

test('hurt window: 10 ticks in which a weaker or equal hit does nothing, and a harder one deals only the difference', () => {
  assert.equal(HURT_INVULNERABLE_SECONDS, 0.5);
  assert.deepEqual(hurtWindow({ timer: 0 }, 5), { amount: 5, knockback: true, fresh: true });
  assert.deepEqual(hurtWindow({ timer: 0.3, lastAmount: 5 }, 5), { amount: 0, knockback: false, fresh: false });
  assert.deepEqual(hurtWindow({ timer: 0.3, lastAmount: 5 }, 8), { amount: 3, knockback: false, fresh: false });
});

test('a player hit twice in the window takes the harder hit, without a second knockback', (t) => {
  const p = testPlayer(t);
  p.takeDamage(4, { x: 0, y: 0, z: -2 }, 'player');
  assert.equal(p.health, 16);
  const velocity = p.velocity.clone();
  p.takeDamage(4, { x: 0, y: 0, z: -2 }, 'player');
  assert.equal(p.health, 16, 'equal hit ignored');
  p.takeDamage(7, { x: 0, y: 0, z: -2 }, 'player');
  assert.equal(p.health, 13, 'only the 3 it adds');
  assert.deepEqual(p.velocity.toArray(), velocity.toArray(), 'no second knockback');
  // The window does not restart for the difference: it closes on time.
  for (let i = 0; i < 6; i++) p.update(0.1);
  const before = p.health; // natural regeneration may have healed a little meanwhile
  p.takeDamage(4, { x: 0, y: 0, z: -2 }, 'player');
  assert.ok(near(p.health, before - 4), 'a full hit again once the window closed');
});

test('a mob\'s hit keeps the game\'s own window and knockback', (t) => {
  const p = testPlayer(t);
  p.takeDamage(3, { x: 0, y: 0, z: -2 }, 'mob');
  const after = p.health;
  p.takeDamage(9, { x: 0, y: 0, z: -2 }, 'mob');
  assert.equal(p.health, after, 'no difference rule outside PvP');
});

// --- shields and axes ----------------------------------------------------------------------------------------

test('an axe disables a shield; a sword does not', () => {
  assert.equal(disablesShield('iron_axe'), true);
  assert.equal(disablesShield('netherite_axe'), true);
  assert.equal(disablesShield('iron_pickaxe'), false);
  assert.equal(disablesShield('diamond_sword'), false);
});

// --- particles ----------------------------------------------------------------------------------------------

test('a hit shows crit stars, enchanted-hit stars and damage hearts -- never block fragments', () => {
  assert.deepEqual(hitParticles({ damage: 1 }), [], 'a light hit shows nothing');
  assert.deepEqual(hitParticles({ damage: 2 }), [], 'hearts only above 2 damage');
  assert.deepEqual(hitParticles({ damage: 7 }), [{ kind: 'damage_indicator', count: 3 }], '(int)(7 x 0.5)');
  assert.deepEqual(hitParticles({ critical: true, damage: 10.5 }), [{ kind: 'crit', count: 48 }, { kind: 'damage_indicator', count: 5 }]);
  assert.deepEqual(hitParticles({ enchanted: true, damage: 0 }), [{ kind: 'enchanted_hit', count: 48 }]);
  assert.deepEqual(hitParticles({ sweep: true, damage: 0 }), [{ kind: 'sweep_attack', count: 1 }]);
  for (const kind of ['crit', 'enchanted_hit', 'damage_indicator', 'sweep_attack']) assert.ok(PARTICLE_STYLE[kind], kind);
});

test('combat particles are camera-facing sprites around the target that shrink away and leave the scene', () => {
  const scene = new THREE.Scene();
  let r = 0;
  const particles = new CombatParticles(scene, { random: () => ((r = (r * 9301 + 49297) % 233280) / 233280) });
  particles.spawnHit({ x: 10, y: 64, z: -3 }, hitParticles({ critical: true, damage: 8 }));
  assert.deepEqual(particles.counts(), { crit: 48, damage_indicator: 4 });
  for (const p of particles.live) {
    assert.ok(p.sprite instanceof THREE.Sprite, 'a sprite, not a cube');
    assert.ok(Math.abs(p.sprite.position.x - 10) <= 0.31 && Math.abs(p.sprite.position.z + 3) <= 0.31, 'within the target box');
    assert.ok(p.sprite.position.y >= 64 && p.sprite.position.y <= 65.8);
  }
  const hearts = particles.live.filter((p) => p.kind === 'damage_indicator');
  assert.ok(hearts.every((h) => near(h.sprite.position.y, 64.9)), 'hearts start at the middle of the target');
  const start = particles.live[0].sprite.scale.x;
  particles.update(0.2);
  assert.ok(particles.live[0].sprite.scale.x < start, 'shrinking');
  particles.update(1.2);
  assert.equal(particles.live.length, 0);
  assert.equal(scene.children.length, 0);
});

test('the sweep arc appears in front of the attacker', () => {
  const particles = new CombatParticles(new THREE.Scene());
  particles.spawnHit({ x: 0, y: 0, z: -2 }, hitParticles({ sweep: true }), { attacker: { x: 0, y: 0, z: 0 }, facing: { x: 0, z: -1 } });
  assert.equal(particles.live.length, 1);
  assert.deepEqual(particles.live[0].sprite.position.toArray(), [0, 0.9, -1]);
});

test('the hurt overlay lasts the hurt time, 10 ticks', () => {
  assert.equal(HURT_OVERLAY_SECONDS, 0.5);
});

// --- sweep victims -------------------------------------------------------------------------------------------

test('a sweep catches other players beside the target and in reach, never the attacker or the target twice', () => {
  const attacker = { id: 'me', x: 0, y: 0, z: 0 };
  const target = { id: 't', x: 0, y: 0, z: -2 };
  const players = [target, { id: 'beside', x: 1, y: 0, z: -2 }, { id: 'far', x: 4, y: 0, z: -2 }, { id: 'below', x: 0.5, y: -5, z: -2 }, attacker];
  assert.deepEqual(sweepVictims({ attacker, target, players }).map((p) => p.id), ['beside']);
});

// --- what travels over the network -----------------------------------------------------------------------------

test('a hit message keeps the knockback level and Fire Aspect, bounded', () => {
  const a = sanitizeAttack({ target: 'p1', damage: 6, isSprint: true, knockbackLevel: 9, fireAspect: 7, weapon: 'iron_sword' });
  assert.deepEqual(a, { target: 'p1', damage: 6, isSprint: true, weapon: 'iron_sword', knockbackLevel: 3, fireAspect: 2 });
  const b = sanitizeAttack({ target: 'p1', damage: 6, knockbackLevel: 'lots', fireAspect: -1 });
  assert.deepEqual(b, { target: 'p1', damage: 6 });
});

// --- the bot that fights other players (playerBot.js "fight player") -------------------------------------------

test('the bot understands "fight player", with a name, a number of hits, and crits or sprint hits', async () => {
  const { parsePlayerCommand, validatePlayerCommand } = await import('../src/playerBot.js');
  assert.deepEqual(parsePlayerCommand('fight player'), { type: 'pvp', player: null, hits: 5, style: 'plain' });
  assert.deepEqual(parsePlayerCommand('fight player Ann with crits'), { type: 'pvp', player: 'ann', hits: 5, style: 'crit' });
  assert.deepEqual(parsePlayerCommand('attack player 3 hits with sprint hits'), { type: 'pvp', player: null, hits: 3, style: 'sprint' });
  assert.deepEqual(parsePlayerCommand('hit player with w-tap'), { type: 'pvp', player: null, hits: 5, style: 'sprint' });
  assert.equal(parsePlayerCommand('attack zombie').type, 'attack', 'mobs are still mobs');
  assert.throws(() => validatePlayerCommand({ type: 'pvp', hits: 0, style: 'plain' }));
  assert.throws(() => validatePlayerCommand({ type: 'pvp', hits: 5, style: 'spin' }));
});
