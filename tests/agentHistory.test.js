import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { WorldAgent } from '../src/worldAgent.js';
import {
  createAgentTurnRecord,
  saveAgentTurn,
  getAgentHistory,
  getLastTurn,
  clearAgentHistory,
  formatTurnDiagnostic
} from '../src/agentHistory.js';
import { BLOCKS } from '../src/blocks.js';

// Minimal mock game engine for WorldAgent tests
function createMockGame() {
  const voxels = new Map();
  return {
    world: {
      getVoxel: (x, y, z) => voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR,
      setVoxel: (x, y, z, id) => {
        voxels.set(`${x},${y},${z}`, id);
        return true;
      }
    },
    player: {
      position: { x: 0, y: 64, z: 0 },
      yaw: 0,
      pitch: 0,
      gamemode: 'survival',
      health: 20,
      maxHealth: 20,
      hunger: 20,
      maxHunger: 20
    },
    sounds: {
      playLevelUp: () => {},
      playClick: () => {}
    },
    weather: {
      setWeather: () => {}
    },
    worldTime: 1000
  };
}


test('saveAgentTurn writes to agent_history.json and agent_history_latest.json on disk', async () => {
  const testDir = path.resolve(process.cwd(), '.test_history_tmp');
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  try {
    const turn = createAgentTurnRecord({
      turnId: 101,
      vendor: 'offline',
      vendorLabel: 'World Agent',
      prompt: 'build a stone bridge',
      offline: true
    });
    turn.recordOfflinePlan({ action: 'build', buildingType: 'bridge', material: 'stone', explanation: 'Built stone bridge' });
    turn.finalizeExecution({ status: 'completed', explanation: 'Built stone bridge' });

    await saveAgentTurn(turn, { cwd: testDir });

    // Check files on disk in test directory
    const historyPath = path.resolve(testDir, 'agent_history.json');
    const latestPath = path.resolve(testDir, 'agent_history_latest.json');
    assert.ok(fs.existsSync(historyPath), 'agent_history.json must exist');
    assert.ok(fs.existsSync(latestPath), 'agent_history_latest.json must exist');

    const latestContent = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    assert.equal(latestContent.turnId, 101);
    assert.equal(latestContent.offline, true);
    assert.equal(latestContent.prompt, 'build a stone bridge');
    assert.equal(latestContent.plan.action, 'build');
    assert.equal(latestContent.execution.status, 'completed');

    // Diagnostic formatting check
    const diagnostic = formatTurnDiagnostic(turn);
    assert.ok(diagnostic.includes('Agent Turn Diagnostic'));
    assert.ok(diagnostic.includes('World Agent'));
    assert.ok(diagnostic.includes('build a stone bridge'));
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  }
});

test('captures offline execution commands and plans', async () => {
  await clearAgentHistory();
  const game = createMockGame();
  const agent = new WorldAgent(game);

  await agent.executePrompt('/time set noon');

  const turn = await agent.getLastTurn();
  assert.equal(turn.offline, true);
  assert.equal(turn.prompt, '/time set noon');
  assert.equal(turn.plan.action, 'time');
  assert.equal(turn.execution.status, 'completed');
  assert.equal(game.worldTime, 6000);

  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'agent_history_latest.json')), 'agent_history_latest.json must exist on disk');
  const onDiskRaw = fs.readFileSync(path.resolve(process.cwd(), 'agent_history_latest.json'), 'utf8');
  const onDisk = JSON.parse(onDiskRaw);
  assert.ok(onDisk.timestamp, 'recorded turn must contain timestamp');
  assert.ok(onDisk.execution, 'recorded turn must contain execution');
});
