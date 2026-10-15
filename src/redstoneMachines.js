import {BLOCKS as B,BLOCK_DEFS,ITEMS,stackLimitFor} from './blocks.js';
import {findMatchingRecipe,RECIPES_3X3} from './crafting.js';
import * as THREE from 'three';

export const BULBS=new Set(Object.entries(B).filter(([name])=>name.endsWith('COPPER_BULB')).map(([,id])=>id));
export const EXTRA_COMPONENTS=[B.CRAFTER,B.TRAPPED_CHEST,B.DETECTOR_RAIL,B.ACTIVATOR_RAIL,...BULBS];
for(const id of EXTRA_COMPONENTS)if(BLOCK_DEFS[id]){BLOCK_DEFS[id].redstone=true;BLOCK_DEFS[id].redstoneNativeModel=true;}
for(const id of BULBS){const def=BLOCK_DEFS[id];def.redstoneBulb=true;def.light=/Oxidized/.test(def.name)?4:/Weathered/.test(def.name)?8:/Exposed/.test(def.name)?12:15;}

export function insertCrafter(state,item,count=1){
  state.inventory??=Array(9).fill(null);state.disabled??=Array(9).fill(false);
  let inserted=0;
  for(let n=0;n<count;n++){
    const identity=it=>JSON.stringify(Object.entries({...it,isBlock:!!it.isBlock}).filter(([k])=>k!=='count').sort(([a],[b])=>a.localeCompare(b)));
    const choices=Array.from({length:9},(_,i)=>i).filter(i=>!state.disabled[i]&&(!state.inventory[i]||(identity(state.inventory[i])===identity(item)&&state.inventory[i].count<stackLimitFor(item.id))));
    choices.sort((a,b)=>(state.inventory[a]?.count??0)-(state.inventory[b]?.count??0)||a-b);const i=choices[0];if(i===undefined)break;
    if(state.inventory[i])state.inventory[i].count++;else state.inventory[i]={...item,count:1};inserted++;
  }return inserted;
}

export function craftPulse(engine,state){
  const grid=Array.from({length:9},(_,i)=>state.inventory[i]??null),result=findMatchingRecipe(grid,3,3,RECIPES_3X3);if(!result)return false;
  const front=state.p.map((v,i)=>v+[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]][state.dir][i]);
  const target=engine.state(front),output={...result};
  // Consumption is committed once; inventory insertion is followed by a visible
  // physical ejection of anything that did not fit, as with a normal crafter.
  for(let i=0;i<9;i++)if(grid[i]){
    const item=grid[i];if(--state.inventory[i].count===0)state.inventory[i]=null;
    const remainder=['water_bucket','lava_bucket','milk_bucket'].includes(item.id)?'bucket':item.id==='honey_bottle'?'glass_bottle':null;
    if(remainder)engine.game?.entities?.spawnDroppedItem?.(new THREE.Vector3(...front).addScalar(.5),remainder,false,1);
  }
  let remaining=output.count;
  if(engine.deviceInventory(target)){const from={inventory:[output]};while(remaining>0&&engine.transferOne(from,target))remaining=from.inventory[0]?.count??0;}
  else if([B.CHEST,B.TRAPPED_CHEST].includes(engine.id(front))&&engine.game?.chestManager){while(remaining>0&&engine.game.chestManager.addItem(...front,output.id,output.isBlock,1))remaining--;}
  if(remaining)engine.game?.entities?.spawnDroppedItem?.(new THREE.Vector3(...front).addScalar(.5),output.id,output.isBlock,remaining);
  engine.mark(state.p);return true;
}

/** Existing game state exposed to comparator reads, rather than a second copy. */
export function extraAnalog(engine,p){
  const id=engine.id(p),s=engine.state(p),w=engine.world,key=p.join(',');
  if(BULBS.has(id))return s?.on?15:0;
  if(id===B.CRAFTER)return Array.from({length:9},(_,i)=>!!s?.inventory?.[i]||!!s?.disabled?.[i]).filter(Boolean).length;
  if([B.CAULDRON,B.WATER_CAULDRON,B.LAVA_CAULDRON,B.POWDER_SNOW_CAULDRON].includes(id))return id===B.CAULDRON?0:id===B.LAVA_CAULDRON?3:w.cauldronLevels?.get(key)??3;
  if(id===B.RESPAWN_ANCHOR)return Math.ceil((w.structureOrientations?.get(key)?.anchorCharges??0)*15/4);
  if(id===B.BEEHIVE||id===B.BEE_NEST)return engine.game?.hiveManager?.hives?.get(key)?.level??0;
  if(id===B.DETECTOR_RAIL){const cart=(engine.game?.railSystem??engine.game?.rails)?.carts?.find(c=>c.rail?.every((v,i)=>v===p[i]));if(cart?.items){const items=cart.items.filter(Boolean),fullness=items.reduce((n,it)=>n+it.count/stackLimitFor(it.id),0);return items.length?Math.floor(1+14*fullness/cart.items.length):0;}return 0;}
  return null;
}

// Small native panel: click a hotbar item then a crafter slot; right-click an
// empty slot to disable it. Uses the same inventory gestures as other containers.
export function openCrafterPanel(game,engine,state){
  if(typeof document==='undefined')return false;
  document.getElementById('crafter-panel')?.remove();
  const panel=document.createElement('div');panel.id='crafter-panel';panel.className='game-modal';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Crafter');
  panel.style.cssText='position:fixed;inset:0;z-index:10020;background:#000a;display:grid;place-items:center;color:white;font:16px system-ui';
  const card=document.createElement('div');card.style.cssText='background:#25252d;padding:24px;border:2px solid #777;border-radius:10px';panel.append(card);
  const title=document.createElement('h2');title.textContent='Crafter';card.append(title);
  const hint=document.createElement('p');hint.textContent='Choose an item below, then a slot. Right-click an empty slot to disable it.';card.append(hint);
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(3,90px);gap:6px;margin:12px 0';card.append(grid);
  const bag=document.createElement('div');bag.style.cssText='display:grid;grid-template-columns:repeat(9,70px);gap:4px';card.append(bag);
  const carried=document.createElement('p');card.append(carried);
  state.disabled??=Array(9).fill(false);state.inventory=Array.from({length:9},(_,i)=>state.inventory[i]??null);
  const label=item=>item?`${ITEMS[item.id]?.name??BLOCK_DEFS[item.id]?.name??item.id} ×${item.count}`:'Empty';
  function render(){grid.replaceChildren();bag.replaceChildren();carried.textContent='Carrying: '+label(game.inventory.cursorItem);
    for(let i=0;i<9;i++){const b=document.createElement('button');b.textContent=state.disabled[i]?'Disabled':label(state.inventory[i]);b.style.cssText='height:70px;background:'+(state.disabled[i]?'#543b40':'#4a4a55')+';color:white';b.onclick=()=>{if(!state.disabled[i])game.inventory.handleSlotClick(state.inventory,i,false,false);engine.mark(state.p);render();};b.oncontextmenu=e=>{e.preventDefault();if(!state.inventory[i]&&!game.inventory.cursorItem)state.disabled[i]=!state.disabled[i];else if(!state.disabled[i])game.inventory.handleSlotClick(state.inventory,i,true,false);engine.mark(state.p);render();};grid.append(b);}
    for(let i=0;i<9;i++){const b=document.createElement('button');b.textContent=label(game.inventory.hotbar[i]);b.style.cssText='height:60px';b.onclick=()=>{game.inventory.handleSlotClick(game.inventory.hotbar,i,false,false);render();};bag.append(b);}
  }
  const close=document.createElement('button');close.textContent='Close';close.style.cssText='margin-top:16px;padding:10px 24px';card.append(close);
  const finish=()=>{game.ui.redstonePanelOpen=false;panel.remove();document.removeEventListener('keydown',keyHandler,true);game.ui?.updateHotbar?.();};
  const keyHandler=e=>{if(e.code==='Escape'){e.stopImmediatePropagation();finish();}};
  close.onclick=finish;panel.addEventListener('mousedown',e=>e.stopPropagation());panel.addEventListener('click',e=>e.stopPropagation());document.addEventListener('keydown',keyHandler,true);
  game.ui.redstonePanelOpen=true;game.player.locked=false;document.exitPointerLock?.();document.body.append(panel);render();return true;
}
