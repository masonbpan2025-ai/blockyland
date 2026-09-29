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
  }

  // Find or spawn tournament host
  ensureHost() {
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
