import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
const forward = new THREE.Vector3(0,0,1);
export function createArrowModel() {
  const group=new THREE.Group();
  const part=(geometry,color,z)=>{const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({color,emissive:color,emissiveIntensity:.18}));mesh.position.z=z;mesh.castShadow=true;group.add(mesh);return mesh;};
  part(new THREE.BoxGeometry(.045,.045,.8),0xc99d61,-.48);
  const head=part(new THREE.ConeGeometry(.095,.2,4),0xd9e1e4,-.1);head.rotation.x=Math.PI/2;
  part(new THREE.BoxGeometry(.24,.018,.22),0xf2eee2,-.79);
  part(new THREE.BoxGeometry(.018,.24,.22),0xf2eee2,-.79);
  return group;
}
function solid(world,p){const def=BLOCK_DEFS[world.getVoxel(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))];return def && def.solid!==false && !def.plant;}
export function removeArrow(manager,arrow){
  for(const object of [arrow.mesh,arrow.trail]){object?.removeFromParent();object?.traverse(child=>{child.geometry?.dispose();child.material?.dispose();});}
  const index=manager.arrows.indexOf(arrow);if(index>=0)manager.arrows.splice(index,1);
}
export function spawnArrow(manager,origin,direction,shooter,options={}){
  if(manager.arrows.length>=256)removeArrow(manager,manager.arrows[0]);
  const mesh=createArrowModel();mesh.position.copy(origin);mesh.quaternion.setFromUnitVectors(forward,direction.clone().normalize());
  const trail=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffedc2,transparent:true,opacity:.65,vertexColors:true,depthWrite:false}));trail.frustumCulled=false;
  manager.scene.add(mesh,trail);manager.sounds?.playBowShoot?.();
  const arrow={mesh,trail,points:[],velocity:direction.clone().normalize().multiplyScalar(options.speed??22),shooter,damage:options.damage??4,pickup:options.pickup??false,life:10,stuck:false};manager.arrows.push(arrow);return arrow;
}
export function updateArrows(manager,dt,player){
  for(const arrow of [...manager.arrows]){
    arrow.life-=dt;if(arrow.life<=0){removeArrow(manager,arrow);continue;}
    if(arrow.stuck){
      if(!solid(manager.world,arrow.anchor)){arrow.stuck=false;arrow.velocity.set(0,-1,0);arrow.life=10;arrow.points=[];continue;}
      if(arrow.pickup && arrow.mesh.position.distanceTo(player.position.clone().add(new THREE.Vector3(0,.5,0)))<1.4 && manager.game?.inventory?.addItem('arrow',false,1)){manager.game.ui?.updateHotbar();removeArrow(manager,arrow);continue;}
      arrow.mesh.quaternion.copy(arrow.orientation);arrow.mesh.rotateZ(Math.sin(arrow.life*65)*.06*Math.max(0,arrow.life-59));continue;
    }
    const steps=Math.max(1,Math.ceil(arrow.velocity.length()*dt/.08)),step=dt/steps;
    let removed=false;
    for(let i=0;i<steps;i++){
      arrow.velocity.y-=9.8*step;
      const next=arrow.mesh.position.clone().addScaledVector(arrow.velocity,step);
      arrow.mesh.quaternion.setFromUnitVectors(forward,arrow.velocity.clone().normalize());
      if(solid(manager.world,next)){
        const targetPos=[Math.floor(next.x),Math.floor(next.y),Math.floor(next.z)];
        const targetState=manager.world.redstone?.state(targetPos);
        if(targetState?.id===BLOCKS.TARGET_BLOCK){
          if(manager.world.redstone.hitTarget)manager.world.redstone.hitTarget(targetPos,next);
          else targetState.until=manager.world.redstone.tickNumber+8;
        }
        arrow.anchor=next.clone();arrow.mesh.position.copy(next);arrow.stuck=true;arrow.life=60;arrow.orientation=arrow.mesh.quaternion.clone();arrow.trail.visible=false;break;
      }
      arrow.mesh.position.copy(next);
      const targets=arrow.shooter==='player'?manager.mobs.filter(m=>m.health>0&&!m.dying):[player];
      for(const target of targets){
        const pos=target.mesh?.position??target.position,height=target.height??1.8;
        if(Math.abs(next.x-pos.x)<(target.width??.6)/2+.12&&Math.abs(next.z-pos.z)<(target.width??.6)/2+.12&&next.y>=pos.y&&next.y<=pos.y+height){
          if(target===player)player.takeDamage(arrow.damage);else manager.damageMob(target,arrow.damage);
          removeArrow(manager,arrow);removed=true;break;
        }
      }
      if(removed)break;
    }
    if(removed||arrow.stuck)continue;
    arrow.points.unshift(arrow.mesh.position.clone());arrow.points.length=Math.min(arrow.points.length,8);
    arrow.trail.visible=true;arrow.trail.geometry.dispose();arrow.trail.geometry=new THREE.BufferGeometry().setFromPoints(arrow.points);
    const colors=arrow.points.flatMap((_,i)=>{const fade=1-i/arrow.points.length;return [fade,fade,fade];});
    arrow.trail.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  }
}
