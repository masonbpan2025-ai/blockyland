import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as THREE from 'three';
import { DragonballSkillsManager } from '../src/mods/dragonball-tournament/dragonballSkills.js';
import { TrainingSitesManager } from '../src/mods/dragonball-tournament/trainingSites.js';
import { MobManager } from '../src/mobs.js';
import { Player } from '../src/player.js';
import { BLOCKS } from '../src/blocks.js';
import { installTournamentProviders } from './helpers/tournamentProviders.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    }
  });

  const chatMessages = [];
  const ui = {
    addChatMessage: (msg) => chatMessages.push(msg)
  };

  const tournament = {
    isTournamentMap: true,
    showDialogue: (title, text) => {}
  };

  const game = {
    world,
    scene,
    sounds,
    camera,
    player,
    mobs,
    ui,
    tournament
  };

  installTournamentProviders(game);
  return { game, player, camera, mobs, sounds, chatMessages, tournament };
}

test('Kamehameha skill freezes player and releases beam with damage', () => {
  const { game, player, mobs } = createMockGame();
  const skills = new DragonballSkillsManager(game);

  // 1. Start Charging Kamehameha
  skills.startCharge('kamehameha');
  assert.equal(player.isGatheringKi, true, 'Player should be marked as gathering Ki');
  assert.equal(skills.activeSkill, 'kamehameha');

  // Verify movement is locked while gathering Ki
  player.keys['KeyW'] = true;
  player.update(0.05);
  assert.equal(player.velocity.x, 0, 'Horizontal velocity X must remain 0 while gathering Ki');
  assert.equal(player.velocity.z, 0, 'Horizontal velocity Z must remain 0 while gathering Ki');

  // Simulate charge accumulation
  skills.update(1.5);
  assert.ok(skills.chargeTime >= 1.5, 'Charge time should accumulate');

  // Add dummy mob in front of player (along negative Z axis)
  const dummyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  dummyMesh.position.set(0, 24, -10);
  const targetMob = {
    type: 'zombie',
    health: 40,
    maxHealth: 40,
    mesh: dummyMesh,
    velocity: new THREE.Vector3()
  };
  mobs.mobs.push(targetMob);

  // 2. Release Charge
  skills.releaseCharge();
  assert.equal(player.isGatheringKi, false, 'Player should no longer be gathering Ki');
  assert.equal(skills.activeSkill, null);
  assert.equal(skills.activeBeams.length, 1, 'Kamehameha beam should be active in scene');

  // Target mob in line of beam should take heavy damage
  assert.ok(targetMob.health < 40, 'Target mob should take damage from Kamehameha beam');
  assert.ok(targetMob.velocity.z < 0, 'Target mob should be knocked back in beam direction');
});

test('Counter-Hit: taking enemy damage while gathering Ki interrupts skill and deals 1.5x damage', () => {
  const { game, player } = createMockGame();
  const skills = new DragonballSkillsManager(game);

  // Start Genki Dama charge
  skills.startCharge('genki_dama');
  assert.equal(player.isGatheringKi, true);
  assert.ok(skills.spiritBombMesh, 'Spirit bomb orb mesh should exist above player head');

  // Enemy attacks player for base 4 damage
  const initialHealth = player.health;
  player.takeDamage(4);

  // Critical penalty: 4 * 1.5 = 6 damage
  assert.equal(player.health, initialHealth - 6, 'Player should take 1.5x damage when attacked while gathering Ki');
  assert.equal(player.isGatheringKi, false, 'isGatheringKi should be reset to false after interruption');
  assert.equal(skills.activeSkill, null, 'Active skill should be cancelled');
  assert.equal(skills.spiritBombMesh, null, 'Spirit bomb mesh should be cleaned up on interruption');
});

test('Genki Dama creates growing celestial orb and detonates on impact with AoE damage', () => {
  const { game, player, mobs } = createMockGame();
  const skills = new DragonballSkillsManager(game);

  // Start Genki Dama
  skills.startCharge('genki_dama');
  assert.equal(player.isGatheringKi, true);
  assert.ok(skills.spiritBombMesh);

  // Charge for 2 seconds
  skills.update(2.0);
  assert.ok(skills.spiritBombMesh.scale.x > 1.0, 'Spirit bomb mesh scale should grow as Ki is gathered');

  // Spawn mob clustered in front of player
  const dummyMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
  dummyMesh.position.set(0, 24, -12);
  const targetMob = {
    type: 'zombie',
    health: 50,
    maxHealth: 50,
    mesh: dummyMesh,
    velocity: new THREE.Vector3()
  };
  mobs.mobs.push(targetMob);

  // Release Spirit Bomb
  skills.releaseCharge();
  assert.equal(skills.activeBombs.length, 1, 'Active spirit bomb projectile should be launched');

  // Fast forward bomb projectile flight
  const bomb = skills.activeBombs[0];
  bomb.mesh.position.set(0, 24, -12); // place bomb right on target mob
  skills.update(0.1);

  // Bomb should detonate
  assert.equal(skills.activeBombs.length, 0, 'Bomb should detonate upon impact');
  assert.ok(targetMob.health < 50, 'Mob in blast radius should take AoE damage');
});

test('Genki Dama throwing distance and damaging power reduce as key pressing time gets shorter', () => {
  const { game } = createMockGame();
  const skills = new DragonballSkillsManager(game);

  // Short tap: 0.2s charge
  skills.startCharge('genki_dama');
  skills.update(0.2);
  skills.releaseCharge();
  assert.equal(skills.activeBombs.length, 1);
  const quickBomb = skills.activeBombs[0];
  const quickDamage = quickBomb.damage;
  const quickSpeed = Math.hypot(quickBomb.velocity.x, quickBomb.velocity.z);

  // Clear bombs
  skills.activeBombs = [];

  // Full hold: 3.0s charge
  skills.startCharge('genki_dama');
  skills.update(3.0);
  skills.releaseCharge();
  assert.equal(skills.activeBombs.length, 1);
  const fullBomb = skills.activeBombs[0];
  const fullDamage = fullBomb.damage;
  const fullSpeed = Math.hypot(fullBomb.velocity.x, fullBomb.velocity.z);

  // Verify scaling
  assert.ok(quickDamage < fullDamage, `Quick tap damage (${quickDamage}) should be much lower than full charge damage (${fullDamage})`);
  assert.ok(quickSpeed < fullSpeed, `Quick tap velocity (${quickSpeed.toFixed(2)}) should be much slower than full charge (${fullSpeed.toFixed(2)})`);
  assert.ok(quickSpeed < 6.0, `Quick tap launch speed should stay very close (~4-5 blocks/sec)`);
  assert.ok(fullSpeed <= 12.0, `Full charge speed should stay restrained (~11-12 blocks/sec)`);
});

test('TrainingSitesManager defines 4 cardinal sites and introduces managers when entered', () => {
  const { game, player } = createMockGame();
  const training = new TrainingSitesManager(game);

  assert.equal(training.sites.length, 4, 'There must be 4 training sites');
  const siteIds = training.sites.map(s => s.id);
  assert.ok(siteIds.includes('parkour'), 'Parkour site exists');
  assert.ok(siteIds.includes('punching'), 'Punching site exists');
  assert.ok(siteIds.includes('kamehameha'), 'Kamehameha site exists');
  assert.ok(siteIds.includes('genki_dama'), 'Genki Dama site exists');

  // Walk player into Parkour Ground (Z: 40, X: 0)
  player.position.set(0, 22, 40);
  training.update(0.1, player);
  assert.equal(training.currentSite.id, 'parkour');

  // Walk player into Punching Combat Yard (X: 45, Z: 0)
  player.position.set(45, 21, 0);
  training.update(0.1, player);
  assert.equal(training.currentSite.id, 'punching');

  // Walk player into Kamehameha Range (X: -45, Z: 0)
  player.position.set(-45, 22, 0);
  training.update(0.1, player);
  assert.equal(training.currentSite.id, 'kamehameha');

  // Walk player into Genki Dama Crater (Z: -50, X: 0)
  player.position.set(0, 20, -50);
  training.update(0.1, player);
  assert.equal(training.currentSite.id, 'genki_dama');
});

test('Designed Tournament Map JSON includes all 4 training sites, host, site managers and training mobs', () => {
  const mapPath = path.resolve(__dirname, '..', 'src/mods/dragonball-tournament/maps', 'World_Martial_Arts_Tournament.json');
  assert.ok(fs.existsSync(mapPath), 'World_Martial_Arts_Tournament.json exists in designed_worlds/');

  const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
  assert.equal(mapData.name, 'World Martial Arts Tournament');
  assert.equal(mapData.worldType, 'designed');
  assert.equal(mapData.mechanism, 'dragonball_tournament');
  assert.ok(mapData.chunks.length >= 25, 'Map should contain full terrain coverage');

  const mobs = mapData.mobs;
  const host = mobs.find(m => m.type === 'tournament_host');
  assert.ok(host, 'Tournament Host NPC must exist');

  const managers = mobs.filter(m => m.type === 'site_manager');
  assert.equal(managers.length, 4, 'Must have 4 Site Manager NPCs');

  const siteIds = managers.map(m => m.siteId);
  assert.ok(siteIds.includes('parkour'), 'Parkour site manager present in map');
  assert.ok(siteIds.includes('punching'), 'Punching site manager present in map');
  assert.ok(siteIds.includes('kamehameha'), 'Kamehameha site manager present in map');
  assert.ok(siteIds.includes('genki_dama'), 'Genki Dama site manager present in map');

  // Check hostile mobs in the training sites
  const hostiles = mobs.filter(m => m.type === 'zombie' || m.type === 'skeleton' || m.type === 'pillager');
  assert.ok(hostiles.length >= 10, 'Training grounds should contain hostile training mobs');
});
