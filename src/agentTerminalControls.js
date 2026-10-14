// Offline Mode is a global preference, independent of vendor keys and models.
export function syncAgentTerminalControls(ui,agent,{refreshing=false}={}) {
  const offline=!!agent?.offlineMode;
  ui.geminiOfflineBtn?.setAttribute('aria-checked',String(offline));
  if(ui.geminiOfflineState)ui.geminiOfflineState.textContent=offline?'ON':'OFF';
  if(ui.geminiToggleKeyBtn){
    ui.geminiToggleKeyBtn.disabled=offline;
    ui.geminiToggleKeyBtn.title=offline?'Switch Offline Mode off to configure AI settings.':'Choose vendor, model and API key';
  }
  if(ui.geminiKeyDrawer){
    ui.geminiKeyDrawer.disabled=offline;
    if(offline)ui.geminiKeyDrawer.classList.add('hidden');
    ui.geminiToggleKeyBtn?.setAttribute('aria-expanded',String(!ui.geminiKeyDrawer.classList.contains('hidden')));
  }
  if(ui.geminiRefreshModelsBtn)ui.geminiRefreshModelsBtn.disabled=offline||refreshing;
  return !offline;
}
