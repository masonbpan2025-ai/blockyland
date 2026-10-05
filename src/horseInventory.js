import {HORSE_ARMOR} from './horseBehavior.js';
import {isPackEquine} from './packEquineModel.js';
import {chestSlots,clickPackSlot,storePackItem,isChestItem} from './packEquine.js';
// Equipment panel lives inside the existing inventory modal, using its normal
// pointer-lock and close lifecycle. Removing a slot returns the item to inventory.
export function renderHorseInventory(ui,mob){
 document.getElementById('horse-equipment')?.remove();
 if(!mob||!mob.isTamed||mob.isBaby)return;
 const panel=document.createElement('section');panel.id='horse-equipment';
 const title=document.createElement('h3');title.textContent=`${mob.name || 'Horse'} equipment`;panel.append(title);
 const equipment=[['Saddle','isSaddled','saddle']];if(mob.type==='horse')equipment.push(['Horse armor','horseArmor',mob.horseArmor]);
 for(const [label,key,id] of equipment){
  const button=document.createElement('button');button.style.cssText='padding:12px;margin:8px;border:1px solid #789;background:#243247;color:white';button.textContent=`${label}: ${mob[key]?(id || 'saddle').replaceAll('_',' '):'empty'} — click to ${mob[key]?'remove':'equip held item'}`;
  button.onclick=()=>{
   if(mob[key]){if(ui.inv.addItem(id,false,1)===false)return;mob[key]=key==='isSaddled'?false:null;if(key==='isSaddled')mob.saddleMesh.visible=false;else{mob.armor=0;mob.armorMesh.visible=false;}}
   else {const item=ui.inv.getActiveItem();if(!item||!(key==='isSaddled'?item.id==='saddle':mob.type==='horse'&&HORSE_ARMOR[item.id]))return;ui.mobs?.animalBehaviors?.interact(mob,ui.player,ui.inv);}
   ui.updateHotbar();renderHorseInventory(ui,mob);
  };panel.append(button);
 }
 if(isPackEquine(mob)){
  const chest=document.createElement('button');chest.textContent=mob.hasChest?'Chest attached permanently · 15 slots':'Equip held chest';
  chest.disabled=!!mob.hasChest;chest.onclick=()=>{if(!isChestItem(ui.inv.getActiveItem()?.id))return;ui.mobs?.animalBehaviors?.interact(mob,ui.player,ui.inv);ui.updateHotbar();renderHorseInventory(ui,mob);};panel.append(chest);
  const slots=chestSlots(mob);
  if(slots){
   const held=document.createElement('button');held.textContent='Store held stack';held.onclick=()=>{storePackItem(mob,ui.inv);ui.renderInventoryGrids();ui.updateHotbar();renderHorseInventory(ui,mob);};panel.append(held);
   const grid=document.createElement('div');grid.id='pack-storage';grid.setAttribute('aria-label',`${mob.type} chest storage`);grid.style.cssText='display:grid;grid-template-columns:repeat(5,48px);gap:4px;margin:12px';
   slots.forEach((item,i)=>{const slot=document.createElement('div');slot.className='inv-slot';slot.setAttribute('aria-label',`Chest slot ${i+1}: ${item?`${item.id} × ${item.count}`:'empty'}`);ui.renderSlotContent(slot,item);
    const click=(right,shift)=>{clickPackSlot(mob,ui.inv,i,right,shift);ui.renderInventoryGrids();ui.updateHotbar();renderHorseInventory(ui,mob);ui.updateFloatingCursor();};
    slot.onclick=e=>click(false,e.shiftKey);slot.oncontextmenu=e=>{e.preventDefault();click(true,e.shiftKey);};grid.append(slot);});panel.append(grid);
  }
 }
 ui.invModal.append(panel);
}
export function updateHorseHud(mob){
 let hud=document.getElementById('horse-health');
 if(!mob){if(hud)hud.hidden=true;return;}
 if(!hud){hud=document.createElement('div');hud.id='horse-health';hud.style.cssText='position:fixed;bottom:102px;left:50%;transform:translateX(-50%);padding:5px 12px;background:#17212bdd;color:#fff;font:14px monospace;pointer-events:none;z-index:1000';document.body.append(hud);}
 hud.hidden=false;hud.textContent=`${mob.type[0].toUpperCase()+mob.type.slice(1)} health ${Math.ceil(mob.health)} / ${Math.ceil(mob.maxHealth)} · ${mob.isSaddled?'Hold Space to jump':'Saddle required to steer'}`;
}
