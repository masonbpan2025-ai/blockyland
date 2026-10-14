import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEnvironmentLight, updateOutdoorLighting } from '../src/lighting.js';
import { Sky } from '../src/sky.js';
import { World, Chunk } from '../src/world.js';
import { ChunkMesher } from '../src/mesher.js';
import { BLOCKS } from '../src/blocks.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { snowDaylightStrength } from '../src/snowShading.js';
import { overworldFogRange } from '../src/atmosphere.js';

const tm = {getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};
function fixture(time, enhanced=false) {
  const scene=new THREE.Scene(),sky=new Sky(scene),ambient=createEnvironmentLight(),sun=new THREE.DirectionalLight(),moon=new THREE.DirectionalLight();
  sky.setTime(time);updateOutdoorLighting(ambient,sun,moon,sky,enhanced);
  return {sky,ambient,sun,moon};
}
test('clear daylight supplies brighter, cool reflected fill and near-white sunlight',()=>{
  for(const enabled of [false,true]){
    const {ambient,sun}=fixture(6000,enabled);
    assert.ok(ambient.isHemisphereLight);
    // Side-facing Lambert fill: half sky and half ground, compared to the old .58 ambient.
    const sideFill=(ambient.color.r+ambient.groundColor.r)*.5*ambient.intensity;
    assert.ok(sideFill>.58*1.5,'white surfaces are readable even on faces away from the sun');
    assert.ok(ambient.color.b>ambient.color.r,'shaded snow has a cool skylight tint');
    assert.ok(sun.color.b>.9 && sun.intensity>2,'midday sunlight does not turn snow dull yellow-grey');
  }
});
test('sunrise is dimmer than noon, night stays dark, and moon lighting remains active',()=>{
  const dawn=fixture(0),noon=fixture(6000),night=fixture(18000);
  assert.ok(dawn.ambient.intensity<noon.ambient.intensity);
  assert.ok(dawn.ambient.intensity>night.ambient.intensity*5);
  assert.equal(night.sun.intensity,0);assert.ok(night.ambient.intensity<=.1);assert.ok(night.moon.intensity>.1);
});
test('returning from a tinted dimension restores both hemisphere colours',()=>{
  const f=fixture(6000);const expected=f.ambient.clone();f.ambient.color.setHex(0x662222);f.ambient.groundColor.setHex(0x662222);
  updateOutdoorLighting(f.ambient,f.sun,f.moon,f.sky);
  assert.ok(f.ambient.color.equals(expected.color));assert.ok(f.ambient.groundColor.equals(expected.groundColor));
});
for(const id of [BLOCKS.SNOW,BLOCKS.POWDER_SNOW,BLOCKS.SNOW_LAYER])test(`snow ${id}: real mesh has distinct top/side contrast and no emission`,()=>{
  const world=new World(1,'frozen_peaks'),chunk=new Chunk(0,0);world.chunks.set('0,0',chunk);chunk.setVoxel(8,20,8,id);
  const meshes=new ChunkMesher(tm).meshChunk(chunk,world),g=id===BLOCKS.SNOW_LAYER?meshes.lightGeo:id===BLOCKS.POWDER_SNOW?meshes.transparentGeo:meshes.opaqueGeo;
  const normals=g.attributes.normal,colors=g.attributes.color;
  for(let i=0;i<normals.count;i++){
    const expected=normals.getY(i)>.5?[1,1,1]:normals.getY(i)<-.5?[.25,.28,.32]:Math.abs(normals.getX(i))>.5?[.32,.40,.52]:[.50,.58,.70];
    for(const [c,getter] of ['getX','getY','getZ'].entries())assert.ok(Math.abs(colors[getter](i)-expected[c])<1e-6);
  }
  if(g.attributes.emission)assert.ok([...g.attributes.emission.array].every(v=>v===0));
  Object.values(meshes).forEach(x=>x?.dispose?.());
});

test('snow sky fill remains white at dawn and overcast noon, but shuts off at night',()=>{
  assert.ok(snowDaylightStrength(0)>.96);
  assert.ok(snowDaylightStrength(1,1)>.94);
  assert.equal(snowDaylightStrength(-1),0);
});
test('fog follows the loaded view distance and preserves the middle-distance ridge contrast',()=>{
  for(const distance of [4,8,12])for(const rain of [0,.5,1]){
    const f=overworldFogRange(distance,rain);assert.ok(f.near>distance*16*.55);assert.ok(f.far<=distance*16);assert.ok(f.far>f.near);
  }
  assert.ok(overworldFogRange(8).near>90,'mountains 80 blocks away are not fogged out');
});
test('the snow skylight mask lights exposed faces but never snow beneath a roof',()=>{
  for(const roof of [false,true]){
    const world=new World(1,'frozen_peaks'),chunk=new Chunk(0,0);world.chunks.set('0,0',chunk);chunk.setVoxel(8,20,8,BLOCKS.SNOW);
    if(roof)for(let x=7;x<=9;x++)for(let z=7;z<=9;z++)chunk.setVoxel(x,24,z,BLOCKS.STONE);
    const geometry=new ChunkMesher(tm).meshChunk(chunk,world).opaqueGeo;
    const mask=[...geometry.attributes.snowExposure.array];
    assert.ok(roof?mask.every(x=>x===0):mask.filter(x=>x===1).length===20,'roofed snow must not become self-lit');
    geometry.dispose();
  }
});
test('snow exposure samples roofs across chunk borders',()=>{
  const world=new World(1,'frozen_peaks'),chunk=new Chunk(0,0),east=new Chunk(1,0);world.chunks.set('0,0',chunk);world.chunks.set('1,0',east);
  chunk.setVoxel(15,20,8,BLOCKS.SNOW);east.setVoxel(0,24,8,BLOCKS.STONE);
  const geometry=new ChunkMesher(tm).meshChunk(chunk,world).opaqueGeo;
  for(let i=0;i<geometry.attributes.normal.count;i++){
    const nx=geometry.attributes.normal.getX(i);
    if(nx===1)assert.equal(geometry.attributes.snowExposure.getX(i),0);
    if(nx===-1)assert.equal(geometry.attributes.snowExposure.getX(i),1);
  }
  geometry.dispose();
});
test('ordinary carpets and stone keep their existing vertex tint',()=>{
  for(const id of [BLOCKS.WHITE_CARPET,BLOCKS.STONE]){
    const geometry=createBlockGeometry(id,tm);assert.ok([...geometry.attributes.color.array].every(v=>v===1));geometry.dispose();
  }
});
