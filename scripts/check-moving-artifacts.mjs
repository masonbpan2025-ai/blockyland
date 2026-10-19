import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const out='docs/artifacts/moving-artifacts';await mkdir(out,{recursive:true});
const server=await createServer({configFile:false,cacheDir:'.cache/moving-artifacts',server:{host:'127.0.0.1',port:0,watch:null,hmr:false},optimizeDeps:{noDiscovery:true,include:['three']}});
let browser;
try{
 await server.listen();browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1024,height:700}}),errors=[];
 page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|GL_INVALID|Shader Error|GLSL/.test(m.text()))errors.push(m.text());});
 page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.httpServer.address().port}/e2e/fixtures/movingArtifacts.html`;
 await fetch(url);await page.goto(url,{waitUntil:'commit'});await page.waitForFunction(()=>window.testRoofEdges&&window.renderCastle);
 console.log('Testing roof edges during camera movement');
 const roof=await page.evaluate(()=>window.testRoofEdges());
 console.log('Testing foliage draw-order invariance');
 const foliage=await page.evaluate(()=>window.testFoliageOrdering());
 const report={roof,foliage,errors};
 console.log(JSON.stringify(report,null,2));
 const castleArg=process.argv.indexOf('--castle');
 if(castleArg>=0){
  console.log('Loading actual castle');await page.evaluate(()=>window.compareFiltering(64));
  report.castle=await page.evaluate(bytes=>window.renderCastle(bytes),[...await readFile(process.argv[castleArg+1])]);
  report.captures=[];
  for(const enhanced of [false,true])for(const view of ['roof','ground'])for(const fixed of [false,true]){
   const result=await page.evaluate(args=>window.captureCastleArtifacts(...args),[view,fixed,enhanced]);
   const name=`${view}-${enhanced?'effects':'normal'}-${fixed?'fixed':'before'}.png`;
   await page.screenshot({path:`${out}/${name}`});report.captures.push({name,...result});console.log(name,result);
  }
 }
 await writeFile(`${out}/results.json`,JSON.stringify(report,null,2)+'\n');
 assert.deepEqual(errors,[],'no shader compilation or browser errors');
 assert(foliage.before.changedPixels>1000,'negative control reproduces draw-order darkening');
 assert.equal(foliage.fixed.changedPixels,0,'cutouts are independent of draw order');
 for(const mode of ['normal','effects']){
  const before=roof[`${mode}-before`],fixed=roof[`${mode}-fixed`];
  assert.equal(fixed.effectsEnabled,mode==='effects');
  assert.equal(fixed.glError,0);assert.equal(before.glError,0);
  assert(fixed.temporalRms<before.temporalRms*.85,`${mode}: roof edge flicker decreases at least 15%`);
 }
 for(const c of report.captures||[]){assert.equal(c.glError,0,c.name);assert.equal(c.effectsEnabled,c.name.includes('effects'),c.name);}
 await page.evaluate(()=>window.finishArtifactTests());
 console.log('Moving-artifact regressions passed');
}finally{await browser?.close();await server.close();}
