import * as THREE from 'three';
import { isTippedArrow, tippedArrowEffect } from './tippedArrows.js';
import { enchantLevel } from './maceSmash.js';
export const bowPower=seconds=>Math.min(1,(seconds*seconds+seconds*2)/3);
export const bowFov=(fov,draw)=>fov*(1-.15*Math.min(1,draw)**2);
export class BowController {
  constructor(game){this.game=game;this.cancel();}
  // Tipped arrows count as ammo. They did not, so the three tipped-arrow items in the game -- which mobs
  // drop and which exist in the registry -- could never be fired: the bow only ever looked for plain and
  // spectral arrows, and `release` passed no effect to `spawnArrow` even though `updateArrows` already
  // knows how to apply one.
  //
  // The `i &&` guard is load-bearing and comes first. An earlier version of this line put the count check
  // before the id check, which reads `i.count` on a null slot and throws -- the previous form happened to be
  // safe only because `includes(i?.id)` short-circuited first.
  // Dual wielding: "Arrows that are held on the off-hand take priority over arrows in any other slot".
  ammo(){return [this.game.inventory.offhand,...this.game.inventory.hotbar,...this.game.inventory.storage].find(i=>i&&!i.isBlock&&i.count>0&&(i.id==='arrow'||i.id==='spectral_arrow'||isTippedArrow(i.id)));}
  canUse(){const g=this.game;const isLocked=document.pointerLockElement&&(document.pointerLockElement===g.renderer?.domElement||document.pointerLockElement===g.renderer?.domElement?.parentElement);return !g.player.isDead&&!g.player.isDungeonMode&&!g.ui.isModalOpen()&&!g.ui.isChatOpen&&isLocked;}
  start(){const g=this.game,item=g.inventory.getActiveItem();if(item?.isBlock||item?.id!=='bow')return false;if(!this.canUse()||g.player.gamemode!=='creative'&&!this.ammo())return true;this.item=item;this.slot=g.inventory.activeSlot;this.time=0;this.drawing=true;return true;}
  cancel(){this.drawing=false;this.time=0;if(this.game.player)this.game.player.bowDraw=0;}
  update(dt){if(!this.drawing)return;const g=this.game;if(!this.canUse()||g.inventory.getActiveItem()!==this.item||g.inventory.activeSlot!==this.slot){this.cancel();return;}this.time=Math.min(1,this.time+Math.max(0,dt));g.player.bowDraw=this.time;}
  release(){if(!this.drawing)return;const g=this.game,power=bowPower(this.time),valid=this.canUse()&&g.inventory.getActiveItem()===this.item&&g.inventory.activeSlot===this.slot;this.cancel();if(!valid||power<.1)return;const ammo=this.ammo();if(g.player.gamemode!=='creative'&&!ammo)return;
    const direction=g.camera.getWorldDirection(new THREE.Vector3());
    // The eye is the origin, so nearby walls cannot be skipped by the muzzle.
    const origin=g.player.position.clone().add(new THREE.Vector3(0,g.player.eyeHeight??1.62,0));
    // `effect` is what `spawnArrow` stores and `updateArrows` applies to whatever the arrow hits, so a
    // tipped arrow now carries its potion's effect at one eighth of the potion's duration.
    // Power: +25% x (level + 1), rounded up to a half heart (wiki, Power); Punch: knockback (wiki, Punch).
    const powerLevel=enchantLevel(this.item?.enchantments,'power'),punchLevel=enchantLevel(this.item?.enchantments,'punch');
    const damage=powerLevel>0?Math.ceil(6*power*(1+0.25*(powerLevel+1))*2)/2:Math.ceil(6*power);
    g.mobs.spawnArrow(origin,direction,'player',{spectral:ammo?.id==='spectral_arrow',effect:tippedArrowEffect(ammo?.id),arrowItem:ammo?.id,speed:30*power,damage,punch:punchLevel,pickup:g.player.gamemode!=='creative'});
    if(g.player.gamemode!=='creative'){ammo.count--;if(ammo.count===0&&g.inventory.offhand===ammo)g.inventory.offhand=null;for(const slots of [g.inventory.hotbar,g.inventory.storage]){const i=slots.indexOf(ammo);if(i>=0&&ammo.count===0)slots[i]=null;}}
    g.ui.updateHotbar();g.heldItemRenderer.recoil();
  }
}
