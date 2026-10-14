import * as THREE from 'three';
import { createBoxWithUV } from '../../mobs.js';

// Bound to a manager instance only while this mod is loaded.
export const mobMethods = {
  createHostTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Default dark base
    ctx.fillStyle = '#1c1c1f';
    ctx.fillRect(0, 0, 64, 64);

    // 1. Head (0,0) to (32, 16)
    // Blonde swept-back hair on top, back, sides
    ctx.fillStyle = '#f0c74d';
    ctx.fillRect(0, 0, 32, 16);
    // Face (8, 8, 8, 8)
    // Skin tone
    ctx.fillStyle = '#f8c29d';
    ctx.fillRect(8, 8, 8, 8);
    // Hair bangs
    ctx.fillStyle = '#e5b83b';
    ctx.fillRect(8, 8, 8, 2);
    // Iconic black sunglasses across eyes
    ctx.fillStyle = '#111111';
    ctx.fillRect(8, 10, 8, 3);
    // Glass reflection white glints
    ctx.fillStyle = '#777777';
    ctx.fillRect(10, 10, 1, 1);
    ctx.fillRect(14, 10, 1, 1);
    // Confident announcer smile
    ctx.fillStyle = '#b36d52';
    ctx.fillRect(10, 14, 4, 1);

    // 2. Torso (16, 16, 24, 16)
    // Black tailored suit jacket
    ctx.fillStyle = '#141416';
    ctx.fillRect(16, 16, 24, 16);
    // White shirt collar V
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(22, 20, 4, 3);
    // Bright red tournament tie
    ctx.fillStyle = '#d31b1b';
    ctx.fillRect(23, 21, 2, 8);
    // Gold tie clip
    ctx.fillStyle = '#f5c842';
    ctx.fillRect(23, 25, 2, 1);

    // 3. Legs & Arms
    // Suit pants & sleeves
    ctx.fillStyle = '#18181a';
    ctx.fillRect(0, 16, 16, 32);
    ctx.fillRect(40, 16, 16, 32);
    // Hands
    ctx.fillStyle = '#f8c29d';
    ctx.fillRect(44, 28, 4, 4);
    // Shoes
    ctx.fillStyle = '#080808';
    ctx.fillRect(4, 28, 4, 4);
    ctx.fillRect(12, 28, 4, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },
  createTrainerTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Orange Gi Base
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(0, 0, 64, 64);

    // Head (0,0, 32, 16)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 32, 16);
    // Face (8, 8, 8, 8)
    ctx.fillStyle = '#f8c29d';
    ctx.fillRect(8, 8, 8, 8);
    // Eyes & bushy eyebrows
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(9, 10, 2, 1);
    ctx.fillRect(13, 10, 2, 1);
    // White beard / mustache
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(10, 13, 4, 3);

    // Torso (16, 16, 24, 16)
    ctx.fillStyle = '#ea580c'; // Orange Gi
    ctx.fillRect(16, 16, 24, 16);
    // Dark Blue Undershirt V
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(22, 20, 4, 4);
    // Martial Arts Circular Kanji Badge on Chest
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(22, 23, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111111';
    ctx.fillRect(21, 22, 2, 2);
    // Dark Blue Belt / Sash at waist
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(16, 28, 24, 4);

    // Arms: Orange sleeves with blue wristbands
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(40, 16, 16, 32);
    ctx.fillStyle = '#1d4ed8'; // blue wristbands
    ctx.fillRect(40, 26, 16, 2);
    ctx.fillStyle = '#f8c29d'; // skin hands
    ctx.fillRect(44, 28, 4, 4);

    // Legs: Orange pants with dark boots
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(0, 16, 16, 32);
    ctx.fillStyle = '#111111'; // black martial shoes
    ctx.fillRect(4, 28, 4, 4);
    ctx.fillRect(12, 28, 4, 4);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },
  createJackieChunTexture() {
    if (typeof document === 'undefined') return new THREE.Texture();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // 1. Dark navy kung fu changshan robe base
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 64, 64);

    // 2. Head (0,0 to 32,16)
    // Bald tan head top and back
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(0, 0, 32, 16);
    // White hair side puffs (ears and back)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 8, 8, 8); // Right side hair
    ctx.fillRect(16, 8, 8, 8); // Left side hair
    ctx.fillRect(24, 8, 8, 8); // Back hair

    // Face front (8, 8, 8, 8)
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(8, 8, 8, 8);
    // Dark sunglasses across face
    ctx.fillStyle = '#090d16';
    ctx.fillRect(8, 9, 8, 3);
    // Sunglasses white glint reflection
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(9, 9, 1, 1);
    ctx.fillRect(13, 9, 1, 1);
    // Thick bushy white mustache below sunglasses
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 12, 8, 2);
    // White beard goatee extending to chin
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(10, 14, 4, 2);

    // 3. Torso (16, 16, 24, 16)
    // Dark kung fu jacket
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(16, 16, 24, 16);
    // White center seam & button closures
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(23, 16, 2, 16);
    // White sash around waist
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(16, 28, 24, 4);

    // 4. Arms & Legs
    // Sleeves with bold white cuffs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(40, 16, 16, 32);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 26, 16, 6); // Cuffs
    // Tan bare hands
    ctx.fillStyle = '#f5cba7';
    ctx.fillRect(44, 28, 4, 4);

    // Kung fu trousers (navy) and black kung fu slippers with white socks
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 16, 16, 32);
    // White ankle socks
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 42, 16, 3);
    // Black martial arts slippers
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 45, 16, 3);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  },
  spawnTournamentHost(x, y, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.tournament_host || this.textures.villager,
      transparent: true,
      alphaTest: 0.1
    });

    // Head (8x8x8)
    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    // Torso (8x12x4)
    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.25, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    // Left Arm (at side)
    const armGeo = createBoxWithUV(0.22, 0.75, 0.22, 40, 16, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.37, 0.75, 0);
    group.add(leftArm);

    // Right Arm (holding microphone up)
    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.37, 0.75, 0);
    rightArm.rotation.x = -Math.PI / 3;
    rightArm.rotation.z = -0.12;
    group.add(rightArm);

    // Microphone in hand
    const micGroup = new THREE.Group();
    const micHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.24, 6),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    micHandle.position.y = 0.1;
    micGroup.add(micHandle);

    const micHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xc8c8c8 })
    );
    micHead.position.y = 0.22;
    micGroup.add(micHead);

    micGroup.position.set(0, -0.38, 0.08);
    micGroup.rotation.x = Math.PI / 2.2;
    rightArm.add(micGroup);

    // Legs
    const legGeo = createBoxWithUV(0.24, 0.75, 0.24, 0, 16, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.13, 0.38, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.13, 0.38, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'tournament_host',
      contentId: 'dragonball_tournament:tournament_host',
      modId: 'dragonball_tournament',
      name: 'Tournament Announcer',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 100,
      maxHealth: 100,
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'host',
      timer: 0,
      hitCooldown: 0,
      noLoot: true
    };
    this.mobs.push(mob);
    return mob;
  },
  spawnSiteManager(x, y, z, siteInfo = {}) {
    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.site_manager || this.textures.villager,
      transparent: true,
      alphaTest: 0.1
    });

    const headGeo = createBoxWithUV(0.5, 0.5, 0.5, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.35;
    group.add(head);

    const torsoGeo = createBoxWithUV(0.5, 0.75, 0.25, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.75;
    group.add(torso);

    const armGeo = createBoxWithUV(0.22, 0.75, 0.22, 40, 16, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.37, 0.75, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.37, 0.75, 0);
    group.add(rightArm);

    const legGeo = createBoxWithUV(0.24, 0.75, 0.24, 0, 16, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.13, 0.38, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.13, 0.38, 0);
    group.add(rightLeg);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    const mob = {
      type: 'site_manager',
      contentId: 'dragonball_tournament:site_manager',
      modId: 'dragonball_tournament',
      siteId: siteInfo.id || 'general',
      name: siteInfo.managerName || 'Training Site Master',
      role: siteInfo.managerRole || 'Instructor',
      dialogue: siteInfo.dialogue || '',
      mesh: group,
      head: head,
      leftArm: leftArm,
      rightArm: rightArm,
      leftLeg: leftLeg,
      rightLeg: rightLeg,
      mat: mat,
      health: 100,
      maxHealth: 100,
      velocity: new THREE.Vector3(),
      yaw: 0,
      state: 'trainer',
      timer: 0,
      hitCooldown: 0,
      noLoot: true
    };
    this.mobs.push(mob);
    return mob;
  },
  spawnJackieChun(x, y, z, options = {}) {
    const difficulty = options.difficulty || 'normal';
    const isClone = !!options.isClone;
    const isPlayerControlled = !!options.isPlayerControlled;

    const group = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      map: this.textures.jackie_chun || this.createJackieChunTexture(),
      transparent: true,
      alphaTest: 0.1
    });

    // Master Roshi / Jackie Chun dimensions:
    // Head: 0.44 x 0.44 x 0.44
    const headGeo = createBoxWithUV(0.44, 0.44, 0.44, 0, 0, 64, 64, 8, 8, 8);
    const head = new THREE.Mesh(headGeo, mat);
    head.position.y = 1.48;
    group.add(head);

    // 3D Sunglasses Frame across front of head
    const glassesMat = new THREE.MeshBasicMaterial({ color: 0x090d16 });
    const glassesMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.06), glassesMat);
    glassesMesh.position.set(0, 0.03, 0.23);
    head.add(glassesMesh);

    // Gold temples on sides of glasses
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    const templeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), goldMat);
    templeL.position.set(-0.23, 0.03, 0.12);
    head.add(templeL);
    const templeR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), goldMat);
    templeR.position.set(0.23, 0.03, 0.12);
    head.add(templeR);

    // 3D Bushy White Mustache
    const hairMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mustache = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.08), hairMat);
    mustache.position.set(0, -0.06, 0.24);
    head.add(mustache);

    // 3D White Goatee Beard
    const beard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.08), hairMat);
    beard.position.set(0, -0.16, 0.23);
    head.add(beard);

    // White Hair side puffs
    const hairPuffL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.24), hairMat);
    hairPuffL.position.set(-0.23, -0.02, 0);
    head.add(hairPuffL);
    const hairPuffR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.24), hairMat);
    hairPuffR.position.set(0.23, -0.02, 0);
    head.add(hairPuffR);

    // Torso: 0.44 x 0.62 x 0.24
    const torsoGeo = createBoxWithUV(0.44, 0.62, 0.24, 16, 16, 64, 64, 8, 12, 4);
    const torso = new THREE.Mesh(torsoGeo, mat);
    torso.position.y = 0.98;
    group.add(torso);

    // Arms: 0.16 x 0.62 x 0.16
    const armGeo = createBoxWithUV(0.16, 0.62, 0.16, 40, 16, 64, 64, 4, 12, 4);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.31, 0.98, 0);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.31, 0.98, 0);
    group.add(rightArm);

    // Legs: 0.18 x 0.68 x 0.18
    const legGeo = createBoxWithUV(0.18, 0.68, 0.18, 0, 16, 64, 64, 4, 12, 4);
    const leftLeg = new THREE.Mesh(legGeo, mat);
    leftLeg.position.set(-0.11, 0.34, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, mat);
    rightLeg.position.set(0.11, 0.34, 0);
    group.add(rightLeg);

    // If clone, slight ethereal shimmer
    if (isClone) {
      mat.opacity = 0.88;
    }
    // 3D Luminous Ki Aura (Martial Arts Energy Field around Jackie Chun)
    const auraGeo = new THREE.CylinderGeometry(0.55, 0.65, 1.85, 16, 1, true);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const kiAuraMesh = new THREE.Mesh(auraGeo, auraMat);
    kiAuraMesh.position.y = 0.95;
    group.add(kiAuraMesh);

    group.position.set(x, y, z);
    group.traverse(obj => { if (obj.isMesh) obj.castShadow = obj.receiveShadow = true; });
    this.scene.add(group);

    let baseHp = 100;
    let punchDmg = 4;
    let kameDmg = 12;
    let teleCd = 4.5;
    let splitCd = 18;

    if (difficulty === 'easy') {
      baseHp = 60;
      punchDmg = 2;
      kameDmg = 8;
      teleCd = 6.0;
      splitCd = 28;
    } else if (difficulty === 'hard') {
      baseHp = 160;
      punchDmg = 6;
      kameDmg = 18;
      teleCd = 2.8;
      splitCd = 12;
    }

    const maxHp = isClone ? Math.max(1, Math.round(baseHp / 4)) : baseHp;
    const actualPunch = isClone ? Math.max(1, Math.floor(punchDmg / 3)) : punchDmg;
    const actualKame = isClone ? Math.max(2, Math.floor(kameDmg / 4)) : kameDmg;

    const mob = {
      type: 'jackie_chun',
      contentId: 'dragonball_tournament:jackie_chun',
      modId: 'dragonball_tournament',
      name: isClone ? 'Jackie Chun (Illusion Clone)' : 'World Martial Arts Challenger: Jackie Chun',
      mesh: group,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      mat,
      kiAuraMesh,
      kiAuraMat: auraMat,
      auraSparkTimer: 0,
      chargeSphereGroup: null,
      health: maxHp,
      maxHealth: maxHp,
      difficulty,
      isBoss: !isClone,
      isClone,
      isPlayerControlled,
      punchDamage: actualPunch,
      kamehamehaDamage: actualKame,
      teleportCooldown: teleCd,
      baseTeleportCooldown: teleCd,
      shadowSplitCooldown: splitCd,
      baseShadowSplitCooldown: splitCd,
      kamehamehaCooldown: 2.2 + Math.random() * 1.5,
      kamehamehaChargeTimer: 0,
      isChargingKamehameha: false,
      attackCooldown: 0,
      hitCooldown: 0,
      velocity: new THREE.Vector3(),
      yaw: 0,
      clones: []
    };

    this.mobs.push(mob);
    return mob;
  },
  ensureJackieChargeSphere(mob) {
    if (!mob || !mob.mesh) return null;
    if (mob.chargeSphereGroup) return mob.chargeSphereGroup;

    const group = new THREE.Group();
    // Inner pure white core
    const coreGeo = new THREE.SphereGeometry(0.18, 16, 16);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // Outer luminous cyan plasma
    const outerGeo = new THREE.SphereGeometry(0.32, 16, 16);
    const outerMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    group.add(outer);

    group.position.set(0, 0.95, 0.55);
    mob.mesh.add(group);
    mob.chargeSphereGroup = group;
    mob.chargeSphereCore = core;
    mob.chargeSphereOuter = outer;
    return group;
  },
  removeJackieChargeSphere(mob) {
    if (!mob || !mob.chargeSphereGroup) return;
    mob.mesh.remove(mob.chargeSphereGroup);
    mob.chargeSphereGroup.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    mob.chargeSphereGroup = null;
    mob.chargeSphereCore = null;
    mob.chargeSphereOuter = null;
  },
  teleportJackieChun(mob, targetX = null, targetY = null, targetZ = null) {
    if (!mob || !mob.mesh) return;
    const oldPos = mob.mesh.position.clone();
    this.entities?.spawnEndermanParticles(oldPos.clone().add(new THREE.Vector3(0, 1.0, 0)), 22);

    let newX = targetX;
    let newY = targetY;
    let newZ = targetZ;

    if (newX === null || newZ === null) {
      newX = (Math.random() - 0.5) * 13;
      newZ = (Math.random() - 0.5) * 13;
      newY = 24.5;
    }

    mob.mesh.position.set(newX, newY, newZ);
    mob.velocity.set(0, 0, 0);

    this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 22);
    if (this.sounds?.playEndermanTeleport) {
      this.sounds.playEndermanTeleport();
    }
  },
  shadowSplit(mob) {
    if (!mob || mob.isClone || mob.isPlayerControlled) return [];
    if (mob.clones && mob.clones.length > 0) {
      for (const cl of mob.clones) {
        if (cl && cl.mesh) {
          this.scene.remove(cl.mesh);
          const idx = this.mobs.indexOf(cl);
          if (idx !== -1) this.mobs.splice(idx, 1);
        }
      }
      mob.clones = [];
    }

    const posOffsets = [
      { x: -4.5, z: -4.5 },
      { x: 4.5, z: -4.5 },
      { x: -4.5, z: 4.5 },
      { x: 4.5, z: 4.5 }
    ];

    const spots = [...posOffsets].sort(() => Math.random() - 0.5);
    const realSpot = spots[0];
    this.teleportJackieChun(mob, realSpot.x, 24.5, realSpot.z);

    const createdClones = [];
    for (let i = 1; i < 4; i++) {
      const s = spots[i];
      const clone = this.spawnJackieChun(s.x, 24.5, s.z, {
        difficulty: mob.difficulty,
        isClone: true
      });
      this.entities?.spawnEndermanParticles(clone.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 20);
      createdClones.push(clone);
    }

    mob.clones = createdClones;
    mob.shadowSplitCooldown = mob.baseShadowSplitCooldown || 18;

    if (this.game?.ui?.addChatMessage) {
      this.game.ui.addChatMessage('<span style="color:#38bdf8;font-weight:bold;">[Jackie Chun]</span> Zanzoken! Shadow Split illusion has created 4 Jackie Chuns!');
    }
    return createdClones;
  },
  isTrainingSiteMob(mob) {
    if (!mob || !mob.mesh) return false;
    if (this.game && !this.game.tournament?.isTournamentMap) return false;
    const hostileTypes = ['zombie', 'husk', 'skeleton', 'stray', 'bogged', 'parched', 'pillager', 'creeper', 'enderman'];
    if (!hostileTypes.includes(mob.type)) return false;

    if (this.game?.dungeonMode?.isActive) return true;

    const x = mob.mesh.position.x;
    const z = mob.mesh.position.z;
    // Punching Yard: x [28, 72], z [-18, 18]
    if (x >= 28 && x <= 72 && z >= -18 && z <= 18) return true;
    // Kamehameha Range: x [-72, -28], z [-18, 18]
    if (x >= -72 && x <= -28 && z >= -18 && z <= 18) return true;
    // Genki Dama Crater: x [-18, 18], z [-72, -28]
    if (x >= -18 && x <= 18 && z >= -72 && z <= -28) return true;
    // South Parkour: x [-18, 18], z [28, 72]
    if (x >= -18 && x <= 18 && z >= 28 && z <= 72) return true;
    // Central Tournament Arena: x [-32, 32], z [-32, 32]
    if (x >= -32 && x <= 32 && z >= -32 && z <= 32) return true;

    return false;
  }
};

function update(mob, dt, player, distToPlayer) {
  if (mob.type === 'tournament_host' || mob.type === 'site_manager') {
      // Face player if near, stationary announcer posture
      if (distToPlayer < 7.0) {
        mob.yaw = Math.atan2(player.position.x - mob.mesh.position.x, player.position.z - mob.mesh.position.z);
      }
      mob.velocity.x = 0;
      mob.velocity.z = 0;
      // Subtle breathing & mic motion
      if (mob.rightArm) {
        mob.rightArm.rotation.x = -Math.PI / 3 + Math.sin(Date.now() * 0.003) * 0.04;
      }
    } else if (mob.type === 'jackie_chun') {
      mob.attackCooldown = Math.max(0, (mob.attackCooldown ?? 0) - dt);
      mob.teleportCooldown = (mob.teleportCooldown ?? 4.5) - dt;

      // --- 1. Jackie Chun Martial Arts Ki Aura & Energy Sparks (Visual Effects like Goku) ---
      const isCharging = mob.isChargingKamehameha || (this.game?.tournament?.bossMob === mob && this.game?.tournament?.p2IsChargingKamehameha);
      if (mob.kiAuraMesh) {
        mob.kiAuraMesh.rotation.y += dt * 2.5;
        if (isCharging) {
          const flare = 1.25 + Math.sin(Date.now() * 0.02) * 0.18;
          mob.kiAuraMesh.scale.set(flare, 1.05, flare);
          if (mob.kiAuraMat) {
            mob.kiAuraMat.opacity = 0.65 + Math.sin(Date.now() * 0.025) * 0.15;
            mob.kiAuraMat.color.setHex(0x38bdf8);
          }
        } else {
          const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.06;
          mob.kiAuraMesh.scale.set(pulse, 1.0, pulse);
          if (mob.kiAuraMat) {
            mob.kiAuraMat.opacity = 0.28 + Math.sin(Date.now() * 0.004) * 0.08;
            mob.kiAuraMat.color.setHex(0x00f0ff);
          }
        }

        // Rising Ki sparks around Jackie Chun (just like Goku)
        mob.auraSparkTimer = (mob.auraSparkTimer ?? 0) - dt;
        if (mob.auraSparkTimer <= 0) {
          mob.auraSparkTimer = isCharging ? 0.08 : 0.35;
          const sparkPos = mob.mesh.position.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.7,
            0.2 + Math.random() * 1.3,
            (Math.random() - 0.5) * 0.7
          ));
          const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
          skillsMgr?.spawnEnergySparks?.(sparkPos, isCharging ? 3 : 1, isCharging ? 0x38bdf8 : 0x00f0ff);
        }
      }

      if (mob.isPlayerControlled) {
        // Controlled by Player 2 keyboard inputs (handled via tournament.js)
      } else {
        mob.kamehamehaCooldown = (mob.kamehamehaCooldown ?? 3.5) - dt;
        if (!mob.isClone) {
          // Aggressive Shadow Split: count down faster in 1P mode to keep intense match pressure
          mob.shadowSplitCooldown = (mob.shadowSplitCooldown ?? 12.0) - dt * 1.6;

          // If all illusion clones were dispelled, Jackie Chun fast-tracks Zanzoken Shadow Split!
          if (mob.clones && mob.clones.length > 0) {
            const activeClones = mob.clones.filter(c => c.health > 0 && !c.dying && this.mobs.includes(c));
            if (activeClones.length === 0 && mob.shadowSplitCooldown > 3.0) {
              mob.shadowSplitCooldown = 2.5;
            }
          }
        }

        // 1. Shadow Split (Real Jackie Chun only)
        if (!mob.isClone && mob.shadowSplitCooldown <= 0) {
          this.shadowSplit(mob);
          // Dynamic aggressive reuse cooldown once performed
          mob.shadowSplitCooldown = (mob.difficulty === 'hard' ? 6.0 : mob.difficulty === 'easy' ? 12.0 : 8.5);
        }

        // 2. Sudden position change (teleport)
        if (mob.teleportCooldown <= 0) {
          mob.teleportCooldown = (mob.baseTeleportCooldown || 4.5) + Math.random() * 2.0;
          this.teleportJackieChun(mob);
        }

        // 3. Kamehameha charging & shooting (Aggressive in 1P mode)
        if (mob.isChargingKamehameha) {
          mob.kamehamehaChargeTimer -= dt;
          mob.velocity.x *= 0.82;
          mob.velocity.z *= 0.82;
          const toP = player.position.clone().sub(mob.mesh.position);
          toP.y = 0;
          if (toP.lengthSq() > 0.01) mob.yaw = Math.atan2(toP.x, toP.z);
          mob.mesh.rotation.y = mob.yaw;

          if (mob.leftArm && mob.rightArm) {
            mob.leftArm.rotation.set(-Math.PI / 2.3, 0.15, 0.25);
            mob.rightArm.rotation.set(-Math.PI / 2.3, -0.15, -0.25);
          }

          // Visual charge sphere in hands
          const sphere = mob.chargeSphereGroup || this.ensureJackieChargeSphere(mob);
          if (sphere) {
            const chargeProg = Math.max(0, 1.0 - (mob.kamehamehaChargeTimer / 0.85));
            const pulse = 0.5 + chargeProg * 0.8 + Math.sin(Date.now() * 0.03) * 0.12;
            sphere.scale.set(pulse, pulse, pulse);

            if (Math.random() < 0.45) {
              const worldPos = new THREE.Vector3();
              sphere.getWorldPosition(worldPos);
              const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
              skillsMgr?.spawnEnergySparks?.(worldPos, 2, 0x00f0ff);
            }
          }

          if (mob.kamehamehaChargeTimer <= 0) {
            mob.isChargingKamehameha = false;
            this.removeJackieChargeSphere(mob);

            if (mob.leftArm && mob.rightArm) {
              mob.leftArm.rotation.set(-Math.PI / 2.0, 0, 0.05);
              mob.rightArm.rotation.set(-Math.PI / 2.0, 0, -0.05);
              this.modSchedule(() => {
                if (mob && !mob.isChargingKamehameha) {
                  if (mob.leftArm) mob.leftArm.rotation.set(0, 0, 0);
                  if (mob.rightArm) mob.rightArm.rotation.set(0, 0, 0);
                }
              }, 350);
            }

            // Aggressive cooldown: 2.6s - 4.5s in 1P mode
            mob.kamehamehaCooldown = (mob.difficulty === 'hard' ? 2.6 : mob.difficulty === 'easy' ? 4.8 : 3.4) + Math.random() * 1.4;
            const origin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            const shootDir = player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(origin).normalize();

            // Jackie Chun's Kamehameha is 1.5x the width of Goku's beam (Goku max radius: 1.5 -> Jackie Chun: 2.25)
            const beamRadius = mob.isClone ? 1.5 : 2.25;
            const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
            skillsMgr?.shootOpponentKamehameha?.(origin, shootDir, mob.kamehamehaDamage, beamRadius, mob);
            if (skillsMgr) {
              skillsMgr.shakeIntensity = 0.55;
            }
            this.sounds?.playKamehameha?.();
            skillsMgr?.spawnEnergySparks?.(origin.clone().add(shootDir.clone().multiplyScalar(1.2)), 16, 0x00f0ff);
          }
        } else if (mob.kamehamehaCooldown <= 0) {
          // Aggressive trigger: if player is very close, do a swift backstep leap before charging
          if (distToPlayer <= 2.2) {
            const backDir = player.position.clone().sub(mob.mesh.position).normalize();
            mob.velocity.x = -backDir.x * 4.5;
            mob.velocity.z = -backDir.z * 4.5;
            mob.velocity.y = 1.8;
          } else {
            mob.velocity.set(0, 0, 0);
          }
          mob.isChargingKamehameha = true;
          mob.kamehamehaChargeTimer = 0.85;
          this.ensureJackieChargeSphere(mob);
          this.sounds?.playKiCharge?.(false);
        } else {
          // 4. Martial Arts pursuit & Punch
          const dir = player.position.clone().sub(mob.mesh.position);
          dir.y = 0;
          const dist = dir.length();
          if (dist > 1.2) {
            dir.normalize();
            const targetYaw = Math.atan2(dir.x, dir.z);
            const turn = Math.atan2(Math.sin(targetYaw - mob.yaw), Math.cos(targetYaw - mob.yaw));
            mob.yaw += turn * Math.min(1.0, 10 * dt);
            if (!mob.avoidTime || mob.avoidTime <= 0) {
              const speed = (mob.difficulty === 'hard' ? 3.4 : mob.difficulty === 'easy' ? 2.6 : 3.0);
              mob.velocity.x = Math.sin(mob.yaw) * speed;
              mob.velocity.z = Math.cos(mob.yaw) * speed;
            }
          } else {
            mob.velocity.x *= 0.5;
            mob.velocity.z *= 0.5;
          }

          // Punch when close: Yellow shock waves visual effect identical to Goku's punch!
          if (dist < 2.0 && mob.attackCooldown <= 0) {
            player.takeDamage(mob.punchDamage);
            if (this.sounds?.playPunch) this.sounds.playPunch();
            if (this.sounds?.playHit) this.sounds.playHit();
            else this.sounds?.playZombie?.();
            mob.attackCooldown = (mob.difficulty === 'hard' ? 0.65 : mob.difficulty === 'easy' ? 1.0 : 0.78);
            if (mob.leftArm && mob.rightArm) {
              mob.rightArm.rotation.x = -Math.PI / 1.8;
              mob.leftArm.rotation.x = -Math.PI / 3.0;
              setTimeout(() => {
                if (mob.rightArm) mob.rightArm.rotation.x = 0;
                if (mob.leftArm) mob.leftArm.rotation.x = 0;
              }, 180);
            }

            // Spawn yellow martial arts punch shock wave forward towards player
            const punchDir = player.position.clone().sub(mob.mesh.position);
            punchDir.y = 0;
            if (punchDir.lengthSq() > 0.001) punchDir.normalize();
            else punchDir.set(Math.sin(mob.yaw), 0, Math.cos(mob.yaw));
            const punchOrigin = mob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));

            const skillsMgr = this.game?.skills || this.game?.dragonballSkills;
            skillsMgr?.spawnPunchWave?.(punchOrigin, punchDir, 0xfacc15);
            skillsMgr?.spawnEnergySparks?.(player.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 12, 0xfacc15);
          }
        }
      }
     }
}

function hurt(mob) {
      if (this.sounds?.playHit) this.sounds.playHit();
      // Clone death check
      if (mob.isClone && mob.health <= 0) {
        this.entities?.spawnEndermanParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 18);
        this.entities?.spawnDeathParticles(mob.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
        this.scene.remove(mob.mesh);
        this.removeDebugLabel(mob);
        const idx = this.mobs.indexOf(mob);
        if (idx !== -1) this.mobs.splice(idx, 1);
        return true;
      }
      // If real boss died, dispel clones
      if (!mob.isClone && mob.health <= 0 && mob.clones) {
        for (const cl of mob.clones) {
          if (cl && cl.mesh) {
            this.entities?.spawnEndermanParticles(cl.mesh.position.clone().add(new THREE.Vector3(0, 1.0, 0)), 14);
            this.scene.remove(cl.mesh);
            this.removeDebugLabel(cl);
            const clIdx = this.mobs.indexOf(cl);
            if (clIdx !== -1) this.mobs.splice(clIdx, 1);
          }
        }
        mob.clones = [];
      }
      // Sudden teleport evasion on hit
      const evadeChance = (mob.difficulty === 'hard' ? 0.60 : mob.difficulty === 'easy' ? 0.25 : 0.45);
      if (Math.random() < evadeChance && mob.health > 0 && !mob.isPlayerControlled) {
        this.modSchedule(() => {
          if (mob && mob.health > 0 && !mob.dying && this.mobs.includes(mob)) {
            this.teleportJackieChun(mob);
          }
        }, 90);
      }
    
}

export function registerMobs(api, game) {
  const manager = game?.mobs;
  if (!manager) return;
  api.extend(manager, { modSchedule: api.schedule.bind(api) });
  api.extend(manager, Object.fromEntries(Object.entries(mobMethods).map(([key, fn]) => [key, fn.bind(manager)])));
  const definitions = [
    ['tournament_host', 'spawnTournamentHost', 'createHostTexture', {width: 0.6, height: 1.95}],
    ['site_manager', 'spawnSiteManager', 'createTrainerTexture', {width: 0.6, height: 1.95}],
    ['jackie_chun', 'spawnJackieChun', 'createJackieChunTexture', {width: 0.6, height: 1.85}],
  ];
  for (const [id, spawn, texture, dimensions] of definitions) {
    const skin = manager[texture]();
    api.extend(manager.textures, {[id]: skin});
    api.onDispose(() => skin.dispose());
    api.registerMobProvider(id, {
      spawn: manager[spawn], dimensions, update,
      hurt: id === 'jackie_chun' ? hurt : null,
      interact: id === 'tournament_host' ? () => game.tournament?.talkToHost()
        : id === 'site_manager' ? mob => {
          const site = game.trainingSites?.sites.find(s => s.id === mob.siteId);
          if (site) game.trainingSites.triggerSiteIntroduction(site);
        } : null,
    });
  }
}
