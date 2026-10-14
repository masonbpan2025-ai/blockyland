import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.FISHING_INSPECTOR_URL ?? 'http://127.0.0.1:3000';
const output = path.resolve('test-results/fishing'); await mkdir(output,{recursive:true});
const browser = await chromium.launch({ headless:true, channel:'msedge' });
const page = await browser.newPage({ viewport:{width:1280,height:800} });
const errors=[];
// Other agents can edit this shared checkout. Disable Vite's live reload for
// this test page so an unrelated edit cannot restart a cast midway through.
await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export {};'}));
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error' && !m.text().includes('favicon'))errors.push(m.text());});
try {
  await page.goto(`${base}/fishing-debug.html`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.fishingDebug);
  await page.evaluate(()=>{window.fishingDebug.paused=true;window.fishingDebug.reset();});
  await page.locator('#showcase').click();
  const flight=await page.evaluate(()=>{const d=window.fishingDebug;d.advance(0.1);d.render();return {state:d.fishing.state,position:d.fishing.bobber.position.toArray()};});
  assert.equal(flight.state,'casting');await page.screenshot({path:path.join(output,'cast.png')});
  const approach=await page.evaluate(()=>{const d=window.fishingDebug;for(let i=0;i<600&&d.fishing.state!=='approaching';i++)d.advance(1/60);for(let i=0;i<12;i++)d.advance(1/60);d.render();return{state:d.fishing.state,ripples:d.fishing.effects.particles.length};});
  assert.equal(approach.state,'approaching');assert.ok(approach.ripples>0);await page.screenshot({path:path.join(output,'approach.png')});
  const bite=await page.evaluate(()=>{const d=window.fishingDebug;for(let i=0;i<300&&d.fishing.state!=='biting';i++)d.advance(1/60);const p=d.fishing.bobber.position;d.setView([p.x+2,p.y+2,p.z+3],p.toArray());d.advance(0.05);d.render();return {state:d.fishing.state,waterY:d.fishing.surfaceY,bobberY:d.fishing.bobber.position.y,splashes:d.game.splashes};});
  assert.equal(bite.state,'biting');assert.ok(bite.bobberY<bite.waterY-0.2);assert.ok(bite.splashes>=2);
  await page.screenshot({path:path.join(output,'bite.png')});
  const catchResult=await page.evaluate(()=>{const d=window.fishingDebug;for(let i=0;i<240;i++)d.advance(1/60);d.render();return{state:d.fishing.state,catches:d.game.catches,durability:d.fishing.rod().durability,drops:d.game.entities.droppedItems.length};});
  assert.equal(catchResult.state,'idle');assert.equal(catchResult.catches,1);assert.equal(catchResult.durability,63);assert.equal(catchResult.drops,0);
  await page.screenshot({path:path.join(output,'catch.png')});
  await page.locator('#roof').check();await page.locator('#cast').click();
  const roof=await page.evaluate(()=>{const d=window.fishingDebug;for(let i=0;i<300&&d.fishing.state==='casting';i++)d.advance(1/60);return d.fishing.conditions();});
  assert.equal(roof.exposedToSky,false);await page.locator('#roof').uncheck();
  await page.locator('#reset').click();
  await page.locator('#wood').selectOption('oak_chest_boat');
  const chest=await page.evaluate(()=>{const d=window.fishingDebug;d.setView([6,6,1],[3,3.8,-3]);d.render();return {parts:!!d.boat.mesh.getObjectByName('chest-latch'),height:d.boat.position.y,slots:d.boat.chestItems.length};});
  assert.equal(chest.parts,true);assert.equal(chest.slots,27);assert.ok(chest.height>3.7);await page.screenshot({path:path.join(output,'chest-boat.png')});
  await page.locator('#wood').selectOption('oak_boat');await page.locator('#row').click();
  const motion=await page.evaluate(()=>{const d=window.fishingDebug;const start=d.boat.position.clone();for(let i=0;i<120;i++)d.advance(1/60);const p=d.boat.position;d.setView([p.x+3,p.y+3,p.z+5],p.toArray());d.render();return{distance:d.boat.position.distanceTo(start),height:d.boat.position.y,oar:d.boat.leftOar.rotation.y};});
  assert.ok(motion.distance>1);assert.ok(motion.height>3.7);assert.ok(Math.abs(motion.oar)>0.001);
  await page.screenshot({path:path.join(output,'rowing.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({flight,approach,bite,catchResult,roof,chest,motion,screenshots:output},null,2));
} finally {await browser.close();}
