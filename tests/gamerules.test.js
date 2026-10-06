// `naturalRegeneration`, and the small typed gamerule set the plan asks for.
//
// Nothing read `naturalRegeneration` at all, so natural regeneration could not be switched off. The hunger
// model regenerated unconditionally.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tickHunger, createHungerState, MAX_HUNGER } from '../src/hunger.js';
import { GAMERULE_DEFAULTS, GAMERULES, normaliseGamerules, gameruleFor }
  from '../src/sessionSettings.js';

/** A fed player at full hunger with saturation to spend, which is the fast-regeneration condition. */
function fed(over = {}) {
  const s = createHungerState();
  s.hunger = MAX_HUNGER;
  s.saturation = 5;
  return Object.assign(s, over);
}

const options = (over = {}) => ({ health: 10, maxHealth: 20, ...over });

// --- the rule ----------------------------------------------------------------------------------------

test('natural regeneration heals when the rule is on, and not when it is off', () => {
  const on = tickHunger(fed(), 1, options({ naturalRegeneration: true }));
  const off = tickHunger(fed(), 1, options({ naturalRegeneration: false }));
  assert.ok(on.heal > 0, 'the positive control: it heals by default');
  assert.equal(off.heal, 0, 'and not with the rule off');
});

test('the rule is on by default, so an existing game is unchanged', () => {
  // Omitting the option must behave as before this existed, or every existing caller silently changes.
  const omitted = tickHunger(fed(), 1, options());
  const explicit = tickHunger(fed(), 1, options({ naturalRegeneration: true }));
  assert.equal(omitted.heal, explicit.heal);
  assert.equal(GAMERULE_DEFAULTS.naturalRegeneration, true);
});

test('both regeneration rates are gated, not only the fast one', () => {
  // Food 18 with no saturation takes the slow path. Gating only the fast branch would have left a rule that
  // appeared to work at full hunger and did nothing at 18.
  const slow = fed({ hunger: 18, saturation: 0 });
  assert.ok(tickHunger(fed({ hunger: 18, saturation: 0 }), 1, options()).heal > 0, 'the slow path heals');
  assert.equal(tickHunger(slow, 1, options({ naturalRegeneration: false })).heal, 0,
    'and the rule switches it off');
});

test('starvation still runs with the rule off', () => {
  // The gamerule switches off natural regeneration, not hunger itself: a player who never eats must still
  // starve. Gating the whole model would have made it a "no hunger" switch.
  const starving = fed({ hunger: 0, saturation: 0 });
  const result = tickHunger(starving, 1, options({ naturalRegeneration: false }));
  assert.ok(result.starve > 0, 'starvation damage still accrues');
  assert.equal(result.heal, 0);
});

test('the rule does not switch off Peaceful\'s heal', () => {
  // Peaceful's heal is a difficulty property rather than the gamerule, and Java keeps it.
  const result = tickHunger(fed(), 1, options({ peaceful: true, naturalRegeneration: false }));
  assert.ok(result.heal > 0, 'Peaceful still heals');
});

// --- the gamerule set --------------------------------------------------------------------------------

test('the defaults are Java\'s, and cover the rules the game implements', () => {
  assert.deepEqual([...GAMERULES].sort(),
    ['doDaylightCycle', 'doImmediateRespawn', 'doMobSpawning', 'doWeatherCycle', 'keepInventory',
      'naturalRegeneration'].sort());
  assert.equal(GAMERULE_DEFAULTS.doMobSpawning, true);
  assert.equal(GAMERULE_DEFAULTS.doDaylightCycle, true);
  assert.equal(GAMERULE_DEFAULTS.doWeatherCycle, true);
  assert.equal(GAMERULE_DEFAULTS.keepInventory, false, 'Java defaults this off');
  assert.equal(GAMERULE_DEFAULTS.naturalRegeneration, true);
});

test('a missing or malformed rule takes the default rather than turning it off', () => {
  // A save written before a rule existed must not silently disable it.
  const filled = normaliseGamerules({});
  assert.equal(filled.naturalRegeneration, true);
  assert.equal(filled.keepInventory, false);
  // Nonsense values are replaced by the default, including a string. `'false'` is truthy and has caused more
  // bugs than it has prevented.
  const junk = normaliseGamerules({ naturalRegeneration: 'false', doMobSpawning: 0, keepInventory: null });
  assert.equal(junk.naturalRegeneration, true, 'a string is not a boolean');
  assert.equal(junk.doMobSpawning, true, 'and neither is a number');
  assert.equal(junk.keepInventory, false);
  // Real booleans are taken.
  assert.equal(normaliseGamerules({ naturalRegeneration: false }).naturalRegeneration, false);
  assert.equal(normaliseGamerules({ keepInventory: true }).keepInventory, true);
  // And a nonsensical argument does not throw.
  assert.equal(normaliseGamerules(null).naturalRegeneration, true);
  assert.equal(normaliseGamerules('nope').naturalRegeneration, true);
});

test('reading a rule tolerates a game that has none', () => {
  // Every existing game object has no `gamerules`, which is why the accessor takes a fallback.
  assert.equal(gameruleFor(undefined, 'naturalRegeneration'), true);
  assert.equal(gameruleFor({}, 'naturalRegeneration'), true);
  assert.equal(gameruleFor({ gamerules: null }, 'naturalRegeneration'), true);
  assert.equal(gameruleFor({ gamerules: {} }, 'naturalRegeneration'), true);
  assert.equal(gameruleFor({ gamerules: { naturalRegeneration: false } }, 'naturalRegeneration'), false);
  assert.equal(gameruleFor({ gamerules: { naturalRegeneration: 'no' } }, 'naturalRegeneration'), true);
  // An unknown rule name has no default, which is `undefined` rather than a crash.
  assert.equal(gameruleFor({}, 'doSomethingElse'), undefined);
});

// --- the wiring --------------------------------------------------------------------------------------

test('the player passes the rule into the hunger model', () => {
  const source = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('updateHungerModel(dt) {'));
  assert.match(fn, /naturalRegeneration: gameruleFor\(this\.game, 'naturalRegeneration'\)/,
    'the rule reaches the model');
  assert.match(source, /gameruleFor \} from '\.\/sessionSettings\.js'/, 'and it is imported');
});

test('the hunger model reads the option rather than hard-coding regeneration', () => {
  const source = readFileSync(new URL('../src/hunger.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('export function tickHunger'));
  assert.match(fn, /naturalRegeneration = true/, 'the option is declared with its default');
  assert.equal((fn.match(/if \(naturalRegeneration\)/g) || []).length, 2,
    'both regeneration branches are gated');
});

// --- where the switches live -------------------------------------------------------------------------

test('the difficulty and rule switches live in the Agent Terminal, not the pause menu', () => {
  // The terminal is the cheats surface: it opens only when cheats are on, so an ordinary Survival player
  // cannot reach these and Creative can. The plan's rule is that mode and rule changes follow the cheats
  // policy, and putting them behind the cheats-gated key is what enforces it.
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="gemini-world-settings"/, 'the panel exists');
  assert.match(html, /id="terminal-difficulty-row"/);
  assert.match(html, /id="terminal-mode-row"/);
  assert.match(html, /id="terminal-rule-row"/);
  for (const rule of ['doMobSpawning', 'doDaylightCycle', 'naturalRegeneration', 'keepInventory']) {
    assert.match(html, new RegExp(`id="terminal-rule-${rule}"`), rule + ' has a switch');
  }
  for (const d of ['peaceful', 'easy', 'normal', 'hard']) {
    assert.match(html, new RegExp(`id="terminal-difficulty-${d}"`), d + ' has a button');
  }
  // And the panel sits inside the terminal's settings drawer rather than somewhere else in the page.
  const panel = html.indexOf('id="gemini-world-settings"');
  const drawer = html.indexOf('id="gemini-key-drawer"');
  const feed = html.indexOf('id="gemini-log-feed"');
  assert.ok(drawer < panel && panel < feed, 'the panel is inside the drawer, before the log feed');
});

test('the terminal panel is bound, repainted on open, and routes through the settings authority', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /bindTerminalWorldSettings\(\) \{/);
  assert.match(ui, /this\.bindTerminalWorldSettings\(\);/, 'bound in the constructor');
  assert.match(ui, /this\.refreshTerminalWorldSettings\?\.\(\);/, 'repainted when the terminal opens');
  // A difficulty or mode change goes through `applyWorldSettings`, so the game and the player cannot
  // disagree -- the same single-authority rule the hunger model follows.
  assert.match(ui, /this\.game\?\.applyWorldSettings\?\.\(\{ difficulty: d \}\)/);
  assert.match(ui, /this\.game\?\.applyWorldSettings\?\.\(\{ gameMode: m \}\)/);
  // A rule toggle writes through the normaliser rather than poking the object directly.
  assert.match(ui, /game\.gamerules = \{ \.\.\.normaliseGamerules\(game\.gamerules\), \[name\]: next \}/);
  // And the panel must not crash on a minimal DOM, which is how the classList bug reached the suite.
  assert.match(ui, /if \(el\?\.classList\?\.toggle\) el\.classList\.toggle\('active', on\)/);
});
