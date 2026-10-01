import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';

function createMockWorld() {
  return {
    getVoxel: () => 0, // Air
    water: null
  };
}

function createMockPlayer() {
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000);
  const domElement = {
    addEventListener: () => {},
    removeEventListener: () => {},
    requestPointerLock: () => {}
  };
  const world = createMockWorld();
  const sounds = {
    playStep: () => {},
    playPunch: () => {}
  };

  const player = new Player(camera, domElement, world, sounds);
  return player;
}

test('Player areControlsDisabled detects agent terminal, chat, and modal states', () => {
  const player = createMockPlayer();

  // Initially controls enabled
  assert.strictEqual(player.areControlsDisabled(), false);

  // Explicit flag
  player.controlsDisabled = true;
  assert.strictEqual(player.areControlsDisabled(), true);
  player.controlsDisabled = false;
  assert.strictEqual(player.areControlsDisabled(), false);

  // Mock UI attached to player
  const mockUI = {
    isChatOpen: false,
    isGeminiOpen: () => false,
    isModalOpen: () => false
  };
  player.ui = mockUI;

  assert.strictEqual(player.areControlsDisabled(), false);

  // Chat open
  mockUI.isChatOpen = true;
  assert.strictEqual(player.areControlsDisabled(), true);
  mockUI.isChatOpen = false;

  // Agent terminal (Gemini) open
  let geminiOpen = true;
  mockUI.isGeminiOpen = () => geminiOpen;
  assert.strictEqual(player.areControlsDisabled(), true);
  geminiOpen = false;
  assert.strictEqual(player.areControlsDisabled(), false);

  // Other modal open
  let modalOpen = true;
  mockUI.isModalOpen = () => modalOpen;
  assert.strictEqual(player.areControlsDisabled(), true);
  modalOpen = false;
  assert.strictEqual(player.areControlsDisabled(), false);

  // Event with input or textarea target
  const inputEvent = { target: { tagName: 'INPUT' } };
  assert.strictEqual(player.areControlsDisabled(inputEvent), true);

  const textareaEvent = { target: { tagName: 'TEXTAREA' } };
  assert.strictEqual(player.areControlsDisabled(textareaEvent), true);

  const normalEvent = { target: { tagName: 'CANVAS' } };
  assert.strictEqual(player.areControlsDisabled(normalEvent), false);
});

test('Player movement update ignores WASD and does not move when controls are disabled', () => {
  const player = createMockPlayer();
  player.position.set(0, 10, 0);
  player.velocity.set(0, 0, 0);
  player.onGround = true;

  // Simulate W key held down when controls are ENABLED
  player.keys['KeyW'] = true;
  player.update(0.1);

  // Player should have accelerated forward (non-zero velocity)
  const initialSpeed = Math.sqrt(player.velocity.x * player.velocity.x + player.velocity.z * player.velocity.z);
  assert.ok(initialSpeed > 0, 'Player should move forward when W is pressed and controls enabled');

  // Now simulate opening the Agent Terminal
  player.ui = {
    isChatOpen: false,
    isGeminiOpen: () => true,
    isModalOpen: () => false
  };

  // Re-simulate pressing A/W/S/D
  player.keys['KeyW'] = true;
  player.keys['KeyD'] = true;
  player.keys['Space'] = true;

  // Update loop runs during terminal open
  player.update(0.1);

  // Keys should have been cleared
  assert.deepStrictEqual(player.keys, {});

  // Update multiple ticks: horizontal velocity must decelerate to 0
  for (let i = 0; i < 20; i++) {
    player.update(0.1);
  }

  assert.strictEqual(player.velocity.x, 0);
  assert.strictEqual(player.velocity.z, 0);
});

test('Player skills (punch, dodge roll, jump) cannot be triggered while controls are disabled', () => {
  const player = createMockPlayer();
  player.ui = {
    isChatOpen: false,
    isGeminiOpen: () => true,
    isModalOpen: () => false
  };

  const punchResult = player.triggerPunch();
  assert.strictEqual(punchResult, false);
  assert.strictEqual(player.isPunching, false);

  const rollResult = player.triggerDodgeRoll();
  assert.strictEqual(rollResult, false);
  assert.strictEqual(player.isRolling, false);
});
