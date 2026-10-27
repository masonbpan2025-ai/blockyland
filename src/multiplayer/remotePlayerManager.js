import * as THREE from 'three';
import { HURT_OVERLAY_SECONDS } from '../pvpCombat.js';
import { BLOCK_DEFS, BLOCKS } from '../blocks.js';
import { createPlayerModel } from '../playerModel.js';
import { ARMOR_ORDER } from './playerLook.js';
import { updateFlames } from '../burningFlames.js';

/** Java's hurt overlay: the model's colours multiplied towards red. */
const HURT_TINT = new THREE.Color(1.0, 0.3, 0.3);
/**
 * A dying player, as Java draws one (LivingEntityRenderer, LivingEntity.tickDeath): it tips onto its side, red, over
 * about 12 ticks -- the angle is sqrt(deathTime / 20 x 1.6) of 90 degrees -- and at 20 ticks it is gone in a puff of
 * smoke (the "poof" particles). It stays gone until the player respawns.
 */
export const DEATH_SECONDS = 1;
export const deathTilt = (seconds) => Math.min(1, Math.sqrt(Math.max(0, seconds * 20 - 1) / 20 * 1.6)) * (Math.PI / 2);

/**
 * Creates an authentic 2D billboard canvas nametag for a player avatar.
 */
function createNametagSprite(name, isHost = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Background pill
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  const radius = 24;
  const x = 32, y = 16, w = 448, h = 96;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();

  // Border outline
  ctx.strokeStyle = isHost ? 'rgba(56, 189, 248, 0.8)' : 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Text
  ctx.fillStyle = isHost ? '#38bdf8' : '#ffffff';
  ctx.font = 'bold 50px "Minecraft", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;

  const display = isHost ? `★ ${name}` : name;
  ctx.fillText(display, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.6, 0.4, 1.0);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * Another player's avatar: the game's own player model (playerModel.js), wearing the skin that player shares
 * (shareProtocol.js sanitizeSkin), or Steve until it arrives -- never this player's own skin.
 */
function createPlayerAvatar(name, isHost = false, skin = null) {
  const model = createPlayerModel({ skinDataUrl: skin?.png ?? null, modelType: skin?.model ?? 'default', followEquippedSkin: false });
  model.name = `remote_player_${name}`;

  // Hand item slots, at the end of each arm (forward along -Z): the held item in the right, the off hand in the left.
  const handSlot = new THREE.Group();
  handSlot.name = 'hand_slot';
  handSlot.position.set(0, -0.7, -0.15);
  model.rightArm.add(handSlot);
  const offhandSlot = new THREE.Group();
  offhandSlot.name = 'hand_slot';
  offhandSlot.position.set(0, -0.7, -0.15);
  model.leftArm.add(offhandSlot);

  // Floating billboard nametag, above the head (the model is 2 blocks tall to the top of its head).
  const nametag = createNametagSprite(name, isHost);
  nametag.position.set(0, 2.3, 0);
  model.add(nametag);

  return {
    mesh: model,
    head: model.head,
    torso: model.torso,
    leftArm: model.leftArm,
    rightArm: model.rightArm,
    leftLeg: model.leftLeg,
    rightLeg: model.rightLeg,
    handSlot,
    offhandSlot,
    nametag,
  };
}

/** Whether a part of the avatar is the player's own body (what invisibility hides), not armour, an item or a tag. */
function isBodyPart(object, model) {
  for (let o = object; o && o !== model; o = o.parent) {
    if (/^armor_/.test(o.name) || o.name === 'hand_slot' || o.name === 'flames' || o.isSprite) return false;
  }
  return true;
}

export class RemotePlayerManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.remotePlayers = new Map(); // peerId -> { peerId, name, avatar, targetPos, currentPos, targetYaw, targetPitch, ... }
    /** Each player's shared skin, by id, kept even before their avatar exists. */
    this.skins = new Map();
  }

  /** Another player's skin (`{png, model}`), now and from here on. */
  setSkin(peerId, skin) {
    if (!skin?.png) return;
    this.skins.set(peerId, skin);
    const peer = this.remotePlayers.get(peerId);
    if (peer) this.applySkin(peer, skin);
  }

  applySkin(peer, skin) {
    const model = peer.avatar?.mesh;
    if (!model) return;
    peer.skin = skin;
    model.updateSkin?.(skin.png);
    model.updateModelType?.(skin.model);
  }

  addPeer(peerId, name, isHost = false) {
    if (this.remotePlayers.has(peerId)) {
      this.removePeer(peerId);
    }

    const skin = this.skins.get(peerId) ?? null;
    const avatar = createPlayerAvatar(name, isHost, skin);
    this.scene.add(avatar.mesh);

    const peerData = {
      peerId,
      name,
      isHost,
      avatar,
      targetPos: new THREE.Vector3(0, 30, 0),
      currentPos: new THREE.Vector3(0, 30, 0),
      targetYaw: 0,
      targetPitch: 0,
      currentYaw: 0,
      currentPitch: 0,
      isSneaking: false,
      isSprinting: false,
      isSwinging: false,
      swingProgress: 0,
      walkPhase: 0,
      heldItemBlockId: null,
      heldItemMesh: null,
      offhandItemId: null,
      // The look (playerLook.js): what the player wears and does, beyond where it stands.
      blocking: false,
      using: null,
      burning: false,
      invisible: false,
      lastMoveTime: Date.now(),
      skin,
    };

    avatar.mesh.position.copy(peerData.currentPos);
    this.remotePlayers.set(peerId, peerData);
    return peerData;
  }

  removePeer(peerId) {
    const peer = this.remotePlayers.get(peerId);
    if (!peer) return;

    if (peer.avatar?.mesh) {
      this.scene.remove(peer.avatar.mesh);
    }
    this.removeBobber(peer);
    this.remotePlayers.delete(peerId);
  }

  updatePeerState(peerId, state) {
    let peer = this.remotePlayers.get(peerId);
    if (!peer) {
      peer = this.addPeer(peerId, state.playerName || 'Player', !!state.isHost);
      // Already dead when first seen (joining while someone lies dead): nobody there, without the animation.
      if (state.dead) { peer.dead = true; peer.deathTime = DEATH_SECONDS; peer.avatar.mesh.visible = false; }
    }
    if (state.dead === true && !peer.dead) this.die(peer);
    else if (state.dead === false && peer.dead) this.revive(peer);
    if (peer.dead) return;

    const isFirstUpdate = !peer.hasInitialPos;
    if (state.x !== undefined && state.y !== undefined && state.z !== undefined) {
      peer.targetPos.set(state.x, state.y, state.z);
      if (isFirstUpdate) {
        peer.currentPos.copy(peer.targetPos);
        peer.avatar.mesh.position.copy(peer.currentPos);
      }
    }
    if (state.yaw !== undefined) {
      peer.targetYaw = state.yaw;
      if (isFirstUpdate) {
        peer.currentYaw = peer.targetYaw;
        peer.avatar.mesh.rotation.y = peer.currentYaw;
      }
    }
    if (state.pitch !== undefined) {
      peer.targetPitch = state.pitch;
      if (isFirstUpdate) {
        peer.currentPitch = peer.targetPitch;
        peer.avatar.head.rotation.x = peer.currentPitch;
      }
    }
    if (isFirstUpdate) peer.hasInitialPos = true;
    if (state.isSneaking !== undefined) {
      peer.isSneaking = !!state.isSneaking;
    }
    if (state.isSprinting !== undefined) {
      peer.isSprinting = !!state.isSprinting;
    }
    if (state.isSwinging) {
      peer.isSwinging = true;
      peer.swingProgress = 0;
    }
    if (state.activeItem !== undefined) {
      this.updateHeldItem(peer, state.activeItem);
    }
    this.updateLook(peer, state);
  }

  /**
   * What else is seen of the other player (playerLook.js): the armour it wears -- with its trims, drawn as this
   * player's own is (playerModel.js updateArmor) -- the off-hand item, a raised shield or a drawn bow (update poses
   * them), flames, invisibility (the body goes, armour and items stay, as in Java), and a fishing line.
   */
  updateLook(peer, state) {
    const model = peer.avatar?.mesh;
    if (!model) return;
    if (Array.isArray(state.armor)) {
      model.updateArmor?.(Object.fromEntries(ARMOR_ORDER.map((slot, i) => [slot, state.armor[i] ?? null])));
    }
    if (state.offhand !== undefined) this.updateHandItem(peer, peer.avatar.offhandSlot, 'offhandItemId', state.offhand);
    if (state.blocking !== undefined) peer.blocking = Boolean(state.blocking);
    if (state.using !== undefined) peer.using = state.using ?? null;
    // Flames are drawn in update (burningFlames.js).
    if (state.burning !== undefined) peer.burning = Boolean(state.burning);
    if (state.invisible !== undefined && Boolean(state.invisible) !== peer.invisible) {
      peer.invisible = Boolean(state.invisible);
      if (peer.invisible) {
        peer.hiddenParts = [];
        model.traverse((child) => { if (child.isMesh && child.visible && isBodyPart(child, model)) { child.visible = false; peer.hiddenParts.push(child); } });
      } else {
        for (const part of peer.hiddenParts ?? []) part.visible = true;
        peer.hiddenParts = null;
      }
      // Java hides an invisible player's name tag too.
      if (peer.avatar.nametag) peer.avatar.nametag.visible = !peer.invisible;
    }
    if (state.bobber !== undefined) this.updateBobber(peer, state.bobber);
  }

  /** The other player's fishing bobber, where their game says it is, on a line from their rod. */
  updateBobber(peer, at) {
    if (!at) { this.removeBobber(peer); return; }
    if (!peer.bobber) {
      const bobber = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xc0392b }));
      cap.position.y = 0.02;
      bobber.add(body, cap);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x2b2b2b }));
      line.frustumCulled = false;
      this.scene.add(bobber, line);
      peer.bobber = bobber;
      peer.bobberLine = line;
    }
    peer.bobber.position.set(at[0], at[1], at[2]);
  }

  removeBobber(peer) {
    for (const object of [peer.bobber, peer.bobberLine]) {
      if (!object) continue;
      object.removeFromParent();
      object.traverse((child) => { child.geometry?.dispose(); child.material?.dispose(); });
    }
    peer.bobber = null;
    peer.bobberLine = null;
  }

  /**
   * What the other player holds, drawn in their right hand as the game draws a dropped one (itemVisuals.js): a block as
   * a small block, an item -- a sword, a bow -- as its picture, held upright and pointing forward as in third person.
   * Blocks travel as their numeric id, items as their name.
   */
  updateHeldItem(peer, activeItem) {
    if (!peer?.avatar?.handSlot) return;
    peer.heldItemMesh = this.updateHandItem(peer, peer.avatar.handSlot, 'heldItemBlockId', activeItem) ?? peer.heldItemMesh;
  }

  /**
   * One hand's item: `key` is the peer's record of what that hand holds, so an unchanged item is not rebuilt.
   * @returns {THREE.Object3D|null|undefined} the new item's mesh, null for an empty hand, undefined when unchanged
   */
  updateHandItem(peer, handSlot, key, activeItem) {
    if (!handSlot) return undefined;
    const itemId = activeItem?.id ?? (typeof activeItem === 'string' || Number.isInteger(activeItem) ? activeItem : null);
    if (peer[key] === itemId) return undefined;
    peer[key] = itemId;
    while (handSlot.children.length > 0) {
      const child = handSlot.children[0];
      if (this.game?.entities?.itemVisuals?.release) this.game.entities.itemVisuals.release(child);
      else handSlot.remove(child);
    }
    if (handSlot === peer.avatar.handSlot) peer.heldItemMesh = null;
    if (itemId === null || itemId === undefined) return null;
    const isBlock = typeof itemId === 'number';
    const visuals = this.game?.entities?.itemVisuals;
    let itemMesh;
    if (visuals?.create) {
      itemMesh = visuals.create(itemId, isBlock, isBlock ? 0.3 : 0.62);
      if (isBlock) itemMesh.rotation.set(0.3, Math.PI / 4, 0);
      else {
        // One picture rather than the drop's two crossed ones, edge-on to the arm, the tip forward and up.
        if (itemMesh.children?.length > 1) itemMesh.remove(itemMesh.children[1]);
        itemMesh.rotation.set(-Math.PI / 4, Math.PI / 2, 0);
        itemMesh.position.set(0, 0.12, -0.12);
      }
    } else {
      itemMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshLambertMaterial({ color: 0x854d0e }));
    }
    itemMesh.name = 'held_item';
    itemMesh.userData.itemId = itemId;
    handSlot.add(itemMesh);
    return itemMesh;
  }

  /** The other player died: tip over, red, then gone in a puff of smoke (update), until they respawn. */
  die(peer) {
    peer.dead = true;
    peer.deathTime = 0;
    peer.isSwinging = false;
    this.triggerHurt(peer.peerId);
    peer.hurtTime = DEATH_SECONDS;
  }

  /** The other player respawned: standing again, wherever they are now. */
  revive(peer) {
    peer.dead = false;
    peer.deathTime = 0;
    const mesh = peer.avatar?.mesh;
    if (mesh) { mesh.visible = true; mesh.rotation.z = 0; }
    peer.hasInitialPos = false;
  }

  /** The "poof" of a death: a burst of white smoke where the player was. */
  poof(position) {
    const entities = this.game?.entities;
    if (!entities?.spawnSmoke) return;
    for (let i = 0; i < 20; i++) {
      const at = position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.8));
      entities.spawnSmoke(at, 0.08 + Math.random() * 0.08, 0.6 + Math.random() * 0.5);
    }
  }

  /**
   * Another player was hit: Java shows the red hurt overlay on them for their hurt time, 10 ticks (pvpCombat.js). It
   * does not bounce or shift the model -- the knockback itself arrives as the player's own movement.
   */
  triggerHurt(peerId) {
    const peer = this.remotePlayers.get(peerId);
    if (!peer || !peer.avatar?.mesh) return;
    peer.hurtDuration = HURT_OVERLAY_SECONDS;
    peer.hurtTime = peer.hurtDuration;
    // Each material's own colour is kept once, so a second hit while red cannot make red the colour to restore.
    if (!peer.hurtMaterials) {
      peer.hurtMaterials = [];
      peer.avatar.mesh.traverse((child) => {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of materials) {
          if (!mat?.color || mat === peer.avatar.nametag?.material || child.userData.noHurtTint) continue;
          if (peer.hurtMaterials.some((entry) => entry.mat === mat)) continue;
          peer.hurtMaterials.push({ mat, color: mat.color.clone() });
        }
      });
    }
    for (const entry of peer.hurtMaterials) entry.mat.color.copy(entry.color).multiply(HURT_TINT);
  }

  update(dt) {
    for (const peer of this.remotePlayers.values()) {
      const { avatar } = peer;
      if (!avatar) continue;
      if (peer.dead) {
        // Tipping onto its side, then the poof, then nobody.
        if (peer.deathTime < DEATH_SECONDS) {
          peer.deathTime = Math.min(DEATH_SECONDS, peer.deathTime + dt);
          avatar.mesh.rotation.z = deathTilt(peer.deathTime);
          if (peer.deathTime >= DEATH_SECONDS) {
            avatar.mesh.visible = false;
            this.poof(avatar.mesh.position);
            if (peer.hurtMaterials) { for (const entry of peer.hurtMaterials) entry.mat.color.copy(entry.color); peer.hurtMaterials = null; }
          }
        }
        continue;
      }

      // 1. Smooth position interpolation (Lerp)
      const prevPos = peer.currentPos.clone();
      peer.currentPos.lerp(peer.targetPos, Math.min(1.0, dt * 14));
      avatar.mesh.position.copy(peer.currentPos);

      // Sneaking height adjustment (leaning forward along -Z)
      if (peer.isSneaking) {
        avatar.mesh.position.y -= 0.15;
        avatar.torso.position.z = -0.06;
        avatar.head.position.z = -0.08;
      } else {
        avatar.torso.position.z = 0;
        avatar.head.position.z = 0;
      }

      // The red hurt overlay, then each material's own colour again.
      if (peer.hurtTime > 0) {
        peer.hurtTime = Math.max(0, peer.hurtTime - dt);
        if (peer.hurtTime === 0 && peer.hurtMaterials) {
          for (const entry of peer.hurtMaterials) entry.mat.color.copy(entry.color);
          peer.hurtMaterials = null;
        }
      }

      // 2. Smooth rotation interpolation
      let yawDiff = peer.targetYaw - peer.currentYaw;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      peer.currentYaw += yawDiff * Math.min(1.0, dt * 14);
      avatar.mesh.rotation.y = peer.currentYaw;

      avatar.head.rotation.x = peer.targetPitch || 0;

      // 3. Movement detection for limb animation
      const horizontalSpeed = Math.hypot(
        peer.currentPos.x - prevPos.x,
        peer.currentPos.z - prevPos.z
      ) / Math.max(0.0001, dt);

      if (horizontalSpeed > 0.08) {
        const animSpeed = peer.isSprinting ? 18 : 12;
        peer.walkPhase += dt * animSpeed;
        const swingAngle = Math.sin(peer.walkPhase) * 0.65;

        avatar.leftLeg.rotation.x = swingAngle;
        avatar.rightLeg.rotation.x = -swingAngle;

        if (!peer.isSwinging) {
          avatar.leftArm.rotation.x = -swingAngle;
          avatar.rightArm.rotation.x = swingAngle;
        }
      } else {
        // Return limbs to idle rest position
        avatar.leftLeg.rotation.x *= Math.max(0, 1.0 - dt * 10);
        avatar.rightLeg.rotation.x *= Math.max(0, 1.0 - dt * 10);
        if (!peer.isSwinging) {
          avatar.leftArm.rotation.x *= Math.max(0, 1.0 - dt * 10);
          avatar.rightArm.rotation.x *= Math.max(0, 1.0 - dt * 10);
        }
      }

      // 4. Punching / swinging animation
      if (peer.isSwinging) {
        peer.swingProgress += dt * 6;
        if (peer.swingProgress >= 1.0) {
          peer.isSwinging = false;
          peer.swingProgress = 0;
          avatar.rightArm.rotation.x = 0;
        } else {
          const punchAngle = Math.sin(peer.swingProgress * Math.PI) * -1.2;
          avatar.rightArm.rotation.x = punchAngle;
        }
      }

      // 5. What the player is doing with its hands: a bow drawn in both, a shield raised, food at the mouth.
      this.poseArms(peer, dt);
      peer.avatar.flames = updateFlames(avatar.mesh, peer.burning, dt) ?? peer.avatar.flames;
      if (peer.bobber && peer.bobberLine) {
        const tip = avatar.handSlot.getWorldPosition(new THREE.Vector3());
        const positions = peer.bobberLine.geometry.attributes.position;
        positions.setXYZ(0, tip.x, tip.y, tip.z);
        positions.setXYZ(1, peer.bobber.position.x, peer.bobber.position.y, peer.bobber.position.z);
        positions.needsUpdate = true;
      }
    }
  }

  /** Arms held as Java holds them while using an item, over the walk; back to the walk's own when done. */
  poseArms(peer, dt) {
    const { avatar } = peer;
    const pitch = peer.targetPitch || 0;
    avatar.leftArm.rotation.y = avatar.rightArm.rotation.y = 0;
    avatar.leftArm.rotation.z = avatar.rightArm.rotation.z = 0;
    if (peer.using === 'bow') {
      // Both arms out along the look, the left a little across: the bow held at full draw.
      avatar.rightArm.rotation.x = -Math.PI / 2 + pitch;
      avatar.leftArm.rotation.x = -Math.PI / 2 + pitch;
      avatar.rightArm.rotation.y = -0.1;
      avatar.leftArm.rotation.y = 0.4;
    } else if (peer.using === 'eat') {
      // The hand to the mouth, bobbing as it eats.
      peer.eatTime = (peer.eatTime ?? 0) + dt;
      avatar.rightArm.rotation.x = -1.1 + Math.sin(peer.eatTime * 20) * 0.08;
      avatar.rightArm.rotation.y = -0.5;
    } else if (peer.blocking) {
      // The shield's arm across the body: the off hand's when the shield is there, else the main hand's.
      const arm = peer.offhandItemId === 'shield' || peer.heldItemBlockId !== 'shield' ? avatar.leftArm : avatar.rightArm;
      arm.rotation.x = -0.9;
      arm.rotation.y = arm === avatar.leftArm ? 0.5 : -0.5;
    }
  }

  /**
   * The other player the crosshair is on, if any: a ray from the eyes against each avatar's box (a player is 0.6 wide
   * and 1.8 tall, 1.5 sneaking, standing on its position), nearest first. Java tests the exact box -- a player's pick
   * radius is 0 -- and from the eyes in third person too, so neither margin nor camera ray is added here.
   * @returns {{peerId: string, name: string, distance: number}|null}
   */
  pickPlayer(origin, direction, maxDistance, { pad = 0, except = null } = {}) {
    let best = null;
    const o = [origin.x, origin.y, origin.z], d = [direction.x, direction.y, direction.z];
    for (const peer of this.remotePlayers.values()) {
      // `except`: the shooter of another player's shot, which leaves from inside its own box.
      if (except !== null && peer.peerId === except) continue;
      // Nobody to hit where a player lies dead, or where the world's game has hidden one (a spectator).
      if (peer.dead || peer.avatar?.mesh?.visible === false) continue;
      const p = peer.currentPos;
      // `pad`: a projectile's own half-size, which a melee pick does not have.
      const min = [p.x - 0.3 - pad, p.y - pad, p.z - 0.3 - pad], max = [p.x + 0.3 + pad, p.y + (peer.isSneaking ? 1.5 : 1.8) + pad, p.z + 0.3 + pad];
      let near = 0, far = maxDistance;
      for (let axis = 0; axis < 3 && near <= far; axis++) {
        if (Math.abs(d[axis]) < 1e-9) { if (o[axis] < min[axis] || o[axis] > max[axis]) near = Infinity; continue; }
        let t1 = (min[axis] - o[axis]) / d[axis], t2 = (max[axis] - o[axis]) / d[axis];
        if (t1 > t2) [t1, t2] = [t2, t1];
        near = Math.max(near, t1); far = Math.min(far, t2);
      }
      if (near <= far && near <= maxDistance && (!best || near < best.distance)) best = { peerId: peer.peerId, name: peer.name, distance: near };
    }
    return best;
  }


  clear() {
    for (const peerId of Array.from(this.remotePlayers.keys())) {
      this.removePeer(peerId);
    }
    this.skins.clear();
  }
}
