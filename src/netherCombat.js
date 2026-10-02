import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { igniteActor } from './heat.js';

function attackDamage(manager, base) {
  const difficulty = manager.game?.difficulty;
  return difficulty === 'peaceful' ? 0 : difficulty === 'easy' ? Math.min(base, base/2+1) : difficulty === 'hard' ? base*1.5 : base;
}

export function setMagmaSize(mob, size) {
  mob.slimeSize = size;
  mob.width = mob.height = .51 * size;
  mob.health = mob.maxHealth = size * size;
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

export function updateBlaze(manager, mob, player, dt) {
  const pos = mob.mesh.position;
  const target = player.position.clone().add(new THREE.Vector3(0, .9, 0));
  const origin = pos.clone().add(new THREE.Vector3(0, 1.35, 0));
  const distance = origin.distanceTo(target);
  const active = manager.game?.difficulty !== 'peaceful' && player.gamemode !== 'creative' && player.gamemode !== 'spectator' && distance < 48 && visible(manager, origin, target);
  mob.velocity.y = active && target.y > origin.y ? Math.min(2, (target.y - origin.y) * .5) : Math.max(-1.2, mob.velocity.y - dt * 3);
  mob.velocity.x = mob.velocity.z = 0;
  mob.blazeTimer = Math.max(0, (mob.blazeTimer || 0) - dt);
  mob.meleeTimer = Math.max(0, (mob.meleeTimer || 0) - dt);
  if (active) {
    const dir = target.clone().sub(origin); dir.y = 0; dir.normalize();
    mob.yaw = Math.atan2(dir.x, dir.z);
    if (distance < 2 || distance > 32) {
      mob.velocity.x = dir.x * 1.5; mob.velocity.z = dir.z * 1.5;
    }
    if (distance < 1.4 && mob.meleeTimer === 0) {
      player.takeDamage?.(attackDamage(manager, 6), pos, 'blaze'); mob.meleeTimer = 1;
    }
    if (!mob.blazePhase && mob.blazeTimer === 0) { mob.blazePhase = 'charge'; mob.blazeTimer = 3; }
    else if (mob.blazePhase === 'charge' && mob.blazeTimer === 0) {
      mob.blazePhase = 'burst'; mob.blazeShots = 0;
    }
    if (mob.blazePhase === 'burst' && mob.blazeTimer === 0) {
      if (mob.blazeShots < 3) { shootBlazeFireball(manager, mob, target); mob.blazeShots++; mob.blazeTimer = .3; }
      else { mob.blazePhase = null; mob.blazeTimer = 5; }
    }
  } else if (mob.blazePhase) { mob.blazePhase = null; mob.blazeTimer = 5; }
  mob.charging = !!mob.blazePhase;
  for (const tier of mob.tiers || []) for (const rod of tier.children) rod.material.emissiveIntensity = mob.charging ? 1.5 : .4;
  mob.wetTimer = (mob.wetTimer || 0) - dt;
  const water = manager.world.getVoxel(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)) === BLOCKS.WATER;
  const weather = manager.game?.weather?.weatherType;
  let rain = manager.world.dimension !== 'nether' && (weather === 'rain' || weather === 'thunder');
  if (rain) for (let y = Math.ceil(pos.y + 1.8); y < 128; y++) if (manager.isBlockSolid(Math.floor(pos.x), y, Math.floor(pos.z))) { rain = false; break; }
  if ((water || rain) && mob.wetTimer <= 0) { manager.damageMob(mob, 1); mob.wetTimer = .5; }
}

export function shootBlazeFireball(manager, mob, target) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({color: 0xffb52b}));
  mesh.position.copy(mob.mesh.position).add(new THREE.Vector3(0, 1.35, 0));
  const velocity = target.clone().sub(mesh.position).normalize().multiplyScalar(18);
  manager.scene.add(mesh);
  manager.customProjectiles.push({mesh, position: mesh.position.clone(), velocity, age: 0, damage: 5, isBlazeFireball: true});
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
    } else if (player.gamemode !== 'creative' && player.gamemode !== 'spectator' && Math.abs(p.position.x - player.position.x) < .45 && Math.abs(p.position.z - player.position.z) < .45 && p.position.y > player.position.y && p.position.y < player.position.y + 1.8) {
      const health = player.health;
      if (!player.hasStatusEffect?.('fire_resistance')) {
        player.takeDamage?.(attackDamage(manager, 5), previous, 'blaze_fireball');
        if (player.health < health) igniteActor(player, 5);
      }
      hit = true;
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
      p.velocity.y -= 10*dt/steps; p.mesh.position.addScaledVector(p.velocity,dt/steps);
      const pos = p.mesh.position;
      hit = manager.isBlockSolid(Math.floor(pos.x),Math.floor(pos.y),Math.floor(pos.z));
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
