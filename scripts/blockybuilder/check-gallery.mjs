import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { OUTPUT } from './generate.mjs';

const browser=await chromium.launch({channel:'msedge',headless:true});const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(OUTPUT,'index.html')).href);
  await page.evaluate(()=>document.querySelectorAll('img').forEach(i=>i.loading='eager'));await page.waitForFunction(()=>[...document.images].filter(i=>i.getAttribute('src')).every(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('.card').count(),6);
  await page.screenshot({path:path.join(OUTPUT,'verification/portfolio-desktop.png'),fullPage:true});await page.screenshot({path:path.join(OUTPUT,'verification/portfolio-cover.png')});
  await page.locator('[data-filter="Server spaces"]').click();assert.equal(await page.locator('.card:visible').count(),2);await page.locator('[data-filter="Villages"]').click();assert.equal(await page.locator('.card:visible').count(),1);await page.locator('[data-filter="All work"]').click();
  for(const id of ['ivy_crown_castle','willowbrook_spawn','harbor_village_collection','sunken_temple_arena','starter_island_forest','frostgate_outpost']){
    await page.locator(`.image-button[data-open="${id}"]`).click();assert(await page.locator('dialog').isVisible());for(const suffix of ['','-plan','-detail']){await page.locator(`[data-view="${suffix}"]`).click();await page.waitForFunction(()=>{const i=document.querySelector('#modal-image');return i.complete&&i.naturalWidth>0;});assert((await page.locator('#modal-image').getAttribute('src')).endsWith(`${id}${suffix}.png`));}
    const modules=page.locator('#modal-modules button');for(let n=0;n<await modules.count();n++){await modules.nth(n).click();await page.waitForFunction(()=>{const i=document.querySelector('#modal-image');return i.complete&&i.naturalWidth>0;});}
    await page.keyboard.press('Escape');assert(!(await page.locator('dialog').isVisible()));
  }
  await page.locator('[name=dimensions]').fill('96 × 96');await page.locator('[name=features]').fill('A woodland hub with four portal bays');
  const download=page.waitForEvent('download');await page.locator('#download-brief').click();const file=await download;const saved=path.join(OUTPUT,'verification/gallery-test-brief.txt');await file.saveAs(saved);const brief=fs.readFileSync(saved,'utf8');assert(brief.includes('BlockyBuilder'));assert(brief.includes('96 × 96'));assert(brief.includes('\n\nBuild type:'));
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(OUTPUT,'verification/portfolio-mobile.png'),fullPage:true});await page.locator('.image-button').first().click();assert(await page.locator('dialog').isVisible());await page.keyboard.press('Escape');
  await page.goto(pathToFileURL(path.join(OUTPUT,'verification.html')).href);assert.equal(await page.locator('tbody tr').count(),14);assert.equal(await page.locator('td.pass').count(),28);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(OUTPUT,'verification/gallery.json'),JSON.stringify({author:'BlockyBuilder',status:'passed',checkedAt:new Date().toISOString(),checks:['Offline file:// load','Six gallery cards and category filters','Every overview/plan/detail image and modular variant','Keyboard modal dismissal','Project brief text download and real newlines','390px mobile layout without horizontal overflow','Fourteen verification rows and 28 passes'],errors},null,2));console.log('BlockyBuilder gallery: desktop, mobile, filters, modal images, brief download and verification page passed.');
}finally{await browser.close();}
