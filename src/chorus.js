import * as THREE from 'three';
import { BLOCKS as B } from './blocks.js';

export const isChorus=id=>id===B.CHORUS_PLANT||id===B.CHORUS_FLOWER;
const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
export function collapseChorusSupport(world,x,y,z,{random=Math.random,drop=()=>{}}={}) {
  if(world.chorusCollapsing)return;
  const visited=new Set(),remove=[];
  for(const [dx,dy,dz]of directions) {
    const stack=[[x+dx,y+dy,z+dz]],component=[];let rooted=false;
    while(stack.length&&component.length<4096) {
      const [px,py,pz]=stack.pop(),key=`${px},${py},${pz}`;
      if(visited.has(key)||!isChorus(world.getVoxel(px,py,pz)))continue;
      visited.add(key);component.push([px,py,pz,world.getVoxel(px,py,pz)]);
      if(world.getVoxel(px,py-1,pz)===B.END_STONE)rooted=true;
      for(const [nx,ny,nz]of directions)stack.push([px+nx,py+ny,pz+nz]);
    }
    if(!rooted)remove.push(...component);
  }
  world.chorusCollapsing=true;
  try {
    for(const [px,py,pz,id]of remove){world.setVoxel(px,py,pz,B.AIR);if(id===B.CHORUS_PLANT&&random()<.5)drop(new THREE.Vector3(px+.5,py+.5,pz+.5),'chorus_fruit',false,1);}
  } finally {world.chorusCollapsing=false;}
  return remove.length;
}

export class ChorusSystem {
  constructor(world,{random=Math.random,changed=()=>{}}={}) {this.world=world;this.random=random;this.changed=changed;this.flowers=new Map();this.scanned=new WeakSet();this.timer=0;}
  key(x,y,z){return`${this.world.dimension}:${x},${y},${z}`;}
  register(x,y,z,age=5) {
    if(this.world.getVoxel(x,y,z)!==B.CHORUS_FLOWER)return;
    this.flowers.set(this.key(x,y,z),{x,y,z,dimension:this.world.dimension});
    if(!this.world.structureOrientations.has(`${x},${y},${z}`))this.setAge(x,y,z,age);
  }
  setAge(x,y,z,age){this.world.structureOrientations.set(`${x},${y},${z}`,{x,y,z,id:B.CHORUS_FLOWER,plantAge:age});this.changed(x,y,z);}
  discover() {
    for(const chunk of this.world.chunks?.values()??[]) {
      if(this.scanned.has(chunk))continue;this.scanned.add(chunk);
      for(let i=0;i<chunk.voxels.length;i++)if(chunk.voxels[i]===B.CHORUS_FLOWER)this.register(chunk.cx*16+i%16,Math.floor(i/256),chunk.cz*16+Math.floor(i/16)%16);
      break;
    }
  }
  loaded(x,z){return !this.world.getChunk||!!this.world.getChunk(Math.floor(x/16),Math.floor(z/16));}
  clear(x,y,z,exclude) {
    if(y>=63||!this.loaded(x,z)||this.world.getVoxel(x,y,z)!==B.AIR)return false;
    return [[1,0],[-1,0],[0,1],[0,-1]].every(([dx,dz])=>exclude&&x+dx===exclude.x&&z+dz===exclude.z||this.world.getVoxel(x+dx,y,z+dz)===B.AIR);
  }
  tick(x,y,z) {
    if(this.world.getVoxel(x,y,z)!==B.CHORUS_FLOWER)return;
    const age=this.world.structureOrientations.get(`${x},${y},${z}`)?.plantAge??5;
    if(age>=5)return;
    let below=this.world.getVoxel(x,y-1,z),run=0;
    while(below===B.CHORUS_PLANT&&run<6){run++;below=this.world.getVoxel(x,y-1-run,z);}
    if(below!==B.END_STONE&&!isChorus(this.world.getVoxel(x,y-1,z))){collapseChorusSupport(this.world,x,y-1,z);return;}
    if(run<2+Math.floor(this.random()*4)&&this.clear(x,y+1,z)) {
      this.world.setVoxel(x,y,z,B.CHORUS_PLANT);this.world.setVoxel(x,y+1,z,B.CHORUS_FLOWER);this.register(x,y+1,z,age);this.changed(x,y,z);return;
    }
    if(age<4) {
      let branches=0;
      for(let i=0,n=1+Math.floor(this.random()*4);i<n;i++) {
        const [dx,dz]=[[1,0],[-1,0],[0,1],[0,-1]][Math.floor(this.random()*4)];
        const px=x+dx,pz=z+dz;
        if(this.world.getVoxel(px,y-1,pz)!==B.AIR||!this.clear(px,y,pz,{x,z}))continue;
        this.world.setVoxel(px,y,pz,B.CHORUS_FLOWER);this.register(px,y,pz,age+1);branches++;
      }
      if(branches){this.world.setVoxel(x,y,z,B.CHORUS_PLANT);this.changed(x,y,z);return;}
    }
    this.setAge(x,y,z,5);
  }
  update(dt,player) {
    this.discover();this.timer+=dt;if(this.timer<1)return;
    const chance=1-Math.pow(1-3/4096,20*this.timer);this.timer=0;
    for(const [key,p]of this.flowers) {
      if(p.dimension!==this.world.dimension||!this.loaded(p.x,p.z))continue;
      if(this.world.getVoxel(p.x,p.y,p.z)!==B.CHORUS_FLOWER){this.flowers.delete(key);continue;}
      if(player&&Math.hypot(p.x-player.x,p.z-player.z)>128)continue;
      if(this.random()<chance)this.tick(p.x,p.y,p.z);
    }
  }
}
