// The game no longer calls AI vendors itself, so the API keys and vendor settings older versions saved in the browser
// are wiped, while Agent Control's own settings and the turn history stay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { forgetOldAgentKeys, isOldAgentKey } from '../src/agentControl/forgetOldKeys.js';

function storage(entries) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null,
    removeItem: k => map.delete(k),
    keys: () => [...map.keys()].sort(),
  };
}

test('old keys and vendor settings are wiped; Agent Control and history settings stay', () => {
  const store = storage({
    gemini_api_key: 'AIza-old-plain-key',
    mc_agent_key_deepseek: 'sk-plain',
    mc_agent_vault_claude: '{"ciphertext":"..."}',
    mc_agent_vendor: 'claude',
    mc_agent_model_claude: 'claude-opus',
    mc_agent_effort_claude: 'high',
    mc_agent_models_gemini: '[]',
    mc_agent_autoupgrade_chatgpt: '1',
    mc_agent_offline: '1',
    mc_agent_show_thinking: '0',
    mc_agent_control: '1',
    mc_agent_capture_view: '0',
    mc_agent_history: '[]',
    mc_agent_history_latest: '{}',
    mc_settings: '{}',
  });
  const removed = forgetOldAgentKeys(store);
  assert.equal(removed.length, 10);
  assert.deepEqual(store.keys(), ['mc_agent_capture_view', 'mc_agent_control', 'mc_agent_history', 'mc_agent_history_latest', 'mc_settings']);
  assert.deepEqual(forgetOldAgentKeys(store), [], 'running again finds nothing');
});

test('names are matched exactly or by their old prefixes only', () => {
  assert.equal(isOldAgentKey('mc_agent_control'), false);
  assert.equal(isOldAgentKey('mc_agent_capture_view'), false);
  assert.equal(isOldAgentKey('mc_agent_history'), false);
  assert.equal(isOldAgentKey('mc_agent_vault_gemini'), true);
  assert.equal(isOldAgentKey('gemini_api_key'), true);
});

test('no storage, or blocked storage, is not an error', () => {
  assert.deepEqual(forgetOldAgentKeys(null), []);
  const blocked = { get length() { throw new Error('SecurityError'); } };
  assert.deepEqual(forgetOldAgentKeys(blocked), []);
});
