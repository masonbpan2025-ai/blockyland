// Real generated chunks and world materials, without booting Game or searching
// a playable world by hand. Saves both a natural entrance and cave interiors.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const output=path.resolve('test-results/cave-audit');await mkdir(output,{recursive:true});
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:'export const injectQuery=(url,q)=>url+(url.includes("?")?"&":"?")+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};'}));
 await page.route('**/cave-audit.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#131c28;color:white;font:16px system-ui"><div id="label" style="padding:10px 20px;height:30px"></div><div id="view"></div></body>'}));
 await page.goto(`${process.env.CAVE_AUDIT_URL??'http://127.0.0.1:3000'}/cave-audit.html`,{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
   const [{THREE:T},{World},{BLOCKS:B,BLOCK_DEFS},{TextureManager},{ChunkMesher},{BlockLighting}]=await Promise.all([import('/tests/helpers/browserThree.js'),import('/src/world.js'),import('/src/blocks.js'),import('/src/textures.js'),import('/src/mesher.js'),import('/src/lighting.js')]);
   const textures=new TextureManager();await textures.init();const mesher=new ChunkMesher(textures),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1200,750);document.querySelector('#view').append(renderer.domElement);
   const camera=new T.PerspectiveCamera(72,1200/750,.08,200);
   window.caveAudit={async show(biome){
     const t=performance.now(),world=new World(4289,biome),scene=new T.Scene();scene.background=new T.Color(biome==='plains'?0x87b9df:0x101623);
     const region=world.caves.region(0,0),focus=biome==='plains'?region.entrance:region.hub,cx=Math.floor(focus[0]/16),cz=Math.floor(focus[2]/16),light=new BlockLighting(scene,8);
     scene.add(new T.HemisphereLight(0xc3dcfa,0x869788,biome==='plains'?1.8:.65));const sun=new T.DirectionalLight(0xffe7c0,biome==='plains'?2.2:.1);sun.position.set(30,80,20);scene.add(sun);
     for(let x=cx-2;x<=cx+2;x++)for(let z=cz-2;z<=cz+2;z++)world.getOrCreateChunk(x,z);
     let vertices=0,sources=0,air=0,water=0,lava=0;const ids={};
     for(const c of world.chunks.values()){
       for(const id of c.voxels){ids[id]=(ids[id]??0)+1;if(id===B.AIR)air++;if(id===B.WATER)water++;if(id===B.LAVA)lava++;}
       const g=mesher.meshChunk(c,world);for(const [key,mat]of [['opaqueGeo',textures.opaqueMaterial],['transparentGeo',textures.transparentMaterial],['lightGeo',textures.lightMaterial]])if(g[key]){const a=g[key].attributes.position.array;if(!a.every(Number.isFinite))throw new Error('Nonfinite cave geometry');vertices+=g[key].attributes.position.count;scene.add(new T.Mesh(g[key],mat));}
       const emitters=g.lightGeo?.userData.sources??[];sources+=emitters.length;light.setChunk(c.cx,c.cz,emitters);
     }
     let at;
     if(biome==='plains'){
       let mouth=null;for(let x=Math.floor(focus[0])-4;x<=Math.floor(focus[0])+4;x++)for(let z=Math.floor(focus[2])-4;z<=Math.floor(focus[2])+4;z++){const y=world.surfaceHeightAt(x,z);if(world.getVoxel(x,y,z)===B.AIR&&world.getVoxel(x,y-1,z)===B.AIR)mouth??=[x,y,z];}
       if(!mouth)throw new Error('No visible natural entrance');at=mouth;const inward=new T.Vector3(region.hub[0]-mouth[0],0,region.hub[2]-mouth[2]).normalize();camera.position.set(mouth[0]+.5,mouth[1]+1.8,mouth[2]+.5);camera.lookAt(mouth[0]+inward.x*4,mouth[1]-3.5,mouth[2]+inward.z*4);
     }else{
       let candidate=null,best=-1;for(let x=Math.floor(focus[0])-12;x<=Math.floor(focus[0])+12;x++)for(let z=Math.floor(focus[2])-12;z<=Math.floor(focus[2])+12;z++){let clear=0;for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)if(world.getVoxel(x+dx,18,z+dz)===B.AIR&&world.getVoxel(x+dx,19,z+dz)===B.AIR)clear++;if(clear>best&&world.getVoxel(x,18,z)===B.AIR){best=clear;candidate=[x,18,z];}}
       if(!candidate)throw new Error('Cavern has no interior viewpoint');at=candidate;camera.position.set(candidate[0]+.5,19,candidate[2]+.5);camera.lookAt(candidate[0]+12,21,candidate[2]+11);
       // A reviewer light makes dark, unlit geometry inspectable. This is not a
       // claim that ordinary stone caves illuminate themselves during gameplay.
       const review=new T.PointLight(0xffdb9e,2.5,40,1);review.position.copy(camera.position);scene.add(review);
     }
     light.update(.3,camera.position);textures.update(0);renderer.render(scene,camera);document.querySelector('#label').textContent=`${biome} — real generated seed 4289 at ${at.join(', ')}${biome==='plains'?'':' • inspection light enabled'}`;
     const gl=renderer.getContext(),pixels=new Uint8Array(1200*750*4);gl.readPixels(0,0,1200,750,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let visible=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>90)visible++;
     const result={biome,at,chunks:world.chunks.size,vertices,sources,air,water,lava,moss:ids[B.MOSS_BLOCK]??0,dripstone:ids[B.POINTED_DRIPSTONE]??0,sculk:ids[B.SCULK]??0,visible,ms:Math.round(performance.now()-t)};
     window.caveAudit.current={world,scene,light};return result;
   }};
 });
 const results=[];for(const biome of ['plains','lush_caves','dripstone_caves','deep_dark']){
   const result=await page.evaluate(b=>window.caveAudit.show(b),biome);assert.ok(result.air>10000);assert.ok(result.vertices>1000);assert.ok(result.visible>15000,'cave rendering is blank or black');if(biome==='lush_caves'){assert.ok(result.moss>100);assert.ok(result.sources>10);}if(biome==='dripstone_caves')assert.ok(result.dripstone>100);if(biome==='deep_dark')assert.ok(result.sculk>100);results.push(result);await page.screenshot({path:path.join(output,biome+'.png')});console.log(JSON.stringify(result));
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({results,errors},null,2));
}finally{await browser?.close();}
