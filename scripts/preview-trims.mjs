// Lightweight artwork proof: only the trim modules and PNGs, no game/map generation.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});
 await page.goto(`http://127.0.0.1:${port}/docs/artifacts/trim-design-preview.html`,{waitUntil:"domcontentloaded",timeout:120000});
 await page.waitForFunction(()=>window.trimAudit,null,{timeout:120000});
 await page.waitForFunction(()=>[...document.querySelectorAll('.icons img')].every(i=>i.dataset.trimmed==='true'&&i.complete&&i.naturalWidth>0),null,{timeout:120000});
 const audit=await page.evaluate(()=>window.trimAudit);
 await writeFile('docs/artifacts/trim-contrast-audit.json',JSON.stringify(audit,null,2)+'\n');
 await page.screenshot({path:'docs/artifacts/trim-design-preview.png',fullPage:true});
 console.log(JSON.stringify({...audit,palette:undefined,errors},null,2));
 if(errors.length||audit.alphaErrors.length||audit.invisible.length||audit.collisions.length||audit.minEdgeContrast<3)process.exitCode=1;
}finally{await browser?.close();await server.close();}
