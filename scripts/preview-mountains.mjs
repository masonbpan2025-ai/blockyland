import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/docs/artifacts/mountain-preview.html`,{waitUntil:'domcontentloaded',timeout:120000});
 const reports=[];
 for(const biome of ['frozen_peaks','jagged_peaks','snowy_slopes','grove','stony_peaks']){
  if(biome!=='frozen_peaks')await page.locator('#biome').selectOption(biome);
  await page.waitForFunction(b=>window.mountainPreview?.biome===b,biome,{timeout:120000});
  reports.push(await page.evaluate(()=>window.mountainPreview));
  await page.screenshot({path:`docs/artifacts/${biome}-preview.png`});
 }
 await writeFile('docs/artifacts/mountain-preview-results.json',JSON.stringify({reports,errors},null,2)+'\n');console.log(JSON.stringify({reports,errors},null,2));if(errors.length)process.exitCode=1;
}finally{await browser?.close();await server.close();}
