import { BLOCKS, ITEMS } from './blocks.js';
import { isPackEquine, syncPackEquineAppearance } from './packEquineModel.js';

export function packEquineStats(random = Math.random) {
  return {maxHealth: 15 + Math.floor(random() * 8) + Math.floor(random() * 9), movementSpeed: .175, jumpStrength: .5, temper: 0};
}

export function chestSlots(mob) {
  if (!isPackEquine(mob) || !mob.hasChest) return null;
  mob.chestInventory ||= [];
  mob.chestInventory.length = 15;
  for (let i = 0; i < 15; i++) mob.chestInventory[i] ??= null;
  return mob.chestInventory;
}

export const isChestItem = id => id === 'chest' || id === BLOCKS.CHEST;
const sameStack = (a, b) => a.id === b.id && !!a.isBlock === !!b.isBlock && JSON.stringify({...a, count:0}) === JSON.stringify({...b, count:0});

// One complete stack at a time; a failed move leaves both inventories untouched.
export function storePackItem(mob, inventory, slot) {
  const slots = chestSlots(mob), item = inventory.getActiveItem();
  if (!slots || !mob.isTamed || mob.isBaby || mob.health <= 0 || !item || item.count <= 0) return false;
  if (slot === undefined) slot = slots.findIndex(s => s && sameStack(s, item) && s.count + item.count <= 64);
  if (slot < 0 || slot === undefined) slot = slots.findIndex(s => !s);
  if (!Number.isInteger(slot) || slot < 0 || slot >= 15) return false;
  const target = slots[slot], limit = ITEMS[item.id]?.stackSize || (ITEMS[item.id]?.type === 'tool' || ITEMS[item.id]?.type === 'weapon' ? 1 : 64);
  if (target && (!sameStack(target,item) || target.count + item.count > limit) || item.count > limit) return false;
  slots[slot] = target ? {...target, count:target.count+item.count} : structuredClone(item);
  const count = item.count; for(let i=0;i<count;i++) inventory.consumeActiveItem();
  return true;
}

export function takePackItem(mob, inventory, slot) {
  const slots=chestSlots(mob);
  if(!slots||!mob.isTamed||mob.isBaby||mob.health<=0||!Number.isInteger(slot)||slot<0||slot>=15||!slots[slot])return false;
  for(const [list,size] of [[inventory.hotbar,9],[inventory.storage,27]]) {
    if(!list)continue;
    for(let i=0;i<size;i++)if(!list[i]){list[i]=slots[slot];slots[slot]=null;return true;}
  }
  return false;
}

// Pack slots use the player's normal cursor, preserving every item field during
// split, swap and merge. Differently named/enchanted stacks must never merge.
export function clickPackSlot(mob,inventory,index,right=false,shift=false) {
  const slots=chestSlots(mob);
  if(!slots||!mob.isTamed||mob.isBaby||mob.health<=0||!Number.isInteger(index)||index<0||index>=15)return false;
  if(shift)return takePackItem(mob,inventory,index);
  const target=slots[index],cursor=inventory.cursorItem;
  if(!cursor){if(!target)return false;const count=right?Math.ceil(target.count/2):target.count;inventory.cursorItem={...target,count};target.count-=count;if(!target.count)slots[index]=null;}
  else if(!target){const count=right?1:cursor.count;slots[index]={...cursor,count};cursor.count-=count;if(!cursor.count)inventory.cursorItem=null;}
  else if(sameStack(target,cursor)){
    const limit=ITEMS[cursor.id]?.stackSize || (['tool','weapon'].includes(ITEMS[cursor.id]?.type)?1:64);
    const count=Math.min(right?1:cursor.count,limit-target.count);if(count<=0)return false;
    target.count+=count;cursor.count-=count;if(!cursor.count)inventory.cursorItem=null;
  }else{slots[index]=cursor;inventory.cursorItem=target;}
  return true;
}

export function hurtPackEquine(manager, mob, attacker) {
  manager.sounds?.playDonkey?.(mob.health <= 0 ? 'death' : 'hurt', mob.isBaby);
  mob.panicSeconds=5;mob.grazeTime=0;mob.inLove=0;
  const from=attacker?.position || attacker?.mesh?.position,p=mob.mesh.position;
  mob.panicYaw=from?Math.atan2(p.x-from.x,p.z-from.z):(manager.random||Math.random)()*Math.PI*2;
  if (attacker === manager.game?.player || attacker?.type === 'wolf' && attacker.isTamed) {
    mob.playerCreditSeconds = 5;
    const e = attacker.inventory?.getActiveItem?.()?.enchantments;
    mob.lootingLevel = Math.max(0, Math.min(3, (Array.isArray(e) ? e.find(v=>v.id==='looting')?.level : e?.looting) || 0));
  }
}

export function dropPackEquineLoot(manager, mob, pos) {
  if (mob.noLoot || mob.isBaby) return;
  const random = manager.random || Math.random, credited = mob.playerCreditSeconds > 0;
  const leather = Math.floor(random()*3) + Math.round(random()*(credited ? mob.lootingLevel || 0 : 0));
  if (leather) manager.entities?.spawnDroppedItem(pos, 'leather', false, leather);
  if (mob.isSaddled) manager.entities?.spawnDroppedItem(pos, 'saddle', false, 1);
  if (mob.hasChest) {
    manager.entities?.spawnDroppedItem(pos, BLOCKS.CHEST, true, 1);
    for (const item of chestSlots(mob)) if (item) manager.entities?.spawnDroppedItem(pos, item.id, !!item.isBlock, item.count, {...item,itemData:structuredClone(item)});
    mob.chestInventory.fill(null);
  }
  if (credited) manager.entities?.spawnXpOrbs?.(pos, 1+Math.floor(random()*3));
}

export function updatePackEquine(mob, dt, manager) {
  mob.playerCreditSeconds = Math.max(0, (mob.playerCreditSeconds || 0)-dt);
  mob.panicSeconds=Math.max(0,(mob.panicSeconds||0)-dt);
  if(manager){
    const p=mob.mesh.position,scale=mob.isBaby?.5:1,height=manager.getMobDimensions(mob.type).height*scale;
    const submerged=manager.world.getVoxel(Math.floor(p.x),Math.floor(p.y+height-.1),Math.floor(p.z))===BLOCKS.WATER;
    mob.airSeconds=submerged?(mob.airSeconds??15)-dt:Math.min(15,(mob.airSeconds??15)+dt*4);
    if(mob.airSeconds<=-1){mob.airSeconds=0;manager.damageMob(mob,2,null,true);}
  }
  syncPackEquineAppearance(mob);
}

export const DONKEY_BIOMES = {meadow:[1,2,5], plains:[1,3,46], sunflower_plains:[1,3,46], savanna:[1,1,52], windswept_savanna:[1,1,52], savanna_plateau:[1,1,68]};
export function canSpawnDonkey(manager,x,y,z) {
  const world=manager.world;
  if(world.dimension!=='overworld'||!DONKEY_BIOMES[world.getBiome?.(x,z)]||world.getVoxel(x,y-1,z)!==BLOCKS.GRASS)return false;
  const light=world.getLightLevel?.(x,y,z) ?? ((manager.game?.worldTime ?? 6000)<12000 ? 15 : 0);
  return light>8&&!manager.checkMobCollision({type:'donkey'}, {x:x+.5,y,z:z+.5});
}
export function updateDonkeySpawning(manager,dt,player) {
  if(manager.world.dimension!=='overworld'||!manager.world.chunks?.size||!player?.position)return;
  manager.donkeySpawnTimer=(manager.donkeySpawnTimer??30)-dt;if(manager.donkeySpawnTimer>0)return;manager.donkeySpawnTimer=30;
  if(manager.mobs.filter(m=>m.type==='donkey'&&m.health>0).length>=12)return;
  const r=manager.random||Math.random, angle=r()*Math.PI*2, distance=24+r()*40;
  const x=Math.floor(player.position.x+Math.sin(angle)*distance),z=Math.floor(player.position.z+Math.cos(angle)*distance);
  const y=manager.world.getHeightAt?.(x,z) ?? (manager.world.surfaceHeightAt?.(x,z)+1);
  if(!Number.isFinite(y)||!canSpawnDonkey(manager,x,y,z))return;
  const [min,max,weight]=DONKEY_BIOMES[manager.world.getBiome(x,z)];if(r()>=1/weight)return;
  const count=min+Math.floor(r()*(max-min+1));
  for(let i=0;i<count;i++){const sx=x+i*2,sz=z;if(!canSpawnDonkey(manager,sx,y,sz))continue;const m=manager.spawnDonkey(sx+.5,y,sz+.5);m.isBaby=r()<.2;if(m.isBaby)m.babyGrowthTimer=1200;syncPackEquineAppearance(m);}
}
