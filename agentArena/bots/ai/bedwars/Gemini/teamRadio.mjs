// Team Radio: in-memory coordination among our four squad members (Gemini1-Gemini4).
// All four players run in the same Node.js process; this module is imported once and shared.

class TeamRadio {
  constructor() {
    this.reset();
  }

  reset() {
    this.players = new Map(); // id -> { id, name, role, x, y, z, health, blocks, sword, armor, diamonds, emeralds, alive }
    this.team = null;
    this.base = null; // { x, y, z }
    this.bed = null; // [x, y, z]
    this.primaryTarget = null; // team id of the target enemy bed
    this.threat = null; // { id, name, x, y, z, distToBed, atTime }
    this.evacuation = false; // true when time to migrate to middle zone
    this.trapsQueued = 0;
  }

  register(bot) {
    if (!bot) return;
    const id = bot.clientId;
    if (!this.players.has(id)) {
      this.players.set(id, {
        id,
        name: bot.name,
        role: 'rusher',
        x: bot.position.x,
        y: bot.position.y,
        z: bot.position.z,
        health: bot.health,
        blocks: 0,
        sword: 0,
        diamonds: 0,
        emeralds: 0,
        alive: true,
      });
    }
  }

  updatePlayer(id, data) {
    const p = this.players.get(id);
    if (p) Object.assign(p, data);
  }

  reportThreat(enemy, distToBed) {
    if (!enemy) return;
    this.threat = {
      id: enemy.id,
      name: enemy.name,
      x: enemy.x ?? 0,
      y: enemy.y ?? 31,
      z: enemy.z ?? 0,
      distToBed,
      atTime: Date.now(),
    };
  }

  clearThreat() {
    this.threat = null;
  }

  getThreat() {
    if (!this.threat) return null;
    if (Date.now() - this.threat.atTime > 4000) {
      this.threat = null;
      return null;
    }
    return this.threat;
  }

  getAliveTeammateCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.alive) count++;
    }
    return Math.max(1, count);
  }

  // Coordinated primary target enemy bed: picks the closest standing enemy bed to our base,
  // and stays on that target until broken.
  getPrimaryTarget(enemyBeds, fromPos) {
    if (!enemyBeds || !enemyBeds.length) return null;
    if (this.primaryTarget) {
      const match = enemyBeds.find((b) => b.team === this.primaryTarget);
      if (match) return match;
    }
    const sorted = [...enemyBeds].sort((a, b) => {
      const da = Math.hypot(a.at[0] - fromPos.x, a.at[2] - fromPos.z);
      const db = Math.hypot(b.at[0] - fromPos.x, b.at[2] - fromPos.z);
      return da - db;
    });
    const chosen = sorted[0] ?? null;
    if (chosen) this.primaryTarget = chosen.team;
    return chosen;
  }

  clearPrimaryTarget(teamId) {
    if (this.primaryTarget === teamId) {
      this.primaryTarget = null;
    }
  }
}

export const teamRadio = new TeamRadio();
