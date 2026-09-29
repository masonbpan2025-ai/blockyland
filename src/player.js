import * as THREE from 'three';
import { waterHeight, waterCurrent } from './waterGeometry.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export class Player {
  constructor(camera, domElement, world, soundEngine) {
    this.camera = camera;
    this.domElement = domElement;
    this.world = world;
    this.sounds = soundEngine;

    // Position & Dimensions (Spawns on village pathway facing the cottage and mobs)
    this.position = new THREE.Vector3(1.5, 27.0, -1.5);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.width = 0.6;
    this.height = 1.8;
    this.eyeHeight = 1.62;

    // State
    this.onGround = false;
    this.inWater = false;
    this.isSneaking = false;
    this.isSprinting = false;
    this.isFlying = false;
    this.gamemode = 'creative'; // 'creative' | 'survival'
    this.perspective = 0; // 0: 1st person, 1: 3rd person back, 2: 3rd person front

    // Stats
    this.health = 20;
    this.maxHealth = 20;
    this.hunger = 20;
    this.maxHunger = 20;
    this.exp = 0;
    this.level = 0;
    this.invulnerableTimer = 0;

    // Movement speeds (blocks/sec)
    this.walkSpeed = 4.3;
    this.sprintSpeed = 5.6;
    this.sneakSpeed = 1.3;
    this.flySpeed = 11.0;
    this.jumpForce = 8.6;
    this.gravity = 28.0;

    // Camera Rotation (facing positive Z towards village and mobs)
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.baseFov = 70;
    this.currentFov = 70;

    // Input state
    this.keys = {};
    this.lastSpacePress = 0;
    this.stepDistance = 0;

    // 3D Player Mesh (shown in 3rd person and inventory preview)
    this.model = this.createPlayerModel();

    // Dragon Ball Ki Gathering state
    this.isGatheringKi = false;
    this.onKiInterrupted = null;

    // Minecraft Dungeons mode & combat states
    this.isDungeonMode = false;
    this.dungeonCameraOffset = new THREE.Vector3(0, 14.5, 12.0);

    // Dodge Roll state (Key N)
    this.isRolling = false;
    this.rollTimer = 0;
    this.rollDuration = 0.35;
    this.rollCooldown = 0;
    this.maxRollCooldown = 1.0;
    this.rollDirection = new THREE.Vector3(0, 0, -1);
    this.onRoll = null;

    // Punch state (Key U)
    this.isPunching = false;
    this.punchTimer = 0;
    this.punchDuration = 0.22;
    this.punchCooldown = 0;
    this.onPunch = null;

    this.setupInputs();
  }

  setupInputs() {
    if (typeof window === 'undefined') return;
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;

      // Double tap space to toggle creative flight
      if (e.code === 'Space') {
        const now = performance.now();
        if (now - this.lastSpacePress < 280) {
          if (this.gamemode === 'creative') {
            this.isFlying = !this.isFlying;
            this.velocity.y = 0;
          }
        }
        this.lastSpacePress = now;
      }

      // F5: Toggle perspective
      if (e.code === 'F5') {
        e.preventDefault();
        this.perspective = (this.perspective + 1) % 3;
      }

      // U: Punch Attack
      if ((e.code === 'KeyU' || e.key === 'u' || e.key === 'U') && !e.repeat) {
        if (!e.target?.tagName?.match(/INPUT|TEXTAREA/)) {
          this.triggerPunch();
        }
      }

      // N: Dodge Roll
      if (e.code === 'KeyN' && !e.repeat) {
        if (!e.target?.tagName?.match(/INPUT|TEXTAREA/)) {
          this.triggerDodgeRoll();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isDungeonMode) return; // In Dungeon Top-Down mode, facing is controlled by movement
      if (document.pointerLockElement !== this.domElement) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      // Clamp pitch to avoid neck snapping (-89 to +89 degrees)
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });
  }

  triggerPunch() {
    if (this.isPunching || this.punchCooldown > 0 || this.isGatheringKi) return false;
    this.isPunching = true;
    this.punchTimer = this.punchDuration;
    this.punchCooldown = 0.28;
    this.sounds?.playPunch?.();
    if (this.game?.heldItemRenderer && this.perspective === 0 && !this.isDungeonMode) {
      this.game.heldItemRenderer.swing();
    }
    if (this.onPunch) this.onPunch();
    return true;
  }

  triggerDodgeRoll() {
    if (this.isRolling || this.rollCooldown > 0 || this.isGatheringKi) return false;
    this.isRolling = true;
    this.rollTimer = this.rollDuration;
    this.rollCooldown = this.maxRollCooldown;
    this.invulnerableTimer = 0.38;

    const rollDir = new THREE.Vector3();
    if (this.isDungeonMode) {
      if (this.keys['KeyW']) rollDir.z -= 1;
      if (this.keys['KeyS']) rollDir.z += 1;
      if (this.keys['KeyA']) rollDir.x -= 1;
      if (this.keys['KeyD']) rollDir.x += 1;
    } else {
      let moveForward = 0;
      let moveRight = 0;
      if (this.keys['KeyW']) moveForward += 1;
      if (this.keys['KeyS']) moveForward -= 1;
      if (this.keys['KeyD']) moveRight += 1;
      if (this.keys['KeyA']) moveRight -= 1;
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
      if (moveForward !== 0 || moveRight !== 0) {
        rollDir.addScaledVector(forward, moveForward);
        rollDir.addScaledVector(right, moveRight);
      }
    }

    if (rollDir.lengthSq() < 0.001) {
      rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    }
    rollDir.normalize();
    this.rollDirection.copy(rollDir);

    if (this.onRoll) this.onRoll();
    return true;
  }

  createPlayerModel() {
    const group = new THREE.Group();

    // Material with Steve-like colors
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xdbb494 });
    const blueShirtMat = new THREE.MeshLambertMaterial({ color: 0x0080aa });
    const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2b398a });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x4a2a18 });

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
    head.position.y = 1.5;
    group.add(head);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), blueShirtMat);
    torso.position.y = 0.9;
    group.add(torso);

    // Left Arm (Shoulder Pivot Group)
    const leftArm = new THREE.Group();
    leftArm.position.set(-0.38, 1.25, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), skinMat);
    leftArmMesh.position.set(0, -0.375, 0);
    leftArm.add(leftArmMesh);
    group.add(leftArm);

    // Right Arm (Shoulder Pivot Group)
    const rightArm = new THREE.Group();
    rightArm.position.set(0.38, 1.25, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), skinMat);
    rightArmMesh.position.set(0, -0.375, 0);
    rightArm.add(rightArmMesh);
    group.add(rightArm);

    // Left Leg (Hip Pivot Group)
    const leftLeg = new THREE.Group();
    leftLeg.position.set(-0.13, 0.75, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pantsMat);
    leftLegMesh.position.set(0, -0.375, 0);
    leftLeg.add(leftLegMesh);
    group.add(leftLeg);

    // Right Leg (Hip Pivot Group)
    const rightLeg = new THREE.Group();
    rightLeg.position.set(0.13, 0.75, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pantsMat);
    rightLegMesh.position.set(0, -0.375, 0);
    rightLeg.add(rightLegMesh);
    group.add(rightLeg);

    group.head = head;
    group.torso = torso;
    group.leftArm = leftArm;
    group.rightArm = rightArm;
    group.leftLeg = leftLeg;
    group.rightLeg = rightLeg;

    return group;
  }

  isBlockSolid(x, y, z) {
    const b = this.world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z));
    if (b === BLOCKS.AIR || b === BLOCKS.WATER) return false;
    const def = BLOCK_DEFS[b];
    return def && def.solid !== false && !def.plant;
  }

  checkCollision(pos) {
    const hw = this.width / 2;
    const minX = Math.floor(pos.x - hw);
    const maxX = Math.floor(pos.x + hw);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + (this.isSneaking ? 1.5 : this.height));
    const minZ = Math.floor(pos.z - hw);
    const maxZ = Math.floor(pos.z + hw);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (this.isBlockSolid(x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  update(dt) {
    if (dt > 0.1) dt = 0.1; // clamp delta to prevent tunneling

    // Invulnerability timer countdown
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    // Cooldown countdowns
    if (this.rollCooldown > 0) this.rollCooldown = Math.max(0, this.rollCooldown - dt);
    if (this.punchCooldown > 0) this.punchCooldown = Math.max(0, this.punchCooldown - dt);
    if (this.punchTimer > 0) {
      this.punchTimer = Math.max(0, this.punchTimer - dt);
      if (this.punchTimer <= 0) {
        this.isPunching = false;
      }
    }

    // If rolling (Dodge Roll), override horizontal movement with roll impulse
    if (this.isRolling) {
      this.rollTimer -= dt;
      const rollSpeed = 14.5;
      this.velocity.x = this.rollDirection.x * rollSpeed;
      this.velocity.z = this.rollDirection.z * rollSpeed;
      if (this.rollTimer <= 0) {
        this.isRolling = false;
      }
      this.moveWithCollision(dt);
      this.updateCameraAndModel(dt);
      return;
    }

    // Check if player is standing in water
    const blockAtFeet = this.world.getVoxel(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
    this.inWater = blockAtFeet === BLOCKS.WATER && this.position.y % 1 < waterHeight(this.world, Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));

    // Determine current speed mode
    this.isSneaking = !!this.keys['ShiftLeft'];
    this.isSprinting = !!this.keys['ControlLeft'] && !this.isSneaking;

    let targetSpeed = this.walkSpeed;
    if (this.isFlying) targetSpeed = this.flySpeed;
    else if (this.isSprinting) targetSpeed = this.sprintSpeed;
    else if (this.isSneaking) targetSpeed = this.sneakSpeed;
    else if (this.inWater) targetSpeed = this.walkSpeed * 0.65;

    // Movement direction input
    let moveForward = 0;
    let moveRight = 0;
    if (this.keys['KeyW']) moveForward += 1;
    if (this.keys['KeyS']) moveForward -= 1;
    if (this.keys['KeyD']) moveRight += 1;
    if (this.keys['KeyA']) moveRight -= 1;

    // Calculate forward/right vectors based on Yaw
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();

    // If gathering Ki, player is frozen in place and cannot move or jump
    if (this.isGatheringKi) {
      this.velocity.x = 0;
      this.velocity.z = 0;
      if (!this.isFlying) {
        this.velocity.y -= this.gravity * dt;
        if (this.velocity.y < -78) this.velocity.y = -78;
      }
      this.moveWithCollision(dt);
      return;
    }

    const moveDir = new THREE.Vector3();
    if (this.isDungeonMode) {
      // Minecraft Dungeons WASD cardinal direction control
      if (this.keys['KeyW']) moveDir.z -= 1;
      if (this.keys['KeyS']) moveDir.z += 1;
      if (this.keys['KeyA']) moveDir.x -= 1;
      if (this.keys['KeyD']) moveDir.x += 1;

      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();
        this.yaw = Math.atan2(-moveDir.x, -moveDir.z);
      }
    } else {
      if (moveForward !== 0 || moveRight !== 0) {
        moveDir.addScaledVector(forward, moveForward);
        moveDir.addScaledVector(right, moveRight);
        moveDir.normalize();
      }
    }

    // Horizontal acceleration
    const accel = this.onGround ? 12.0 : 4.0;
    const current = this.inWater && !this.isFlying ? waterCurrent(this.world, Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z)) : {x:0,y:0,z:0};
    const targetVx = moveDir.x * targetSpeed + current.x * 0.65;
    const targetVz = moveDir.z * targetSpeed + current.z * 0.65;

    this.velocity.x += (targetVx - this.velocity.x) * Math.min(1.0, accel * dt);
    this.velocity.z += (targetVz - this.velocity.z) * Math.min(1.0, accel * dt);

    // Vertical Movement (Gravity & Jump)
    if (this.isFlying) {
      this.velocity.y = 0;
      if (this.keys['Space']) this.velocity.y = this.flySpeed * 0.7;
      if (this.keys['ShiftLeft']) this.velocity.y = -this.flySpeed * 0.7;
    } else if (this.inWater) {
      this.velocity.y -= this.gravity * 0.2 * dt;
      if (this.velocity.y < -3.0) this.velocity.y = -3.0;
      if (this.keys['Space']) {
        this.velocity.y = 4.0; // swim upwards
      }
    } else {
      // Normal Gravity
      this.velocity.y -= this.gravity * dt;
      if (this.velocity.y < -78) this.velocity.y = -78;

      if (this.onGround && this.keys['Space']) {
        this.velocity.y = this.jumpForce;
        this.onGround = false;
        this.sounds.playStep(this.getBlockBelowSound());
      }
    }

    // Apply movement with 3-axis AABB collision
    this.moveWithCollision(dt);

    // Footstep audio
    const horizDist = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z) * dt;
    if (this.onGround && horizDist > 0.001) {
      this.stepDistance += horizDist;
      const stepThreshold = this.isSprinting ? 2.0 : 2.5;
      if (this.stepDistance >= stepThreshold) {
        this.sounds.playStep(this.getBlockBelowSound());
        this.stepDistance = 0;
      }
    }

    // FOV animation for sprinting
    const targetFov = this.isSprinting && (moveForward > 0) ? 82 : this.baseFov;
    this.currentFov += (targetFov - this.currentFov) * 8 * dt;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    // Natural regeneration in survival
    if (this.gamemode === 'survival') {
      if (this.hunger >= 18 && this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + dt * 0.3);
      }
      if (this.position.y < -10) {
        this.takeDamage(10);
        this.position.set(8.5, 35, 8.5);
        this.velocity.set(0, 0, 0);
      }
    }

    // Update 3D Camera & Player Model Position
    this.updateCameraAndModel(dt);
  }

  moveWithCollision(dt) {
    const oldPos = this.position.clone();
    const newPos = this.position.clone();

    // 1. Move X
    newPos.x += this.velocity.x * dt;
    if (this.isSneaking && this.onGround && !this.hasGroundAhead(newPos.x, this.position.z)) {
      newPos.x = oldPos.x;
      this.velocity.x = 0;
    } else if (this.checkCollision(newPos)) {
      // Try step climbing (half block / full block step up)
      const stepPos = newPos.clone();
      stepPos.y += 1.05;
      if (this.onGround && !this.checkCollision(stepPos)) {
        newPos.y += 1.05;
      } else {
        newPos.x = oldPos.x;
        this.velocity.x = 0;
      }
    }

    // 2. Move Z
    newPos.z += this.velocity.z * dt;
    if (this.isSneaking && this.onGround && !this.hasGroundAhead(newPos.x, newPos.z)) {
      newPos.z = oldPos.z;
      this.velocity.z = 0;
    } else if (this.checkCollision(newPos)) {
      // Try step climbing
      const stepPos = newPos.clone();
      stepPos.y += 1.05;
      if (this.onGround && !this.checkCollision(stepPos)) {
        newPos.y += 1.05;
      } else {
        newPos.z = oldPos.z;
        this.velocity.z = 0;
      }
    }

    // 3. Move Y
    newPos.y += this.velocity.y * dt;
    this.onGround = false;
    if (this.checkCollision(newPos)) {
      if (this.velocity.y < 0) {
        this.onGround = true;
        // Snap to top of block
        newPos.y = Math.ceil(newPos.y);
      } else {
        // Bump head
        newPos.y = Math.floor(newPos.y + (this.isSneaking ? 1.5 : this.height)) - (this.isSneaking ? 1.5 : this.height);
      }
      this.velocity.y = 0;
    }

    this.position.copy(newPos);
  }

  hasGroundAhead(x, z) {
    const yBelow = Math.floor(this.position.y - 0.2);
    return this.isBlockSolid(x, yBelow, z);
  }

  getBlockBelowSound() {
    const blockBelow = this.world.getVoxel(Math.floor(this.position.x), Math.floor(this.position.y - 0.5), Math.floor(this.position.z));
    const def = BLOCK_DEFS[blockBelow];
    return (def && def.sound) ? def.sound : 'grass';
  }

  takeDamage(amount) {
    if (this.gamemode === 'creative') return;
    if (this.invulnerableTimer > 0) return;

    // Critical counter-hit: taking damage while gathering Ki cancels skill and deals 1.5x damage
    if (this.isGatheringKi) {
      amount = Math.round(amount * 1.5);
      this.isGatheringKi = false;
      if (this.onKiInterrupted) {
        this.onKiInterrupted();
      }
    }

    this.health = Math.max(0, this.health - amount);
    this.invulnerableTimer = 0.5;
    this.sounds.playHurt();

    // Damage red flash indicator
    if (typeof document !== 'undefined') {
      const canvas = document.getElementById('canvas-container');
      if (canvas) {
        canvas.style.filter = 'sepia(1) saturate(5) hue-rotate(-50deg)';
        setTimeout(() => { canvas.style.filter = 'none'; }, 150);
      }
    }
  }

  updateCameraAndModel(dt) {
    const eyeY = this.position.y + (this.isSneaking ? 1.38 : this.eyeHeight);

    // Animate 3D Model limbs
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;

      if (this.isRolling) {
        // Full 360 forward flip roll animation
        const rollProgress = Math.max(0, Math.min(1.0, 1.0 - (this.rollTimer / this.rollDuration)));
        this.model.rotation.x = rollProgress * Math.PI * 2;
        this.model.leftLeg.rotation.x = -1.2;
        this.model.rightLeg.rotation.x = -1.2;
        this.model.leftArm.rotation.x = 1.5;
        this.model.rightArm.rotation.x = 1.5;
        this.model.head.rotation.x = 0;
      } else {
        this.model.rotation.x = 0;
        const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
        const walkTime = performance.now() * 0.008;
        const legSwing = Math.sin(walkTime) * Math.min(1.0, speed * 0.3);

        this.model.leftLeg.rotation.x = legSwing;
        this.model.rightLeg.rotation.x = -legSwing;
        // Punch arm forward thrust animation
        if (this.isPunching && this.punchTimer > 0) {
          const punchProg = Math.sin((1.0 - this.punchTimer / this.punchDuration) * Math.PI);
          // Torso rotates into punch
          if (this.model.torso) this.model.torso.rotation.y = -0.4 * punchProg;
          // Right arm raises horizontally and punches forward from shoulder
          this.model.rightArm.rotation.x = -Math.PI / 2 - 0.25 * punchProg;
          this.model.rightArm.rotation.y = -0.25 * punchProg;
          this.model.rightArm.position.set(0.38, 1.25, -0.6 * punchProg);
          // Left arm raises into martial arts guard stance
          this.model.leftArm.rotation.x = -0.8 * punchProg;
          this.model.leftArm.position.set(-0.38, 1.25, 0.25 * punchProg);
        } else {
          if (this.model.torso) this.model.torso.rotation.y = 0;
          this.model.leftArm.rotation.x = -legSwing;
          this.model.rightArm.rotation.x = legSwing;
          this.model.leftArm.rotation.y = 0;
          this.model.rightArm.rotation.y = 0;
          this.model.leftArm.position.set(-0.38, 1.25, 0);
          this.model.rightArm.position.set(0.38, 1.25, 0);
        }

        this.model.head.rotation.x = this.isDungeonMode ? 0 : this.pitch;
      }

      // Hide model in 1st person UNLESS in Dungeon Mode
      this.model.visible = (this.perspective !== 0 || this.isDungeonMode);
    }

    // Position Camera based on Dungeon Mode or perspective
    if (this.isDungeonMode) {
      // Minecraft Dungeons Style Top-Down Isometric View
      const targetCamPos = this.position.clone().add(this.dungeonCameraOffset);
      this.camera.position.lerp(targetCamPos, Math.min(1.0, 8.0 * (dt || 0.016)));
      this.camera.lookAt(this.position.x, this.position.y + 0.8, this.position.z);
    } else if (this.perspective === 0) {
      // 1st Person
      this.camera.position.set(this.position.x, eyeY, this.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw;
      this.camera.rotation.x = this.pitch;
    } else if (this.perspective === 1) {
      // 3rd Person Back
      const dist = 3.5;
      const cx = this.position.x + Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
      const cy = eyeY + Math.sin(this.pitch) * dist;
      const cz = this.position.z + Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(this.position.x, eyeY, this.position.z);
    } else if (this.perspective === 2) {
      // 3rd Person Front (Selfie)
      const dist = 3.5;
      const cx = this.position.x - Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
      const cy = eyeY + Math.sin(this.pitch) * dist;
      const cz = this.position.z - Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(this.position.x, eyeY, this.position.z);
    }
  }
}
