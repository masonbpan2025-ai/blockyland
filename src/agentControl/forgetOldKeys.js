// The Agent Terminal used to call AI vendors itself with the player's API key, kept in browser storage (plainly in
// early versions, later encrypted). Agent Control replaced that: the player's own AI app answers, and the game holds
// no key. This wipes what the old versions left behind, so no key outlives the feature that used it.

/** Exact names and prefixes the old vendor settings used. Agent Control's own keys are not among them. */
const OLD_NAMES = ['gemini_api_key', 'mc_agent_vendor', 'mc_agent_offline', 'mc_agent_show_thinking'];
const OLD_PREFIXES = ['mc_agent_key_', 'mc_agent_vault_', 'mc_agent_model_', 'mc_agent_models_', 'mc_agent_effort_', 'mc_agent_autoupgrade_'];

export function isOldAgentKey(name) {
  return OLD_NAMES.includes(name) || OLD_PREFIXES.some(prefix => name.startsWith(prefix));
}

/** Remove every old vendor setting and key from a Storage. Returns the names removed. */
export function forgetOldAgentKeys(store = (() => { try { return globalThis.localStorage; } catch { return null; } })()) {
  if (!store) return [];
  const removed = [];
  try {
    for (let i = store.length - 1; i >= 0; i--) {
      const name = store.key(i);
      if (name && isOldAgentKey(name)) removed.push(name);
    }
    for (const name of removed) store.removeItem(name);
  } catch {
    // Storage blocked: nothing could have been saved there either.
  }
  return removed;
}
