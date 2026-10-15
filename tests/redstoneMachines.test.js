import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {BLOCKS as B} from '../src/blocks.js';
import {redstoneBotFixture} from './helpers/redstoneBotFixture.js';
import {insertCrafter,craftPulse} from '../src/redstoneMachines.js';
import {blockEmission} from '../src/spawning/lightEngine.js';
import {RailSystem} from '../src/rails.js';

function fixture(){const f=redstoneBotFixture();f.r=f.world.redstone;f.drops=[];f.game.entities.spawnDroppedItem=(p,id,isBlock,count)=>f.drops.push({id,isBlock,count});f.put=(p,id,dir=0)=>{f.world.setVoxel(...p,id);f.r.configure(p,dir);return f.r.state(p);};f.tick=(n=1)=>{for(let i=0;i<n;i++)f.r.tick();};return f;}

test('crafter balances enabled slots, preserves metadata and its sparse saved grid',()=>{
 const f=fixture(),c=f.put([0,2,0],B.CRAFTER);c.disabled=[false,true,false,true,true,true,true,true,true];
 assert.equal(insertCrafter(c,{id:B.OAK_PLANKS,isBlock:true,count:4},4),4);assert.equal(c.inventory[0].count,2);assert.equal(c.inventory[2].count,2);assert.equal(c.inventory[1],undefined);
 assert.equal(insertCrafter(c,{id:B.OAK_PLANKS,isBlock:true,name:'Named'},1),0);
 assert.equal(f.r.getContainerSignal(c.p),9);
 const saved=f.r.serialize();f.r.reset();f.r.initChunk(f.world.getChunk(0,0));f.r.restore(saved);const restored=f.r.state(c.p);assert.equal(restored.inventory[2].count,2);assert.equal(restored.inventory[1],null);assert.equal(restored.disabled[1],true);
});

test('crafter waits four game ticks, crafts once per rising edge into actual trapped chest storage',()=>{
 const f=fixture(),c=f.put([0,2,0],B.CRAFTER),lever=f.put([0,2,1],B.LEVER);
 f.put([1,2,0],B.TRAPPED_CHEST);f.game.chestManager.placeChest(f.world,[1,2,0]);
 c.inventory=[{id:B.OAK_LOG,isBlock:true,count:2}];lever.on=true;f.tick(2);assert.equal(c.inventory[0].count,2);f.tick();assert.equal(c.inventory[0].count,1);
 assert.equal(f.game.chestManager.getCombinedItems(1,2,0).find(Boolean).count,4);assert.equal(f.r.state([1,2,0]).inventory.length,0);f.tick(8);assert.equal(c.inventory[0].count,1);
 lever.on=false;f.tick();lever.on=true;f.tick(3);assert.equal(c.inventory[0],null);assert.equal(f.game.chestManager.getCombinedItems(1,2,0).find(Boolean).count,8);
});

test('crafter ejects a complete result when its destination is full; extraction keeps grid coordinates',()=>{
 const f=fixture(),c=f.put([0,2,0],B.CRAFTER),h=f.put([1,2,0],B.HOPPER);h.inventory=Array.from({length:5},()=>({id:'diamond',count:64,isBlock:false}));
 c.inventory=[null,null,null,null,{id:B.OAK_LOG,isBlock:true,count:1}];assert.equal(craftPulse(f.r,c),true);assert.deepEqual(f.drops,[{id:B.OAK_PLANKS,isBlock:true,count:4}]);
 c.inventory=[null,null,{id:'stick',isBlock:false,count:1},null,{id:'diamond',isBlock:false,count:1}];h.inventory=[];assert.equal(f.r.transferOne(c,h),true);assert.equal(c.inventory[2],null);assert.equal(c.inventory[4].id,'diamond');
});

test('all copper bulb oxidation stages toggle on edges and expose actual light and comparator state',()=>{
 for(const [id,light]of [[B.COPPER_BULB,15],[B.EXPOSED_COPPER_BULB,12],[B.WEATHERED_COPPER_BULB,8],[B.OXIDIZED_COPPER_BULB,4]]){
 const f=fixture(),bulb=f.put([0,2,0],id),lever=f.put([-1,2,0],B.LEVER);assert.equal(blockEmission(id,f.world,0,2,0),0);
 lever.on=true;f.tick(4);assert.equal(bulb.on,true);assert.equal(blockEmission(id,f.world,0,2,0),light);assert.equal(f.r.getContainerSignal(bulb.p),15);
 lever.on=false;f.tick(3);assert.equal(bulb.on,true);lever.on=true;f.tick();assert.equal(bulb.on,false);assert.equal(blockEmission(id,f.world,0,2,0),0);}
});

test('trapped chest retains identity, powers while open, and uses real inventory for hopper and dropper',()=>{
 const f=fixture(),p=[1,2,0];f.put(p,B.TRAPPED_CHEST);f.game.chestManager.placeChest(f.world,p);assert.equal(f.world.getVoxel(...p),B.TRAPPED_CHEST);
 f.game.chestManager.openChestPos=p;f.tick();assert.equal(f.r.state(p).output,1);f.game.chestManager.openChestPos=null;f.tick();assert.equal(f.r.state(p).output,0);
 const d=f.put([0,2,0],B.DROPPER);d.inventory=[{id:'diamond',count:2,isBlock:false}];f.r.dispense(d);assert.equal(f.game.chestManager.getCombinedItems(...p).find(Boolean).count,1);assert.equal(d.inventory[0].count,1);
 const h=f.put([1,1,0],B.HOPPER);assert.equal(f.r.hopperPull(h),true);assert.equal(h.inventory[0].id,'diamond');assert.equal(f.game.chestManager.getCombinedItems(...p).filter(Boolean).length,0);
});

test('full container destinations do not make a dropper eject or lose items',()=>{
 for(const id of [B.CHEST,B.TRAPPED_CHEST]){const f=fixture(),d=f.put([0,2,0],B.DROPPER);f.put([1,2,0],id);f.game.chestManager.placeChest(f.world,[1,2,0]);for(let i=0;i<27;i++)f.game.chestManager.setCombinedSlot(1,2,0,i,{id:'diamond',count:64,isBlock:false});d.inventory=[{id:'stick',count:1,isBlock:false}];f.r.dispense(d);assert.equal(d.inventory[0].count,1);assert.equal(f.drops.length,0);}
});

test('furnace extraction cannot delete a metadata-incompatible stack when the hopper is full',()=>{
 const f=fixture(),h=f.put([0,2,0],B.HOPPER);f.put([0,3,0],B.FURNACE);h.inventory=Array.from({length:5},()=>({id:'iron_ingot',count:1,isBlock:false}));let extracted=0;
 f.game.furnaceManager={getOrCreateFurnace:()=>({output:{id:'iron_ingot',isBlock:false,count:1,name:'Named'}}),extractItem(){extracted++;}};
 f.r.hopperPull(h);assert.equal(extracted,0);assert.equal(h.inventory.reduce((n,i)=>n+i.count,0),5);
});

test('powered rails carry power for eight further rails along their own axis and type',()=>{
 const f=fixture();for(let x=0;x<11;x++)f.put([x,2,0],B.POWERED_RAIL);f.put([-1,2,0],B.REDSTONE_BLOCK);f.tick();
 assert.equal(f.r.railPowered([8,2,0]),true);assert.equal(f.r.railPowered([9,2,0]),false);
 f.put([4,2,0],B.ACTIVATOR_RAIL);assert.equal(f.r.railPowered([5,2,0]),false);f.put([4,2,0],B.POWERED_RAIL,4);assert.equal(f.r.railPowered([5,2,0]),false);
});

test('detector rail reads cart presence and cargo; activator ejects and controls hopper carts',()=>{
 const f=fixture(),rails=new RailSystem(f.world,f.game);f.game.railSystem=rails;
 f.put([0,2,0],B.DETECTOR_RAIL);const cart=rails.spawnCart([0,2,0],{subType:'chest_minecart'});f.tick();assert.equal(f.r.state([0,2,0]).output,15);assert.equal(f.r.getContainerSignal([0,2,0]),0);rails.addCartItem(cart,'diamond',false,64);assert.equal(f.r.getContainerSignal([0,2,0]),1);
 rails.remove(cart);f.tick();assert.equal(f.r.state([0,2,0]).output,0);
 f.put([0,2,0],B.ACTIVATOR_RAIL);const lever=f.put([0,2,1],B.LEVER);lever.on=true;f.tick();const rider={};const h=rails.spawnCart([0,2,0],{subType:'hopper_minecart',rider});rider.vehicle=h;rails.updateCarts(.1);assert.equal(h.hopperDisabled,true);assert.equal(h.rider,null);assert.equal(rider.vehicle,null);
 lever.on=false;f.tick();rails.updateCarts(.1);assert.equal(h.hopperDisabled,false);
});

test('activator rail primes a TNT minecart with a four-second fuse',()=>{
 const f=fixture(),rails=new RailSystem(f.world,f.game);f.game.railSystem=rails;f.put([0,2,0],B.ACTIVATOR_RAIL);f.put([0,2,1],B.REDSTONE_BLOCK);f.tick();const cart=rails.spawnCart([0,2,0],{subType:'tnt_minecart'});let exploded=0;rails.onEvent(t=>{if(t==='cart_explode')exploded++;});rails.updateCarts(.1);assert.equal(cart.primed,true);assert.ok(cart.fuse>3.8);rails.updateCarts(3.8);assert.equal(exploded,0);rails.updateCarts(.2);assert.equal(exploded,1);
});

test('TNT primes through a powered solid block once, but glass insulates it',()=>{
 for(const id of [B.STONE,B.GLASS]){const f=fixture(),primed=[];f.game.entities.spawnPrimedTNT=p=>primed.push(p);f.put([0,2,0],B.LEVER).on=true;f.put([1,2,0],id);f.put([2,2,0],B.TNT);f.tick(3);assert.equal(primed.length,id===B.STONE?1:0);}
});

test('pistons break fragile flowers with drops and ignore immovable neighbors alongside slime',()=>{
 const f=fixture(),p=f.put([0,2,0],B.PISTON);f.put([1,2,0],B.DANDELION);f.put([0,2,1],B.REDSTONE_BLOCK);f.tick();assert.equal(p.extended,true);assert.equal(f.world.getVoxel(2,2,0),B.AIR);assert.ok(f.drops.length>0);
 const g=fixture(),q=g.put([0,2,0],B.PISTON);g.put([1,2,0],B.SLIME_BLOCK);g.put([1,2,1],B.OBSIDIAN);g.put([0,2,-1],B.REDSTONE_BLOCK);g.tick();assert.equal(q.extended,true);assert.equal(g.world.getVoxel(2,2,0),B.SLIME_BLOCK);assert.equal(g.world.getVoxel(1,2,1),B.OBSIDIAN);
});
