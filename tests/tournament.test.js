import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TournamentManager, TOURNAMENT_STATE } from '../src/tournament.js';
import { MobManager } from '../src/mobs.js';
import { EntityManager } from '../src/entities.js';
import { BLOCKS } from '../src/blocks.js';
import { Inventory } from '../src/inventory.js';
import { WorldMechanismManager } from '../src/worldMechanisms.js';

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
      enderman: new THREE.Texture(),
      jackie_chun: new THREE.Texture()
    }
  });

  const player = {
    position: new THREE.Vector3(0, 24, 16),
    yaw: 3.14,
    pitch: 0,
    health: 20,
    maxHealth: 20,
    takeDamage: (amt) => { player.health -= amt; }
  };

  const ui = {
    addChatMessage: () => {}
  };

  const skills = {
    shootOpponentKamehameha: () => {}
  };

  const game = {
    world,
    scene,
    sounds,
    entities,
    mobs,
    player,
    ui,
    skills
  };
  mobs.game = game;

  return { game, mobs, entities, player, sounds };
}

test('Tournament Host and Jackie Chun mobs spawn with authentic properties and difficulty levels', () => {
  const { mobs } = fixture();

  // 1. Tournament Host
  const host = mobs.spawnTournamentHost(3.5, 24, 10.5);
  assert.equal(host.type, 'tournament_host');
  assert.equal(host.name, 'Tournament Announcer');
  assert.equal(host.health, 100);
  assert.ok(host.rightArm.children.length > 0, 'Host should hold microphone in right arm');

  // 2. Jackie Chun (Easy)
  const jackieEasy = mobs.spawnJackieChun(0, 25, 0, { difficulty: 'easy' });
  assert.equal(jackieEasy.type, 'jackie_chun');
  assert.equal(jackieEasy.isBoss, true);
  assert.equal(jackieEasy.health, 60);
  assert.equal(jackieEasy.maxHealth, 60);
  assert.equal(jackieEasy.punchDamage, 2);
  assert.equal(jackieEasy.kamehamehaDamage, 8);
  assert.equal(jackieEasy.teleportCooldown, 6.0);
  assert.equal(jackieEasy.shadowSplitCooldown, 28);
  assert.ok(jackieEasy.head, 'Jackie Chun should have head model');

  // 3. Jackie Chun (Normal)
  const jackieNormal = mobs.spawnJackieChun(0, 25, 0, { difficulty: 'normal' });
  assert.equal(jackieNormal.health, 100);
  assert.equal(jackieNormal.punchDamage, 4);
  assert.equal(jackieNormal.kamehamehaDamage, 12);
  assert.equal(jackieNormal.teleportCooldown, 4.5);
  assert.equal(jackieNormal.shadowSplitCooldown, 18);

  // 4. Jackie Chun (Hard)
  const jackieHard = mobs.spawnJackieChun(0, 25, 0, { difficulty: 'hard' });
  assert.equal(jackieHard.health, 160);
  assert.equal(jackieHard.punchDamage, 6);
  assert.equal(jackieHard.kamehamehaDamage, 18);
  assert.equal(jackieHard.teleportCooldown, 2.8);
  assert.equal(jackieHard.shadowSplitCooldown, 12);

  // 5. Teleportation / Sudden Position Change
  mobs.teleportJackieChun(jackieNormal, 5, 24.5, -4);
  assert.equal(jackieNormal.mesh.position.x, 5);
  assert.equal(jackieNormal.mesh.position.y, 24.5);
  assert.equal(jackieNormal.mesh.position.z, -4);
});

test('Jackie Chun Shadow Split creates 4 Jackie Chuns with 1 real and 3 clones having 1/4 HP', () => {
  const { mobs } = fixture();
  const realBoss = mobs.spawnJackieChun(0, 24.5, 0, { difficulty: 'normal' });
  assert.equal(realBoss.isClone, false);
  assert.equal(realBoss.health, 100);

  // Shadow Split creates 3 clones (4 Jackie Chuns total)
  const clones = mobs.shadowSplit(realBoss);
  assert.equal(clones.length, 3);
  assert.equal(realBoss.clones.length, 3);

  // Clones have 1/4 health (25 HP on normal) and small damage
  for (const clone of clones) {
    assert.equal(clone.isClone, true);
    assert.equal(clone.isBoss, false);
    assert.equal(clone.health, 25);
    assert.equal(clone.maxHealth, 25);
    assert.ok(clone.punchDamage < realBoss.punchDamage);
    assert.ok(clone.kamehamehaDamage < realBoss.kamehamehaDamage);
  }

  // Defeating a clone dispels the clone
  const clone1 = clones[0];
  mobs.damageMob(clone1, 50, new THREE.Vector3());
  assert.equal(mobs.mobs.includes(clone1), false, 'Lethal hit to clone should remove it');

  // Defeating real Jackie Chun dispels all remaining clones
  mobs.damageMob(realBoss, 150, new THREE.Vector3());
  assert.equal(realBoss.health <= 0, true);
  for (const remainingClone of clones.slice(1)) {
    assert.equal(mobs.mobs.includes(remainingClone), false, 'Real boss death should dispel all clones');
  }
});

test('TournamentManager state machine progresses from talk to battle to victory against Jackie Chun', () => {
  const { game } = fixture();
  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;

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

  // 4. Step onto stage -> Start Fight with Jackie Chun
  tm.startFight('normal', false);
  assert.equal(tm.state, TOURNAMENT_STATE.FIGHTING);
  assert.ok(tm.bossMob, 'Jackie Chun Boss should be spawned');
  assert.equal(tm.bossMob.type, 'jackie_chun');
  assert.equal(tm.bossMob.isClone, false);

  // 5. Defeat Jackie Chun Boss -> Victory
  tm.bossMob.health = 0;
  tm.update(0.1, game.player);
  assert.equal(tm.state, TOURNAMENT_STATE.VICTORY);

  // 6. Reset
  tm.reset();
  assert.equal(tm.state, TOURNAMENT_STATE.WAITING_FOR_TALK);
  assert.equal(tm.hasTalked, false);
});

test('Two-Player mode allows Player 2 to control Jackie Chun with movements and skills', () => {
  const { game } = fixture();
  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;

  // Start 2-Player Match
  tm.startFight('normal', true);
  assert.equal(tm.isTwoPlayer, true);
  assert.equal(tm.bossMob.isPlayerControlled, true);

  // Directional movement
  tm.p2Keys.right = true;
  tm.update(0.1, game.player);
  assert.ok(tm.bossMob.velocity.x > 0, 'Jackie Chun should move right when ArrowRight is pressed');

  // Player 2 Punch against Player 1
  game.player.position.set(tm.bossMob.mesh.position.x + 1.0, tm.bossMob.mesh.position.y, tm.bossMob.mesh.position.z);
  const hpBefore = game.player.health;
  tm.p2Punch();
  assert.ok(game.player.health < hpBefore, 'Player 1 should take damage from Player 2 punch');

  // Player 2 sudden move / teleport
  const posBefore = tm.bossMob.mesh.position.clone();
  tm.p2TeleportCooldown = 0;
  game.mobs.teleportJackieChun(tm.bossMob);
  assert.notDeepEqual(tm.bossMob.mesh.position, posBefore, 'Player 2 should teleport upon sudden move');

  // Player 2 Victory condition
  game.player.health = 0;
  tm.update(0.1, game.player);
  assert.equal(tm.state, TOURNAMENT_STATE.VICTORY, 'Player 2 defeating Player 1 triggers tournament victory');
});

test('Player defeat in tournament triggers "You lost, please try again." and resets player state', () => {
  const { game } = fixture();
  const messages = [];
  game.ui.addChatMessage = (msg) => { messages.push(msg); };

  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;
  tm.startFight('normal', false);
  assert.equal(tm.state, TOURNAMENT_STATE.FIGHTING);
  assert.ok(tm.bossMob);

  // Player health reaches 0
  game.player.health = 0;
  tm.update(0.1, game.player);

  // Should transition out of FIGHTING and clear boss
  assert.equal(tm.state, TOURNAMENT_STATE.STAGE_READY);
  assert.equal(tm.bossMob, null, 'Boss should be cleared on player defeat');
  assert.equal(game.player.health, 0, 'Player health should remain 0 while defeated');
  assert.equal(game.player.isDead, true, 'Player should be marked as dead on defeat');
  assert.equal(game.player.isDungeonMode, false, 'Player should exit dungeon mode on defeat');

  // Verify "You lost, please try again." message
  const hasLostMsg = messages.some(m => m.includes('You lost, please try again.'));
  assert.equal(hasLostMsg, true, 'Defeat message must state "You lost, please try again."');

  // Retrying should restore player health to full and revive player
  tm.retryDefeat();
  assert.ok(game.player.health > 0, 'Player health should be restored to max on retry');
  assert.equal(game.player.isDead, false, 'Player should no longer be dead after retry');
});

test('Player victory against Jackie Chun shows congratulations, returns to normal mode, and sends fireworks in the sky', () => {
  const { game } = fixture();
  const messages = [];
  game.ui.addChatMessage = (msg) => { messages.push(msg); };

  let fireworksLaunched = 0;
  game.entities.launchTournamentFireworks = () => { fireworksLaunched++; };

  let dungeonModeExited = false;
  game.dungeonMode = {
    exitDungeonMode: () => { dungeonModeExited = true; }
  };

  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;
  tm.startFight('normal', false);
  game.player.isDungeonMode = true;

  // Defeat Jackie Chun
  tm.bossMob.health = 0;
  tm.update(0.1, game.player);

  // State should be VICTORY
  assert.equal(tm.state, TOURNAMENT_STATE.VICTORY);

  // Should return to normal mode
  assert.equal(dungeonModeExited, true, 'Should call exitDungeonMode');
  assert.equal(game.player.isDungeonMode, false, 'Player should be in normal mode');

  // Should launch fireworks in the sky
  assert.ok(fireworksLaunched > 0, 'Should launch celebratory fireworks into the sky');

  // Should show congratulations message
  const hasCongrats = messages.some(m => m.includes('CONGRATULATIONS') && m.includes('Jackie Chun'));
  assert.equal(hasCongrats, true, 'Should show congratulations message defeating Jackie Chun');
});

test('Tournament host, decorations, and announcements NEVER trigger in a normal world', () => {
  const { game } = fixture();
  const tm = new TournamentManager(game);
  assert.equal(tm.isTournamentMap, false);

  // In a normal world, update, talkToHost, and ensureHost do nothing
  tm.update(0.1, game.player);
  assert.equal(tm.hasTalked, false);
  assert.equal(tm.state, TOURNAMENT_STATE.WAITING_FOR_TALK);
  assert.equal(tm.hostMob, null);
  assert.equal(tm.decorationsGroup, null);
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
  const savePath = path.resolve(__dirname, '..', 'designed_worlds', 'World_Martial_Arts_Tournament.json');

  assert.ok(fs.existsSync(savePath), 'Tournament map JSON should exist');
  const content = JSON.parse(fs.readFileSync(savePath, 'utf8'));

  // 1. Verify survival mode in saved JSON
  assert.equal(content.player?.gamemode, 'survival', 'Tournament map player must be survival mode only');
  assert.equal(content.worldType, 'designed', 'Tournament map must be designed world type');
  assert.equal(content.mechanism, 'dragonball_tournament', 'Tournament map must have dragonball_tournament mechanism');

  // 2. Verify chunks are present and contain blocks
  assert.ok(content.chunks.length > 50, 'Map should contain full tournament world chunks');
});

test('Player starts with fist in hand (no sword in hand) in both new world and tournament map', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  // 1. New World Inventory
  const inv = new Inventory({});
  assert.equal(inv.activeSlot, 0, 'Initial activeSlot must be 0');
  assert.equal(inv.getActiveItem(), null, 'Active item at start of new world must be null (fist)');
  assert.equal(inv.hotbar[0], null, 'Hotbar slot 0 must be empty so player starts with just fist');
  assert.ok(inv.storage.some(it => it && it.id === 'diamond_sword'), 'Sword is safely stored in inventory storage, not in hand');

  // 2. Tournament Map
  const savePath = path.resolve(__dirname, '..', 'designed_worlds', 'World_Martial_Arts_Tournament.json');
  const content = JSON.parse(fs.readFileSync(savePath, 'utf8'));
  assert.equal(content.inventory.activeSlot, 0, 'Tournament activeSlot must be 0');
  assert.equal(content.inventory.hotbar[0], null, 'Tournament hotbar slot 0 must be empty so player starts with fist');
  assert.ok(content.inventory.storage.some(it => it && it.id === 'diamond_sword'), 'Tournament map has sword in storage rather than in hand');
});

test('Player health bar is 3x long (60 max HP and 30 hearts) in the world tournament map', () => {
  const { game } = fixture();
  const wm = new WorldMechanismManager(game);

  // Default world: standard 20 max HP
  wm.setMechanism('default', game);
  assert.equal(game.player.maxHealth, 20, 'Default world should have 20 max HP');

  // Activate tournament mechanism
  wm.setMechanism('dragonball_tournament', game);
  assert.equal(game.player.maxHealth, 60, 'Tournament map player maxHealth should be 60 (3x of 20)');
  assert.equal(game.player.health, 60, 'Tournament map player health should be 60');

  // Deactivate tournament mechanism: restores standard 20 HP
  wm.setMechanism('default', game);
  assert.equal(game.player.maxHealth, 20, 'Default world should restore 20 max HP');
  assert.equal(game.player.health, 20, 'Default world should restore 20 health');
});

test('Tournament battle does not start when player steps onto stage until Get into Arena is clicked, and player cannot leave stage', () => {
  const { game } = fixture();
  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;
  game.tournament = tm;

  // 1. Talk to host sets state to STAGE_READY
  tm.state = TOURNAMENT_STATE.STAGE_READY;
  tm.hasTalked = true;

  // 2. Player walks directly onto the stage while choosing difficulty
  game.player.position.set(0, 24.5, 0); // on stage
  assert.equal(tm.isOnStage(game.player.position), true);

  // Update loop runs: fight must NOT start
  tm.update(0.1, game.player);
  assert.equal(tm.state, TOURNAMENT_STATE.STAGE_READY, 'State must remain STAGE_READY even if player steps on stage');
  assert.equal(tm.bossMob, null, 'Jackie Chun must not spawn before player clicks Get into Arena');

  // 3. Player clicks "Get into Arena" (calls startFight)
  tm.startFight('hard', false);
  assert.equal(tm.state, TOURNAMENT_STATE.FIGHTING);
  assert.ok(tm.bossMob, 'Jackie Chun should now be spawned');
  assert.equal(tm.difficulty, 'hard');

  // 4. Test stage containment: player tries to walk beyond stage bounds
  // Attempt to walk past East boundary (X > 8.5)
  game.player.position.set(12.0, 24.5, 0.0);
  tm.update(0.1, game.player);
  assert.ok(game.player.position.x <= 8.5, 'Player X must be clamped inside stage boundary');

  // Attempt to walk past West boundary (X < -8.5)
  game.player.position.set(-15.0, 24.5, 0.0);
  tm.update(0.1, game.player);
  assert.ok(game.player.position.x >= -8.5, 'Player X must be clamped inside stage boundary');

  // Attempt to walk past North boundary (Z < -8.5)
  game.player.position.set(0.0, 24.5, -20.0);
  tm.update(0.1, game.player);
  assert.ok(game.player.position.z >= -8.5, 'Player Z must be clamped inside stage boundary');

  // Attempt to walk past South boundary (Z > 8.5)
  game.player.position.set(0.0, 24.5, 25.0);
  tm.update(0.1, game.player);
  assert.ok(game.player.position.z <= 8.5, 'Player Z must be clamped inside stage boundary');

  // Attempt to fall below stage floor (Y < 24.0)
  game.player.position.set(0.0, 10.0, 0.0);
  tm.update(0.1, game.player);
  assert.ok(game.player.position.y >= 24.0, 'Player Y must not fall below stage floor during battle');
});

test('Jackie Chun in World Tournament map has authentic Ki aura and Enter key Kamehameha with visual effects', () => {
  const { game } = fixture();
  let kamehamehaFired = false;
  let beamDamage = 0;
  let beamRadius = 0;

  game.skills.shootOpponentKamehameha = (origin, shootDir, damage, radius, attacker) => {
    kamehamehaFired = true;
    beamDamage = damage;
    beamRadius = radius;
  };

  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;

  // Start match
  tm.startFight('normal', false);
  const jackie = tm.bossMob;
  assert.ok(jackie, 'Jackie Chun boss mob must spawn');

  // 1. Jackie Chun has Goku-like martial arts Ki aura
  assert.ok(jackie.kiAuraMesh, 'Jackie Chun must possess 3D Ki aura mesh');
  assert.equal(jackie.kiAuraMat.color.getHex(), 0x00f0ff, 'Ki aura must have vibrant cyan energy color');

  // 2. Pressing Enter engages P2 mode if not already engaged and starts Kamehameha charge
  assert.equal(tm.p2IsChargingKamehameha, false);
  tm.p2StartChargingKamehameha();
  assert.equal(tm.p2IsChargingKamehameha, true);
  assert.ok(jackie.chargeSphereGroup, 'Charging Kamehameha must create glowing Ki charge sphere');
  assert.ok(jackie.leftArm.rotation.x < -1.0, 'Arms must be cupped back in Kamehameha stance');

  // 3. Charging updates Ki aura flaring and scales charge sphere
  tm.update(0.5, game.player);
  assert.ok(tm.p2KamehamehaChargeTime >= 0.5, 'Charge time must accumulate');
  assert.ok(jackie.chargeSphereGroup.scale.x > 0.5, 'Charge sphere must scale and pulse with power');

  // 4. Releasing Kamehameha fires beam and cleans up charge visuals
  tm.p2ReleaseKamehameha();
  assert.equal(tm.p2IsChargingKamehameha, false, 'Charging state must reset upon release');
  assert.equal(kamehamehaFired, true, 'shootOpponentKamehameha must be called on release');
  assert.ok(beamDamage >= 12, 'Kamehameha must deal significant damage');
  assert.ok(beamRadius >= 0.8, 'Kamehameha beam must have expansive radius');
  assert.equal(jackie.chargeSphereGroup, null, 'Charge sphere must be cleaned up after release');

  // 5. Automatic P2 activation test
  tm.isTwoPlayer = false;
  tm.activateTwoPlayerMode(false);
  assert.equal(tm.isTwoPlayer, true, 'activateTwoPlayerMode must set isTwoPlayer to true');
  assert.equal(jackie.isPlayerControlled, true, 'Jackie Chun must become player-controlled in 2P mode');
});

test('Jackie Chun punch has yellow shock wave visual effect and Kamehameha is 1.5x width of Gokus with aggressive 1P combat', () => {
  const { game, mobs } = fixture();
  let punchWaveSpawned = false;
  let punchWaveColor = null;
  let opponentKamehamehaRadius = 0;
  let sparksColor = null;

  game.skills.spawnPunchWave = (origin, dir, color) => {
    punchWaveSpawned = true;
    punchWaveColor = color;
  };
  game.skills.spawnEnergySparks = (pos, count, color) => {
    sparksColor = color;
  };
  game.skills.shootOpponentKamehameha = (origin, dir, dmg, radius, attacker) => {
    opponentKamehamehaRadius = radius;
  };

  const tm = new TournamentManager(game);
  tm.isTournamentMap = true;
  tm.startFight('normal', true); // 2P mode
  const jackie = tm.bossMob;

  // 1. Jackie Chun punch in 2P mode spawns yellow shock wave effect
  jackie.mesh.position.set(0, 24.5, 0);
  game.player.position.set(0, 24.5, 1.2);
  tm.p2Punch();
  assert.equal(punchWaveSpawned, true, 'Punch should trigger spawnPunchWave');
  assert.equal(punchWaveColor, 0xfacc15, 'Jackie Chun punch shockwave must be vibrant yellow (0xfacc15) like Gokus');
  assert.equal(sparksColor, 0xfacc15, 'Punch impact sparks must be yellow energy (0xfacc15)');

  // 2. Jackie Chun Kamehameha width is 1.5x width of Goku's
  // Goku full power width: radius = 1.5. Jackie Chun 1.5x: 2.25 radius
  tm.p2StartChargingKamehameha();
  tm.p2KamehamehaChargeTime = 3.0; // full charge
  tm.p2ReleaseKamehameha();
  const gokuFullChargeRadius = 1.5;
  const expectedJackieRadius = gokuFullChargeRadius * 1.5; // 2.25
  assert.equal(opponentKamehamehaRadius, expectedJackieRadius, 'Jackie Chun Kamehameha width must be exactly 1.5x of Gokus');

  // 3. 1-Player mode: Jackie Chun AI uses punch with yellow shock waves
  punchWaveSpawned = false;
  punchWaveColor = null;
  const aiJackie = mobs.spawnJackieChun(0, 24.5, 0, { difficulty: 'normal' });
  assert.equal(aiJackie.isPlayerControlled, false);
  mobs.mobs = [aiJackie];

  // Position player in close melee range
  game.player.position.set(0, 24.5, 1.2);
  aiJackie.attackCooldown = 0;
  aiJackie.kamehamehaCooldown = 10;
  mobs.update(0.05, game.player);
  assert.equal(punchWaveSpawned, true, '1P mode AI Jackie Chun punch must trigger yellow punch wave');
  assert.equal(punchWaveColor, 0xfacc15, '1P mode AI Jackie Chun punch shockwave must be yellow (0xfacc15)');

  // 4. 1-Player mode: Jackie Chun AI aggressively triggers Kamehameha and backsteps when close
  aiJackie.kamehamehaCooldown = 0;
  aiJackie.isChargingKamehameha = false;
  game.player.position.set(0, 24.5, 1.5); // close range
  mobs.update(0.05, game.player);
  assert.equal(aiJackie.isChargingKamehameha, true, 'Jackie Chun must aggressively start charging Kamehameha');
  assert.ok(aiJackie.velocity.z < 0, 'Jackie Chun must backstep leap to create distance for Kamehameha');

  // 5. When firing Kamehameha in 1P mode, beam is 1.5x width of Goku's
  aiJackie.kamehamehaChargeTimer = 0;
  opponentKamehamehaRadius = 0;
  mobs.update(0.05, game.player);
  assert.equal(opponentKamehamehaRadius, 2.25, '1P mode Jackie Chun Kamehameha must be 1.5x Goku width (2.25 radius)');
  assert.ok(aiJackie.kamehamehaCooldown <= 5.0, 'Kamehameha cooldown after firing must be aggressive (<= 5s)');
});


