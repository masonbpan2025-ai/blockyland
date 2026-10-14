import * as THREE from 'three';

export const TOURNAMENT_STATE = {
  WAITING_FOR_TALK: 'WAITING_FOR_TALK',
  STAGE_READY: 'STAGE_READY',
  FIGHTING: 'FIGHTING',
  VICTORY: 'VICTORY'
};

export class TournamentManager {
  constructor(game) {
    this.game = game;
    this.events = new AbortController();
    this.state = TOURNAMENT_STATE.WAITING_FOR_TALK;
    this.hostMob = null;
    this.bossMob = null;
    this.fireworkTimer = 0;
    this.dialogueTimer = 0;
    this.hasTalked = false;

    // Arena Stage coordinates
    this.stageMinX = -8.5;
    this.stageMaxX = 8.5;
    this.stageMinZ = -8.5;
    this.stageMaxZ = 8.5;
    this.stageMinY = 24.0;

    // Host position next to front-right stage stairs
    this.hostPosition = new THREE.Vector3(3.5, 24, 10.5);

    // DOM Elements
    const hasDoc = typeof document !== 'undefined';
    this.dialogueContainer = hasDoc ? document.getElementById('announcer-dialogue') : null;
    this.dialogueText = hasDoc ? document.getElementById('announcer-text') : null;
    this.bossBarContainer = hasDoc ? document.getElementById('boss-bar-container') : null;
    this.bossBarFill = hasDoc ? document.getElementById('boss-bar-fill') : null;
    this.bossBarName = hasDoc ? document.getElementById('boss-bar-name') : null;
    this.championOverlay = hasDoc ? document.getElementById('champion-overlay') : null;
    this.defeatOverlay = hasDoc ? document.getElementById('defeat-overlay') : null;
    this.defeatMsgEl = hasDoc ? document.getElementById('defeat-message') : null;
    this.setupModal = hasDoc ? document.getElementById('tournament-setup-modal') : null;
    this.p2Hud = hasDoc ? document.getElementById('player2-hud') : null;
    this.p2HealthBar = hasDoc ? document.getElementById('p2-health-bar') : null;
    this.p2HpText = hasDoc ? document.getElementById('p2-hp-text') : null;
    this.p2TeleportBadge = hasDoc ? document.getElementById('p2-teleport-badge') : null;

    // Difficulty & Two-Player Mode
    this.difficulty = 'normal'; // 'easy' | 'normal' | 'hard'
    this.isTwoPlayer = false;

    // Player 2 Controls & State
    this.p2Keys = { up: false, down: false, left: false, right: false };
    this.p2PunchCooldown = 0;
    this.p2TeleportCooldown = 0;
    this.p2IsChargingKamehameha = false;
    this.p2KamehamehaChargeTime = 0;

    this.decorationsGroup = null;
    this.barrierGroup = null;
    this.isTournamentMap = false;

    if (hasDoc) {
      this.wireSetupModal();
      this.setupP2KeyListeners();
    }
  }

  // Create high-resolution 3D sign "天下一武道会" and Dragon Ball gate decorations
  ensureDecorations() {
    if (!this.isTournamentMap) return;
    if (this.decorationsGroup || !this.game?.scene) return;
    if (typeof document === 'undefined') return;

    const group = new THREE.Group();
    group.name = 'tournament_decorations';

    // 1. "天下一武道会" Grand Signboard on Roof
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 256;
    const sCtx = signCanvas.getContext('2d');

    // Outer golden frame with gradient & bevel
    const goldGrad = sCtx.createLinearGradient(0, 0, 0, 256);
    goldGrad.addColorStop(0, '#fde047');
    goldGrad.addColorStop(0.5, '#eab308');
    goldGrad.addColorStop(1, '#b45309');
    sCtx.fillStyle = goldGrad;
    sCtx.fillRect(0, 0, 1024, 256);

    // Bevel shading
    sCtx.fillStyle = '#fef08a';
    sCtx.fillRect(8, 8, 1008, 8);
    sCtx.fillRect(8, 8, 8, 240);
    sCtx.fillStyle = '#78350f';
    sCtx.fillRect(8, 240, 1008, 8);
    sCtx.fillRect(1008, 8, 8, 240);

    // Inner Red Accent Border
    sCtx.fillStyle = '#dc2626';
    sCtx.fillRect(18, 18, 988, 220);

    // Clean White Sign Placard
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(30, 30, 964, 196);

    // Subtle parchment texture line
    sCtx.fillStyle = '#f8fafc';
    sCtx.fillRect(34, 34, 956, 188);

    // Bold Calligraphy: 天下一武道会
    sCtx.fillStyle = '#111111';
    sCtx.font = "900 128px 'KaiTi', 'SimSun', 'Microsoft YaHei', 'Noto Serif SC', 'PingFang SC', sans-serif";
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('天下一武道会', 512, 128);

    const signTexture = new THREE.CanvasTexture(signCanvas);
    signTexture.colorSpace = THREE.SRGBColorSpace;
    signTexture.magFilter = THREE.LinearFilter;
    signTexture.minFilter = THREE.LinearFilter;

    const signMat = new THREE.MeshLambertMaterial({ map: signTexture });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xca8a04 });
    const signMaterials = [
      goldMat, goldMat, goldMat, goldMat,
      signMat, // Front (+Z)
      goldMat  // Back (-Z)
    ];

    const signMesh = new THREE.Mesh(
      new THREE.BoxGeometry(9.6, 2.4, 0.35),
      signMaterials
    );
    // Position on the front roof above the center entrance
    signMesh.position.set(0, 34.2, -18.2);
    signMesh.rotation.x = -0.16; // Tilted slightly down towards player
    group.add(signMesh);

    // 2. Center Entrance Gate "武" Circular Crest
    const emblemCanvas = document.createElement('canvas');
    emblemCanvas.width = 512;
    emblemCanvas.height = 512;
    const eCtx = emblemCanvas.getContext('2d');

    // White circle with red outer ring
    eCtx.fillStyle = '#ffffff';
    eCtx.beginPath();
    eCtx.arc(256, 256, 240, 0, Math.PI * 2);
    eCtx.fill();

    eCtx.strokeStyle = '#dc2626';
    eCtx.lineWidth = 32;
    eCtx.beginPath();
    eCtx.arc(256, 256, 220, 0, Math.PI * 2);
    eCtx.stroke();

    // Calligraphy "武" (Martial Arts)
    eCtx.fillStyle = '#dc2626';
    eCtx.font = "900 290px 'KaiTi', 'SimSun', 'Microsoft YaHei', 'Noto Serif SC', sans-serif";
    eCtx.textAlign = 'center';
    eCtx.textBaseline = 'middle';
    eCtx.fillText('武', 256, 256);

    const emblemTexture = new THREE.CanvasTexture(emblemCanvas);
    emblemTexture.colorSpace = THREE.SRGBColorSpace;
    const emblemMat = new THREE.MeshLambertMaterial({
      map: emblemTexture,
      transparent: true
    });
    const emblemMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      emblemMat
    );
    emblemMesh.position.set(0, 26.5, -15.88);
    group.add(emblemMesh);

    // 3. Two Iconic Red & Blue Parasols / Umbrellas Flanking the Gate (Screenshot 2 & 3)
    const umbrellaSpots = [-8.5, 8.5];
    for (const ux of umbrellaSpots) {
      const uGroup = new THREE.Group();
      uGroup.position.set(ux, 20.0, -12.5);

      // Pole
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 5.5, 8),
        new THREE.MeshLambertMaterial({ color: 0xeeeeee })
      );
      pole.position.y = 2.75;
      uGroup.add(pole);

      // Parasol Dome (Blue top with Red rim)
      const domeMatBlue = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
      const domeMatRed = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
      const domeMatWhite = new THREE.MeshLambertMaterial({ color: 0xffffff });

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.3),
        domeMatBlue
      );
      dome.position.y = 5.2;
      uGroup.add(dome);

      // Red lower brim
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(1.65, 1.7, 0.25, 16),
        domeMatRed
      );
      rim.position.y = 4.75;
      uGroup.add(rim);

      // White under-trim
      const underRim = new THREE.Mesh(
        new THREE.CylinderGeometry(1.7, 1.75, 0.15, 16),
        domeMatWhite
      );
      underRim.position.y = 4.58;
      uGroup.add(underRim);

      group.add(uGroup);
    }

    this.game.scene.add(group);
    this.decorationsGroup = group;
  }

  // Find or spawn tournament host
  ensureHost() {
    if (!this.isTournamentMap) return;
    this.ensureDecorations();
    if (!this.game?.mobs) return;
    this.hostMob = this.game.mobs.mobs.find(m => m.type === 'tournament_host');
    if (!this.hostMob) {
      this.hostMob = this.game.mobs.spawnTournamentHost(
        this.hostPosition.x,
        this.hostPosition.y,
        this.hostPosition.z
      );
    }
  }

  wireSetupModal() {
    if (typeof document === 'undefined') return;

    const btn1P = document.getElementById('btn-mode-1p');
    const btn2P = document.getElementById('btn-mode-2p');
    const p2Hint = document.getElementById('tournament-p2-hint');

    btn1P?.addEventListener('click', () => {
      this.isTwoPlayer = false;
      btn1P.classList.add('active');
      btn2P?.classList.remove('active');
      if (p2Hint) p2Hint.style.opacity = '0.5';
    }, { signal: this.events.signal });

    btn2P?.addEventListener('click', () => {
      this.isTwoPlayer = true;
      btn2P.classList.add('active');
      btn1P?.classList.remove('active');
      if (p2Hint) p2Hint.style.opacity = '1.0';
    }, { signal: this.events.signal });

    const diffButtons = {
      easy: document.getElementById('btn-diff-easy'),
      normal: document.getElementById('btn-diff-normal'),
      hard: document.getElementById('btn-diff-hard')
    };

    Object.entries(diffButtons).forEach(([diff, btn]) => {
      btn?.addEventListener('click', () => {
        this.difficulty = diff;
        Object.values(diffButtons).forEach(b => b?.classList.remove('active'));
        btn.classList.add('active');
      }, { signal: this.events.signal });
    });

    const btnConfirm = document.getElementById('btn-confirm-start-fight');
    btnConfirm?.addEventListener('click', () => {
      this.hideSetupModal();
      if (this.game.player) {
        this.game.player.position.set(0, 24.5, 4.5);
        this.game.player.yaw = Math.PI;
        this.game.player.pitch = 0;
        if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);
      }
      this.startFight(this.difficulty, this.isTwoPlayer);
    }, { signal: this.events.signal });

    const btnClose = document.getElementById('btn-close-tournament-modal');
    btnClose?.addEventListener('click', () => {
      this.hideSetupModal();
    }, { signal: this.events.signal });

    const btnDefeatRetry = document.getElementById('btn-defeat-retry');
    btnDefeatRetry?.addEventListener('click', () => {
      this.retryDefeat();
    }, { signal: this.events.signal });

    const btnCloseChampion = document.getElementById('btn-close-champion');
    btnCloseChampion?.addEventListener('click', () => {
      if (this.championOverlay) {
        this.championOverlay.classList.remove('visible');
        this.championOverlay.classList.add('hidden');
      }
      this.game.dungeonMode?.exitDungeonMode(true);
      if (this.game.player) {
        this.game.player.isDungeonMode = false;
      }
    }, { signal: this.events.signal });
  }

  showSetupModal() {
    if (this.setupModal) {
      this.setupModal.classList.remove('hidden');
      if (typeof document !== 'undefined' && document.exitPointerLock) {
        document.exitPointerLock();
      }
    }
  }

  hideSetupModal() {
    if (this.setupModal) {
      this.setupModal.classList.add('hidden');
    }
  }

  showDefeat() {
    if (this.defeatOverlay) {
      if (this.defeatMsgEl) {
        this.defeatMsgEl.textContent = 'You lost, please try again.';
      }
      this.defeatOverlay.classList.remove('hidden');
      this.defeatOverlay.classList.add('visible');
      if (typeof document !== 'undefined' && document.exitPointerLock) {
        document.exitPointerLock();
      }
    }
  }

  hideDefeat() {
    if (this.defeatOverlay) {
      this.defeatOverlay.classList.remove('visible');
      this.defeatOverlay.classList.add('hidden');
    }
  }

  retryDefeat() {
    this.hideDefeat();
    if (this.game.player?.respawn) {
      this.game.player.respawn();
    } else if (this.game.player) {
      this.game.player.isDead = false;
      this.game.player.health = this.game.player.maxHealth || 20;
      this.game.player.position.copy(this.hostPosition);
      if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);
    }
    this.reset();
    this.talkToHost();
  }

  activateTwoPlayerMode(announce = true) {
    this.isTwoPlayer = true;
    if (this.bossMob) {
      this.bossMob.isPlayerControlled = true;
    }
    if (this.p2Hud) {
      this.p2Hud.classList.remove('hidden');
      if (this.p2HealthBar && this.bossMob) {
        const pct = Math.max(0, Math.min(100, (this.bossMob.health / this.bossMob.maxHealth) * 100));
        this.p2HealthBar.style.width = `${pct}%`;
      }
      if (this.p2HpText && this.bossMob) {
        this.p2HpText.textContent = `HP: ${Math.max(0, this.bossMob.health)} / ${this.bossMob.maxHealth}`;
      }
      if (this.p2TeleportBadge) {
        this.p2TeleportBadge.textContent = 'TELEPORT [Backspace]: READY';
        this.p2TeleportBadge.className = 'p2-badge-ready';
      }
    }
    if (this.bossBarName) {
      const diffLabel = this.difficulty.toUpperCase();
      this.bossBarName.textContent = `World Martial Arts Challenger: Jackie Chun (${diffLabel} - 2P)`;
    }
    if (announce) {
      this.game.ui?.addChatMessage?.(
        '<span style="color:#ea580c;font-weight:bold;">[Tournament]</span> Two-Player Match Engaged! Player 2 controls Jackie Chun: [↑↓←→] Move, [\\] Punch, [Enter] Kamehameha, [Backspace] Teleport!'
      );
    }
  }

  setupP2KeyListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      if (!this.isTournamentMap || this.state !== TOURNAMENT_STATE.FIGHTING) return;
      if (!this.bossMob || this.bossMob.dying) return;
      if (this.game.ui?.isModalOpen?.() || this.game.ui?.isChatOpen) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

      const isP2Key = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'NumpadEnter', 'Backspace', 'Backslash'].includes(e.code) ||
                      e.key === 'Enter' || e.key === '\\' || e.key === 'Backspace';

      if (!isP2Key) return;

      // Automatically engage Two-Player control if player uses P2 inputs during the fight
      if (!this.isTwoPlayer) {
        this.activateTwoPlayerMode(false);
      }

      if (e.code === 'ArrowUp') {
        this.p2Keys.up = true;
        e.preventDefault();
      } else if (e.code === 'ArrowDown') {
        this.p2Keys.down = true;
        e.preventDefault();
      } else if (e.code === 'ArrowLeft') {
        this.p2Keys.left = true;
        e.preventDefault();
      } else if (e.code === 'ArrowRight') {
        this.p2Keys.right = true;
        e.preventDefault();
      } else if (e.code === 'Backslash' || e.key === '\\') {
        e.preventDefault();
        this.p2Punch();
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') {
        e.preventDefault();
        if (!this.p2IsChargingKamehameha) {
          this.p2StartChargingKamehameha();
        }
      } else if (e.code === 'Backspace' || e.key === 'Backspace') {
        e.preventDefault();
        if (this.p2TeleportCooldown <= 0) {
          this.p2TeleportCooldown = 2.5;
          this.game.mobs.teleportJackieChun(this.bossMob);
        }
      }
    }, { signal: this.events.signal });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowUp') { this.p2Keys.up = false; }
      else if (e.code === 'ArrowDown') { this.p2Keys.down = false; }
      else if (e.code === 'ArrowLeft') { this.p2Keys.left = false; }
      else if (e.code === 'ArrowRight') { this.p2Keys.right = false; }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter') {
        if (this.p2IsChargingKamehameha) {
          this.p2ReleaseKamehameha();
        }
      }
    }, { signal: this.events.signal });
  }

  p2Punch() {
    if (this.p2PunchCooldown > 0 || !this.bossMob || this.bossMob.dying) return;
    this.p2PunchCooldown = 0.38;

    if (this.bossMob.rightArm) {
      this.bossMob.rightArm.rotation.x = -Math.PI / 1.7;
      setTimeout(() => {
        if (this.bossMob?.rightArm) this.bossMob.rightArm.rotation.x = 0;
      }, 160);
    }

    if (this.game.sounds?.playPunch) this.game.sounds.playPunch();

    // Facing direction of Jackie Chun
    const facing = new THREE.Vector3(Math.sin(this.bossMob.yaw), 0, Math.cos(this.bossMob.yaw)).normalize();
    const punchOrigin = this.bossMob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));

    // Spawn vibrant yellow shock waves effect identical to Goku's punch
    const skillsMgr = this.game.skills || this.game.dragonballSkills;
    skillsMgr?.spawnPunchWave?.(punchOrigin, facing, 0xfacc15);

    const p1Pos = this.game.player.position;
    const dist = this.bossMob.mesh.position.distanceTo(p1Pos);
    if (dist <= 2.4) {
      this.game.player.takeDamage(this.bossMob.punchDamage || 4);
      if (this.game.sounds?.playHit) this.game.sounds.playHit();
      skillsMgr?.spawnEnergySparks?.(p1Pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 12, 0xfacc15);
    }
  }

  p2StartChargingKamehameha() {
    if (!this.bossMob || this.bossMob.dying) return;
    this.p2IsChargingKamehameha = true;
    this.p2KamehamehaChargeTime = 0;
    this.game.sounds?.playKiCharge?.(false);

    // Jackie Chun cupped hands martial arts stance
    if (this.bossMob.leftArm && this.bossMob.rightArm) {
      this.bossMob.leftArm.rotation.set(-Math.PI / 2.3, 0.15, 0.25);
      this.bossMob.rightArm.rotation.set(-Math.PI / 2.3, -0.15, -0.25);
    }

    // Attach glowing cyan charge sphere right to his cupped hands
    this.game.mobs?.ensureJackieChargeSphere?.(this.bossMob);

    // Aim towards player
    if (this.game.player) {
      const toP = this.game.player.position.clone().sub(this.bossMob.mesh.position);
      toP.y = 0;
      if (toP.lengthSq() > 0.01) {
        this.bossMob.yaw = Math.atan2(toP.x, toP.z);
        this.bossMob.mesh.rotation.y = this.bossMob.yaw;
      }
    }
  }

  p2ReleaseKamehameha() {
    if (!this.p2IsChargingKamehameha || !this.bossMob || this.bossMob.dying) {
      this.p2IsChargingKamehameha = false;
      this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);
      return;
    }
    this.p2IsChargingKamehameha = false;
    const power = Math.min(1.0, Math.max(0.35, this.p2KamehamehaChargeTime / 2.2));
    const damage = Math.round((this.bossMob.kamehamehaDamage || 12) * (0.7 + power * 0.9));

    // Jackie Chun's Kamehameha is 1.5x the width of Goku's beam
    const gokuRadius = 0.5 + power * 1.0;
    const jackieBeamRadius = gokuRadius * 1.5;

    // Remove charge sphere
    this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);

    // Thrust arms forward in Kamehameha blast pose
    if (this.bossMob.leftArm && this.bossMob.rightArm) {
      this.bossMob.leftArm.rotation.set(-Math.PI / 2.0, 0, 0.05);
      this.bossMob.rightArm.rotation.set(-Math.PI / 2.0, 0, -0.05);
      setTimeout(() => {
        if (this.bossMob && !this.p2IsChargingKamehameha) {
          if (this.bossMob.leftArm) this.bossMob.leftArm.rotation.set(0, 0, 0);
          if (this.bossMob.rightArm) this.bossMob.rightArm.rotation.set(0, 0, 0);
        }
      }, 350);
    }

    const origin = this.bossMob.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const toP1 = this.game.player.position.clone().add(new THREE.Vector3(0, 0.8, 0)).sub(origin);
    const shootDir = toP1.lengthSq() > 0.01 ? toP1.normalize() : new THREE.Vector3(0, 0, 1);

    const skillsMgr = this.game.skills || this.game.dragonballSkills;
    skillsMgr?.shootOpponentKamehameha?.(origin, shootDir, damage, jackieBeamRadius, this.bossMob);
    if (skillsMgr) {
      skillsMgr.shakeIntensity = 0.55 + power * 0.4;
    }

    this.game.sounds?.playKamehameha?.();
    skillsMgr?.spawnEnergySparks?.(origin.clone().add(shootDir.clone().multiplyScalar(1.2)), 16, 0x00f0ff);

    this.game.ui?.addChatMessage?.(
      `<span style="color:#00f0ff;font-weight:bold;">⚡ [Jackie Chun] KAMEHAMEHA!</span> (Power: ${Math.round(power * 100)}% | Damage: ${damage})`
    );

    this.p2KamehamehaChargeTime = 0;
  }

  // Triggered when player right-clicks or approaches the Host
  talkToHost() {
    if (!this.isTournamentMap) return;
    if (this.state === TOURNAMENT_STATE.FIGHTING || this.state === TOURNAMENT_STATE.VICTORY) return;

    this.hasTalked = true;
    this.state = TOURNAMENT_STATE.STAGE_READY;

    if (this.game.sounds?.playHostSpeak) {
      this.game.sounds.playHostSpeak();
    }

    this.showDialogue(
      'Tournament Announcer',
      'Welcome to the World Martial Arts Tournament! Choose your match format and defeat Jackie Chun to become the world champion!',
      7.0
    );

    this.game.ui?.addChatMessage?.(
      '<span style="color:#f59e0b;font-weight:bold;">[Announcer]</span> Welcome to the World Martial Arts Tournament! Defeat Jackie Chun to win the championship! Step onto the stage or configure the match!'
    );

    this.showSetupModal();
  }

  showDialogue(speaker, text, duration = 6.0) {
    if (!this.dialogueContainer || !this.dialogueText) return;
    this.dialogueText.textContent = `"${text}"`;
    this.dialogueContainer.classList.remove('hidden');
    this.dialogueContainer.classList.add('visible');
    this.dialogueTimer = duration;
  }

  hideDialogue() {
    if (!this.dialogueContainer) return;
    this.dialogueContainer.classList.remove('visible');
    this.dialogueContainer.classList.add('hidden');
  }

  spawnStageBarrier() {
    this.removeStageBarrier();
    if (!this.game?.scene) return;

    const group = new THREE.Group();
    group.name = 'tournament_barrier';

    // 4 vertical translucent energy barrier walls around stage perimeter [-8.5, 8.5]
    const wallH = 4.5;
    const wallY = 24.0 + wallH / 2;
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    // North wall (Z = -8.5)
    const geomN = new THREE.PlaneGeometry(17, wallH);
    const meshN = new THREE.Mesh(geomN, wallMat);
    meshN.position.set(0, wallY, -8.5);
    group.add(meshN);

    // South wall (Z = 8.5)
    const geomS = new THREE.PlaneGeometry(17, wallH);
    const meshS = new THREE.Mesh(geomS, wallMat);
    meshS.position.set(0, wallY, 8.5);
    group.add(meshS);

    // West wall (X = -8.5)
    const geomW = new THREE.PlaneGeometry(17, wallH);
    const meshW = new THREE.Mesh(geomW, wallMat);
    meshW.rotation.y = Math.PI / 2;
    meshW.position.set(-8.5, wallY, 0);
    group.add(meshW);

    // East wall (X = 8.5)
    const geomE = new THREE.PlaneGeometry(17, wallH);
    const meshE = new THREE.Mesh(geomE, wallMat);
    meshE.rotation.y = Math.PI / 2;
    meshE.position.set(8.5, wallY, 0);
    group.add(meshE);

    this.barrierGroup = group;
    this.game.scene.add(group);
  }

  removeStageBarrier() {
    if (this.barrierGroup && this.game?.scene) {
      this.game.scene.remove(this.barrierGroup);
      this.barrierGroup = null;
    }
  }

  // Trigger Jackie Chun Boss spawn on stage
  startFight(difficulty = this.difficulty, isTwoPlayer = this.isTwoPlayer) {
    if (!this.isTournamentMap) return;
    if (this.state === TOURNAMENT_STATE.FIGHTING || this.state === TOURNAMENT_STATE.VICTORY) return;
    this.state = TOURNAMENT_STATE.FIGHTING;
    this.difficulty = difficulty;
    this.isTwoPlayer = isTwoPlayer;

    // Position player safely onto the stage if needed
    if (this.game.player) {
      if (!this.isOnStage(this.game.player.position)) {
        this.game.player.position.set(0, 24.5, 4.5);
        this.game.player.yaw = Math.PI;
        this.game.player.pitch = 0;
        if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);
      }
    }

    // Spawn energy perimeter barrier around the stage
    this.spawnStageBarrier();

    const modeText = this.isTwoPlayer ? '2-PLAYER BATTLE' : 'CHAMPIONSHIP MATCH';
    this.showDialogue(
      'Tournament Announcer',
      `THE ${modeText} COMMENCES! Defeat Jackie Chun to claim the championship title!`,
      4.5
    );

    // Dramatic spawn at center-back of fighting stage
    const spawnPos = new THREE.Vector3(0, 24.5, -4.5);
    this.game.entities?.spawnEndermanParticles(spawnPos.clone().add(new THREE.Vector3(0, 1.2, 0)), 40);

    // Spawn Jackie Chun Boss
    this.bossMob = this.game.mobs.spawnJackieChun(spawnPos.x, spawnPos.y, spawnPos.z, {
      difficulty: this.difficulty,
      isPlayerControlled: this.isTwoPlayer
    });

    if (this.game.sounds?.playEndermanTeleport) {
      this.game.sounds.playEndermanTeleport();
    }

    // Show Boss Health Bar
    if (this.bossBarContainer && this.bossBarFill) {
      this.bossBarContainer.classList.remove('hidden');
      this.bossBarFill.style.width = '100%';
      if (this.bossBarName) {
        const diffLabel = this.difficulty.toUpperCase();
        this.bossBarName.textContent = `World Martial Arts Challenger: Jackie Chun (${diffLabel}${this.isTwoPlayer ? ' - 2P' : ''})`;
      }
    }

    // If 2-Player mode, show Player 2 HUD
    if (this.isTwoPlayer && this.p2Hud) {
      this.p2Hud.classList.remove('hidden');
      if (this.p2HealthBar) this.p2HealthBar.style.width = '100%';
      if (this.p2HpText) this.p2HpText.textContent = `HP: ${this.bossMob.health}/${this.bossMob.maxHealth}`;
      if (this.p2TeleportBadge) {
        this.p2TeleportBadge.textContent = 'TELEPORT [Backspace]: READY';
        this.p2TeleportBadge.className = 'p2-badge-ready';
      }
    }

    if (this.isTwoPlayer) {
      this.game.ui?.addChatMessage?.(
        '<span style="color:#ea580c;font-weight:bold;">[Tournament]</span> Two-Player Match Engaged! Player 2 controls Jackie Chun: [↑↓←→] Move, [\\] Punch, [Enter] Kamehameha, [Backspace] Teleport!'
      );
    } else {
      this.game.ui?.addChatMessage?.(
        `<span style="color:#ec4899;font-weight:bold;">[Tournament]</span> Jackie Chun (Master Roshi) has entered the arena! [Difficulty: ${this.difficulty.toUpperCase()}]`
      );
    }
  }

  // Triggered when Jackie Chun Boss is defeated
  triggerVictory() {
    if (this.state === TOURNAMENT_STATE.VICTORY) return;
    this.state = TOURNAMENT_STATE.VICTORY;

    if (this.bossMob) {
      this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);
    }
    this.p2IsChargingKamehameha = false;
    this.p2KamehamehaChargeTime = 0;

    this.removeStageBarrier();

    // Hide Boss Bar & P2 HUD
    if (this.bossBarContainer) this.bossBarContainer.classList.add('hidden');
    if (this.p2Hud) this.p2Hud.classList.add('hidden');

    // Return to normal mode from dungeon mode
    this.game.dungeonMode?.exitDungeonMode(true);
    if (this.game.player) {
      this.game.player.isDungeonMode = false;
    }

    // Play Grand Victory Fanfare
    if (this.game.sounds?.playVictoryFanfare) {
      this.game.sounds.playVictoryFanfare();
    }

    // Show Victory Screen with current congratulations message
    if (this.championOverlay) {
      this.championOverlay.classList.remove('hidden');
      this.championOverlay.classList.add('visible');
    }

    this.showDialogue(
      'Tournament Announcer',
      'LADIES AND GENTLEMEN, WE HAVE A NEW WORLD CHAMPION! WHAT AN INCREDIBLE VICTORY OVER JACKIE CHUN!',
      12.0
    );

    this.game.ui?.addChatMessage?.(
      '<span style="color:#eab308;font-weight:bold;font-size:14px;">★ CONGRATULATIONS! You defeated Jackie Chun and became the World Martial Arts Champion! ★</span>'
    );

    // Launch initial massive fireworks display
    if (this.game.entities?.launchTournamentFireworks) {
      this.game.entities.launchTournamentFireworks(new THREE.Vector3(0, 24, 0), 10);
    }
    this.fireworkTimer = 2.5;
  }

  // Triggered when Player 1 health reaches 0 in single-player match
  triggerDefeat() {
    this.state = TOURNAMENT_STATE.STAGE_READY;

    if (this.bossMob) {
      this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);
    }
    this.p2IsChargingKamehameha = false;
    this.p2KamehamehaChargeTime = 0;

    this.removeStageBarrier();

    // Hide Boss Bar & P2 HUD
    if (this.bossBarContainer) this.bossBarContainer.classList.add('hidden');
    if (this.p2Hud) this.p2Hud.classList.add('hidden');

    // Return to normal mode from dungeon mode
    this.game.dungeonMode?.exitDungeonMode(false);
    if (this.game.player) {
      this.game.player.isDungeonMode = false;
      this.game.player.isDead = true;
      this.game.player.health = 0;
      this.game.player.position.copy(this.hostPosition);
      if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);
    }

    // Clean up boss & any clones from the arena
    if (this.bossMob) {
      if (this.bossMob.mesh && this.game.scene) {
        this.game.scene.remove(this.bossMob.mesh);
      }
      if (this.bossMob.clones) {
        for (const cl of this.bossMob.clones) {
          if (cl?.mesh && this.game.scene) this.game.scene.remove(cl.mesh);
          const idx = this.game.mobs.mobs.indexOf(cl);
          if (idx !== -1) this.game.mobs.mobs.splice(idx, 1);
        }
      }
      const bIdx = this.game.mobs.mobs.indexOf(this.bossMob);
      if (bIdx !== -1) this.game.mobs.mobs.splice(bIdx, 1);
      this.bossMob = null;
    }

    // Announcer says: "You lost, please try again."
    this.showDialogue('Tournament Announcer', 'You lost, please try again.', 8.0);
    this.game.ui?.addChatMessage?.(
      '<span style="color:#ef4444;font-weight:bold;font-size:15px;">★ You lost, please try again. ★</span>'
    );

    // Show defeat overlay
    this.showDefeat();
  }

  handlePlayerDeath() {
    if (this.isTwoPlayer && this.state === TOURNAMENT_STATE.FIGHTING) {
      this.triggerPlayer2Victory();
    } else {
      this.triggerDefeat();
    }
  }

  // Triggered when Player 2 wins in Two-Player mode
  triggerPlayer2Victory() {
    if (this.state === TOURNAMENT_STATE.VICTORY) return;
    this.state = TOURNAMENT_STATE.VICTORY;

    if (this.bossMob) {
      this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);
    }
    this.p2IsChargingKamehameha = false;
    this.p2KamehamehaChargeTime = 0;

    this.removeStageBarrier();

    if (this.bossBarContainer) this.bossBarContainer.classList.add('hidden');
    if (this.p2Hud) this.p2Hud.classList.add('hidden');

    // Return to normal mode from dungeon mode
    this.game.dungeonMode?.exitDungeonMode(false);
    if (this.game.player) {
      this.game.player.isDungeonMode = false;
      this.game.player.health = this.game.player.maxHealth || 20;
    }

    if (this.game.sounds?.playVictoryFanfare) {
      this.game.sounds.playVictoryFanfare();
    }

    this.showDialogue(
      'Tournament Announcer',
      'JACKIE CHUN WINS THE TOURNAMENT! WHAT AN OUTSTANDING 2-PLAYER MARTIAL ARTS MATCH!',
      12.0
    );

    this.game.ui?.addChatMessage?.(
      '<span style="color:#ea580c;font-weight:bold;font-size:14px;">★ PLAYER 2 (JACKIE CHUN) WINS THE TOURNAMENT! ★</span>'
    );

    if (this.game.entities?.launchTournamentFireworks) {
      this.game.entities.launchTournamentFireworks(new THREE.Vector3(0, 24, 0), 10);
    }
    this.fireworkTimer = 2.5;
  }

  // Check if player position is within elevated fighting stage boundaries
  isOnStage(pos) {
    return (
      pos.x >= this.stageMinX &&
      pos.x <= this.stageMaxX &&
      pos.z >= this.stageMinZ &&
      pos.z <= this.stageMaxZ &&
      pos.y >= (this.stageMinY - 0.2)
    );
  }

  // Update loop called every frame
  update(dt, player) {
    if (!this.isTournamentMap) return;
    if (!player) return;

    // Fade out dialogue timer
    if (this.dialogueTimer > 0) {
      this.dialogueTimer -= dt;
      if (this.dialogueTimer <= 0) {
        this.hideDialogue();
      }
    }

    const playerPos = player.position;

    // Check interaction with host
    if (this.state === TOURNAMENT_STATE.WAITING_FOR_TALK) {
      this.ensureHost();
      if (this.hostMob && this.hostMob.mesh) {
        const distToHost = playerPos.distanceTo(this.hostMob.mesh.position);
        if (distToHost < 3.2 && !this.hasTalked) {
          this.talkToHost();
        }
      }
    }

    // Update fight status & boss bar
    if (this.state === TOURNAMENT_STATE.FIGHTING) {
      // Keep player inside the fighting stage bounds
      const minX = this.stageMinX + 0.35;
      const maxX = this.stageMaxX - 0.35;
      const minZ = this.stageMinZ + 0.35;
      const maxZ = this.stageMaxZ - 0.35;
      const minY = this.stageMinY;

      if (player.position.x < minX) { player.position.x = minX; if (player.velocity) player.velocity.x = 0; }
      else if (player.position.x > maxX) { player.position.x = maxX; if (player.velocity) player.velocity.x = 0; }

      if (player.position.z < minZ) { player.position.z = minZ; if (player.velocity) player.velocity.z = 0; }
      else if (player.position.z > maxZ) { player.position.z = maxZ; if (player.velocity) player.velocity.z = 0; }

      if (player.position.y < minY) {
        player.position.y = minY;
        if (player.velocity && player.velocity.y < 0) {
          player.velocity.y = 0;
          player.onGround = true;
        }
      }

      // Cooldowns for Player 2
      this.p2PunchCooldown = Math.max(0, this.p2PunchCooldown - dt);
      this.p2TeleportCooldown = Math.max(0, this.p2TeleportCooldown - dt);
      if (this.p2IsChargingKamehameha) {
        this.p2KamehamehaChargeTime += dt;
      }

      // Check if Player 1 died
      if (player.health <= 0) {
        if (this.isTwoPlayer) {
          this.triggerPlayer2Victory();
        } else {
          this.triggerDefeat();
        }
        return;
      }

      if (this.bossMob) {
        const pct = Math.max(0, Math.min(100, (this.bossMob.health / this.bossMob.maxHealth) * 100));
        if (this.bossBarFill) {
          this.bossBarFill.style.width = `${pct}%`;
        }

        // Update Player 2 HUD
        if (this.isTwoPlayer) {
          if (this.p2HealthBar) this.p2HealthBar.style.width = `${pct}%`;
          if (this.p2HpText) this.p2HpText.textContent = `HP: ${Math.max(0, this.bossMob.health)} / ${this.bossMob.maxHealth}`;
          if (this.p2TeleportBadge) {
            if (this.p2TeleportCooldown <= 0) {
              this.p2TeleportBadge.textContent = 'TELEPORT [Backspace]: READY';
              this.p2TeleportBadge.className = 'p2-badge-ready';
            } else {
              this.p2TeleportBadge.textContent = `TELEPORT: ${this.p2TeleportCooldown.toFixed(1)}s`;
              this.p2TeleportBadge.className = 'p2-badge-cooldown';
            }
          }

          // Player 2 Movement & Combat Physics
          if (!this.bossMob.dying) {
            if (this.p2IsChargingKamehameha) {
              // Stationary while charging Kamehameha
              this.bossMob.velocity.x = 0;
              this.bossMob.velocity.z = 0;

              // Face opponent (Player 1)
              const toP1 = player.position.clone().sub(this.bossMob.mesh.position);
              toP1.y = 0;
              if (toP1.lengthSq() > 0.01) {
                this.bossMob.yaw = Math.atan2(toP1.x, toP1.z);
                this.bossMob.mesh.rotation.y = this.bossMob.yaw;
              }

              // Cupped arm pose
              if (this.bossMob.leftArm && this.bossMob.rightArm) {
                this.bossMob.leftArm.rotation.set(-Math.PI / 2.3, 0.15, 0.25);
                this.bossMob.rightArm.rotation.set(-Math.PI / 2.3, -0.15, -0.25);
              }

              // Pulse & scale charge sphere in hands
              const sphere = this.bossMob.chargeSphereGroup || this.game.mobs?.ensureJackieChargeSphere?.(this.bossMob);
              if (sphere) {
                const chargeProg = Math.min(1.0, this.p2KamehamehaChargeTime / 2.2);
                const pulse = 0.5 + chargeProg * 0.9 + Math.sin(Date.now() * 0.03) * 0.12;
                sphere.scale.set(pulse, pulse, pulse);

                if (Math.random() < 0.45) {
                  const worldPos = new THREE.Vector3();
                  sphere.getWorldPosition(worldPos);
                  const skillsMgr = this.game.skills || this.game.dragonballSkills;
                  skillsMgr?.spawnEnergySparks?.(worldPos, 2, 0x00f0ff);
                }
              }

              // Auto-release if held to maximum power (2.5s)
              if (this.p2KamehamehaChargeTime >= 2.5) {
                this.p2ReleaseKamehameha();
              }
            } else {
              let vx = 0;
              let vz = 0;
              const speed = 4.2;
              if (this.p2Keys.up) vz -= 1;
              if (this.p2Keys.down) vz += 1;
              if (this.p2Keys.left) vx -= 1;
              if (this.p2Keys.right) vx += 1;

              if (vx !== 0 || vz !== 0) {
                const len = Math.hypot(vx, vz);
                vx = (vx / len) * speed;
                vz = (vz / len) * speed;
                this.bossMob.yaw = Math.atan2(vx, vz);
                this.bossMob.mesh.rotation.y = this.bossMob.yaw;
              }
              this.bossMob.velocity.x = vx;
              this.bossMob.velocity.z = vz;
            }

            // Clamping to stage
            this.bossMob.mesh.position.x = Math.max(this.stageMinX, Math.min(this.stageMaxX, this.bossMob.mesh.position.x));
            this.bossMob.mesh.position.z = Math.max(this.stageMinZ, Math.min(this.stageMaxZ, this.bossMob.mesh.position.z));
          }
        }

        // Check if boss died
        if (this.bossMob.health <= 0 || this.bossMob.dying) {
          this.triggerVictory();
        }
      }
    }

    // Victory celebration loop: fireworks continuously launched in the sky
    if (this.state === TOURNAMENT_STATE.VICTORY) {
      this.fireworkTimer -= dt;
      if (this.fireworkTimer <= 0) {
        this.fireworkTimer = 3.0 + Math.random() * 1.5;
        if (this.game.entities?.launchTournamentFireworks) {
          this.game.entities.launchTournamentFireworks(new THREE.Vector3(0, 24, 0), 6);
        }
      }
    }
  }

  // Full cleanup of tournament elements (e.g. when in or switching to normal world)
  cleanup() {
    this.removeStageBarrier();
    this.hideDialogue();
    this.hideSetupModal();
    this.hideDefeat();
    if (this.bossMob) {
      this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);
    }
    this.p2IsChargingKamehameha = false;
    this.p2KamehamehaChargeTime = 0;
    if (this.bossBarContainer) this.bossBarContainer.classList.add('hidden');
    if (this.p2Hud) this.p2Hud.classList.add('hidden');
    if (this.championOverlay) {
      this.championOverlay.classList.remove('visible');
      this.championOverlay.classList.add('hidden');
    }
    if (this.decorationsGroup && this.game?.scene) {
      this.game.scene.remove(this.decorationsGroup);
      this.decorationsGroup = null;
    }
    if (this.hostMob && this.game?.mobs?.mobs) {
      const idx = this.game.mobs.mobs.indexOf(this.hostMob);
      if (idx !== -1) {
        if (this.hostMob.mesh && this.game.scene) {
          this.game.scene.remove(this.hostMob.mesh);
        }
        this.game.mobs.mobs.splice(idx, 1);
      }
      this.hostMob = null;
    }
  }

  // Reset tournament progression (e.g. on new map load)
  reset() {
    this.removeStageBarrier();
    this.state = TOURNAMENT_STATE.WAITING_FOR_TALK;
    this.hasTalked = false;
    if (this.bossMob) {
      this.game.mobs?.removeJackieChargeSphere?.(this.bossMob);
    }
    this.p2IsChargingKamehameha = false;
    this.p2KamehamehaChargeTime = 0;
    this.bossMob = null;
    this.hostMob = null;
    this.hideDialogue();
    this.hideSetupModal();
    this.hideDefeat();
    if (this.bossBarContainer) this.bossBarContainer.classList.add('hidden');
    if (this.p2Hud) this.p2Hud.classList.add('hidden');
    if (this.championOverlay) {
      this.championOverlay.classList.remove('visible');
      this.championOverlay.classList.add('hidden');
    }
  }
}
