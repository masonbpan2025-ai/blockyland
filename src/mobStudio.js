import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { MobLibrary } from './mobLibrary.js';
import { showConfirmDialog } from './dialogUtils.js';

export class MobStudioManager {
  constructor(game) {
    this.game = game;
    this.isActive = false;
    this.previewMobInstance = null;
    this.pedestalOrigin = new THREE.Vector3(0, 4, 6);
    this.pedestalBlocks = [];

    // Current Mob State being edited
    this.currentMob = {
      id: 'custom_mob_preview',
      name: 'Custom Mob',
      description: 'A custom mob designed in Mob Studio',
      look: {
        modelType: 'humanoid',
        mainColor: '#7c3aed',
        accentColor: '#ec4899',
        eyeColor: '#facc15',
        scale: 1.0,
        ears: 'none',
        earTipColor: null,
        tail: 'none',
        tailColor: null,
        hasCheekPatches: false,
        cheekColor: '#e3342f',
        hasMouth: false,
        hasNose: false,
        hasBackStripes: false,
        hasWings: false,
        hasHorns: false,
        hasGlowingEyes: true
      },
      behavior: {
        type: 'hostile',
        health: 40,
        speed: 2.6,
        attack: 5,
        followPlayer: false,
        range: 18
      },
      skills: ['fireball'],
      eggColors: {
        primary: '#7c3aed',
        secondary: '#ec4899'
      }
    };

    // DOM Elements
    const hasDoc = typeof document !== 'undefined';
    this.studioPanel = hasDoc ? document.getElementById('mob-parameter-panel') : null;
    this.mobNameInput = hasDoc ? document.getElementById('mob-input-name') : null;
    this.modelSelect = hasDoc ? document.getElementById('mob-select-model') : null;
    this.mainColorInput = hasDoc ? document.getElementById('mob-color-main') : null;
    this.accentColorInput = hasDoc ? document.getElementById('mob-color-accent') : null;
    this.eyeColorInput = hasDoc ? document.getElementById('mob-color-eye') : null;
    this.scaleSlider = hasDoc ? document.getElementById('mob-slider-scale') : null;
    this.scaleBadge = hasDoc ? document.getElementById('mob-badge-scale') : null;
    this.checkWings = hasDoc ? document.getElementById('mob-check-wings') : null;
    this.checkHorns = hasDoc ? document.getElementById('mob-check-horns') : null;
    this.checkGlowingEyes = hasDoc ? document.getElementById('mob-check-glowing-eyes') : null;
    this.checkPointedEars = hasDoc ? document.getElementById('mob-check-pointed-ears') : null;
    this.checkCheekPatches = hasDoc ? document.getElementById('mob-check-cheek-patches') : null;
    this.checkLightningTail = hasDoc ? document.getElementById('mob-check-lightning-tail') : null;

    this.behaviorSelect = hasDoc ? document.getElementById('mob-select-behavior') : null;
    this.healthSlider = hasDoc ? document.getElementById('mob-slider-health') : null;
    this.healthBadge = hasDoc ? document.getElementById('mob-badge-health') : null;
    this.speedSlider = hasDoc ? document.getElementById('mob-slider-speed') : null;
    this.speedBadge = hasDoc ? document.getElementById('mob-badge-speed') : null;
    this.attackSlider = hasDoc ? document.getElementById('mob-slider-attack') : null;
    this.attackBadge = hasDoc ? document.getElementById('mob-badge-attack') : null;

    this.skillsContainer = hasDoc ? document.getElementById('mob-skills-checkboxes') : null;
    this.btnSave = hasDoc ? document.getElementById('btn-mob-studio-save') : null;
    this.btnOpen = hasDoc ? document.getElementById('btn-mob-studio-open') : null;
    this.btnTestAttack = hasDoc ? document.getElementById('btn-mob-test-attack') : null;

    this.saveModal = hasDoc ? document.getElementById('modal-save-mob') : null;
    this.saveInput = hasDoc ? document.getElementById('input-save-mob-name') : null;
    this.saveConflictMsg = hasDoc ? document.getElementById('save-mob-conflict-msg') : null;
    this.btnConfirmSave = hasDoc ? document.getElementById('btn-confirm-save-mob') : null;
    this.btnCancelSave = hasDoc ? document.getElementById('btn-cancel-save-mob') : null;

    this.openModal = hasDoc ? document.getElementById('modal-open-mob') : null;
    this.openList = hasDoc ? document.getElementById('studio-open-mob-list') : null;
    this.openSearch = hasDoc ? document.getElementById('input-search-open-mob') : null;
    this.btnCloseOpen = hasDoc ? document.getElementById('btn-close-open-mob') : null;

    if (hasDoc) {
      this.bindEvents();
    }
  }

  bindEvents() {
    this.btnSave?.addEventListener('click', () => this.showSaveModal());
    this.btnOpen?.addEventListener('click', () => this.showOpenModal());
    this.btnConfirmSave?.addEventListener('click', () => this.confirmSave());
    this.btnCancelSave?.addEventListener('click', () => this.hideSaveModal());
    this.btnCloseOpen?.addEventListener('click', () => this.hideOpenModal());

    this.btnTestAttack?.addEventListener('click', () => this.testPreviewAction());

    this.saveInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmSave();
      }
    });

    this.openSearch?.addEventListener('input', (e) => {
      this.renderOpenMobList(e.target.value);
    });

    // Form inputs updating mob state
    this.mobNameInput?.addEventListener('input', (e) => {
      this.currentMob.name = e.target.value || 'Custom Mob';
    });

    this.modelSelect?.addEventListener('change', (e) => {
      this.currentMob.look.modelType = e.target.value;
      this.updatePreviewMob();
    });

    this.mainColorInput?.addEventListener('input', (e) => {
      this.currentMob.look.mainColor = e.target.value;
      this.currentMob.eggColors.primary = e.target.value;
      this.updatePreviewMob();
    });

    this.accentColorInput?.addEventListener('input', (e) => {
      this.currentMob.look.accentColor = e.target.value;
      this.currentMob.eggColors.secondary = e.target.value;
      this.updatePreviewMob();
    });

    this.eyeColorInput?.addEventListener('input', (e) => {
      this.currentMob.look.eyeColor = e.target.value;
      this.updatePreviewMob();
    });

    this.scaleSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.currentMob.look.scale = val;
      if (this.scaleBadge) this.scaleBadge.textContent = `${val.toFixed(1)}x`;
      this.updatePreviewMob();
    });

    this.checkWings?.addEventListener('change', (e) => {
      this.currentMob.look.hasWings = e.target.checked;
      this.updatePreviewMob();
    });

    this.checkHorns?.addEventListener('change', (e) => {
      this.currentMob.look.hasHorns = e.target.checked;
      this.updatePreviewMob();
    });

    this.checkGlowingEyes?.addEventListener('change', (e) => {
      this.currentMob.look.hasGlowingEyes = e.target.checked;
      this.updatePreviewMob();
    });

    this.checkPointedEars?.addEventListener('change', (e) => {
      this.currentMob.look.ears = e.target.checked ? 'pointed' : 'none';
      if (e.target.checked && !this.currentMob.look.earTipColor) {
        this.currentMob.look.earTipColor = '#111111';
      }
      this.updatePreviewMob();
    });

    this.checkCheekPatches?.addEventListener('change', (e) => {
      this.currentMob.look.hasCheekPatches = e.target.checked;
      if (e.target.checked) {
        this.currentMob.look.hasMouth = true;
        this.currentMob.look.hasNose = true;
      }
      this.updatePreviewMob();
    });

    this.checkLightningTail?.addEventListener('change', (e) => {
      this.currentMob.look.tail = e.target.checked ? 'lightning' : 'none';
      this.updatePreviewMob();
    });

    this.behaviorSelect?.addEventListener('change', (e) => {
      const val = e.target.value;
      this.currentMob.behavior.type = val;
      this.currentMob.behavior.followPlayer = (val === 'pet');
      this.updatePreviewMob();
    });

    this.healthSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.currentMob.behavior.health = val;
      if (this.healthBadge) this.healthBadge.textContent = `${val} HP`;
      if (this.previewMobInstance) {
        this.previewMobInstance.health = val;
        this.previewMobInstance.maxHealth = val;
      }
    });

    this.speedSlider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.currentMob.behavior.speed = val;
      if (this.speedBadge) this.speedBadge.textContent = `${val.toFixed(1)}`;
      if (this.previewMobInstance) this.previewMobInstance.speed = val;
    });

    this.attackSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.currentMob.behavior.attack = val;
      if (this.attackBadge) this.attackBadge.textContent = `${val}`;
      if (this.previewMobInstance) this.previewMobInstance.attackDamage = val;
    });

    // Skill checkboxes
    if (this.skillsContainer) {
      const checkboxes = this.skillsContainer.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          const selected = [];
          checkboxes.forEach(box => {
            if (box.checked) selected.push(box.value);
          });
          this.currentMob.skills = selected;
          if (this.previewMobInstance) this.previewMobInstance.skills = selected;
        });
      });
    }
  }

  // --- Entering Mob Studio Mode ---
  enterStudio() {
    this.isActive = true;
    if (this.game.mechanisms) {
      this.game.mechanisms.setMechanism('default', this.game);
    }
    this.game.player.gamemode = 'creative';
    this.game.worldType = 'mob_studio';

    // Position player facing pedestal
    this.game.player.position.set(0, 5, 0);
    this.game.player.yaw = 0; // facing +Z towards (0, 5, 6)
    this.game.player.pitch = 0;
    if (this.game.player.velocity) this.game.player.velocity.set(0, 0, 0);

    // Build showroom pedestal and spawn preview mob
    this.buildPedestal();
    this.updatePreviewMob();

    // Open Terminal in Mob Studio Mode
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('gemini-modal');
      if (modal) {
        modal.classList.add('studio-mode');
        modal.classList.add('mob-studio-mode');
      }
      if (this.studioPanel) {
        this.studioPanel.classList.remove('hidden');
      }
      this.syncPanelFromState();
    }

    if (this.game.ui?.openGeminiTerminal) {
      this.game.ui.openGeminiTerminal();
    }

    this.game.ui?.addChatMessage?.(
      '<span style="color:#d946ef;font-weight:bold;">[Mob Studio]</span> Welcome to Mob Studio! Use the panel or prompt the Agent (e.g. "make a fast red fire dragon with 100 hp that shoots fireballs") to create custom mobs.'
    );
  }

  exitStudio() {
    this.isActive = false;
    this.removePreviewMob();
    this.clearPedestal();

    if (typeof document !== 'undefined') {
      const modal = document.getElementById('gemini-modal');
      if (modal) {
        modal.classList.remove('studio-mode');
        modal.classList.remove('mob-studio-mode');
      }
      if (this.studioPanel) {
        this.studioPanel.classList.add('hidden');
      }
    }
  }

  // --- Pedestal Display ---
  buildPedestal() {
    if (!this.game.world) return;
    this.pedestalBlocks = [];
    const ox = this.pedestalOrigin.x;
    const oy = this.pedestalOrigin.y;
    const oz = this.pedestalOrigin.z;

    // 3x3 stone bricks dais with sea lantern center & quartz corners
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const x = ox + dx;
        const y = oy;
        const z = oz + dz;
        const isCenter = (dx === 0 && dz === 0);
        const isCorner = (Math.abs(dx) === 1 && Math.abs(dz) === 1);
        const blockId = isCenter ? BLOCKS.SEA_LANTERN : (isCorner ? BLOCKS.SANDSTONE : BLOCKS.STONE_BRICKS);

        this.pedestalBlocks.push({ x, y, z, prevId: this.game.world.getVoxel(x, y, z) });
        this.game.world.setVoxel(x, y, z, blockId);
      }
    }

    // 4 Corner Torches
    const corners = [
      { x: ox - 1, z: oz - 1 },
      { x: ox + 1, z: oz - 1 },
      { x: ox - 1, z: oz + 1 },
      { x: ox + 1, z: oz + 1 }
    ];
    for (const c of corners) {
      this.pedestalBlocks.push({ x: c.x, y: oy + 1, z: c.z, prevId: this.game.world.getVoxel(c.x, oy + 1, c.z) });
      this.game.world.setVoxel(c.x, oy + 1, c.z, BLOCKS.TORCH);
    }

    this.game.refreshDirtyChunks?.();
  }

  clearPedestal() {
    if (!this.game.world) return;
    for (const b of this.pedestalBlocks) {
      const groundId = b.y === 0 ? BLOCKS.BEDROCK : (b.y <= 3 ? BLOCKS.DIRT : (b.y === 4 ? BLOCKS.GRASS : BLOCKS.AIR));
      this.game.world.setVoxel(b.x, b.y, b.z, groundId);
    }
    this.pedestalBlocks = [];
    this.game.refreshDirtyChunks?.();
  }

  // --- Preview Mob Instance ---
  updatePreviewMob() {
    this.removePreviewMob();
    if (!this.game.mobs) return;

    const ox = this.pedestalOrigin.x;
    const oy = this.pedestalOrigin.y + 1; // standing on dais
    const oz = this.pedestalOrigin.z;

    this.previewMobInstance = this.game.mobs.spawnCustomMob(this.currentMob, ox, oy, oz);
    if (this.previewMobInstance) {
      this.previewMobInstance.isPreview = true;
      this.previewMobInstance.yaw = Math.PI; // Face player at (0, 5, 0)
    }
  }

  removePreviewMob() {
    if (this.previewMobInstance) {
      if (this.previewMobInstance.mesh && this.game.scene) {
        this.game.scene.remove(this.previewMobInstance.mesh);
        this.previewMobInstance.mesh.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
        });
      }
      const idx = this.game.mobs?.mobs?.indexOf(this.previewMobInstance);
      if (idx !== undefined && idx >= 0) {
        this.game.mobs.mobs.splice(idx, 1);
      }
      this.previewMobInstance = null;
    }
  }

  testPreviewAction() {
    if (!this.previewMobInstance) return;
    // Play demonstration skill animation
    this.previewMobInstance.animTime = 0;
    if (this.previewMobInstance.leftArm && this.previewMobInstance.rightArm) {
      this.previewMobInstance.leftArm.rotation.x = -Math.PI / 1.8;
      this.previewMobInstance.rightArm.rotation.x = -Math.PI / 1.8;
    }
    if (this.previewMobInstance.wings) {
      this.previewMobInstance.wings.left.rotation.z = 0.6;
      this.previewMobInstance.wings.right.rotation.z = -0.6;
    }
    this.previewMobInstance.velocity.y = 4.5; // Little jump
    if (this.game.sounds?.playZombie) this.game.sounds.playZombie();
    if (this.game.entities?.spawnEndermanParticles) {
      this.game.entities.spawnEndermanParticles(this.previewMobInstance.mesh.position, 16);
    }
  }

  // --- Sync Controls Panel with Mob State ---
  syncPanelFromState() {
    if (!this.studioPanel) return;

    if (this.mobNameInput) this.mobNameInput.value = this.currentMob.name || '';
    if (this.modelSelect) this.modelSelect.value = this.currentMob.look.modelType || 'humanoid';
    if (this.mainColorInput) this.mainColorInput.value = this.currentMob.look.mainColor || '#7c3aed';
    if (this.accentColorInput) this.accentColorInput.value = this.currentMob.look.accentColor || '#ec4899';
    if (this.eyeColorInput) this.eyeColorInput.value = this.currentMob.look.eyeColor || '#facc15';

    const scale = this.currentMob.look.scale || 1.0;
    if (this.scaleSlider) this.scaleSlider.value = scale;
    if (this.scaleBadge) this.scaleBadge.textContent = `${scale.toFixed(1)}x`;

    if (this.checkWings) this.checkWings.checked = Boolean(this.currentMob.look.hasWings);
    if (this.checkHorns) this.checkHorns.checked = Boolean(this.currentMob.look.hasHorns);
    if (this.checkGlowingEyes) this.checkGlowingEyes.checked = Boolean(this.currentMob.look.hasGlowingEyes);
    if (this.checkPointedEars) this.checkPointedEars.checked = (this.currentMob.look.ears === 'pointed');
    if (this.checkCheekPatches) this.checkCheekPatches.checked = Boolean(this.currentMob.look.hasCheekPatches);
    if (this.checkLightningTail) this.checkLightningTail.checked = (this.currentMob.look.tail === 'lightning');

    if (this.behaviorSelect) this.behaviorSelect.value = this.currentMob.behavior.type || 'hostile';

    const hp = this.currentMob.behavior.health || 40;
    if (this.healthSlider) this.healthSlider.value = hp;
    if (this.healthBadge) this.healthBadge.textContent = `${hp} HP`;

    const spd = this.currentMob.behavior.speed || 2.6;
    if (this.speedSlider) this.speedSlider.value = spd;
    if (this.speedBadge) this.speedBadge.textContent = `${spd.toFixed(1)}`;

    const atk = this.currentMob.behavior.attack || 5;
    if (this.attackSlider) this.attackSlider.value = atk;
    if (this.attackBadge) this.attackBadge.textContent = `${atk}`;

    if (this.skillsContainer) {
      const activeSkills = new Set(this.currentMob.skills || []);
      const checkboxes = this.skillsContainer.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(box => {
        box.checked = activeSkills.has(box.value);
      });
    }
  }

  // --- Prompt Parsing in Mob Studio ---
  handleAgentPrompt(promptText) {
    if (!promptText || typeof promptText !== 'string') return false;
    const p = promptText.trim().toLowerCase();

    // Check if prompt is mob-related
    const mobKeywords = ['mob', 'creature', 'monster', 'dragon', 'beast', 'golem', 'pet', 'ninja', 'knight', 'dog', 'cat', 'wolf', 'titan', 'demon', 'warrior', 'spider', 'robot', 'slime', 'zombie', 'skeleton'];
    const isMobPrompt = mobKeywords.some(k => p.includes(k)) || p.includes('hp') || p.includes('health') || p.includes('attack') || p.includes('behavior') || p.includes('skill') || p.includes('fireball') || p.includes('teleport');

    if (!isMobPrompt) return false;

    // A named character needs the model. This parser only knows one body colour, a
    // model type and a few boolean flags, so "make a Pikachu" used to become a
    // plain purple humanoid. Anything that is not a description the parser can
    // fully honour is handed to the language model instead.
    if (this.needsLanguageModel(promptText)) return false;

    // 1. Model Type
    if (p.includes('dragon') || p.includes('flying') || p.includes('bird') || p.includes('bat') || p.includes('winged')) {
      this.currentMob.look.modelType = 'flying';
      this.currentMob.look.hasWings = true;
    } else if (p.includes('golem') || p.includes('titan') || p.includes('giant') || p.includes('colossus')) {
      this.currentMob.look.modelType = 'golem';
      this.currentMob.look.scale = 1.4;
    } else if (p.includes('dog') || p.includes('cat') || p.includes('wolf') || p.includes('quadruped') || p.includes('pig') || p.includes('beast') || p.includes('horse')) {
      this.currentMob.look.modelType = 'quadruped';
    } else if (p.includes('slime') || p.includes('blob') || p.includes('cube')) {
      this.currentMob.look.modelType = 'slime';
    } else {
      this.currentMob.look.modelType = 'humanoid';
    }

    // 2. Color extraction
    const colorMap = {
      'red': '#ef4444', 'fire': '#dc2626', 'flame': '#f97316', 'orange': '#f97316',
      'blue': '#3b82f6', 'ice': '#38bdf8', 'frost': '#0284c7', 'cyan': '#06b6d4',
      'green': '#22c55e', 'poison': '#10b981', 'emerald': '#059669', 'lime': '#84cc16',
      'purple': '#a855f7', 'shadow': '#18181b', 'dark': '#1e1b4b', 'black': '#09090b',
      'yellow': '#eab308', 'gold': '#facc15', 'golden': '#f59e0b', 'electric': '#fde047',
      'white': '#f8fafc', 'silver': '#cbd5e1', 'iron': '#94a3b8', 'pink': '#ec4899', 'magenta': '#d946ef'
    };

    for (const [name, hex] of Object.entries(colorMap)) {
      if (p.includes(name)) {
        this.currentMob.look.mainColor = hex;
        this.currentMob.eggColors.primary = hex;
        break;
      }
    }

    // 3. Features (wings, horns, glowing eyes)
    if (p.includes('wing') || p.includes('flying')) this.currentMob.look.hasWings = true;
    if (p.includes('horn') || p.includes('demon') || p.includes('dragon')) this.currentMob.look.hasHorns = true;
    if (p.includes('glow') || p.includes('glowing eye') || p.includes('laser') || p.includes('robot')) this.currentMob.look.hasGlowingEyes = true;

    // 4. Stats extraction
    const hpMatch = p.match(/(?:health|hp|life)\s*(?:of|:|=)?\s*(\d+)/i) || p.match(/(\d+)\s*(?:hp|health)/i);
    if (hpMatch) {
      this.currentMob.behavior.health = Math.min(500, Math.max(5, parseInt(hpMatch[1], 10)));
    }

    const atkMatch = p.match(/(?:attack|damage|dmg|strength)\s*(?:of|:|=)?\s*(\d+)/i) || p.match(/(\d+)\s*(?:attack|damage|dmg)/i);
    if (atkMatch) {
      this.currentMob.behavior.attack = Math.min(50, Math.max(1, parseInt(atkMatch[1], 10)));
    }

    const spdMatch = p.match(/(?:speed)\s*(?:of|:|=)?\s*([\d.]+)/i);
    if (spdMatch) {
      this.currentMob.behavior.speed = Math.min(6.0, Math.max(0.5, parseFloat(spdMatch[1])));
    } else if (p.includes('very fast') || p.includes('swift')) {
      this.currentMob.behavior.speed = 4.2;
    } else if (p.includes('fast')) {
      this.currentMob.behavior.speed = 3.5;
    } else if (p.includes('slow')) {
      this.currentMob.behavior.speed = 1.5;
    }

    // 5. Behavior extraction
    if (p.includes('pet') || p.includes('friendly') || p.includes('follow') || p.includes('tame')) {
      this.currentMob.behavior.type = 'pet';
      this.currentMob.behavior.followPlayer = true;
    } else if (p.includes('boss')) {
      this.currentMob.behavior.type = 'boss';
      this.currentMob.look.scale = Math.max(1.5, this.currentMob.look.scale);
      this.currentMob.behavior.health = Math.max(100, this.currentMob.behavior.health);
    } else if (p.includes('neutral')) {
      this.currentMob.behavior.type = 'neutral';
    } else if (p.includes('passive') || p.includes('peaceful')) {
      this.currentMob.behavior.type = 'passive';
    } else {
      this.currentMob.behavior.type = 'hostile';
    }

    // 6. Skills extraction
    const skills = new Set(this.currentMob.skills || []);
    if (p.includes('fireball') || p.includes('fire') || p.includes('flame')) skills.add('fireball');
    if (p.includes('teleport') || p.includes('blink') || p.includes('enderman')) skills.add('teleport');
    if (p.includes('leap') || p.includes('jump') || p.includes('slam')) skills.add('leap');
    if (p.includes('laser') || p.includes('beam') || p.includes('energy')) skills.add('laser');
    if (p.includes('heal') || p.includes('regenerat') || p.includes('medic')) skills.add('heal');
    if (p.includes('lightning') || p.includes('thunder') || p.includes('shock')) skills.add('lightning');
    if (p.includes('freeze') || p.includes('ice') || p.includes('frost')) skills.add('freeze');
    this.currentMob.skills = Array.from(skills);

    // 7. Mob Name inference
    const nameMatch = promptText.match(/(?:create|make|build|summon)\s+(?:a\s+|an\s+)?([A-Za-z\s]+?)(?:\s+with|\s+that|\s+having|\.|$)/i);
    if (nameMatch && nameMatch[1].trim()) {
      const rawName = nameMatch[1].trim();
      const clean = rawName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      if (clean.length < 24) {
        this.currentMob.name = clean;
      }
    }

    this.syncPanelFromState();
    this.updatePreviewMob();
    return true;
  }

  /**
   * Adopt a mob the language model designed, so it appears in the preview and the
   * parameter panel.
   *
   * Called when the agent runs a create_mob plan while Mob Studio is open. The
   * local keyword parser only understands a fixed vocabulary (one colour, a model
   * type, a few flags), so anything character-shaped — "make a Pikachu" — has to
   * come from the model to look like anything at all.
   *
   * @returns {boolean} true when a definition was applied
   */
  applyMobDefinition(definition) {
    if (!definition || typeof definition !== 'object') return false;
    const mob = definition.mob && typeof definition.mob === 'object' ? definition.mob : definition;
    const name = typeof mob.name === 'string' ? mob.name.trim() : '';
    if (!name) return false;

    const hex = (value, fallback) => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback);

    this.currentMob.name = name.slice(0, 40);
    if (typeof mob.description === 'string' && mob.description.trim()) {
      this.currentMob.description = mob.description.trim().slice(0, 200);
    }

    const look = mob.look || {};
    const modelTypes = ['biped_creature', 'humanoid', 'quadruped', 'flying', 'golem', 'slime'];
    if (modelTypes.includes(look.modelType)) this.currentMob.look.modelType = look.modelType;
    this.currentMob.look.mainColor = hex(look.mainColor, this.currentMob.look.mainColor);
    this.currentMob.look.accentColor = hex(look.accentColor, this.currentMob.look.accentColor);
    this.currentMob.look.eyeColor = hex(look.eyeColor, this.currentMob.look.eyeColor);
    if (typeof look.hasWings === 'boolean') this.currentMob.look.hasWings = look.hasWings;
    if (typeof look.hasHorns === 'boolean') this.currentMob.look.hasHorns = look.hasHorns;
    if (typeof look.hasGlowingEyes === 'boolean') this.currentMob.look.hasGlowingEyes = look.hasGlowingEyes;
    const scale = Number(look.scale);
    if (Number.isFinite(scale)) this.currentMob.look.scale = Math.min(3, Math.max(0.3, scale));

    // Anatomy and character feature attributes
    if (['pointed', 'long', 'round', 'none'].includes(look.ears)) this.currentMob.look.ears = look.ears;
    if (look.earTipColor) this.currentMob.look.earTipColor = hex(look.earTipColor, this.currentMob.look.earTipColor);
    if (['lightning', 'long', 'none'].includes(look.tail)) this.currentMob.look.tail = look.tail;
    if (look.tailColor) this.currentMob.look.tailColor = hex(look.tailColor, this.currentMob.look.tailColor);
    if (typeof look.hasCheekPatches === 'boolean') this.currentMob.look.hasCheekPatches = look.hasCheekPatches;
    if (look.cheekColor) this.currentMob.look.cheekColor = hex(look.cheekColor, this.currentMob.look.cheekColor);
    if (typeof look.hasMouth === 'boolean') this.currentMob.look.hasMouth = look.hasMouth;
    if (typeof look.hasNose === 'boolean') this.currentMob.look.hasNose = look.hasNose;
    if (typeof look.hasBackStripes === 'boolean') this.currentMob.look.hasBackStripes = look.hasBackStripes;
    if (typeof look.hasSnout === 'boolean') this.currentMob.look.hasSnout = look.hasSnout;

    // Pikachu enrichment: ensure authentic mascot features if not specified
    if (/pikachu/i.test(this.currentMob.name)) {
      if (!look.ears) this.currentMob.look.ears = 'pointed';
      if (!look.earTipColor) this.currentMob.look.earTipColor = '#111111';
      if (!look.tail) this.currentMob.look.tail = 'lightning';
      if (!look.tailColor) this.currentMob.look.tailColor = '#f7d02c';
      if (typeof look.hasCheekPatches !== 'boolean') this.currentMob.look.hasCheekPatches = true;
      if (!look.cheekColor) this.currentMob.look.cheekColor = '#e3342f';
      if (typeof look.hasMouth !== 'boolean') this.currentMob.look.hasMouth = true;
      if (typeof look.hasNose !== 'boolean') this.currentMob.look.hasNose = true;
      if (typeof look.hasBackStripes !== 'boolean') this.currentMob.look.hasBackStripes = true;
      if (typeof look.hasSnout !== 'boolean') this.currentMob.look.hasSnout = false;
      if (!this.currentMob.skills || !this.currentMob.skills.includes('lightning')) {
        this.currentMob.skills = ['lightning'];
      }
    }

    const behavior = mob.behavior || {};
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    if (['hostile', 'neutral', 'passive', 'pet', 'boss'].includes(behavior.type)) this.currentMob.behavior.type = behavior.type;
    if (Number.isFinite(Number(behavior.health))) this.currentMob.behavior.health = clamp(Math.round(Number(behavior.health)), 1, 500);
    if (Number.isFinite(Number(behavior.attack))) this.currentMob.behavior.attack = clamp(Math.round(Number(behavior.attack)), 0, 60);
    if (Number.isFinite(Number(behavior.speed))) this.currentMob.behavior.speed = clamp(Number(behavior.speed), 0.2, 8);
    if (Number.isFinite(Number(behavior.range))) this.currentMob.behavior.range = clamp(Math.round(Number(behavior.range)), 1, 48);
    if (typeof behavior.followPlayer === 'boolean') this.currentMob.behavior.followPlayer = behavior.followPlayer;
    if (behavior.type === 'pet') this.currentMob.behavior.followPlayer = true;

    const knownSkills = ['fireball', 'teleport', 'leap', 'laser', 'heal', 'lightning', 'freeze'];
    if (Array.isArray(mob.skills)) {
      this.currentMob.skills = mob.skills.filter(s => knownSkills.includes(s)).slice(0, 8);
    }

    // Keep the spawn egg colours in step with the body.
    this.currentMob.eggColors.primary = this.currentMob.look.mainColor;
    this.currentMob.eggColors.secondary = this.currentMob.look.accentColor;

    this.syncPanelFromState();
    this.updatePreviewMob();
    return true;
  }

  /**
   * Whether a prompt describes a specific character or appearance that this
   * keyword parser cannot represent, and so should go to the language model.
   *
   * The parser only handles a small vocabulary: a model type, one body colour and
   * three boolean features. A named character ("make a Pikachu") has a silhouette
   * and markings it can never produce, so claiming that prompt yields a wrong mob
   * that looks nothing like the request. Explicit stat-only descriptions such as
   * "make a fast red fire dragon with 100 hp that shoots fireballs" are still
   * handled instantly because the parser can honour every part of them.
   */
  needsLanguageModel(promptText) {
    const p = promptText.toLowerCase();

    // An explicit stat/behaviour description the parser fully understands.
    const hasStats = /\b(hp|health|attack|damage|speed)\b/.test(p) || /\d+\s*(hp|health)\b/.test(p);
    const hasBehaviour = /\b(hostile|neutral|passive|peaceful|pet|tame|friendly|boss|follow)\b/.test(p);
    const hasSkill = /\b(fireball|teleport|blink|leap|slam|laser|beam|heal|regenerat|lightning|thunder|shock|freeze|ice)\b/.test(p);
    const describesFully = hasStats && (hasBehaviour || hasSkill);

    // A proper noun or a specific character/franchise reference.
    const namedCharacter = /\b(pikachu|charizard|bulbasaur|squirtle|eevee|mewtwo|snorlax|gengar|garchomp|lucario|greninja|pokemon|pokémon|digimon|agumon|sonic|mario|luigi|link|zelda|kirby|yoshi|bowser|crash|spyro|toothless|smaug|godzilla|king kong|unicorn|phoenix|griffin|kraken|hydra|chimera|yeti|bigfoot|dragonite|rayquaza|charizard)\b/.test(p);

    // A look request the parser would silently reduce to one flat colour.
    const lookRequest = /\b(looks? like|resembling|styled like|similar to|markings?|stripes?|spots?|pattern|cheeks?|pouch|tail|ears?|beak|snout|mane|shell|armou?r|wings?|horns?|fins?|tentacles?)\b/.test(p);

    if (namedCharacter) return true;
    if (describesFully) return false;
    if (lookRequest) return true;

    // An adjective-only request ("a big scary purple beast") is fine locally.
    return false;
  }

  // --- Save Modal & Conflict Detection ---
  showSaveModal() {
    if (!this.saveModal) return;
    if (this.saveInput) {
      this.saveInput.value = this.currentMob.name || 'Custom Mob';
    }
    if (this.saveConflictMsg) {
      this.saveConflictMsg.classList.add('hidden');
      this.saveConflictMsg.textContent = '';
    }
    this.saveModal.classList.remove('hidden');
    setTimeout(() => this.saveInput?.focus(), 50);
  }

  hideSaveModal() {
    if (this.saveModal) this.saveModal.classList.add('hidden');
  }

  confirmSave() {
    const rawName = this.saveInput?.value || '';
    const cleanName = rawName.trim();

    if (!cleanName) {
      if (this.saveConflictMsg) {
        this.saveConflictMsg.textContent = 'Please enter a name for the mob.';
        this.saveConflictMsg.classList.remove('hidden');
      }
      return;
    }

    // Check if mob of the same name already exists
    let overwrite = false;
    const existing = MobLibrary.getMob(cleanName);
    if (existing) {
      if (existing.isBuiltin) {
        if (this.saveConflictMsg) {
          this.saveConflictMsg.textContent = `Cannot overwrite built-in mob "${cleanName}". Please choose a different name.`;
          this.saveConflictMsg.classList.remove('hidden');
        }
        return;
      }
      const wantsOverwrite = typeof confirm === 'function'
        ? confirm(`A mob named "${cleanName}" already exists. Do you want to overwrite it?`)
        : false;
      if (!wantsOverwrite) {
        if (this.saveConflictMsg) {
          this.saveConflictMsg.textContent = `A mob named "${cleanName}" already exists in the global library. Please choose a different name or confirm overwrite.`;
          this.saveConflictMsg.classList.remove('hidden');
        }
        return;
      }
      overwrite = true;
    }

    // Save to Mob Library
    this.currentMob.name = cleanName;
    const res = MobLibrary.saveMob({
      name: cleanName,
      description: `Custom ${cleanName} created in Mob Studio`,
      look: this.currentMob.look,
      behavior: this.currentMob.behavior,
      skills: this.currentMob.skills,
      eggColors: this.currentMob.eggColors
    }, overwrite);

    if (res.success) {
      this.hideSaveModal();
      const actionText = res.overwritten ? 'overwrote' : 'saved';
      this.game.ui?.addChatMessage?.(
        `<span style="color:#d946ef;font-weight:bold;">[Mob Studio]</span> Successfully ${actionText} "${cleanName}" to Mob Library! Its spawn egg is now available in Creative Mode.`
      );
    } else {
      if (this.saveConflictMsg) {
        this.saveConflictMsg.textContent = res.message || 'Failed to save mob.';
        this.saveConflictMsg.classList.remove('hidden');
      }
    }
  }

  // --- Open Mob Library Modal ---
  showOpenModal() {
    if (!this.openModal) return;
    this.openModal.classList.remove('hidden');
    if (this.openSearch) this.openSearch.value = '';
    this.renderOpenMobList();
    setTimeout(() => this.openSearch?.focus(), 50);
  }

  hideOpenModal() {
    if (this.openModal) this.openModal.classList.add('hidden');
  }

  renderOpenMobList(query = '') {
    if (!this.openList) return;
    this.openList.innerHTML = '';

    const q = (query || '').toLowerCase().trim();
    const all = MobLibrary.getAllMobs();
    const filtered = all.filter(m => !q || m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));

    if (filtered.length === 0) {
      this.openList.innerHTML = '<div class="studio-open-empty">No mobs found matching your search.</div>';
      return;
    }

    for (const mob of filtered) {
      const card = document.createElement('div');
      card.className = 'studio-open-card';

      // Egg Icon
      const eggIcon = MobLibrary.generateEggIcon(mob.look?.mainColor || '#8b5cf6', mob.look?.accentColor || '#ec4899');
      const img = document.createElement('img');
      img.className = 'studio-open-card-icon';
      img.src = eggIcon;
      img.alt = mob.name;

      const info = document.createElement('div');
      info.className = 'studio-open-card-info';

      const title = document.createElement('div');
      title.className = 'studio-open-card-name';
      title.textContent = mob.name;

      if (!mob.isBuiltin) {
        title.title = 'Double-click to rename';
        title.style.cursor = 'pointer';
        title.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (title.querySelector('input')) return;

          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'mc-input-text studio-rename-input';
          input.value = mob.name;

          let committed = false;
          const finish = (commit) => {
            if (committed) return;
            committed = true;
            if (!commit) {
              title.textContent = mob.name;
              return;
            }
            const newName = input.value.trim();
            if (!newName) {
              if (typeof alert === 'function') alert('Please enter a mob name.');
              title.textContent = mob.name;
              return;
            }
            if (newName === mob.name) {
              title.textContent = mob.name;
              return;
            }
            const res = MobLibrary.renameMob(mob.id, newName);
            if (res.success) {
              mob.name = newName;
              title.textContent = newName;
              if (this.currentMob?.id === mob.id) {
                this.currentMob.name = newName;
                if (this.saveInput) this.saveInput.value = newName;
              }
              this.game?.ui?.addChatMessage?.(
                `<span style="color:#d946ef;font-weight:bold;">[Mob Studio]</span> Renamed mob to "${newName}".`
              );
            } else {
              if (typeof alert === 'function') alert(res.message || 'Failed to rename mob.');
              title.textContent = mob.name;
            }
          };

          input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') {
              ke.preventDefault();
              finish(true);
            } else if (ke.key === 'Escape') {
              ke.preventDefault();
              finish(false);
            }
          });

          input.addEventListener('blur', () => {
            finish(true);
          });

          title.innerHTML = '';
          title.appendChild(input);
          input.focus();
          input.select();
        });
      }

      const desc = document.createElement('div');
      desc.className = 'studio-open-card-desc';
      desc.textContent = mob.description || `${mob.behavior.health} HP • ${mob.behavior.type.toUpperCase()}`;

      const meta = document.createElement('div');
      meta.className = 'studio-open-card-meta';
      const skillsStr = mob.skills && mob.skills.length > 0 ? `Skills: ${mob.skills.join(', ')}` : 'Basic Attack';
      meta.textContent = `${mob.look.modelType} • ${mob.behavior.health} HP • ${skillsStr}`;

      info.append(title, desc, meta);

      const btnLoad = document.createElement('button');
      btnLoad.type = 'button';
      btnLoad.className = 'mc-btn studio-btn-card-load';
      btnLoad.textContent = 'Open';
      btnLoad.title = `Open "${mob.name}" in studio`;

      btnLoad.onclick = () => {
        this.loadMob(mob);
        this.hideOpenModal();
      };

      // Delete sits next to Load. Built-in mobs live in code, not in the saved
      // library, so they cannot be removed and the button is disabled for them.
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'mc-btn studio-btn-card-delete';
      btnDelete.textContent = 'Delete';

      if (mob.isBuiltin) {
        btnDelete.disabled = true;
        btnDelete.title = 'Built-in mobs cannot be deleted';
      } else {
        btnDelete.title = `Delete "${mob.name}" from the library`;
        btnDelete.onclick = (e) => {
          e?.stopPropagation?.();
          showConfirmDialog({
            title: '⚠️ Confirm Deletion',
            message: `Are you sure you want to delete "${mob.name}"? This cannot be undone.`,
            confirmText: 'Yes, Delete',
            cancelText: 'Cancel',
            onConfirm: () => {
              const removed = MobLibrary.deleteMob(mob.id);
              if (removed) {
                // If the deleted mob is the one open in the studio, clear the draft.
                if (this.currentMob?.id === mob.id) {
                  this.currentMob = {
                    ...this.currentMob,
                    id: 'custom_mob_preview',
                    name: 'Custom Mob'
                  };
                  this.syncPanelFromState();
                  this.updatePreviewMob();
                }
                this.game?.ui?.addChatMessage?.(
                  `<span style="color:#d946ef;font-weight:bold;">[Mob Studio]</span> Deleted "${mob.name}" from the mob library.`
                );
              } else {
                this.game?.ui?.addChatMessage?.(
                  `<span style="color:#ef4444;font-weight:bold;">[Mob Studio]</span> Could not delete "${mob.name}".`
                );
              }
              this.renderOpenMobList(query);
            }
          });
        };
      }

      card.append(img, info, btnLoad, btnDelete);
      this.openList.appendChild(card);
    }
  }

  loadMob(mobDef) {
    if (!mobDef) return;
    this.currentMob = {
      id: mobDef.id,
      name: mobDef.name,
      description: mobDef.description,
      look: { ...mobDef.look },
      behavior: { ...mobDef.behavior },
      skills: [...(mobDef.skills || [])],
      eggColors: { ...mobDef.eggColors }
    };
    this.syncPanelFromState();
    this.updatePreviewMob();
    this.game.ui?.addChatMessage?.(
      `<span style="color:#d946ef;font-weight:bold;">[Mob Studio]</span> Loaded "${mobDef.name}" into studio!`
    );
  }
}
