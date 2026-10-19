import * as THREE from 'three';
import { configureCutoutMaterial } from '../../src/vegetationRendering.js';
import { createStairGeometry } from '../../src/slab.js';
import { LightweightShader } from '../../src/lightweightShader.js';
import { configureSunShadows, followSun } from '../../src/lighting.js';
import { markWater, markOverWater } from '../../src/waterPass.js';

function pixels(renderer,w,h){const gl=renderer.getContext(),p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
function gameFor(renderer,scene,camera,sun,textures={}){
 return {renderer,scene,camera,sunLight:sun,textures,blockLighting:{lights:[]},weather:{rainIntensity:0},
  sky:{horizonColor:new THREE.Color(0xb0cfdf),sunDirection:new THREE.Vector3(0,1,.35).normalize(),uniforms:{uEnhanced:{value:0},uTwilight:{value:0}}}};
}

window.testRoofEdges=()=>{
 const w=512,h=384,results={};
 for(const enhanced of [false,true])for(const fixed of [false,true]){
  const renderer=new THREE.WebGLRenderer({antialias:false,stencil:true,preserveDrawingBuffer:true});renderer.setSize(w,h);renderer.autoClear=false;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x101010);scene.add(new THREE.HemisphereLight(0xffffff,0x222222,.5));
  const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-30,45,-35);scene.add(sun);
  const g=createStairGeometry({textures:{all:'tile'}},{getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})},2);
  const mat=new THREE.MeshLambertMaterial({color:0xaaaaaa});
  const mesh=new THREE.InstancedMesh(g,mat,40*24),m=new THREE.Matrix4();
  for(let z=0;z<24;z++)for(let x=0;x<40;x++){m.makeTranslation(x-20,z,z);mesh.setMatrixAt(z*40+x,m);}scene.add(mesh);
  const cam=new THREE.PerspectiveCamera(55,w/h,.1,300),fx=new LightweightShader(gameFor(renderer,scene,cam,sun),{storage:{getItem:()=>null}});
  fx.setEnabled(enhanced);
  fx.edgeAntialiasing=fixed;
  if(enhanced&&!fixed){fx.compositeMaterial.fragmentShader=fx.compositeMaterial.fragmentShader.replace('ApplyFXAA(sceneColor,sceneTexel,vUv).rgb','texture2D(sceneColor,vUv).rgb');fx.compositeMaterial.needsUpdate=true;}
  const frames=[];
  for(let frame=0;frame<12;frame++){
   const shift=frame*.012;cam.position.set(4+shift,30,-29);cam.lookAt(shift,10,13);fx.render(.04);frames.push(pixels(renderer,w,h));
  }
  let squared=0,count=0;
  for(let f=2;f<frames.length;f++)for(let y=50;y<h-35;y++)for(let x=50;x<w-50;x++){
   const i=(y*w+x)*4,d=frames[f][i]-2*frames[f-1][i]+frames[f-2][i];squared+=d*d;count++;
  }
  results[`${enhanced?'effects':'normal'}-${fixed?'fixed':'before'}`]={temporalRms:Math.sqrt(squared/count),glError:renderer.getContext().getError(),effectsEnabled:fx.enabled};
  fx.dispose();g.dispose();mat.dispose();renderer.dispose();renderer.forceContextLoss();
 }
 return results;
};

window.testFoliageOrdering=()=>{
 const w=128,h=128,renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.setSize(w,h);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x334455);
 const cam=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);cam.position.z=5;
 const texture=new THREE.DataTexture(new Uint8Array([255,255,255,192]),1,1);texture.needsUpdate=true;
 const g=new THREE.PlaneGeometry(1.6,1.6);
 const results={};
 for(const fixed of [false,true]){
  const red=new THREE.MeshBasicMaterial({map:texture,color:0xff0000,transparent:true,depthWrite:false,alphaTest:.2});
  const blue=red.clone();blue.color.set(0x0000ff);
  if(fixed){configureCutoutMaterial(red);configureCutoutMaterial(blue);}
  const near=new THREE.Mesh(g,red),far=new THREE.Mesh(g,blue);near.position.z=.2;scene.add(near,far);
  const frames=[];
  for(const order of [0,1]){near.renderOrder=order;far.renderOrder=1-order;renderer.render(scene,cam);frames.push(pixels(renderer,w,h));}
  let changed=0;
  for(let y=30;y<98;y++)for(let x=30;x<98;x++){const i=(y*w+x)*4;if(Math.abs(frames[0][i]-frames[1][i])+Math.abs(frames[0][i+2]-frames[1][i+2])>2)changed++;}
  results[fixed?'fixed':'before']={changedPixels:changed,glError:renderer.getContext().getError()};
  scene.remove(near,far);red.dispose();blue.dispose();
 }
 texture.dispose();g.dispose();renderer.dispose();renderer.forceContextLoss();return results;
};

const castleModes=new Map();
window.captureCastleArtifacts=(view,fixed,enhanced)=>{
 const p=window.castleProbe,key=`${fixed}-${enhanced}`;
 if(!castleModes.has(key)){
  const renderer=new THREE.WebGLRenderer({antialias:false,stencil:true,preserveDrawingBuffer:true});renderer.setSize(1024,700);renderer.autoClear=false;
  const game=gameFor(renderer,p.scene,p.cam,p.sun,p.tm),fx=new LightweightShader(game,{storage:{getItem:()=>null}});
  fx.waterMeshes=()=>p.scene.children.filter(m=>m.material===p.tm.waterMaterial);
  fx.setEnabled(enhanced);
  fx.edgeAntialiasing=fixed;
  if(enhanced&&!fixed){fx.compositeMaterial.fragmentShader=fx.compositeMaterial.fragmentShader.replace('ApplyFXAA(sceneColor,sceneTexel,vUv).rgb','texture2D(sceneColor,vUv).rgb');fx.compositeMaterial.needsUpdate=true;}
  castleModes.set(key,{renderer,fx,game});
 }
 const {renderer,fx,game}=castleModes.get(key);
 document.body.replaceChildren(renderer.domElement);
 p.cam.aspect=1024/700;p.cam.updateProjectionMatrix();
 if(view==='roof'){p.cam.position.set(72,88,52);p.cam.lookAt(72,43,112);}
 else{p.cam.position.set(72,49,-5);p.cam.lookAt(72,14,55);}
 for(const o of p.fixed){
  o.mesh.material=o.slot==='transparentGeo'&&!fixed?p.tm.transparentMaterial:o.material;
  o.mesh.castShadow=o.mesh.receiveShadow=true;
  if(o.slot==='transparentGeo')markOverWater(o.mesh);
 }
 for(const m of p.scene.children)if(m.material===p.tm.waterMaterial)markWater(m);
 if(!p.sun.target.parent)configureSunShadows(p.sun,p.scene);
 followSun(p.sun,game.sky.sunDirection,p.cam.position);
 // Reset per-frame state when returning to a cached test renderer.
 fx.setEnabled(enhanced,false);fx.render(.04);
 return {glError:renderer.getContext().getError(),effectsEnabled:fx.enabled,drawCalls:renderer.info.render.calls};
};

window.finishArtifactTests=()=>{for(const {renderer,fx} of castleModes.values()){fx.dispose();renderer.dispose();renderer.forceContextLoss();}castleModes.clear();};
