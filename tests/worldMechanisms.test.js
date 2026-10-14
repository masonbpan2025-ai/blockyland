import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorldMechanismManager, MECHANISM_IDS } from '../src/worldMechanisms.js';
import { serializeWorld, deserializeWorld } from '../src/mapManager.js';
import { DragonballSkillsManager } from '../src/mods/dragonball-tournament/dragonballSkills.js';
import { TournamentManager } from '../src/mods/dragonball-tournament/tournament.js';
import { TrainingSitesManager } from '../src/mods/dragonball-tournament/trainingSites.js';
import { DungeonModeManager } from '../src/mods/dragonball-tournament/dungeonMode.js';
// The designed world's mechanism is the MOD's, not the core's. Registered from its entrypoint here, the same
// way `index.js` does it, so this suite exercises the arrangement that ships.
import { MECHANISM_ID as TOURNAMENT_MECHANISM_ID, mechanismDefinition as tournamentMechanismDefinition }
  from '../src/mods/dragonball-tournament/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

test('Start screen has Generate New World, Load Designed World, and Load Saved World buttons', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');

  // Verify all 3 start screen buttons exist
  assert.ok(html.includes('id="btn-start-new-world"'), 'Start screen has Generate New World button');
  assert.ok(html.includes('id="btn-start-designed-world"'), 'Start screen has Load Designed World button');
  assert.ok(html.includes('id="btn-start-load-world"'), 'Start screen has Load Saved World button');

  // Verify text content
  assert.match(html, />\s*Generate New World\s*</);
  assert.match(html, />\s*Load Designed World\s*</);
  assert.match(html, />\s*Load Saved World\s*</);

  // Verify Dedicated Designed Worlds modal exists and is isolated
  assert.ok(html.includes('id="designed-worlds-modal"'), 'Dedicated Designed Worlds modal window exists');
  assert.ok(html.includes('id="map-designed-list"'), 'Designed Worlds modal has list container');
  assert.ok(html.includes('id="btn-close-designed-modal"'), 'Designed Worlds modal has Back button');

  // Verify Dedicated Designed Worlds modal does NOT contain tabs, Default Save Location, or curated description box
  const designedModalSection = html.slice(html.indexOf('id="designed-worlds-modal"'), html.indexOf('id="map-modal"'));
  assert.ok(!designedModalSection.includes('tab-load-map'), 'Designed worlds modal has NO load map tab');
  assert.ok(!designedModalSection.includes('tab-save-map'), 'Designed worlds modal has NO save map tab');
  assert.ok(!designedModalSection.includes('Default Save Location'), 'Designed worlds modal has NO Default Save Location');
  assert.ok(!designedModalSection.includes('Curated Designed Worlds'), 'Designed worlds modal has NO Curated Designed Worlds description box');

  // Verify map modal does NOT contain designed worlds tab
  const mapModalSection = html.slice(html.indexOf('id="map-modal"'), html.indexOf('id="gemini-modal"'));
  assert.ok(!mapModalSection.includes('tab-designed-worlds'), 'Map modal has NO designed worlds tab');
});

test('World tournament map is located inside its mod directory, NOT in saves directory', () => {
  const designedMapPath = path.join(root, 'src/mods/dragonball-tournament/maps', 'World_Martial_Arts_Tournament.json');
  const savesMapPath = path.join(root, 'saves', 'World_Martial_Arts_Tournament.json');

  assert.ok(fs.existsSync(designedMapPath), 'Tournament map exists in its mod directory');
  assert.ok(!fs.existsSync(savesMapPath), 'Tournament map does NOT exist in saves directory');

  const mapData = JSON.parse(fs.readFileSync(designedMapPath, 'utf-8'));
  assert.equal(mapData.worldType, 'designed');
  assert.equal(mapData.mechanism, 'dragonball_tournament');
  assert.equal(mapData.mechanismName, 'Dragon Ball World Tournament');
});

test('WorldMechanismManager default mechanism isolates all custom mechanisms from generated worlds', () => {
  const mockGame = {
    scene: { add: () => {}, remove: () => {} },
    player: { gamemode: 'creative', isFlying: false, position: { x: 0, y: 20, z: 0 } }
  };

  const manager = new WorldMechanismManager(mockGame);

  // 1. Initial mechanism is DEFAULT
  assert.equal(manager.currentMechanismId, MECHANISM_IDS.DEFAULT);
  assert.equal(manager.isFeatureEnabled('hasDragonBallSkills'), false);
  assert.equal(manager.isFeatureEnabled('hasTournamentAnnouncer'), false);
  assert.equal(manager.isFeatureEnabled('hasTrainingSites'), false);
  assert.equal(manager.isFeatureEnabled('hasDungeonCombatMode'), false);
  assert.equal(manager.isFeatureEnabled('hasOverheadHealthBars'), false);
  assert.equal(manager.isFeatureEnabled('allowFistPunchAttack'), false);
  assert.equal(manager.isFeatureEnabled('allowDodgeRoll'), false);
  assert.equal(manager.isFeatureEnabled('allowCreativeFlight'), true);

  // 2. Switch to the designed world's mechanism.
  //
  // It is no longer a constant in the core: the mod registers it from its entrypoint. This test therefore
  // registers it the same way the mod does, which is what makes it a test of the current architecture rather
  // than of the arrangement it replaced.
  manager.registerMechanism(TOURNAMENT_MECHANISM_ID, tournamentMechanismDefinition());
  manager.setMechanism(TOURNAMENT_MECHANISM_ID, mockGame);
  assert.equal(manager.currentMechanismId, TOURNAMENT_MECHANISM_ID);
  assert.equal(manager.isModMechanism(TOURNAMENT_MECHANISM_ID), true,
    'and the manager can tell a mod mechanism from its own');
  assert.equal(manager.isFeatureEnabled('hasDragonBallSkills'), true);
  assert.equal(manager.isFeatureEnabled('hasTournamentAnnouncer'), true);
  assert.equal(manager.isFeatureEnabled('hasTrainingSites'), true);
  assert.equal(manager.isFeatureEnabled('hasDungeonCombatMode'), true);
  assert.equal(manager.isFeatureEnabled('hasOverheadHealthBars'), true);
  assert.equal(manager.isFeatureEnabled('allowFistPunchAttack'), true);
  assert.equal(manager.isFeatureEnabled('allowDodgeRoll'), true);
  assert.equal(manager.isFeatureEnabled('allowCreativeFlight'), false);
  assert.equal(mockGame.player.gamemode, 'survival', 'Tournament mechanism enforces survival mode');

  // 3. Switch back to DEFAULT (e.g. generating new world)
  manager.setMechanism(MECHANISM_IDS.DEFAULT, mockGame);
  assert.equal(manager.currentMechanismId, MECHANISM_IDS.DEFAULT);
  assert.equal(manager.isFeatureEnabled('hasDragonBallSkills'), false);
  assert.equal(manager.isFeatureEnabled('hasTournamentAnnouncer'), false);
  assert.equal(manager.isFeatureEnabled('hasTrainingSites'), false);
  assert.equal(manager.isFeatureEnabled('hasDungeonCombatMode'), false);
  assert.equal(manager.isFeatureEnabled('hasOverheadHealthBars'), false);
});

test('Serialization and Deserialization preserve mechanism and worldType for both generated and designed worlds', () => {
  // Mock game instance
  const mockWorld = {
    chunks: new Map(),
    seed: 12345,
    getChunk: () => null,
    getOrCreateChunk: () => ({ voxels: new Uint8Array(16384), waterLevels: new Uint8Array(16384) }),
    chunkKey: (cx, cz) => `${cx},${cz}`,
    reseed: () => {}
  };
  const mockPlayer = {
    position: { x: 10, y: 25, z: 15, set: () => {} },
    velocity: { x: 0, y: 0, z: 0, set: () => {} },
    yaw: 0,
    pitch: 0,
    gamemode: 'creative',
    health: 20,
    hunger: 20,
    exp: 0,
    level: 0,
    update: () => {}
  };
  const mockInventory = {
    hotbar: new Array(9).fill(null),
    storage: new Array(27).fill(null),
    activeSlot: 0
  };
  const mockCamera = {
    quaternion: { setFromEuler: () => {} }
  };
  const mockScene = {
    remove: () => {},
    add: () => {}
  };

  const game = {
    scene: mockScene,
    camera: mockCamera,
    world: mockWorld,
    player: mockPlayer,
    inventory: mockInventory,
    worldTime: 6000,
    weather: { isRaining: false, rainIntensity: 0 },
    mobs: { mobs: [], clearMobs: () => {}, spawnMob: () => null },
    geminiAgent: { builtStructures: [], lastBuiltStructure: null, conversationHistory: [] },
    loadChunksAroundPlayer: () => {},
    rebuildChunkMesh: () => {}
  };

  game.mechanisms = new WorldMechanismManager(game);

  // --- Case A: Generated World (Default Mechanism) ---
  game.worldType = 'generated';
  game.mechanisms.setMechanism(MECHANISM_IDS.DEFAULT, game);

  const generatedSerialized = serializeWorld(game, 'My Vanilla Build');
  assert.equal(generatedSerialized.worldType, 'generated');
  assert.equal(generatedSerialized.mechanism, 'default');

  // Deserialize into fresh game
  deserializeWorld(game, generatedSerialized);
  assert.equal(game.worldType, 'generated');
  assert.equal(game.mechanisms.currentMechanismId, 'default');
  assert.equal(game.mechanisms.isFeatureEnabled('hasDragonBallSkills'), false);

  // --- Case B: Designed World (the mod's tournament mechanism) ---
  game.worldType = 'designed';
  game.mechanisms.registerMechanism(TOURNAMENT_MECHANISM_ID, tournamentMechanismDefinition());
  game.mechanisms.setMechanism(TOURNAMENT_MECHANISM_ID, game);

  const designedSerialized = serializeWorld(game, 'Tournament Arena Custom Save');
  assert.equal(designedSerialized.worldType, 'designed');
  assert.equal(designedSerialized.mechanism, 'dragonball_tournament');

  // Reset to default, then deserialize the designed world save
  game.mechanisms.setMechanism(MECHANISM_IDS.DEFAULT, game);
  assert.equal(game.mechanisms.currentMechanismId, 'default');

  deserializeWorld(game, designedSerialized);
  // Must preserve the mechanism from the original designed world!
  assert.equal(game.worldType, 'designed');
  assert.equal(game.mechanisms.currentMechanismId, 'dragonball_tournament');
  assert.equal(game.mechanisms.isFeatureEnabled('hasDragonBallSkills'), true);
  assert.equal(game.mechanisms.isFeatureEnabled('hasTournamentAnnouncer'), true);
  assert.equal(game.mechanisms.isFeatureEnabled('hasTrainingSites'), true);
  assert.equal(game.mechanisms.isFeatureEnabled('hasDungeonCombatMode'), true);
});

test('ESC Pause menu contains Back to Main button to return to initial page', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
  const pauseMenuSection = html.slice(html.indexOf('id="pause-menu"'), html.indexOf('id="designed-worlds-modal"'));

  assert.ok(pauseMenuSection.includes('id="btn-title-screen"'), 'Pause menu has Back to Main button element');
  assert.match(pauseMenuSection, />\s*Back to Main\s*</, 'Button text is "Back to Main"');
});

