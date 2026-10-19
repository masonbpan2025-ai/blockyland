import * as THREE from 'three';
import { TextureManager } from '../../src/textures.js';
import { resourcePackManager } from '../../src/resourcePackManager.js';
import { configureAtlasTexture, filterAtlasMaterial } from '../../src/atlasFiltering.js';

const width=768,height=512;
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(width,height);document.body.append(renderer.domElement);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const gl=renderer.getContext();
const pixels=new Uint8Array(width*height*4);
let currentTextures;
const read=()=>{gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels.slice();};
const luma=(p,i)=>(p[i]+p[i+1]+p[i+2])/3;
function surface(tile,x1,x2){
 const p=[],uv=[],normals=[],color=[];
 for(let z=-100;z<30;z++)for(let x=x1;x<x2;x++){
  for(const [dx,dz,u,v] of [[0,0,0,0],[0,1,0,1],[1,0,1,0],[1,0,1,0],[0,1,0,1],[1,1,1,1]]){
   p.push(x+dx,0,z+dz);normals.push(0,1,0);color.push(1,1,1);uv.push(THREE.MathUtils.lerp(tile.u0,tile.u1,u),THREE.MathUtils.lerp(tile.v0,tile.v1,v));
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(color,3));return g;
}
window.compareFiltering=async resolution=>{
 if(resolution===16)resourcePackManager.reorderPacks([]);else await resourcePackManager.resetToDefault();
 const tm=new TextureManager();await tm.init();tm.renderer=renderer;currentTextures=tm;console.log('[atlas] textures loaded');
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x334455);scene.add(new THREE.HemisphereLight(0xffffff,0xffffff,2));
 const wood=new THREE.Mesh(surface(tm.tileCoords['spruce_planks.png'],0,32),tm.opaqueMaterial);
 const ice=new THREE.Mesh(surface(tm.tileCoords['ice.png'],-32,0),tm.transparentMaterial);
 scene.add(wood,ice);
 const camera=new THREE.PerspectiveCamera(60,width/height,.1,250);
 const regions={wood:[420,590,170,350],ice:[170,340,170,350]};
 const measure=filtered=>{
  if(filtered){configureAtlasTexture(tm.atlasTexture);wood.material=tm.opaqueMaterial;ice.material=tm.transparentMaterial;}
  else{
   tm.atlasTexture.minFilter=THREE.NearestFilter;tm.atlasTexture.generateMipmaps=false;
   wood.material=new THREE.MeshLambertMaterial({map:tm.atlasTexture,side:THREE.DoubleSide,vertexColors:true});
   ice.material=new THREE.MeshLambertMaterial({map:tm.atlasTexture,side:THREE.DoubleSide,vertexColors:true,transparent:true,opacity:1,alphaTest:.2,depthWrite:false});
  }
  tm.atlasTexture.needsUpdate=true;
  let previous=null;const sums={wood:0,ice:0},samples={wood:0,ice:0};
  for(let frame=0;frame<6;frame++){
   const shift=frame*.006;camera.position.set(shift,7,20);camera.lookAt(shift,0,-27);renderer.render(scene,camera);
   const p=read();
   if(previous)for(const [name,[x1,x2,y1,y2]] of Object.entries(regions))for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
    const i=(y*width+x)*4;sums[name]+=Math.abs(luma(p,i)-luma(previous,i));samples[name]++;
   }
   previous=p;
  }
  return Object.fromEntries(Object.keys(sums).map(n=>[n,sums[n]/samples[n]]));
 };
 console.log('[atlas] baseline');const before=measure(false);window.showBefore=()=>measure(false);console.log('[atlas] filtered');const after=measure(true);window.showAfter=()=>measure(true);console.log('[atlas] comparison complete');
 // The same production sampling is used in Studio and ordinary chunk materials.
 return {resolution,before,after,reduction:Object.fromEntries(Object.keys(before).map(k=>[k,1-after[k]/before[k]])),glError:gl.getError()};
};

window.checkAtlasEdges=()=>{
 const size=128,tileSize=64,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let i=(y*size+x)*4;data[i]=x<64&&y<64?255:0;data[i+1]=x<64&&y<64?0:255;data[i+3]=255;}
 const texture=configureAtlasTexture(new THREE.DataTexture(data,size,size));texture.needsUpdate=true;
 const manager={atlasCanvas:{width:size,height:size},tileSize,atlasGridSize:2};
 const material=filterAtlasMaterial(new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}),manager);
 const g=new THREE.PlaneGeometry(1,1),uv=g.attributes.uv;
 for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)*63+.5)/size,(uv.getY(i)*63+.5)/size);
 const mesh=new THREE.Mesh(g,material),scene=new THREE.Scene();scene.background=new THREE.Color(0);scene.add(mesh);
 const cam=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,10);cam.position.z=2;
 let maxGreen=0,redPixels=0;
 for(const scale of [128,16,4,2]){
  mesh.scale.setScalar(scale);renderer.render(scene,cam);const p=read();
  for(let i=0;i<p.length;i+=4)if(p[i]>100){redPixels++;maxGreen=Math.max(maxGreen,p[i+1]);}
 }
 // A magnified two-color pixel pattern must retain discrete texels, not blur.
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=(x+y)%2?255:0;}
 texture.needsUpdate=true;mesh.scale.setScalar(256);renderer.render(scene,cam);const close=read();
 let blurredPixels=0,checkedPixels=0;
 for(let y=height/2-100;y<height/2+100;y++)for(let x=width/2-100;x<width/2+100;x++){
  const n=close[(y*width+x)*4];checkedPixels++;if(n>2&&n<253)blurredPixels++;
 }
 texture.dispose();g.dispose();material.dispose();return {maxGreen,redPixels,blurredPixels,checkedPixels,glError:gl.getError()};
};

window.checkPackReload=async()=>{
 const tm=currentTextures,uniform=tm.atlasFilteringUniforms.blockAtlasSize;
 await resourcePackManager.reorderPacks([]);
 window.showAfter();
 const result={dimensions:uniform.value.toArray(),sameUniform:uniform===tm.atlasFilteringUniforms.blockAtlasSize,maxMip:tm.atlasFilteringUniforms.blockAtlasMaxMip.value,glError:gl.getError()};
 await resourcePackManager.resetToDefault();window.showAfter();return result;
};

// Optional real-build smoke test. Use the production state mapper and mesher;
// stack 64-block mesh bands so the original 104-high schematic is all visible.
window.renderCastle=async bytes=>{
 const [{readSpongeSchematic},{gameBlockFromState},{Chunk,World,CHUNK_HEIGHT},{ChunkMesher},{enableBlockEmission}]=await Promise.all([
  import('../../src/io/codecs.js'),import('../../src/io/gameBlockStates.js'),import('../../src/world.js'),import('../../src/mesher.js'),import('../../src/blockGeometry.js')]);
 const {structure}=await readSpongeSchematic(Uint8Array.from(bytes));
 const tm=currentTextures,scene=new THREE.Scene();scene.background=new THREE.Color(0xb0cfdf);scene.add(new THREE.HemisphereLight(0xffffff,0xa2b3c2,1.7));
 const sun=new THREE.DirectionalLight(0xffffff,1.6);sun.position.set(-50,110,-40);scene.add(sun);
 const size=structure.main.size,all=new Uint16Array(size.x*size.y*size.z),bands=new Map(),mesher=new ChunkMesher(tm),fixed=[];
 for(const b of structure.main.blocks){
  const {x,y,z}=b.pos,{id,orientation}=gameBlockFromState(b.state),band=Math.floor(y/CHUNK_HEIGHT);
  all[x+z*size.x+y*size.x*size.z]=id;
  if(!bands.has(band))bands.set(band,{chunks:new Map(),orientations:new Map()});
  const layer=bands.get(band),cx=Math.floor(x/16),cz=Math.floor(z/16),key=`${cx},${cz}`;
  if(!layer.chunks.has(key))layer.chunks.set(key,new Chunk(cx,cz));
  layer.chunks.get(key).setVoxel(x%16,y%CHUNK_HEIGHT,z%16,id);
  if(orientation)World.prototype.applyStructureOrientation.call({structureOrientations:layer.orientations},{x,y:y%CHUNK_HEIGHT,z,id,...orientation});
 }
 for(const [band,layer] of bands){
  const world={structureOrientations:layer.orientations,getVoxel:(x,y,z)=>{
   y+=band*CHUNK_HEIGHT;return x<0||z<0||y<0||x>=size.x||z>=size.z||y>=size.y?0:all[x+z*size.x+y*size.x*size.z];
  }};
  for(const chunk of layer.chunks.values()){
   const geos=mesher.meshChunk(chunk,world);
   for(const [slot,material] of [['opaqueGeo',tm.opaqueMaterial],['transparentGeo',tm.transparentMaterials||tm.transparentMaterial],['lightGeo',tm.lightMaterial],['waterGeo',tm.waterMaterial]])if(geos[slot]){
    const mesh=new THREE.Mesh(geos[slot],material);mesh.position.y=band*CHUNK_HEIGHT;scene.add(mesh);
    if(slot!=='waterGeo')fixed.push({mesh,material,slot});
   }
  }
 }
 const cam=new THREE.PerspectiveCamera(53,width/height,.1,800);cam.position.set(-65,118,-106);cam.lookAt(72,29,77);
 window.castleBefore=()=>{
  tm.atlasTexture.minFilter=THREE.NearestFilter;tm.atlasTexture.generateMipmaps=false;tm.atlasTexture.needsUpdate=true;
  for(const o of fixed){const clone=m=>{const c=m.clone();enableBlockEmission(c);return c;};o.mesh.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);}
  renderer.render(scene,cam);read();
 };
 window.castleAfter=()=>{
  configureAtlasTexture(tm.atlasTexture);tm.atlasTexture.needsUpdate=true;for(const o of fixed)o.mesh.material=o.material;
  renderer.render(scene,cam);read();
 };
 window.castleProbe={tm,scene,cam,renderer,fixed,sun};
 window.castleAfter();return {blocks:structure.main.blocks.length,meshes:fixed.length,glError:gl.getError()};
};
