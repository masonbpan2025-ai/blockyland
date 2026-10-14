import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.VOXEL_DASH_URL??'http://127.0.0.1:3108';
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
try {
  await page.goto(base,{waitUntil:'domcontentloaded'});console.log('Loaded page; waiting for base engine.');await page.waitForFunction(()=>window.game?.ui&&window.game?.player);console.log('Base engine ready.');
  await page.locator('#btn-start-designed-world').click();
  const card=page.locator('.map-save-card').filter({hasText:'Voxel Dash • Five Biomes'});await card.waitFor();await card.getByRole('button',{name:'Play World'}).click();
  await page.waitForFunction(()=>window.game.modRuntime?.state?.phase==='menu');console.log('Voxel Dash mounted.');
  const mod=page.locator('[data-game-mod="voxel_dash"]');await mod.locator('.level').first().waitFor();
  assert.equal(await mod.locator('.level').count(),5);
  await mkdir('docs/artifacts/voxel-dash',{recursive:true});
  await page.screenshot({path:'docs/artifacts/voxel-dash/menu.png'});
  for(let i=0;i<5;i++){console.log(`Testing biome ${i+1}.`);
    await mod.locator(`[data-level="${i}"]`).click();await page.waitForFunction(i=>window.game.modRuntime.state.levelIndex===i,i);
    assert.equal(await mod.locator('.level.selected').count(),1);
    await mod.locator('[data-action="start"]').click();await page.waitForFunction(()=>window.game.modRuntime.state.phase==='play');
    await page.waitForFunction(()=>window.game.modRuntime.state.x>35);await page.keyboard.press('Space');
    await page.keyboard.press('KeyP');await page.waitForFunction(()=>window.game.modRuntime.state.phase==='paused');
    if(i===1||i===4)await page.screenshot({path:`docs/artifacts/voxel-dash/biome-${i}.png`});
    const before=await page.evaluate(()=>window.game.modRuntime.state.x);await page.waitForTimeout(120);assert.equal(await page.evaluate(()=>window.game.modRuntime.state.x),before);
    await mod.locator('.dialog [data-action="pause"]').click();await page.waitForFunction(()=>window.game.modRuntime.state.phase==='play');
    await page.screenshot({path:`docs/artifacts/voxel-dash/play-${i}.png`});
    await page.waitForFunction(()=>window.game.modRuntime.state.phase==='dead');
    assert.match(await mod.locator('.dialog h2').textContent(),/One more jump/);
    await mod.locator('[data-action="menu"]').click();await page.waitForFunction(()=>window.game.modRuntime.state.phase==='menu');
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/artifacts/voxel-dash/mobile.png'});
  await mod.locator('[data-action="practice"]').click();await page.waitForFunction(()=>window.game.modRuntime.state.practice);
  await mod.locator('[data-action="start"]').click();await page.waitForFunction(()=>window.game.modRuntime.state.phase==='play');await page.keyboard.press('KeyC');await page.waitForFunction(()=>window.game.modRuntime.state.checkpoint!==null);
  await page.keyboard.press('KeyP');await page.waitForFunction(()=>window.game.modRuntime.state.phase==='paused');await mod.locator('[data-action="menu"]').click();await page.waitForFunction(()=>window.game.modRuntime.state.phase==='menu');
  await mod.locator('[data-action="exit"]').click();await page.waitForFunction(()=>!document.querySelector('[data-game-mod="voxel_dash"]'));
  assert.equal(await page.evaluate(()=>Boolean(window.game.modRuntime?.exclusiveSimulation)),false);
  assert.equal(await page.evaluate(()=>window.game.ui.startOverlay.style.display),'flex');
  assert.deepEqual(errors,[]);console.log('PASS: discovery, five biome selections, worker gameplay, controls, pause/retry, mobile, checkpoints and title-screen cleanup.');
} finally {await browser.close();}
