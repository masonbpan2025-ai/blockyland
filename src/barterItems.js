import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export function soulSpeedMultiplier(world, player) {
  const id = world.getVoxel(Math.floor(player.position.x), Math.floor(player.position.y - 0.05), Math.floor(player.position.z));
  const level = player.inventory?.armor?.feet?.enchantments?.find(e => e.id === 'soul_speed')?.level || 0;
  if (id !== BLOCKS.SOUL_SAND && id !== BLOCKS.SOUL_SOIL) return 1;
  return level ? 1.3 + 0.105 * Math.min(3, level) : id === BLOCKS.SOUL_SAND ? 0.4 : 1;
}

export function useBarterPotion(game) {
  const item = game.inventory.getActiveItem();
  if (!['potion_of_fire_resistance', 'splash_potion_of_fire_resistance'].includes(item?.id)) return false;
  if (item.id === 'potion_of_fire_resistance') {
    game.player.applyStatusEffect('fire_resistance', 180, 1);
  } else {
    const direction = game.camera.getWorldDirection(new THREE.Vector3());
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), new THREE.MeshLambertMaterial({ color: 0xf59435 }));
    mesh.position.copy(game.player.position).y += game.player.eyeHeight || 1.62;
    game.mobs.scene.add(mesh);
    (game.mobs.splashPotions ||= []).push({ mesh, velocity: direction.multiplyScalar(9).add(new THREE.Vector3(0, 1, 0)), life: 5 });
  }
  if (game.player.gamemode !== 'creative') {
    game.inventory.consumeActiveItem();
    if (item.id === 'potion_of_fire_resistance') game.inventory.addItem('glass_bottle', false, 1);
  }
  game.ui?.updateHotbar();
  return true;
}

export function updateBarterEffects(manager, dt, player) {
  for (const potion of [...(manager.splashPotions || [])]) {
    potion.life -= dt;
    const steps = Math.max(1, Math.ceil(potion.velocity.length() * dt / 0.1));
    for (let i = 0; i < steps; i++) {
      potion.velocity.y -= 12 * dt / steps;
      potion.mesh.position.addScaledVector(potion.velocity, dt / steps);
      const p = potion.mesh.position;
      const def = BLOCK_DEFS[manager.world.getVoxel(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))];
      const hitMob = manager.mobs.some(m => m.health > 0 && m.mesh.position.clone().add(new THREE.Vector3(0, 0.7, 0)).distanceTo(p) < 0.65);
      if (potion.life > 0 && !(def && def.solid !== false && !def.plant) && !hitMob) continue;
      for (const actor of [player, ...manager.mobs]) {
        if (!actor || actor.health <= 0) continue;
        const position = actor.mesh?.position || actor.position;
        const distance = position.distanceTo(p);
        if (distance >= 4) continue;
        const duration = 180 * (1 - distance / 4);
        if (actor.applyStatusEffect) actor.applyStatusEffect('fire_resistance', duration, 1);
        else actor.fireResistanceTime = Math.max(actor.fireResistanceTime || 0, duration);
      }
      manager.spawnParticleBurst?.(p, 0xf99b42, 16);
      potion.mesh.removeFromParent(); potion.mesh.geometry.dispose(); potion.mesh.material.dispose();
      manager.splashPotions.splice(manager.splashPotions.indexOf(potion), 1);
      break;
    }
  }
  for (const mob of manager.mobs) {
    mob.fireResistanceTime = Math.max(0, (mob.fireResistanceTime || 0) - dt);
    mob.glowingTime = Math.max(0, (mob.glowingTime || 0) - dt);
    if (mob.glowingTime > 0 && mob.health > 0) {
      if (!mob.glowOutline) {
        mob.glowOutline = new THREE.BoxHelper(mob.mesh, 0xffe67a);
        mob.glowOutline.material.depthTest = false;
        mob.glowOutline.renderOrder = 999;
        manager.scene.add(mob.glowOutline);
      }
      mob.glowOutline.update();
    } else if (mob.glowOutline) {
      mob.glowOutline.removeFromParent(); mob.glowOutline.geometry.dispose(); mob.glowOutline.material.dispose(); mob.glowOutline = null;
    }
  }
}
