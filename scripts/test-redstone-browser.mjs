import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('test-results/redstone-audit');await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:'export const injectQuery=(url,q)=>url+(url.includes("?")?"&":"?")+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};'}));
try{
 await page.goto(`${process.env.REDSTONE_AUDIT_URL??'http://127.0.0.1:3000'}/tests/redstone-tutorials.html`);await page.waitForFunction(()=>window.redstoneWorkshop);
 const ids=await page.evaluate(()=>window.redstoneWorkshop.scenarios.map(s=>s.id));
 for(const id of ids){const result=await page.evaluate(id=>window.redstoneWorkshop.run(id),id);assert.ok(result.checks.length>0);results.push(result);await page.screenshot({path:path.join(output,id+'.png')});}
 await page.getByRole('button',{name:'Open test crafter'}).click();await page.getByRole('dialog',{name:'Crafter',exact:true}).waitFor();
 const slots=page.locator('#crafter-panel > div > div').first().getByRole('button');await slots.first().click({button:'right'});assert.equal(await slots.first().textContent(),'Disabled');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#crafter-panel').count(),0);
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({results,crafterPanel:true,errors},null,2));console.log(JSON.stringify({scenarios:results.length,checks:results.reduce((n,r)=>n+r.checks.length,0),crafterPanel:true,errors},null,2));
}finally{await browser.close();}
