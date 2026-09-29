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

    this.decorationsGroup = null;
  }

  // Create high-resolution 3D sign "天下一武道会" and Dragon Ball gate decorations
  ensureDecorations() {
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

  // Triggered when player right-clicks or approaches the Host
  talkToHost() {
    if (this.state === TOURNAMENT_STATE.FIGHTING || this.state === TOURNAMENT_STATE.VICTORY) return;

    this.hasTalked = true;
    this.state = TOURNAMENT_STATE.STAGE_READY;

    if (this.game.sounds?.playHostSpeak) {
      this.game.sounds.playHostSpeak();
    }

    this.showDialogue(
      'Tournament Announcer',
      'Welcome to the World Martial Arts Tournament! If you defeat the enderman, you will be the world champion!',
      7.0
    );

    // Announce in chat as well for accessibility
    this.game.ui?.addChatMessage?.(
      '<span style="color:#f59e0b;font-weight:bold;">[Announcer]</span> If you defeat the enderman, you will be the world champion! Step onto the stage to begin!'
    );
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

  // Trigger Enderman Boss spawn on stage
  startFight() {
    if (this.state === TOURNAMENT_STATE.FIGHTING || this.state === TOURNAMENT_STATE.VICTORY) return;
    this.state = TOURNAMENT_STATE.FIGHTING;

    this.showDialogue(
      'Tournament Announcer',
      'THE BATTLE COMMENCES! Defeat the Enderman to win the tournament championship!',
      4.0
    );

    // Dramatic spawn at center of fighting stage
    const spawnPos = new THREE.Vector3(0, 24.5, 0);
    this.game.entities?.spawnEndermanParticles(spawnPos.clone().add(new THREE.Vector3(0, 1.5, 0)), 40);

    // Spawn Enderman Boss
    this.bossMob = this.game.mobs.spawnEnderman(spawnPos.x, spawnPos.y, spawnPos.z);

    if (this.game.sounds?.playEndermanTeleport) {
      this.game.sounds.playEndermanTeleport();
    }

    // Show Boss Health Bar
    if (this.bossBarContainer && this.bossBarFill) {
      this.bossBarContainer.classList.remove('hidden');
      this.bossBarFill.style.width = '100%';
      if (this.bossBarName) {
        this.bossBarName.textContent = 'World Martial Arts Challenger: The Enderman';
      }
    }

    this.game.ui?.addChatMessage?.(
      '<span style="color:#ec4899;font-weight:bold;">[Tournament]</span> The Enderman Challenger has entered the arena!'
    );
  }

  // Triggered when Enderman Boss is defeated
  triggerVictory() {
    if (this.state === TOURNAMENT_STATE.VICTORY) return;
    this.state = TOURNAMENT_STATE.VICTORY;

    // Hide Boss Bar
    if (this.bossBarContainer) {
      this.bossBarContainer.classList.add('hidden');
    }

    // Play Grand Victory Fanfare
    if (this.game.sounds?.playVictoryFanfare) {
      this.game.sounds.playVictoryFanfare();
    }

    // Show Victory Screen
    if (this.championOverlay) {
      this.championOverlay.classList.remove('hidden');
      this.championOverlay.classList.add('visible');
    }

    this.showDialogue(
      'Tournament Announcer',
      'LADIES AND GENTLEMEN, WE HAVE A NEW WORLD CHAMPION! WHAT AN INCREDIBLE VICTORY!',
      12.0
    );

    this.game.ui?.addChatMessage?.(
      '<span style="color:#eab308;font-weight:bold;font-size:14px;">★ CONGRATULATIONS! You defeated the Enderman and became the World Martial Arts Champion! ★</span>'
    );

    // Launch initial massive fireworks display
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

    // Check if player steps on stage after talking to host
    if (this.state === TOURNAMENT_STATE.STAGE_READY) {
      if (this.isOnStage(playerPos)) {
        this.startFight();
      }
    }

    // Update fight status & boss bar
    if (this.state === TOURNAMENT_STATE.FIGHTING) {
      if (this.bossMob) {
        const pct = Math.max(0, Math.min(100, (this.bossMob.health / this.bossMob.maxHealth) * 100));
        if (this.bossBarFill) {
          this.bossBarFill.style.width = `${pct}%`;
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

  // Reset tournament progression (e.g. on new map load)
  reset() {
    this.state = TOURNAMENT_STATE.WAITING_FOR_TALK;
    this.hasTalked = false;
    this.bossMob = null;
    this.hostMob = null;
    this.hideDialogue();
    if (this.bossBarContainer) this.bossBarContainer.classList.add('hidden');
    if (this.championOverlay) {
      this.championOverlay.classList.remove('visible');
      this.championOverlay.classList.add('hidden');
    }
  }
}
