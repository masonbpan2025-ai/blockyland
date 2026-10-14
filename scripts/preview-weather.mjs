// Small fixtures through the real Game render path, in an isolated browser.
// No saved map, main-game generation or interaction with the user's browser.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-weather-preview',optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-angle=d3d11','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|GL_INVALID|GLSL/.test(m.text()))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.game?.shader&&window.game?.heldItemRenderer,null,{timeout:180000});
  await page.evaluate(async()=>{
    window.requestAnimationFrame=()=>0;const g=window.game;g.worldReady=false;g.lifecycle.phase='idle';
    const {World,Chunk}=await import('/src/world.js'),{BLOCKS}=await import('/src/blocks.js');
    g.world=new World(911,'plains');g.world.game=g;g.world.structures=null;g.gamerules={...g.gamerules,doWeatherCycle:false,doFireTick:false};
    for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++){const c=new Chunk(cx,cz);g.world.chunks.set(`${cx},${cz}`,c);for(let x=0;x<16;x++)for(let z=0;z<16;z++)c.setVoxel(x,0,z,BLOCKS.GRASS);}
    const c=g.world.getChunk(0,0);for(let x=0;x<16;x++)for(let z=0;z<16;z++)c.setVoxel(x,6,z,BLOCKS.GLASS);
    for(const x of [0,15])for(let z=0;z<16;z++)for(let y=1;y<6;y++)c.setVoxel(x,y,z,BLOCKS.OAK_PLANKS);
    for(let x=0;x<16;x++)for(let y=1;y<6;y++)c.setVoxel(x,y,15,BLOCKS.OAK_PLANKS);
    for(const c of g.world.chunks.values())g.applyChunkGeometry(c,g.mesher.meshChunk(c,g.world));
    g.player.model.visible=false;g.player.gamemode='creative';g.targetBoxMesh.visible=false;g.breakOverlayMesh.visible=false;g.isUnderwater=false;
    document.body.querySelectorAll(':scope > *').forEach(el=>{if(el.id!=='canvas-container')el.style.display='none';});
    window.weatherSetup=async s=>{
      const g=window.game;g.weather.clearEffects();g.weather.rainIntensity=0;g.world.dimension=s.dimension||'overworld';g.currentDimension=s.dimension==='end'?'the_end':s.dimension||'overworld';g.world.isNether=s.dimension==='nether';g.world.selectedBiome=s.biome||'plains';
      if(s.dimension==='end'){g.scene.background.setHex(0x1a1224);g.scene.fog.color.setHex(0x1a1224);}
      g.shader.setEnabled(s.shader,false);g.camera.position.set(...(s.inside?[8,3.5,13]:[22,4,20]));g.camera.lookAt(...(s.inside?[8,3,-3]:[8,3,5]));g.camera.updateMatrixWorld();g.player.position.copy(g.camera.position);
      g.weather.setWeather(s.weather||'rain');g.weather.lightningTimer=1000;g.weather.endFlashTimer=1000;g.worldTime=6000;
      for(let i=0;i<60;i++){g.updateDayNightCycle(0);g.weather.update(1/30,g.player.position,g.ambientLight,g.sunLight,g.scene.fog,g.scene.background);}
      if(s.lightning)g.weather.triggerLightning(null,null,new (await import('/node_modules/three/build/three.module.js')).Vector3(19,1,7));
      if(s.endFlash)g.weather.triggerEndFlash();
      g.updateDayNightCycle(0);g.weather.update(.03,g.player.position,g.ambientLight,g.sunLight,g.scene.fog,g.scene.background);g.sky.update(0,g.camera,g.weather,false);g.shader.render(0);g.renderer.getContext().finish();
      const badParticles=mesh=>{const a=mesh.geometry.attributes.position;let bad=0;for(let i=0;i<mesh.geometry.drawRange.count;i++){const x=a.getX(i)+mesh.position.x,z=a.getZ(i)+mesh.position.z,y=a.getY(i)+mesh.position.y;if(x>=0&&x<16&&z>=0&&z<16&&y<7-1e-5)bad++;}return bad;};
      return {name:s.name,rain:g.weather.rainMesh.visible?g.weather.rainGeometry.drawRange.count/2:0,snow:g.weather.snowMesh.visible?g.weather.snowGeometry.drawRange.count:0,roofLeaks:badParticles(g.weather.rainMesh)+badParticles(g.weather.snowMesh),boltCount:g.weather.visuals.bolts.length,flash:g.weather.flashIntensity,endPulse:g.weather.visuals.endPulse,weather:g.weather.weatherType,ambient:g.ambientLight.intensity,rendererCalls:g.renderer.info.render.calls};
    };
  });
  const reports=[];
  for(const s of [
    {name:'rain-plain',shader:false},
    {name:'rain-shader',shader:true},
    {name:'sheltered-rain',shader:true,inside:true},
    {name:'snow-plain',shader:false,biome:'frozen_peaks'},
    {name:'snow-shader',shader:true,biome:'frozen_peaks'},
    {name:'sheltered-snow',shader:true,biome:'frozen_peaks',inside:true},
    {name:'lightning-plain',shader:false,weather:'thunder',lightning:true},
    {name:'lightning-shader',shader:true,weather:'thunder',lightning:true},
    {name:'desert-storm',shader:true,biome:'desert',weather:'thunder'},
    {name:'nether-dry',shader:true,dimension:'nether',weather:'thunder'},
    {name:'end-flash',shader:true,dimension:'end',weather:'clear',endFlash:true},
    {name:'end-plain',shader:false,dimension:'end',weather:'thunder'},
  ]){
    const result=await page.evaluate(s=>window.weatherSetup(s),s);reports.push(result);await page.screenshot({path:`docs/artifacts/weather-${s.name}.png`});
    assert.equal(result.roofLeaks,0,s.name+' roof clipping');
    if(s.biome==='frozen_peaks'){assert.ok(result.snow>0);assert.equal(result.rain,0);}
    else if(!s.dimension&&s.biome!=='desert')assert.ok(result.rain>0);
    else assert.equal(result.rain,0);
    if(s.lightning){assert.equal(result.boltCount,1);assert.equal(result.flash,1);}
    if(s.endFlash)assert.ok(result.endPulse>0);
  }
  const ambientReports=[];
  for(const s of [
    {name:'cherry-petals',biome:'cherry_grove',leaf:'CHERRY_LEAVES',kind:'cherry_leaves'},
    {name:'oak-leaves',biome:'forest',leaf:'OAK_LEAVES',kind:'tinted_leaves'},
    {name:'pale-leaves',biome:'pale_garden',leaf:'PALE_OAK_LEAVES',kind:'pale_oak_leaves'},
    {name:'nether-embers',biome:'nether_wastes',nether:true,kind:'flame'},
    {name:'soul-ash',biome:'soul_sand_valley',nether:true,kind:'ash'},
    {name:'basalt-ash',biome:'basalt_deltas',nether:true,kind:'white_ash'},
    {name:'crimson-spores',biome:'crimson_forest',nether:true,kind:'crimson_spore'},
    {name:'warped-spores',biome:'warped_forest',nether:true,kind:'warped_spore'},
    {name:'spore-blossom',biome:'lush_caves',blossom:true,kind:'spore_blossom_air'},
    {name:'fireflies',biome:'swamp',bush:true,kind:'firefly'},
  ]){
    const report=await page.evaluate(async s=>{
      const g=window.game,{BLOCKS:B}=await import('/src/blocks.js'),fx=g.weather.ambientParticles;
      g.weather.clearEffects();g.weather.setWeather('clear');g.weather.rainIntensity=0;g.world.isNether=!!s.nether;g.world.dimension=s.nether?'nether':'overworld';g.currentDimension=g.world.dimension;g.world.selectedBiome=s.biome;g.isUnderwater=false;
      for(const c of g.world.chunks.values()){c.voxels.fill(0);c.weatherRevision++;for(let x=0;x<16;x++)for(let z=0;z<16;z++)c.setVoxel(x,0,z,s.nether?B.NETHERRACK:B.GRASS);}
      const put=(x,y,z,id)=>{const c=g.world.getChunk(Math.floor(x/16),Math.floor(z/16));c?.setVoxel(x&15,y,z&15,id);};
      if(s.leaf)for(const x of [-8,8,24])for(const z of [-8,6]){for(let y=1;y<6;y++)put(x,y,z,s.leaf==='CHERRY_LEAVES'?B.CHERRY_LOG:B.OAK_LOG);for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(let y=5;y<=7;y++)if(y!==7||Math.abs(dx)+Math.abs(dz)<4)put(x+dx,y,z+dz,B[s.leaf]);}
      if(s.nether){for(let x=2;x<=14;x++)for(let z=-5;z<=6;z++)put(x,0,z,B.LAVA);for(const x of [1,5,13,17]){put(x,1,8,B.FIRE);put(x,1,-8,B.SOUL_FIRE);}}
      if(s.blossom)for(let x=3;x<14;x++)for(let z=2;z<10;z++){put(x,7,z,B.STONE);if((x+z)%3===0)put(x,6,z,B.SPORE_BLOSSOM);put(x,0,z,B.MYCELIUM);}
      if(s.bush)for(let x=1;x<16;x+=2)for(let z=3;z<=11;z+=2)put(x,1,z,B.FIREFLY_BUSH);
      for(const c of g.world.chunks.values())g.applyChunkGeometry(c,g.mesher.meshChunk(c,g.world));
      g.camera.position.set(8,3.5,17);g.camera.lookAt(8,3.5,3);g.camera.updateMatrixWorld();g.player.position.copy(g.camera.position);g.worldTime=s.bush?18000:6000;g.shader.setEnabled(true,false);
      if(s.nether){g.sunLight.intensity=0;g.moonLight.intensity=0;g.ambientLight.intensity=1.2;g.ambientLight.color.setHex(0xe89d6c);g.ambientLight.groundColor.setHex(0x402c32);}
      for(let i=0;i<200;i++){g.updateDayNightCycle(0);g.weather.update(.05,g.player.position,g.ambientLight,g.sunLight,g.scene.fog,g.scene.background);}
      g.sky.update(0,g.camera,g.weather,false);g.shader.render(0);g.renderer.getContext().finish();
      const start=performance.now();for(let i=0;i<100;i++)fx.update(1/60,g.player.position,g);const meanUpdateMs=(performance.now()-start)/100;
      return {name:s.name,count:fx.particles.length,kinds:[...new Set(fx.particles.map(p=>p.kind))],capacity:fx.capacity,drawCount:fx.geometry.drawRange.count,meanUpdateMs};
    },s);
    ambientReports.push(report);assert.ok(report.kinds.includes(s.kind),s.name+' missing particles');assert.ok(report.count<=report.capacity);await page.screenshot({path:`docs/artifacts/ambient-${s.name}.png`});
  }
  assert.deepEqual(errors,[]);await writeFile('docs/artifacts/weather-preview-results.json',JSON.stringify({reports,ambientReports,errors},null,2));console.log(JSON.stringify({reports,ambientReports,errors},null,2));
}finally{await browser?.close();await server.close();}
