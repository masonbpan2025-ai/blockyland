import { BLOCKS as B, BLOCK_DEFS, stackLimitFor } from './blocks.js';
import { fluidIdTables } from './waterSimulation.js';
import * as THREE from 'three';
import {baseBlockDrop} from './blockDrops.js';
import {BULBS,insertCrafter,craftPulse,extraAnalog,openCrafterPanel} from './redstoneMachines.js';
import {sheepApplyWool as updateSheepWool,rollSheepWoolCount} from './sheepBehavior.js';
import {spendDurability} from './durability.js';
// Buttons, pressure plates, torch burn-out and the comparator's container reading, per their wiki pages; see
// redstoneComponents.js. The engine ticks once per redstone tick (2 game ticks): a hold of n redstone ticks that
// starts at the next tick is `until = tickNumber + n + 1` (the output is on while `until > tickNumber`); one whose
// output is set at once (a struck rod, a hit target) is `tickNumber + n`.
import { BUTTON_HOLD, PLATE_KIND, plateSignal, plateReleaseTicks, TORCH_BURNOUT, containerSignal, daylightDetectorPower } from './redstoneComponents.js';
import { SCULK_SENSORS, initSensor, tickSensor, vibrate, sensorComparator } from './sculkSensor.js';
import { useLectern, lecternSignal } from './lectern.js';
import { anchorCharges, setCharges } from './respawnAnchor.js';

export const DIRECTIONS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key = p => p.join(',');
const add = (a,b,n=1) => a.map((v,i)=>v+b[i]*n);
const directional = new Set([B.REPEATER,B.COMPARATOR,B.OBSERVER,B.PISTON,B.STICKY_PISTON,B.PISTON_HEAD,B.DISPENSER,B.DROPPER,B.HOPPER,B.CRAFTER,B.RAIL,B.POWERED_RAIL,B.ACTIVATOR_RAIL,B.DETECTOR_RAIL,B.TRIPWIRE_HOOK]);
const adhesive = id => id===B.SLIME_BLOCK || id===B.HONEY_BLOCK;
const samePos = (a,b) => a[0]==b[0]&&a[1]==b[1]&&a[2]==b[2]; // what comparing key(a) with key(b) answered
const HORIZONTAL=[DIRECTIONS[0],DIRECTIONS[1],DIRECTIONS[4],DIRECTIONS[5]];
const TORCHES=new Set([B.REDSTONE_TORCH,B.REDSTONE_WALL_TORCH]);
const STRONG_SOURCES=new Set([B.OBSERVER,B.REPEATER,B.COMPARATOR,B.LEVER,...TORCHES,...BUTTON_HOLD.keys(),...PLATE_KIND.keys()]);
const FULL_CONDUCTORS=new Set([B.SLIME_BLOCK,B.TARGET_BLOCK,B.REDSTONE_LAMP,B.NOTE_BLOCK,B.DISPENSER,B.DROPPER]);
const INVENTORY_DEVICES=new Set([B.HOPPER,B.DISPENSER,B.DROPPER,B.CRAFTER]);
const stackIdentity=item=>JSON.stringify(Object.entries(item??{}).filter(([k])=>k!=='count').sort(([a],[b])=>a.localeCompare(b)));
const stacksMatch=(a,b)=>a.id===b.id&&!!a.isBlock===!!b.isBlock&&stackIdentity({...a,isBlock:!!a.isBlock})===stackIdentity({...b,isBlock:!!b.isBlock});
// The components whose behaviour in a tick depends on the power reaching them (lamps, pistons, doors, dispensers,
// droppers, note blocks, hoppers). Everything else -- a plain rail, a lever, a wire -- has no use for it, and
// working it out was ~40 lookups per state per tick: 442 rails in a loaded mineshaft cost 9 ms every redstone tick.
const READS_INPUT = new Set([B.REDSTONE_LAMP,B.PISTON,B.STICKY_PISTON,B.IRON_DOOR,B.IRON_DOOR_OPEN,B.IRON_TRAPDOOR,B.IRON_TRAPDOOR_OPEN,B.IRON_DOOR_TOP,B.IRON_DOOR_TOP_OPEN,
  B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN,B.DISPENSER,B.DROPPER,B.NOTE_BLOCK,B.HOPPER].filter(id=>id!==undefined));
for(const id of [B.CRAFTER,...BULBS])READS_INPUT.add(id);

export class Redstone {
  constructor(world){this.world=world;this.reset();}
  reset(){this.states=new Map();this.time=0;this.tickNumber=0;this.moving=false;this.updates=new Set();}
  loaded(p){return p[1]>=0&&p[1]<64&&!!this.world.getChunk(Math.floor(p[0]/16),Math.floor(p[2]/16));}
  id(p){return this.world.getVoxel(...p);}
  state(p){return this.states.get(key(p));}
  deviceInventory(state){return state&&INVENTORY_DEVICES.has(state.id);}
  updateNeighbors(p,y,z){const pos=Array.isArray(p)?p:[p,y,z];this.updates.add(key(pos));for(const d of DIRECTIONS){const q=add(pos,d);this.updates.add(key(q));const head=this.state(q);if(head?.id===B.PISTON_HEAD&&head.base)this.updates.add(key(head.base));}}
  mark(p){const c=this.world.getChunk(Math.floor(p[0]/16),Math.floor(p[2]/16));if(c)c.dirty=true;this.updateNeighbors(p);this.observe(p);const s=this.state(p);
    if(s&&STRONG_SOURCES.has(s.id))for(const d of DIRECTIONS){const q=add(p,d);if(this.conductor(q)&&this.strongOutput({...s,output:15},q)>0)this.updateNeighbors(q);}
    // Redstone dust updates every block within two of it (Java), which is what wakes a quasi-connected piston and lets
    // instant repeaters reset (Tutorial:Instant repeaters, Quasi-connectivity).
    if(s?.id===B.REDSTONE_WIRE)for(const d of DIRECTIONS)this.updateNeighbors(add(p,d));
    if(s&&(TORCHES.has(s.id)||s.id===B.REDSTONE_LAMP||BULBS.has(s.id)))this.world.light?.markBlockChanged?.(...p);
  }
  observe(p){if(this.moving)return;for(const d of DIRECTIONS){const s=this.state(add(p,d));if(s?.id===B.OBSERVER&&samePos(add(s.p,DIRECTIONS[s.dir]),p)&&s.observerAt===undefined&&!s.output)s.observerAt=this.tickNumber+1;}}
  notify(x,y,z){
    const p=[x,y,z],id=this.id(p),previous=this.state(p);
    this.updateNeighbors(p);
    // String: "A tripwire hook activates for 5 redstone ticks ... when any of its tripwires are destroyed, except when
    // shears are used to destroy the tripwire."
    if(previous?.id===B.TRIPWIRE&&id!==B.TRIPWIRE&&!this.shearing)for(const d of HORIZONTAL)for(let step=1;step<=40;step++){const q=add(p,d,step),hid=this.id(q);if(hid===B.TRIPWIRE)continue;if(hid===B.TRIPWIRE_HOOK){const h=this.state(q);if(h){h.brokenUntil=this.tickNumber+6;this.mark(q);}}break;}
    if(!this.moving&&previous?.id!==id&&previous?.inventory?.length&&this.game){const V=this.game.player.position.constructor;for(const item of previous.inventory.filter(Boolean))this.game.entities?.spawnDroppedItem?.(new V(x+.5,y+.5,z+.5),item.id,item.isBlock,item.count);}
    if(BLOCK_DEFS[id]?.redstone){
      const door = this.game?.doorManager?.getDoor(x,y,z) || this.world?.doorManager?.getDoor(x,y,z);
      const isDoorOrTrap = [B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN,B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN].includes(id);
      const manualOpen = door ? (door.manualOpen ?? door.open) : (previous?.manualOpen ?? (isDoorOrTrap ? (id===B.OAK_DOOR_OPEN||id===B.OAK_DOOR_TOP_OPEN||id===B.OAK_TRAPDOOR_OPEN) : false));
      if(previous?.id!==id){this.states.set(key(p),{p,id,dir:0,on:false,power:0,output:TORCHES.has(id)?15:0,delay:1,inventory:[],extended:false,manualOpen});if(SCULK_SENSORS.has(id))initSensor(this,this.state(p));}
    } else this.states.delete(key(p));
    if(!this.moving && previous?.extended && this.id(add(p,DIRECTIONS[previous.dir]))===B.PISTON_HEAD)this.world.setVoxel(...add(p,DIRECTIONS[previous.dir]),B.AIR);
    this.observe(p);
  }
  initChunk(c){if(c.voxels?.length===16384){const t=fluidIdTables().redstone,v=c.voxels;for(let i=0;i<v.length;i++)if(t[v[i]])this.notify(c.cx*16+(i&15),i>>8,c.cz*16+((i>>4)&15));return;}for(let y=0;y<64;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(BLOCK_DEFS[c.getVoxel(x,y,z)]?.redstone)this.notify(c.cx*16+x,y,c.cz*16+z);}
  configure(p,dir){const s=this.state(p);if(s&&directional.has(s.id)){s.dir=Math.max(0,Math.min(5,dir|0));this.mark(p);}}
  interact(p,sneak=false,held=null){
    const s=this.state(p);if(!s)return null;
    if(sneak&&directional.has(s.id)){if(s.extended)return 'Retract the piston before rotating it';s.dir=(s.dir+1)%6;this.mark(p);return 'Facing '+['east','west','up','down','south','north'][s.dir];}
    if(s.id===B.REDSTONE_WIRE){s.dot=!s.dot;this.mark(p);return s.dot?'Dust dot':'Dust cross';}
    if(s.id===B.CRAFTER){openCrafterPanel(this.game,this,s);return 'Crafter opened';}
    if(s.id===B.LEVER)s.on=!s.on;
    else if(BUTTON_HOLD.has(s.id))s.until=this.tickNumber+BUTTON_HOLD.get(s.id)+1;
    else if(s.id===B.REPEATER)s.delay=s.delay%4+1;
    else if(s.id===B.COMPARATOR)s.subtract=!s.subtract;
    else if(s.id===B.DAYLIGHT_DETECTOR){s.inverted=!s.inverted;s.forceUpdate=true;}
    else if(s.id===B.LECTERN)return useLectern(this,s,sneak,held);
    else if([B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN].includes(s.id)){
      const powered=this.input(s.p)>0;
      if(powered)return 'That door is being held by redstone';
      s.manualOpen=!s.manualOpen;
      const isDoor=[B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN].includes(s.id);
      const isTop=[B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN].includes(s.id);
      const wanted=isDoor?(s.manualOpen?(isTop?B.OAK_DOOR_TOP_OPEN:B.OAK_DOOR_OPEN):(isTop?B.OAK_DOOR_TOP:B.OAK_DOOR)):(s.manualOpen?B.OAK_TRAPDOOR_OPEN:B.OAK_TRAPDOOR);
      if(wanted!==s.id){
        this.world.setVoxel(...s.p,wanted);
        Object.assign(this.state(s.p),s,{id:wanted,on:s.manualOpen});
        if(isDoor && this.game?.doorManager){
          this.game.doorManager.setDoorOpen(s.p[0],s.p[1],s.p[2],s.manualOpen,false);
        }
      }
      this.mark(s.p);
      return s.manualOpen?'Door opened':'Door closed';
    }
    else if([B.DISPENSER,B.DROPPER,B.HOPPER].includes(s.id)){
      if(held&&held.count>0){const slot=s.inventory.find(i=>i.id===held.id&&i.isBlock===held.isBlock&&i.count<stackLimitFor(held.id));if(slot)slot.count++;else if(s.inventory.length<(s.id===B.HOPPER?5:9))s.inventory.push({...held,count:1});else return 'Container full';if(this.game?.player?.gamemode!=='creative')held.count--;}
      else {const slot=s.inventory[0];if(slot&&this.game?.inventory.addItem(slot.id,slot.isBlock,slot.count))s.inventory.shift();}
      return 'Stored items: '+s.inventory.reduce((n,i)=>n+i.count,0);
    } else if(s.id===B.NOTE_BLOCK){s.note=((s.note||0)+1)%25;this.mark(s.p);this.playNote(s);return 'Note: '+s.note;}
    else return null;
    this.mark(p);return s.id===B.REPEATER?'Repeater delay: '+s.delay+' redstone ticks':s.id===B.COMPARATOR?(s.subtract?'Subtract mode':'Compare mode'):s.id===B.LEVER?(s.on?'Lever ON':'Lever OFF'):'Activated';
  }
  output(s,target){
    if(!s)return 0;
    if(TORCHES.has(s.id)&&samePos(this.support(s),target))return 0;
    if([B.REPEATER,B.COMPARATOR,B.OBSERVER].includes(s.id)){
      const d=DIRECTIONS[s.dir],out=add(s.p,d,s.id===B.OBSERVER?-1:1);
      if(key(out)!==key(target))return 0;
    }
    if(s.id===B.TRIPWIRE_HOOK){
      const attached=add(s.p,DIRECTIONS[s.dir],-1);
      if(key(attached)===key(target)||target[1]===s.p[1]-1)return s.output||0;
    }
    if(s.id===B.REDSTONE_WIRE){
      const delta=target.map((v,i)=>v-s.p[i]);
      if(delta[1]>0)return 0;
      if(delta[1]<0)return s.power||0;
      return (s.connections??HORIZONTAL).some(d=>d[0]===delta[0]&&d[2]===delta[2])?s.power||0:0;
    }
    return s.output||0;
  }
  support(s){return add(s.p,s.attach??(s.id===B.REDSTONE_WALL_TORCH?DIRECTIONS[s.dir^1]:[0,-1,0]));}
  attach(p,normal){const s=this.state(p);if(s&&(s.id===B.LEVER||BUTTON_HOLD.has(s.id)||TORCHES.has(s.id)))s.attach=[-normal.x,-normal.y,-normal.z];}
  conductor(p){const id=this.id(p),def=BLOCK_DEFS[id];return FULL_CONDUCTORS.has(id)||Boolean(id!==B.AIR&&def&&def.solid!==false&&!def.transparent&&!def.model&&!def.slab&&!def.stair&&!def.plant&&!def.liquid);}
  strongOutput(s,target){
    if(!s||s.id===B.REDSTONE_WIRE||s.id===B.REDSTONE_BLOCK)return 0;
    // A sculk sensor strongly powers only the block below it.
    if(SCULK_SENSORS.has(s.id))return target[1]===s.p[1]-1&&target[0]===s.p[0]&&target[2]===s.p[2]?s.output||0:0;
    if(TORCHES.has(s.id))return samePos(target,add(s.p,[0,1,0]))?s.output||0:0;
    if(s.id===B.LEVER||BUTTON_HOLD.has(s.id)||PLATE_KIND.has(s.id))return samePos(this.support(s),target)?s.output||0:0;
    return this.output(s,target);
  }
  blockPower(p,strongOnly=false,exclude=null){
    if(!this.conductor(p))return 0;
    let value=0;
    for(const d of DIRECTIONS){const q=add(p,d);if(exclude&&samePos(q,exclude))continue;const s=this.state(q);if(s?.id===B.REDSTONE_BLOCK)continue; /* Block of Redstone: "cannot power through conductive blocks" */value=Math.max(value,strongOnly?this.strongOutput(s,p):this.output(s,p));}
    return value;
  }
  wireNeighbors(s){
    const result=[];
    for(const d of HORIZONTAL){const side=add(s.p,d);
      if(this.id(side)===B.REDSTONE_WIRE)result.push(side);
      const up=add(side,[0,1,0]),down=add(side,[0,-1,0]);
      if(this.conductor(side)&&!this.conductor(add(s.p,[0,1,0]))&&this.id(up)===B.REDSTONE_WIRE)result.push(up);
      if(!this.conductor(side)&&this.id(down)===B.REDSTONE_WIRE)result.push(down);
    }return result;
  }
  wireConnections(s){
    const neighbors=this.wireNeighbors(s),connections=[];
    for(const d of HORIZONTAL){const q=add(s.p,d),source=this.state(q);let connect=neighbors.some(p=>p[0]===q[0]&&p[2]===q[2]);
      if(source){if(source.id===B.REPEATER||source.id===B.COMPARATOR)connect ||= DIRECTIONS[source.dir][0]*d[0]+DIRECTIONS[source.dir][2]*d[2]!==0;
        else if(source.id===B.OBSERVER)connect ||= samePos(add(source.p,DIRECTIONS[source.dir],-1),s.p);
        else connect ||= source.id===B.REDSTONE_BLOCK||source.id===B.LEVER||TORCHES.has(source.id)||BUTTON_HOLD.has(source.id)||PLATE_KIND.has(source.id)||[B.DAYLIGHT_DETECTOR,B.TARGET_BLOCK,B.TRIPWIRE_HOOK,B.TRAPPED_CHEST].includes(source.id)||SCULK_SENSORS.has(source.id)||source.id===B.LECTERN;}
      if(connect)connections.push(d);
    }
    if(!connections.length)return s.dot?[]:HORIZONTAL;
    if(connections.length===1){const d=connections[0];connections.push(d.map(v=>-v));}
    return connections;
  }
  repeaterLocked(s){return HORIZONTAL.some(d=>{if(d[0]*DIRECTIONS[s.dir][0]+d[2]*DIRECTIONS[s.dir][2]!==0)return false;const side=this.state(add(s.p,d));return side&&[B.REPEATER,B.COMPARATOR].includes(side.id)&&this.output(side,s.p)>0;});}
  railPowered(p){
    const kind=this.id(p),start=this.state(p);if(![B.POWERED_RAIL,B.ACTIVATOR_RAIL].includes(kind))return false;
    const axis=(start?.dir??0)<2?0:2,queue=[[p,0]],seen=new Set();
    for(const [q,distance]of queue){if(seen.has(key(q)))continue;seen.add(key(q));if(this.input(q)>0)return true;if(distance>=8)continue;
      for(const sign of [-1,1])for(const dy of [-1,0,1]){const next=[...q];next[axis]+=sign;next[1]+=dy;const state=this.state(next);if(this.id(next)===kind&&((state?.dir??0)<2?0:2)===axis)queue.push([next,distance+1]);}
    }return false;
  }
  comparatorDesired(s){const rear=this.signalAt(this.rear(s),s.p),d=DIRECTIONS[s.dir];let side=0;
    for(const e of HORIZONTAL)if(e[0]*d[0]+e[2]*d[2]===0){const source=this.state(add(s.p,e));if(source&&[B.REDSTONE_WIRE,B.REPEATER,B.COMPARATOR,B.REDSTONE_BLOCK].includes(source.id))side=Math.max(side,this.output(source,s.p));}
    return s.subtract?Math.max(0,rear-side):(rear>=side?rear:0);
  }
  input(p,exclude=null,skipWire=false){
    let power=0;
    // Each neighbour's state and block are looked up once (they were looked up three times each).
    for(const d of DIRECTIONS){const q=[p[0]+d[0],p[1]+d[1],p[2]+d[2]];if(exclude&&samePos(q,exclude))continue;const sq=this.state(q);if(!skipWire||sq?.id!==B.REDSTONE_WIRE)power=Math.max(power,this.output(sq,p));
      const idq=this.id(q);
      if(this.conductor(q))power=Math.max(power,this.blockPower(q,skipWire,p));
    }return power;
  }
  rear(s){return add(s.p,DIRECTIONS[s.dir],-1);}
  getContainerSignal(p){
    const extra=extraAnalog(this,p);if(extra!==null)return extra;
    const s=this.state(p);
    if(s&&SCULK_SENSORS.has(s.id))return sensorComparator(s);
    if(s?.id===B.LECTERN)return lecternSignal(s);
    { const framed=this.game?.itemFrames?.signalAt?.(p); if(framed!==null&&framed!==undefined&&this.id(p)===B.AIR)return framed; }
    if(s&&[B.HOPPER,B.DISPENSER,B.DROPPER].includes(s.id)){
      // "floor(1 + ((sum of all slots' fullnesses) / (number of slots)) x 14)", each slot's fullness against its
      // item's own stack size (an ender pearl's is 16) -- not 64 for every item, as this read before.
      const slots=s.id===B.HOPPER?5:(s.id===B.DISPENSER||s.id===B.DROPPER?9:5);
      return containerSignal(s.inventory, slots, stackLimitFor);
    }
    const id=this.id(p);
    if((id===B.CHEST||id===B.TRAPPED_CHEST)&&this.game?.chestManager)return this.game.chestManager.getRedstoneSignal(...p);
    if((id===B.FURNACE||id===B.LIT_FURNACE)&&this.game?.furnaceManager)return this.game.furnaceManager.getRedstoneSignal(...p);
    return null;
  }
  signalAt(p,to){
    const cSig=this.getContainerSignal(p);
    if(cSig!==null)return cSig;
    // Minecraft mechanics: read container through 1 solid block behind comparator
    const pid=this.id(p);
    if(to&&this.conductor(p)){
      if(this.blockPower(p,false,to)===15)return 15;
      const dir=[p[0]-to[0],p[1]-to[1],p[2]-to[2]];
      const behind=add(p,dir);
      const bSig=this.getContainerSignal(behind);
      if(bSig!==null)return bSig;
    }
    const s=this.state(p);
    return Math.max(this.output(s,to),this.blockPower(p,false,to));
  }
  hitTarget(pos, hitPos, projectile='arrow'){
    const s=this.state(pos);
    if(!s||s.id!==B.TARGET_BLOCK)return;
    const center=[pos[0]+.5,pos[1]+.5,pos[2]+.5];
    const dx=hitPos.x-center[0],dy=hitPos.y-center[1],dz=hitPos.z-center[2];
    const offsets=[Math.abs(dx),Math.abs(dy),Math.abs(dz)],face=offsets.indexOf(Math.max(...offsets));
    const distance=Math.max(...offsets.filter((_,i)=>i!==face));
    const power=Math.max(1,Math.min(15,Math.ceil(15*(1-distance*2))));
    s.hitPower=power;
    // "emits redstone power for 8 gt ... Arrows and tridents instead ... for 20 gt" (4 or 10 redstone ticks).
    // The output is set at the hit itself, so the hold counts from now (no +1).
    s.until=this.tickNumber+(projectile==='arrow'||projectile==='trident'?10:4);
    s.output=power;
    this.mark(pos);
    for(const d of DIRECTIONS)this.mark(add(pos,d));
  }
  strikeRod(p){
    const s=this.state(p);if(s?.id!==B.LIGHTNING_ROD)return false;
    s.until=this.tickNumber+4;s.output=15;this.mark(p);return true; // on from the strike: 8 game ticks, 4 redstone ticks
  }
  solveWires(list){
    const buckets=Array.from({length:16},()=>[]);
    for(const s of list)if(s.id===B.REDSTONE_WIRE){s.power=this.input(s.p,null,true);if(s.power)buckets[s.power].push(s);}
    // A descending strength queue is independent of placement order and visits
    // only energized edges, rather than scanning every wire fifteen times.
    for(let level=15;level>1;level--)for(const s of buckets[level]){
      if(s.power!==level)continue;
      // Follow receiving connections: climbing glass transmits upward only.
      for(const d of HORIZONTAL)for(const dy of [-1,0,1]){
        const q=this.state(add(add(s.p,d),[0,dy,0]));
        if(q?.id!==B.REDSTONE_WIRE||q.power>=level-1||!this.wireNeighbors(q).some(p=>samePos(p,s.p)))continue;
        q.power=level-1;buckets[q.power].push(q);
      }
    }
  }
  tick(actors=[]){
    this.tickNumber++;const list=[...this.states.values()];
    for(const s of list)if(s.id===B.REDSTONE_WIRE){const connections=this.wireConnections(s),risers=this.wireNeighbors(s).filter(p=>p[1]>s.p[1]).map(p=>[p[0]-s.p[0],0,p[2]-s.p[2]]);if(JSON.stringify(connections)!==JSON.stringify(s.connections)||JSON.stringify(risers)!==JSON.stringify(s.risers)){s.connections=connections;s.risers=risers;this.mark(s.p);}}
    for(const s of list){const old=s.output;
      if(s.id===B.OBSERVER&&s.observerAt<=this.tickNumber){s.until=this.tickNumber+1;delete s.observerAt;}
      if(s.id===B.LEVER)s.output=s.on?15:0;
      // A block of redstone a piston is moving gives no power until it arrives (Java's moving blocks take 2 game ticks).
      if(s.id===B.REDSTONE_BLOCK)s.output=(s.arrivesAt??0)>this.tickNumber?0:15;
      if(s.id===B.TRAPPED_CHEST){const open=this.game?.chestManager?.openChestPos;s.output=open&&samePos(open,s.p)?1:0;}
      if(s.id===B.DETECTOR_RAIL){const carts=(this.game?.railSystem??this.game?.rails)?.carts??[];s.output=carts.some(c=>c.rail&&samePos(c.rail,s.p))?15:0;}
      if(BUTTON_HOLD.has(s.id)||s.id===B.OBSERVER||s.id===B.LIGHTNING_ROD)s.output=(s.until||0)>this.tickNumber?15:0;
      if(s.id===B.TARGET_BLOCK)s.output=(s.until||0)>this.tickNumber?(s.hitPower||15):0;
      if(PLATE_KIND.has(s.id)){
        // Who is on it (a player has a position, a mob a mesh), the plate kind's signal for them, and the hold: a
        // released plate keeps its signal until its next check, 20 game ticks later (10 for a weighted one).
        const kind=PLATE_KIND.get(s.id);
        const on=actors.filter(a=>{const p=a.position||a.mesh?.position;return p&&Math.abs(p.x-s.p[0]-.5)<.7&&Math.abs(p.z-s.p[2]-.5)<.7&&p.y>=s.p[1]&&p.y<s.p[1]+.4;})
          .map(a=>({isPlayer:!a.isItem&&(!a.mesh||a===this.game?.player),isMob:Boolean(a.mesh&&a.type),isItem:Boolean(a.isItem)}));
        const signal=plateSignal(kind,on);
        if(signal>0){s.output=signal;s.releaseAt=this.tickNumber+plateReleaseTicks(kind)+1;}
        else if(!(s.releaseAt>this.tickNumber))s.output=0;
      }
      if(s.id===B.TRIPWIRE_HOOK){
        let active=false;const d=DIRECTIONS[s.dir];
        for(let step=1;step<=40;step++){
          const check=add(s.p,d,step);const bid=this.id(check);
          if(bid===B.TRIPWIRE){
            if(actors.some(a=>{const pos=a.position||a.mesh?.position;return pos&&Math.abs(pos.x-check[0]-.5)<.6&&Math.abs(pos.z-check[2]-.5)<.6&&pos.y>=check[1]&&pos.y<check[1]+.9;})){active=true;break;}
          } else if(bid===B.TRIPWIRE_HOOK){break;} else break;
        }
        s.output=active||(s.brokenUntil||0)>this.tickNumber?15:0;
      }
      if(s.id===B.TRIPWIRE){
        s.output=actors.some(a=>{const pos=a.position||a.mesh?.position;return pos&&Math.abs(pos.x-s.p[0]-.5)<.6&&Math.abs(pos.z-s.p[2]-.5)<.6&&pos.y>=s.p[1]&&pos.y<s.p[1]+.9;})?15:0;
      }
      if(SCULK_SENSORS.has(s.id)){tickSensor(this,s);}
      if(s.id===B.LECTERN)s.output=(s.until||0)>this.tickNumber?15:0;
      if(s.id===B.DAYLIGHT_DETECTOR){
        // Every 20 game ticks (10 redstone ticks), or at once when used (redstoneComponents.js daylightDetectorPower).
        if(this.worldTime===undefined){const daylight=this.daylight??1;s.output=Math.round(15*(s.inverted?1-daylight:daylight));}
        else if(s.forceUpdate||s.daylightRead===undefined||this.tickNumber%10===0){delete s.forceUpdate;s.daylightRead=this.tickNumber;s.output=daylightDetectorPower({skyLight:this.world.getSkyLight?.(...s.p)??15,dayTime:this.worldTime,rain:this.rain??0,thunder:this.thunder??0,inverted:!!s.inverted});}
      }
      if(s.id===B.REPEATER&&this.repeaterLocked(s)){delete s.pendingAt;delete s.pendingOutput;}
      if(s.id!==B.COMPARATOR&&s.pendingAt<=this.tickNumber){
        // A torch that turns off more than eight times in 60 game ticks burns out.
        if(TORCHES.has(s.id)&&s.output>0&&s.pendingOutput===0){s.turnOffs=[...(s.turnOffs||[]),this.tickNumber];if(s.turnOffs.filter(t=>t>this.tickNumber-TORCH_BURNOUT.windowTicks).length>TORCH_BURNOUT.maxTurnOffs)s.burnt=true;}
        s.output=s.pendingOutput;delete s.pendingAt;
      }
      if(old!==s.output)this.mark(s.p);
      if(s.id===B.REDSTONE_WIRE)s.power=0;
    }
    this.solveWires(list);
    let comparatorChanged=false;
    for(const s of list)if(s.id===B.COMPARATOR&&s.pendingAt<=this.tickNumber){const desired=this.comparatorDesired(s);if(s.output!==desired){s.output=desired;comparatorChanged=true;this.mark(s.p);}delete s.pendingAt;}
    if(comparatorChanged)this.solveWires(list);
    // Powered TNT is primed once and removed from the voxel grid.
    if(this.game?.entities?.spawnPrimedTNT){const candidates=new Map();for(const s of list)if(s.power>0||s.output>0)for(const d of DIRECTIONS){const q=add(s.p,d);if(this.id(q)===B.TNT)candidates.set(key(q),q);if(this.conductor(q))for(const e of DIRECTIONS){const p=add(q,e);if(this.id(p)===B.TNT)candidates.set(key(p),p);}}for(const p of candidates.values())if(this.input(p)>0){this.world.setVoxel(...p,B.AIR);this.game.entities.spawnPrimedTNT(new THREE.Vector3(...p));}}
    const pistons=[];
    for(const s of list){if(this.state(s.p)!==s)continue;const readsInput=READS_INPUT.has(s.id);const input=readsInput?this.input(s.p,[B.PISTON,B.STICKY_PISTON].includes(s.id)?add(s.p,DIRECTIONS[s.dir]):null):0;
      if(s.id===B.REDSTONE_WIRE){if(s.drawPower!==s.power){s.drawPower=s.power;this.mark(s.p);}continue;}
      let desired;
      if(TORCHES.has(s.id)){desired=this.blockPower(this.support(s),false,s.p)>0?0:15;
        // Burnt out: it stays off, ignoring its input, "until the number of state changes in the last 60 game
        // ticks drops to fewer than eight".
        s.turnOffs=(s.turnOffs||[]).filter(t=>t>this.tickNumber-TORCH_BURNOUT.windowTicks);
        if(s.burnt){if(s.turnOffs.length<TORCH_BURNOUT.maxTurnOffs)s.burnt=false;else desired=0;}
      }
      if(s.id===B.REPEATER||s.id===B.COMPARATOR){const rear=this.signalAt(this.rear(s),s.p),d=DIRECTIONS[s.dir];let side=0;for(const e of DIRECTIONS)if(e[1]===0&&e[0]*d[0]+e[2]*d[2]===0)side=Math.max(side,this.signalAt(add(s.p,e),s.p));
        if(s.id===B.REPEATER){const locked=this.repeaterLocked(s);if(locked!==s.locked){s.locked=locked;this.mark(s.p);}if(s.locked)continue;desired=rear?15:0;}else desired=this.comparatorDesired(s);
      }
      if(desired!==undefined&&desired!==s.output&&s.pendingAt===undefined){s.pendingAt=this.tickNumber+(s.id===B.REPEATER?s.delay:1);s.pendingOutput=desired;}
      if(s.id===B.REDSTONE_LAMP){
        if(input>0){delete s.offAt;if(!s.on){s.on=true;this.mark(s.p);}}
        else if(s.on){s.offAt??=this.tickNumber+2;if(s.offAt<=this.tickNumber){s.on=false;delete s.offAt;this.mark(s.p);}}
      }
      if(BULBS.has(s.id)&&input>0&&!s.lastInput){s.on=!s.on;this.mark(s.p);}
      if(s.id===B.POWERED_RAIL||s.id===B.ACTIVATOR_RAIL){const on=this.railPowered(s.p);if(s.on!==on){s.on=on;this.mark(s.p);}}
      if(s.id===B.CRAFTER){if(s.fireAt!==undefined&&s.fireAt<=this.tickNumber){delete s.fireAt;craftPulse(this,s);}if(input>0&&!s.lastInput&&s.fireAt===undefined)s.fireAt=this.tickNumber+2;}
      if(s.id===B.PISTON||s.id===B.STICKY_PISTON){
        // Java quasi-connectivity samples power around the space above the base,
        // but only a neighbor update makes a latent QC change take effect.
        // Decided after the loop, once every update of this tick is known (a wire later in the list can still change).
        pistons.push([s,input]);
      }
      if([B.IRON_DOOR,B.IRON_DOOR_OPEN,B.IRON_TRAPDOOR,B.IRON_TRAPDOOR_OPEN,B.IRON_DOOR_TOP,B.IRON_DOOR_TOP_OPEN].includes(s.id)){
        const isDoor=[B.IRON_DOOR,B.IRON_DOOR_OPEN,B.IRON_DOOR_TOP,B.IRON_DOOR_TOP_OPEN].includes(s.id);
        const isTop=[B.IRON_DOOR_TOP,B.IRON_DOOR_TOP_OPEN].includes(s.id);
        const wantOpen=input>0;
        const id=isDoor?(wantOpen?(isTop?B.IRON_DOOR_TOP_OPEN:B.IRON_DOOR_OPEN):(isTop?B.IRON_DOOR_TOP:B.IRON_DOOR)):(wantOpen?B.IRON_TRAPDOOR_OPEN:B.IRON_TRAPDOOR);
        if(id!==s.id){
          this.world.setVoxel(...s.p,id);
          Object.assign(this.state(s.p),s,{id,on:wantOpen});
          if(isDoor && this.game?.doorManager){
            this.game.doorManager.setDoorOpen(s.p[0],s.p[1],s.p[2],wantOpen,true);
          }
        }
      }
      if([B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN].includes(s.id)){
        const isDoor=[B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN].includes(s.id);
        const isTop=[B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN].includes(s.id);
        const door = isDoor ? (this.game?.doorManager?.getDoor(s.p[0], s.p[1], s.p[2]) || this.world?.doorManager?.getDoor(s.p[0], s.p[1], s.p[2])) : null;
        const manual = door ? (door.manualOpen ?? door.open) : (s.manualOpen ?? false);
        const wantOpen=input>0?true:Boolean(manual);
        const wanted=isDoor?(wantOpen?(isTop?B.OAK_DOOR_TOP_OPEN:B.OAK_DOOR_OPEN):(isTop?B.OAK_DOOR_TOP:B.OAK_DOOR)):(wantOpen?B.OAK_TRAPDOOR_OPEN:B.OAK_TRAPDOOR);
        if(wanted!==s.id){
          this.world.setVoxel(...s.p,wanted);
          Object.assign(this.state(s.p),s,{id:wanted,on:wantOpen,manualOpen:manual});
          if(isDoor && (this.game?.doorManager || this.world?.doorManager)){
            const dm = this.game?.doorManager || this.world?.doorManager;
            dm.setDoorOpen(s.p[0],s.p[1],s.p[2],wantOpen,true);
          }
        }
      }
      // A dropper or dispenser "waits 4 game ticks and then ejects one item" (2 redstone ticks); a note block plays at once.
      if(s.fireAt!==undefined&&s.fireAt<=this.tickNumber){delete s.fireAt;this.dispense(s);}
      if([B.DISPENSER,B.DROPPER,B.NOTE_BLOCK].includes(s.id)&&input>0&&!s.lastInput){if(s.id===B.NOTE_BLOCK){this.mark(s.p);this.playNote(s);}else if(s.fireAt===undefined)s.fireAt=this.tickNumber+2;}
      if(s.id===B.HOPPER&&!input&&this.tickNumber>=(s.transferAt??0)){
        const pushed=this.hopperPush(s),pulled=this.hopperPull(s);
        const picked=!pulled&&this.collectFloatingItems(s);
        if(pushed||pulled||picked)s.transferAt=this.tickNumber+4;
      }
      if(readsInput)s.lastInput=input;
    }
    for(const entry of pistons){const s=entry[0],input=entry[1];
      if(input>0)s.powered=true;
      else if(this.updates.has(key(s.p))||s.powered===undefined)s.powered=this.input(add(s.p,[0,1,0]),s.p)>0;
      entry[1]=s.powered;
    }
    this.updates.clear();
    let pistonMoved=false;
    for(const [s,on] of pistons)if(this.state(s.p)===s){if(on&&!s.extended){this.extend(s,actors);pistonMoved||=s.extended;}else if(!on&&s.extended){this.retract(s,actors);pistonMoved=true;}}
    // Zero-ticking (Tutorial:Zero-ticking): "All 0-tick pulses are created by powering a redstone line then removing
    // the power source with pistons later in the tick." Pistons that moved can cut the power they were just given: the
    // wires are solved again in the same tick, and a sticky piston that extended this tick and has already lost its
    // power "instantly drop[s] their block and start[s] retracting" -- the block is teleported one block on. Regular
    // pistons are left to retract on the next tick ("do not instantly teleport blocks").
    // Java processes piston block events until none are left, so a piston moved, powered or unpowered by another one
    // answers within the same tick (up to a few rounds here). One that extended this tick and has lost its power is
    // the zero-tick case: a sticky piston drops its block where it was pushed.
    for(let round=0;pistonMoved&&round<4;round++){
      pistonMoved=false;
      const after=[...this.states.values()];
      this.solveWires(after);
      for(const s of after){
        if(this.state(s.p)!==s||(s.id!==B.PISTON&&s.id!==B.STICKY_PISTON))continue;
        const direct=this.input(s.p,add(s.p,DIRECTIONS[s.dir]));
        const qc=this.input(add(s.p,[0,1,0]),s.p);
        const on=direct>0||(this.updates.has(key(s.p))||s.powered===undefined?qc>0:!!s.powered&&qc>0);
        s.powered=on;
        if(on&&!s.extended){this.extend(s,actors);pistonMoved||=s.extended;}
        else if(!on&&s.extended){
          if(s.id===B.STICKY_PISTON&&s.extendedAt===this.tickNumber){s.zeroTicked=true;}
          if(s.id===B.PISTON&&s.extendedAt===this.tickNumber)continue; // regular pistons retract on the next tick
          this.retract(s,actors);pistonMoved=true;
        }
      }
    }
  }
  transferOne(from,to){
    for(let index=0;index<from.inventory.length;index++){
      const item=from.inventory[index];if(!item)continue;
      if(to.id===B.CRAFTER){if(!insertCrafter(to,item))continue;if(--item.count===0){if(from.id===B.CRAFTER)from.inventory[index]=null;else from.inventory.splice(index,1);}return true;}
      // Hopper: a hopper that receives an item while empty waits 8 game ticks before passing it on; one already holding
      // items keeps its own pace. Resetting the wait on every receipt stalled a line of hoppers (Item transportation).
      const wasEmpty=!to.inventory.some(i=>i&&i.count>0);
      let target=to.inventory.find(i=>i&&stacksMatch(i,item)&&i.count<stackLimitFor(item.id));
      if(!target){if(to.inventory.length>=(to.id===B.HOPPER?5:9))continue;target={...item,count:0};to.inventory.push(target);}
      target.count++;if(--item.count===0){if(from.id===B.CRAFTER)from.inventory[index]=null;else from.inventory.splice(index,1);}
      if(to.id===B.HOPPER&&wasEmpty)to.transferAt=Math.max(to.transferAt??0,this.tickNumber+4);return true;
    }return false;
  }
  hopperHasSpace(s,id=null,isBlock=false){
    if(s.inventory.length<5)return true;
    if(id!==null)return s.inventory.some(i=>i.id===id&&!!i.isBlock===!!isBlock&&i.count<stackLimitFor(id));
    return s.inventory.some(i=>i.count<stackLimitFor(i.id));
  }
  addHopperItem(s,id,isBlock,count=1,metadata={}){
    const item={...metadata,id,isBlock:!!isBlock};let remaining=count;
    for(const slot of s.inventory)if(stacksMatch(slot,item)){const can=Math.min(remaining,Math.max(0,stackLimitFor(id)-slot.count));slot.count+=can;remaining-=can;if(!remaining)break;}
    while(remaining>0&&s.inventory.length<5){const can=Math.min(remaining,stackLimitFor(id));s.inventory.push({...item,count:can});remaining-=can;}
    return count-remaining;
  }
  collectFloatingItems(s){
    if(!this.game?.entities?.droppedItems)return;
    const dropped=this.game.entities.droppedItems;
    for(let i=dropped.length-1;i>=0;i--){
      const dItem=dropped[i];
      const pos=dItem.group?.position;
      if(pos&&Math.abs(pos.x-(s.p[0]+.5))<.75&&Math.abs(pos.z-(s.p[2]+.5))<.75&&pos.y>=s.p[1]+.5&&pos.y<=s.p[1]+1.8){
        if(this.hopperHasSpace(s,dItem.itemType,dItem.isBlock)){
          const accepted=this.addHopperItem(s,dItem.itemType,dItem.isBlock,dItem.count,dItem.itemData??{});
          if(accepted){
            dItem.count-=accepted;
            if(dItem.count<=0){
              this.game.entities.itemVisuals?.release?.(dItem.group);
              this.game.entities.scene?.remove?.(dItem.group);
              dropped.splice(i,1);
            }
            return true;
          }
        }
      }
    }
  }
  /** A chest or hopper minecart standing in a block space (Hopper: hoppers take from and fill container minecarts). */
  cartAt(p){return ((this.game?.railSystem??this.game?.rails)?.carts??[]).find(c=>Array.isArray(c.items)&&c.rail&&samePos(c.rail,p))??null;}
  hopperPull(s){
    const abovePos=add(s.p,[0,1,0]),aboveId=this.id(abovePos),above=this.state(abovePos);
    const cartAbove=this.cartAt(abovePos);
    if(cartAbove){
      for(let i=0;i<cartAbove.items.length;i++){const item=cartAbove.items[i];if(!item)continue;
        if(this.addHopperItem(s,item.id,item.isBlock,1,item)){if(--item.count<=0)cartAbove.items[i]=null;return true;}}
      return false;
    }
    if(this.deviceInventory(above)&&above.inventory.length){
      return this.transferOne(above,s);
    } else if((aboveId===B.CHEST||aboveId===B.TRAPPED_CHEST)&&this.game?.chestManager){
      const cm=this.game.chestManager,items=cm.getCombinedItems(...abovePos);
      for(let i=0;i<items.length;i++){const item=items[i];if(!item)continue;
        if(this.addHopperItem(s,item.id,item.isBlock,1,item)){cm.setCombinedSlot(...abovePos,i,item.count===1?null:{...item,count:item.count-1});return true;}
      }
    } else if((aboveId===B.FURNACE||aboveId===B.LIT_FURNACE)&&this.game?.furnaceManager){
      const item=this.game.furnaceManager.getOrCreateFurnace(...abovePos).output;
      if(item&&this.addHopperItem(s,item.id,item.isBlock,1,item)){
        this.game.furnaceManager.extractItem(...abovePos,'output');
        return true;
      }
    }
  }
  hopperPush(s){
    if(!s.inventory.length)return;
    const destPos=add(s.p,DIRECTIONS[s.dir]),destId=this.id(destPos),dest=this.state(destPos);
    const item=s.inventory[0];
    const cartBelow=this.cartAt(destPos);
    if(cartBelow){const rails=this.game?.railSystem??this.game?.rails;if(rails?.addCartItem?.(cartBelow,item.id,item.isBlock,1)){if(--item.count===0)s.inventory.shift();return true;}return false;}
    if(this.deviceInventory(dest)){
      return this.transferOne(s,dest);
    } else if((destId===B.CHEST||destId===B.TRAPPED_CHEST)&&this.game?.chestManager){
      if(this.game.chestManager.addItem(destPos[0],destPos[1],destPos[2],item.id,item.isBlock,1)){
        if(--item.count===0)s.inventory.shift();
        return true;
      }
    } else if((destId===B.FURNACE||destId===B.LIT_FURNACE)&&this.game?.furnaceManager){
      const slotType=s.dir===3?'input':'fuel';
      if(this.game.furnaceManager.addItem(destPos[0],destPos[1],destPos[2],item.id,item.isBlock,1,slotType)){
        if(--item.count===0)s.inventory.shift();
        return true;
      }
    }
  }
  playNote(s){
    if(this.id(add(s.p,[0,1,0]))!==B.AIR)return;
    const audio=this.game?.sounds;audio?.ensureContext?.();if(!audio?.ctx||!audio.soundEnabled)return;
    const ctx=audio.ctx,now=ctx.currentTime;
    const belowId=this.id(add(s.p,[0,-1,0]));
    const note=s.note||0;
    const isWood=[B.OAK_PLANKS,B.OAK_LOG,B.SPRUCE_LOG,B.BIRCH_LOG,B.JUNGLE_LOG,B.ACACIA_LOG,B.DARK_OAK_LOG,B.CHERRY_LOG,B.MANGROVE_LOG,B.PALE_OAK_LOG,B.CHERRY_PLANKS,B.BIRCH_PLANKS,B.SPRUCE_PLANKS,B.JUNGLE_PLANKS,B.ACACIA_PLANKS,B.DARK_OAK_PLANKS,B.MANGROVE_PLANKS,B.PALE_OAK_PLANKS,B.BOOKSHELF,B.CRAFTING_TABLE].includes(belowId);
    const isSand=[B.SAND,B.RED_SAND,B.GRAVEL].includes(belowId);
    const isGlass=[B.GLASS].includes(belowId);
    const isStone=[B.STONE,B.COBBLESTONE,B.BEDROCK,B.OBSIDIAN,B.DEEPSLATE,B.COBBLED_DEEPSLATE,B.SMOOTH_STONE,B.BLACKSTONE,B.BASALT].includes(belowId);

    if(isWood){
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sawtooth';osc.frequency.setValueAtTime(43.65*Math.pow(2,note/12),now);
      gain.gain.setValueAtTime(.25,now);gain.gain.exponentialRampToValueAtTime(.001,now+.4);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now);osc.stop(now+.4);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    } else if(isStone){
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(120,now);osc.frequency.exponentialRampToValueAtTime(30,now+.2);
      gain.gain.setValueAtTime(.35,now);gain.gain.exponentialRampToValueAtTime(.001,now+.25);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now);osc.stop(now+.25);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    } else if(isSand){
      const bufSize=Math.floor(ctx.sampleRate*.15),buf=ctx.createBuffer(1,bufSize,ctx.sampleRate),data=buf.getChannelData(0);
      for(let i=0;i<bufSize;i++)data[i]=Math.random()*2-1;
      const noise=ctx.createBufferSource();noise.buffer=buf;
      const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.setValueAtTime(1000,now);
      const gain=ctx.createGain();gain.gain.setValueAtTime(.25,now);gain.gain.exponentialRampToValueAtTime(.001,now+.15);
      noise.connect(filter);filter.connect(gain);gain.connect(ctx.destination);
      noise.start(now);
      noise.onended=()=>{noise.disconnect();filter.disconnect();gain.disconnect();};
    } else if(isGlass){
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='square';osc.frequency.setValueAtTime(1200,now);
      gain.gain.setValueAtTime(.2,now);gain.gain.exponentialRampToValueAtTime(.001,now+.05);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now);osc.stop(now+.05);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    } else {
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='triangle';osc.frequency.value=185*Math.pow(2,note/12);
      gain.gain.setValueAtTime(.2,now);gain.gain.exponentialRampToValueAtTime(.001,now+.5);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(now);osc.stop(now+.5);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
    }
  }
  dispense(s){
    // Dispenser/Dropper: "a random slot" holding an item is used, not always the first.
    if(s.inventory.length>1){const filled=s.inventory.map((it,i)=>it&&it.count>0?i:-1).filter(i=>i>=0);const pick=filled[Math.floor((this.random??Math.random)()*filled.length)];if(pick>0){const [it]=s.inventory.splice(pick,1);s.inventory.unshift(it);}}
    const item=s.inventory[0];if(!item)return;
    const d=DIRECTIONS[s.dir],p=add(s.p,d).map(v=>v+.5),g=this.game;
    const frontPos=add(s.p,d),frontId=this.id(frontPos);

    if(s.id===B.DROPPER){
      const destState=this.state(frontPos);
      if(this.deviceInventory(destState)){
        this.transferOne(s,destState);
        return;
      }
      if((frontId===B.CHEST||frontId===B.TRAPPED_CHEST)&&g?.chestManager){
        if(g.chestManager.addItem(frontPos[0],frontPos[1],frontPos[2],item.id,item.isBlock,1)){
          if(--item.count===0)s.inventory.shift();
        }
        return;
      }
      if((frontId===B.FURNACE||frontId===B.LIT_FURNACE)&&g?.furnaceManager){
        const slotType=s.dir===3?'input':'fuel';
        if(g.furnaceManager.addItem(frontPos[0],frontPos[1],frontPos[2],item.id,item.isBlock,1,slotType)){
          if(--item.count===0)s.inventory.shift();
        }
        return;
      }
      if(g){
        const V=g.player?.position?.constructor||THREE.Vector3;
        g.entities?.spawnDroppedItem?.(new V(...p),item.id,item.isBlock,1);
      }
      if(--item.count===0)s.inventory.shift();
      return;
    }

    if(!g)return;
    const V=g.player?.position?.constructor||THREE.Vector3;
    // Dispenser: glowstone "charges a respawn anchor" in front of it, up to 4 (Tutorial:Automatic respawn anchor recharger).
    if(s.id===B.DISPENSER&&item.isBlock&&item.id===B.GLOWSTONE&&frontId===B.RESPAWN_ANCHOR){
      const charge=anchorCharges(this.world,...frontPos);
      if(charge<4){setCharges(this.world,...frontPos,charge+1);if(--item.count===0)s.inventory.shift();this.mark(frontPos);}
      return;
    }
    if(s.id===B.DISPENSER&&['arrow','spectral_arrow','tipped_arrow'].includes(item.id)){
      g.mobs?.spawnArrow?.(new V(...p),new V(...d),s);
    } else if(s.id===B.DISPENSER&&item.isBlock&&item.id===B.TNT){
      g.entities?.spawnPrimedTNT?.(new V(...p));
    } else if(s.id===B.DISPENSER&&item.id==='water_bucket'){
      if(frontId===B.AIR||frontId===B.FIRE){
        if(this.world.dimension!=='nether')this.world.setVoxel(...frontPos,B.WATER);
        item.id='bucket';item.isBlock=false;
        return;
      }
    } else if(s.id===B.DISPENSER&&item.id==='lava_bucket'){
      if(frontId===B.AIR||frontId===B.FIRE){
        this.world.setVoxel(...frontPos,B.LAVA);
        item.id='bucket';item.isBlock=false;
        return;
      }
    } else if(s.id===B.DISPENSER&&item.id==='bucket'){
      if(frontId===B.WATER&&(!this.world.getWaterLevel||this.world.getWaterLevel(...frontPos)===0)){
        this.world.setVoxel(...frontPos,B.AIR);
        this.fillBucket(s,item,'water_bucket');
        return;
      } else if(frontId===B.LAVA&&(!this.world.getLavaLevel||this.world.getLavaLevel(...frontPos)===0)){
        this.world.setVoxel(...frontPos,B.AIR);
        this.fillBucket(s,item,'lava_bucket');
        return;
      }
    } else if(s.id===B.DISPENSER&&item.id==='shears'){
      const sheep=g.mobs?.mobs?.find(m=>{const pos=m.mesh?.position??m.position;return m.type==='sheep'&&!m.isSheared&&pos&&Math.abs(pos.x-p[0])<1&&Math.abs(pos.y-p[1])<1.5&&Math.abs(pos.z-p[2])<1;});
      if(sheep){
        sheep.isSheared=true;
        updateSheepWool(sheep);
        sheep.onSheared?.();
        const wool=B[(sheep.woolColor||'white').toUpperCase()+'_WOOL'];g.entities?.spawnDroppedItem?.(new V(...p),wool??B.WHITE_WOOL,true,rollSheepWoolCount());
        if(spendDurability(item).broke)s.inventory.shift();
      }
      return;
    } else if(s.id===B.DISPENSER&&['bone_meal','bonemeal'].includes(item.id)){
      if(g.farmingManager?.applyBoneMeal?.(...frontPos,{gamemode:'creative'})){if(--item.count===0)s.inventory.shift();}
      return;
    } else if(s.id===B.DISPENSER&&item.id==='flint_and_steel'){
      if(frontId===B.AIR){
        this.world.setVoxel(...frontPos,B.FIRE);
        if(spendDurability(item).broke)s.inventory.shift();
      }
      return;
    } else if(s.id===B.DISPENSER&&typeof item.id==='string'&&(item.id.endsWith('_helmet')||item.id.endsWith('_chestplate')||item.id.endsWith('_leggings')||item.id.endsWith('_boots'))){
      const slot=item.id.endsWith('_helmet')?'head':(item.id.endsWith('_chestplate')?'chest':(item.id.endsWith('_leggings')?'legs':'feet'));
      if(g.player&&Math.abs(g.player.position.x-p[0])<1.8&&Math.abs(g.player.position.z-p[2])<1.8){
        if(g.inventory&&!g.inventory.armor[slot]){
          g.inventory.armor[slot]={...item,count:1};
          if(--item.count===0)s.inventory.shift();
          return;
        }
      }
    } else {
      g.entities?.spawnDroppedItem?.(new V(...p),item.id,item.isBlock);
    }
    if(--item.count===0)s.inventory.shift();
  }
  fillBucket(s,item,replacement){
    if(item.count===1){item.id=replacement;item.isBlock=false;return;}
    item.count--;const filled={id:replacement,isBlock:false,count:1};
    if(s.inventory.length<9)s.inventory.push(filled);else this.game?.entities?.spawnDroppedItem?.(new THREE.Vector3(...s.p).addScalar(.5),replacement,false,1);
  }
  movable(p){
    const id=this.id(p),s=this.state(p);
    const def=BLOCK_DEFS[id];
    return this.loaded(p)&&!(def?.hardness<0)&&![B.BEDROCK,B.OBSIDIAN,B.CRYING_OBSIDIAN,B.PISTON_HEAD,B.CHEST,B.FURNACE,B.LIT_FURNACE,B.NETHER_PORTAL,B.END_PORTAL,B.DISPENSER,B.DROPPER,B.HOPPER,B.CRAFTER,B.ENCHANTING_TABLE,B.LECTERN,B.JUKEBOX,B.BEACON,B.SPAWNER,B.RESPAWN_ANCHOR,B.SCULK_SENSOR,B.CALIBRATED_SCULK_SENSOR].includes(id)&&!def?.chest&&!/Barrel|Beehive|Bee Nest|Shulker Box|Ender Chest/.test(def?.name??'')&&!s?.extended&&!s?.inventory?.length;
  }
  breaksWhenPushed(id){const def=BLOCK_DEFS[id];return def?.plant||def?.button||def?.pressurePlate||def?.shape==='torch'||[B.REDSTONE_WIRE,B.REPEATER,B.COMPARATOR,B.STONE_BUTTON,B.PRESSURE_PLATE,B.TRIPWIRE,B.TRIPWIRE_HOOK].includes(id);}
  plan(start,dir,base){const result=new Map(),d=DIRECTIONS[dir];let failed=false;
    const visit=(p,sticky=false,fromId=null)=>{const k=key(p),id=this.id(p);if(k===key(base)){if(!sticky)failed=true;return;}if(result.has(k)||id===B.AIR||id===B.WATER||id===B.LAVA)return;
      if(sticky&&((fromId===B.SLIME_BLOCK&&id===B.HONEY_BLOCK)||(fromId===B.HONEY_BLOCK&&id===B.SLIME_BLOCK)))return;
      if(sticky&&/Glazed Terracotta/.test(BLOCK_DEFS[id]?.name??''))return;
      if(this.breaksWhenPushed(id)){if(!sticky)result.set(k,{p,id,destroy:true});return;}
      if(!this.movable(p)){if(!sticky)failed=true;return;}result.set(k,{p,id,state:this.state(p)?structuredClone(this.state(p)):null});if([...result.values()].filter(b=>!b.destroy).length>12){failed=true;return;}
      const dest=add(p,d);if(!this.loaded(dest)){failed=true;return;}visit(dest);
      if(adhesive(id))for(const e of DIRECTIONS)visit(add(p,e),true,id);
    };visit(start);return failed?null:[...result.values()];}
  move(blocks,dir,actors=[]){const d=DIRECTIONS[dir];
    const destroyed=blocks.filter(b=>b.destroy);blocks=blocks.filter(b=>!b.destroy);
    const riders=actors.filter(actor=>{const pos=actor.position||actor.mesh?.position;return pos&&blocks.some(b=>Math.abs(pos.y-(b.p[1]+1))<.3&&pos.x>=b.p[0]-.25&&pos.x<=b.p[0]+1.25&&pos.z>=b.p[2]-.25&&pos.z<=b.p[2]+1.25);});
    const moved=new Set(blocks.map(b=>key(b.p)));
    for(const actor of riders){const pos=actor.position||actor.mesh.position,r=(actor.width||.6)/2;for(let x=Math.floor(pos.x+d[0]-r);x<=Math.floor(pos.x+d[0]+r);x++)for(let z=Math.floor(pos.z+d[2]-r);z<=Math.floor(pos.z+d[2]+r);z++)for(let y=Math.floor(pos.y+d[1]+.01);y<=Math.floor(pos.y+d[1]+(actor.height||1.8)-.01);y++){const p=[x,y,z],id=this.id(p);if(!this.loaded(p)||!moved.has(key(p))&&id!==B.AIR&&BLOCK_DEFS[id]?.solid!==false)return false;}}
    this.moving=true;
    try{for(const b of destroyed){this.world.setVoxel(...b.p,B.AIR);const drop=baseBlockDrop(b.id);if(drop)this.game?.entities?.spawnDroppedItem?.(new THREE.Vector3(...b.p).addScalar(.5),drop.id,drop.isBlock,drop.count);}for(const b of blocks)this.world.setVoxel(...b.p,B.AIR);for(const b of blocks){const dest=add(b.p,d);this.world.setVoxel(...dest,b.id);if(b.state){b.state.p=dest;if(b.state.id===B.OBSERVER)b.state.until=this.tickNumber+2;this.states.set(key(dest),b.state);}}}finally{this.moving=false;}
    for(const actor of actors){const pos=actor.position||actor.mesh?.position;if(!pos)continue;const riding=blocks.some(b=>Math.abs(pos.y-(b.p[1]+1))<.3&&pos.x>=b.p[0]-.25&&pos.x<=b.p[0]+1.25&&pos.z>=b.p[2]-.25&&pos.z<=b.p[2]+1.25);if(riding){pos.x+=d[0];pos.y+=d[1];pos.z+=d[2];}}
    for(const b of blocks){this.notify(...b.p);this.notify(...add(b.p,d));}
    for(const b of blocks){const st=this.state(add(b.p,d));if(st?.id===B.REDSTONE_BLOCK){st.arrivesAt=this.tickNumber+1;st.output=0;}}
    return true;
  }
  extend(s,actors){const d=DIRECTIONS[s.dir],front=add(s.p,d);if(!this.loaded(front))return;const blocks=this.plan(front,s.dir,s.p);if(!blocks)return;if(!this.move(blocks,s.dir,actors))return;this.world.setVoxel(...front,B.PISTON_HEAD);this.state(front).dir=s.dir;this.state(front).base=[...s.p];s.pushedOnExtension=blocks.length>0;s.extended=true;s.extendedAt=this.tickNumber;this.mark(s.p);}
  retract(s,actors){
    const d=DIRECTIONS[s.dir],front=add(s.p,d);
    if(this.id(front)===B.PISTON_HEAD)this.world.setVoxel(...front,B.AIR);
    s.extended=false;this.mark(s.p);
    if(s.id===B.STICKY_PISTON){
      const start=add(s.p,d,2),opposite=s.dir^1,startId=this.id(start);
      const isOneTickPulse=s.extendedAt!==undefined&&(this.tickNumber-s.extendedAt)<=1;
      if(isOneTickPulse&&s.pushedOnExtension){
        // 1-tick pulse drops/leaves the block behind (Minecraft block-dropping mechanic). A 0-tick drop places the moving
        // block at once (Tutorial:Zero-ticking: the block is "teleported"), so a block of redstone powers straight away.
        if(s.zeroTicked){const dropped=this.state(add(s.p,d,2));if(dropped?.id===B.REDSTONE_BLOCK){delete dropped.arrivesAt;dropped.output=15;this.mark(dropped.p);}}
      } else {
        const blocks=this.plan(start,opposite,s.p);
        if(blocks)this.move(blocks,opposite,actors);
      }
    }
  }
  /** A vibration (sculkSensor.js): frequency number or event name, at a block. */
  vibrate(x,y,z,frequency,options){return vibrate(this,x,y,z,frequency,options);}
  update(dt,actors=[]){this.time=Math.min(.5,this.time+Math.max(0,dt));while(this.time>=.1){this.time-=.1;this.tick(actors);}}
  serialize(){return [...this.states.values()].map(s=>{
    const copy=structuredClone(s);copy.relativeTimers=true;
    for(const field of ['until','pendingAt','fireAt','transferAt','offAt','releaseAt','observerAt','arriveAt','activeUntil','cooldownUntil','brokenUntil'])if(copy[field]!==undefined)copy[field]=Math.max(0,copy[field]-this.tickNumber);
    if(copy.extendedAt!==undefined)copy.extendedAt-=this.tickNumber;
    if(copy.turnOffs)copy.turnOffs=copy.turnOffs.map(t=>t-this.tickNumber);
    return copy;
  });}
  restore(data){for(const s of Array.isArray(data)?data:[]){
    if(!Array.isArray(s?.p)||s.p.length!==3||!s.p.every(Number.isInteger)||this.id(s.p)!==s.id)continue;
    const state=this.state(s.p);if(!state)continue;
    Object.assign(state,s,{dir:Math.max(0,Math.min(5,s.dir|0)),delay:Math.max(1,Math.min(4,s.delay|0)),inventory:Array.isArray(s.inventory)?s.inventory.filter(i=>i&&i.count>0&&i.count<=stackLimitFor(i.id)).slice(0,s.id===B.HOPPER?5:9):[]});
    if(s.id===B.CRAFTER){state.inventory=Array.from({length:9},(_,i)=>s.inventory?.[i]?.count>0?structuredClone(s.inventory[i]):null);state.disabled=Array.from({length:9},(_,i)=>!!s.disabled?.[i]);}
    for(const field of ['until','pendingAt','fireAt','transferAt','offAt','releaseAt','observerAt','arriveAt','activeUntil','cooldownUntil','brokenUntil'])if(Number.isFinite(s[field]))state[field]=this.tickNumber+Math.max(0,Math.min(1000,s[field]));
    if(Number.isFinite(s.extendedAt)&&s.relativeTimers)state.extendedAt=this.tickNumber+Math.min(0,s.extendedAt);
    if(Array.isArray(s.turnOffs)&&s.relativeTimers)state.turnOffs=s.turnOffs.filter(Number.isFinite).map(t=>this.tickNumber+Math.min(0,t));
    if(s.attach&&!DIRECTIONS.some(d=>samePos(d,s.attach)))delete state.attach;
    this.mark(s.p);
  }}
}
