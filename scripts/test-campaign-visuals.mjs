import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.setDefaultTimeout(90000);
const base=process.env.MOD_INSPECTOR_URL??'http://127.0.0.1:3105';
try{
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.game?.ui&&window.game?.mesher&&window.game?.player);
  const baseline=await page.evaluate(()=>{const g=window.game;return{tone:g.renderer.toneMapping,exposure:g.renderer.toneMappingExposure,shadowType:g.renderer.shadowMap.type,pixelRatio:g.renderer.getPixelRatio(),ambient:g.ambientLight.visible};});
  await page.evaluate(async()=>{const {deserializeWorldAsync}=await import('/src/mapManager.js');const map=await(await fetch('/src/mods/rescue-adventure/maps/Rescue_Adventure.json')).json();await deserializeWorldAsync(window.game,map);});
  const ui=page.locator('[data-game-mod]');await page.waitForFunction(()=>window.game.modRuntime?.state?.phase==='mode');await ui.locator('#go').click();for(let i=0;i<4;i++)await ui.locator('#story-next').click();await page.waitForFunction(()=>window.game.modRuntime.state.phase==='play');
  const pixels=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),g=window.game,runtime=g.modRuntime,hero=runtime.state.players[0];runtime.update(.1);runtime.render();
    const gl=g.renderer.getContext(),size=g.renderer.getDrawingBufferSize(new T.Vector2());
    const sample=(x,z)=>{const p=new T.Vector3(x,20.95,z).project(runtime.camera),rgba=new Uint8Array(4);gl.readPixels(Math.round((p.x*.5+.5)*size.x),Math.round((p.y*.5+.5)*size.y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);return [...rgba];};
    return {near:sample(hero.x+2,hero.z+2),far:sample(hero.x+26,hero.z),maskNear:runtime.presentation.sight.amount(hero.x,hero.z),maskFar:runtime.presentation.sight.amount(hero.x+26,hero.z),shadow:g.modRuntime.presentation.sun.castShadow,samples:runtime.presentation.composer.renderTarget1.samples};
  });
  console.log(JSON.stringify(pixels));assert.ok(pixels.near.slice(0,3).reduce((a,b)=>a+b)>60);assert.ok(pixels.far.slice(0,3).every(v=>v<=2),'Distant world pixels must fade to black');assert.equal(pixels.maskNear,1);assert.equal(pixels.maskFar,0);assert.equal(pixels.shadow,true);assert.equal(pixels.samples,4);
  if(process.env.RESCUE_SCREENSHOT)await page.screenshot({path:process.env.RESCUE_SCREENSHOT});
  await page.evaluate(async()=>{const {deserializeWorldAsync}=await import('/src/mapManager.js');await deserializeWorldAsync(window.game,{worldType:'generated',mechanism:'default',seed:52,chunks:[],player:{position:{x:0,y:50,z:0}}});});
  const restored=await page.evaluate(()=>{const g=window.game;return{tone:g.renderer.toneMapping,exposure:g.renderer.toneMappingExposure,shadowType:g.renderer.shadowMap.type,pixelRatio:g.renderer.getPixelRatio(),ambient:g.ambientLight.visible};});
  assert.deepEqual(restored,baseline);assert.deepEqual(errors,[]);console.log('PASS: GPU sight boundary, MSAA, shadows, and base renderer restoration.');
}finally{await browser.close();}
