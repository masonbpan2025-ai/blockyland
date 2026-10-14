import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.setDefaultTimeout(45000);
try {
  await page.goto(process.env.MOD_INSPECTOR_URL??'http://127.0.0.1:3100',{waitUntil:'domcontentloaded'});
  console.log('Page loaded');
  await page.waitForFunction(()=>window.game?.mobs&&window.game?.player&&window.game?.mesher);console.log('Engine ready');
  if(process.env.MOD_USE_PICKER==='1'){
    await page.locator('#btn-start-designed-world').click();
    await page.locator('#designed-worlds-modal .map-save-card').filter({hasText:'Rescue Adventure'}).getByRole('button',{name:'Play World'}).click();
  }else{
  await page.evaluate(async()=>{
    const {deserializeWorldAsync}=await import('/src/mapManager.js');
    const map=await(await fetch('/src/mods/rescue-adventure/maps/Rescue_Adventure.json')).json();
    await deserializeWorldAsync(window.game,map);
  });
  }
  console.log('World deserialized');
  const ui=page.locator('[data-game-mod="rescue_adventure"]');
  await page.waitForFunction(()=>window.game.modRuntime?.state?.phase==='mode');
  console.log('Worker and campaign ready');
  assert.match(await ui.locator('#solo-mode').textContent(),/1 PLAYER/);
  assert.match(await ui.locator('#difficulty-normal').textContent(),/NORMAL/);
  assert.equal(await ui.locator('#cancel').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.pointerLockElement!==null),false,'Campaign menus must not lock the mouse');
  assert.equal(await page.evaluate(()=>window.game.player.controlsDisabled),true,'Base controls remain disabled after closing the loader modal');
  await ui.locator('#go').click();console.log('Begin clicked');
  await page.waitForFunction(()=>window.game.modRuntime.state.phase==='intro');
  for(let i=0;i<4;i++){await ui.locator('#story-next').click();console.log('Story step',i);}
  await page.waitForFunction(()=>window.game.modRuntime.state.phase==='play');
  const before=await page.evaluate(()=>window.game.modRuntime.state.players[0].x);
  await page.keyboard.down('d');await page.waitForTimeout(800);await page.keyboard.up('d');
  const after=await page.evaluate(()=>window.game.modRuntime.state.players[0].x);
  assert.ok(after-before>2,`Mason moved ${after-before}`);
  await ui.locator('[data-session="save"]').click();
  await page.waitForFunction(()=>localStorage.getItem('rescue_adventure:save'));
  await ui.locator('[data-session="load"]').click();
  await page.waitForFunction(()=>window.game.modRuntime.state.phase==='play');
  if(process.env.RESCUE_SCREENSHOT)await page.screenshot({path:process.env.RESCUE_SCREENSHOT});
  console.log(JSON.stringify(await page.evaluate(()=>({phase:window.game.modRuntime.state.phase,players:window.game.modRuntime.state.players,chunks:window.game.world.chunks.size,toast:document.querySelector('[data-game-mod]').shadowRoot.getElementById('toast').textContent}))));
  // Two real browser views share one server authority, with independently owned inputs.
  await ui.locator('[data-session="host"]').click();
  await page.waitForFunction(()=>window.game.modRuntime.session.room);
  const room=await page.evaluate(()=>window.game.modRuntime.session.room);
  const guest=await browser.newPage({viewport:{width:1280,height:800}});guest.setDefaultTimeout(45000);guest.on('pageerror',e=>errors.push(e.message));
  await guest.goto(process.env.MOD_INSPECTOR_URL??'http://127.0.0.1:3100',{waitUntil:'domcontentloaded'});
  await guest.waitForFunction(()=>window.game?.mobs&&window.game?.player&&window.game?.mesher);
  await guest.evaluate(async()=>{const {deserializeWorldAsync}=await import('/src/mapManager.js');const map=await(await fetch('/src/mods/rescue-adventure/maps/Rescue_Adventure.json')).json();await deserializeWorldAsync(window.game,map);});
  await guest.waitForFunction(()=>window.game.modRuntime?.state?.phase==='mode');
  guest.once('dialog',dialog=>dialog.accept(room));await guest.locator('[data-game-mod] [data-session="join"]').click();
  await guest.waitForFunction(()=>window.game.modRuntime.session.slot===1&&window.game.modRuntime.session.room);
  await ui.locator('#go').click();for(let i=0;i<4;i++)await ui.locator('#story-next').click();
  await guest.waitForFunction(()=>window.game.modRuntime.state.phase==='play');
  const initial=await guest.evaluate(()=>window.game.modRuntime.state.players.map(p=>p.x));
  await guest.keyboard.down('ArrowRight');await guest.waitForFunction(x=>window.game.modRuntime.state.players[1].x>x+1,initial[1]);await guest.keyboard.up('ArrowRight');
  const moved=await guest.evaluate(()=>window.game.modRuntime.state.players.map(p=>p.x));
  assert.ok(moved[1]-initial[1]>1,'Online Jayden must move');assert.ok(Math.abs(moved[0]-initial[0])<.01,'Guest input must not move Mason');
  await guest.close();
  await page.evaluate(async()=>{const {deserializeWorldAsync}=await import('/src/mapManager.js');await deserializeWorldAsync(window.game,{worldType:'generated',mechanism:'default',seed:52,chunks:[],player:{position:{x:0,y:50,z:0}}});});
  assert.equal(await ui.count(),0);
  assert.equal(await page.evaluate(()=>Boolean(window.game.modRuntime)),false);
  assert.deepEqual(errors,[]);
  console.log('PASS Rescue browser: menus, story, engine terrain, local save/resume, two-client co-op and teardown.');
} catch(error){
  console.log('Failure state',await page.evaluate(()=>({phase:window.game?.modRuntime?.state?.phase,life:window.game?.lifecycle,pointerLocked:Boolean(document.pointerLockElement)})));
  if(process.env.RESCUE_SCREENSHOT)await page.screenshot({path:process.env.RESCUE_SCREENSHOT.replace(/\.png$/,'-failure.png')});
  throw error;
} finally {await browser.close();}
