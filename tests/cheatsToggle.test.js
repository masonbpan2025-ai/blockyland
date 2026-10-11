// The Cheats toggle, and the permission policy it drives.
//
// Before this, `cheats` gated the Agent Terminal and the command permission check existed in
// `commandRunner.runCommand` -- but NOTHING set `gate: true`, so the check was dead code and every command
// ran in every mode. The pause menu also had no cheats control at all, so the only way to turn cheats on was
// to create a Creative world. These tests pin both halves: the toggle exists and writes the setting, and the
// setting is what actually decides.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COMMANDS, findCommand } from '../src/commands.js';
import { runCommand, permissionRefusal, HANDLED_HERE, HANDLED_ELSEWHERE } from '../src/commandRunner.js';
import { normaliseSettings, allowsAgentTerminal, DEFAULT_SETTINGS } from '../src/sessionSettings.js';

/** A command context with a recording `say`, so a refusal can be read rather than inferred. */
function context(settings) {
  const said = [];
  return {
    said,
    ctx: {
      ui: { addChatMessage: (text, kind) => said.push({ text, kind }) },
      player: {}, inventory: null, world: {}, weather: {}, entities: {}, mobs: {}, geminiAgent: null,
      settings, commands: COMMANDS, game: null,
      say: (text, kind = 'system') => said.push({ text, kind }),
      setWorldTime() {}, setGameMode() {},
    },
  };
}

const refusal = (said) => said.find(m => /do not have permission/.test(m.text));

// --- the policy table ----------------------------------------------------------------------------------

test('the commands that change the world are gated, and the ones that do not are not', () => {
  // `gate` is what makes the permission check fire. Without it on some command the check is dead code.
  const gated = COMMANDS.filter(c => c.gate === true).map(c => c.name).sort();
  assert.deepEqual(gated, ['gamemode', 'give', 'locate', 'redstone', 'setblock', 'show_mobs', 'summon', 'time', 'weather']);

  // Save-file management is level 2 in vanilla but NOT a cheat here, because `/maps` is now the only route to
  // the map loader -- the pause menu button that opened it was replaced by this toggle.
  for (const name of ['save', 'load', 'maps']) {
    const command = findCommand(name);
    assert.ok(command, name + ' exists');
    assert.equal(command.gate, undefined, name + ' must stay reachable without cheats');
  }
  // And the two that are level 0 in vanilla.
  assert.equal(findCommand('help').level, 0);
  assert.equal(findCommand('clear').level, 0);
});

test('every command carries the metadata the gate reads', () => {
  // A command with neither `level` nor a name would be dispatched but never checked, or checked but never
  // found. Both lists are asserted against the table so a new command cannot slip through.
  for (const command of COMMANDS) {
    assert.ok(command.name, 'every entry has a name');
    assert.equal(typeof command.level, 'number', command.name + ' has a level');
    if (command.gate !== undefined) assert.equal(command.gate, true, command.name + ': gate is only ever true');
  }
  for (const name of [...HANDLED_HERE, ...HANDLED_ELSEWHERE]) {
    assert.ok(findCommand(name), name + ' is dispatched but missing from the table');
  }
});

// --- what the gate does --------------------------------------------------------------------------------

test('in Survival with cheats OFF, /give is refused and says why', () => {
  const { ctx, said } = context({ gameMode: 'survival', cheats: false });
  assert.equal(runCommand(ctx, '/give @s diamond 1'), true, 'the command is claimed, so it is not run twice');
  const refused = refusal(said);
  assert.ok(refused, JSON.stringify(said));
  assert.equal(refused.kind, 'error');
  assert.match(refused.text, /needs Creative mode or cheats/);
});

test('in Survival with cheats ON, /give gets THROUGH the gate', () => {
  // The whole point of the toggle. It fails later only because this context has no inventory, which is a
  // different message -- that difference is the proof it was allowed.
  const { ctx, said } = context({ gameMode: 'survival', cheats: true });
  runCommand(ctx, '/give @s diamond 1');
  assert.equal(refusal(said), undefined, 'not refused: ' + JSON.stringify(said));
  assert.ok(said.length > 0, 'and it went on to actually do something');
});

test('Creative is allowed without cheats, because Creative IS the cheats mode', () => {
  // Note the shape: the setting is `gameMode`, and the gate used to read `gamemode`, so this exact case --
  // Creative with cheats explicitly off -- opened the Agent Terminal while refusing `/give`.
  const { ctx, said } = context({ gameMode: 'creative', cheats: false });
  runCommand(ctx, '/give @s diamond 1');
  assert.equal(refusal(said), undefined, JSON.stringify(said));
});

test('every gated command refuses in Survival without cheats', () => {
  for (const name of COMMANDS.filter(c => c.gate === true).map(c => c.name)) {
    const { ctx, said } = context({ gameMode: 'survival', cheats: false });
    // `/redstone` and the rest are handled elsewhere in the real dispatcher; here the gate runs first for the
    // ones this module owns, so only those can be asserted through `runCommand`.
    if (!HANDLED_HERE.includes(name)) continue;
    runCommand(ctx, '/' + name + ' x y z');
    assert.ok(refusal(said), name + ' should be refused, got ' + JSON.stringify(said));
  }
});

test('the ungated commands run in Survival without cheats', () => {
  // `/help` is level 0; the save-file trio returns false from here (handled by the game) rather than refusing.
  const help = context({ gameMode: 'survival', cheats: false });
  assert.equal(runCommand(help.ctx, '/help'), true);
  assert.equal(refusal(help.said), undefined, '/help must work');

  for (const name of ['save', 'load', 'maps']) {
    const { ctx, said } = context({ gameMode: 'survival', cheats: false });
    // Not ours to run, but it must NOT be refused -- a refusal returns true.
    assert.equal(runCommand(ctx, '/' + name), false, name + ' is handled elsewhere');
    assert.equal(refusal(said), undefined, name + ' must not be refused without cheats');
  }
});

// --- the gate for the commands the switch dispatches -----------------------------------------------

test('permissionRefusal covers the commands runCommand does NOT own', () => {
  // The gap this closes: `/summon`, `/locate`, `/redstone` and `/show_mobs` are dispatched by the game's own
  // switch, and `runCommand` returns false for them before reaching its internal gate -- so marking them
  // `gate: true` did nothing until `handleCommand` called this ahead of both dispatchers.
  const survival = { gameMode: 'survival', cheats: false };
  for (const root of ['/summon', '/locate', '/redstone', '/show_mobs', '/give', '/setblock', '/time', '/weather', '/gamemode']) {
    const message = permissionRefusal(survival, root);
    assert.ok(message, root + ' must be refused in Survival without cheats');
    assert.match(message, /needs Creative mode or cheats/);
  }
});

test('permissionRefusal allows everything once cheats are ON, in Survival', () => {
  // The whole point of the toggle, for the switch-dispatched commands too.
  const survival = { gameMode: 'survival', cheats: true };
  for (const root of ['/summon', '/locate', '/redstone', '/show_mobs', '/give', '/setblock', '/time', '/weather', '/gamemode']) {
    assert.equal(permissionRefusal(survival, root), null, root + ' must be allowed with cheats on');
  }
});

test('permissionRefusal never blocks the save-file commands or an unknown one', () => {
  const survival = { gameMode: 'survival', cheats: false };
  for (const root of ['/save', '/load', '/maps', '/saves', '/help', '/clear', '/offline']) {
    assert.equal(permissionRefusal(survival, root), null,
      root + ' must stay reachable: /maps is now the only route to the map loader');
  }
  // An unknown command is left for the caller to report as unknown, not as a permission error.
  assert.equal(permissionRefusal(survival, '/nosuchcommand'), null);
  assert.equal(permissionRefusal(survival, ''), null);
  // With no settings at all the safe default is to refuse, matching `allowsAgentTerminal(null) === false`.
  assert.ok(permissionRefusal(null, '/give'), 'no settings means no cheats');
});

test('Creative passes the gate without cheats, for every gated command', () => {
  const creative = { gameMode: 'creative', cheats: false };
  for (const command of COMMANDS.filter(c => c.gate === true)) {
    assert.equal(permissionRefusal(creative, '/' + command.name), null, command.name + ' in Creative');
  }
});

test('handleCommand runs the gate BEFORE both dispatchers', () => {
  // Asserted on the source, because `handleCommand` lives in a 4,000-line file that needs a DOM to import. The
  // ordering is the whole point: after `runCommand` it would miss every switch-dispatched command.
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = main.slice(main.indexOf('handleCommand(cmd) {'));
  const gate = body.indexOf('permissionRefusal(this.settings, root)');
  const portable = body.indexOf('runCommand(buildCommandContext(this), cmd)');
  const manager = body.indexOf('switch (root)');
  assert.ok(gate > 0 && portable > 0 && manager > 0, 'all three are present');
  assert.ok(gate < portable, 'the gate runs before the portable dispatcher');
  assert.ok(gate < manager, 'and before the manager switch');
  assert.match(main, /import \{ buildCommandContext, runCommand, permissionRefusal \}/);
});

// --- the setting the gate reads ------------------------------------------------------------------------

test('cheats defaults from the mode, and an explicit value survives', () => {
  assert.equal(DEFAULT_SETTINGS.cheats, false, 'the default is OFF, which is what the toggle shows');
  assert.equal(normaliseSettings({ gameMode: 'creative' }).cheats, true, 'Creative turns them on');
  assert.equal(normaliseSettings({ gameMode: 'survival' }).cheats, false);
  // An explicit value wins, in BOTH directions -- which is what lets a Survival world turn them on.
  assert.equal(normaliseSettings({ gameMode: 'survival', cheats: true }).cheats, true);
  assert.equal(normaliseSettings({ gameMode: 'creative', cheats: false }).cheats, false);
  // And switching mode later does not quietly rewrite the choice: the spread carries `cheats` through.
  const chose = normaliseSettings({ gameMode: 'survival', cheats: true });
  assert.equal(normaliseSettings({ ...chose, gameMode: 'creative' }).cheats, true);
  assert.equal(normaliseSettings({ ...chose, gameMode: 'survival' }).cheats, true);
});

test('the Agent Terminal opens when cheats are on, in Survival', () => {
  // The other half of what the toggle promises.
  assert.equal(allowsAgentTerminal({ gameMode: 'survival', cheats: false }), false,
    'an ordinary Survival world has no terminal');
  assert.equal(allowsAgentTerminal({ gameMode: 'survival', cheats: true }), true,
    'and this is what the toggle buys');
  assert.equal(allowsAgentTerminal({ gameMode: 'creative' }), true, 'Creative always has it');
  assert.equal(allowsAgentTerminal(null), false);
});

test('the terminal gate and the command gate agree', () => {
  // Two readings of one setting that must not drift: a player who can open the terminal can use /give.
  for (const settings of [
    { gameMode: 'survival', cheats: false }, { gameMode: 'survival', cheats: true },
    { gameMode: 'creative', cheats: false }, { gameMode: 'creative', cheats: true },
  ]) {
    const terminal = allowsAgentTerminal(settings);
    const { ctx, said } = context(settings);
    runCommand(ctx, '/give @s diamond 1');
    const commandAllowed = !refusal(said);
    assert.equal(commandAllowed, terminal,
      `${JSON.stringify(settings)}: terminal ${terminal} but /give ${commandAllowed}`);
  }
});

// --- the menu ------------------------------------------------------------------------------------------

test('the pause menu offers a Cheats toggle where the maps button was', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="btn-cheats"/, 'the toggle exists');
  assert.match(html, /Cheats: OFF/, 'and defaults to OFF in the markup');
  // The button it replaced is gone.
  assert.ok(!/id="btn-open-map"/.test(html), 'Load / Manage Maps was removed from the pause menu');
  // Inside the pause menu, and near the other state toggles.
  const menu = html.indexOf('id="pause-menu"');
  const cheats = html.indexOf('id="btn-cheats"');
  const end = html.indexOf('id="btn-title-screen"');
  assert.ok(menu < cheats && cheats < end, 'inside the pause menu');
  // And the map loader is still reachable by command.
  assert.ok(/name: 'maps'/.test(readFileSync(new URL('../src/commands.js', import.meta.url), 'utf8')));
});

test('the toggle writes the setting through the one authority', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /getElementById\('btn-cheats'\)/, 'it is bound');
  assert.match(ui, /applyWorldSettings\?\.\(\{ cheats: next \}\)/,
    'through applyWorldSettings, so the setting, the terminal and the commands read one value');
  assert.ok(!/btnOpenMap/.test(ui), 'and the removed button is no longer referenced at all');
  // Warned about in Survival, which is the case where it changes what the world is.
  assert.match(ui, /no longer a vanilla Survival world/);
});

test('the label is a readout of state, not of the last click', () => {
  // Cheats can also be changed from the Agent Terminal, and the mode from `/gamemode`, so a label painted only
  // on click goes stale.
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /refreshPauseMenuLabels\(\)/);
  assert.match(ui, /this\.refreshPauseMenuLabels\(\);\s*\n\s*\} else \{/, 'called when the menu opens');
  const fn = ui.slice(ui.indexOf('refreshPauseMenuLabels() {'));
  assert.match(fn.slice(0, 700), /settings\?\.cheats === true/);
  assert.match(fn.slice(0, 700), /btn-cheats/);
  assert.match(fn.slice(0, 700), /btn-gamemode/, 'and the mode label is refreshed with it');
});

test('a Creative world shows Cheats: ON without anyone clicking', () => {
  // The bug this guards: the label was only painted on click, so a Creative world -- where cheats default to
  // ON -- opened the menu reading OFF.
  assert.equal(normaliseSettings({ gameMode: 'creative' }).cheats, true);
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

  // Anchor on the HANDLER, not on the lookup: `const btnCheats = document.getElementById('btn-cheats')`
  // appears in `refreshPauseMenuLabels` too, so `indexOf` finds that one first and the window misses the bind
  // site entirely -- which is exactly how this assertion failed the first time.
  const handler = ui.indexOf('btnCheats.onclick');
  assert.ok(handler > 0, 'the toggle is bound');
  const block = ui.slice(handler, handler + 2000);
  assert.match(block, /this\.refreshPauseMenuLabels\(\);/,
    'the label is painted at bind time as well as on open, so Creative reads ON immediately');
});
