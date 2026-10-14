import * as THREE from 'three';
import {TextureManager} from '../../src/textures.js';

// Isolate texture resolution: production atlas loader/materials, fixed geometry and lighting.
window.setupBenchmark=async ({resolution,scenario,width,height})=>{
  const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:false});
  renderer.setPixelRatio(1);renderer.setSize(width,height);document.body.append(renderer.domElement);
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  const device=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
  if(!/swiftshader/i.test(device))throw new Error(`CPU-only benchmark requires SwiftShader, got ${device}`);
  const textures=new TextureManager();
  const loadStart=performance.now();await textures.init();
  // Scale one identical source atlas, including fallback pixels, to isolate resolution.
  if(resolution!==16){
    const source=document.createElement('canvas');source.width=source.height=512;source.getContext('2d').drawImage(textures.atlasCanvas,0,0);
    textures.tileSize=resolution;textures.atlasCanvas.width=textures.atlasCanvas.height=32*resolution;textures.ctx.imageSmoothingEnabled=false;
    textures.ctx.drawImage(source,0,0,512,512,0,0,32*resolution,32*resolution);source.width=source.height=0;
    for(const tile of Object.values(textures.tileCoords)){
      const inset=.5/(32*resolution);Object.assign(tile,{u0:tile.col/32+inset,u1:(tile.col+1)/32-inset,v0:1-(tile.row+1)/32+inset,v1:1-tile.row/32-inset});
    }
    textures.atlasTexture.needsUpdate=true;
  }
  const loadMs=performance.now()-loadStart;
  textures.renderer=renderer;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x8daebe);
  scene.add(new THREE.HemisphereLight(0xffffff,0x4d4034,2));
  const sun=new THREE.DirectionalLight(0xffefd8,2);sun.position.set(15,30,10);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(60,width/height,.1,150);
  const keys=Object.keys(textures.tileCoords).filter(k=>!/water|lava|glass|leaves/.test(k)).sort().slice(0,24);
  const matrix=new THREE.Matrix4();let triangles=0;
  const add=(key,count,material,foliage=false,index=keys.indexOf(key),stride=keys.length)=>{
    const geometry=new THREE.BoxGeometry(1,foliage?1.4:1,1),uv=geometry.getAttribute('uv'),tile=textures.tileCoords[key];
    for(let i=0;i<uv.count;i++)uv.setXY(i,tile.u0+uv.getX(i)*(tile.u1-tile.u0),tile.v0+uv.getY(i)*(tile.v1-tile.v0));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(Array(geometry.getAttribute('position').count*3).fill(1),3));
    const mesh=new THREE.InstancedMesh(geometry,material,count);
    for(let i=0;i<count;i++){
      const n=i*stride+index,x=(n%32)-16,z=Math.floor(n/32)-16;
      matrix.makeTranslation(x,foliage?1.7:Math.sin(x*.3)*.3,z);mesh.setMatrixAt(i,matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);triangles+=count*12;
  };
  for(const key of keys)add(key,32,textures.opaqueMaterial);
  if(scenario==='foliage'){
    const leaves=Object.keys(textures.tileCoords).filter(k=>/leaves/.test(k)).sort().slice(0,4);
    leaves.forEach((key,index)=>add(key,48,textures.transparentMaterial,true,index,leaves.length));
  }
  const pixel=new Uint8Array(4);
  const draw=i=>{
    const a=i*.003;camera.position.set(Math.sin(a)*24,17,Math.cos(a)*24);camera.lookAt(0,0,0);
    renderer.render(scene,camera);
    // Chromium may defer work across its GPU-process boundary despite finish().
    // Readback forces completed rasterization; include the same 1-pixel cost in every case.
    gl.readPixels(width>>1,height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);gl.finish();
  };
  const uploadStart=performance.now();draw(0);const firstRenderMs=performance.now()-uploadStart;
  for(let i=0;i<30;i++)draw(i);
  gl.readPixels(width>>1,height>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error after warmup');
  const atlasBytes=(32*resolution)**2*4;
  window.measureBenchmark=async frames=>{
    const completed=[],intervals=[];let previous=null;
    for(let i=0;i<frames;i++){
      const now=await new Promise(requestAnimationFrame);
      if(previous!==null)intervals.push(now-previous);previous=now;
      const start=performance.now();draw(i);completed.push(performance.now()-start);
    }
    const stats=values=>{const sorted=[...values].sort((a,b)=>a-b),mean=values.reduce((a,b)=>a+b,0)/values.length;
      return {meanMs:mean,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)],fps:1000/mean};};
    if(gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error after measurement');
    return {resolution,scenario,width,height,device,atlasDimensions:32*resolution,atlasBytes,canvasBytes:atlasBytes,
      loadMs,firstRenderMs,drawCalls:renderer.info.render.calls,triangles,textureCount:renderer.info.memory.textures,
      completedRender:stats(completed),frameInterval:stats(intervals),samplePixel:[...pixel]};
  };
  return {device,atlasBytes,loadMs};
};
