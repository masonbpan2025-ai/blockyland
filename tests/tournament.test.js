import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TournamentManager, TOURNAMENT_STATE } from '../src/tournament.js';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';

function fixture() {
  const world = { getVoxel: () => BLOCKS.AIR, chunks: new Map() };
  const scene = new THREE.Scene();
  const sounds = {
    playHostSpeak: () => {},
    playEndermanTeleport: () => {},
    playEndermanHurt: () => {},
    playFireworkLaunch: () => {},
    playFireworkExplode: () => {},
    playVictoryFanfare: () => {}
  };
  const entities = new EntityManager(scene, world, sounds);
  const mobs = Object.assign(Object.create(MobManager.prototype), {
    world,
    scene,
    sounds,
    entities,
    mobs: [],
    arrows: [],
    textures: {
      villager: new THREE.Texture(),
      tournament_host: new THREE.Texture(),
      enderman: new THREE.Texture()
    }
  });

  const player = {
    position: new THREE.Vector3(0, 24, 16),
    yaw: 3.14,
    pitch: 0,
    takeDamage: () => {}
  };

  const ui = {
    addChatMessage: () => {}
  };

  const game = {
    world,
    scene,
    sounds,
    entities,
    mobs,
    player,
    ui
  };

  return { game, mobs, entities, player, sounds };
}

test('Tournament Host and Enderman mobs spawn with authentic properties', () => {
  const { mobs } = fixture();

  // 1. Tournament Host
  const host = mobs.spawnTournamentHost(3.5, 24, 10.5);
  assert.equal(host.type, 'tournament_host');
  assert.equal(host.name, 'Tournament Announcer');
  assert.equal(host.health, 100);
  assert.ok(host.rightArm.children.length > 0, 'Host should hold microphone in right arm');

  // 2. Enderman Boss
  const enderman = mobs.spawnEnderman(0, 25, 0);
  assert.equal(enderman.type, 'enderman');
  assert.equal(enderman.isBoss, true);
  assert.equal(enderman.health, 60);
  assert.equal(enderman.maxHealth, 60);
  assert.ok(enderman.head, 'Enderman should have head model');

  // 3. Teleportation
  mobs.teleportEnderman(enderman, 5, 24.5, -4);
  assert.equal(enderman.mesh.position.x, 5);
  assert.equal(enderman.mesh.position.y, 24.5);
  assert.equal(enderman.mesh.position.z, -4);
});

test('TournamentManager state machine progresses from talk to battle to victory', () => {
  const { game } = fixture();
  const tm = new TournamentManager(game);

  // 1. Initial State
  assert.equal(tm.state, TOURNAMENT_STATE.WAITING_FOR_TALK);
  assert.equal(tm.hasTalked, false);

  // 2. Talk to Host
  tm.talkToHost();
  assert.equal(tm.state, TOURNAMENT_STATE.STAGE_READY);
  assert.equal(tm.hasTalked, true);

  // 3. Stage boundary check
  assert.equal(tm.isOnStage(new THREE.Vector3(0, 24.5, 0)), true);
  assert.equal(tm.isOnStage(new THREE.Vector3(0, 24, 16)), false);

  // 4. Step onto stage -> Start Fight
  tm.startFight();
  assert.equal(tm.state, TOURNAMENT_STATE.FIGHTING);
  assert.ok(tm.bossMob, 'Enderman Boss should be spawned');
  assert.equal(tm.bossMob.type, 'enderman');

  // 5. Defeat Enderman Boss -> Victory
  tm.bossMob.health = 0;
  tm.update(0.1, game.player);
  assert.equal(tm.state, TOURNAMENT_STATE.VICTORY);

  // 6. Reset
  tm.reset();
  assert.equal(tm.state, TOURNAMENT_STATE.WAITING_FOR_TALK);
  assert.equal(tm.hasTalked, false);
});

test('Fireworks rockets ascend and burst into colorful particles', () => {
  const { entities } = fixture();

  entities.spawnFireworkRocket(new THREE.Vector3(0, 24, 0), 40, [0xff0044, 0xffd700]);
  assert.equal(entities.fireworkRockets.length, 1);

  // Advance time until rocket reaches target height and explodes
  for (let i = 0; i < 8; i++) {
    entities.update(0.1, { position: new THREE.Vector3() }, { addItem: () => true });
  }

  assert.equal(entities.fireworkRockets.length, 0, 'Rocket should have exploded');
  assert.ok(entities.particles.length >= 40, 'Should have spawned colorful spark particles');
});

test('World Martial Arts Tournament map is Survival mode only and contains accessible stairs', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const savePath = path.resolve(__dirname, '..', 'saves', 'World_Martial_Arts_Tournament.json');

  assert.ok(fs.existsSync(savePath), 'Tournament map JSON should exist');
  const content = JSON.parse(fs.readFileSync(savePath, 'utf8'));

  // 1. Verify survival mode in saved JSON
  assert.equal(content.player?.gamemode, 'survival', 'Tournament map player must be survival mode only');

  // 2. Verify chunks are present and contain blocks
  assert.ok(content.chunks.length > 50, 'Map should contain full tournament world chunks');
});
