import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {World,Chunk} from '../src/world.js';
import {BLOCKS as B} from '../src/blocks.js';
import {blockEmission} from '../src/spawning/lightEngine.js';
import {ChestManager} from '../src/chest.js';
import {redstoneGeometry} from '../src/redstoneGeometry.js';

export function circuitWorld(){const w=new World(4289);for(let x=-2;x<4;x++)for(let z=-2;z<3;z++)w.chunks.set(w.chunkKey(x,z),new Chunk(x,z));return w;}
const put=(w,p,id,dir=0)=>{w.setVoxel(...p,id);w.redstone.configure(p,dir);return w.redstone.state(p);};
const ticks=(w,n=1)=>{for(let i=0;i<n;i++)w.redstone.tick();};

test('wire follows horizontal shape, cannot power above, and isolated dot can be toggled',()=>{
 const w=circuitWorld(),r=w.redstone;put(w,[0,2,0],B.LEVER).on=true;for(let x=1;x<4;x++)put(w,[x,2,0],B.REDSTONE_WIRE);
 const side=put(w,[2,2,1],B.REDSTONE_LAMP),above=put(w,[2,3,0],B.REDSTONE_LAMP);ticks(w);assert.equal(side.on,false);assert.equal(above.on,false);
 put(w,[2,2,1],B.REDSTONE_WIRE);const end=put(w,[2,2,2],B.REDSTONE_LAMP);ticks(w);assert.equal(end.on,true);
 const dot=put(w,[10,2,0],B.REDSTONE_WIRE);r.interact(dot.p);ticks(w);assert.deepEqual(dot.connections,[]);
});

test('weak power activates mechanisms and repeaters, but cannot feed another wire through a block',()=>{
 const w=circuitWorld(),r=w.redstone;put(w,[0,2,0],B.REDSTONE_BLOCK);put(w,[1,2,0],B.REDSTONE_WIRE);put(w,[2,2,0],B.STONE);
 const lamp=put(w,[2,3,0],B.REDSTONE_LAMP),wire=put(w,[2,2,1],B.REDSTONE_WIRE),rep=put(w,[3,2,0],B.REPEATER);ticks(w,2);
 assert.equal(lamp.on,true);assert.equal(rep.output,15);assert.equal(wire.power,0);
 const lever=put(w,[2,1,0],B.LEVER);lever.attach=[0,1,0];lever.on=true;ticks(w);assert.equal(wire.power,15,'strongly powered block feeds wire');
});

test('glass and honey are nonconductors, slime conducts; vertically adjacent dust does not connect',()=>{
 for(const id of [B.GLASS,B.HONEY_BLOCK,B.SLIME_BLOCK]){const w=circuitWorld();put(w,[0,2,0],B.LEVER).on=true;put(w,[1,2,0],id);const lamp=put(w,[2,2,0],B.REDSTONE_LAMP);ticks(w);assert.equal(!!lamp.on,id===B.SLIME_BLOCK);}
 const w=circuitWorld();put(w,[0,2,0],B.REDSTONE_BLOCK);put(w,[1,2,0],B.REDSTONE_WIRE);const upper=put(w,[1,3,0],B.REDSTONE_WIRE);ticks(w);assert.equal(upper.power,0);
});

test('dust stairs transmit around conductive supports but an overhead conductor cuts the path',()=>{
 const w=circuitWorld();put(w,[0,2,0],B.REDSTONE_BLOCK);put(w,[1,2,0],B.REDSTONE_WIRE);put(w,[2,2,0],B.STONE);const upper=put(w,[2,3,0],B.REDSTONE_WIRE);ticks(w);assert.equal(upper.power,14);
 put(w,[1,3,0],B.STONE);ticks(w);assert.equal(upper.power,0);
});

test('repeaters lock only from sideways powered repeaters/comparators and freeze pending transitions',()=>{
 const w=circuitWorld(),r=w.redstone,rep=put(w,[0,2,0],B.REPEATER);rep.delay=4;
 put(w,[-1,2,0],B.LEVER).on=true;put(w,[0,2,1],B.REDSTONE_BLOCK);ticks(w,5);assert.equal(rep.output,15);assert.equal(rep.locked,false);
 w.setVoxel(0,2,1,B.AIR);const lock=put(w,[0,2,1],B.REPEATER,5);put(w,[0,2,2],B.REDSTONE_BLOCK);ticks(w,2);assert.equal(rep.locked,true);
 r.state([-1,2,0]).on=false;ticks(w,6);assert.equal(rep.output,15);
 w.setVoxel(0,2,2,B.AIR);ticks(w,6);assert.equal(rep.output,0);assert.equal(lock.output,0);
});

test('comparators reject side containers/torches, subtract dust, and discard sub-tick glitches',()=>{
 const w=circuitWorld(),c=put(w,[0,2,0],B.COMPARATOR);put(w,[-1,2,0],B.REDSTONE_BLOCK);put(w,[0,2,1],B.REDSTONE_TORCH);ticks(w,2);assert.equal(c.output,15);
 w.setVoxel(0,2,1,B.REDSTONE_BLOCK);c.subtract=true;ticks(w,2);assert.equal(c.output,0);
 w.setVoxel(0,2,1,B.AIR);w.setVoxel(-1,2,0,B.AIR);ticks(w,2);put(w,[-1,2,0],B.REDSTONE_BLOCK);ticks(w);w.setVoxel(-1,2,0,B.AIR);ticks(w);assert.equal(c.output,0);
});

test('wall torches invert their own support and never power that support themselves',()=>{
 const w=circuitWorld(),r=w.redstone;put(w,[0,2,0],B.STONE);const t=put(w,[1,2,0],B.REDSTONE_WALL_TORCH);t.attach=[-1,0,0];
 const l=put(w,[-1,2,0],B.LEVER);ticks(w,3);assert.equal(t.output,15);assert.equal(r.output(t,[0,2,0]),0);
 l.on=true;ticks(w,2);assert.equal(t.output,0);l.on=false;ticks(w,2);assert.equal(t.output,15);
});

test('lamps turn off after four game ticks and dynamic redstone light matches state',()=>{
 const w=circuitWorld(),l=put(w,[0,2,0],B.LEVER),lamp=put(w,[1,2,0],B.REDSTONE_LAMP);assert.equal(blockEmission(B.REDSTONE_LAMP,w,1,2,0),0);
 l.on=true;ticks(w);assert.equal(lamp.on,true);assert.equal(blockEmission(B.REDSTONE_LAMP,w,1,2,0),15);
 l.on=false;ticks(w,2);assert.equal(lamp.on,true);ticks(w);assert.equal(lamp.on,false);
 const torch=put(w,[8,2,0],B.REDSTONE_TORCH);torch.output=0;assert.equal(blockEmission(B.REDSTONE_TORCH,w,8,2,0),0);
});

test('Java QC remains latent until a neighbor update and then powers a piston',()=>{
 const w=circuitWorld(),r=w.redstone,p=put(w,[0,2,0],B.PISTON);ticks(w);
 put(w,[0,4,0],B.REDSTONE_BLOCK);ticks(w,3);assert.equal(p.extended,false,'distant source did not update base');
 w.setVoxel(1,2,0,B.STONE);ticks(w,3);assert.equal(p.extended,true);
 w.setVoxel(0,4,0,B.AIR);ticks(w,2);assert.equal(p.extended,true,'removal is also latent');
 w.setVoxel(1,2,0,B.AIR);ticks(w);assert.equal(p.extended,false);
});

test('target bullseyes on all six actual outer faces produce power 15',()=>{
 const w=circuitWorld(),r=w.redstone;put(w,[0,2,0],B.TARGET_BLOCK);
 for(const d of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){r.hitTarget([0,2,0],new THREE.Vector3(.5+d[0]*.5,2.5+d[1]*.5,.5+d[2]*.5));assert.equal(r.state([0,2,0]).output,15);}
});

test('full hoppers never delete incompatible chest items and preserve named filter stacks',()=>{
 const w=circuitWorld(),r=w.redstone,cm=new ChestManager({world:w});r.game={chestManager:cm};cm.placeChest(w,[0,3,0]);cm.addItem(0,3,0,'diamond',false,3);
 const h=put(w,[0,2,0],B.HOPPER);h.inventory=Array.from({length:5},(_,i)=>({id:i?'stick':'dirt',isBlock:false,count:1}));ticks(w,5);assert.equal(cm.getCombinedItems(0,3,0).filter(Boolean)[0].count,3);
 const src=put(w,[4,2,0],B.HOPPER),dest=put(w,[5,2,0],B.HOPPER);src.inventory=[{id:'stick',isBlock:false,count:2,name:'filter'}];dest.inventory=[{id:'stick',isBlock:false,count:2}];
 r.transferOne(src,dest);assert.equal(dest.inventory.length,2);assert.equal(dest.inventory[1].name,'filter');
});

test('hopper pickup takes a stack, waits eight game ticks, and cannot overfill a slot',()=>{
 const w=circuitWorld(),r=w.redstone,h=put(w,[0,2,0],B.HOPPER);const dropped=[{itemType:'diamond',isBlock:false,count:70,group:{position:new THREE.Vector3(.5,3,.5)}}];r.game={entities:{droppedItems:dropped}};
 ticks(w);assert.equal(h.inventory[0].count,64);assert.equal(h.inventory[1].count,6);assert.equal(dropped.length,0);
 dropped.push({itemType:'stick',isBlock:false,count:2,group:{position:new THREE.Vector3(.5,3,.5)}});ticks(w,3);assert.equal(dropped.length,1);ticks(w);assert.equal(dropped.length,0);
});

test('pending device events and cooldowns save as relative times',()=>{
 const w=circuitWorld(),r=w.redstone,d=put(w,[0,2,0],B.DROPPER);ticks(w,20);d.fireAt=r.tickNumber+2;d.transferAt=r.tickNumber+4;d.offAt=r.tickNumber+2;d.turnOffs=[r.tickNumber-2];
 const data=r.serialize();r.reset();for(const c of w.chunks.values())r.initChunk(c);r.restore(data);
 assert.equal(r.state([0,2,0]).fireAt,2);assert.equal(r.state([0,2,0]).transferAt,4);assert.deepEqual(r.state([0,2,0]).turnOffs,[-2]);
});

test('dust stairs have visible vertical traces and a locked repeater has a crossbar',()=>{
 const w=circuitWorld();put(w,[0,2,0],B.REDSTONE_BLOCK);const wire=put(w,[1,2,0],B.REDSTONE_WIRE);put(w,[2,2,0],B.STONE);put(w,[2,3,0],B.REDSTONE_WIRE);ticks(w);
 assert.deepEqual(wire.risers,[[1,0,0]]);
 const tm={getFaceUVs:()=>({u0:0,v0:0,u1:1,v1:1})};const geo=redstoneGeometry(B.REDSTONE_WIRE,tm,wire);geo.computeBoundingBox();assert.ok(geo.boundingBox.max.y>1);
 const free=redstoneGeometry(B.REPEATER,tm,{dir:0}),locked=redstoneGeometry(B.REPEATER,tm,{dir:0,locked:true});assert.notDeepEqual([...free.attributes.position.array],[...locked.attributes.position.array]);geo.dispose();free.dispose();locked.dispose();
});
