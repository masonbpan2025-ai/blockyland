// Render a small fixture through the actual Game lighting, materials and shader.
// No full world generation, saved-world changes, or player browser interaction.
import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-snow-lighting',optimizeDeps:{entries:['index.html']},server:{host:'127.0.0.1',port:0,hmr:false},logLevel:'error'});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,channel:'msedge',args:['--use-angle=d3d11','--ignore-gpu-blocklist']});
  const page=await browser.newPage({viewport:{width:1903,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/WebGLProgram|Shader Error|VALIDATE_STATUS|GL_INVALID|GLSL/.test(m.text()))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`,{waitUntil:'domcontentloaded',timeout:180000});
  await page.waitForFunction(()=>window.game?.shader&&window.game?.heldItemRenderer,null,{timeout:180000});
  await page.evaluate(async()=>{
    const g=window.game;g.worldReady=false;g.lifecycle.phase='idle';
    // Stop the application frame loop; the fixture invokes the real render path explicitly.
    window.requestAnimationFrame=()=>0;
    const {World}=await import('/src/world.js');
    const {BLOCKS}=await import('/src/blocks.js');
    g.world=new World(4289,'frozen_peaks');g.world.structures=null;g.world.generateVillage=()=>{};
    for(let cx=-8;cx<=8;cx++)for(let cz=-8;cz<=8;cz++)g.world.getOrCreateChunk(cx,cz);
    for(const chunk of g.world.chunks.values())g.applyChunkGeometry(chunk,g.mesher.meshChunk(chunk,g.world));
    g.camera.position.set(50,58,64);g.camera.lookAt(0,34,-8);g.camera.updateMatrixWorld();
    g.player.model.visible=false;g.targetBoxMesh.visible=false;g.breakOverlayMesh.visible=false;
    g.currentDimension='overworld';g.isUnderwater=false;g.weather.rainIntensity=0;
    document.body.querySelectorAll(':scope > *').forEach(el=>{if(el.id!=='canvas-container')el.style.display='none';});
    // A close-up snow block over the terrain doubles as a GPU luminance probe.
    const {createBlockGeometry}=await import('/src/blockGeometry.js');const THREE=await import('/node_modules/three/build/three.module.js');
    const probe=new THREE.Mesh(createBlockGeometry(BLOCKS.SNOW,g.textures),g.textures.opaqueMaterial);
    const {snowFaceTint}=await import('/src/snowShading.js');
    for(let i=0;i<probe.geometry.attributes.normal.count;i++){
      const n=probe.geometry.attributes.normal,t=snowFaceTint(n.getX(i),n.getY(i),n.getZ(i));probe.geometry.attributes.color.setXYZ(i,...t);
    }
    probe.geometry.setAttribute('snowExposure',new THREE.Float32BufferAttribute(new Float32Array(probe.geometry.attributes.position.count).fill(1),1));
    probe.position.copy(g.camera.position).add(g.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(7));
    probe.position.y-=1;g.scene.add(probe);window.snowProbe=probe;
  });
  const dimensions=await page.evaluate(()=>{
    const g=window.game;g.currentDimension='the_end';g.updateDayNightCycle(0);
    const end={sun:g.sunLight.intensity,moon:g.moonLight.intensity,color:g.ambientLight.color.getHex(),ground:g.ambientLight.groundColor.getHex(),ambient:g.ambientLight.intensity};
    g.currentDimension='overworld';g.updateDayNightCycle(0);
    return {end,overworld:{skyDisabled:g.sky.disabled,color:g.ambientLight.color.getHex()}};
  });
  assert.equal(dimensions.end.color,0x3b1d54);assert.equal(dimensions.end.ground,0x3b1d54);assert.equal(dimensions.end.sun,0);assert.equal(dimensions.end.moon,0);assert.equal(dimensions.overworld.skyDisabled,false);
  const reports=[];
  for(const scenario of [
    {name:'before',time:6000,shader:false,old:true},
    {name:'day-off',time:6000,shader:false},
    {name:'day-on',time:6000,shader:true},
    {name:'dawn-off',time:0,shader:false},
    {name:'night-off',time:18000,shader:false},
    {name:'overcast',time:6000,shader:true,rain:1},
    {name:'near-day-off',time:6000,shader:false,near:true},
    {name:'near-day-on',time:6000,shader:true,near:true},
  ]){
    const report=await page.evaluate(async s=>{
      const g=window.game;
      if(s.near){g.camera.position.set(8,g.world.surfaceHeightAt(8,40)+2.7,40);g.camera.lookAt(0,40,-8);g.camera.updateMatrixWorld();}
      g.weather.rainIntensity=s.rain||0;g.weather.weatherType=s.rain?'rain':'clear';
      g.shader.setEnabled(s.shader,false);g.worldTime=s.time;g.updateDayNightCycle(0);g.weather.update(0,g.player.position,g.ambientLight,g.sunLight,g.scene.fog,g.scene.background);g.sky.update(0,g.camera,g.weather,false);
      if(s.old){g.textures.setSnowDaylight(0);g.scene.fog.near=45;g.scene.fog.far=95;}
      window.snowProbe.visible=true;g.shader.render(0);const gl=g.renderer.getContext(),pixels=new Uint8Array(4*36*36);
      const p=window.snowProbe.position.clone().project(g.camera),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
      const px=Math.max(0,Math.min(width-36,Math.round((p.x*.5+.5)*width)-18)),py=Math.max(0,Math.min(height-36,Math.round((p.y*.5+.5)*height)-18));
      gl.readPixels(px,py,36,36,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
      window.snowProbe.visible=false;g.shader.render(0);gl.finish();
      // Sample an actual far ridge, including its sides and ledges, rather than
      // considering only a bright foreground block sufficient verification.
      const rw=Math.round(width*.28125),rh=Math.round(height*.1875),region=new Uint8Array(4*rw*rh);gl.readPixels(Math.round(width*.375),Math.round(height*.4625),rw,rh,gl.RGBA,gl.UNSIGNED_BYTE,region);
      let sumRidge=0,sumSquares=0,clipped=0;for(let i=0;i<region.length;i+=4){const l=.2126*region[i]+.7152*region[i+1]+.0722*region[i+2];sumRidge+=l;sumSquares+=l*l;if(l>250)clipped++;}
      const ridgeMean=sumRidge/(rw*rh),ridgeContrast=Math.sqrt(Math.max(0,sumSquares/(rw*rh)-ridgeMean*ridgeMean));
      return {...s,actualShader:g.shader.enabled,ambient:g.ambientLight.intensity,sun:g.sunLight.intensity,snowDaylight:g.textures.opaqueMaterial.userData.snowDaylight.value,fogNear:g.scene.fog.near,fogFar:g.scene.fog.far,probeBrightness:sum/(36*36),ridgeContrast,clippedFraction:clipped/(rw*rh),renderWidth:g.shader.targets?.scene.width||width,renderHeight:g.shader.targets?.scene.height||height};
    },scenario);
    reports.push(report);await page.screenshot({path:`docs/artifacts/snow-game-${scenario.name}.png`});
  }
  const farSnowProbe=await page.evaluate(async()=>{
    const g=window.game,THREE=await import('/node_modules/three/build/three.module.js');
    const {World,Chunk}=await import('/src/world.js'),{BLOCKS}=await import('/src/blocks.js');
    const fixture=new World(1,'frozen_peaks'),chunk=new Chunk(0,0);fixture.chunks.set('0,0',chunk);
    for(let x=3;x<=13;x++)for(let z=4;z<=12;z++)for(let y=18;y<=(x>=8?22:20);y++)chunk.setVoxel(x,y,z,BLOCKS.SNOW);
    for(const chunk of g.world.chunks.values())for(const slot of ['opaqueMesh','lightMesh','waterMesh','transparentMesh'])if(chunk[slot])chunk[slot].visible=false;
    window.snowProbe.visible=false;
    const geometries=g.mesher.meshChunk(chunk,fixture),step=new THREE.Mesh(geometries.opaqueGeo,g.textures.opaqueMaterial);g.scene.add(step);
    g.camera.position.set(8,40,100);g.camera.lookAt(8,22,8);g.camera.updateMatrixWorld();g.weather.rainIntensity=0;g.weather.weatherType='clear';
    const sample=point=>{
      const gl=g.renderer.getContext(),p=point.project(g.camera),pixels=new Uint8Array(36);
      gl.readPixels(Math.round((p.x*.5+.5)*gl.drawingBufferWidth)-1,Math.round((p.y*.5+.5)*gl.drawingBufferHeight)-1,3,3,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let mean=0;for(let i=0;i<pixels.length;i+=4)mean+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;return mean/9;
    };
    const result=[];
    for(const mode of ['old-fog','clear-off','clear-on']){
      g.shader.setEnabled(mode==='clear-on',false);g.worldTime=6000;g.updateDayNightCycle(0);g.sky.update(0,g.camera,g.weather,false);
      if(mode==='old-fog'){g.scene.fog.near=45;g.scene.fog.far=95;g.textures.setSnowDaylight(0);}
      g.shader.render(0);g.renderer.getContext().finish();
      const top=sample(new THREE.Vector3(11.5,23.001,9.5)),side=sample(new THREE.Vector3(11.5,22.5,13.001));
      result.push({mode,distance:92,top,side,contrast:top-side});
    }
    g.scene.remove(step);step.geometry.dispose();return result;
  });
  await writeFile('docs/artifacts/snow-game-lighting-results.json',JSON.stringify({reports,farSnowProbe,dimensions,errors},null,2)+'\n');console.log(JSON.stringify({reports,farSnowProbe,dimensions,errors},null,2));
  assert.deepEqual(errors,[]);for(const r of reports)assert.equal(r.actualShader,r.shader,'shader must stay enabled during the enhanced rendering check');
  assert.ok(farSnowProbe[1].contrast>farSnowProbe[0].contrast*1.2,'a snow ledge 92 blocks away retains stronger top/side contrast');
  assert.ok(farSnowProbe[2].contrast>35,'the distant step stays visibly distinct with the shader on');
  assert.ok(reports[1].probeBrightness<245,'sky fill keeps the sampled snow side below clipping');
  assert.equal(reports[2].renderWidth,1903,'normal display resolution is retained with the shader on');
  assert.ok(reports[3].probeBrightness>reports[0].probeBrightness*.9,'dawn sky-exposed snow stays readable');
  assert.ok(reports[4].probeBrightness<reports[1].probeBrightness*.5,'night stays dark');
}finally{await browser?.close();await server.close();}
