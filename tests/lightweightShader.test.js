import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {LightweightShader,shaderTargetSize,SHADER_STORAGE_KEY,RenderScaleGovernor,compositeFragment} from '../src/lightweightShader.js';import {Sky} from '../src/sky.js';import {createWaterMaterial} from '../src/water.js';import {World,Chunk} from '../src/world.js';import {ChunkMesher} from '../src/mesher.js';import {BLOCKS} from '../src/blocks.js';
function setup(){let calls=0,width=1920,height=1080;const renderer={shadowMap:{},getDrawingBufferSize(v){return v.set(width,height);},setRenderTarget(){},clear(){},render(){calls++;}};const scene=new THREE.Scene();scene.fog=new THREE.Fog(0x9abacb,10,150);const sky=new Sky(scene);sky.setTime(6000);const water=createWaterMaterial();const game={renderer,scene,sky,camera:new THREE.PerspectiveCamera(70,16/9,.1,1000),sunLight:new THREE.DirectionalLight(),blockLighting:{lights:[new THREE.PointLight(),new THREE.PointLight()]},textures:{waterUniforms:water.uniforms,waterMaterial:water},weather:{rainIntensity:0}};let saved=null;const storage={getItem:()=>saved,setItem:(k,v)=>{assert.equal(k,SHADER_STORAGE_KEY);saved=v;}};return {game,storage,calls:()=>calls,resize(){width=800;height=600;}};}
test('render-target budget keeps 1080p sharp, caps larger displays, and handles zero size',()=>{for(const [w,h]of [[3840,2160],[1920,1080],[1903,950],[800,600],[0,0]]){const s=shaderTargetSize(w,h);assert.ok(s.width<=1920&&s.width*s.height<2076000);assert.ok(s.width>0&&s.height>0);if(w&&h)assert.ok(Math.abs(s.width/s.height-w/h)<.01);if(w===1920||w===1903)assert.deepEqual(s,{width:w,height:h});}});
test('toggle persists, gates effects, and retains the normal edge filter',()=>{const x=setup(),fx=new LightweightShader(x.game,{storage:x.storage});assert.equal(fx.enabled,false);fx.render(.016);assert.equal(x.calls(),2);assert.equal(fx.targets,null);assert.ok(fx.edgeTarget);fx.setEnabled(true);assert.equal(x.game.sky.uniforms.uEnhanced.value,1);assert.equal(x.game.textures.waterUniforms.uEnhanced.value,1);assert.equal(x.game.blockLighting.lights.filter(l=>l.castShadow).length,1);fx.render(.04);assert.equal(x.calls(),5);assert.ok(fx.targets);assert.equal(fx.edgeTarget,null);const target=fx.targets.scene;fx.render(.01);assert.equal(fx.targets.scene,target);let disposed=false;target.addEventListener('dispose',()=>disposed=true);fx.setEnabled(false);assert.equal(disposed,true);assert.equal(fx.targets,null);assert.equal(x.game.renderer.shadowMap.enabled,false);assert.equal(x.game.weather.enhanced,false);fx.dispose();});
test('resize replaces targets and persisted preference survives reconstruction',()=>{const x=setup(),fx=new LightweightShader(x.game,{storage:x.storage});fx.setEnabled(true);fx.render(.016);const old=fx.targets.scene;let disposed=false;old.addEventListener('dispose',()=>disposed=true);x.resize();fx.render(.016);assert.equal(disposed,true);assert.equal(fx.targets.scene.width,800);assert.equal(fx.targets.glow.width,200);fx.dispose();const next=new LightweightShader(x.game,{storage:x.storage});assert.equal(next.enabled,true);next.dispose();});
test('foliage has wind weights while terrain vertices remain fixed',()=>{const w=new World(),c=new Chunk(0,0);w.chunks.set('0,0',c);w.setVoxel(2,2,2,BLOCKS.OAK_LEAVES);w.setVoxel(4,2,2,BLOCKS.STONE);const tm={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};const meshes=new ChunkMesher(tm).meshChunk(c,w);assert.ok([...meshes.transparentGeo.attributes.wind.array].every(v=>v===1));assert.ok([...meshes.opaqueGeo.attributes.wind.array].every(v=>v===0));});
test('storage failure does not prevent toggling and repeated toggles keep no stale targets',()=>{const x=setup(),fx=new LightweightShader(x.game,{storage:{getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}});for(let i=0;i<5;i++){fx.setEnabled(true);fx.render(.01);fx.setEnabled(false);assert.equal(fx.targets,null);}fx.dispose();});

// After Luxium's "Spatial Resolution": the world and its effects drawn below the screen's resolution when the frame
// rate falls, upscaled and sharpened; the HUD is page elements, untouched.
/** `n` of the governor's one-second judgements, every frame taking `ms`. */
const seconds = (governor, ms, n) => { for (let w = 0; w < n; w++) do governor.frame(ms); while (governor.elapsed !== 0); };

test('the render scale steps down a tenth a second while frames are slow, never below its floor', () => {
  const g = new RenderScaleGovernor();
  assert.equal(g.scale, 1);
  seconds(g, 1000 / 60, 5);
  assert.equal(g.scale, 1, 'a 60 fps game is left alone');
  seconds(g, 1000 / 40, 1);
  assert.equal(g.scale, 0.9);
  seconds(g, 1000 / 30, 10);
  assert.equal(g.scale, RenderScaleGovernor.MIN);
  // A pause (a long frame) is not a slow frame.
  const h = new RenderScaleGovernor(); for (let i = 0; i < 20; i++) h.frame(2000);
  assert.equal(h.scale, 1);
});

test('the render scale steps back up when frames are quick, and waits longer before retrying a scale it had to leave', () => {
  const g = new RenderScaleGovernor();
  seconds(g, 1000 / 40, 1); assert.equal(g.scale, 0.9);
  // Full scale was left once, so it takes twice as long as usual to be tried again: no see-saw.
  seconds(g, 1000 / 60, RenderScaleGovernor.UP_AFTER); assert.equal(g.scale, 0.9, 'not after the usual wait');
  seconds(g, 1000 / 60, RenderScaleGovernor.UP_AFTER); assert.equal(g.scale, 1, 'after twice it');
  // Frames between the two marks hold the scale where it is.
  seconds(g, 1000 / 40, 1); assert.equal(g.scale, 0.9);
  seconds(g, 1000 / 53, 30); assert.equal(g.scale, 0.9);
});

test('the scene targets follow the render scale, and the composite sharpens only an upscaled world', () => {
  assert.deepEqual(shaderTargetSize(1920, 1080, 0.7), { width: 1344, height: 756 });
  assert.deepEqual(shaderTargetSize(1920, 1080, 1), { width: 1920, height: 1080 });
  const x = setup(), fx = new LightweightShader(x.game, { storage: x.storage });
  fx.setEnabled(true); fx.render(.016);
  assert.equal(fx.targets.scene.width, 1920);
  assert.equal(fx.compositeMaterial.uniforms.sharpen.value, 0, 'no sharpening, so no cost, at full scale');
  fx.setRenderScale(0.8); fx.render(.016);
  assert.equal(fx.targets.scene.width, 1536); assert.equal(fx.targets.glow.width, 384, 'the effects scale with it');
  assert.ok(fx.compositeMaterial.uniforms.sharpen.value > 0.4);
  fx.setRenderScale(null); assert.equal(fx.renderScale, fx.governor.scale);
  fx.dispose();
  // Sharpening is behind a uniform test; the haze takes the sun's colour towards the sun.
  assert.match(compositeFragment, /if\(sharpen>0\.0\)/);
  assert.match(compositeFragment, /dot\(ray,sunDirection\)/);
});
