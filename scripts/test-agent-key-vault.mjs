// Real terminal controls + browser Web Crypto. All credentials are fake; no vendor network calls.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile('src/ui.js','utf8');
const fields=[...source.matchAll(/this\.([a-zA-Z0-9_]+)\s*=\s*document\.getElementById\('([^']+)'\)/g)].map(m=>[m[1],m[2]]);
const server=await createServer({configFile:false,cacheDir:'.cache/vault-browser-vite',optimizeDeps:{noDiscovery:true,include:['three']},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});
  const context=await browser.newContext({viewport:{width:1100,height:950}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
  // Unexpected calls must fail rather than send even a fake credential to a provider.
  const vendorCalls=[];await page.route(/https:\/\/(api\.(anthropic|openai|deepseek)\.com|generativelanguage\.googleapis\.com)\//,route=>{vendorCalls.push(route.request().url());return route.abort();});
  const bootstrap=async()=>{
    await page.evaluate(async fields=>{
      const {UIManager}=await import('/src/ui.js'),{WorldAgent}=await import('/src/worldAgent.js');
      const ui=Object.create(UIManager.prototype);for(const [name,id]of fields)ui[name]=document.getElementById(id);
      ui.geminiVendorButtons=[...document.querySelectorAll('.gemini-vendor-btn')];ui.geminiTerminalCard=document.querySelector('.gemini-terminal-card');
      ui.player={gamemode:'creative',keys:{},position:{x:0,y:20,z:0},velocity:{x:0,y:0,z:0}};
      const game={ui,player:ui.player,settings:{gameMode:'creative',cheats:true},world:{chunks:new Map(),getVoxel:()=>0},inventory:{getActiveItem:()=>null}};
      ui.game=game;ui.closeAllModals=()=>document.querySelectorAll('.game-modal').forEach(e=>e.classList.add('hidden'));ui.requestGamePointerLock=()=>{};
      document.body.querySelectorAll(':scope > *').forEach(el=>{if(el.id!=='gemini-modal')el.style.display='none';});
      const agent=new WorldAgent(game);game.geminiAgent=agent;agent.setVendor('claude');agent.setOfflineMode(false);
      window.modelFetches=0;agent.refreshModels=async()=>{window.modelFetches++;return{models:agent.getVendorModels(),source:'built-in'};};
      window.ui=ui;window.agent=agent;ui.initGemini(agent);ui.openAgentSettings();
    },fields);
  };
  const waitAction=()=>page.waitForFunction(()=>!window.ui.keyVaultBusy);
  const snapshot=()=>page.evaluate(()=>({active:!!window.agent.apiKey,status:window.agent.keyStatus(),storage:{...localStorage},fetches:window.modelFetches}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'domcontentloaded'});await bootstrap();
  assert.equal(await page.locator('#gemini-remember-key').isChecked(),false);
  await page.locator('#gemini-key-input').fill('fake-session-key');await page.locator('#gemini-save-key-btn').click();await waitAction();
  let state=await snapshot();assert.equal(state.active,true);assert.equal(state.status.remembered,false);assert.ok(!JSON.stringify(state.storage).includes('fake-session-key'));
  await page.reload({waitUntil:'domcontentloaded'});await bootstrap();state=await snapshot();assert.equal(state.active,false);
  await page.locator('#gemini-key-input').fill('fake-remembered-key');await page.locator('#gemini-remember-key').check();
  await page.locator('#gemini-vault-passphrase').fill('browser test passphrase 123');await page.locator('#gemini-save-key-btn').click();await waitAction();
  state=await snapshot();assert.equal(state.status.remembered,true);assert.equal(state.active,true);
  assert.ok(!JSON.stringify(state.storage).includes('fake-remembered-key'));assert.ok(!JSON.stringify(state.storage).includes('browser test passphrase'));
  assert.equal(await page.locator('#gemini-vault-passphrase').inputValue(),'');assert.equal(await page.locator('#gemini-key-input').inputValue(),'');
  const ciphertext=state.storage.mc_agent_vault_claude;
  await page.reload({waitUntil:'domcontentloaded'});await bootstrap();state=await snapshot();assert.equal(state.status.locked,true);assert.equal(state.fetches,0);
  assert.equal(await page.locator('#gemini-status-text').textContent(),'KEY LOCKED');
  await page.locator('#gemini-vault-passphrase').fill('incorrect passphrase');await page.locator('#gemini-unlock-key-btn').click();await waitAction();
  assert.equal((await snapshot()).active,false);assert.match(await page.locator('#gemini-key-storage-status').textContent(),/incorrect passphrase/);
  await page.locator('#gemini-vault-passphrase').fill('browser test passphrase 123');await page.locator('#gemini-unlock-key-btn').click();await waitAction();
  state=await snapshot();assert.equal(state.active,true);assert.ok(state.fetches>0);
  await page.locator('#gemini-lock-key-btn').click();state=await snapshot();assert.equal(state.active,false);assert.equal(state.storage.mc_agent_vault_claude,ciphertext);
  await page.locator('[data-vendor="gemini"]').click();assert.equal(await page.locator('#gemini-remember-key').isChecked(),false);
  await page.locator('[data-vendor="claude"]').click();assert.equal((await snapshot()).status.locked,true);
  await page.locator('#gemini-clear-key-btn').click();state=await snapshot();assert.equal(state.status.remembered,false);assert.equal(state.active,false);
  // Migrated old plaintext is deleted, explained, and never silently remembered.
  await page.evaluate(()=>localStorage.setItem('mc_agent_key_claude','fake-legacy-key'));
  await page.reload({waitUntil:'domcontentloaded'});await bootstrap();state=await snapshot();
  assert.equal(state.active,true);assert.equal(state.storage.mc_agent_key_claude,undefined);assert.equal(state.status.remembered,false);
  assert.match(await page.locator('#gemini-log-feed').textContent(),/Old unencrypted saved keys/);
  await page.reload({waitUntil:'domcontentloaded'});await bootstrap();assert.equal((await snapshot()).active,false);
  // Dismissing the terminal clears draft secrets; compact layout remains usable.
  await page.locator('#gemini-key-input').fill('fake-draft');await page.evaluate(()=>window.ui.closeGeminiTerminal());
  assert.equal(await page.locator('#gemini-key-input').inputValue(),'');await page.evaluate(()=>window.ui.openAgentSettings());
  await page.setViewportSize({width:600,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);assert.deepEqual(vendorCalls,[]);
  console.log('PASS browser vault: session-only, encrypted remember, reload locked, wrong passphrase, unlock, lock, delete, vendor isolation, migration, draft cleanup and compact layout. No provider requests.');
}finally{await browser?.close();await server.close();}
