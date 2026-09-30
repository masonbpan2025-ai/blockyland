import * as THREE from 'three';
export const bowPower=seconds=>Math.min(1,(seconds*seconds+seconds*2)/3);
export const bowFov=(fov,draw)=>fov*(1-.15*Math.min(1,draw)**2);
export class BowController {
  constructor(game){this.game=game;this.cancel();}
  ammo(){return [...this.game.inventory.hotbar,...this.game.inventory.storage].find(i=>i?.id==='arrow'&&!i.isBlock&&i.count>0);}
  canUse(){const g=this.game;return !g.player.isDead&&!g.dungeonMode?.isActive&&!g.ui.isModalOpen()&&!g.ui.isChatOpen&&document.pointerLockElement===g.renderer.domElement;}
  start(){const g=this.game,item=g.inventory.getActiveItem();if(item?.isBlock||item?.id!=='bow')return false;if(!this.canUse()||g.player.gamemode!=='creative'&&!this.ammo())return true;this.item=item;this.slot=g.inventory.activeSlot;this.time=0;this.drawing=true;return true;}
  cancel(){this.drawing=false;this.time=0;if(this.game.player)this.game.player.bowDraw=0;}
  update(dt){if(!this.drawing)return;const g=this.game;if(!this.canUse()||g.inventory.getActiveItem()!==this.item||g.inventory.activeSlot!==this.slot){this.cancel();return;}this.time=Math.min(1,this.time+Math.max(0,dt));g.player.bowDraw=this.time;}
  release(){if(!this.drawing)return;const g=this.game,power=bowPower(this.time),valid=this.canUse()&&g.inventory.getActiveItem()===this.item&&g.inventory.activeSlot===this.slot;this.cancel();if(!valid||power<.1)return;const ammo=this.ammo();if(g.player.gamemode!=='creative'&&!ammo)return;
    const direction=g.camera.getWorldDirection(new THREE.Vector3());
    // The eye is the origin, so nearby walls cannot be skipped by the muzzle.
    const origin=g.player.position.clone().add(new THREE.Vector3(0,g.player.eyeHeight??1.62,0));
    g.mobs.spawnArrow(origin,direction,'player',{speed:30*power,damage:Math.ceil(6*power),pickup:g.player.gamemode!=='creative'});
    if(g.player.gamemode!=='creative'){ammo.count--;for(const slots of [g.inventory.hotbar,g.inventory.storage]){const i=slots.indexOf(ammo);if(i>=0&&ammo.count===0)slots[i]=null;}}
    g.ui.updateHotbar();g.heldItemRenderer.recoil();
  }
}
