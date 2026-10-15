import test from 'node:test';
import assert from 'node:assert/strict';
import {syncAgentTerminalControls} from '../src/agentTerminalControls.js';

function element(hidden=false){
  const classes=new Set(hidden?['hidden']:[]);
  return {disabled:false,attributes:{},setAttribute(k,v){this.attributes[k]=v;},
    classList:{add(k){classes.add(k);},contains(k){return classes.has(k);},remove(k){classes.delete(k);}}};
}
function fixture(){return {geminiOfflineBtn:element(),geminiOfflineState:{textContent:''},geminiToggleKeyBtn:element(),geminiKeyDrawer:element(),geminiRefreshModelsBtn:element()};}
test('Offline Mode locks all AI controls and closes an already open drawer',()=>{const ui=fixture();assert.equal(syncAgentTerminalControls(ui,{offlineMode:true}),false);assert.equal(ui.geminiToggleKeyBtn.disabled,true);assert.equal(ui.geminiKeyDrawer.disabled,true);assert.ok(ui.geminiKeyDrawer.classList.contains('hidden'));assert.equal(ui.geminiOfflineBtn.attributes['aria-checked'],'true');assert.equal(ui.geminiToggleKeyBtn.attributes['aria-expanded'],'false');assert.equal(ui.geminiOfflineState.textContent,'ON');});
test('turning Offline Mode off permits key configuration even when no key is saved',()=>{const ui=fixture();syncAgentTerminalControls(ui,{offlineMode:true});syncAgentTerminalControls(ui,{offlineMode:false,apiKey:''});assert.equal(ui.geminiToggleKeyBtn.disabled,false);assert.equal(ui.geminiKeyDrawer.disabled,false);assert.equal(ui.geminiOfflineState.textContent,'OFF');assert.ok(ui.geminiKeyDrawer.classList.contains('hidden'),'unlocking does not force the drawer open');});
test('the global mode controls every vendor without changing vendor credentials',()=>{for(const vendor of ['gemini','deepseek','chatgpt','claude']){const agent={vendor,apiKey:'saved-key',model:'saved-model',offlineMode:true},before=structuredClone(agent);syncAgentTerminalControls(fixture(),agent);assert.deepEqual(agent,before);}});
test('an async model-list completion cannot unlock offline configuration',()=>{const ui=fixture();syncAgentTerminalControls(ui,{offlineMode:false},{refreshing:true});assert.equal(ui.geminiRefreshModelsBtn.disabled,true);syncAgentTerminalControls(ui,{offlineMode:true});assert.equal(ui.geminiRefreshModelsBtn.disabled,true);assert.equal(ui.geminiKeyDrawer.disabled,true);});
test('drawer accessibility state reflects the visible panel when online',()=>{const ui=fixture();syncAgentTerminalControls(ui,{offlineMode:false});assert.equal(ui.geminiToggleKeyBtn.attributes['aria-expanded'],'true');ui.geminiKeyDrawer.classList.add('hidden');syncAgentTerminalControls(ui,{offlineMode:false});assert.equal(ui.geminiToggleKeyBtn.attributes['aria-expanded'],'false');});
test('partial UI construction is safe',()=>{assert.equal(syncAgentTerminalControls({},null),true);assert.equal(syncAgentTerminalControls({}, {offlineMode:true}),false);});
test('closing settings through Offline Mode clears draft keys and passphrases',()=>{
  const ui=fixture();ui.geminiKeyInput={value:'draft-key'};ui.geminiVaultPassphrase={value:'draft-passphrase'};
  syncAgentTerminalControls(ui,{offlineMode:true});assert.equal(ui.geminiKeyInput.value,'');assert.equal(ui.geminiVaultPassphrase.value,'');
});
