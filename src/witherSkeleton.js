import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { canSee } from './piglin.js';
import { steerGround } from './netherMobAI.js';
import { wanderMob, moveGroundMob } from './mobMotion.js';
import { poseWitherSkeleton } from './witherSkeletonModel.js';
import { applyMobWither } from './witherEffect.js';

const random = manager => manager.random || Math.random;
const position = actor => actor?.mesh?.position || actor?.position;
const level = (item, id) => Math.max(0, Math.min(3, item?.enchantments?.find?.(e => e.id === id)?.level || item?.enchantments?.[id] || 0));
const valid = actor => position(actor) && actor.health > 0 && !actor.isDead && !['creative', 'spectator'].includes(actor.gamemode);

export function initializeWitherSkeleton(manager, mob, options = {}) {
  const r = random(manager), difficulty = manager.game?.difficulty || 'normal';
  Object.assign(mob, { undead: true, fireImmune: true, witherImmune: true, width: .7, height: 2.4,
    weapon: options.weapon === undefined ? 'stone_sword' : options.weapon, equipment: {},
    leftHanded: options.leftHanded ?? r() < .05, canPickUpLoot: options.canPickUpLoot ?? (['normal','hard'].includes(difficulty) && r() < .55 * Math.min(1, Math.max(0, manager.game?.regionalDifficulty || 0))),
    movementSpeed: .25, followRange: 16, attackCooldown: 0, creditSeconds: 0, isBaby: false, naturalSpawn: !!options.natural });
  const date = options.date || manager.game?.calendarDate || new Date();
  if (date.getMonth() === 9 && date.getDate() === 31 && r() < .25) {
    mob.equipment.head = { id: r() < .1 ? 'jack_o_lantern' : 'carved_pumpkin', seasonal: true };
  }
  mob.applyStatusEffect = (id, duration = 10, amplifier = 1) => {
    if (['wither','poison','regeneration'].includes(id)) return false;
    if (id === 'instant_health') return manager.damageMob(mob, 6 * 2 ** Math.max(0, amplifier - 1), null, false, null, true);
    if (id === 'instant_damage') { mob.health = Math.min(mob.maxHealth, mob.health + 4 * 2 ** Math.max(0, amplifier - 1)); return true; }
    if (id === 'fire_resistance') { mob.fireResistanceTime = duration; return true; }
    return false;
  };
  syncWitherEquipment(mob); poseWitherSkeleton(mob);
}

export function witherSkeletonDamage(manager, mob) {
  const item = mob.equipment.weapon?.id ?? mob.weapon;
  const base = 4 + Math.max(0, (ITEMS[item]?.attack || 1) - 1);
  return manager.game?.difficulty === 'peaceful' ? 0 : manager.game?.difficulty === 'easy' ? Math.min(base, base / 2 + 1) : manager.game?.difficulty === 'hard' ? base * 1.5 : base;
}

export function hurtWitherSkeleton(manager, mob, attacker) {
  if (attacker === manager.game?.player || attacker?.type === 'wolf' && attacker.isTamed) {
    mob.creditSeconds = 5; mob.lootingLevel = level(attacker.inventory?.getActiveItem?.(), 'looting');
  }
  if (valid(attacker) && attacker !== mob) { mob.retaliationTarget = attacker; mob.retaliationSeconds = 30; }
  if (mob.health <= 0 && attacker?.type === 'creeper' && (attacker.charged || attacker.isCharged || attacker.powered) && !attacker.headDropped) {
    mob.chargedCreeperSkull = true; attacker.headDropped = true;
  }
  manager.sounds?.playWitherSkeleton?.(mob.health <= 0 ? 'death' : 'hurt');
}

function pickup(manager, mob) {
  if (!mob.canPickUpLoot || manager.world.mobGriefing === false) return;
  for (const drop of [...(manager.entities?.droppedItems || [])]) {
    if (drop.count <= 0 || (drop.age || 0) < (drop.pickupDelay || 0) || !drop.group || drop.group.position.distanceTo(mob.mesh.position) > 1.1) continue;
    const id = drop.itemType, metadata = ITEMS[id];
    if (id === 'bow' || id === 'crossbow' || String(id).endsWith('_spear')) continue;
    const slot = metadata?.armorSlot || (id === 'shield' ? 'offhand' : /_(sword|axe)$/.test(String(id)) ? 'weapon' : /(_head|_skull)$/.test(String(id)) || id === 'carved_pumpkin' ? 'head' : null);
    if (!slot) continue;
    const old = mob.equipment[slot] || (slot === 'weapon' && mob.weapon ? { id: mob.weapon } : null);
    const score = item => slot === 'weapon' ? ITEMS[item?.id]?.attack || 0 : ITEMS[item?.id]?.armor || 0;
    if (old && (score({id}) < score(old) || score({id}) === score(old) && !(drop.enchantments?.length && !old.enchantments?.length) && !(drop.durability > (old.durability ?? Infinity)))) continue;
    if (old && (old.pickedUp || random(manager)() < .095)) manager.entities.spawnDroppedItem(mob.mesh.position.clone(), old.id, false, 1, old);
    mob.equipment[slot] = { id, count: 1, pickedUp: true, enchantments: drop.enchantments, durability: drop.durability };
    mob.persistent = true; if (slot === 'weapon') mob.weapon = id;
    if (--drop.count === 0) { manager.entities.itemVisuals?.release(drop.group); drop.group.removeFromParent(); const drops = manager.entities.droppedItems; drops.splice(drops.indexOf(drop), 1); }
  }
}

export function syncWitherEquipment(mob) {
  if (mob.equipment.weapon) mob.weapon = mob.equipment.weapon.id;
  mob.armor = Object.values(mob.equipment).reduce((sum, item) => sum + (ITEMS[item.id]?.armor || 0), 0);
  const visuals = mob.witherEquipmentVisuals ||= {};
  for (const [slot, item] of Object.entries(mob.equipment)) {
    if (slot === 'weapon' || visuals[slot]?.userData.id === item.id) continue;
    if (visuals[slot]) { visuals[slot].removeFromParent(); visuals[slot].geometry.dispose(); visuals[slot].material.dispose(); }
    const specs = { head: [.66,.66,.66,2.1], chest: [.64,.72,.36,1.45], legs: [.63,.42,.33,.9], feet: [.55,.18,.31,.09], offhand: [.43,.65,.09,-.6] };
    const spec = specs[slot]; if (!spec) continue;
    // A held block carries a NUMERIC id and has no `startsWith`; the colour test reads the name form.
    const equipmentId = typeof item.id === 'string' ? item.id : '';
    const color = /pumpkin|lantern/.test(equipmentId) ? 0xbd6b26 : equipmentId.startsWith('diamond') ? 0x59baba : equipmentId.startsWith('golden') ? 0xcaa43b : equipmentId.startsWith('netherite') ? 0x443e43 : 0x94949b;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...spec.slice(0,3)), new THREE.MeshLambertMaterial({color}));
    mesh.userData.id = item.id; mesh.position.y = spec[3];
    (slot === 'offhand' ? mob.leftHanded ? mob.rightArm : mob.leftArm : mob.mesh).add(mesh); visuals[slot] = mesh;
  }
  // A picked-up BLOCK has a numeric id and no string methods, so the blade tint reads the name form.
  const weaponId = typeof mob.weapon === 'string' ? mob.weapon : '';
  mob.bladeMat.color.setHex(weaponId.startsWith('diamond') ? 0x59baba : weaponId.startsWith('netherite') ? 0x443e43 : 0x969696);
}

export function updateWitherSkeleton(manager, mob, dt, player) {
  if (manager.game?.difficulty === 'peaceful') { mob.noLoot = true; mob.health = 0; return; }
  mob.creditSeconds = Math.max(0, mob.creditSeconds - dt);
  mob.retaliationSeconds = Math.max(0, (mob.retaliationSeconds || 0) - dt);
  mob.attackCooldown = Math.max(0, mob.attackCooldown - dt); mob.swingTime = Math.max(0, (mob.swingTime || 0) - dt);
  pickup(manager, mob); syncWitherEquipment(mob);
  const pos = mob.mesh.position;
  const sight = actor => canSee(manager, pos.clone().add(new THREE.Vector3(0,2.1,0)), position(actor).clone().add(new THREE.Vector3(0,(actor.height || 1.8)*.5,0)));
  const wolf = manager.mobs.find(m => m.type === 'wolf' && valid(m) && position(m).distanceTo(pos) < 6);
  const candidates = [player, ...manager.mobs.filter(m => ['iron_golem','piglin','piglin_brute'].includes(m.type) || m.type === 'turtle' && m.isBaby)];
  let target = mob.retaliationSeconds > 0 && valid(mob.retaliationTarget) ? mob.retaliationTarget : candidates.filter(m => valid(m) && position(m).distanceTo(pos) <= 16 && sight(m)).sort((a,b) => position(a).distanceToSquared(pos) - position(b).distanceToSquared(pos))[0];
  mob.target = target || null; mob.fleeingWolf = !!wolf;
  if (wolf) {
    const away = pos.clone().sub(position(wolf)).setY(0); if (!away.lengthSq()) away.z = 1;
    steerGround(manager, mob, pos.clone().add(away.normalize().multiplyScalar(8)), dt, 3.1);
  } else if (target) {
    const range = pos.distanceTo(position(target)), bow = mob.weapon === 'bow';
    mob.movementSpeed = .3125;
    steerGround(manager, mob, position(target), dt, 3.125, bow ? 8 : 1.25);
    mob.yaw = Math.atan2(position(target).x-pos.x, position(target).z-pos.z);
    if (mob.attackCooldown === 0 && sight(target) && range < (bow ? 15 : 1.8)) {
      mob.attackCooldown = bow ? 2.5 : 1; mob.swingTime = .3;
      if (bow) {
        const origin = pos.clone().add(new THREE.Vector3(0,2.1,0));
        manager.spawnArrow(origin, position(target).clone().add(new THREE.Vector3(0,(target.height || 1.8)*.5,0)).sub(origin).normalize(), mob, {target, damage:4, flaming:true, spectral:mob.equipment.offhand?.id==='spectral_arrow', effect:mob.equipment.offhand?.effect});
      } else {
        const health = target.health;
        if (target.mesh) manager.damageMob(target, witherSkeletonDamage(manager, mob), pos, false, mob);
        else target.takeDamage?.(witherSkeletonDamage(manager, mob), pos, 'wither_skeleton');
        if (target.health < health) { if (target.mesh) applyMobWither(target); else target.applyStatusEffect?.('wither',10,1); }
      }
    }
  } else {
    mob.movementSpeed = .25;
    // Search nearby shade in an exposed Overworld daytime location, without burning.
    const time=manager.game?.worldTime;
    const day = manager.game?.isDaytime ?? (Number.isFinite(time) && time >= 0 && time < 12000);
    const exposed = p => { for (let y=Math.ceil(p.y+2.4);y<128;y++) if(manager.isBlockSolid(p.x,y,p.z)) return false; return true; };
    let shade;
    if (manager.world.dimension === 'overworld' && day && exposed(pos)) for (let radius=1;radius<=8&&!shade;radius++) for (const dx of [-radius,0,radius]) for (const dz of [-radius,0,radius]) { const p=pos.clone().add(new THREE.Vector3(dx,0,dz));if(!manager.checkMobCollision(mob,p)&&!exposed(p)) {shade=p;break;} }
    mob.seekingShade = !!shade;
    if (shade) steerGround(manager,mob,shade,dt,2.5); else wanderMob(manager,mob,dt,2.5);
  }
  const startY=pos.y;
  const speed = moveGroundMob(manager,mob,dt); mob.walkCycle = (mob.walkCycle || 0) + speed*dt*5; poseWitherSkeleton(mob);
  const water=manager.world.getVoxel(Math.floor(pos.x),Math.floor(pos.y+.2),Math.floor(pos.z))===BLOCKS.WATER;
  if(water)delete mob.fallPeak;
  else if(!mob.onGround)mob.fallPeak=Math.max(mob.fallPeak??startY,pos.y);
  else if(mob.fallPeak!==undefined){const damage=Math.floor(mob.fallPeak-pos.y-3);delete mob.fallPeak;if(damage>0)manager.damageMob(mob,damage,null,false,null,true);}
  mob.soundTimer = (mob.soundTimer || 0) - dt;
  if (mob.soundTimer <= 0) {manager.sounds?.playWitherSkeleton?.('idle');mob.soundTimer=8+random(manager)()*8;}
}

export function updateWolfWitherHunt(manager, wolf, dt) {
  if (wolf.isSitting || wolf.health <= 0) return false;
  const prey = manager.mobs.filter(m => m.type === 'wither_skeleton' && m.health > 0 && position(m).distanceTo(wolf.mesh.position) < 16).sort((a,b) => position(a).distanceToSquared(wolf.mesh.position)-position(b).distanceToSquared(wolf.mesh.position))[0];
  if (!prey) { wolf.skeletonPrey = null; return false; }
  wolf.skeletonPrey = prey;
  steerGround(manager,wolf,prey.mesh.position,dt,3.2,1);
  wolf.skeletonBiteCooldown = Math.max(0,(wolf.skeletonBiteCooldown || 0)-dt);
  if(wolf.mesh.position.distanceTo(prey.mesh.position)<1.5&&!wolf.skeletonBiteCooldown&&canSee(manager,wolf.mesh.position.clone().add(new THREE.Vector3(0,.5,0)),prey.mesh.position.clone().add(new THREE.Vector3(0,1,0)))) {
    manager.damageMob(prey,4,wolf.mesh.position,false,wolf);wolf.skeletonBiteCooldown=1;
  }
  moveGroundMob(manager,wolf,dt);manager.updateMobAnimation(wolf,dt,wolf.velocity.x,wolf.velocity.z);return true;
}

export function dropWitherSkeletonLoot(manager, mob, pos) {
  if (mob.noLoot) return;
  const r=random(manager), credited=mob.creditSeconds>0, looting=credited?mob.lootingLevel || 0:0;
  const drop=(id,count,item={})=>{if(count>0)manager.entities?.spawnDroppedItem(pos,id,false,count,item);};
  drop('bone',Math.floor(r()*3)+Math.round(r()*looting));
  drop('coal',Math.max(0,Math.floor(r()*3)-1)+Math.round(r()*looting));
  if(mob.chargedCreeperSkull || credited && r()<.025+.01*looting)drop('wither_skeleton_skull',1);
  const equipment={weapon:mob.weapon?{id:mob.weapon}:undefined,...mob.equipment};
  for(const item of Object.values(equipment))if(item&&!item.seasonal&&(item.pickedUp||credited&&r()<.085+.01*looting))drop(item.id,1,item);
  if(credited)manager.entities?.spawnXpOrbs?.(pos,5+Object.values(equipment).filter(item=>item&&!item.pickedUp&&!item.seasonal).reduce(n=>n+1+Math.floor(r()*3),0));
}

export function serializeWitherSkeleton(mob) {
  if(mob.type!=='wither_skeleton')return;
  return Object.fromEntries(['weapon','equipment','leftHanded','canPickUpLoot','persistent','name','creditSeconds','lootingLevel','naturalSpawn'].filter(k=>mob[k]!==undefined).map(k=>[k,mob[k]]));
}
export function restoreWitherSkeleton(mob,data) {if(mob?.type!=='wither_skeleton'||!data)return;Object.assign(mob,data);syncWitherEquipment(mob);poseWitherSkeleton(mob);}

export function canSpawnWitherSkeleton(manager,x,y,z,light) {
  const world=manager.world;
  if(world.dimension!=='nether'||manager.game?.difficulty==='peaceful')return false;
  const inside=(bounds)=>bounds&&x>=bounds.minX&&x<=bounds.maxX&&y>=bounds.minY&&y<=bounds.maxY&&z>=bounds.minZ&&z<=bounds.maxZ;
  const fortress=(world.netherFortresses||[]).find(f=>inside(f.bounds));
  if(!fortress)return false;
  if(!(fortress.pieces||[]).some(inside)&&world.getVoxel(x,y-1,z)!==BLOCKS.NETHER_BRICKS)return false;
  if(light===undefined && world.getLightLevel) light=world.getLightLevel(x,y,z);
  if(light===undefined) {light=0;for(let dx=-7;dx<=7;dx++)for(let dy=-7;dy<=7;dy++)for(let dz=-7;dz<=7;dz++){const emission=BLOCK_DEFS[world.getVoxel(x+dx,y+dy,z+dz)]?.light||0;light=Math.max(light,emission-Math.abs(dx)-Math.abs(dy)-Math.abs(dz));}}
  return light<=7&&manager.isBlockSolid(x,y-1,z)&&!manager.checkMobCollision({type:'wither_skeleton'},new THREE.Vector3(x+.5,y,z+.5));
}

export function updateWitherSkeletonSpawning(manager,dt,player) {
  if(!manager.world.netherFortresses?.length||!manager.world.chunks?.size||manager.game?.difficulty==='peaceful')return;
  manager.witherSpawnTimer=(manager.witherSpawnTimer??20)-dt;if(manager.witherSpawnTimer>0)return;manager.witherSpawnTimer=20;
  if(manager.mobs.filter(m=>m.type==='wither_skeleton'&&m.health>0).length>=20)return;
  const r=random(manager);
  for(let attempt=0;attempt<12;attempt++){const angle=r()*Math.PI*2,d=24+r()*40,x=Math.floor(player.position.x+Math.sin(angle)*d),z=Math.floor(player.position.z+Math.cos(angle)*d),y=manager.world.getHeightAt?.(x,z)??Math.floor(player.position.y);if(!canSpawnWitherSkeleton(manager,x,y,z))continue;for(let i=0;i<5;i++){const sx=x+Math.floor(r()*5)-2,sz=z+Math.floor(r()*5)-2;if(canSpawnWitherSkeleton(manager,sx,y,sz))manager.spawnWitherSkeleton(sx+.5,y,sz+.5,{natural:true});}break;}
}
