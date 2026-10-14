import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const frames=Number(arg('--frames',90)),rounds=Number(arg('--rounds',3));
assert.ok(Number.isInteger(frames)&&frames>=10);assert.ok(Number.isInteger(rounds)&&rounds>=1);
const output=path.resolve(arg('--output','docs/artifacts/texture-cpu-benchmark.json'));
assert.ok(output.endsWith('.json'),'--output must end in .json');
const width=Number(arg('--width',960)),height=Number(arg('--height',540));
assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0);
const vite=await createServer({configFile:false,cacheDir:'.cache/texture-cpu-vite',server:{host:'127.0.0.1',port:0,hmr:false},optimizeDeps:{noDiscovery:true,include:['three']}});
let browser;
try{
  await vite.listen();const address=vite.httpServer.address();
  browser=await chromium.launch({channel:arg('--browser','msedge'),headless:true,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const results=[];
  for(let round=0;round<rounds;round++)for(const scenario of ['opaque','foliage']){
    // Rotate resolution order to distribute first-run/cache/thermal effects.
    const sizes=[16,32,64];for(const resolution of [...sizes.slice(round%3),...sizes.slice(0,round%3)]){
      const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
      page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('404'))errors.push(message.text());});
      const cdp=await context.newCDPSession(page);await cdp.send('HeapProfiler.enable');
      await page.goto(`http://127.0.0.1:${address.port}/e2e/fixtures/textureBenchmark.html`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.setupBenchmark);
      await cdp.send('HeapProfiler.collectGarbage');const before=await cdp.send('Runtime.getHeapUsage');
      await page.evaluate(options=>window.setupBenchmark(options),{resolution,scenario,width,height});
      await cdp.send('HeapProfiler.collectGarbage');const after=await cdp.send('Runtime.getHeapUsage');
      const result=await page.evaluate(n=>window.measureBenchmark(n),frames);
      assert.deepEqual(errors,[]);assert.match(result.device,/swiftshader/i);assert.equal(result.atlasBytes,(32*resolution)**2*4);
      assert.ok(result.completedRender.meanMs>0&&result.frameInterval.meanMs>0,'Measured timings must be positive');
      assert.ok(result.samplePixel[3]>0,'Rendered framebuffer must contain a valid pixel');
      results.push({...result,round:round+1,jsHeapUsedBytes:after.usedSize,jsHeapDeltaBytes:after.usedSize-before.usedSize,
        embedderHeapUsedBytes:after.embedderHeapUsedSize??null,backingStorageBytes:after.backingStorageSize??null});
      console.log(`${scenario} ${resolution}x round ${round+1}: ${result.frameInterval.fps.toFixed(1)} scheduled FPS; ${result.completedRender.meanMs.toFixed(2)} ms completed render; ${(result.atlasBytes/1048576).toFixed(0)} MiB atlas`);
      await context.close();
    }
  }
  const median=values=>{const v=[...values].sort((a,b)=>a-b),i=Math.floor(v.length/2);return v.length%2?v[i]:(v[i-1]+v[i])/2;};
  const summary=[];
  for(const scenario of ['opaque','foliage'])for(const resolution of [16,32,64]){
    const rows=results.filter(r=>r.scenario===scenario&&r.resolution===resolution);
    assert.ok(rows.every(r=>r.drawCalls===rows[0].drawCalls&&r.triangles===rows[0].triangles));
    summary.push({scenario,resolution,atlasMiB:rows[0].atlasBytes/1048576,
      medianScheduledFps:median(rows.map(r=>r.frameInterval.fps)),medianRenderMs:median(rows.map(r=>r.completedRender.meanMs)),
      medianFrameP95Ms:median(rows.map(r=>r.frameInterval.p95Ms)),medianJsHeapMiB:median(rows.map(r=>r.jsHeapUsedBytes/1048576)),
      medianLoadMs:median(rows.map(r=>r.loadMs)),medianFirstRenderMs:median(rows.map(r=>r.firstRenderMs))});
  }
  for(const row of summary){const base=summary.find(r=>r.scenario===row.scenario&&r.resolution===16);
    row.fpsChangePercent=(row.medianScheduledFps/base.medianScheduledFps-1)*100;row.renderChangePercent=(row.medianRenderMs/base.medianRenderMs-1)*100;}
  for(const scenario of ['opaque','foliage']){
    const rows=results.filter(r=>r.scenario===scenario);
    assert.ok(rows.every(r=>r.drawCalls===rows[0].drawCalls&&r.triangles===rows[0].triangles),'Resolution must not change geometry or draw calls');
  }
  const report={timestamp:new Date().toISOString(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,systemRamGiB:os.totalmem()/2**30,
    browserVersion:browser.version(),mode:'verified SwiftShader CPU software rendering',frames,rounds,width,height,
    scope:'Controlled renderer workload using production TextureManager and materials; not full-game FPS. Existing source images are scaled, not a real HD pack. No shadows, MSAA or mipmaps. Atlas bytes are calculated RGBA storage, not measured process memory. Canvas has another estimated RGBA copy; JS heap excludes native image/render allocations. Warmed asset loading is not cold-network loading.',summary,results};
  await mkdir(path.dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  const table=['| Scene | Texture | Atlas MiB | Scheduled FPS | FPS change | Render ms | Frame p95 ms | JS heap MiB |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',...summary.map(r=>`| ${r.scenario} | ${r.resolution}x | ${r.atlasMiB} | ${r.medianScheduledFps.toFixed(1)} | ${r.fpsChangePercent.toFixed(1)}% | ${r.medianRenderMs.toFixed(2)} | ${r.medianFrameP95Ms.toFixed(2)} | ${r.medianJsHeapMiB.toFixed(1)} |`)];
  await writeFile(output.replace(/\.json$/,'.md'),`# CPU texture benchmark results\n\n${report.timestamp}; ${report.cpu}; ${report.browserVersion}; ${width}×${height}; ${rounds} rounds × ${frames} measured frames per case.\n\n${table.join('\n')}\n\n${report.scope}\n`);
  console.table(summary);console.log(`Saved ${output}`);
}finally{await browser?.close();await vite.close();}
