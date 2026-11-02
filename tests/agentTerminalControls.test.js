import test from 'node:test';
import assert from 'node:assert/strict';
import { syncAgentTerminalControls } from '../src/agentTerminalControls.js';

function element(hidden = false) {
  const classes = new Set(hidden ? ['hidden'] : []);
  return {
    disabled: false, attributes: {}, title: '',
    setAttribute(k, v) { this.attributes[k] = v; },
    classList: { add(k) { classes.add(k); }, contains(k) { return classes.has(k); }, remove(k) { classes.delete(k); } },
  };
}
const fixture = () => ({
  geminiOfflineBtn: element(), geminiOfflineState: { textContent: '' },
  agentConnectBtn: element(), agentConnectDrawer: element(),
});

test('Offline Mode locks Connect AI and closes an open panel', () => {
  const ui = fixture();
  assert.equal(syncAgentTerminalControls(ui, { aiMode: false }), false);
  assert.equal(ui.agentConnectBtn.disabled, true);
  assert.equal(ui.agentConnectDrawer.disabled, true);
  assert.ok(ui.agentConnectDrawer.classList.contains('hidden'));
  assert.equal(ui.geminiOfflineBtn.attributes['aria-checked'], 'true');
  assert.equal(ui.geminiOfflineState.textContent, 'ON');
  assert.equal(ui.agentConnectBtn.attributes['aria-expanded'], 'false');
});

test('AI-app mode unlocks Connect AI without forcing the panel open', () => {
  const ui = fixture();
  syncAgentTerminalControls(ui, { aiMode: false });
  assert.equal(syncAgentTerminalControls(ui, { aiMode: true }), true);
  assert.equal(ui.agentConnectBtn.disabled, false);
  assert.equal(ui.agentConnectDrawer.disabled, false);
  assert.equal(ui.geminiOfflineState.textContent, 'OFF');
  assert.ok(ui.agentConnectDrawer.classList.contains('hidden'));
});

test('the panel button reports whether the panel is open', () => {
  const ui = fixture();
  syncAgentTerminalControls(ui, { aiMode: true });
  assert.equal(ui.agentConnectBtn.attributes['aria-expanded'], 'true');
  ui.agentConnectDrawer.classList.add('hidden');
  syncAgentTerminalControls(ui, { aiMode: true });
  assert.equal(ui.agentConnectBtn.attributes['aria-expanded'], 'false');
});

test('a partly built UI is safe, and the default is offline', () => {
  assert.equal(syncAgentTerminalControls({}), false);
  assert.equal(syncAgentTerminalControls({}, { aiMode: true }), true);
});
