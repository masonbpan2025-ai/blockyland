// The scripted bot's base layer (agentArena/scriptedBot/): a guest player (packages/blockyland-mcp/guestPeer.js) with a
// human's pace and the difficulty's skills (BOT_SKILLS), its general skills (agentArena/skills/skills.mjs) and the view
// of a round (agentArena/skills/view.mjs), a brain that runs the playbooks a subclass gives it (`this.playbooks`), or a
// slow thinker's plan over them (agentArena/plans/). The scripted bot (scriptedBot.mjs) is this, with its own
// fighting, eating, edge sense, gear, skills and playbooks.
//
// History: this began as the house bots' autopilot, a fork of the MCP guest's built-in autopilot brain
// (guestPeer.js #brainSkyWars, #brainBedWars); its methods still name the guestPeer.js lines they came from.
// It was the "house bot" until houseBotDs, built on it, replaced it as the scripted bot (2026-11-12).
//
import {
  GuestPeerSession, BLOCKS, WEAPON_DAMAGE, BED_BLOCK_IDS, AUTOPILOT_MELEE_REACH,
  meleeReachDistance, attackCooldownMs, attackStrength,
} from '../../../../../../packages/blockyland-mcp/guestPeer.js';
import { PROJECTILE_PHYSICS } from '../../../../../../packages/blockyland-mcp/projectiles.js';
import { createSkills } from '../skills/skills.mjs';
import { buildView } from '../skills/view.mjs';
import { runPlan } from '../plans/planRunner.mjs';
import { SlowThinker } from '../plans/thinker.mjs';


const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * What the house bot knows how to do at each difficulty. Weapons, damage, health and eating, looting, speed and reach
 * are Minecraft Java's at every difficulty (the shared guest code); the difficulty is skill:
 * - easy (a new player): swings without waiting for a full recharge (Java's weaker hit), never sprints; no projectiles,
 *   pearls or pillaring; no sense for the edge; in Bed Wars, wool and nothing more from the shop.
 * - normal (a casual player): full-strength swings, sprint hits; snowballs and eggs at a foe on a bridge, the bow at
 *   8-15 blocks with a loose aim; a pearl only to save itself; pillars up to a foe above; never trades hits with the
 *   void behind it.
 * - hard (a competitive player): as normal, and jump critical hits or sprint resets (the knock-back hit when the foe
 *   has the void behind them); the bow at 8-30 blocks aimed ahead of a moving target; pearls to close in on a foe too;
 *   bridge defence.
 * The pace of thought (brain interval) and of bridging also rise with difficulty (DIFFICULTY_PROFILES).
 */
//
// And a human's pace, slower the less skilled:
// - reactionMs: what it acts on is what it saw that long ago (a foe appearing, a foe moving), so a new foe is noticed
//   that late and a swing goes where the foe was -- landing only if they are really in reach.
// - turnDegPerSec: it turns its head toward a target at this rate, and swings or shoots only once facing it.
// - moveDuty: away from a fight, the share of its decisions it acts on; the rest it spends looking around.
// - bridgeSpeed / bridgePauseMs: bridging speed (easy sneak-bridges, at sneaking speed 1.3 blocks/s) and the pause
//   after each block.
// - lootOpenMs / lootItemMs: opening a chest, then taking each item.
export const BOT_SKILLS = Object.freeze({
  easy: Object.freeze({ swingAtCharge: 0.5, crits: false, sprintResets: false, throwables: false, bowRange: 0, aimError: 0, leadShots: false, pearls: 'none', pillar: false, towerDrop: true, edge: false, bridgeDefence: false, projectileEveryMs: Infinity, bedwarsShop: 'wool',
    reactionMs: 700, turnDegPerSec: 180, moveDuty: 0.6, bridgeSpeed: 1.3, bridgePauseMs: 600, lootOpenMs: 1400, lootItemMs: 300 }),
  normal: Object.freeze({ swingAtCharge: 1, crits: false, sprintResets: false, throwables: true, bowRange: 15, aimError: 0.05, leadShots: false, pearls: 'clutch', pillar: true, towerDrop: true, edge: true, bridgeDefence: false, projectileEveryMs: 4000, bedwarsShop: 'basic',
    reactionMs: 400, turnDegPerSec: 360, moveDuty: 0.8, bridgeSpeed: null, bridgePauseMs: 300, lootOpenMs: 800, lootItemMs: 150 }),
  hard: Object.freeze({ swingAtCharge: 1, crits: true, sprintResets: true, throwables: true, bowRange: 30, aimError: 0, leadShots: true, pearls: 'full', pillar: true, towerDrop: true, edge: true, bridgeDefence: true, projectileEveryMs: 2500, bedwarsShop: 'full',
    reactionMs: 220, turnDegPerSec: 720, moveDuty: 0.95, bridgeSpeed: null, bridgePauseMs: 200, lootOpenMs: 500, lootItemMs: 80 }),
});
const EYE = 1.52; // where a throw leaves, above the feet (MineflayerBot._release)

/** The low-arc pitch that brings a `kind` thrown `h` blocks out to `dy` above where it left; null when out of range. */
function aimPitch(kind, h, dy) {
  const P = PROJECTILE_PHYSICS[kind];
  const at = (pitch) => {
    let x = 0, y = 0, vx = Math.cos(pitch) * P.speed, vy = Math.sin(pitch) * P.speed;
    for (let t = 1; t <= 100; t++) {
      if (x + vx >= h) { const k = (h - x) / vx; return y + vy * k; }
      x += vx; y += vy; vx *= P.drag; vy = vy * P.drag - P.gravity;
    }
    return null;
  };
  let lo = -1.4, hi = 1.4, best = null;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2, y = at(mid);
    if (y === null) { if (mid > 0.6) hi = mid; else lo = mid; continue; }
    if (y < dy) lo = mid; else { hi = mid; best = mid; }
  }
  return best;
}

export class ScriptedBotBase extends GuestPeerSession {
  /**
   * `options.brain`: 'skills' (the default: the playbooks, through the skills), 'legacy' (the brains below, as they
   * were before the skills were pulled out of them) or 'planner' (a slow thinker's plan run over the skills, the
   * playbook where the plan says 'default' or there is none yet). `options.planner`: the SlowThinker's options --
   * `ask` (the model), `notes`, `minIntervalMs`, `ttlMs` -- or a SlowThinker itself.
   */
  constructor(options = {}) {
    super({ ...options, autopilot: false });
    this.houseBrainOn = false;
    this.houseBrainTimer = null;
    this.brainKind = options.brain === 'planner' ? 'planner' : 'skills';
    this.skillSet = createSkills(this);
    if (this.brainKind === 'planner') {
      // The thinker may come from elsewhere (a workspace being improved: agentArena/plannerLab.mjs), so it is used by
      // what it does, not by its class; likewise options.runPlan, the plan runner.
      this.thinker = typeof options.planner?.observe === 'function' ? options.planner : new SlowThinker(options.planner ?? {});
      this.runPlanFn = options.runPlan ?? runPlan;
    }
  }

  /**
   * Start the brain at the original's pace (guestPeer.js #startLoops: setInterval): a tick starts every brain interval,
   * and one that comes while the last is still running is skipped -- not a full interval after each tick ends. The
   * interval is read again at every tick, so a change of the room's difficulty takes effect at once.
   */
  startHouseBrain() {
    if (this.houseBrainOn) return;
    this.houseBrainOn = true;
    const loop = () => {
      if (!this.houseBrainOn) return;
      this.houseBrainTimer = setTimeout(loop, this.profile.brainIntervalMs);
      void this.runBrainTick(); // returns at once while a tick is running (brainBusy)
    };
    loop();
  }

  stopHouseBrain() {
    this.houseBrainOn = false;
    clearTimeout(this.houseBrainTimer);
  }

  disconnect(...args) {
    this.stopHouseBrain();
    return super.disconnect(...args);
  }

  /** My skills at the room's difficulty (BOT_SKILLS). */
  get skills() { return BOT_SKILLS[this.difficulty] ?? BOT_SKILLS.normal; }

  /** The difficulty's profile, with my bridging pace: the pause after each block, and easy's sneak-bridging speed. */
  get profile() {
    const base = super.profile, sk = this.skills;
    const bridging = this.bridgingNow && sk.bridgeSpeed ? { walkSpeed: sk.bridgeSpeed / 0.8 } : {}; // the walk bridges at 0.8 of walkSpeed
    return { ...base, bridgePlaceDelayMs: sk.bridgePauseMs, ...bridging };
  }

  /** Each game tick, what I see is recorded: I act on it a reaction time later (perceive). */
  tick(dt) {
    super.tick(dt);
    this.notePerception();
  }

  notePerception() {
    const now = Date.now(), keep = this.skills.reactionMs + 300;
    this.percept ??= new Map();
    for (const p of this.peers.values()) {
      let h = this.percept.get(p.id);
      if (!h) this.percept.set(p.id, (h = { first: now, hist: [] }));
      h.hist.push({ t: now, x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 });
      while (h.hist.length > 2 && now - h.hist[1].t > keep) h.hist.shift();
    }
  }

  /**
   * A player as I have taken them in: where they were a reaction time ago; null while they are new to me (seen for
   * less than a reaction time). With nothing recorded (no game ticks yet), as they are.
   */
  perceive(p) {
    const h = this.percept?.get(p?.id);
    if (!p || !h) return p;
    const now = Date.now(), lag = this.skills.reactionMs;
    if (now - h.first < lag) return null;
    let at = h.hist[0];
    for (const e of h.hist) if (now - e.t >= lag) at = e;
    return { ...p, x: at.x, y: at.y, z: at.z };
  }

  /**
   * Turn my head toward a point at my turning speed (since the last turn); true once facing it within 20 degrees. The
   * pitch follows at once (a small movement); the yaw is the turn.
   */
  faceToward(tx, ty, tz) {
    const now = Date.now(), dt = Math.min(0.25, (now - (this.lastTurnAt ?? now - 50)) / 1000);
    this.lastTurnAt = now;
    const dx = tx - this.position.x, dz = tz - this.position.z, dy = ty - (this.position.y + 1.62);
    const want = Math.atan2(-dx, -dz);
    let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const max = (this.skills.turnDegPerSec * Math.PI / 180) * dt;
    this.yaw += Math.max(-max, Math.min(max, diff));
    this.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Math.atan2(dy, Math.hypot(dx, dz) || 1e-6)));
    return Math.abs(diff) - Math.min(Math.abs(diff), max) < 0.35;
  }

  /** Looting at a human's pace: the chest is opened, then each item taken (the shared looting takes all at once). */
  async lootChest(args) {
    const r = await super.lootChest(args);
    if (r?.ok && r.looted?.length) {
      this.lastActionSummary = `looting a chest (${r.looted.length} items)`;
      await sleep(this.skills.lootOpenMs + this.skills.lootItemMs * r.looted.length);
    }
    return r;
  }

  /** One tick of the brain (guestPeer.js #runBrainTick, less the base game). */
  async runBrainTick() {
    if (!this.connected || this.manualActionBusy || this.brainBusy || this.chatTaskBusy) return;
    this.brainBusy = true;
    try {
      this.noteLand();
      if (this.skills.pearls !== 'none' && this.pearlClutch()) return;
      // Hesitation: away from a fight, some decisions go to looking around instead (a human's pace).
      const near = this.findAliveEnemies().some((p) => Math.hypot((p.x ?? 0) - this.position.x, (p.z ?? 0) - this.position.z) < 6);
      if (!near && Math.random() > this.skills.moveDuty) {
        this.lastActionSummary = 'looking around';
        this.yaw += (Math.random() - 0.5) * 1.2;
        this.broadcastState();
        await sleep(this.profile.brainMoveDurationMs);
        return;
      }
      if (this.brainKind === 'planner') {
        const play = (this.playbooks ?? {})[this.gameMode];
        const view = play ? buildView(this) : null;
        if (view) {
          const before = { ...this.position };
          this.thinker.observe(view, this.skillSet.enemies(), this);
          const result = await (this.runPlanFn ?? runPlan)({ plan: this.thinker.plan, view, skills: this.skillSet, fallback: play, session: this });
          this.lastPlanStep = result;
          this.thinker.noteResult(result, Math.hypot(this.position.x - before.x, this.position.z - before.z) > 0.2 || result.action === 'fight');
        }
      } else {
        const play = (this.playbooks ?? {})[this.gameMode];
        const view = play ? buildView(this) : null;
        if (view) await play({ view, skills: this.skillSet });
      }
    } catch {
      // Ignore transient brain tick errors (as the original does).
    } finally {
      this.brainBusy = false;
    }
  }

  // guestPeer.js lines 1923-1930
  bedWarsGenPosition(genId) {
    if (!this.bedwarsArena) return null;
    if (String(genId).startsWith('f-')) {
      const teamId = String(genId).slice(2);
      return this.bedwarsArena.bases.find((b) => b.team === teamId)?.forge ?? null;
    }
    return [...this.bedwarsArena.diamonds, ...this.bedwarsArena.emeralds].find((g) => g.id === genId) ?? null;
  }

  /** The round's enemies as I have taken them in (perceive): a reaction time late, the newest not yet; nearest first. */
  findAliveEnemies(requested = '') {
    const p = this.position;
    return this.findAliveEnemiesRaw(requested).map((e) => this.perceive(e)).filter(Boolean)
      .sort((a, b) => Math.hypot((a.x ?? 0) - p.x, (a.z ?? 0) - p.z) - Math.hypot((b.x ?? 0) - p.x, (b.z ?? 0) - p.z));
  }

  // guestPeer.js lines 2661-2689
  findAliveEnemiesRaw(requested = '') {
    const clean = String(requested || '').toLowerCase().trim();
    const myTeam = this.gameMode === 'bedwars' ? this.me()?.team : null;
    const candidates = [...this.peers.values()].filter((p) => {
      if (p.id === this.clientId || p.dead || p.gamemode === 'spectator') return false;
      // In a mini-game only the round's players are enemies: not a spectator, nor anyone else outside the match.
      if (this.gameMode === 'skywars') {
        const list = this.skywarsState?.players;
        const sp = list?.find((q) => q.id === p.id);
        if (list?.length && !sp) return false;
        if (sp && !sp.alive) return false;
      }
      if (this.gameMode === 'bedwars') {
        const list = this.bedwarsState?.players;
        const bp = list?.find((q) => q.id === p.id);
        if (list?.length && !bp) return false;
        if (bp && (!bp.alive || bp.dead || bp.team === myTeam)) return false;
      }
      if (clean) {
        return p.id.toLowerCase() === clean || (p.name && p.name.toLowerCase() === clean);
      }
      return true;
    });
    candidates.sort((a, b) =>
      Math.hypot((a.x ?? 0) - this.position.x, (a.z ?? 0) - this.position.z) -
      Math.hypot((b.x ?? 0) - this.position.x, (b.z ?? 0) - this.position.z)
    );
    return candidates;
  }

  // guestPeer.js lines 2691-2716
  consumeHealingItem() {
    // Now the shared eating rule (GuestPeerSession.healIfNeeded): Java's eating, the same at every difficulty.
    return this.healIfNeeded();
  }


  // guestPeer.js lines 2718-2788
  fireProjectileAt(peer) {
    if (!this.profile.useProjectiles) return false;
    const now = Date.now();
    if (now - this.lastProjectileAt < this.profile.projectileCooldownMs) return false;
    const dx = (peer.x ?? 0) - this.position.x;
    const dy = (peer.y ?? 31) - this.position.y;
    const dz = (peer.z ?? 0) - this.position.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 4.5 || dist > 36) return false;

    const len = dist || 1;
    for (const throwable of ['snowball', 'egg']) {
      if (this.inventory.takeItem(throwable, 1)) {
        this.lastProjectileAt = now;
        this.lookAt(peer.x, (peer.y ?? 31) + 1.3, peer.z);
        this.sendPacket({
          t: 'shot',
          shot: {
            kind: throwable,
            x: this.position.x,
            y: this.position.y + 1.5,
            z: this.position.z,
            vx: (dx / len) * 24,
            vy: (dy / len) * 24 + 2,
            vz: (dz / len) * 24,
          },
        });
        this.sendPacket({
          t: 'attack',
          target: peer.id,
          damage: 0,
          projectile: throwable,
        });
        this.lastActionSummary = `threw ${throwable} at ${peer.name || peer.id}`;
        this.broadcastState({ swinging: true });
        return true;
      }
    }

    const bowStack = this.inventory.allSlots().find((s) => s && s.id === 'bow');
    if (bowStack && this.inventory.takeItem('arrow', 1)) {
      this.lastProjectileAt = now;
      this.lookAt(peer.x, (peer.y ?? 31) + 1.4, peer.z);
      const powerLevel = (bowStack.enchantments ?? []).find((e) => e.id === 'power')?.level ?? 0;
      const arrowDamage = 6 + powerLevel * 2;
      this.sendPacket({
        t: 'shot',
        shot: {
          kind: 'arrow',
          x: this.position.x,
          y: this.position.y + 1.5,
          z: this.position.z,
          vx: (dx / len) * 30,
          vy: (dy / len) * 30 + 1.5,
          vz: (dz / len) * 30,
        },
      });
      this.sendPacket({
        t: 'attack',
        target: peer.id,
        damage: arrowDamage,
        weapon: 'bow',
        projectile: 'arrow',
      });
      this.lastActionSummary = `shot arrow at ${peer.name || peer.id}`;
      this.broadcastState({ swinging: true });
      return true;
    }

    return false;
  }

  // --- the house bot's own fighting (not in the original) ----------------------------------------------------------

  /**
   * The guest's walk, with one change when bridging: more than 6 blocks from the target it bridges flat, at my own
   * height. The original stair-builds upward whenever the target stands even 0.8 higher -- a foe on a slightly higher
   * island, or one mid-jump -- which made zig-zag stairs up and down across the void, and towers it then stood stuck
   * on. Near the target it may still stair up (onto an island's raised edge).
   */
  moveStepToward(tx, ty, tz, options = {}) {
    // And near it, a stair only toward ground that is there: a foe knocked up or jumping is "higher" for a moment, and
    // stairing after every such moment built towers in fights.
    if (options.bridge && ty > this.position.y && (Math.hypot(tx - this.position.x, tz - this.position.z) > 6 || !this.groundAt(tx, ty, tz))) ty = this.position.y;
    // My bridging pace (the profile getter) while a bridging walk runs; easy sneaks it.
    if (!options.bridge) return super.moveStepToward(tx, ty, tz, options);
    return (async () => {
      this.bridgingNow = true;
      if (this.skills.bridgeSpeed) this.isSneaking = true;
      try { return await super.moveStepToward(tx, ty, tz, options); } finally { this.bridgingNow = false; }
    })();
  }

  /** Put an item in my hand: a hotbar slot with it, or swapped in from the backpack to the last hotbar slot. */
  holdItem(id) {
    const inv = this.inventory;
    let slot = inv.hotbar.findIndex((s) => s && s.id === id);
    if (slot < 0) {
      const i = inv.storage.findIndex((s) => s && s.id === id);
      if (i < 0) return false;
      [inv.hotbar[8], inv.storage[i]] = [inv.storage[i], inv.hotbar[8]];
      slot = 8;
    }
    inv.activeSlot = slot;
    return true;
  }

  /**
   * The bow, across actions (a full draw is a second, longer than one action): start drawing at a foe 8-30 blocks off,
   * keep the aim on them, and loose when the draw is full -- at the difficulty's projectile cooldown, as the original's
   * projectiles. An arrow flies for real (the bot API's flight): it hits only if it reaches them. True while busy with it.
   */
  bowAction(f, d) {
    const aim = () => {
      const eye = { x: this.position.x, y: this.position.y + EYE, z: this.position.z };
      let tx = f.x ?? 0, tz = f.z ?? 0;
      if (this.skills.leadShots) {
        // Ahead of them by the arrow's flight (about 3 blocks a tick), from how they moved since the last look.
        const v = this.trackVelocity(f), flight = Math.hypot(tx - eye.x, tz - eye.z) / 60;
        tx += v.x * flight; tz += v.z * flight;
      }
      const pitch = aimPitch('arrow', Math.hypot(tx - eye.x, tz - eye.z), (f.y ?? 31) + 1.0 - eye.y);
      if (pitch === null) return false;
      const err = () => (Math.random() * 2 - 1) * this.skills.aimError;
      // Turn toward the aim at my turning speed; the shot waits until I face it.
      const facing = this.faceToward(tx, (f.y ?? 31) + 1.0, tz);
      this.yaw += err();
      this.pitch = pitch + err();
      this.broadcastState();
      return facing ? true : 'turning';
    };
    if (this.bowDrawAt) {
      const aimed = d < 4 ? false : aim();
      if (!aimed) { this.bowDrawAt = null; this.bot.deactivateItem(); this.inventory.equipBest(); return false; } // too close, or out of range: drop it
      if (aimed === true && Date.now() - this.bowDrawAt >= 1050) {
        this.bot.deactivateItem();
        this.bowDrawAt = null;
        this.lastProjectileAt = Date.now();
        this.lastActionSummary = `shot an arrow at ${f.name || f.id}`;
        this.inventory.equipBest();
      } else this.lastActionSummary = `drawing the bow at ${f.name || f.id}`;
      return true;
    }
    if (d < 8 || d > this.skills.bowRange || Date.now() - (this.lastProjectileAt ?? 0) < this.skills.projectileEveryMs) return false;
    if (this.inventory.countItem('arrow') < 1 || !this.holdItem('bow')) { this.inventory.equipBest(); return false; }
    const aimed = aim();
    if (!aimed) { this.inventory.equipBest(); return false; }
    if (aimed === 'turning') { this.lastActionSummary = `turning to ${f.name || f.id}`; return true; } // draw once facing them
    void this.bot.activateItem();
    this.bowDrawAt = Date.now();
    this.lastActionSummary = `drawing the bow at ${f.name || f.id}`;
    return true;
  }

  /**
   * The way down from a height (a tower, a tree, a castle's top) toward a point below: the nearest edge with ground
   * under it -- the smallest fall first (Java's fall damage: each block past 3 hurts 1), never one that would leave me
   * under 6 health, never the void -- walked off at walking speed; the guest's gravity takes me down. The walk refuses
   * any drop of more than a block, so without this a bot that climbs up stays up. True when it stepped off.
   */
  async climbDown(tx, tz, { minY = -Infinity } = {}) {
    const p = this.position, cy = Math.floor(p.y);
    let best = null;
    for (let r = 1; r <= 3; r++) {
      for (let a = 0; a < 16; a++) {
        const x = p.x + Math.cos((a * Math.PI) / 8) * r, z = p.z + Math.sin((a * Math.PI) / 8) * r;
        const bx = Math.floor(x), bz = Math.floor(z);
        if (bx === Math.floor(p.x) && bz === Math.floor(p.z)) continue;
        if (this.isSolid(bx, cy, bz) || this.isSolid(bx, cy + 1, bz) || this.isSolid(bx, cy - 1, bz)) continue; // a wall, or level ground
        let land = null;
        for (let y = cy - 2; y >= cy - 30; y--) if (this.isSolid(bx, y, bz)) { land = y + 1; break; }
        if (land === null || land < minY) continue; // the void, or below the destination's safe level
        const damage = Math.max(0, Math.ceil(p.y - land - 3));
        if (this.health - damage < 6) continue;
        const score = damage * 3 + r + 0.3 * Math.hypot(bx + 0.5 - tx, bz + 0.5 - tz);
        if (!best || score < best.score) best = { x: bx + 0.5, z: bz + 0.5, land, damage, score };
      }
    }
    if (!best) return false;
    this.lastActionSummary = `climbing down (${(p.y - best.land).toFixed(0)} blocks)`;
    const step = this.profile.walkSpeed * (this.profile.stepDelayMs / 1000);
    for (let n = 0; n < 40 && Math.hypot(best.x - this.position.x, best.z - this.position.z) > 0.2; n++) {
      const dx = best.x - this.position.x, dz = best.z - this.position.z, len = Math.hypot(dx, dz);
      this.position = { ...this.position, x: this.position.x + (dx / len) * Math.min(step, len), z: this.position.z + (dz / len) * Math.min(step, len) };
      this.yaw = Math.atan2(-dx, -dz);
      this.broadcastState();
      await sleep(this.profile.stepDelayMs);
    }
    return true;
  }

  /** Solid ground under a point (the block below its feet). */
  groundAt(x, y, z) { return this.isSolid(Math.floor(x), Math.floor(y) - 1, Math.floor(z)); }

  /** Wide ground: at least 6 of the 9 blocks round the one under a point are solid (an island, not a bridge or an edge). */
  wideAt(x, y, z) {
    let n = 0;
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (this.groundAt(x + ox, y, z + oz)) n++;
    return n >= 6;
  }

  /** Void cells on the straight way from me to (tx, tz), at the level I stand on: the blocks a bridge there takes. */
  voidCellsToward(tx, tz) {
    const p = this.position, d = Math.hypot(tx - p.x, tz - p.z), y = Math.floor(p.y) - 1;
    const seen = new Set();
    let n = 0;
    for (let t = 0; t <= d; t += 0.5) {
      const x = Math.floor(p.x + ((tx - p.x) * t) / (d || 1)), z = Math.floor(p.z + ((tz - p.z) * t) / (d || 1)), k = `${x},${z}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!this.isSolid(x, y, z)) n++;
    }
    return n;
  }

  /** Remember the last wide ground I stood on (where a pearl takes me back, and where I fall back to). */
  noteLand() {
    const p = this.position;
    if (!this.isDead && this.wideAt(p.x, p.y, p.z)) this.houseLastLand = { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y), z: Math.floor(p.z) + 0.5 };
  }

  /** Void on the line a hit from (fx, fz) would send me along, within two blocks: no place to trade hits. */
  voidBehind(fx, fz) {
    const p = this.position, dx = p.x - fx, dz = p.z - fz, len = Math.hypot(dx, dz) || 1;
    for (const k of [1, 2]) if (!this.groundAt(p.x + (dx / len) * k, p.y, p.z + (dz / len) * k)) return true;
    return false;
  }

  /**
   * One melee hit, by Java's rules -- the weapon's damage scaled by how far it has recharged (0.2 + 0.8 x charge^2),
   * a critical hit x1.5 -- and by skill: easy swings at half charge (a weaker hit), normal and hard at full; normal's
   * hits are sprint hits (more knock-back); hard chooses, at full charge, a sprint hit when the foe has the void behind
   * them, otherwise a jump critical. False while it waits (recharge, eating).
   */
  meleeHit(peer) {
    const now = Date.now();
    const held = this.inventory.getActiveItem();
    const weaponId = held && typeof held.id === 'string' ? held.id : null;
    const cooldown = attackCooldownMs(weaponId), since = now - (this.lastMeleeAt ?? 0);
    if (this.isEating() || since < cooldown * this.skills.swingAtCharge) return false;
    if (!this.faceToward(peer.x ?? 0, (peer.y ?? 31) + 1.2, peer.z ?? 0)) return false; // still turning to them
    this.lastMeleeAt = now;
    this.addExhaustion(0.1);
    const really = this.peers.get(peer.id);
    if (really && meleeReachDistance(this.position, really) > AUTOPILOT_MELEE_REACH) {
      // Swung at where I saw them: they have moved out of reach since.
      this.broadcastState({ swinging: true });
      this.lastActionSummary = `missed ${peer.name || peer.id}`;
      return true;
    }
    const strength = attackStrength(since, cooldown);
    let damage = (weaponId && WEAPON_DAMAGE[weaponId]) ? WEAPON_DAMAGE[weaponId] : 1;
    const sharp = (held?.enchantments ?? []).find((e) => e.id === 'sharpness');
    if (sharp) damage += 0.5 * sharp.level + 0.5;
    damage *= strength;
    const kb = (held?.enchantments ?? []).find((e) => e.id === 'knockback')?.level ?? 0;
    // Java: a sprint hit or a critical needs a (nearly) full charge; a sprinting hit is never critical.
    const full = strength > 0.9;
    let isSprint = full && this.profile.sprintAllowed, isCritical = false;
    if (full && this.skills.crits) {
      const theirVoid = this.voidBehindOf(peer);
      isSprint = theirVoid && this.skills.sprintResets;
      isCritical = !isSprint;
    }
    if (isCritical) damage *= 1.5;
    damage = Math.max(0.1, Number(damage.toFixed(2)));
    this.isSprinting = isSprint;
    this.broadcastState({ swinging: true });
    this.sendPacket({ t: 'attack', target: peer.id, damage, weapon: weaponId, isCritical, isSprint, knockbackLevel: kb, fireAspect: 0 });
    this.isSprinting = false;
    this.lastActionSummary = `${isCritical ? 'critical hit on' : 'attacking'} ${peer.name || peer.id} with ${weaponId || 'fist'}`;
    return true;
  }

  /** The void behind a foe on the line from me, within two blocks: my hit there is a fall for them. */
  voidBehindOf(peer) {
    const p = this.position, fx = peer.x ?? 0, fy = peer.y ?? 31, fz = peer.z ?? 0;
    const dx = fx - p.x, dz = fz - p.z, len = Math.hypot(dx, dz) || 1;
    for (const k of [1, 2]) if (!this.groundAt(fx + (dx / len) * k, fy, fz + (dz / len) * k)) return true;
    return false;
  }


  /** Throw `kind` (it must be in my inventory) at a point: aimed for its flight, then flown for real by the bot API. */
  throwAt(kind, tx, ty, tz) {
    const eye = { x: this.position.x, y: this.position.y + EYE, z: this.position.z };
    const pitch = aimPitch(kind, Math.hypot(tx - eye.x, tz - eye.z), ty - eye.y);
    // In hand first, as a player throws it: the others see the snowball or egg, then the throw. (The weapon comes back
    // with the next fighting action's equipBest.)
    if (pitch === null || !this.holdItem(kind)) return false;
    this.yaw = Math.atan2(-(tx - eye.x), -(tz - eye.z));
    this.pitch = pitch;
    this.broadcastState();
    if (!this.inventory.takeItem(kind, 1)) return false;
    this.bot._release(kind, 1);
    return true;
  }

  /** A player's ground velocity (blocks a second) from where it was at my last look (0 the first time). */
  trackVelocity(f) {
    const now = Date.now(), last = (this.seenAt ??= new Map()).get(f.id);
    this.seenAt.set(f.id, { x: f.x ?? 0, z: f.z ?? 0, t: now });
    if (!last || now - last.t < 50 || now - last.t > 1500) return { x: 0, z: 0 };
    const dt = (now - last.t) / 1000;
    return { x: ((f.x ?? 0) - last.x) / dt, z: ((f.z ?? 0) - last.z) / dt };
  }

  /** A snowball or an egg at a foe on a bridge or an edge, 5-18 blocks off: its knock-back is a fall. At the difficulty's projectile cooldown. */
  throwAtFoe(peer, dist) {
    if (dist < 5 || dist > 18 || Date.now() - (this.lastProjectileAt ?? 0) < this.skills.projectileEveryMs) return false;
    if (this.wideAt(peer.x ?? 0, peer.y ?? 31, peer.z ?? 0)) return false;
    const kind = ['snowball', 'egg'].find((k) => this.inventory.countItem(k) > 0);
    if (!kind || !this.faceToward(peer.x ?? 0, (peer.y ?? 31) + 1.0, peer.z ?? 0)) return false; // turning to them first
    if (!this.throwAt(kind, peer.x ?? 0, (peer.y ?? 31) + 1.0, peer.z ?? 0)) return false;
    this.lastProjectileAt = Date.now();
    this.lastActionSummary = `threw ${kind} at ${peer.name || peer.id}`;
    return true;
  }

  /** Hard's gap-closer: a foe 15-35 blocks off standing on ground, a pearl onto that ground beside them. */
  pearlToward(f, d) {
    if (d < 15 || d > 35 || this.inventory.countItem('ender_pearl') < 1 || Date.now() - (this.pearledAt ?? 0) < 8000) return false;
    if (!this.groundAt(f.x ?? 0, f.y ?? 31, f.z ?? 0)) return false;
    if (!this.throwAt('ender_pearl', f.x ?? 0, (f.y ?? 31) + 0.2, f.z ?? 0)) return false;
    this.pearledAt = Date.now();
    this.lastActionSummary = `ender pearl toward ${f.name || f.id}`;
    return true;
  }

  /** Falling into the void with an ender pearl: throw it back onto the last wide ground. True when thrown. */
  pearlClutch() {
    const land = this.houseLastLand, p = this.position;
    if (!land || this.isDead || this.gamemode !== 'survival' || Date.now() - (this.pearledAt ?? 0) < 1500) return false;
    if (p.y > land.y - 3 || this.inventory.countItem('ender_pearl') < 1) return false;
    for (let y = Math.floor(p.y) - 1; y > Math.floor(p.y) - 12; y--) if (this.isSolid(Math.floor(p.x), y, Math.floor(p.z))) return false;
    if (!this.throwAt('ender_pearl', land.x, land.y + 0.2, land.z)) return false;
    this.pearledAt = Date.now();
    this.lastActionSummary = 'falling: ender pearl back to land';
    return true;
  }

  /**
   * A fight, for one brain action (brainMoveDurationMs, as the original): heal as the original does, then step by step
   * -- swing whenever the foe is in reach and the cooldown is ready; never trade hits with the void behind me; on wide
   * ground with the foe on a bridge or an edge, hold and let them come; on a bridge with the foe on wide ground, fall
   * back to land; otherwise close in (bridging if need be) to just inside reach. A snowball or an egg first at a foe on
   * a bridge out of reach.
   */
  async engageEnemy(peer) {
    if (!peer) return { ok: false, reason: 'No enemy target' };
    // Tactics that got nowhere (an action with no step and no hit: a fall-back to land that cannot be reached, a hold
    // nobody comes to) give way to the original's plain approach for a while.
    // Wedged (the walk cannot take a ledge between us, both just out of reach): first a step to other open ground --
    // the original's walk is wedged the same way -- then the original's plain approach for a while.
    if (Date.now() < (this.plainUntil ?? 0)) return this.engageEnemyOriginal(peer);
    const startAt = { ...this.position };
    const result = await this.engageTactics(peer);
    if (result.mode === 'positioning' && Math.hypot(this.position.x - startAt.x, this.position.z - startAt.z) < 0.1) {
      this.stuckActions = (this.stuckActions ?? 0) + 1;
      if (this.stuckActions >= 3) {
        this.stuckActions = 0;
        this.plainUntil = Date.now() + 4000;
        await this.unstick();
      }
    } else this.stuckActions = 0;
    return result;
  }

  /** A short walk to open ground 2-4 blocks away in a random direction (with ground under it), to get off a ledge. */
  async unstick() {
    const p = this.position, a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < 16; i++) {
      const a = a0 + (i * Math.PI) / 8, r = 2 + (i % 3);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      // Level, a step down or up; and from a tower, a drop of 2-3 onto ground below (the walk's void guard refuses a
      // drop, so that one walks without it -- there is ground there).
      for (const dy of [0, -1, 1, -2, -3]) { // every difficulty gets down (a beginner walks off a ledge too)
        const y = Math.floor(p.y) + dy;
        if (!this.groundAt(x, y, z) || this.isSolid(Math.floor(x), y, Math.floor(z)) || this.isSolid(Math.floor(x), y + 1, Math.floor(z))) continue;
        if (dy < -1) {
          // The walk refuses any drop of more than a block, void guard or not: walk off the edge here, a step at a time
          // at walking speed, toward ground that is there; the guest's own gravity takes me down onto it.
          this.lastActionSummary = 'dropping off a tower';
          const step = this.profile.walkSpeed * (this.profile.stepDelayMs / 1000);
          for (let n = 0; n < 40 && Math.hypot(x - this.position.x, z - this.position.z) > 0.3; n++) {
            const dx = x - this.position.x, dz = z - this.position.z, len = Math.hypot(dx, dz);
            this.position = { ...this.position, x: this.position.x + (dx / len) * Math.min(step, len), z: this.position.z + (dz / len) * Math.min(step, len) };
            this.lookAt(x, y + 1, z);
            this.broadcastState();
            await sleep(this.profile.stepDelayMs);
          }
          return true;
        }
        this.lastActionSummary = 'getting off a ledge';
        await this.moveStepToward(x, y, z, { avoidVoid: true, bridge: false, stopWithin: 0.4, durationMs: this.profile.brainMoveDurationMs });
        if (Math.hypot(this.position.x - p.x, this.position.z - p.z) > 0.5) return true;
      }
    }
    // Nothing near and level: a longer way down, toward the nearest foe (or the middle).
    const foe = this.findAliveEnemies()[0];
    return this.climbDown(foe?.x ?? 0.5, foe?.z ?? 0.5);
  }

  async engageTactics(peer) {
    {
      // The bow first, while drawing or when the foe is far: the whole action is spent on it (a draw stands still).
      const f = this.peers.get(peer.id) ?? peer;
      const d0 = Math.hypot((f.x ?? 0) - this.position.x, (f.y ?? 31) - this.position.y, (f.z ?? 0) - this.position.z);
      if (this.skills.bowRange > 0 && this.bowAction(f, d0)) { await sleep(this.profile.brainMoveDurationMs); return { ok: true, mode: 'bow' }; }
    }
    this.inventory.equipBest();
    this.consumeHealingItem();
    const reach = AUTOPILOT_MELEE_REACH;
    const live = () => this.perceive(this.peers.get(peer.id) ?? peer) ?? peer;
    const step = this.profile.stepDelayMs;
    const until = Date.now() + this.profile.brainMoveDurationMs;
    let hit = false;
    {
      const f = live(), d0 = Math.hypot((f.x ?? 0) - this.position.x, (f.y ?? 31) - this.position.y, (f.z ?? 0) - this.position.z);
      if (this.skills.pearls === 'full' && this.pearlToward(f, d0)) { this.inventory.equipBest(); return { ok: true, mode: 'pearl' }; }
      if (d0 > reach && this.skills.throwables && this.throwAtFoe(f, d0)) { this.inventory.equipBest(); return { ok: true, mode: 'throw' }; }
    }
    let nextAt = 0;
    while (Date.now() < until && this.connected && !this.isDead) {
      // One step at most every step-time: a walk that returns at once (already close enough) must not turn this into a
      // loop that never yields to the event loop -- the session's own link then starves and the host drops it.
      if (Date.now() < nextAt) await sleep(nextAt - Date.now());
      nextAt = Date.now() + step;
      if (this.skills.pearls !== 'none' && this.pearlClutch()) return { ok: true, mode: 'pearl' };
      const f = live();
      if (f.dead) break;
      const fx = f.x ?? 0, fy = f.y ?? 31, fz = f.z ?? 0, p = this.position;
      const d = Math.hypot(fx - p.x, fy - p.y, fz - p.z);
      if (meleeReachDistance(p, f) <= reach && this.meleeHit(f)) hit = true;
      const meWide = this.wideAt(p.x, p.y, p.z), foeWide = this.wideAt(fx, fy, fz);
      if (this.knockbackActive) { await sleep(step); continue; }
      if (this.skills.edge && d <= reach + 0.5 && this.voidBehind(fx, fz)) {
        // The void behind me on the line from them: step to ground that has ground behind it, keeping them in reach.
        const spot = this.saferSpot(fx, fz, reach);
        if (spot) { this.lastActionSummary = `stepping off the edge line of ${f.name || f.id}`; await this.moveStepToward(spot.x, p.y, spot.z, { avoidVoid: true, bridge: false, stopWithin: 0.25, durationMs: step }); continue; }
      }
      {
        // A foe standing on ground 2 or more above me, close across (up a tree, on a tower): pillar up to them -- a
        // block in my own cell and up onto it, as the original's stair step, at the difficulty's bridge pause.
        const above = fy - p.y, across = Math.hypot(fx - p.x, fz - p.z);
        const cx = Math.floor(p.x), cy = Math.floor(p.y), cz = Math.floor(p.z);
        if (this.skills.pillar && above >= 2 && across <= 3 && this.groundAt(fx, fy, fz) && this.groundAt(p.x, p.y, p.z) && this.inventory.countPlaceableBlocks() > 0
          && !this.isSolid(cx, cy, cz) && !this.isSolid(cx, cy + 1, cz) && !this.isSolid(cx, cy + 2, cz)) {
          const placed = this.placeBlockAt(cx, cy, cz);
          if (placed.ok) {
            this.position = { ...p, y: cy + 1 };
            this.lastActionSummary = `pillaring up to ${f.name || f.id}`;
            this.broadcastState();
            await sleep(this.profile.bridgePlaceDelayMs);
            continue;
          }
        }
      }
      // A foe 2 or more below, out of reach: get down to them (every difficulty: a beginner walks off a ledge too).
      if (fy <= p.y - 2 && meleeReachDistance(p, f) > reach && Math.hypot(fx - p.x, fz - p.z) < 8 && (await this.climbDown(fx, fz))) continue;
      if (this.skills.bridgeDefence && meWide && !foeWide && d < 14 && Date.now() - (this.holdSince ?? Date.now()) < 6000) {
        // Bridge defence: they must come to me over narrow ground; I wait on mine, facing them (for 6 s at most: one
        // who does not come is gone after).
        this.holdSince ??= Date.now();
        this.faceToward(fx, fy + 1.2, fz);
        this.lastActionSummary = `holding for ${f.name || f.id} on the bridge`;
        await sleep(step);
        continue;
      }
      if (foeWide) this.holdSince = null; // they left the bridge: a later stand-off starts its own clock
      if (d > reach - 0.6) {
        this.lastActionSummary = `moving toward ${f.name || f.id}`;
        await this.moveStepToward(fx, fy, fz, {
          avoidVoid: true,
          bridge: this.gameMode !== 'base' && (this.inventory.countPlaceableBlocks() > 0 || this.gamemode === 'creative'),
          // Just inside reach on level ground; at another height, as close as the original goes (the walk measures
          // across, not up).
          stopWithin: Math.abs(fy - p.y) > 1.5 ? 2.2 : reach - 0.6,
          durationMs: step,
        });
        continue;
      }
      this.faceToward(fx, fy + 1.2, fz);
      await sleep(step);
    }
    this.broadcastState();
    return { ok: true, mode: hit ? 'melee' : 'positioning', target: peer.name || peer.id };
  }

  /** A spot a step from me with ground under it and ground behind it on the line from (fx, fz), still in reach. */
  saferSpot(fx, fz, reach) {
    const p = this.position;
    let best = null, bestScore = Infinity;
    for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos((a * Math.PI) / 4), z = p.z + Math.sin((a * Math.PI) / 4);
      if (!this.groundAt(x, p.y, z) || this.isSolid(Math.floor(x), Math.floor(p.y), Math.floor(z))) continue;
      const dx = x - fx, dz = z - fz, len = Math.hypot(dx, dz) || 1;
      if (!this.groundAt(x + dx / len, p.y, z + dz / len) || !this.groundAt(x + (2 * dx) / len, p.y, z + (2 * dz) / len)) continue;
      const score = Math.abs(len - (reach - 1));
      if (score < bestScore) { bestScore = score; best = { x, z }; }
    }
    return best;
  }

  // guestPeer.js lines 2790-2902
  async engageEnemyOriginal(peer) {
    if (!peer) return { ok: false, reason: 'No enemy target' };
    this.inventory.equipBest();
    this.consumeHealingItem();

    const px = peer.x ?? 0;
    const py = peer.y ?? 31;
    const pz = peer.z ?? 0;
    const distBefore = Math.hypot(px - this.position.x, pz - this.position.z);

    // Ender pearl gap-closer when enemy is far across islands (hard difficulty)
    if (this.profile.usePearls && distBefore > 13 && this.inventory.countItem('ender_pearl') > 0 && this.isSolid(px, Math.floor(py) - 1, pz)) {
      if (this.inventory.takeItem('ender_pearl', 1)) {
        const dx = px - this.position.x, dy = py - this.position.y, dz = pz - this.position.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        this.sendPacket({
          t: 'shot',
          shot: {
            kind: 'ender_pearl',
            x: this.position.x,
            y: this.position.y + 1.5,
            z: this.position.z,
            vx: (dx / len) * 26,
            vy: (dy / len) * 26 + 3,
            vz: (dz / len) * 26,
          },
        });
        this.position = { x: px + 0.8, y: py, z: pz + 0.8 };
        this.lastActionSummary = `ender-pearled to ${peer.name || peer.id}`;
        this.broadcastState({ swinging: true });
      }
    }

    // Projectile opener / knockback denial at medium range
    if (this.profile.useProjectiles && distBefore >= 5.0 && distBefore <= 24) {
      this.fireProjectileAt(peer);
    }

    // Close distance / bridge toward opponent at human speed
    const distAfterPearl = Math.hypot(px - this.position.x, pz - this.position.z);
    if (distAfterPearl > 3.2) {
      this.lastActionSummary = `moving toward ${peer.name || peer.id}`;
      await this.moveStepToward(px, py, pz, {
        avoidVoid: true,
        bridge: this.gameMode !== 'base' && (this.inventory.countPlaceableBlocks() > 0 || this.gamemode === 'creative'),
        stopWithin: 2.2,
        durationMs: this.profile.brainMoveDurationMs,
      });
    }

    const distNow = meleeReachDistance(this.position, { x: px, y: py, z: pz });
    if (distNow > AUTOPILOT_MELEE_REACH) {
      return { ok: false, reason: 'Closing distance to enemy', distance: Number(distNow.toFixed(2)) };
    }

    // Human-paced circle-strafe around target while avoiding void edges
    if (this.profile.strafe) {
      this.strafeAngle += 0.22 * this.strafeDir;
      const strafeRadius = 2.1;
      const targetSx = px + Math.cos(this.strafeAngle) * strafeRadius;
      const targetSz = pz + Math.sin(this.strafeAngle) * strafeRadius;
      const stepDx = targetSx - this.position.x;
      const stepDz = targetSz - this.position.z;
      const stepLen = Math.hypot(stepDx, stepDz) || 1;
      const maxStrafeStep = this.profile.walkSpeed * (this.profile.stepDelayMs / 1000);
      const sx = this.position.x + (stepDx / stepLen) * Math.min(stepLen, maxStrafeStep);
      const sz = this.position.z + (stepDz / stepLen) * Math.min(stepLen, maxStrafeStep);
      const floorY = Math.floor(this.position.y) - 1;
      if (this.isSolid(Math.floor(sx), floorY, Math.floor(sz)) && !this.isSolid(Math.floor(sx), Math.floor(this.position.y), Math.floor(sz))) {
        this.position.x = sx;
        this.position.z = sz;
      } else {
        this.strafeDir *= -1;
      }
    }

    // House bot: the swing through meleeHit -- Java's recharge and charge, the difficulty's skills, turning to face
    // them, and a miss if they are really out of reach (what this copy decided on is where it saw them).
    const swung = this.meleeHit(peer);
    return { ok: true, mode: swung ? 'melee' : 'cooldown', target: peer.name || peer.id };
  }
}
