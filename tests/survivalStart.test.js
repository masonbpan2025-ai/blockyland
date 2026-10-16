// A new Survival world starts empty, at dawn, on the settings the player chose.
//
// Before this, "Generate New World" asked for a biome and a seed and nothing else, so there was nowhere to
// say "Survival". Every world was therefore Creative, with eight occupied hotbar slots and a diamond sword in
// storage, and `spawnVillageMobs` put villagers, an iron golem and a **pillager patrol with a raid captain**
// at fixed coordinates around the origin. The first morning a new player met was a bright afternoon with a
// raid captain in it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Inventory } from '../src/inventory.js';
import {
  normaliseSettings, normaliseGameMode, normaliseDifficulty, DEFAULT_SETTINGS, GAME_MODES, DIFFICULTIES,
  allowsShowcasePopulation, allowsAgentTerminal, isSurvival, isCreative, isPeaceful,
  startingTimeOfDay, clearsInventoryOnStart, DAY_LENGTH_SECONDS, TICKS_PER_DAY, DAWN_TIME,
} from '../src/sessionSettings.js';

// --- S1: the inventory is empty and the kit is explicit --------------------------------------------

test('a fresh inventory is completely empty', () => {
  const inv = new Inventory();
  assert.equal(inv.hotbar.filter(Boolean).length, 0, 'all nine hotbar slots');
  assert.equal(inv.storage.filter(Boolean).length, 0, 'all twenty-seven storage slots');
  assert.deepEqual(inv.armor, { head: null, chest: null, legs: null, feet: null });
  assert.equal(inv.offhand, null);
  assert.equal(inv.cursorItem, null, 'and nothing on the cursor');
  assert.equal(inv.craft2x2Result, null, 'nor a crafting preview');
  assert.equal(inv.craft3x3Result, null);
  assert.equal(inv.hotbar.length, 9, 'the hotbar still has nine slots');
  assert.equal(inv.storage.length, 27, 'and storage twenty-seven');
});

test('the showcase kit still exists, by name', () => {
  // It is not deleted, it is opt-in. The constructor used to call it unconditionally.
  const inv = new Inventory();
  inv.giveDemoKit();
  assert.equal(inv.hotbar.filter(Boolean).length, 8);
  assert.equal(inv.hotbar[1].id, 'diamond_pickaxe');
  assert.equal(inv.storage[0].id, 'diamond_sword');
  // And it can be taken away again, which is what a fresh ordinary world does.
  inv.clearAll();
  assert.equal(inv.hotbar.filter(Boolean).length + inv.storage.filter(Boolean).length, 0);
});

test('the constructor does not call the kit, and nothing else does either', () => {
  // A source guard for the specific regression: `initDefaultItems()` in the constructor is what every world
  // inherited. It is gone, and the kit is reached only by its own name.
  //
  // Comments are stripped first. The constructor's own explanation names `giveDemoKit()`, so the first
  // version of this assertion failed against correct code by matching the prose that documents the fix.
  const source = readFileSync(new URL('../src/inventory.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const constructor = code.slice(code.indexOf('constructor('), code.indexOf('clearAll()'));
  assert.equal(/giveDemoKit\(\)/.test(constructor), false, 'the constructor must not give the kit');
  assert.equal(/initDefaultItems/.test(code), false, 'and the old automatic name is gone');
  // The kit is still reachable by name, so it was moved rather than deleted.
  assert.match(code, /giveDemoKit\(\) \{/);
});

// --- S1: the settings the player chose ---------------------------------------------------------------

test('the default is an ordinary Survival world on normal difficulty', () => {
  const s = normaliseSettings();
  assert.equal(s.gameMode, 'survival');
  assert.equal(s.difficulty, 'normal');
  assert.equal(s.preset, 'ordinary');
  assert.equal(s.cheats, false, 'and cheats are off');
});

test('an unrecognised mode falls back to Survival, never to Creative', () => {
  // The old hard-coded default was Creative, so a missing or nonsense value granted flight and infinite
  // blocks. Falling back to the permissive mode is the bug; falling back to Survival is the fix.
  for (const value of [undefined, null, '', 'nonsense', 'SURVIVAL!', 42, {}, []]) {
    assert.equal(normaliseGameMode(value), 'survival', 'for ' + JSON.stringify(value));
  }
  assert.equal(normaliseGameMode('CREATIVE'), 'creative', 'and the real values still work, case-insensitively');
  assert.equal(normaliseGameMode(' survival '), 'survival');
});

test('an unrecognised difficulty falls back to normal', () => {
  for (const value of [undefined, null, '', 'impossible', 3]) {
    assert.equal(normaliseDifficulty(value), 'normal', 'for ' + JSON.stringify(value));
  }
  for (const d of DIFFICULTIES) assert.equal(normaliseDifficulty(d), d);
});

test('the four difficulties and two modes are the ones offered', () => {
  assert.deepEqual([...GAME_MODES], ['survival', 'creative', 'adventure', 'spectator']);
  assert.deepEqual([...DIFFICULTIES], ['peaceful', 'easy', 'normal', 'hard']);
  assert.equal(DEFAULT_SETTINGS.gameMode, 'survival');
});

test('Creative turns cheats on and Survival leaves them off', () => {
  // This is what makes `C` open the Agent Terminal in Creative and do nothing in Survival.
  assert.equal(allowsAgentTerminal(normaliseSettings({ gameMode: 'survival' })), false);
  assert.equal(allowsAgentTerminal(normaliseSettings({ gameMode: 'creative' })), true);
  // An explicit value wins for Survival...
  assert.equal(allowsAgentTerminal(normaliseSettings({ gameMode: 'survival', cheats: true })), true);
  assert.equal(allowsAgentTerminal(normaliseSettings({ gameMode: 'survival', cheats: false })), false);
  // ...but not for Creative: a Survival world switched to Creative keeps `cheats: false`, and switching the
  // mode is exactly how a player asks for the terminal, so it has to be there.
  assert.equal(allowsAgentTerminal(normaliseSettings({ gameMode: 'creative', cheats: false })), true);
});

test('the mode and difficulty helpers agree with the settings', () => {
  assert.equal(isSurvival({}), true);
  assert.equal(isCreative({}), false);
  assert.equal(isSurvival({ gameMode: 'creative' }), false);
  assert.equal(isCreative({ gameMode: 'creative' }), true);
  assert.equal(isPeaceful({}), false);
  assert.equal(isPeaceful({ difficulty: 'peaceful' }), true);
});

// --- S1: showcase population is opt-in ----------------------------------------------------------------

test('ordinary worlds do not run the scripted population', () => {
  assert.equal(allowsShowcasePopulation(normaliseSettings()), false);
  assert.equal(allowsShowcasePopulation(normaliseSettings({ preset: 'ordinary' })), false);
  assert.equal(allowsShowcasePopulation(normaliseSettings({ preset: 'showcase' })), true);
  // An unknown preset is ordinary, not showcase.
  assert.equal(allowsShowcasePopulation(normaliseSettings({ preset: 'nonsense' })), false);
});

test('the pillager patrol and the golem are behind that gate', () => {
  // The guard is what stops the daytime hostiles, so it has to be on the call path rather than merely
  // present. `spawnVillageMobs` refuses for an ordinary world and `populateShowcaseVillage` holds the content.
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /spawnVillageMobs\(\) \{\s*\n\s*if \(!allowsShowcasePopulation\(this\.settings\)\) return false;/,
    'spawnVillageMobs must refuse an ordinary world before it spawns anything');
  assert.match(source, /populateShowcaseVillage\(\)/, 'and the scripted content lives in its own method');
  const gate = source.indexOf('if (!allowsShowcasePopulation(this.settings)) return false;');
  const captain = source.indexOf('captain.isRaidCaptain = true;');
  assert.ok(gate > 0 && captain > gate, 'the raid captain must sit after the gate');
});

// --- S2: the clock -----------------------------------------------------------------------------------

test('a new world starts at dawn, and a day is 1200 seconds', () => {
  assert.equal(startingTimeOfDay(normaliseSettings()), DAWN_TIME);
  assert.equal(DAWN_TIME, 0, 'time 0 is dawn, not noon');
  assert.equal(DAY_LENGTH_SECONDS, 1200, '24,000 ticks at 20 ticks per second');
  assert.equal(TICKS_PER_DAY, 24000);
  assert.equal(DAY_LENGTH_SECONDS, TICKS_PER_DAY / 20);
});

test('main.js starts at dawn and runs the real day length', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /this\.worldTime = startingTimeOfDay\(DEFAULT_SETTINGS\)/);
  assert.match(source, /this\.dayLengthSeconds = DAY_LENGTH_SECONDS/);
  // The old figures were 6000 and 600. Both are wrong for Java: noon, and a day at double speed.
  //
  // Checked on the INITIAL assignment rather than anywhere in the file: `/time set day` legitimately sets
  // 6000, and a whole-file search for it fails against correct code. That was the first version of this.
  const init = source.slice(source.indexOf('// Day/Night Cycle State'), source.indexOf('this.dayLengthSeconds'));
  assert.equal(/worldTime = 6000/.test(init), false, 'the noon start is gone');
  assert.equal(/dayLengthSeconds = 600/.test(source), false, 'and the 600-second day');
});

test('the clock advances 24000 ticks in one simulated day', () => {
  // The rate main.js integrates: 24000 ticks per dayLengthSeconds of real time.
  const seconds = DAY_LENGTH_SECONDS;
  const rate = TICKS_PER_DAY / DAY_LENGTH_SECONDS;
  assert.equal(rate, 20, 'twenty ticks per second, as in Java');
  assert.equal(rate * seconds, TICKS_PER_DAY);
  // And the same elapsed time must give the same time of day whatever the frame rate.
  const simulate = (fps) => {
    let t = 0;
    const dt = 1 / fps;
    for (let i = 0; i < fps * 60; i++) t = (t + rate * dt) % TICKS_PER_DAY;
    return t;
  };
  const a = simulate(30), b = simulate(60), c = simulate(144);
  assert.ok(Math.abs(a - b) < 1e-6 && Math.abs(b - c) < 1e-6,
    `frame rate must not change the clock: ${a} ${b} ${c}`);
  assert.ok(Math.abs(a - 1200) < 1e-6, 'sixty seconds is 1200 ticks');
});

// --- S1: which start reasons clear the inventory -------------------------------------------------------

test('only a brand-new ordinary world empties the inventory', () => {
  // Loading a save must not confiscate legitimately saved gear, and a mode change preserves items.
  assert.equal(clearsInventoryOnStart('new_world'), true);
  assert.equal(clearsInventoryOnStart('load'), false);
  assert.equal(clearsInventoryOnStart('mode_change'), false);
  assert.equal(clearsInventoryOnStart('respawn'), false);
  assert.equal(clearsInventoryOnStart(undefined), false);
});

// --- S3: the mode change is one function, and it does not touch the inventory --------------------------

test('the game mode changes through exactly one entry point', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const runner = readFileSync(new URL('../src/commandRunner.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  // The setup screen, the pause-menu button and `/gamemode` all go through `setGameMode`.
  assert.match(main, /setGameMode\(mode\) \{/, 'the game owns the transition');
  // `/gamemode` was moved into `commandRunner.js` by the command refactor; it reaches the same method
  // through the context rather than writing the field, which is what this assertion is really about.
  // All four modes (gameModeRules.resolveGameMode) go through the one call.
  assert.match(runner, /context\.setGameMode\?\.\(mode\)/);
  assert.match(runner, /resolveGameMode\(parts\[1\]\)/);
  assert.equal(/gamemode\s*=\s*'/.test(runner), false,
    '/gamemode must not assign the field directly');
  assert.match(main, /this\.setGameMode\(next\)/, 'the in-game cycle goes through it');
  assert.match(ui, /this\.game\.setGameMode\(/);
  // The pause-menu button must no longer assign the field directly: that path never cleared flight.
  assert.equal(/this\.player\.gamemode = \(this\.player\.gamemode === 'survival'\)/.test(ui), false,
    'the direct assignment is gone');
});

test('entering Survival clears Creative flight and leaves items alone', () => {
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  const fn = player.slice(player.indexOf('setGameMode(mode)'), player.indexOf('hasCreativeAbilities()'));
  assert.match(fn, /this\.isFlying = false/, 'flight is cleared');
  assert.match(fn, /normaliseGameMode\(mode\)/, 'through the same normalisation as everything else');
  // The plan is explicit that a mode change preserves the inventory.
  assert.equal(/clearAll|hotbar\s*=|inventory/.test(fn), false, 'the mode change must not touch items');
});

// --- S3: middle-click cannot mint items in Survival ----------------------------------------------------

test('middle-click creates nothing in Survival and a stack in Creative', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  // Anchored on the method signature and the next method's signature, not on bare names: `dropHeldItem()` is
  // called from the event binding far earlier in the file, so searching for it gave an empty slice and the
  // assertion failed against correct code.
  const start = source.indexOf('\n  handleMiddleClick() {');
  // Anchored on the name alone: `dropHeldItem` gained a whole-stack flag for Control+Q, and pinning the
  // anchor to the old empty parameter list made this fail against correct code.
  const end = source.indexOf('\n  dropHeldItem(');
  assert.ok(start > 0 && end > start, 'the method must be found between its neighbours');
  const fn = source.slice(start, end);
  assert.match(fn, /hasCreativeAbilities/, 'it branches on the mode');
  assert.match(fn, /count: 64/, 'Creative still conjures a stack');
  // Survival must search what is owned before it can select anything, and must create nothing if it finds
  // nothing.
  assert.match(fn, /const slots = \[this\.inventory\.hotbar, this\.inventory\.storage\]/);
  assert.match(fn, /Not owned\. Vanilla does nothing/, 'and the miss case is documented as doing nothing');
  const createIndex = fn.indexOf('count: 64');
  const searchIndex = fn.indexOf('const slots =');
  assert.ok(createIndex < searchIndex, 'the Creative branch must be the earlier, exclusive one');
});

// --- the setup screen exists and is wired -------------------------------------------------------------

test('the setup screen asks for mode, and for difficulty only in Survival', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="world-mode-survival"/);
  assert.match(html, /id="world-mode-creative"/);
  assert.match(html, /id="world-difficulty-section"/);
  for (const d of DIFFICULTIES) assert.match(html, new RegExp(`id="world-difficulty-${d}"`));
  assert.match(html, /id="world-mode-hardcore"/);
  // And the handlers hide the difficulty row for Creative, and for Hardcore, which is locked to Hard.
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /bindWorldModeControls\(\)/);
  assert.match(ui, /diffSection\.style\.display = this\.selectedWorldMode === 'survival' \? '' : 'none'/);
  // Bound in the constructor, so it is live before the modal is ever opened.
  assert.match(ui, /this\.bindWorldModeControls\(\);/);
});

test('the chosen settings are applied before the world is generated', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const apply = ui.indexOf('this.game.applyWorldSettings?.({');
  const reseed = ui.indexOf('this.game.world.reseed(seedNum, biomeId);');
  const generate = ui.indexOf('await this.game.generateNewWorld();');
  assert.ok(apply > 0, 'the Create World handler applies the settings');
  assert.ok(apply < reseed && apply < generate,
    'and does so BEFORE the reseed and the generation, as the plan requires');
  assert.match(ui, /gameMode: chosenMode/, 'the mode comes from the picker');
  assert.match(ui, /difficulty: chosenDifficulty/, 'and so does the difficulty');
});

test('key C is gated on cheats, so it does nothing in ordinary Survival', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  const i = ui.indexOf("if (e.code === 'KeyC')");
  assert.ok(i > 0);
  const block = ui.slice(i, i + 420);
  assert.match(block, /this\.game\?\.allowsAgentTerminal\?\.\(\)/, 'the terminal is cheats-gated');
  assert.match(block, /allowed/, 'and the gate is part of the condition');
  // The gate must be in the same `if` as the open call, not merely computed nearby.
  assert.match(block, /if \(allowed && /, 'the key only opens it when allowed');
});
