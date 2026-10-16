import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { igniteActor } from './heat.js';
import { exposedToRain } from './weatherRules.js';
import { applyCubeSize } from './cubeMobBehavior.js';

function attackDamage(manager, base) {
  const difficulty = manager.game?.difficulty;
  return difficulty === 'peaceful' ? 0 : difficulty === 'easy' ? Math.min(base, base/2+1) : difficulty === 'hard' ? base*1.5 : base;
}

export function setMagmaSize(mob, size) {
  // Health and hitbox come from the shared cube rule both slimes and magma cubes use.
  // Magma cubes add size-scaled armour and their own mesh scale on top.
  applyCubeSize(mob, size);
  mob.armor = size * 3;
  mob.mesh.scale.setScalar(mob.width / .8);
}

function visible(manager, from, to) {
  const delta = to.clone().sub(from), steps = Math.ceil(delta.length() * 4);
  for (let i = 1; i < steps; i++) {
    const p = from.clone().addScaledVector(delta, i / steps);
    if (manager.isBlockSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) return false;
  }
  return true;
}

export function alertBlazes(manager, mob, attacker) {
  if (!attacker || attacker === mob || ['creative','spectator'].includes(attacker.gamemode)) return;
  for (const other of manager.mobs) if (other.type==='blaze' && other.health>0 && other.mesh.position.distanceTo(mob.mesh.position)<=48) {
    other.blazeTarget=attacker;other.blazeAnger=30;
  }
}

export function updateBlaze(manager, mob, player, dt) {
  if(mob.frozen || mob.health<=0)return;
  const pos=mob.mesh.position, world=manager.world;
  mob.blazeAnger=Math.max(0,(mob.blazeAnger || 0)-dt);
  if(!mob.blazeAnger || mob.blazeTarget?.health<=0)mob.blazeTarget=null;
  const victim=mob.blazeTarget || player;
  const victimPos=victim.mesh?.position || victim.position;
  const target=victimPos.clone().add(new THREE.Vector3(0,(victim.height || 1.8)*.5,0));
  const origin=pos.clone().add(new THREE.Vector3(0,1.35,0));
  const active=manager.game?.difficulty!=='peaceful' && !victim.isDead && !['creative','spectator'].includes(victim.gamemode) && pos.distanceTo(victimPos)<=48;
  const sight=active && visible(manager,origin,target);
  mob.hasPlayerTarget=active && victim===player;
  mob.meleeTimer=Math.max(0,(mob.meleeTimer || 0)-dt);
  mob.velocity.x=mob.velocity.z=0;
  // Java blazes sink when idle, and rise to hover above their target in combat.
  const desiredY=victimPos.y+1.5;
  mob.velocity.y=active?THREE.MathUtils.clamp((desiredY-pos.y)*1.4,-1.2,2):Math.max(-1.2,mob.velocity.y-dt*3);
  if(active){
    const dir=victimPos.clone().sub(pos);dir.y=0;const distance=dir.length();dir.normalize();mob.yaw=Math.atan2(dir.x,dir.z);
    if(distance>2){
      const ahead=pos.clone().addScaledVector(dir,.7);
      const water=world.getVoxel(Math.floor(ahead.x),Math.floor(ahead.y),Math.floor(ahead.z))===BLOCKS.WATER;
      if(!water){mob.velocity.x=dir.x*.65;mob.velocity.z=dir.z*.65;}
    }
    const touching=Math.abs(pos.x-victimPos.x)<(.6+(victim.width||.6))/2+.08 && Math.abs(pos.z-victimPos.z)<(.6+(victim.width||.6))/2+.08 && pos.y<victimPos.y+(victim.height||1.8) && pos.y+1.8>victimPos.y;
    if(touching && mob.meleeTimer===0){
      if(victim.mesh)manager.damageMob(victim,attackDamage(manager,6),pos,false,mob);
      else victim.takeDamage?.(attackDamage(manager,6),pos,'blaze');
      mob.meleeTimer=1;
    }
    // Occlusion pauses a pending volley. It must not restart the charge or lose shots.
    if(sight){
      mob.blazeTimer=Math.max(0,(mob.blazeTimer || 0)-dt);
      if(!mob.blazePhase && mob.blazeTimer===0){mob.blazePhase='charge';mob.blazeTimer=3;}
      else if(mob.blazePhase==='charge' && mob.blazeTimer===0){mob.blazePhase='burst';mob.blazeShots=0;}
      if(mob.blazePhase==='burst' && mob.blazeTimer===0){
        if(mob.blazeShots<3){shootBlazeFireball(manager,mob,target);mob.blazeShots++;mob.blazeTimer=.3;}
        else {mob.blazePhase=null;mob.blazeTimer=5;}
      }
    }
  }else{mob.blazePhase=null;mob.blazeTimer=Math.max(0,(mob.blazeTimer || 0)-dt);}
  mob.charging=!!mob.blazePhase;
  mob.wetTimer=(mob.wetTimer || 0)-dt;
  const x=Math.floor(pos.x),z=Math.floor(pos.z);
  const water=[.1,.9,1.7].some(h=>world.getVoxel(x,Math.floor(pos.y+h),z)===BLOCKS.WATER);
  const rain=exposedToRain(manager.game?.weather,world,{x:pos.x,y:pos.y+1.8,z:pos.z});
  if((water||rain)&&mob.wetTimer<=0){manager.damageMob(mob,1,null,false,null,true);mob.wetTimer=.5;}
  const powder=world.getVoxel(x,Math.floor(pos.y+.2),z)===BLOCKS.POWDER_SNOW;
  mob.freezeTime=powder?(mob.freezeTime || 0)+dt:Math.max(0,(mob.freezeTime||0)-dt*2);
  mob.freezeDamageTime=(mob.freezeDamageTime || 0)-dt;
  if(mob.freezeTime>=7 && mob.freezeDamageTime<=0){manager.damageMob(mob,5,null,false,null,true);mob.freezeDamageTime=2;}
}

export function shootBlazeFireball(manager, mob, target) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({color: 0xffb52b}));
  mesh.position.copy(mob.mesh.position).add(new THREE.Vector3(0, 1.35, 0));
  const aim=target.clone().sub(mesh.position);
  const spread=Math.sqrt(aim.length())*.04;
  const random=manager.random || Math.random;
  aim.x+=(random()-.5)*spread;aim.y+=(random()-.5)*spread;aim.z+=(random()-.5)*spread;
  const velocity=aim.normalize().multiplyScalar(18);
  manager.scene.add(mesh);
  manager.customProjectiles.push({mesh, position: mesh.position.clone(), velocity, age: 0, damage: 5, isBlazeFireball: true, owner:mob});
  mob.shotsFired=(mob.shotsFired || 0)+1;manager.sounds?.playBlaze?.();
}

export function updateBlazeFireball(manager, p, player, dt) {
  p.age += dt;
  let hit = false;
  const steps = Math.max(1, Math.ceil(p.velocity.length() * dt / .15));
  for (let i = 0; i < steps && !hit; i++) {
    const previous = p.position.clone();
    p.position.addScaledVector(p.velocity, dt / steps);
    const x = Math.floor(p.position.x), y = Math.floor(p.position.y), z = Math.floor(p.position.z);
    if (manager.isBlockSolid(x, y, z)) {
      hit = true;
      const a = previous.toArray().map(Math.floor);
      if (manager.world.getVoxel(...a) === BLOCKS.AIR) manager.world.setVoxel?.(...a, BLOCKS.FIRE);
    } else if (manager.world.getVoxel(x,y,z)===BLOCKS.WATER) {
      hit=true;
    } else if (player.gamemode !== 'creative' && player.gamemode !== 'spectator' && Math.abs(p.position.x - player.position.x) < .45 && Math.abs(p.position.z - player.position.z) < .45 && p.position.y > player.position.y && p.position.y < player.position.y + 1.8) {
      const health = player.health;
      if (!player.hasStatusEffect?.('fire_resistance')) {
        player.takeDamage?.(attackDamage(manager, 5), previous, 'blaze_fireball');
        if (player.health < health) igniteActor(player, 5);
      }
      hit = true;
    }
    if(!hit)for(const mob of manager.mobs){
      if(mob===p.owner || mob.health<=0)continue;
      const dims=manager.getMobDimensions(mob.type),pos=mob.mesh.position,half=(mob.width||dims.width)/2+.1;
      if(Math.abs(p.position.x-pos.x)<half && Math.abs(p.position.z-pos.z)<half && p.position.y>=pos.y && p.position.y<=pos.y+(mob.height||dims.height)){
        if(!mob.fireImmune && !mob.fireResistanceTime){manager.damageMob(mob,5,p.owner?.mesh.position,false,p.owner);igniteActor(mob,5);mob.combatTarget=p.owner;}
        hit=true;break;
      }
    }
  }
  p.mesh.position.copy(p.position);
  if (hit || p.age > 8) { manager.scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); return false; }
  return true;
}

export function updateMagmaCube(manager, mob, player, dt) {
  const pos = mob.mesh.position, size = mob.slimeSize;
  const lava = manager.world.getVoxel(Math.floor(pos.x), Math.floor(pos.y + .1), Math.floor(pos.z)) === BLOCKS.LAVA;
  mob.gravity = lava ? 0 : 24;
  if (lava) mob.velocity.y = 2;
  const headWater = manager.world.getVoxel(Math.floor(pos.x), Math.floor(pos.y + mob.height * .9), Math.floor(pos.z)) === BLOCKS.WATER;
  mob.airTime = headWater ? (mob.airTime || 0) + dt : 0;
  if (mob.airTime > 15) { mob.drownTimer = (mob.drownTimer || 0) - dt; if (mob.drownTimer <= 0) { manager.damageMob(mob, 2, null, false, null, true); mob.drownTimer = 1; } }
  const targets = [player, ...manager.mobs.filter(m => m.type === 'iron_golem' && m.health > 0).map(m => ({...m, position:m.mesh.position}))];
  const target = targets.filter(t => t.gamemode !== 'creative' && t.gamemode !== 'spectator').sort((a,b) => a.position.distanceToSquared(pos)-b.position.distanceToSquared(pos))[0];
  const chasing = target && target.position.distanceTo(pos) < 16;
  if (mob.onGround || lava) {
    mob.jumpTimer = (mob.jumpTimer ?? 1) - dt;
    if (!lava) mob.velocity.x = mob.velocity.z = 0;
    if (mob.jumpTimer <= 0) {
      mob.jumpTimer = (.5 + Math.random()) / (chasing ? 3 : 1);
      const dir = chasing ? target.position.clone().sub(pos) : new THREE.Vector3(Math.sin(mob.yaw += Math.random()- .5),0,Math.cos(mob.yaw));
      dir.y = 0; dir.normalize(); mob.yaw = Math.atan2(dir.x,dir.z);
      const vy = Math.sqrt(48 * size), speed = mob.width * 1.5 / (2 * vy / 24);
      mob.velocity.set(dir.x * speed, lava ? 3 : vy, dir.z * speed); mob.onGround = false;
    }
  }
  mob.contactTimer = Math.max(0,(mob.contactTimer || 0)-dt);
  if (target && mob.contactTimer === 0 && Math.abs(pos.x-target.position.x) < (mob.width+(target.width || .6))/2+.05 && Math.abs(pos.z-target.position.z) < (mob.width+(target.width || .6))/2+.05 && pos.y < target.position.y+(target.height || 1.8) && pos.y+mob.height > target.position.y) {
    if (target.type === 'iron_golem') manager.damageMob(manager.mobs.find(m => m.mesh === target.mesh), size+2, pos, false, mob);
    else target.takeDamage?.(attackDamage(manager, size+2), pos, 'magma_cube');
    mob.contactTimer = .5;
  }
}

// Snowballs are independently owned so the generic fireball loop cannot move them twice.
export function useSnowball(game) {
  if (game.inventory.getActiveItem()?.id !== 'snowball') return false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), new THREE.MeshLambertMaterial({color:0xf4fbff}));
  mesh.position.copy(game.player.position).y += game.player.eyeHeight || 1.62;
  const direction = new THREE.Vector3(); game.player.camera.getWorldDirection(direction);
  game.mobs.scene.add(mesh);
  (game.mobs.snowballs ||= []).push({mesh, velocity:direction.multiplyScalar(22), life:5, owner:game.player});
  if(game.player.gamemode !== 'creative') game.inventory.consumeActiveItem(1);
  return true;
}

export function updateSnowballs(manager, dt) {
  for(const p of [...(manager.snowballs || [])]) {
    p.life -= dt;
    const steps = Math.max(1, Math.ceil(p.velocity.length()*dt/.1));
    let hit = false;
    for(let i=0;i<steps&&!hit;i++) {
      const from = p.mesh.position.clone();
      p.velocity.y -= 10*dt/steps; p.mesh.position.addScaledVector(p.velocity,dt/steps);
      const pos = p.mesh.position;
      // End Crystal: any projectile destroys one -- Tutorial:Locating a stronghold: "use snowballs to destroy most or all
      // of the End crystals". Snowballs passed through them.
      if (manager.game?.bossManager?.hitCrystalSegment?.(from, pos)) { hit = true; break; }
      if(manager.world?.getVoxel?.(Math.floor(pos.x),Math.floor(pos.y),Math.floor(pos.z))===BLOCKS.CHORUS_FLOWER){
        manager.world.setVoxel(Math.floor(pos.x),Math.floor(pos.y),Math.floor(pos.z),BLOCKS.AIR);
        manager.entities?.spawnDroppedItem?.(pos.clone(),BLOCKS.CHORUS_FLOWER,true,1);hit=true;
      }
      hit ||= manager.isBlockSolid(Math.floor(pos.x),Math.floor(pos.y),Math.floor(pos.z));
      if (!hit) for(const mob of manager.mobs) {
        if(mob.health<=0)continue;
        const dims=manager.getMobDimensions(mob.type), w=(mob.width || dims.width)/2+.09, h=mob.height || dims.height;
        const origin=mob.mesh.position;
        if(Math.abs(pos.x-origin.x)<w && Math.abs(pos.z-origin.z)<w && pos.y>origin.y && pos.y<origin.y+h) {
          manager.damageMob(mob,mob.type==='blaze'?3:0,p.owner.position,false,p.owner);hit=true;break;
        }
      }
    }
    if(hit || p.life<=0) {
      p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();
      manager.snowballs.splice(manager.snowballs.indexOf(p),1);
    }
  }
}
