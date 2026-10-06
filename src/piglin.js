import {setZombifiedBaby,syncZombifiedEquipment} from './zombifiedPiglin.js';
import * as THREE from 'three';
import { isPiglinBrute, piglinBruteRetreats, piglinBruteDistractedByGold, piglinBrutePursues } from './piglinBruteBehavior.js';
import { BLOCKS, ITEMS, stackLimitFor } from './blocks.js';
import { wanderMob } from './mobMotion.js';
import { steerGround, flee } from './netherMobAI.js';

// Java Edition 1.21.6+ barter table (469 total weight, including Dried Ghast).
export const PIGLIN_BARTER_LOOT = [
  { id: BLOCKS.DRIED_GHAST, isBlock: true, min: 1, max: 1, weight: 10 },
  { id: 'enchanted_book', min: 1, max: 1, weight: 5, soulSpeed: true },
  { id: 'iron_boots', min: 1, max: 1, weight: 8, soulSpeed: true },
  { id: 'potion_of_fire_resistance', min: 1, max: 1, weight: 8 },
  { id: 'splash_potion_of_fire_resistance', min: 1, max: 1, weight: 8 },
  { id: 'iron_nugget', min: 10, max: 36, weight: 10 },
  { id: 'nether_brick', min: 2, max: 8, weight: 40 },
  { id: 'spectral_arrow', min: 6, max: 12, weight: 40 },
  { id: BLOCKS.CRYING_OBSIDIAN, isBlock: true, min: 1, max: 3, weight: 40 },
  { id: 'ender_pearl', min: 2, max: 4, weight: 10 },
  { id: 'string', min: 3, max: 9, weight: 20 },
  { id: 'quartz', min: 5, max: 12, weight: 20 },
  { id: 'leather', min: 2, max: 4, weight: 40 },
  { id: 'fire_charge', min: 1, max: 1, weight: 40 },
  { id: BLOCKS.OBSIDIAN, isBlock: true, min: 1, max: 1, weight: 40 },
  { id: BLOCKS.SOUL_SAND, isBlock: true, min: 2, max: 8, weight: 40 },
  { id: BLOCKS.GRAVEL, isBlock: true, min: 8, max: 16, weight: 40 },
  { id: BLOCKS.BLACKSTONE, isBlock: true, min: 8, max: 16, weight: 40 },
  { id: 'water_bottle', min: 1, max: 1, weight: 10 }
];

export function barterReward(random = Math.random) {
  let roll = random() * PIGLIN_BARTER_LOOT.reduce((n, entry) => n + entry.weight, 0);
  const entry = PIGLIN_BARTER_LOOT.find(entry => (roll -= entry.weight) < 0) || PIGLIN_BARTER_LOOT.at(-1);
  return { ...entry, count: entry.min + Math.floor(random() * (entry.max - entry.min + 1)),
    ...(entry.soulSpeed ? { enchantments: [{ id: 'soul_speed', level: 1 + Math.floor(random() * 3) }] } : {}) };
}

export function startBarter(mob, item = { id: 'gold_ingot', isBlock: false }) {
  mob.admiredItem = item;
  mob.persistent = true;
  mob.isBartering = true;
  mob.barterTimer = 6;
  mob.target = null;
  mob.velocity.x = mob.velocity.z = 0;
}

export function canSee(manager, from, to) {
  const delta = to.clone().sub(from);
  const steps = Math.ceil(delta.length() * 4);
  for (let step = 1; step < steps; step++) {
    const point = from.clone().addScaledVector(delta, step / steps);
    if (manager.isBlockSolid(point.x, point.y, point.z)) return false;
  }
  return true;
}

export function angerPiglins(manager, position) {
  for (const mob of manager.mobs) {
    if (mob.type !== 'piglin' || mob.isBaby || mob.health <= 0 || mob.mesh.position.distanceTo(position) > 16) continue;
    mob.aggroToPlayer = true;
    mob.angerTimer = 30;
    mob.admireDisabledTime = 20;
    mob.isBartering = false;
    mob.admiredItem = null;
    mob.barterTimer = 0;
  }
}

export function updatePiglin(behaviors, mob, dt, player) {
  const manager = behaviors.mobManager;
  const world = behaviors.world;
  const pos = mob.mesh.position;
  syncPiglinEquipment(mob);
  if (world.isNether || world.dimension === 'nether') mob.conversionTime = 0;
  else if (world.dimension === 'overworld' || world.dimension === 'the_end') {
    mob.conversionTime = (mob.conversionTime || 0) + dt;
    if (mob.conversionTime >= 15) {
      const converted = manager.spawnZombifiedPiglin(pos.x, pos.y, pos.z,{natural:false,isBaby:mob.isBaby,weapon:mob.isBaby?null:mob.weapon});
      converted.name = mob.name;
      converted.weapon = mob.isBaby?null:mob.weapon;
      converted.equipment = {...mob.equipment};
      if(mob.isBaby)delete converted.equipment.weapon;
      converted.persistent = mob.persistent;
      if (mob.admiredItem) behaviors.entities?.spawnDroppedItem(pos.clone(), mob.admiredItem.id, !!mob.admiredItem.isBlock, 1, { enchantments: mob.admiredItem.enchantments });
      for (const item of mob.piglinInventory || []) behaviors.entities?.spawnDroppedItem(pos.clone(), item.id, !!item.isBlock, item.count, { enchantments: item.enchantments });
      converted.isBaby = mob.isBaby;
      setZombifiedBaby(converted,mob.isBaby);converted.nauseaTime=10;syncZombifiedEquipment(converted);
      converted.mesh.rotation.copy(mob.mesh.rotation);converted.yaw=mob.yaw;
      manager.removeDebugLabel?.(mob);
      manager.scene.remove(mob.mesh);
      manager.mobs.splice(manager.mobs.indexOf(mob), 1);
      return;
    }
  }
  mob.admireDisabledTime = Math.max(0, (mob.admireDisabledTime || 0) - dt);
  mob.huntCooldown = Math.max(0, (mob.huntCooldown || 0) - dt);
  mob.foodCooldown = Math.max(0, (mob.foodCooldown || 0) - dt);
  mob.retaliationTimer = Math.max(0, (mob.retaliationTimer || 0) - dt);
  mob.angerTimer = Math.max(0, (mob.angerTimer || 0) - dt);
  if (mob.angerTimer === 0) mob.aggroToPlayer = false;
  // Cache the block scan so a crowd does not scan its surroundings every frame.
  //
  // Wiki: a brute "do[es] not ... retreat", and soul fire is one of the two things a piglin retreats FROM. So a
  // brute skips the fear scan entirely -- it never even records a repellent, which is the difference stated as
  // directly as it can be. Merely skipping the flee left it scanning a threat it would then ignore.
  mob.repellentTimer = (mob.repellentTimer || 0) - dt;
  if (isPiglinBrute(mob)) {
    mob.repellent = null;
  } else if (mob.repellentTimer <= 0) {
    mob.repellentTimer = 0.5;
    mob.repellent = null;
    for (let x = -4; x <= 4; x++) for (let y = -2; y <= 2; y++) for (let z = -4; z <= 4; z++) {
      const bx = Math.floor(pos.x) + x, by = Math.floor(pos.y) + y, bz = Math.floor(pos.z) + z;
      if (world.getVoxel?.(bx, by, bz) === BLOCKS.SOUL_TORCH) {
        const source = new THREE.Vector3(bx + 0.5, by, bz + 0.5);
        if (!mob.repellent || source.distanceToSquared(pos) < mob.repellent.distanceToSquared(pos)) mob.repellent = source;
      }
    }
  }
  const undead = manager.mobs.find(other => other !== mob && other.health > 0 &&
    ['zombified_piglin', 'zombie_pigman', 'zoglin'].includes(other.type) && other.mesh.position.distanceTo(pos) < 6);
  // Wiki: "Unlike piglins, piglin brutes do not barter, retreat, or get distracted by gold." A brute has no
  // gold-armour condition at all, so it pursues a gold-clad player exactly as it pursues anyone else.
  //
  // The `!mob.isBaby` short-circuit is load-bearing and must stay FIRST: a baby piglin flees zombified piglins
  // and soul fire, and it only does so because `pursuingPlayer` is false for it, which is what lets `danger`
  // be non-null. Dropping it silently stopped babies retreating.
  const pursuingPlayer = !mob.isBaby && !!player?.position && (
    isPiglinBrute(mob)
      ? piglinBrutePursues(player)
      : !['creative', 'spectator'].includes(player.gamemode)
        && (mob.aggroToPlayer || !behaviors.isPlayerWearingGold(player))
  );
  const danger = undead?.mesh.position || (!pursuingPlayer && mob.repellent);
  // Wiki: a brute does not retreat, so it stands its ground instead of fleeing the undead or soul fire. The
  // guard is `!isPiglinBrute`, because `piglinBruteRetreats(mob)` answers "does a BRUTE retreat" -- false for
  // every piglin -- and using it here inverted the condition and stopped ORDINARY piglins retreating.
  if (danger && !isPiglinBrute(mob)) {
    const escape = pos.clone().sub(danger).setY(0);
    if (escape.lengthSq() < 0.01) escape.x = 1;
    escape.normalize();
    mob.velocity.x = escape.x * 3; mob.velocity.z = escape.z * 3;
    mob.yaw = Math.atan2(escape.x, escape.z);
    mob.target = null;
    return;
  }
  if (mob.admiredGold) mob.admiredGold.visible = !!mob.isBartering;
  if (mob.leftArm) mob.leftArm.rotation.x = mob.isBartering ? -1.1 : 0;
  if (mob.isBartering) {
    mob.velocity.x = mob.velocity.z = 0;
    mob.barterTimer -= dt;
    if (mob.barterTimer <= 0) {
      mob.isBartering = false;
      if (mob.admiredGold) mob.admiredGold.visible = false;
      const item = mob.admiredItem || { id: 'gold_ingot' };
      if (!mob.isBaby && item.id === 'gold_ingot') {
        const reward = barterReward();
        const toward = player?.position ? player.position.clone().sub(pos).setY(0).normalize() : new THREE.Vector3(0, 0, 1);
        behaviors.entities?.spawnDroppedItem(pos.clone().addScaledVector(toward, 0.8).add(new THREE.Vector3(0, 0.6, 0)), reward.id, !!reward.isBlock, reward.count, { enchantments: reward.enchantments });
      } else if (item.id !== 'gold_ingot') storePiglinItem(mob, item);
      mob.admiredItem = null;
    }
    return;
  }
  // Wiki: "piglin brutes do not barter ... or get distracted by gold". So the entire gold-seeking path is
  // skipped for a brute rather than being started and then cancelled.
  if (isPiglinBrute(mob)) {
    mob.isBartering = false;
    mob.admiredItem = null;
    if (mob.admiredGold) mob.admiredGold.visible = false;
  } else
  // Seek one ingot from a stack, rather than deleting the whole dropped stack.
  if (!mob.admireDisabledTime && world.mobGriefing !== false) {
    const drops = behaviors.entities?.droppedItems || [];
    const gold = drops.filter(item => isLovedGold(item.itemType) && (item.itemType === 'gold_ingot' || (mob.piglinInventory?.length || 0) < 8) && item.count > 0 && item.group?.position.distanceTo(pos) < 8 &&
      canSee(manager, pos.clone().add(new THREE.Vector3(0, 1.4, 0)), item.group.position))
      .sort((a, b) => a.group.position.distanceToSquared(pos) - b.group.position.distanceToSquared(pos))[0];
    if (gold) {
      if (gold.group.position.distanceTo(pos) < 1.5) {
        if (--gold.count === 0) {
          behaviors.entities.itemVisuals?.release(gold.group);
          gold.group.parent?.remove(gold.group);
          drops.splice(drops.indexOf(gold), 1);
        }
        startBarter(mob, { id: gold.itemType, isBlock: gold.isBlock, enchantments: gold.enchantments });
      } else steerGround(manager, mob, gold.group.position, dt, 2);

      return;
    }
  }
  // Eat nearby pork, but never chase it or collect leather.
  if (!mob.foodCooldown && world.mobGriefing !== false) {
    const drops = behaviors.entities?.droppedItems || [];
    const food = drops.find(i => ['porkchop', 'cooked_porkchop'].includes(i.itemType) && i.count > 0 && i.group.position.distanceTo(pos) < 1);
    if (food) {
      food.count--; mob.foodCooldown = 10;
      if (!food.count) { behaviors.entities.itemVisuals?.release(food.group); food.group.removeFromParent(); drops.splice(drops.indexOf(food), 1); }
    }
  }
  const targetable = player?.position && player.gamemode !== 'creative' && player.gamemode !== 'spectator' && !player.isDead;
  const distance = player?.position ? player.position.distanceTo(pos) : Infinity;
  // There are TWO gold gates in the piglin AI, and both have to be lifted for a brute: one above guarding the
  // retreat, and this one guarding the chase. Fixing only the first left a gold-clad player un-pursued, which
  // is the exact opposite of the brute's defining difference.
  const goldPacifies = isPiglinBrute(mob) ? false : behaviors.isPlayerWearingGold(player);
  if (!mob.isBaby && targetable && distance < 16 && (mob.aggroToPlayer || !goldPacifies)) {
    mob.target = player;
    const direction = player.position.clone().sub(pos).setY(0).normalize();
    mob.yaw = Math.atan2(direction.x, direction.z);
    const ranged = mob.weapon === 'crossbow';
    if (ranged && distance < 5) flee(manager, mob, player.position, dt, 1.5);
    else steerGround(manager, mob, player.position, dt, 2.8, ranged ? 7 : 1.5);
    mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
    if (mob.attackCooldown === 0 && distance < (ranged ? 12 : 1.8) &&
      canSee(manager, pos.clone().add(new THREE.Vector3(0, 1.4, 0)), player.position.clone().add(new THREE.Vector3(0, 1, 0)))) {
      mob.attackCooldown = ranged ? 2 : 1;
      if (ranged) {
        const origin = pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        manager.spawnArrow(origin, player.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin).normalize(), mob);
      } else player.takeDamage?.(manager.game?.difficulty === 'easy' ? 5 : manager.game?.difficulty === 'hard' ? 12 : 8, pos, 'piglin');
    }
  } else {
    mob.target = null;
    if (!updatePiglinHunt(behaviors, mob, dt)) wanderMob(manager, mob, dt, 1.1);
  }
}

// Separate repeatable skin and clothing tiles; faces are modeled once on the
// head, never repeated on every side of every limb.
export function piglinTexture(color) {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) {
    const shade = ((i * 17 + Math.floor(i / 16) * 11) % 7 - 3) * 3;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = Math.max(0, Math.min(255, ((color >> (16 - c * 8)) & 255) + shade));
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, 16, 16);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export function isLovedGold(id) {
  return id === 'gold_ingot' || id === 'raw_gold' || id === 'gold_nugget' || id === BLOCKS.GOLD_BLOCK || id === BLOCKS.GOLD_ORE || (typeof id === 'string' && (id.startsWith('golden_') || id === 'glistering_melon_slice' || id === 'clock' || id === 'enchanted_golden_apple'));
}

function storePiglinItem(mob, item) {
  const meta = ITEMS[item.id];
  if (meta?.armorSlot) {
    (mob.equipment ||= {})[meta.armorSlot] = { ...item, count: 1, pickedUp: true };
  } else if (meta?.type === 'weapon' && item.id !== 'crossbow') {
    mob.weapon = item.id;
    (mob.equipment ||= {}).weapon = { ...item, count: 1, pickedUp: true };
  } else {
    const slots = mob.piglinInventory ||= [];
    const stack = slots.find(i => i.id === item.id && !i.enchantments && !item.enchantments && i.count < stackLimitFor(item.id));
    if (stack) stack.count++; else if (slots.length < 8) slots.push({ ...item, count: 1 });
  }
}

export function updatePiglinHunt(behaviors, mob, dt) {
  if (mob.isBaby) return false;
  const manager = behaviors.mobManager, pos = mob.mesh.position;
  if (mob.combatTarget?.health <= 0) {
    if (mob.combatTarget.type === 'hoglin' && Math.random() < 0.1) mob.danceTime = 5;
    mob.combatTarget = null; mob.huntCooldown = 30 + Math.random() * 90;
  }
  if (mob.danceTime > 0) {
    mob.danceTime -= dt; mob.velocity.x = mob.velocity.z = 0;
    if (mob.leftArm) mob.leftArm.rotation.z = Math.PI / 2;
    if (mob.rightArm) mob.rightArm.rotation.z = -Math.PI / 2;
    if (mob.head) mob.head.rotation.z = Math.sin(mob.danceTime * 12) * 0.15;
    if (mob.danceTime <= 0) { if (mob.leftArm) mob.leftArm.rotation.z = 0; if (mob.rightArm) mob.rightArm.rotation.z = 0; if (mob.head) mob.head.rotation.z = 0; }
    return true;
  }
  const nearby = manager.mobs.filter(m => m.health > 0 && !m.isBaby && m.mesh.position.distanceTo(pos) < 16);
  const hoglins = nearby.filter(m => m.type === 'hoglin');
  const piglins = nearby.filter(m => m.type === 'piglin');
  mob.huntCheckTime = (mob.huntCheckTime || 0) - dt;
  if (!mob.combatTarget && !mob.huntCooldown && !mob.bastionSpawn && mob.huntCheckTime <= 0) {
    mob.huntCheckTime = 5;
    const prey = hoglins.find(m => !m.cannotBeHunted && !m.bastionSpawn && canSee(manager, pos.clone().add(new THREE.Vector3(0, 1, 0)), m.mesh.position.clone().add(new THREE.Vector3(0, 1, 0))));
    if (prey && Math.random() < 0.1) for (const ally of piglins) {
      if (ally.bastionSpawn || ally.isBartering || ally.aggroToPlayer) continue;
      ally.combatTarget = prey; ally.huntCooldown = 30 + Math.random() * 90;
    }
  }
  const target = mob.combatTarget;
  if (!target?.mesh || target.health <= 0) return false;
  if (target.type === 'hoglin' && hoglins.length > piglins.length) { flee(manager, mob, target.mesh.position, dt); return true; }
  const distance = target.mesh.position.distanceTo(pos);
  if (distance > 24) { mob.combatTarget = null; return false; }
  const ranged = mob.weapon === 'crossbow';
  steerGround(manager, mob, target.mesh.position, dt, 2.8, ranged ? 7 : 1.65);
  mob.attackCooldown = Math.max(0, (mob.attackCooldown || 0) - dt);
  if (mob.attackCooldown === 0 && distance < (ranged ? 12 : 2) && canSee(manager, pos.clone().add(new THREE.Vector3(0, 1.4, 0)), target.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)))) {
    mob.attackCooldown = ranged ? 2 : 1;
    if (ranged) {
      const origin = pos.clone().add(new THREE.Vector3(0, 1.4, 0));
      manager.spawnArrow(origin, target.mesh.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(origin).normalize(), mob, { target });
    } else manager.damageMob(target, 8, pos, false, mob);
  }
  return true;
}

export function syncPiglinEquipment(mob) {
  for (const part of mob.rightArm?.children || []) {
    if (part.userData.piglinWeapon) part.visible = !mob.isBaby && part.userData.piglinWeapon === (mob.weapon === 'crossbow' ? 'crossbow' : 'sword');
  }
  const visuals = mob.equipmentVisuals ||= {};
  for (const [slot, item] of Object.entries(mob.equipment || {})) {
    if (slot === 'weapon' || visuals[slot]?.id === item.id) continue;
    if (visuals[slot]) for (const mesh of visuals[slot].meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); mesh.material.dispose(); }
    // A held block carries a NUMERIC id and has no `startsWith`, so the colour test reads the name
    // form. A block is not golden either way, which is what the fallback already meant.
    const equipmentId = typeof item.id === 'string' ? item.id : '';
    const material = new THREE.MeshLambertMaterial({ color: equipmentId.startsWith('golden_') ? 0xe7b82f : 0xb9c5cc });
    const meshes = [];
    const part = (parent, size, y) => { if (!parent) return; const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.y = y; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); meshes.push(mesh); };
    if (slot === 'head') part(mob.head, [0.66, 0.2, 0.62], 0.23);
    if (slot === 'chest') part(mob.mesh, [0.57, 0.55, 0.34], 1.05);
    if (slot === 'legs') for (const leg of [mob.leftLeg, mob.rightLeg]) part(leg, [0.23, 0.4, 0.24], 0.15);
    if (slot === 'feet') for (const leg of [mob.leftLeg, mob.rightLeg]) part(leg, [0.24, 0.25, 0.27], -0.26);
    visuals[slot] = { id: item.id, meshes };
  }
}
