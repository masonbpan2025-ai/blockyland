import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';
export const DIRECTIONS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const key = p => p.join(',');
const add = (a,b,n=1) => a.map((v,i)=>v+b[i]*n);
const directional = new Set([B.REPEATER,B.COMPARATOR,B.OBSERVER,B.PISTON,B.STICKY_PISTON,B.PISTON_HEAD,B.DISPENSER,B.DROPPER,B.HOPPER]);
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
    if(BLOCK_DEFS[id]?.redstone){if(previous?.id!==id)this.states.set(key(p),{p,id,dir:0,on:false,power:0,output:id===B.REDSTONE_TORCH?15:0,delay:1,inventory:[]});}
    else this.states.delete(key(p));
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
    else if([B.DISPENSER,B.DROPPER,B.HOPPER].includes(s.id)){
      if(held&&held.count>0){const slot=s.inventory.find(i=>i.id===held.id&&i.isBlock===held.isBlock&&i.count<64);if(slot)slot.count++;else if(s.inventory.length<(s.id===B.HOPPER?5:9))s.inventory.push({...held,count:1});else return 'Container full';if(this.game?.player?.gamemode!=='creative')held.count--;}
      else {const slot=s.inventory[0];if(slot&&this.game?.inventory.addItem(slot.id,slot.isBlock,slot.count))s.inventory.shift();}
      return 'Stored items: '+s.inventory.reduce((n,i)=>n+i.count,0);
    } else if(s.id===B.NOTE_BLOCK){s.note=((s.note||0)+1)%25;this.playNote(s);}
    else return null;
    this.mark(p);return s.id===B.REPEATER?'Repeater delay: '+s.delay+' redstone ticks':s.id===B.COMPARATOR?(s.subtract?'Subtract mode':'Compare mode'):s.id===B.LEVER?(s.on?'Lever ON':'Lever OFF'):'Activated';
  }
  output(s,target){
    if(!s)return 0;
    if([B.REPEATER,B.COMPARATOR,B.OBSERVER].includes(s.id)){
      const d=DIRECTIONS[s.dir],out=add(s.p,d,s.id===B.OBSERVER?-1:1);
      if(key(out)!==key(target))return 0;
    }
    if(s.id===B.REDSTONE_WIRE)return s.power||0;
    return s.output||0;
  }
  input(p,exclude=null,skipWire=false){
    let power=0;
    for(const d of DIRECTIONS){const q=add(p,d);if(exclude&&key(q)===key(exclude))continue;if(!skipWire||this.state(q)?.id!==B.REDSTONE_WIRE)power=Math.max(power,this.output(this.state(q),p));
      // One solid block may conduct strong power, but never recursively feed itself.
      if((!this.state(q)&&BLOCK_DEFS[this.id(q)]?.solid!==false&&this.id(q)!==B.AIR) || adhesive(this.id(q)))for(const e of DIRECTIONS){const r=add(q,e);if(key(r)!==key(p)&&(!exclude||key(r)!==key(exclude))){const source=this.state(r);if(source?.id!==B.REDSTONE_WIRE)power=Math.max(power,this.output(source,q));}}
    }return power;
  }
  rear(s){return add(s.p,DIRECTIONS[s.dir],-1);}
  signalAt(p,to){const s=this.state(p);if(s?.inventory?.length){const total=s.inventory.reduce((n,i)=>n+i.count,0);return 1+Math.floor(14*total/((s.id===B.HOPPER?5:9)*64));}return this.output(s,to);}
  tick(actors=[]){
    this.tickNumber++;const list=[...this.states.values()];
    for(const s of list){const old=s.output;
      if(s.id===B.LEVER)s.output=s.on?15:0;
      if(s.id===B.REDSTONE_BLOCK)s.output=15;
      if(s.id===B.STONE_BUTTON||s.id===B.OBSERVER||s.id===B.TARGET_BLOCK)s.output=(s.until||0)>this.tickNumber?15:0;
      if(s.id===B.PRESSURE_PLATE)s.output=actors.some(a=>{const p=a.position||a.mesh?.position;return p&&Math.abs(p.x-s.p[0]-.5)<.7&&Math.abs(p.z-s.p[2]-.5)<.7&&p.y>=s.p[1]&&p.y<s.p[1]+.4;})?15:0;
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
      if([B.IRON_DOOR,B.IRON_DOOR_OPEN,B.IRON_TRAPDOOR,B.IRON_TRAPDOOR_OPEN].includes(s.id)){
        const door=[B.IRON_DOOR,B.IRON_DOOR_OPEN].includes(s.id),id=door?(input?B.IRON_DOOR_OPEN:B.IRON_DOOR):(input?B.IRON_TRAPDOOR_OPEN:B.IRON_TRAPDOOR);if(id!==s.id){this.world.setVoxel(...s.p,id);Object.assign(this.state(s.p),s,{id,on:!!input});}}
      if([B.DISPENSER,B.DROPPER,B.NOTE_BLOCK].includes(s.id)&&input>0&&!s.lastInput){if(s.id===B.NOTE_BLOCK)this.playNote(s);else this.dispense(s);}
      if(s.id===B.HOPPER&&!input&&this.tickNumber%4===0){const above=this.state(add(s.p,[0,1,0])),dest=this.state(add(s.p,DIRECTIONS[s.dir]));if(above?.inventory?.length)this.transferOne(above,s);if(dest?.inventory&&s.inventory.length)this.transferOne(s,dest);}
      s.lastInput=input;
    }
    for(const [s,on] of pistons)if(this.state(s.p)===s){if(on&&!s.extended)this.extend(s,actors);else if(!on&&s.extended)this.retract(s,actors);}
  }
  transferOne(from,to){const item=from.inventory[0];if(!item)return false;let target=to.inventory.find(i=>i.id===item.id&&i.isBlock===item.isBlock&&i.count<64);if(!target){if(to.inventory.length>=(to.id===B.HOPPER?5:9))return false;target={...item,count:0};to.inventory.push(target);}target.count++;if(--item.count===0)from.inventory.shift();return true;}
  playNote(s){const audio=this.game?.sounds;audio?.ensureContext?.();if(!audio?.ctx||!audio.soundEnabled)return;const osc=audio.ctx.createOscillator(),gain=audio.ctx.createGain(),now=audio.ctx.currentTime;osc.type='triangle';osc.frequency.value=185*Math.pow(2,(s.note||0)/12);gain.gain.setValueAtTime(.2,now);gain.gain.exponentialRampToValueAtTime(.001,now+.5);osc.connect(gain);gain.connect(audio.ctx.destination);osc.start(now);osc.stop(now+.5);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  dispense(s){const item=s.inventory[0];if(!item)return;const d=DIRECTIONS[s.dir],p=add(s.p,d).map(v=>v+.5),g=this.game;if(!g)return;
    if(s.id===B.DISPENSER&&item.id==='arrow'){const V=g.player.position.constructor;g.mobs.spawnArrow(new V(...p),new V(...d),s);}
    else if(s.id===B.DISPENSER&&item.isBlock&&item.id===B.TNT){const V=g.player.position.constructor;g.entities.spawnPrimedTNT(new V(...p));}
    else {const V=g.player.position.constructor;g.entities.spawnDroppedItem(new V(...p),item.id,item.isBlock);}
    if(--item.count===0)s.inventory.shift();
  }
  movable(p){const id=this.id(p),s=this.state(p);return this.loaded(p)&&![B.BEDROCK,B.OBSIDIAN,B.PISTON_HEAD].includes(id)&&!s?.extended&&!s?.inventory?.length;}
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
  retract(s,actors){const d=DIRECTIONS[s.dir],front=add(s.p,d);if(this.id(front)===B.PISTON_HEAD)this.world.setVoxel(...front,B.AIR);s.extended=false;this.mark(s.p);
    if(s.id===B.STICKY_PISTON){const start=add(s.p,d,2),opposite=s.dir^1,blocks=this.plan(start,opposite,s.p);if(blocks)this.move(blocks,opposite,actors);}}
  update(dt,actors=[]){this.time=Math.min(.5,this.time+Math.max(0,dt));while(this.time>=.1){this.time-=.1;this.tick(actors);}}
  serialize(){return [...this.states.values()].map(s=>{const copy=structuredClone(s);if(copy.until!==undefined)copy.until=Math.max(0,copy.until-this.tickNumber);if(copy.pendingAt!==undefined)copy.pendingAt=Math.max(1,copy.pendingAt-this.tickNumber);return copy;});}
  restore(data){for(const s of Array.isArray(data)?data:[]){if(!Array.isArray(s.p)||s.p.length!==3||!s.p.every(Number.isInteger)||this.id(s.p)!==s.id)continue;const state=this.state(s.p);if(!state)continue;Object.assign(state,s,{dir:Math.max(0,Math.min(5,s.dir|0)),delay:Math.max(1,Math.min(4,s.delay|0)),inventory:Array.isArray(s.inventory)?s.inventory.filter(i=>i&&i.count>0&&i.count<=64).slice(0,9):[]});if(s.pendingAt!==undefined)state.pendingAt=this.tickNumber+Math.max(1,Math.min(4,s.pendingAt));if(s.until!==undefined)state.until=this.tickNumber+Math.max(0,Math.min(10,s.until));this.mark(s.p);}}
}
