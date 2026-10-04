import * as THREE from 'three';
import {BLOCK_DEFS} from './blocks.js';
export function releaseHorseLead(manager,mob){
 if(!mob.leashHolder&&!mob.leashAnchor)return;
 mob.leashHolder=null;mob.leashAnchor=null;
 if(mob.leashLine){mob.leashLine.removeFromParent();mob.leashLine.geometry.dispose();mob.leashLine.material.dispose();mob.leashLine=null;}
 manager.entities?.spawnDroppedItem(mob.mesh.position.clone(),'lead',false,1);
}
export function tieHorseLeads(manager,player,x,y,z){
 let changed=false;
 for(const m of manager.mobs){if(m.leashHolder===player&&m.mesh.position.distanceTo(new THREE.Vector3(x,y,z))<10){m.leashHolder=null;m.leashAnchor={x:x+.5,y:y+.8,z:z+.5};changed=true;}else if(m.leashAnchor&&Math.floor(m.leashAnchor.x)===x&&Math.floor(m.leashAnchor.y)===y&&Math.floor(m.leashAnchor.z)===z){releaseHorseLead(manager,m);changed=true;}}
 return changed;
}
export function updateHorseLead(manager,mob){
 if(!mob.leashHolder&&!mob.leashAnchor)return;
 if(mob.health<=0||(mob.leashAnchor&&!BLOCK_DEFS[manager.world.getVoxel(Math.floor(mob.leashAnchor.x),Math.floor(mob.leashAnchor.y),Math.floor(mob.leashAnchor.z))]?.fence)){releaseHorseLead(manager,mob);return;}
 const target=mob.leashHolder?.position?.clone().add(new THREE.Vector3(0,1,0))||new THREE.Vector3(mob.leashAnchor.x,mob.leashAnchor.y,mob.leashAnchor.z);
 const from=mob.mesh.position.clone().add(new THREE.Vector3(0,mob.isBaby?.9:1.2,0)),delta=target.clone().sub(from),distance=delta.length();
 if(distance>10){releaseHorseLead(manager,mob);return;}
 if(distance>2){delta.normalize();mob.velocity.x=delta.x*Math.min(4,distance-2);mob.velocity.z=delta.z*Math.min(4,distance-2);if(distance>6)mob.velocity.y+=delta.y*2;mob.yaw=Math.atan2(delta.x,delta.z);mob.grazeTime=0;}
 else if(mob.leashAnchor){mob.velocity.x=mob.velocity.z=0;}
 if(!mob.leashLine){mob.leashLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x715337}));manager.scene.add(mob.leashLine);}
 const mid=from.clone().lerp(target,.5);mid.y-=.15;mob.leashLine.geometry.setFromPoints([from,mid,target]);
}
