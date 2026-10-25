import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RemotePlayerManager } from '../src/multiplayer/remotePlayerManager.js';
import { Player } from '../src/player.js';
import { ShareSession } from '../src/multiplayer/shareSession.js';
import { sanitizeAttack } from '../src/multiplayer/shareProtocol.js';
import { WorldSyncManager } from '../src/multiplayer/worldSyncManager.js';

// Setup minimal mock DOM
function setupMockDom() {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: () => ({
        // Every 2D drawing call is a no-op. The test files share one process, so this stub is what later files see
        // too, and they draw more than name tags.
        getContext: () => new Proxy({}, { get: (target, key) => (key in target ? target[key] : () => ({})), set: (target, key, v) => { target[key] = v; return true; } }),
        style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        replaceChildren() {},
        appendChild() {},
        remove() {},
      }),
      getElementById: () => null,
    };
  }
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      location: { href: 'http://localhost/' },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  } else {
    if (!globalThis.window.addEventListener) globalThis.window.addEventListener = () => {};
    if (!globalThis.window.removeEventListener) globalThis.window.removeEventListener = () => {};
  }
}

// Minimal mock game
function createMockGame() {
  setupMockDom();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const player = {
    position: new THREE.Vector3(0, 30, 0),
    yaw: 0,
    pitch: 0,
    perspective: 0,
    gamemode: 'survival',
    isDead: false,
    health: 20,
    maxHealth: 20,
  };
  return {
    scene,
    camera,
    player,
    sounds: { playPunch() {}, playHurt() {}, playShieldBlock() {}, playBreak() {} },
    ui: { updateStats() {}, addChatMessage() {} },
    entities: { spawnBlockParticles() {} }
  };
}

test("1. The red hurt overlay lasts Java's 10 ticks (0.5 s), then the exact original colours come back", () => {
  const game = createMockGame();
  const rpm = new RemotePlayerManager(game);
  const peer = rpm.addPeer('p1', 'Player1');
  const headMesh = peer.avatar.head.children.find((c) => c.material && c.position.z === 0);
  assert.ok(headMesh, 'head mesh exists');
  const original = headMesh.material.color.clone();

  rpm.triggerHurt('p1');
  assert.equal(peer.hurtTime, 0.5);
  const red = headMesh.material.color.clone();
  assert.ok(red.r >= red.g && red.r >= red.b, 'tinted red');
  assert.ok(red.g < original.g || original.g === 0, 'green pulled down');

  // The overlay holds (Java does not fade it), then clears.
  rpm.update(0.3);
  assert.deepEqual(headMesh.material.color.toArray(), red.toArray());
  rpm.update(0.21);
  assert.equal(peer.hurtTime, 0);
  assert.deepEqual(headMesh.material.color.toArray(), original.toArray());
  assert.equal(peer.hurtMaterials, null);
});

test('2. Multiple hits while hurt do NOT corrupt original material colors to red', () => {
  const game = createMockGame();
  const rpm = new RemotePlayerManager(game);
  const peer = rpm.addPeer('p1', 'Player1');
  const headMesh = peer.avatar.head.children.find((c) => c.material && c.position.z === 0);
  const originalSkinColor = headMesh.material.color.clone();

  rpm.triggerHurt('p1');
  rpm.update(0.05);
  rpm.triggerHurt('p1');
  assert.equal(peer.hurtTime, 0.5, 'a new hit restarts the overlay');
  rpm.update(0.51);
  assert.equal(peer.hurtTime, 0);
  assert.deepEqual(headMesh.material.color.toArray(), originalSkinColor.toArray());
});

test("3. A hit does not resize the other player's model (Java has no hurt bounce)", () => {
  const game = createMockGame();
  const rpm = new RemotePlayerManager(game);
  const peer = rpm.addPeer('p1', 'Player1');
  rpm.triggerHurt('p1');
  for (const dt of [0.1, 0.1, 0.1, 0.25]) {
    rpm.update(dt);
    assert.deepEqual(peer.avatar.mesh.scale.toArray(), [1, 1, 1]);
  }
});

test("4. A hit does not shift the other player's model: the knockback arrives as their own movement", () => {
  const game = createMockGame();
  const rpm = new RemotePlayerManager(game);
  const peer = rpm.addPeer('p1', 'Player1');
  peer.currentPos.set(0, 30, 0);
  peer.targetPos.set(0, 30, 0);
  rpm.triggerHurt('p1', new THREE.Vector3(0, 30, -2));
  rpm.update(0.125);
  assert.deepEqual(peer.avatar.mesh.position.toArray(), [0, 30, 0]);
  // Their next position update moves them, as the real knockback does.
  rpm.updatePeerState('p1', { x: 0, y: 30.4, z: 0.9, yaw: 0, pitch: 0 });
  rpm.update(0.2);
  assert.ok(peer.avatar.mesh.position.z > 0.5);
});

function createTestPlayer() {
  setupMockDom();
  const camera = new THREE.PerspectiveCamera();
  const domElement = { addEventListener() {}, removeEventListener() {}, requestPointerLock() {} };
  const world = { getVoxel: () => 0, setVoxel: () => {} };
  const sounds = { playPunch() {}, playHurt() {}, playShieldBlock() {}, playBreak() {} };
  const player = new Player(camera, domElement, world, sounds);
  return player;
}

test('5. Shield deflects 100% of damage within frontal 180-degree cone', () => {
  const player = createTestPlayer();
  player.inventory = {
    getActiveItem: () => null,
    getOffhandItem: () => ({ id: 'shield' }),
    getTotalArmorPoints: () => 0,
    getTotalArmorToughness: () => 0,
    armor: {},
  };
  player.health = 20;
  player.isBlocking = true;
  player.yaw = 0; // facing -Z
  player.position.set(0, 0, 0);

  // Attacker in front at (0, 0, -3)
  player.takeDamage(8, { x: 0, y: 0, z: -3 }, 'player', null);
  assert.equal(player.health, 20, 'shield fully blocks frontal attack');

  // Clear invulnerability timer to test subsequent attack
  player.invulnerableTimer = 0;

  // Attacker behind at (0, 0, 3) (outside 180 frontal cone)
  player.takeDamage(8, { x: 0, y: 0, z: 3 }, 'player', null);
  assert.ok(player.health < 20, 'shield does not block attack from behind');
});

test('6. Axe attack disables opponent shield for 5 seconds (Axe PvP parity)', () => {
  const player = createTestPlayer();
  player.inventory = {
    getActiveItem: () => null,
    getOffhandItem: () => ({ id: 'shield' }),
    getTotalArmorPoints: () => 0,
    getTotalArmorToughness: () => 0,
    armor: {},
  };
  player.health = 20;
  player.isBlocking = true;
  player.yaw = 0;
  player.position.set(0, 0, 0);

  // Attacker strikes with diamond axe
  player.takeDamage(9, { x: 0, y: 0, z: -3 }, 'player', null, { weapon: 'diamond_axe' });
  assert.equal(player.health, 20, 'blocked the initial axe hit');
  assert.equal(player.shieldDisabledTimer, 5.0, 'shield disabled for 5 seconds');
  assert.equal(player.isBlocking, false, 'blocking cancelled');

  // Player tries to block during the 5s cooldown: update() rejects it
  player.isBlocking = true;
  for (let i = 0; i < 10; i++) player.update(0.1);
  assert.equal(player.isBlocking, false, 'cannot block while shield is disabled');
  assert.ok(Math.abs(player.shieldDisabledTimer - 4.0) < 1e-4, 'timer decrements by 1 second');

  // After 4 more seconds (40 steps of 0.1), shield cooldown expires
  for (let i = 0; i < 40; i++) player.update(0.1);
  assert.equal(player.shieldDisabledTimer, 0, 'shield cooldown expired');
});

test("7. Knockback follows Java: 0.4 blocks/tick away from the attacker; a sprint hit adds a level along the attacker's facing", () => {
  const player = createTestPlayer();
  player.health = 20;
  player.position.set(0, 0, 0);
  player.velocity.set(0, 0, 0);
  player.onGround = true;

  // Attacker in front (-Z), facing the player (+Z is yaw = PI in this game).
  player.takeDamage(4, { x: 0, y: 0, z: -3 }, 'player', null, { isSprint: false });
  assert.ok(Math.abs(player.velocity.z - 8) < 1e-9, `0.4 b/tick = 8 b/s away, got ${player.velocity.z}`);
  assert.ok(Math.abs(player.velocity.y - 8) < 1e-9, 'lifted to 0.4 b/tick off the ground');

  player.invulnerableTimer = 0;
  player.velocity.set(0, 0, 0);
  player.onGround = true;
  player.takeDamage(4, { x: 0, y: 0, z: -3 }, 'player', null, { isSprint: true, fromYaw: Math.PI });
  // Base push 8, then halved and a further 0.5 b/tick = 10 b/s: 4 + 10 = 14.
  assert.ok(Math.abs(player.velocity.z - 14) < 1e-9, `sprint hit: ${player.velocity.z}`);
  assert.ok(Math.abs(player.velocity.y - 8) < 1e-9, 'vertical still capped at 0.4 b/tick');
});

test('8. sanitizeAttack preserves isCritical, isSprint, and weapon metadata', () => {
  const raw = {
    target: 'p2',
    damage: 9,
    isCritical: true,
    isSprint: true,
    weapon: 'netherite_sword',
  };
  const clean = sanitizeAttack(raw);
  assert.equal(clean.target, 'p2');
  assert.equal(clean.damage, 9);
  assert.equal(clean.isCritical, true);
  assert.equal(clean.isSprint, true);
  assert.equal(clean.weapon, 'netherite_sword');
});

test("9. A hit does not tilt the other player's model", () => {
  const game = createMockGame();
  const rpm = new RemotePlayerManager(game);
  const peer = rpm.addPeer('p1', 'Player1');
  rpm.triggerHurt('p1');
  rpm.update(0.125);
  assert.equal(peer.avatar.mesh.rotation.z, 0);
});

test('10. Invulnerability frames prevent damage spam within 0.5s window', () => {
  const player = createTestPlayer();
  player.health = 20;
  player.hunger = 10;
  player._hungerState.hunger = 10;
  player._hungerState.saturation = 0;

  // First hit deals 5 damage
  player.takeDamage(5, { x: 0, y: 0, z: -2 }, 'player');
  assert.equal(player.health, 15);
  assert.ok(player.invulnerableTimer > 0, 'invulnerable timer is set');

  // Immediate second hit during invulnerability window is ignored
  player.takeDamage(5, { x: 0, y: 0, z: -2 }, 'player');
  assert.equal(player.health, 15, 'spam hit ignored during invulnerability');

  // Advance time past invulnerable window (0.5s)
  for (let i = 0; i < 6; i++) player.update(0.1);
  assert.equal(player.invulnerableTimer, 0, 'invulnerable window cleared');

  // Third hit now successfully connects
  player.takeDamage(5, { x: 0, y: 0, z: -2 }, 'player');
  assert.equal(player.health, 10, 'hit lands after invulnerability window expires');
});

test('11. WorldSyncManager attackRemotePlayer forwards attack metadata over session', () => {
  setupMockDom();
  const game = createMockGame();
  let deliveredAttack = null;
  const mockSession = {
    connected: true,
    peers: new Map([['p1', { name: 'Player1' }]]),
    attackPlayer: (targetId, damage, options) => {
      deliveredAttack = { targetId, damage, ...options };
      return null; // success
    },
    broadcastAction: () => {},
    on: () => {},
  };
  const worldSync = new WorldSyncManager(game, { session: mockSession });
  const result = worldSync.attackRemotePlayer('p1', 12, {
    isCritical: true,
    isSprint: true,
    weapon: 'diamond_sword',
  });

  assert.equal(result, true);
  assert.deepEqual(deliveredAttack, {
    targetId: 'p1',
    damage: 12,
    isCritical: true,
    isSprint: true,
    weapon: 'diamond_sword',
  });
});

test('12. WorldSyncManager takeHit applies knockback from attacker and weapon metadata to player', () => {
  setupMockDom();
  const game = createMockGame();
  const player = createTestPlayer();
  game.player = player;
  player.position.set(0, 0, 0);
  player.velocity.set(0, 0, 0);

  const mockSession = {
    connected: true,
    playerName: 'Defender',
    on: () => {},
  };
  const worldSync = new WorldSyncManager(game, { session: mockSession });

  // Attacker strikes from (0, 0, -3) with sprint knockback
  worldSync.takeHit({
    attackerName: 'Attacker',
    damage: 6,
    from: { x: 0, y: 0, z: -3 },
    weapon: 'iron_sword',
    isSprint: true,
  });

  assert.equal(player.health, 14);
  assert.ok(player.velocity.z > 0, 'pushed away from attacker along +Z');
});

test('13. Axe shield disable refreshes to 5.0s on repeated axe hits', () => {
  const player = createTestPlayer();
  player.inventory = {
    getActiveItem: () => null,
    getOffhandItem: () => ({ id: 'shield' }),
    getTotalArmorPoints: () => 0,
    getTotalArmorToughness: () => 0,
    armor: {},
  };
  player.health = 20;
  player.isBlocking = true;
  player.yaw = 0; // facing -Z
  player.position.set(0, 0, 0);

  // First axe hit disables shield for 5.0s
  player.takeDamage(7, { x: 0, y: 0, z: -3 }, 'player', null, { weapon: 'iron_axe' });
  assert.equal(player.shieldDisabledTimer, 5.0);

  // 2 seconds pass
  for (let i = 0; i < 20; i++) player.update(0.1);
  assert.ok(Math.abs(player.shieldDisabledTimer - 3.0) < 1e-4);

  // Clear invulnerable timer to simulate subsequent hit
  player.invulnerableTimer = 0;
  // Second axe hit connects while shield disabled
  player.takeDamage(7, { x: 0, y: 0, z: -3 }, 'player', null, { weapon: 'iron_axe' });
  assert.ok(player.health < 20, 'damage penetrates disabled shield');
});

test('14. Attacks from the flank or rear bypass shield block completely', () => {
  const player = createTestPlayer();
  player.inventory = {
    getActiveItem: () => null,
    getOffhandItem: () => ({ id: 'shield' }),
    getTotalArmorPoints: () => 0,
    getTotalArmorToughness: () => 0,
    armor: {},
  };
  player.health = 20;
  player.isBlocking = true;
  player.yaw = 0; // facing -Z
  player.position.set(0, 0, 0);

  // Attacker attacks from behind (+Z): outside 180 frontal cone
  player.takeDamage(5, { x: 0, y: 0, z: 4 }, 'player', null);
  assert.equal(player.health, 15, 'shield does not block attack from behind');

  // Reset invulnerability
  player.invulnerableTimer = 0;

  // Attacker attacks from right side (+X): dot product is 0, on boundary
  player.takeDamage(5, { x: 4, y: 0, z: 0 }, 'player', null);
  assert.equal(player.health, 15, 'boundary dot == 0 is within 180-degree frontal semicircle');
});
