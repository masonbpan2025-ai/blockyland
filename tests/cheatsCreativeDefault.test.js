// Cheats are ON by default in Creative.
//
// The game starts from Survival settings, so `cheats` is already `false` before any world exists, and that
// `false` used to be carried into every Creative world, into Building Studio and through a switch to Creative.
// The "cheats default from the mode" rule in normaliseSettings never ran because the field was never missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseSettings, settingsWith } from '../src/sessionSettings.js';

test('entering Creative turns cheats on, unless the same change says off', () => {
  const startUp = normaliseSettings({});
  assert.equal(startUp.cheats, false);
  assert.equal(settingsWith(startUp, { gameMode: 'creative' }).cheats, true);
  assert.equal(settingsWith(startUp, { gameMode: 'creative', cheats: false }).cheats, false);
  assert.equal(settingsWith(startUp, { gameMode: 'survival' }).cheats, false, 'Survival stays off');
});

test('the player can still turn them off in Creative, and leaving Creative keeps the world\'s setting', () => {
  const creative = settingsWith(normaliseSettings({}), { gameMode: 'creative' });
  const off = settingsWith(creative, { cheats: false });
  assert.equal(settingsWith(off, { difficulty: 'hard' }).cheats, false, 'turning them off sticks');
  assert.equal(settingsWith(creative, { gameMode: 'survival' }).cheats, true, 'as in vanilla, cheats belong to the world');
});

test('a new Creative world, Building Studio and a mode switch all go through the rule', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /cheats: chosenMode === 'creative'/, 'each new world starts from its own mode, not the last world');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /applyWorldSettings\(\{ gameMode: 'creative', cheats: true \}\)/, 'Building Studio');
  assert.match(main, /settingsWith\(this\.settings, \{ gameMode: next \}\)/, 'switching mode');
  assert.match(main, /this\.settings = settingsWith\(this\.settings, raw\)/, 'world settings');
});
