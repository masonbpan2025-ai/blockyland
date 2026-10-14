// Exercise the real terminal markup and UI methods without generating a world
// or making vendor API requests. Uses a fresh, isolated browser context.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const uiSource=await readFile('src/ui.js','utf8');
const fields=[...uiSource.matchAll(/this\.([a-zA-Z0-9_]+)\s*=\s*document\.getElementById\('([^']+)'\)/g)].map(m=>[m[1],m[2]]);
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-terminal-preview',optimizeDeps:{entries:['src/ui.js','src/worldAgent.js']},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/main.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.evaluate(async fields=>{
    const {UIManager}=await import('/src/ui.js'),{WorldAgent}=await import('/src/worldAgent.js');
    const ui=Object.create(UIManager.prototype);for(const [name,id] of fields)ui[name]=document.getElementById(id);
    ui.geminiVendorButtons=Array.from(document.querySelectorAll('.gemini-vendor-btn'));ui.geminiTerminalCard=document.querySelector('.gemini-terminal-card');
    ui.player={gamemode:'creative',keys:{},position:{x:0,y:20,z:0},velocity:{x:0,y:0,z:0}};
    const game={ui,player:ui.player,settings:{gameMode:'creative',cheats:true},world:{chunks:new Map(),getVoxel:()=>0},inventory:{getActiveItem:()=>null}};
    ui.game=game;ui.closeAllModals=()=>document.querySelectorAll('.game-modal').forEach(e=>e.classList.add('hidden'));ui.requestGamePointerLock=()=>{};
    document.body.style.background='radial-gradient(ellipse at top,#243146,#0b101c)';
    document.body.querySelectorAll(':scope > *').forEach(el=>{if(el.id!=='gemini-modal')el.style.display='none';});
    const agent=new WorldAgent(game);game.geminiAgent=agent;
    agent.refreshModels=async()=>{window.modelFetches++;return {models:agent.getVendorModels(),source:'built-in'};};window.modelFetches=0;
    agent.setOfflineMode(true);ui.initGemini(agent);ui.openGeminiTerminal();
    window.ui=ui;window.agent=agent;
  },fields);
  const toggle=page.locator('#gemini-offline-btn'),settings=page.locator('#gemini-toggle-key'),drawer=page.locator('#gemini-key-drawer');
  await page.waitForTimeout(250);
  assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.equal(await settings.isDisabled(),true);assert.equal(await drawer.isVisible(),false);
  assert.equal(await page.locator('#gemini-world-settings').count(),0);assert.equal(await drawer.locator('#gemini-offline-btn').count(),0);
  await page.evaluate(()=>window.ui.openAgentSettings());assert.equal(await drawer.isVisible(),false);
  await page.screenshot({path:'docs/artifacts/agent-terminal-offline.png'});
  await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(await settings.isEnabled(),true);
  await settings.click();assert.equal(await drawer.isVisible(),true);assert.equal(await settings.getAttribute('aria-expanded'),'true');assert.equal(await drawer.locator('input').first().isEnabled(),true);
  for(const vendor of ['gemini','deepseek','chatgpt','claude']){
    await page.locator(`[data-vendor="${vendor}"]`).click();assert.equal(await page.evaluate(()=>window.agent.vendor),vendor);
    await page.locator('#gemini-key-input').fill(`test-${vendor}-key`);await page.locator('#gemini-save-key-btn').click();await settings.click();
  }
  await page.screenshot({path:'docs/artifacts/agent-terminal-online-settings.png'});
  const before=await page.evaluate(()=>({vendor:window.agent.vendor,model:window.agent.model,keys:['gemini','deepseek','chatgpt','claude'].map(v=>window.agent.getApiKey(v)),fetches:window.modelFetches}));
  await toggle.click();assert.equal(await drawer.isVisible(),false);assert.equal(await settings.isDisabled(),true);
  const locked=await page.evaluate(async()=>{
    const ui=window.ui;ui.geminiKeyInput.value='replaced';ui.geminiSaveKeyBtn.onclick();ui.geminiClearKeyBtn.onclick();ui.geminiVendorButtons[0].onclick();ui.geminiModelSelect.value='fake';ui.geminiModelSelect.onchange();await ui.refreshLiveModels({force:true});
    return {vendor:window.agent.vendor,model:window.agent.model,keys:['gemini','deepseek','chatgpt','claude'].map(v=>window.agent.getApiKey(v)),fetches:window.modelFetches};
  });assert.deepEqual(locked,before,'offline settings cannot change or fetch models');
  await page.evaluate(()=>{window.agent.setOfflineMode(false);window.ui.openAgentSettings();});assert.equal(await settings.isEnabled(),true);assert.equal(await drawer.isVisible(),true);
  await page.evaluate(async()=>{const {runCommand,buildCommandContext}=await import('/src/commandRunner.js');runCommand(buildCommandContext(window.ui.game),'/offline');});assert.equal(await toggle.getAttribute('aria-checked'),'true');assert.equal(await settings.isDisabled(),true);assert.equal(await drawer.isVisible(),false);
  const persisted=await page.evaluate(async()=>{const {WorldAgent}=await import('/src/worldAgent.js');const fresh=new WorldAgent(window.ui.game);return {offline:fresh.offlineMode,keys:['gemini','deepseek','chatgpt','claude'].map(v=>fresh.getApiKey(v))};});assert.equal(persisted.offline,true);assert.deepEqual(persisted.keys,before.keys);
  await toggle.focus();await page.keyboard.press('Space');assert.equal(await toggle.getAttribute('aria-checked'),'false');await settings.click();
  await page.setViewportSize({width:600,height:850});await page.screenshot({path:'docs/artifacts/agent-terminal-compact.png'});
  const layout=await page.evaluate(()=>{const card=document.querySelector('.gemini-terminal-card'),actions=document.querySelector('.gemini-header-actions'),c=card.getBoundingClientRect(),a=actions.getBoundingClientRect();return {width:innerWidth,right:c.right,actionsRight:a.right,scrollWidth:document.documentElement.scrollWidth};});
  assert.ok(layout.right<=layout.width+1&&layout.actionsRight<=layout.width+1&&layout.scrollWidth<=layout.width+1,'compact layout stays on screen');
  await page.setViewportSize({width:1280,height:900});
  await page.evaluate(async()=>{
    const {createPackStore}=await import('/src/dataPackStore.js');window.ui.game.dataPacks=createPackStore();window.ui.bindDataPackPanel();
    window.ui.geminiModal.classList.add('hidden');window.ui.pauseModal.style.display='';window.ui.pauseModal.classList.remove('hidden');window.ui.refreshPauseMenuLabels();
  });
  await page.locator('#pause-datapacks > summary').click();
  assert.equal(await page.locator('#datapack-list').isVisible(),true);assert.ok((await page.locator('#datapack-list').textContent()).includes('No data packs'));
  assert.equal(await page.locator('#gemini-key-drawer #datapack-list').count(),0);
  await page.screenshot({path:'docs/artifacts/agent-terminal-pause-data-packs.png'});
  await page.evaluate(()=>{window.ui.game.settings={gameMode:'survival',cheats:false};window.ui.refreshPauseMenuLabels();});
  assert.equal(await page.locator('#pause-datapacks').isVisible(),false);
  assert.deepEqual(errors,[]);
  // No key contents are written to logs or artifacts.
  const report={checks:['offline lock','header switch','all four vendors','saved keys retained','programmatic handlers locked','no offline model fetch','external /offline sync','persisted mode','keyboard toggle','compact layout','data packs in pause menu','data pack permission gate'],layout,errors};
  await writeFile('docs/artifacts/agent-terminal-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
