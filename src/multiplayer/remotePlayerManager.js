import * as THREE from 'three';
import { HURT_OVERLAY_SECONDS } from '../pvpCombat.js';
import { BLOCK_DEFS, BLOCKS } from '../blocks.js';

/** Java's hurt overlay: the model's colours multiplied towards red. */
const HURT_TINT = new THREE.Color(1.0, 0.3, 0.3);

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
 * Builds a Minecraft Steve-style 3D avatar with articulated limbs.
 */
function createPlayerAvatar(name, isHost = false) {
  const group = new THREE.Group();
  group.name = `remote_player_${name}`;

  // Materials
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xcd8c64 }); // Steve skin
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x4a3219 }); // Dark brown hair
  const shirtMat = new THREE.MeshLambertMaterial({ color: isHost ? 0x0284c7 : 0x0ea5e9 }); // Cyan / Sky blue
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1d4ed8 }); // Blue jeans
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eyePupilMat = new THREE.MeshBasicMaterial({ color: 0x2563eb });

  // 1. Head (0.5 x 0.5 x 0.5)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.45, 0);

  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  headGroup.add(headMesh);

  // Hair cap
  const hairMesh = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.52), hairMat);
  hairMesh.position.set(0, 0.20, 0);
  headGroup.add(hairMesh);

  // Hair back (Steve dark brown hair on back of head)
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.12), hairMat);
  hairBack.name = 'hairBack';
  hairBack.position.set(0, 0.08, 0.21);
  headGroup.add(hairBack);

  // Eyes on face (-Z)
  const leftEyeW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeWhiteMat);
  leftEyeW.name = 'leftEyeW';
  leftEyeW.position.set(-0.12, 0.02, -0.26);
  headGroup.add(leftEyeW);
  const leftEyeP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.025), eyePupilMat);
  leftEyeP.name = 'leftEyeP';
  leftEyeP.position.set(-0.10, 0.02, -0.262);
  headGroup.add(leftEyeP);

  const rightEyeW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.02), eyeWhiteMat);
  rightEyeW.name = 'rightEyeW';
  rightEyeW.position.set(0.12, 0.02, -0.26);
  headGroup.add(rightEyeW);
  const rightEyeP = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.025), eyePupilMat);
  rightEyeP.name = 'rightEyeP';
  rightEyeP.position.set(0.10, 0.02, -0.262);
  headGroup.add(rightEyeP);

  group.add(headGroup);

  // 2. Torso (0.5 x 0.75 x 0.25)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), shirtMat);
  torso.position.set(0, 0.85, 0);
  group.add(torso);

  // 3. Left Arm (Pivoting at shoulder)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.38, 1.15, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), shirtMat);
  leftArmMesh.position.set(0, -0.32, 0);
  leftArmGroup.add(leftArmMesh);
  group.add(leftArmGroup);

  // 4. Right Arm (Pivoting at shoulder)
  const rightArmGroup = new THREE.Group();
  rightArmGroup.position.set(0.38, 1.15, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), shirtMat);
  rightArmMesh.position.set(0, -0.32, 0);
  rightArmGroup.add(rightArmMesh);

  // Hand item slot (forward along -Z)
  const handSlot = new THREE.Group();
  handSlot.position.set(0, -0.65, -0.15);
  rightArmGroup.add(handSlot);

  group.add(rightArmGroup);

  // 5. Left Leg (Pivoting at hip)
  const leftLegGroup = new THREE.Group();
  leftLegGroup.position.set(-0.13, 0.48, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.72, 0.23), pantsMat);
  leftLegMesh.position.set(0, -0.36, 0);
  leftLegGroup.add(leftLegMesh);
  group.add(leftLegGroup);

  // 6. Right Leg (Pivoting at hip)
  const rightLegGroup = new THREE.Group();
  rightLegGroup.position.set(0.13, 0.48, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.72, 0.23), pantsMat);
  rightLegMesh.position.set(0, -0.36, 0);
  rightLegGroup.add(rightLegMesh);
  group.add(rightLegGroup);

  // 7. Floating Billboard Nametag
  const nametag = createNametagSprite(name, isHost);
  nametag.position.set(0, 2.05, 0);
  group.add(nametag);

  return {
    mesh: group,
    head: headGroup,
    torso,
    leftArm: leftArmGroup,
    rightArm: rightArmGroup,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup,
    handSlot,
    nametag
  };
}

export class RemotePlayerManager {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.remotePlayers = new Map(); // peerId -> { peerId, name, avatar, targetPos, currentPos, targetYaw, targetPitch, ... }
  }

  addPeer(peerId, name, isHost = false) {
    if (this.remotePlayers.has(peerId)) {
      this.removePeer(peerId);
    }

    const avatar = createPlayerAvatar(name, isHost);
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
      lastMoveTime: Date.now()
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
    this.remotePlayers.delete(peerId);
  }

  updatePeerState(peerId, state) {
    let peer = this.remotePlayers.get(peerId);
    if (!peer) {
      peer = this.addPeer(peerId, state.playerName || 'Player', !!state.isHost);
    }

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
  }

  updateHeldItem(peer, activeItem) {
    if (!peer?.avatar?.handSlot) return;
    const handSlot = peer.avatar.handSlot;

    // Check if item changed
    const itemId = activeItem?.id || (typeof activeItem === 'string' ? activeItem : null);
    if (peer.heldItemBlockId === itemId) return;
    peer.heldItemBlockId = itemId;

    // Remove existing held item
    while (handSlot.children.length > 0) {
      handSlot.remove(handSlot.children[0]);
    }

    if (!itemId) return;

    // Create mini voxel item cube for held item
    const miniGeo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
    const miniMat = new THREE.MeshLambertMaterial({ color: 0x854d0e });
    const itemMesh = new THREE.Mesh(miniGeo, miniMat);
    itemMesh.rotation.set(0.4, 0.4, 0);
    handSlot.add(itemMesh);
    peer.heldItemMesh = itemMesh;
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
          if (!mat?.color || mat === peer.avatar.nametag?.material) continue;
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
    }
  }

  /**
   * The other player the crosshair is on, if any: a ray from the eyes against each avatar's box (a player is 0.6 wide
   * and 1.8 tall, 1.5 sneaking, standing on its position), nearest first. Java tests the exact box -- a player's pick
   * radius is 0 -- and from the eyes in third person too, so neither margin nor camera ray is added here.
   * @returns {{peerId: string, name: string, distance: number}|null}
   */
  pickPlayer(origin, direction, maxDistance) {
    let best = null;
    const o = [origin.x, origin.y, origin.z], d = [direction.x, direction.y, direction.z];
    for (const peer of this.remotePlayers.values()) {
      const p = peer.currentPos;
      const min = [p.x - 0.3, p.y, p.z - 0.3], max = [p.x + 0.3, p.y + (peer.isSneaking ? 1.5 : 1.8), p.z + 0.3];
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
  }
}
