import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';
import * as THREE from 'three';

export const DIRECTIONS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key = p => p.join(',');
const add = (a,b,n=1) => a.map((v,i)=>v+b[i]*n);
const directional = new Set([B.REPEATER,B.COMPARATOR,B.OBSERVER,B.PISTON,B.STICKY_PISTON,B.PISTON_HEAD,B.DISPENSER,B.DROPPER,B.HOPPER,B.RAIL,B.POWERED_RAIL,B.TRIPWIRE_HOOK]);
const adhesive = id => id===B.SLIME_BLOCK || id===B.HONEY_BLOCK;

export class Redstone {
  constructor(world){this.world=world;this.reset();}
  reset(){this.states=new Map();this.time=0;this.tickNumber=0;this.moving=false;}
  loaded(p){return p[1]>=0&&p[1]<64&&!!this.world.getChunk(Math.floor(p[0]/16),Math.floor(p[2]/16));}
  id(p){return this.world.getVoxel(...p);}
  state(p){return this.states.get(key(p));}
  mark(p){const c=this.world.getChunk(Math.floor(p[0]/16),Math.floor(p[2]/16));if(c)c.dirty=true;this.observe(p);}
  observe(p){if(this.moving)return;for(const d of DIRECTIONS){const s=this.state(add(p,d));if(s?.id===B.OBSERVER&&key(add(s.p,DIRECTIONS[s.dir]))===key(p))s.until=this.tickNumber+2;}}
  notify(x,y,z){
    const p=[x,y,z],id=this.id(p),previous=this.state(p);
    if(!this.moving&&previous?.id!==id&&previous?.inventory?.length&&this.game){const V=this.game.player.position.constructor;for(const item of previous.inventory)this.game.entities.spawnDroppedItem(new V(x+.5,y+.5,z+.5),item.id,item.isBlock,item.count);}
    if(BLOCK_DEFS[id]?.redstone){
      const door = this.game?.doorManager?.getDoor(x,y,z) || this.world?.doorManager?.getDoor(x,y,z);
      const isDoorOrTrap = [B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_DOOR_TOP,B.OAK_DOOR_TOP_OPEN,B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN].includes(id);
      const manualOpen = door ? (door.manualOpen ?? door.open) : (previous?.manualOpen ?? (isDoorOrTrap ? (id===B.OAK_DOOR_OPEN||id===B.OAK_DOOR_TOP_OPEN||id===B.OAK_TRAPDOOR_OPEN) : false));
      if(previous?.id!==id)this.states.set(key(p),{p,id,dir:0,on:false,power:0,output:id===B.REDSTONE_TORCH?15:0,delay:1,inventory:[],extended:false,manualOpen});
    } else this.states.delete(key(p));
    if(!this.moving && previous?.extended && this.id(add(p,DIRECTIONS[previous.dir]))===B.PISTON_HEAD)this.world.setVoxel(...add(p,DIRECTIONS[previous.dir]),B.AIR);
    if(!this.moving)for(const d of DIRECTIONS){const s=this.state(add(p,d));if(s?.id===B.OBSERVER&&key(add(s.p,DIRECTIONS[s.dir]))===key(p))s.until=this.tickNumber+2;}
  }
  initChunk(c){for(let y=0;y<64;y++)for(let z=0;z<16;z++)for(let x=0;x<16;x++)if(BLOCK_DEFS[c.getVoxel(x,y,z)]?.redstone)this.notify(c.cx*16+x,y,c.cz*16+z);}
  configure(p,dir){const s=this.state(p);if(s&&directional.has(s.id)){s.dir=Math.max(0,Math.min(5,dir|0));this.mark(p);}}
  interact(p,sneak=false,held=null){
    const s=this.state(p);if(!s)return null;
    if(sneak&&directional.has(s.id)){if(s.extended)return 'Retract the piston before rotating it';s.dir=(s.dir+1)%6;this.mark(p);return 'Facing '+['east','west','up','down','south','north'][s.dir];}
    if(s.id===B.LEVER)s.on=!s.on;
    else if(s.id===B.STONE_BUTTON)s.until=this.tickNumber+10;
    else if(s.id===B.REPEATER)s.delay=s.delay%4+1;
    else if(s.id===B.COMPARATOR)s.subtract=!s.subtract;
    else if(s.id===B.DAYLIGHT_DETECTOR)s.inverted=!s.inverted;
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
      if(held&&held.count>0){const slot=s.inventory.find(i=>i.id===held.id&&i.isBlock===held.isBlock&&i.count<64);if(slot)slot.count++;else if(s.inventory.length<(s.id===B.HOPPER?5:9))s.inventory.push({...held,count:1});else return 'Container full';if(this.game?.player?.gamemode!=='creative')held.count--;}
      else {const slot=s.inventory[0];if(slot&&this.game?.inventory.addItem(slot.id,slot.isBlock,slot.count))s.inventory.shift();}
      return 'Stored items: '+s.inventory.reduce((n,i)=>n+i.count,0);
    } else if(s.id===B.NOTE_BLOCK){s.note=((s.note||0)+1)%25;this.playNote(s);return 'Note: '+s.note;}
    else return null;
    this.mark(p);return s.id===B.REPEATER?'Repeater delay: '+s.delay+' redstone ticks':s.id===B.COMPARATOR?(s.subtract?'Subtract mode':'Compare mode'):s.id===B.LEVER?(s.on?'Lever ON':'Lever OFF'):'Activated';
  }
  output(s,target){
    if(!s)return 0;
    if([B.REPEATER,B.COMPARATOR,B.OBSERVER].includes(s.id)){
      const d=DIRECTIONS[s.dir],out=add(s.p,d,s.id===B.OBSERVER?-1:1);
      if(key(out)!==key(target))return 0;
    }
    if(s.id===B.TRIPWIRE_HOOK){
      const attached=add(s.p,DIRECTIONS[s.dir],-1);
      if(key(attached)===key(target)||target[1]===s.p[1]-1)return s.output||0;
    }
    if(s.id===B.REDSTONE_WIRE)return s.power||0;
    return s.output||0;
  }
  input(p,exclude=null,skipWire=false){
    let power=0;
    for(const d of DIRECTIONS){const q=add(p,d);if(exclude&&key(q)===key(exclude))continue;if(!skipWire||this.state(q)?.id!==B.REDSTONE_WIRE)power=Math.max(power,this.output(this.state(q),p));
      if((!this.state(q)&&BLOCK_DEFS[this.id(q)]?.solid!==false&&this.id(q)!==B.AIR) || adhesive(this.id(q)))for(const e of DIRECTIONS){const r=add(q,e);if(key(r)!==key(p)&&(!exclude||key(r)!==key(exclude))){const source=this.state(r);if(source?.id!==B.REDSTONE_WIRE)power=Math.max(power,this.output(source,q));}}
    }return power;
  }
  rear(s){return add(s.p,DIRECTIONS[s.dir],-1);}
  getContainerSignal(p){
    const s=this.state(p);
    if(s?.inventory?.length){
      const total=s.inventory.reduce((n,i)=>n+(i?.count||0),0);
      const slots=s.id===B.HOPPER?5:(s.id===B.DISPENSER||s.id===B.DROPPER?9:5);
      return Math.min(15, 1+Math.floor(14*total/(slots*64)));
    }
    const id=this.id(p);
    if(id===B.CHEST&&this.game?.chestManager)return this.game.chestManager.getRedstoneSignal(...p);
    if((id===B.FURNACE||id===B.LIT_FURNACE)&&this.game?.furnaceManager)return this.game.furnaceManager.getRedstoneSignal(...p);
    return null;
  }
  signalAt(p,to){
    const cSig=this.getContainerSignal(p);
    if(cSig!==null)return cSig;
    // Minecraft mechanics: read container through 1 solid block behind comparator
    const pid=this.id(p);
    if(to&&pid!==B.AIR&&BLOCK_DEFS[pid]?.solid!==false&&!BLOCK_DEFS[pid]?.transparent){
      const dir=[p[0]-to[0],p[1]-to[1],p[2]-to[2]];
      const behind=add(p,dir);
      const bSig=this.getContainerSignal(behind);
      if(bSig!==null)return bSig;
    }
    const s=this.state(p);
    return this.output(s,to);
  }
  hitTarget(pos, hitPos){
    const s=this.state(pos);
    if(!s||s.id!==B.TARGET_BLOCK)return;
    const center=[pos[0]+.5,pos[1]+.5,pos[2]+.5];
    const dx=hitPos.x-center[0],dy=hitPos.y-center[1],dz=hitPos.z-center[2];
    const dist=Math.sqrt(dx*dx+dy*dy+dz*dz);
    const power=Math.max(1,Math.min(15,Math.round(15-dist*28)));
    s.hitPower=power;
    s.until=this.tickNumber+8;
    s.output=power;
    this.mark(pos);
    for(const d of DIRECTIONS)this.mark(add(pos,d));
  }
  tick(actors=[]){
    this.tickNumber++;const list=[...this.states.values()];
    for(const s of list){const old=s.output;
      if(s.id===B.LEVER)s.output=s.on?15:0;
      if(s.id===B.REDSTONE_BLOCK)s.output=15;
      if(s.id===B.STONE_BUTTON||s.id===B.OBSERVER)s.output=(s.until||0)>this.tickNumber?15:0;
      if(s.id===B.TARGET_BLOCK)s.output=(s.until||0)>this.tickNumber?(s.hitPower||15):0;
      if(s.id===B.PRESSURE_PLATE)s.output=actors.some(a=>{const p=a.position||a.mesh?.position;return p&&Math.abs(p.x-s.p[0]-.5)<.7&&Math.abs(p.z-s.p[2]-.5)<.7&&p.y>=s.p[1]&&p.y<s.p[1]+.4;})?15:0;
      if(s.id===B.TRIPWIRE_HOOK){
        let active=false;const d=DIRECTIONS[s.dir];
        for(let step=1;step<=40;step++){
          const check=add(s.p,d,step);const bid=this.id(check);
          if(bid===B.TRIPWIRE){
            if(actors.some(a=>{const pos=a.position||a.mesh?.position;return pos&&Math.abs(pos.x-check[0]-.5)<.6&&Math.abs(pos.z-check[2]-.5)<.6&&pos.y>=check[1]&&pos.y<check[1]+.9;})){active=true;break;}
          } else if(bid===B.TRIPWIRE_HOOK){break;} else break;
        }
        s.output=active?15:0;
      }
      if(s.id===B.TRIPWIRE){
        s.output=actors.some(a=>{const pos=a.position||a.mesh?.position;return pos&&Math.abs(pos.x-s.p[0]-.5)<.6&&Math.abs(pos.z-s.p[2]-.5)<.6&&pos.y>=s.p[1]&&pos.y<s.p[1]+.9;})?15:0;
      }
      if(s.id===B.DAYLIGHT_DETECTOR){const daylight=this.daylight??1;s.output=Math.round(15*(s.inverted?1-daylight:daylight));}
      if(s.pendingAt<=this.tickNumber){s.output=s.pendingOutput;delete s.pendingAt;}
      if(old!==s.output)this.mark(s.p);
      if(s.id===B.REDSTONE_WIRE)s.power=0;
    }
    // Solve wire strength afresh to drain disconnected loops, bounded at 15 hops.
    for(let pass=0;pass<15;pass++){let changed=false;for(const s of list)if(s.id===B.REDSTONE_WIRE){let n=this.input(s.p,null,true);for(const d of DIRECTIONS){const q=add(s.p,d),source=this.state(q);n=Math.max(n,this.output(source,s.p)-(source?.id===B.REDSTONE_WIRE?1:0));}
      for(const d of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]])for(const dy of [-1,1]){const q=add(add(s.p,d),[0,dy,0]);if(this.state(q)?.id===B.REDSTONE_WIRE&&this.id(add(s.p,[0,1,0]))===B.AIR)n=Math.max(n,(this.state(q).power||0)-1);}
      if(n>s.power){s.power=n;changed=true;}}
      if(!changed)break;
    }
    // Powered TNT is primed once and removed from the voxel grid.
    if(this.game)for(const s of list)if(this.output(s,s.p)>0||s.output>0)for(const d of DIRECTIONS){const p=add(s.p,d);if(this.id(p)===B.TNT&&this.output(s,p)>0){this.world.setVoxel(...p,B.AIR);const V=this.game.player.position.constructor;this.game.entities.spawnPrimedTNT(new V(...p));}}
    const pistons=[];
    for(const s of list){if(this.state(s.p)!==s)continue;const input=this.input(s.p,[B.PISTON,B.STICKY_PISTON].includes(s.id)?add(s.p,DIRECTIONS[s.dir]):null);
      if(s.id===B.REDSTONE_WIRE){const connections=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]].filter(d=>[-1,0,1].some(dy=>this.state(add(add(s.p,d),[0,dy,0]))));if(JSON.stringify(connections)!==JSON.stringify(s.connections)){s.connections=connections;this.mark(s.p);}if(s.drawPower!==s.power){s.drawPower=s.power;this.mark(s.p);}continue;}
      let desired;
      if(s.id===B.REDSTONE_TORCH)desired=this.input(add(s.p,[0,-1,0]),s.p)>0?0:15;
      if(s.id===B.REPEATER||s.id===B.COMPARATOR){const rear=this.signalAt(this.rear(s),s.p),d=DIRECTIONS[s.dir];let side=0;for(const e of DIRECTIONS)if(e[1]===0&&e[0]*d[0]+e[2]*d[2]===0)side=Math.max(side,this.signalAt(add(s.p,e),s.p));
        if(s.id===B.REPEATER){if(side>0)continue;desired=rear?15:0;}else desired=s.subtract?Math.max(0,rear-side):(rear>=side?rear:0);
      }
      if(desired!==undefined&&desired!==s.output&&s.pendingAt===undefined){s.pendingAt=this.tickNumber+(s.id===B.REPEATER?s.delay:1);s.pendingOutput=desired;}
      if(s.id===B.REDSTONE_LAMP){const on=input>0;if(s.on!==on){s.on=on;this.mark(s.p);}}
      if(s.id===B.PISTON||s.id===B.STICKY_PISTON)pistons.push([s,input>0]);
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
      if([B.DISPENSER,B.DROPPER,B.NOTE_BLOCK].includes(s.id)&&input>0&&!s.lastInput){if(s.id===B.NOTE_BLOCK)this.playNote(s);else this.dispense(s);}
      if(s.id===B.HOPPER&&!input){
        this.collectFloatingItems(s);
        if(this.tickNumber%4===0){
          this.hopperPush(s);
          this.hopperPull(s);
        }
      }
      s.lastInput=input;
    }
    for(const [s,on] of pistons)if(this.state(s.p)===s){if(on&&!s.extended)this.extend(s,actors);else if(!on&&s.extended)this.retract(s,actors);}
  }
  transferOne(from,to){const item=from.inventory[0];if(!item)return false;let target=to.inventory.find(i=>i.id===item.id&&i.isBlock===item.isBlock&&i.count<64);if(!target){if(to.inventory.length>=(to.id===B.HOPPER?5:9))return false;target={...item,count:0};to.inventory.push(target);}target.count++;if(--item.count===0)from.inventory.shift();return true;}
  hopperHasSpace(s,id=null,isBlock=false){
    if(s.inventory.length<5)return true;
    if(id!==null)return s.inventory.some(i=>i.id===id&&!!i.isBlock===!!isBlock&&i.count<64);
    return s.inventory.some(i=>i.count<64);
  }
  addHopperItem(s,id,isBlock,count=1){
    let slot=s.inventory.find(i=>i.id===id&&!!i.isBlock===!!isBlock&&i.count<64);
    if(slot){const can=Math.min(count,64-slot.count);slot.count+=can;return can>0;}
    if(s.inventory.length<5){s.inventory.push({id,isBlock,count});return true;}
    return false;
  }
  collectFloatingItems(s){
    if(!this.game?.entities?.droppedItems)return;
    const dropped=this.game.entities.droppedItems;
    for(let i=dropped.length-1;i>=0;i--){
      const dItem=dropped[i];
      const pos=dItem.group?.position;
      if(pos&&Math.abs(pos.x-(s.p[0]+.5))<.75&&Math.abs(pos.z-(s.p[2]+.5))<.75&&pos.y>=s.p[1]+.5&&pos.y<=s.p[1]+1.8){
        if(this.hopperHasSpace(s,dItem.itemType,dItem.isBlock)){
          if(this.addHopperItem(s,dItem.itemType,dItem.isBlock,1)){
            dItem.count--;
            if(dItem.count<=0){
              this.game.entities.itemVisuals?.release?.(dItem.group);
              this.game.entities.scene?.remove?.(dItem.group);
              dropped.splice(i,1);
            }
            break;
          }
        }
      }
    }
  }
  hopperPull(s){
    const abovePos=add(s.p,[0,1,0]),aboveId=this.id(abovePos),above=this.state(abovePos);
    if(above?.inventory?.length){
      this.transferOne(above,s);
    } else if(aboveId===B.CHEST&&this.game?.chestManager){
      if(this.hopperHasSpace(s)){
        const ex=this.game.chestManager.extractItem(...abovePos);
        if(ex)this.addHopperItem(s,ex.id,ex.isBlock,1);
      }
    } else if((aboveId===B.FURNACE||aboveId===B.LIT_FURNACE)&&this.game?.furnaceManager){
      if(this.hopperHasSpace(s)){
        const ex=this.game.furnaceManager.extractItem(...abovePos,'output');
        if(ex)this.addHopperItem(s,ex.id,ex.isBlock,1);
      }
    }
  }
  hopperPush(s){
    if(!s.inventory.length)return;
    const destPos=add(s.p,DIRECTIONS[s.dir]),destId=this.id(destPos),dest=this.state(destPos);
    const item=s.inventory[0];
    if(dest?.inventory){
      this.transferOne(s,dest);
    } else if(destId===B.CHEST&&this.game?.chestManager){
      if(this.game.chestManager.addItem(destPos[0],destPos[1],destPos[2],item.id,item.isBlock,1)){
        if(--item.count===0)s.inventory.shift();
      }
    } else if((destId===B.FURNACE||destId===B.LIT_FURNACE)&&this.game?.furnaceManager){
      const slotType=s.dir===3?'input':'fuel';
      if(this.game.furnaceManager.addItem(destPos[0],destPos[1],destPos[2],item.id,item.isBlock,1,slotType)){
        if(--item.count===0)s.inventory.shift();
      }
    }
  }
  playNote(s){
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
    const item=s.inventory[0];if(!item)return;
    const d=DIRECTIONS[s.dir],p=add(s.p,d).map(v=>v+.5),g=this.game;
    const frontPos=add(s.p,d),frontId=this.id(frontPos);

    if(s.id===B.DROPPER){
      const destState=this.state(frontPos);
      if(destState?.inventory){
        this.transferOne(s,destState);
        return;
      }
      if(frontId===B.CHEST&&g?.chestManager){
        if(g.chestManager.addItem(frontPos[0],frontPos[1],frontPos[2],item.id,item.isBlock,1)){
          if(--item.count===0)s.inventory.shift();
          return;
        }
      }
      if((frontId===B.FURNACE||frontId===B.LIT_FURNACE)&&g?.furnaceManager){
        const slotType=s.dir===3?'input':'fuel';
        if(g.furnaceManager.addItem(frontPos[0],frontPos[1],frontPos[2],item.id,item.isBlock,1,slotType)){
          if(--item.count===0)s.inventory.shift();
          return;
        }
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
    if(s.id===B.DISPENSER&&['arrow','spectral_arrow','tipped_arrow'].includes(item.id)){
      g.mobs?.spawnArrow?.(new V(...p),new V(...d),s);
    } else if(s.id===B.DISPENSER&&item.isBlock&&item.id===B.TNT){
      g.entities?.spawnPrimedTNT?.(new V(...p));
    } else if(s.id===B.DISPENSER&&item.id==='water_bucket'){
      if(frontId===B.AIR||frontId===B.FIRE){
        this.world.setVoxel(...frontPos,B.WATER);
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
      if(frontId===B.WATER){
        this.world.setVoxel(...frontPos,B.AIR);
        item.id='water_bucket';item.isBlock=false;
        return;
      } else if(frontId===B.LAVA){
        this.world.setVoxel(...frontPos,B.AIR);
        item.id='lava_bucket';item.isBlock=false;
        return;
      }
    } else if(s.id===B.DISPENSER&&item.id==='shears'){
      const sheep=g.mobs?.mobs?.find(m=>m.type==='sheep'&&!m.isSheared&&Math.abs(m.position.x-p[0])<1.6&&Math.abs(m.position.z-p[2])<1.6);
      if(sheep){
        sheep.isSheared=true;
        sheep.onSheared?.();
        g.entities?.spawnDroppedItem?.(new V(...p),(sheep.woolColor||'white')+'_wool',true,Math.floor(Math.random()*3)+1);
        return;
      }
    } else if(s.id===B.DISPENSER&&['wheat_seeds','wheat','carrot','potato','beetroot_seeds','pumpkin_seeds','melon_seeds'].includes(item.id)){
      if(frontId===B.AIR){
        const belowFront=add(frontPos,[0,-1,0]),belowId=this.id(belowFront);
        if(belowId===B.FARMLAND||belowId===B.FARMLAND_MOIST){
          let crop=B.WHEAT_STAGE_0;
          if(item.id==='carrot')crop=B.CARROTS_STAGE_0;
          else if(item.id==='potato')crop=B.POTATOES_STAGE_0;
          this.world.setVoxel(...frontPos,crop);
          if(--item.count===0)s.inventory.shift();
          return;
        }
      }
    } else if(s.id===B.DISPENSER&&['bone_meal','bonemeal'].includes(item.id)){
      if(g.farming?.fertilize)g.farming.fertilize(...frontPos);
      g.entities?.spawnBoneMealParticles?.(new V(...p));
      if(--item.count===0)s.inventory.shift();
      return;
    } else if(s.id===B.DISPENSER&&item.id==='flint_and_steel'){
      if(frontId===B.AIR){
        this.world.setVoxel(...frontPos,B.FIRE);
        return;
      }
    } else if(s.id===B.DISPENSER&&(item.id.endsWith('_helmet')||item.id.endsWith('_chestplate')||item.id.endsWith('_leggings')||item.id.endsWith('_boots'))){
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
  movable(p){
    const id=this.id(p),s=this.state(p);
    return this.loaded(p)&&![B.BEDROCK,B.OBSIDIAN,B.PISTON_HEAD,B.CHEST,B.FURNACE,B.LIT_FURNACE,B.NETHER_PORTAL,B.END_PORTAL].includes(id)&&!s?.extended&&!s?.inventory?.length;
  }
  plan(start,dir,base){const result=new Map(),d=DIRECTIONS[dir];let failed=false;
    const visit=(p,sticky=false,fromId=null)=>{const k=key(p),id=this.id(p);if(k===key(base)){if(!sticky)failed=true;return;}if(result.has(k)||id===B.AIR||id===B.WATER||id===B.LAVA)return;
      if(sticky&&((fromId===B.SLIME_BLOCK&&id===B.HONEY_BLOCK)||(fromId===B.HONEY_BLOCK&&id===B.SLIME_BLOCK)))return;
      if(!this.movable(p)){failed=true;return;}result.set(k,{p,id,state:this.state(p)?structuredClone(this.state(p)):null});if(result.size>12){failed=true;return;}
      const dest=add(p,d);if(!this.loaded(dest)){failed=true;return;}visit(dest);
      if(adhesive(id))for(const e of DIRECTIONS)visit(add(p,e),true,id);
    };visit(start);return failed?null:[...result.values()];}
  move(blocks,dir,actors=[]){const d=DIRECTIONS[dir];
    const riders=actors.filter(actor=>{const pos=actor.position||actor.mesh?.position;return pos&&blocks.some(b=>Math.abs(pos.y-(b.p[1]+1))<.3&&pos.x>=b.p[0]-.25&&pos.x<=b.p[0]+1.25&&pos.z>=b.p[2]-.25&&pos.z<=b.p[2]+1.25);});
    const moved=new Set(blocks.map(b=>key(b.p)));
    for(const actor of riders){const pos=actor.position||actor.mesh.position,r=(actor.width||.6)/2;for(let x=Math.floor(pos.x+d[0]-r);x<=Math.floor(pos.x+d[0]+r);x++)for(let z=Math.floor(pos.z+d[2]-r);z<=Math.floor(pos.z+d[2]+r);z++)for(let y=Math.floor(pos.y+d[1]+.01);y<=Math.floor(pos.y+d[1]+(actor.height||1.8)-.01);y++){const p=[x,y,z],id=this.id(p);if(!this.loaded(p)||!moved.has(key(p))&&id!==B.AIR&&BLOCK_DEFS[id]?.solid!==false)return false;}}
    this.moving=true;
    try{for(const b of blocks)this.world.setVoxel(...b.p,B.AIR);for(const b of blocks){const dest=add(b.p,d);this.world.setVoxel(...dest,b.id);if(b.state){b.state.p=dest;if(b.state.id===B.OBSERVER)b.state.until=this.tickNumber+2;this.states.set(key(dest),b.state);}}}finally{this.moving=false;}
    for(const actor of actors){const pos=actor.position||actor.mesh?.position;if(!pos)continue;const riding=blocks.some(b=>Math.abs(pos.y-(b.p[1]+1))<.3&&pos.x>=b.p[0]-.25&&pos.x<=b.p[0]+1.25&&pos.z>=b.p[2]-.25&&pos.z<=b.p[2]+1.25);if(riding){pos.x+=d[0];pos.y+=d[1];pos.z+=d[2];}}
    for(const b of blocks){this.notify(...b.p);this.notify(...add(b.p,d));}return true;
  }
  extend(s,actors){const d=DIRECTIONS[s.dir],front=add(s.p,d);if(!this.loaded(front))return;const blocks=this.plan(front,s.dir,s.p);if(!blocks)return;if(!this.move(blocks,s.dir,actors))return;this.world.setVoxel(...front,B.PISTON_HEAD);this.state(front).dir=s.dir;this.state(front).base=[...s.p];s.extended=true;s.extendedAt=this.tickNumber;this.mark(s.p);}
  retract(s,actors){
    const d=DIRECTIONS[s.dir],front=add(s.p,d);
    if(this.id(front)===B.PISTON_HEAD)this.world.setVoxel(...front,B.AIR);
    s.extended=false;this.mark(s.p);
    if(s.id===B.STICKY_PISTON){
      const start=add(s.p,d,2),opposite=s.dir^1,startId=this.id(start);
      const isOneTickPulse=s.extendedAt!==undefined&&(this.tickNumber-s.extendedAt)<=1;
      if(isOneTickPulse&&!adhesive(startId)){
        // 1-tick pulse drops/leaves the block behind (Minecraft block-dropping mechanic)
      } else {
        const blocks=this.plan(start,opposite,s.p);
        if(blocks)this.move(blocks,opposite,actors);
      }
    }
  }
  update(dt,actors=[]){this.time=Math.min(.5,this.time+Math.max(0,dt));while(this.time>=.1){this.time-=.1;this.tick(actors);}}
  serialize(){return [...this.states.values()].map(s=>{const copy=structuredClone(s);if(copy.until!==undefined)copy.until=Math.max(0,copy.until-this.tickNumber);if(copy.pendingAt!==undefined)copy.pendingAt=Math.max(1,copy.pendingAt-this.tickNumber);return copy;});}
  restore(data){for(const s of Array.isArray(data)?data:[]){if(!Array.isArray(s.p)||s.p.length!==3||!s.p.every(Number.isInteger)||this.id(s.p)!==s.id)continue;const state=this.state(s.p);if(!state)continue;Object.assign(state,s,{dir:Math.max(0,Math.min(5,s.dir|0)),delay:Math.max(1,Math.min(4,s.delay|0)),inventory:Array.isArray(s.inventory)?s.inventory.filter(i=>i&&i.count>0&&i.count<=64).slice(0,9):[]});if(s.pendingAt!==undefined)state.pendingAt=this.tickNumber+Math.max(1,Math.min(4,s.pendingAt));if(s.until!==undefined)state.until=this.tickNumber+Math.max(0,Math.min(10,s.until));this.mark(s.p);}}
}
