import * as THREE from 'three';
import { BLOCKS as B, BLOCK_DEFS } from './blocks.js';
import { useEndGateway } from './endProgression.js';
import { spawnEndermiteForPearl } from './endermiteBehavior.js';

const solid=id=>id!==B.AIR&&BLOCK_DEFS[id]?.solid!==false&&!BLOCK_DEFS[id]?.plant;
export function chorusTeleport(world,position,random=Math.random) {
  for(let attempt=0;attempt<16;attempt++) {
    const x=Math.floor(position.x+(random()-.5)*16),z=Math.floor(position.z+(random()-.5)*16);
    let y=Math.max(1,Math.min(62,Math.floor(position.y)+Math.floor(random()*16)-8));
    if(world.getChunk&&!world.getChunk(Math.floor(x/16),Math.floor(z/16)))continue;
    while(y>1&&!solid(world.getVoxel(x,y-1,z)))y--;
    const feet=world.getVoxel(x,y,z),head=world.getVoxel(x,y+1,z),ground=world.getVoxel(x,y-1,z);
    if(!solid(feet)&&!solid(head)&&solid(ground)&&![B.WATER,B.LAVA,B.FIRE,B.SOUL_FIRE].includes(feet)&&ground!==B.MAGMA_BLOCK)return new THREE.Vector3(x+.5,y,z+.5);
  }
  return null;
}

export class EndItemController {
  constructor(game,{random=Math.random}={}) {this.game=game;this.random=random;this.pearls=[];this.pearlCooldown=0;this.chorusCooldown=0;}
  consume() {const g=this.game;if(g.player.gamemode!=='creative')g.inventory.consumeActiveItem();g.ui?.updateHotbar?.();}
  use() {
    const g=this.game,item=g.inventory?.getActiveItem?.(),p=g.player;
    if(!item||item.isBlock)return false;
    if(item.id==='ender_pearl') {
      if(this.pearlCooldown>0)return true;
      this.pearlCooldown=1;
      const direction=new THREE.Vector3();g.camera.getWorldDirection(direction);
      const origin=p.position.clone().add(new THREE.Vector3(0,p.eyeHeight??1.62,0));
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(.13,8,6),new THREE.MeshLambertMaterial({color:0x269e91,emissive:0x124c45}));
      mesh.position.copy(origin);g.scene?.add(mesh);
      this.pearls.push({mesh,velocity:direction.multiplyScalar(30),age:0,dimension:g.world.dimension,thrower:p.position.clone()});
      this.consume();g.sounds?.playBowShoot?.();return true;
    }
    if(item.id==='chorus_fruit') {
      if(this.chorusCooldown>0)return true;
      this.chorusCooldown=1;
      // Unlike ordinary foods it remains usable at full hunger.
      p.eatFood?.(4,2.4);this.consume();g.sounds?.playEat?.();
      const destination=chorusTeleport(g.world,p.position,this.random);
      if(destination){p.position.copy(destination);p.velocity?.set(0,0,0);p.fallDistance=0;g.loadChunksAroundPlayer?.();}
      return true;
    }
    if(item.id==='glass_bottle') {
      const cloud=g.bossManager?.dragonBreathClouds?.find(c=>c.age<8 && c.position.distanceTo(p.position)<(c.radius??3.5)+1);
      if(!cloud)return false;
      this.consume();
      if(!g.inventory.addItem('dragon_breath',false,1))g.entities?.spawnDroppedItem?.(p.position.clone(),'dragon_breath',false,1);
      cloud.radius=Math.max(0,(cloud.radius??3.5)-.5);
      cloud.mesh?.scale?.set(cloud.radius/3.5,1,cloud.radius/3.5);
      return true;
    }
    if(item.id==='end_crystal'&&g.targetBlock) {
      const b=g.targetBlock;
      if(g.bossManager?.placeEndCrystal?.(b.x,b.y+1,b.z))this.consume();
      return true;
    }
    return false;
  }
  remove(pearl) {pearl.mesh.removeFromParent();pearl.mesh.geometry.dispose();pearl.mesh.material.dispose();this.pearls.splice(this.pearls.indexOf(pearl),1);}
  clear(){for(const pearl of [...this.pearls])this.remove(pearl);}
  update(dt) {
    this.pearlCooldown=Math.max(0,this.pearlCooldown-dt);this.chorusCooldown=Math.max(0,this.chorusCooldown-dt);
    const g=this.game,w=g.world,p=g.player;
    for(const pearl of [...this.pearls]) {
      pearl.age+=dt;
      if(pearl.dimension!==w.dimension||pearl.age>20||p.isDead||pearl.mesh.position.y<-64){this.remove(pearl);continue;}
      const steps=Math.max(1,Math.ceil(pearl.velocity.length()*dt/.15)),step=dt/steps;
      for(let i=0;i<steps;i++) {
        pearl.velocity.y-=16*step;
        const next=pearl.mesh.position.clone().addScaledVector(pearl.velocity,step);
        const x=Math.floor(next.x),y=Math.floor(next.y),z=Math.floor(next.z),id=w.getVoxel(x,y,z);
        if(id===B.END_GATEWAY && useEndGateway(g,x,y,z)){this.remove(pearl);break;}
        if(solid(id)) {
          p.position.copy(pearl.mesh.position);p.velocity?.set(0,0,0);p.fallDistance=0;
          if(!['creative','spectator'].includes(p.gamemode))p.takeDamage?.(5,next,'ender_pearl');
          if(g.difficulty!=='peaceful')spawnEndermiteForPearl(g.mobs,pearl.thrower,{random:this.random});
          g.loadChunksAroundPlayer?.();this.remove(pearl);break;
        }
        pearl.mesh.position.copy(next);
      }
    }
  }
}
