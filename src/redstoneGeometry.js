import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS as B } from './blocks.js';
const dirs=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export function redstoneGeometry(id,tm,state={}){
  const parts=[],power=(state.power||state.output||state.on)?1:0;
  const box=(size,pos,color,glow=0,rotation=0,texture=B.REDSTONE_WIRE)=>{
    const geo=new THREE.BoxGeometry(...size);geo.rotateX(rotation);geo.translate(...pos);const uv=geo.attributes.uv,tile=tm.getFaceUVs(texture,'all');for(let i=0;i<uv.count;i++)uv.setXY(i,THREE.MathUtils.lerp(tile.u0,tile.u1,uv.getX(i)),THREE.MathUtils.lerp(tile.v0,tile.v1,uv.getY(i)));
    const c=new THREE.Color(color),colors=[];for(let i=0;i<geo.attributes.position.count;i++)colors.push(c.r,c.g,c.b);
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('emission',new THREE.Float32BufferAttribute(new Float32Array(24).fill(glow),1));geo.setAttribute('flame',new THREE.Float32BufferAttribute(new Float32Array(24),1));parts.push(geo);return geo;
  };
  const indicator=(x,y,z,on=power)=>box([.1,.1,.1],[x,y,z],on?0xff3020:0x651510,on?.9:0);
  if(id===B.LEVER){box([.45,.16,.4],[.5,.08,.5],0x777d83);box([.09,.5,.09],[.5,.37,state.on?.4:.6],0xbba078,0,state.on?.5:-.5);indicator(.5,.13,.24,state.on);}
  else if(id===B.REDSTONE_WIRE){const level=Math.max(0,Math.min(15,state.power??0))/15,color=new THREE.Color().setRGB(.12+.88*level,.005+.025*level,.005+.01*level);box([.18,.025,.18],[.5,.025,.5],color,level*.6);for(const d of state.connections||[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]])box(d[0]?[.5,.025,.08]:[.08,.025,.5],[.5+d[0]*.25,.025,.5+d[2]*.25],color,level*.6);for(const d of state.risers??[])box(d[0]?[.025,1,.08]:[.08,1,.025],[.5+d[0]*.49,.52,.5+d[2]*.49],color,level*.6);}
  else if(id===B.STONE_BUTTON){box([.28,power?.07:.13,.2],[.5,.07,.5],power?0xbcb8b0:0x777b80);}
  else if(id===B.PRESSURE_PLATE||id===B.DAYLIGHT_DETECTOR){box([.85,id===B.DAYLIGHT_DETECTOR?.35:.07,.85],[.5,id===B.DAYLIGHT_DETECTOR?.175:.05,.5],id===B.DAYLIGHT_DETECTOR?0xadb6ca:power?0xe7b966:0x8f8981);}
  else if(id===B.REPEATER||id===B.COMPARATOR){box([.95,.12,.85],[.5,.06,.5],0xc6c2ad);box([.7,.025,.06],[.5,.135,.5],power?0xff3222:0x780b0b,power*.6);for(const x of [.2,.8]){box([.065,.22,.065],[x,.23,.5],0x725036);indicator(x,.36,.5);}if(id===B.COMPARATOR)indicator(.2,.3,.2,state.subtract);else if(state.locked)box([.14,.14,.7],[.4,.29,.5],0x3e4147);else box([.07,.1,.25],[.3+(state.delay||1)*.1,.2,.5],0x7d7670);}
  else if(id===B.REDSTONE_TORCH){box([.12,.52,.12],[.5,.26,.5],0x8c683c);box([.17,.15,.17],[.5,.59,.5],power?0xff3422:0x5b1611,power);}
  else if(id===B.PISTON_HEAD){box([.18,.95,.95],[.9,.5,.5],0xc2aa75);box([.8,.22,.22],[.4,.5,.5],0x9f8b65);}
  else if(id===B.PISTON||id===B.STICKY_PISTON){box([state.extended?.75:1,1,1],[state.extended?.375:.5,.5,.5],0x7d7f78);if(!state.extended)box([.07,.92,.92],[.97,.5,.5],id===B.STICKY_PISTON?0x83b657:0xc7aa79);box([.72,.15,.96],[.4,.2,.5],0x9e8f70);box([.72,.15,.96],[.4,.8,.5],0x9e8f70);}
  else if([B.IRON_DOOR,B.IRON_DOOR_OPEN,B.IRON_TRAPDOOR,B.IRON_TRAPDOOR_OPEN].includes(id)){const open=[B.IRON_DOOR_OPEN,B.IRON_TRAPDOOR_OPEN].includes(id),trap=[B.IRON_TRAPDOOR,B.IRON_TRAPDOOR_OPEN].includes(id);box(trap&&!open?[1,.12,1]:open?[.12,1,1]:[1,1,.12],trap&&!open?[.5,.06,.5]:open?[.06,.5,.5]:[.5,.5,.06],0xc5d0d1);}
  // Wooden doors and trapdoors: a plank panel that swings aside (a thin slab when
  // open) rather than the metal one above.
  else if([B.OAK_DOOR,B.OAK_DOOR_OPEN,B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN].includes(id)){const open=[B.OAK_DOOR_OPEN,B.OAK_TRAPDOOR_OPEN].includes(id),trap=[B.OAK_TRAPDOOR,B.OAK_TRAPDOOR_OPEN].includes(id);box(trap&&!open?[1,.12,1]:open?[.12,1,1]:[1,1,.12],trap&&!open?[.5,.06,.5]:open?[.06,.5,.5]:[.5,.5,.06],0xb98a4e);if(!trap)box([.18,.18,.2],[open?.12:.82,.5,.5],0x8a6437);}
  // Rails: two sleepers with a metal strip that shifts to show the axis, plus the
  // gold and lit look of a powered rail.
  else if(id===B.RAIL||id===B.POWERED_RAIL){
    const powered=id===B.POWERED_RAIL,live=powered&&power;
    const vertical=(state.dir===4||state.dir===5); // running along Z
    box(vertical?[.9,.06,.24]:[.24,.06,.9],[.5,.04,.5],0x7a5a35);
    for(const o of [-.34,.34])box(vertical?[1,0.02,.1]:[.1,.02,1],[vertical?.5:.5+o,.045,vertical?.5+o:.5],live?0xffd45c:0xd8b26a,live?.5:0);
    box(vertical?[.14,.05,.9]:[.9,.05,.14],[.5,.07,.5],live?0xffe08a:0xc9a05a,live?.9:0);
  }
  else if(id===B.REDSTONE_LAMP){box([1,1,1],[.5,.5,.5],state.on?0xffd082:0x4b3024,state.on?.95:0,0,B.REDSTONE_LAMP);}
  else {const color=id===B.REDSTONE_BLOCK?0xcc2220:id===B.SLIME_BLOCK?0x80bf53:id===B.HONEY_BLOCK?0xdca037:id===B.NOTE_BLOCK?0x805232:0x8b918e;box([1,1,1],[.5,.5,.5],color);if(id===B.OBSERVER){box([.025,.8,.8],[.995,.5,.5],0xc3c4bd);for(const z of [.3,.7])box([.03,.12,.12],[1.015,.65,z],0x252d30);indicator(-.01,.5,.5);}if(id===B.DISPENSER||id===B.DROPPER)box([.025,.35,.35],[1.01,.5,.5],0x282b2a);if(id===B.HOPPER)box([.75,.08,.75],[.5,1.01,.5],0x303936);if(id===B.TARGET_BLOCK){box([.03,.65,.65],[1.01,.5,.5],0xf3dfb0);box([.04,.28,.28],[1.02,.5,.5],0xad2d25);}}
  const geo=mergeGeometries(parts);parts.forEach(p=>p.dispose());
  if(id===B.LEVER&&state.attach){geo.translate(-.5,0,-.5);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(...state.attach).negate()));geo.translate(.5+state.attach[0]*.5,.5+state.attach[1]*.5,.5+state.attach[2]*.5);}
  if([B.PISTON,B.STICKY_PISTON,B.PISTON_HEAD,B.OBSERVER,B.REPEATER,B.COMPARATOR,B.DISPENSER,B.DROPPER,B.HOPPER].includes(id)){geo.translate(-.5,-.5,-.5);geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1,0,0),new THREE.Vector3(...dirs[state.dir||0])));geo.translate(.5,.5,.5);}
  return geo;
}
