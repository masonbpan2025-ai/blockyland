import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DungeonModeManager } from '../src/dungeonMode.js';
import { DragonballSkillsManager } from '../src/dragonballSkills.js';
import { MobManager } from '../src/mobs.js';
import { Player } from '../src/player.js';
import { BLOCKS } from '../src/blocks.js';

function createMockGame() {
  const world = {
    getVoxel: () => BLOCKS.AIR,
    chunks: new Map()
  };
  const scene = new THREE.Scene();
  const sounds = new Proxy({}, {
    get: () => () => {}
  });

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  camera.position.set(0, 24, 0);

  const player = new Player(camera, null, world, sounds);
  player.gamemode = 'survival';
  player.position.set(0, 24, 0);
  player.health = 20;

  const mobs = Object.assign(Object.create(MobManager.prototype), {
    world,
    scene,
    sounds,
    mobs: [],
    textures: {
      site_manager: new THREE.Texture(),
      zombie: new THREE.Texture()
    },
    damageMob(mob, amount, origin) {
      mob.health -= amount;
      mob.velocity.add(new THREE.Vector3(0, 2, 0));
    }
  });

  const chatMessages = [];
  const ui = {
    addChatMessage: (msg) => chatMessages.push(msg)
  };

  const tournament = {
    state: 'WAITING_FOR_TALK'
  };

  const dragonballSkills = {
    spawnEnergySparks: () => {}
  };

  const game = {
    world,
    scene,
    sounds,
    camera,
    player,
    mobs,
    ui,
    tournament,
    dragonballSkills
  };

  return { game, player, camera, mobs, sounds, chatMessages, tournament };
}

test('Dungeon Mode activates for combat training sites but NEVER for Parkour', () => {
  const { game, player, mobs } = createMockGame();
  const dungeon = new DungeonModeManager(game);

  // Add a hostile mob into each site
  const mobPunching = {
    type: 'zombie',
    health: 30,
    mesh: new THREE.Mesh(),
    position: new THREE.Vector3(45, 21, 0)
  };
  mobPunching.mesh.position.copy(mobPunching.position);
  mobs.mobs.push(mobPunching);

  // 1. Enter Punching Site (X: 45, Z: 0)
  player.position.set(45, 21, 0);
  dungeon.update(0.1);
  assert.equal(dungeon.isActive, true, 'Dungeon mode should activate in Punching site');
  assert.equal(player.isDungeonMode, true, 'Player should be in top-down dungeon view');
  assert.equal(dungeon.currentZone.id, 'punching');

  // Exit site
  dungeon.exitDungeonMode(false);
  assert.equal(player.isDungeonMode, false);

  // 2. Enter Parkour Site (X: 0, Z: 45) -> MUST NOT ACTIVATE
  player.position.set(0, 22, 45);
  dungeon.update(0.1);
  assert.equal(dungeon.isActive, false, 'Dungeon mode must NEVER activate for Parkour site');
  assert.equal(player.isDungeonMode, false, 'Player perspective must stay standard for parkour');
});

test('Dungeon Mode controls: WASD controls cardinal top-down movement and faces direction', () => {
  const { game, player } = createMockGame();
  player.isDungeonMode = true;

  // Press KeyW (North / -Z)
  player.keys['KeyW'] = true;
  player.keys['KeyS'] = false;
  player.keys['KeyA'] = false;
  player.keys['KeyD'] = false;
  player.update(0.05);

  assert.ok(player.velocity.z < 0, 'W must move player North (negative Z)');
  assert.ok(Math.abs(player.yaw) < 0.2 || Math.abs(player.yaw - Math.PI * 2) < 0.2, 'Player should face North');

  // Press KeyD (East / +X)
  player.keys['KeyW'] = false;
  player.keys['KeyD'] = true;
  player.update(0.05);
  assert.ok(player.velocity.x > 0, 'D must move player East (positive X)');
});

test('Punch Attack (Key U): punches forward, deals melee damage and knockback', () => {
  const { game, player, mobs } = createMockGame();
  const dungeon = new DungeonModeManager(game);
  dungeon.isActive = true;
  player.isDungeonMode = true;

  // Face North (-Z)
  player.yaw = 0;
  player.position.set(0, 21, 0);

  // Spawn hostile mob right in front of player (at Z: -2)
  const targetMesh = new THREE.Mesh();
  targetMesh.position.set(0, 21, -2);
  const targetMob = {
    type: 'zombie',
    health: 40,
    maxHealth: 40,
    mesh: targetMesh,
    velocity: new THREE.Vector3()
  };
  mobs.mobs.push(targetMob);

  // Trigger Punch (U)
  const punched = player.triggerPunch();
  assert.equal(punched, true, 'Punch should trigger');
  assert.equal(player.isPunching, true);
  assert.ok(targetMob.health < 40, 'Target mob in front must take punch damage');

  // Verify cooldown prevents immediate double punch
  const spamPunch = player.triggerPunch();
  assert.equal(spamPunch, false, 'Punch on cooldown should be rejected');
});

test('Dodge Roll (Key N): bursts forward with invulnerability frames and triggers cooldown', () => {
  const { game, player } = createMockGame();
  player.isDungeonMode = true;
  player.yaw = 0; // facing North (-Z)

  // Trigger Dodge Roll (N)
  const rolled = player.triggerDodgeRoll();
  assert.equal(rolled, true, 'Dodge roll should trigger');
  assert.equal(player.isRolling, true, 'Player should enter rolling state');
  assert.ok(player.invulnerableTimer > 0.3, 'Player should have invulnerability frames during roll');
  assert.ok(player.rollCooldown > 0.8, 'Dodge roll should have a cooldown');

  // Simulate roll update
  player.update(0.05);
  assert.ok(player.velocity.z < -10, 'Roll velocity must burst forward with high speed');
});

test('Dungeon Mode exits automatically when all enemies in the zone are defeated', () => {
  const { game, player, mobs } = createMockGame();
  const dungeon = new DungeonModeManager(game);

  // Put a single hostile mob in Kamehameha range
  const targetMesh = new THREE.Mesh();
  targetMesh.position.set(-45, 22, 0);
  const targetMob = {
    type: 'skeleton',
    health: 25,
    mesh: targetMesh
  };
  mobs.mobs.push(targetMob);

  // Player enters Kamehameha site
  player.position.set(-45, 22, 0);
  dungeon.update(0.1);
  assert.equal(dungeon.isActive, true, 'Dungeon mode should be active while enemies remain');

  // Defeat the enemy
  targetMob.health = 0;
  dungeon.update(0.1); // detects 0 enemies, starts exit timer

  assert.equal(dungeon.isExiting, true, 'Exit timer should start upon enemy clearance');

  // Fast forward exit timer
  dungeon.update(2.0);
  assert.equal(dungeon.isActive, false, 'Dungeon mode should exit after area cleared');
  assert.equal(player.isDungeonMode, false, 'Camera should return to standard view');
  assert.ok(dungeon.clearedZones.has('kamehameha'), 'Zone should be marked as cleared');
});
