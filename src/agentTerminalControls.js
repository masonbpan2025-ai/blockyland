// The Agent Terminal has two modes. Offline Mode ON: the built-in presets answer. OFF: the player's own AI app answers
// through Agent Control (src/agentControl/), set up in the Connect AI panel. The panel is locked while offline.
export function syncAgentTerminalControls(ui, { aiMode = false } = {}) {
  const offline = !aiMode;
  ui.geminiOfflineBtn?.setAttribute('aria-checked', String(offline));
  if (ui.geminiOfflineState) ui.geminiOfflineState.textContent = offline ? 'ON' : 'OFF';
  if (ui.agentConnectBtn) {
    ui.agentConnectBtn.disabled = offline;
    ui.agentConnectBtn.title = offline ? 'Switch Offline Mode off to connect your AI app.' : 'Connect your AI app';
  }
  if (ui.agentConnectDrawer) {
    ui.agentConnectDrawer.disabled = offline;
    if (offline) {
      ui.agentConnectDrawer.classList.add('hidden');
      // In Building Studio a hidden panel means the terminal goes back to its small docked spot.
      ui.setStudioPanelExpanded?.(false);
    }
    ui.agentConnectBtn?.setAttribute('aria-expanded', String(!ui.agentConnectDrawer.classList.contains('hidden')));
  }
  return !offline;
}
