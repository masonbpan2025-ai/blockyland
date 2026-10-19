import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { configureCutoutMaterial, vegetationTint } from '../src/vegetationRendering.js';
import { LightweightShader } from '../src/lightweightShader.js';

const textures={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};
test('a mixed chunk separates plant/leaf cutouts from glass/ice in at most two draw groups',()=>{
 const chunk=new Chunk(0,0);
 for(const [i,id] of [BLOCKS.ICE,BLOCKS.GLASS,BLOCKS.OAK_LEAVES,BLOCKS.SHORT_GRASS].entries())chunk.setVoxel(2+i*3,3,3,id);
 const g=new ChunkMesher(textures).meshChunk(chunk,{getVoxel:(x,y,z)=>chunk.getVoxel(x,y,z)}).transparentGeo;
 assert.deepEqual(g.groups.map(g=>g.materialIndex),[0,1]);
 assert.equal(g.groups.reduce((n,g)=>n+g.count,0),g.index.count);
 for(const group of g.groups)for(let i=group.start;i<group.start+group.count;i++){
  const vertex=g.index.getX(i),x=g.attributes.position.getX(vertex);
  assert.ok(group.materialIndex===0?x<7:x>=8,'each draw contains only the intended kind of block');
 }
 g.dispose();
});

test('grass, fern and vine masks receive green tint while flowers and coloured leaves retain their artwork',()=>{
 for(const id of [BLOCKS.SHORT_GRASS,BLOCKS.FERN,BLOCKS.TALL_GRASS,BLOCKS.LARGE_FERN]){
  const chunk=new Chunk(0,0);chunk.setVoxel(4,2,4,id);
  const g=new ChunkMesher(textures).meshChunk(chunk,{getVoxel:(x,y,z)=>chunk.getVoxel(x,y,z)}).transparentGeo;
  const color=g.attributes.color;
  assert.ok(color.getY(0)>color.getX(0)&&color.getX(0)>color.getZ(0));
  assert.ok(g.groups.every(g=>g.materialIndex===1));g.dispose();
 }
 assert.equal(vegetationTint(BLOCK_DEFS[BLOCKS.POPPY]),null);
 const vine=createBlockGeometry(BLOCKS.VINE,textures);
 assert.ok(vine.attributes.color.getY(0)>vine.attributes.color.getX(0));vine.dispose();
 assert.equal(vegetationTint({name:'Cherry Leaves'}),null);
});

test('cutout depth testing leaves glass material settings intact',()=>{
 const glass=new THREE.MeshLambertMaterial({transparent:true,depthWrite:false,alphaTest:.2});
 const cutout=configureCutoutMaterial(glass.clone());
 assert.equal(cutout.transparent,false);assert.equal(cutout.depthWrite,true);assert.equal(cutout.alphaTest,.5);
 assert.equal(glass.transparent,true);assert.equal(glass.depthWrite,false);glass.dispose();cutout.dispose();
});

test('effects antialiasing tracks render-target resolution through resize without extra passes',()=>{
 let w=800,h=600,calls=0;
 const game={renderer:{shadowMap:{},getDrawingBufferSize:v=>v.set(w,h),setRenderTarget(){},clear(){},render(){calls++;}},
 scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),sunLight:new THREE.DirectionalLight(),
 sky:{horizonColor:new THREE.Color(0xb0cfdf),sunDirection:new THREE.Vector3(0,1,0),uniforms:{uTwilight:{value:0},uEnhanced:{value:0}}},textures:{},blockLighting:{lights:[]}};
 const fx=new LightweightShader(game,{storage:{getItem:()=>null}});fx.setEnabled(true);fx.render(.04);
 assert.deepEqual(fx.compositeMaterial.uniforms.sceneTexel.value.toArray(),[1/800,1/600]);
 assert.equal(calls,3,'one scene render plus the existing glow and composite');
 w=1024;h=512;fx.render(.04);
 assert.deepEqual(fx.compositeMaterial.uniforms.sceneTexel.value.toArray(),[1/1024,1/512]);fx.dispose();
});
