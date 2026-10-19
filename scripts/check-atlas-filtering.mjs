import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const output=path.resolve('docs/artifacts/atlas-filtering');
await mkdir(output,{recursive:true});
const vite=await createServer({configFile:false,cacheDir:'.cache/atlas-filtering-vite',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:['three']}});
let browser;
try{
 await vite.listen();
 console.log('Atlas test server ready');
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 console.log('Headless browser ready');
 const results=[];
 for(const resolution of [16,64]){
  const page=await browser.newPage({viewport:{width:768,height:512}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.text().startsWith('[atlas]'))console.log(m.text());if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
  page.on('requestfailed',r=>console.log('Request failed:',r.url(),r.failure()?.errorText));
  const url=`http://127.0.0.1:${vite.httpServer.address().port}/e2e/fixtures/atlasFiltering.html`;
  console.log('Fixture HTTP status:',(await fetch(url,{signal:AbortSignal.timeout(15000)})).status);
  await page.goto(url,{waitUntil:'commit'});
  await page.waitForFunction(()=>typeof window.compareFiltering==='function');
  console.log(`Measuring ${resolution}x`);
  const result=await page.evaluate(r=>window.compareFiltering(r),resolution);
  await page.evaluate(()=>window.showBefore());
  await page.screenshot({path:path.join(output,`${resolution}x-before.png`)});
  await page.evaluate(()=>window.showAfter());
  await page.screenshot({path:path.join(output,`${resolution}x-after.png`)});
  result.edges=await page.evaluate(()=>window.checkAtlasEdges());
  if(resolution===64)result.reload=await page.evaluate(()=>window.checkPackReload());
  const castleArg=process.argv.indexOf('--castle');
  if(resolution===64&&castleArg>=0){
   console.log('Rendering the actual castle with the production chunk mesher');
   result.castle=await page.evaluate(bytes=>window.renderCastle(bytes),[...await readFile(process.argv[castleArg+1])]);
   await page.evaluate(()=>window.castleBefore());await page.screenshot({path:path.join(output,'castle-before.png')});
   await page.evaluate(()=>window.castleAfter());await page.screenshot({path:path.join(output,'castle-after.png')});
  }
  result.errors=errors;results.push(result);
  await page.close();
 }
 await writeFile(path.join(output,'results.json'),JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(results,null,2));
 for(const r of results){
  assert.deepEqual(r.errors,[],'No shader compilation/browser errors');
  assert.equal(r.glError,0);assert.equal(r.edges.glError,0);
  // Frame differences also include legitimate moving texture detail; low-res
  // source art already aliases less. Require a substantial reduction at both
  // resolutions, with the stronger bound for the default 64x pack.
  const minimumReduction=r.resolution===64?.7:.4;
  for(const surface of ['wood','ice'])assert(r.reduction[surface]>minimumReduction,`${r.resolution}x ${surface}: reduce camera shimmer by ${minimumReduction*100}%`);
  assert(r.edges.redPixels>100,'the edge test rendered its target tile');
  assert(r.edges.maxGreen<=2,'coarse mip levels never pick up the bright green neighbouring tile');
  assert.equal(r.edges.blurredPixels,0,'magnified source texels remain crisp');
  if(r.castle)assert.equal(r.castle.glError,0);
  if(r.reload){assert.deepEqual(r.reload.dimensions,[512,512]);assert.equal(r.reload.maxMip,4);assert.equal(r.reload.sameUniform,true);assert.equal(r.reload.glError,0);}
 }
}finally{await browser?.close();await vite.close();}
