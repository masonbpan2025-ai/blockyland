import * as THREE from 'three';
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
    this.gamemode = 'survival'; // 'survival' | 'creative'
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

    this.setupInputs();
  }

  setupInputs() {
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
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.domElement) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;

      // Clamp pitch to avoid neck snapping (-89 to +89 degrees)
      const maxPitch = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
    });
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

    // Left Arm
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), skinMat);
    leftArm.position.set(-0.38, 0.9, 0);
    group.add(leftArm);

    // Right Arm
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), skinMat);
    rightArm.position.set(0.38, 0.9, 0);
    group.add(rightArm);

    // Left Leg
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pantsMat);
    leftLeg.position.set(-0.13, 0.38, 0);
    group.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.75, 0.24), pantsMat);
    rightLeg.position.set(0.13, 0.38, 0);
    group.add(rightLeg);

    group.head = head;
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

    // Check if player is standing in water
    const blockAtFeet = this.world.getVoxel(Math.floor(this.position.x), Math.floor(this.position.y), Math.floor(this.position.z));
    this.inWater = (blockAtFeet === BLOCKS.WATER);

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

    const moveDir = new THREE.Vector3();
    if (moveForward !== 0 || moveRight !== 0) {
      moveDir.addScaledVector(forward, moveForward);
      moveDir.addScaledVector(right, moveRight);
      moveDir.normalize();
    }

    // Horizontal acceleration
    const accel = this.onGround ? 12.0 : 4.0;
    const targetVx = moveDir.x * targetSpeed;
    const targetVz = moveDir.z * targetSpeed;

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

    this.health = Math.max(0, this.health - amount);
    this.invulnerableTimer = 0.5;
    this.sounds.playHurt();

    // Damage red flash indicator
    const canvas = document.getElementById('canvas-container');
    if (canvas) {
      canvas.style.filter = 'sepia(1) saturate(5) hue-rotate(-50deg)';
      setTimeout(() => { canvas.style.filter = 'none'; }, 150);
    }
  }

  updateCameraAndModel(dt) {
    const eyeY = this.position.y + (this.isSneaking ? 1.38 : this.eyeHeight);

    // Animate 3D Model limbs
    if (this.model) {
      this.model.position.copy(this.position);
      this.model.rotation.y = this.yaw;

      const speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
      const walkTime = performance.now() * 0.008;
      const legSwing = Math.sin(walkTime) * Math.min(1.0, speed * 0.3);

      this.model.leftLeg.rotation.x = legSwing;
      this.model.rightLeg.rotation.x = -legSwing;
      this.model.leftArm.rotation.x = -legSwing;
      this.model.rightArm.rotation.x = legSwing;
      this.model.head.rotation.x = this.pitch;

      // Hide model in 1st person
      this.model.visible = (this.perspective !== 0);
    }

    // Position Camera based on perspective
    if (this.perspective === 0) {
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
