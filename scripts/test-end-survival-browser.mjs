// Small real-world/atlas/mob fixture. Does not boot Game or generate a playable map.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const output=path.resolve('test-results/end-survival');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/@vite/client',r=>r.fulfill({contentType:'application/javascript',body:`export const injectQuery=(url,q)=>url+(url.includes('?')?'&':'?')+q;export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){}});export const updateStyle=()=>{};export const removeStyle=()=>{};`}));
await page.route('**/end-audit-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#100e1a;color:white;font:16px monospace"><div id="label" style="height:40px;padding-left:16px;display:flex;align-items:center">End audit</div><div id="view"></div></body>'}));
try{
  await page.goto(`${process.env.END_AUDIT_URL??'http://127.0.0.1:3000'}/end-audit-fixture.html`);
  await page.evaluate(async()=>{
    const [T,{World},{BLOCKS:B},{TextureManager},{ChunkMesher},{MobManager},{BossFightManager},progression,{EndItemController},{UIManager}]=await Promise.all([
      import('/node_modules/three/build/three.module.js'),import('/src/world.js'),import('/src/blocks.js'),import('/src/textures.js'),import('/src/mesher.js'),import('/src/mobs.js'),import('/src/bossFights.js'),import('/src/endProgression.js'),import('/src/endItems.js'),import('/src/ui.js')]);
    const select=document.createElement('select');select.innerHTML='<option value="the_end">The End</option>';
    const seed=document.createElement('input');seed.value='4289';const button=document.createElement('button');
    const game={world:new World(1,'plains'),player:{setGameMode(){}},applyWorldSettings(s){this.settings=s;},async generateNewWorld(){this.started=true;}};
    const ui=Object.assign(Object.create(UIManager.prototype),{game,worldBiomeSelect:select,worldSeedInput:seed,btnCreateWorldConfirm:button,playPopSound(){},closeBiomeModal(){}});
    ui.bindBiomeModalEvents();button.click();
    const textures=new TextureManager();await textures.init();
    const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,760);document.querySelector('#view').append(renderer.domElement);
    const camera=new T.PerspectiveCamera(62,1280/760,.1,600),mesher=new ChunkMesher(textures);
    const sounds=new Proxy({},{get:()=>()=>{}});
    const materials=[['opaqueGeo',textures.opaqueMaterial],['transparentGeo',textures.transparentMaterial],['lightGeo',textures.lightMaterial]];
    const label=t=>document.querySelector('#label').textContent=t;
    function base(){const scene=new T.Scene();scene.background=new T.Color(0x15101e);scene.add(new T.HemisphereLight(0xc4b6da,0x373048,1.5));return scene;}
    function chunks(world,scene,cx,cz,r=3){for(let x=cx-r;x<=cx+r;x++)for(let z=cz-r;z<=cz+r;z++)world.getOrCreateChunk(x,z);for(const c of world.chunks.values()){const geos=mesher.meshChunk(c,world);for(const [key,mat]of materials)if(geos[key])scene.add(new T.Mesh(geos[key],mat));}}
    function manager(world,scene){return Object.assign(Object.create(MobManager.prototype),{world,scene,sounds,mobs:[],customProjectiles:[],arrows:[],textureLoader:new T.TextureLoader()});}
    const world=new World(4289,'the_end'),scene=base(),mobs=manager(world,scene),xp=[];
    const player={position:new T.Vector3(0,33,12),velocity:new T.Vector3(),yaw:0,pitch:0,eyeHeight:1.62,health:20,hunger:20,gamemode:'survival',takeDamage(n){this.health-=n;}};
    const entities={spawnXpOrbs(p,n){xp.push(n);},spawnExplosion(){},spawnDroppedItem(){}};
    const encounter={world,scene,player,mobs,sounds,entities,difficulty:'normal',ui:{setBossBar(){},removeBossBar(){},addChatMessage(){},updateHotbar(){}},camera,inventory:{getActiveItem(){return{id:'ender_pearl',isBlock:false};},consumeActiveItem(){this.used=(this.used??0)+1;}},loadChunksAroundPlayer(){},rebuildChunkMesh(){}};
    mobs.game=encounter;mobs.entities=entities;world.game=encounter;
    const boss=new BossFightManager(mobs,world,sounds,encounter.ui,entities);encounter.bossManager=boss;boss.game=encounter;
    boss.initEndArena();chunks(world,scene,0,0,5);
    camera.position.set(97,85,115);camera.lookAt(0,32,0);
    window.endAudit={T,World,B,textures,renderer,camera,mesher,world,scene,mobs,boss,encounter,player,xp,progression,EndItemController,base,chunks,manager,
      ui:{dimension:game.world.dimension,settings:game.settings,started:game.started},
      draw(){renderer.render(this.scene,camera);},
      central(){label('End: central island, ten spikes, caged crystals, dragon and healing beam');this.scene=scene;camera.position.set(97,85,115);camera.lookAt(0,32,0);this.draw();},
      outer(){const w=new World(4289,'the_end'),s=base(),landing=progression.findOuterEndLanding(w,1350,0);w.rebuildStructures({enabledIds:[]});chunks(w,s,Math.floor(landing.x/16),Math.floor(landing.z/16),3);let flowers=0;for(const c of w.chunks.values())flowers+=c.voxels.filter(id=>id===B.CHORUS_FLOWER).length;this.scene=s;camera.position.set(landing.x+36,62,landing.z+42);camera.lookAt(landing.x,27,landing.z);label('End: outer island, branching mature chorus plants and surrounding void');this.draw();return{flowers,landing};},
      city(){const w=new World(4289,'the_end'),s=base(),mm=manager(w,s);w.game={mobs:mm};const found=w.structures.engine.locate('end_city',1300,0,{maxRadiusChunks:128});const box=found.start.box;const minX=Math.floor(box.minX/16),maxX=Math.floor(box.maxX/16),minZ=Math.floor(box.minZ/16),maxZ=Math.floor(box.maxZ/16);for(let x=minX-1;x<=maxX+1;x++)for(let z=minZ-1;z<=maxZ+1;z++)w.getOrCreateChunk(x,z);for(const c of w.chunks.values()){const g=mesher.meshChunk(c,w);for(const[key,mat]of materials)if(g[key])s.add(new T.Mesh(g[key],mat));}const x=(box.minX+box.maxX)/2,z=(box.minZ+box.maxZ)/2;camera.position.set(x+72,85,z+80);camera.lookAt(x,35,z);this.scene=s;label('End: generated city, purpur towers, loot containers and resident shulkers');this.draw();return{residents:mm.mobs.filter(m=>m.type==='shulker').length,loot:w.structures.loot.length,box};},
      dragon(){this.scene=scene;const p=boss.enderDragon.mesh.position;camera.position.copy(p).add(new T.Vector3(18,7,23));camera.lookAt(p.x,p.y+2,p.z);label('End: real dragon model, animated wings and crystal healing beam');this.draw();}
    };
    boss.enderDragon.health=150;boss.enderDragon.mesh.position.copy(boss.endCrystals[0].position).add(new T.Vector3(0,3,8));boss.update(.1,player);window.endAudit.central();
  });
  // Wait for the real mob texture requests, then render again.
  await page.waitForLoadState('networkidle');
  const ui=await page.evaluate(()=>window.endAudit.ui);assert.equal(ui.dimension,'the_end');assert.equal(ui.settings.biome,'the_end');assert.equal(ui.started,true);
  const movement=await page.evaluate(()=>{const a=window.endAudit,p=a.boss.enderDragon.mesh.position.clone();for(let i=0;i<30;i++)a.boss.update(1/60,a.player);a.central();return{moved:p.distanceTo(a.boss.enderDragon.mesh.position),crystals:a.boss.endCrystals.filter(c=>c.alive).length,beams:a.boss.endCrystals.filter(c=>c.mesh.getObjectByName('crystal-beam')?.visible).length,health:a.boss.enderDragon.health};});
  assert.ok(movement.moved>0);assert.equal(movement.crystals,10);assert.ok(movement.beams>0);assert.ok(movement.health>150);
  await page.screenshot({path:path.join(output,'central-island.png')});
  await page.evaluate(()=>window.endAudit.dragon());await page.screenshot({path:path.join(output,'dragon.png')});
  const outer=await page.evaluate(()=>window.endAudit.outer());assert.ok(outer.flowers>0);await page.screenshot({path:path.join(output,'outer-island.png')});
  const city=await page.evaluate(()=>window.endAudit.city());await page.waitForLoadState('networkidle');await page.evaluate(()=>window.endAudit.draw());assert.ok(city.residents>0);assert.ok(city.loot>0);await page.screenshot({path:path.join(output,'end-city.png')});
  const travel=await page.evaluate(()=>{const a=window.endAudit,{world:w,boss,encounter:g,player:p}=a;boss.enderDragon.health=0;boss.update(.05,p);const gate=w.endState.gateways.find(v=>Math.hypot(v.x,v.z)<1000);const ok=a.progression.useEndGateway(g,gate.x,gate.y,gate.z);const landing=p.position.clone();g.endGatewayCooldown=0;const peer=w.endState.gateways.find(v=>Math.hypot(v.x,v.z)>1000);const returned=a.progression.useEndGateway(g,peer.x,peer.y,peer.z);return{xp:a.xp,defeated:w.endState.defeated,outbound:ok,radius:Math.hypot(landing.x,landing.z),returned};});
  assert.deepEqual(travel.xp,[12000]);assert.equal(travel.defeated,true);assert.equal(travel.outbound,true);assert.ok(travel.radius>1024);assert.equal(travel.returned,true);
  assert.deepEqual(errors,[]);
  const report={ui,movement,outer,city,travel,errors};await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
