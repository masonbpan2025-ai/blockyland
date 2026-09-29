import * as THREE from 'three';

export class TrainingSitesManager {
  constructor(game) {
    this.game = game;
    this.currentSite = null;
    this.visitedSites = new Set();
    this.siteCooldowns = {};

    // Defined training sites surrounding the tournament arena
    this.sites = [
      {
        id: 'parkour',
        name: 'Parkour Training Ground',
        managerName: "Master Korin's Agility Coach",
        managerRole: 'Parkour Master',
        managerPos: new THREE.Vector3(0, 21.0, 32.0),
        bounds: { minX: -16, maxX: 16, minZ: 30, maxZ: 70 },
        dialogue: "Welcome to the Parkour Training Ground! Sprint, leap across the floating pillars, and test your precision jumping skills to reach the golden beacon at the end!",
        color: '#22c55e'
      },
      {
        id: 'punching',
        name: 'Punching & Melee Combat Yard',
        managerName: "Turtle School Combat Master",
        managerRole: 'Punching Master',
        managerPos: new THREE.Vector3(32.0, 21.0, 0.0),
        bounds: { minX: 30, maxX: 70, minZ: -16, maxZ: 16 },
        dialogue: "Welcome to the Punching Training Yard! Step into the combat arena, chase down the hostile combatants, and knock them out with powerful punches and sword strikes!",
        color: '#f97316'
      },
      {
        id: 'kamehameha',
        name: 'Kamehameha Target Range',
        managerName: "Kamehameha Grandmaster",
        managerRole: 'Kamehameha Master',
        managerPos: new THREE.Vector3(-32.0, 21.0, 0.0),
        bounds: { minX: -70, maxX: -30, minZ: -16, maxZ: 16 },
        dialogue: "Welcome to the Kamehameha Training Range! Stand on the firing platform, hold [J] to gather your Ki, and release to blast the distant target mobs with a massive energy beam!",
        color: '#00f0ff'
      },
      {
        id: 'genki_dama',
        name: 'Genki Dama (Spirit Bomb) Crater',
        managerName: "King Kai's Spirit Bomb Tutor",
        managerRole: 'Spirit Bomb Master',
        managerPos: new THREE.Vector3(0, 24.0, -32.0),
        bounds: { minX: -16, maxX: 16, minZ: -70, maxZ: -30 },
        dialogue: "Welcome to the Genki Dama Crater! Raise your hands, hold [K] to draw universal energy into a giant Spirit Bomb above your head, then release it to obliterate the crowd below!",
        color: '#38bdf8'
      }
    ];

    this.managersSpawned = false;
  }

  ensureSiteManagers() {
    if (this.managersSpawned || !this.game.mobs) return;

    for (const site of this.sites) {
      const existing = this.game.mobs.mobs.find(
        m => m.type === 'site_manager' && m.siteId === site.id
      );
      if (!existing) {
        const mgr = this.game.mobs.spawnSiteManager(
          site.managerPos.x,
          site.managerPos.y,
          site.managerPos.z,
          site
        );
      }
    }
    this.managersSpawned = true;
  }

  triggerSiteIntroduction(site) {
    const now = Date.now();
    const lastSpoke = this.siteCooldowns[site.id] || 0;
    if (now - lastSpoke < 12000) return; // Prevent spamming within 12s
    this.siteCooldowns[site.id] = now;

    // Play chime sound
    this.game.sounds?.playHostSpeak?.();

    // Show dialogue banner
    if (this.game.tournament?.showDialogue) {
      this.game.tournament.showDialogue(
        `${site.managerName} (${site.managerRole})`,
        site.dialogue,
        7.5
      );
    }

    // Chat log
    this.game.ui?.addChatMessage?.(
      `<span style="color:${site.color};font-weight:bold;">[${site.name}]</span> ${site.dialogue}`
    );
  }

  update(dt, player) {
    if (!player) return;
    this.ensureSiteManagers();

    const p = player.position;

    // Check which site player is currently inside
    let active = null;
    for (const site of this.sites) {
      const b = site.bounds;
      if (p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ) {
        active = site;
        break;
      }
    }

    if (active && active !== this.currentSite) {
      this.currentSite = active;
      this.triggerSiteIntroduction(active);
    } else if (!active) {
      this.currentSite = null;
    }
  }

  reset() {
    this.currentSite = null;
    this.visitedSites.clear();
    this.siteCooldowns = {};
    this.managersSpawned = false;
  }
}
