import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { ROOT, OUTPUT } from './generate.mjs';

const manifest=JSON.parse(fs.readFileSync(path.join(OUTPUT,'manifest.json')));
const evidence=path.join(OUTPUT,'verification'),images=path.join(OUTPUT,'images');fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(images,{recursive:true});
const previous=fs.existsSync(path.join(evidence,'studio.json'))?JSON.parse(fs.readFileSync(path.join(evidence,'studio.json'))):{results:[]};
const vite=await createServer({root:ROOT,configFile:false,cacheDir:'.cache/blockybuilder-vite',server:{host:'127.0.0.1',port:0,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:['three']}});
let browser;
try{
  await vite.listen();console.log('Starting Building Studio browser');
  browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGL|shader/i.test(m.text()))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/`,{waitUntil:'commit',timeout:60000});await page.waitForFunction(()=>window.game?.player);console.log('Game initialized');
  await page.click('#btn-start-building-studio');await page.waitForFunction(()=>window.game?.worldReady);console.log('Building Studio ready');
  await page.evaluate(()=>{const g=window.game;g.animate=()=>{};g.buildingStudio.stopLiveSync();g.buildingStudio.source=null;g.buildingStudio._savePrompted=true;g.buildingStudio.hideGroundGrid();g.player.isFlying=true;g.player.model.visible=false;g.scene.fog=null;g.sky?.mesh&&(g.sky.mesh.visible=false);g.renderer.shadowMap.enabled=false;g.sunLight.castShadow=false;g.ambientLight.intensity=1.5;g.sunLight.intensity=1.3;g.sunLight.position.set(-45,100,-60);g.scene.background.setHex(0xdce8ed);});
  const style=await page.addStyleTag({content:'body > :not(#canvas-container) { display:none !important; } #canvas-container {display:block!important;}'});
  const results=[];const list=process.argv.includes('--one')?manifest.items.slice(0,1):manifest.items;
  for(const item of list){
    const bytes=fs.readFileSync(path.join(OUTPUT,item.file)),hash=createHash('sha256').update(bytes).digest('hex');const verified=previous.results.find(r=>r.id===item.id&&r.status==='passed'&&r.sha256===hash);if(verified&&!process.argv.includes('--all')&&['','-plan','-detail'].every(s=>fs.existsSync(path.join(images,item.id+s+'.png')))){results.push({...verified,checkedAt:verified.checkedAt||previous.checkedAt});console.log(`${item.id}: unchanged verified SHA-256`);continue;}const result=await page.evaluate(async ({item,bytes})=>{
      const g=window.game,bs=g.buildingStudio;
      // Each delivery file is opened independently. Keep this isolated browser's library under its storage quota.
      const {BuildingLibrary}=await import('/src/buildingLibrary.js');BuildingLibrary.customBuildings.clear();localStorage.removeItem('minecraft_building_library_v1');bs.liveBuildingIds.clear();
      const building=await bs.openSchematicFromFile({name:`${item.id}.schem`,bytes:Uint8Array.from(bytes)});if(!building)throw Error('Building Studio refused '+item.id);
      const generated=building.generate(bs.buildOrigin,{},(await import('/src/blocks.js')).BLOCKS);let mismatches=0,stateMismatches=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of generated){if(g.world.getVoxel(p.x,p.y,p.z)!==p.id)mismatches++;if(p.state&&bs.placedStates.get(`${p.x},${p.y},${p.z}`)!==p.state)stateMismatches++;min=[Math.min(min[0],p.x),Math.min(min[1],p.y),Math.min(min[2],p.z)];max=[Math.max(max[0],p.x),Math.max(max[1],p.y),Math.max(max[2],p.z)];}
      // Mesh every modified Studio chunk, including those beyond the spawn's initial view radius.
      for(const chunk of g.world.chunks.values())if(chunk.modified)chunk.dirty=true;
      for(const chunk of g.world.chunks.values())if(chunk.modified)g.rebuildChunkMesh(chunk);
      window.portfolioBounds={min,max};const cx=(min[0]+max[0])/2,cz=(min[2]+max[2])/2;const extent=Math.max(item.size[0],item.size[2]);
      g.camera.fov=42;g.camera.updateProjectionMatrix();g.camera.position.set(cx-extent*.93,max[1]+extent*.45,cz-extent*1.12);g.camera.lookAt(cx,(min[1]+max[1])*.42,cz);g.renderer.autoClear=true;g.renderer.render(g.scene,g.camera);
      return {id:item.id,author:'BlockyBuilder',status:mismatches===0&&stateMismatches===0?'passed':'failed',placed:bs.placedVoxels.length,expected:item.nonAir,missingWorldVoxels:mismatches,stateMismatches,bounds:{min,max},glError:g.renderer.getContext().getError(),scope:'Actual Building Studio openSchematicFromFile and world placement, rendered by the application'};
    },{item,bytes:[...bytes]});
    result.sha256=hash;result.checkedAt=new Date().toISOString();assert.equal(result.placed,item.nonAir);assert.equal(result.missingWorldVoxels,0,`${item.id}: clipped or rejected voxels`);assert.equal(result.stateMismatches,0);assert.equal(result.glError,0);await page.screenshot({path:path.join(images,`${item.id}.png`)});
    await page.evaluate(()=>{const g=window.game,{min,max}=window.portfolioBounds,cx=(min[0]+max[0])/2,cz=(min[2]+max[2])/2,e=Math.max(max[0]-min[0],max[2]-min[2]);g.camera.position.set(cx,max[1]+e*1.6,cz+.001);g.camera.lookAt(cx,min[1],cz);g.renderer.render(g.scene,g.camera);});
    await page.screenshot({path:path.join(images,`${item.id}-plan.png`)});
    await page.evaluate(async item=>{const g=window.game,bs=g.buildingStudio;const {readSpongeSchematic}=await import('/src/io/codecs.js');const {min,max}=window.portfolioBounds;const ax=item.anchor[0],az=item.anchor[2];let p,target;
      if(item.id.startsWith('harbor_')&&item.id!=='harbor_village_collection'){const cx=Math.floor(item.size[0]/2);p=[cx,8,11];target=[cx+2,8,21];}
      else if(item.id.startsWith('starter_island')){p=[24,26,21];target=[24,26,15];}
      else if(item.id==='ivy_crown_castle'){p=[56,8,67];target=[59,8,81];}
      else if(item.id==='frostgate_outpost'){p=[71,11,23];target=[73,11,32];}
      else {const cx=(min[0]+max[0])/2,cz=(min[2]+max[2])/2,e=Math.max(item.size[0],item.size[2]);g.camera.fov=55;g.camera.position.set(cx+e*.5,max[1]+e*.1,cz+e*.8);g.camera.lookAt(cx,(min[1]+max[1])*.4,cz);g.camera.updateProjectionMatrix();g.renderer.render(g.scene,g.camera);return;}
      // Studio raises the lowest occupied Y to ground=5. The island tips begin at Y=1.
      const yShift=item.id.startsWith('starter_island')?4:5;const world=q=>[q[0]-ax,q[1]+yShift,q[2]-az+8];g.camera.fov=78;g.camera.updateProjectionMatrix();g.camera.position.set(...world(p));g.camera.lookAt(...world(target));g.renderer.render(g.scene,g.camera);
    },item);
    await page.screenshot({path:path.join(images,`${item.id}-detail.png`)});results.push(result);console.log(`${item.id}: Studio ${result.status}, ${result.placed} placed, ${result.missingWorldVoxels} missing`);
  }
  assert.deepEqual(errors,[],'No uncaught application/shader errors');fs.writeFileSync(path.join(evidence,'studio.json'),JSON.stringify({author:manifest.author,checkedAt:new Date().toISOString(),errors,results},null,2));
}finally{await browser?.close();await vite.close();}
