// The scripted bot: the baseline bot of Blockyland's SkyWars and Bed Wars -- the lobby's "Bot join" bot, and the
// starting point every Agent Arena agent gets to write its own (agentArena/scriptedArena.mjs). DeepSeek built it in the
// arena's labs (as "houseBotDs": 6 of 8 against the house bot it replaced) and rewrote it on the skills: playbooks
// (playbooks/) that see only the general view of a round and act only through skills (skills.mjs, over
// agentArena/skills/skills.mjs), on this session -- its fighting, eating, edge sense and gear -- over base.mjs.
//
// houseBotDs on the skills: the base session (./base.mjs, once the house bot's) with this fork's brains rewritten as
// playbooks (./playbooks/skywars.mjs, ./playbooks/bedwars.mjs) over this fork's skill set (./skills.mjs). Everything that
// made houseBotDs play its own way -- the fighting (bridge defence, edge sense, the swing the moment the cooldown is
// ready, snowballs and eggs, the bow, the pearl clutch), the eating rule, the gear, the forks of the walk and the
// backup fight -- stays what it was: methods of this session, overriding the house bot's where they differ. The brains
// themselves are the playbooks now; what they read from the session that the general view does not carry (the clock,
// health and absorption, the fight's own flags) is asked of a skill that answers it (./skills.mjs).
import {
  ScriptedBotBase, BOT_SKILLS,
} from './base.mjs';
import {
  WEAPON_DAMAGE, AUTOPILOT_MELEE_REACH, JAVA_FOODS,
  meleeReachDistance, attackCooldownMs, attackStrength,
} from '../../../../../../packages/blockyland-mcp/guestPeer.js';
import { PROJECTILE_PHYSICS } from '../../../../../../packages/blockyland-mcp/projectiles.js';
import { createBotSkills } from './skills.mjs';
import { playSkyWars } from './playbooks/skywars.mjs';
export { createBotSkills };
import { playBedWars } from './playbooks/bedwars.mjs';

// The profile is the house bot's, unchanged: the same difficulty limits, the same human's pace.
export { BOT_SKILLS };

/** The games this fork plays, with its own brains as playbooks. */
export const PLAYBOOKS = Object.freeze({ skywars: playSkyWars, bedwars: playBedWars });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

export class ScriptedBotSession extends ScriptedBotBase {
  constructor(options = {}) {
    super(options);
    this.playbooks = PLAYBOOKS;
    this.skillSet = createBotSkills(this);
  }

  // --- eating -----------------------------------------------------------------------------------------------------

  /**
   * The foe has stopped hitting me while this fight is still on: a hit within the last 10 s, and none for 1.5 s. Every
   * guest's eat is 1.6 s with no swing (startEating, and isEating gates meleeHit), so a foe who was swinging and is
   * not now is eating or has broken off. The 10 s bound keeps a stale stamp from an earlier exchange from licensing an
   * eat in front of a foe I have not traded with yet.
   */
  foeQuiet() {
    const since = Date.now() - (this.lastHurtAt ?? -Infinity);
    return since > 1500 && since < 10000;
  }

  // guestPeer.js lines 2691-2716, with houseBotDs's guards
  consumeHealingItem() {
    // The shared rule (GuestPeerSession.healIfNeeded): Java's eating, the same at every difficulty. Its golden-apple
    // branch has no foe check -- at 8 health it starts the 1.6 s eat (no swing meanwhile) whatever the foe is doing.
    // Doing that inside a swinging foe's reach is a free hit: round 1 game 3 ate at 4.67 health with the foe three
    // blocks off and died; round 2 normal ate at 7.15 next to the house at 29.8 s, and Bed Wars at 7.8 with it in
    // reach at 66.3 s and died. The brain calls this every tick, so the guard belongs here, not at a call site.
    // The guard is for a foe who is swinging now. A foe who has not hit me for 1.5 s is eating or has broken off
    // (their eat is the same 1.6 s of no swing as mine), and the round-4 hard-2 loss was my own guard refusing the
    // apple during nine seconds in which the house took no swing at me at all: at 5.32 health, 1.7 blocks off, I
    // needed the eat and the rule said no. Quiet foe, eat.
    const quietFoe = this.foeQuiet();
    if (!quietFoe && this.health <= 8 && [...this.peers.values()].some((q) => q.id !== this.clientId && !q.dead
      && Math.hypot((q.x ?? 0) - this.position.x, (q.y ?? 31) - this.position.y, (q.z ?? 0) - this.position.z) < AUTOPILOT_MELEE_REACH + 0.6)) return false;
    // A golden apple whose effects are already on: 4 absorption (a second one does not stack; it only tops it up) and
    // Regeneration II with more than 2.5 s left. Eating another adds neither, and it is 1.6 s with no swing -- round 3
    // hard ate three in a row at 53.0, 54.6 and 56.2 s, the first one's regeneration running through all of them. An
    // enchanted apple (16 absorption) or any potion (instant health, or a regeneration far longer than the apple's)
    // is still worth the 1.6 s.
    if (this.health <= 8 && (this.absorption ?? 0) >= 3.5 && this.regenEffect
      && this.regenEffect.until - Date.now() > 2500
      && !['enchanted_golden_apple', 'splash_potion_of_healing', 'potion_of_healing',
        'splash_potion_of_regeneration', 'potion_of_regeneration'].some((id) => this.inventory.countItem(id) > 0)) return false;
    return this.healIfNeeded();
  }

  /** A golden apple or a healing/regeneration potion in the pack: something worth opening a fight's distance for. */
  hasCombatHeal() {
    return ['enchanted_golden_apple', 'golden_apple', 'splash_potion_of_healing', 'potion_of_healing',
      'splash_potion_of_regeneration', 'potion_of_regeneration'].some((id) => this.inventory.countItem(id) > 0);
  }

  /**
   * Ordinary food in the pack, when the bar is not already full: eating fills it, and a full bar with saturation
   * regenerates (vitalsTick: 1 health a half-second). Round 2 game 1 died at 2 health on a stone axe with 16 food and
   * no apple left -- the shared rule eats ordinary food only with no foe within 6, and it never opened that room.
   */
  hasFood() {
    if (this.food >= 20) return false;
    return Object.keys(JAVA_FOODS).some((id) => !String(id).includes('golden_apple') && this.inventory.countItem(id) > 0);
  }

  /** The most filling ordinary food in the pack, or null when the bar is full or there is none: the shared rule's
   * choice, with the same saturation-first order (healIfNeeded) but callable without its no-foe-within-6 gate. */
  bestFood() {
    if (this.food >= 20) return null;
    const foods = Object.keys(JAVA_FOODS).filter((id) => !id.includes('golden_apple') && this.inventory.countItem(id) > 0);
    foods.sort((a, b) => JAVA_FOODS[b][1] - JAVA_FOODS[a][1]);
    return foods[0] ?? null;
  }

  // --- the house bot's own fighting (not in the original) ----------------------------------------------------------

  /**
   * The bow, across actions (a full draw is a second, longer than one action): start drawing at a foe 12-30 blocks
   * off, keep the aim on them, and loose when the draw is full -- at the difficulty's projectile cooldown, as the
   * original's projectiles. An arrow flies for real (the bot API's flight): it hits only if it reaches them. True
   * while busy with it.
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
      if (!aimed) { this.bowDrawAt = null; this.bot.deactivateItem(); this.equipBattleGear(); return false; } // too close, or out of range: drop it
      if (aimed === true && Date.now() - this.bowDrawAt >= 1050) {
        this.bot.deactivateItem();
        this.bowDrawAt = null;
        this.lastProjectileAt = Date.now();
        this.lastActionSummary = `shot an arrow at ${f.name || f.id}`;
        this.equipBattleGear();
      } else this.lastActionSummary = `drawing the bow at ${f.name || f.id}`;
      return true;
    }
    // Start a draw only with room for it to finish: a full draw is 1.05 s and a sprinting foe covers six blocks in
    // that time, so at 8-11 they arrive before the arrow leaves and the draw was a free hit taken. From 12 the shot
    // gets away; closer than that the sword does more in the same second.
    if (d < 12 || d > this.skills.bowRange || Date.now() - (this.lastProjectileAt ?? 0) < this.skills.projectileEveryMs) return false;
    if (this.inventory.countItem('arrow') < 1 || !this.holdItem('bow')) { this.equipBattleGear(); return false; }
    const aimed = aim();
    if (!aimed) { this.equipBattleGear(); return false; }
    if (aimed === 'turning') { this.lastActionSummary = `turning to ${f.name || f.id}`; return true; } // draw once facing them
    void this.bot.activateItem();
    this.bowDrawAt = Date.now();
    this.lastActionSummary = `drawing the bow at ${f.name || f.id}`;
    return true;
  }

  /**
   * Ground with ground on all eight sides of it: the inside of an island, not its rim. A hit carries a fighter about
   * three blocks, so a cell with the void one step away is a fall waiting to happen -- the round-4 final's two
   * SkyWars losses both ended with a step (or a knock-back) from just such a cell.
   */
  islandSpot(x, y, z) {
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) if (!this.groundAt(x + ox, y, z + oz)) return false;
    return true;
  }

  /**
   * The cell a pearl should bring me back to: the last wide ground, or -- when I last stood on an island's rim --
   * the nearest cell inside it. Both round-4 final losses pearled back onto the rim they had just been knocked off
   * (hard-3's pearls landed on the block at [0, 31, -9] and then [0, 31, -10], two cells from the edge), which is a
   * reprieve of half a second, not a rescue.
   */
  lastLandInterior() {
    const land = this.houseLastLand;
    if (!land) return null;
    const bx = Math.floor(land.x), bz = Math.floor(land.z), y = land.y;
    for (let r = 0; r <= 3; r++) {
      let best = null, bestScore = Infinity;
      for (let ox = -r; ox <= r; ox++) for (let oz = -r; oz <= r; oz++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) !== r) continue;
        const x = bx + ox + 0.5, z = bz + oz + 0.5;
        if (!this.islandSpot(x, y, z)) continue;
        const score = Math.hypot(x - land.x, z - land.z);
        if (score < bestScore) { bestScore = score; best = { x, y, z }; }
      }
      if (best) return best;
    }
    return land;
  }

  /**
   * Void on the line a hit from (fx, fz) would send me along, within four blocks: no place to trade hits. Four, not
   * two: a sprint hit carries a fighter about three blocks (normal-5's 117.2 s hit took me from x 9.1 to 12.3 and off
   * the rim), so "the void is three blocks behind me" is the same as standing on the edge.
   */
  voidBehind(fx, fz) {
    const p = this.position, dx = p.x - fx, dz = p.z - fz, len = Math.hypot(dx, dz) || 1;
    for (const k of [1, 2, 3, 4]) if (!this.groundAt(p.x + (dx / len) * k, p.y, p.z + (dz / len) * k)) return true;
    return false;
  }

  /**
   * One melee hit, by Java's rules -- the weapon's damage scaled by how far it has recharged (0.2 + 0.8 x charge^2),
   * a critical hit x1.5 -- and by skill: easy swings at half charge (a weaker hit), normal and hard at full; normal's
   * hits are sprint hits (more knock-back); hard chooses, at full charge, a sprint hit when the foe has the void behind
   * them, otherwise a jump critical. False while it waits (recharge, eating).
   */
  meleeHit(peer) {
    if (this.isEating()) return false;
    // The walk and the builder leave a block in the hand after placing one: take the blade (the best-damage-a-second
    // one) before the cooldown is measured, or the swing is a one-damage fist.
    this.equipBattleGear();
    const now = Date.now();
    const held = this.inventory.getActiveItem();
    const weaponId = held && typeof held.id === 'string' ? held.id : null;
    const cooldown = attackCooldownMs(weaponId), since = now - (this.lastMeleeAt ?? 0);
    if (since < cooldown * this.skills.swingAtCharge) return false;
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

  /** Falling into the void with an ender pearl: throw it back onto the last wide ground (its inside). */
  pearlClutch() {
    const land = this.lastLandInterior(), p = this.position;
    if (!land || this.isDead || this.gamemode !== 'survival' || Date.now() - (this.pearledAt ?? 0) < 1500) return false;
    if (p.y > land.y - 3 || this.inventory.countItem('ender_pearl') < 1) return false;
    for (let y = Math.floor(p.y) - 1; y > Math.floor(p.y) - 12; y--) if (this.isSolid(Math.floor(p.x), y, Math.floor(p.z))) return false;
    if (!this.throwAt('ender_pearl', land.x, land.y + 0.2, land.z)) return false;
    this.pearledAt = Date.now();
    this.lastActionSummary = 'falling: ender pearl back to land';
    return true;
  }

  /** In multi-player games, preserve pearls for clutch recovery rather than forward diving into multi-enemy groups. */
  pearlToward(f, d) {
    const aliveCount = [...this.peers.values()].filter((p) => p.id !== this.clientId && !p.dead && p.gamemode !== 'spectator').length;
    if (aliveCount > 1) return false;
    return super.pearlToward(f, d);
  }

  // --- the clock, my gear, and the ground a plan needs -------------------------------------------------------------

  /**
   * Seconds into the round, from my own clock at the round's first playing tick. The host's `elapsed` is used when it
   * agrees with mine (a round clock counting up); if it is instead a countdown, or from some earlier start, mine is
   * the safe measure -- a clock read backwards would send me off half-looted at the first tick.
   */
  houseElapsed(game) {
    const st = game === 'skywars' ? this.skywarsState : this.bedwarsState;
    const now = Date.now(), key = `${game}:${st?.round ?? 0}`;
    this.houseClock ??= new Map();
    if (!this.houseClock.has(key)) this.houseClock.set(key, now);
    const local = (now - this.houseClock.get(key)) / 1000;
    const raw = Number(st?.elapsed);
    if (Number.isFinite(raw) && raw >= 0) {
      const host = raw > 1000 ? raw / 1000 : raw;
      if (host <= local + 15) return host;
    }
    return local;
  }

  /** A new round starts its clock: forget every start recorded outside a playing phase (a lobby, between rounds). */
  resetHouseClock(game) {
    // A new round is a new foe with new gear: the measured hit size from the last one does not carry (the estimate
    // only ever rises in a fight, so a foe who loses armour would keep it high otherwise).
    this.hitSizeEst = 0;
    this.fightHp = null;
    if (!this.houseClock) return;
    for (const key of [...this.houseClock.keys()]) if (key.startsWith(`${game}:`)) this.houseClock.delete(key);
  }

  /** The best melee damage I carry: the weapon's damage and its sharpness. */
  bestWeaponDamage() {
    let best = 1;
    for (const s of this.inventory.allSlots()) {
      if (!s) continue;
      const dmg = WEAPON_DAMAGE[s.id] ?? 0;
      if (!dmg) continue;
      const sharp = (s.enchantments ?? []).find((e) => e.id === 'sharpness')?.level ?? 0;
      best = Math.max(best, dmg + (sharp ? 0.5 * sharp + 0.5 : 0));
    }
    return best;
  }

  /** Armour points worn (guestPeer's ARMOR_SCORE per piece), for comparing gear. */
  armorPoints() {
    const score = {
      leather_helmet: 1, golden_helmet: 2, chainmail_helmet: 2, iron_helmet: 2, turtle_helmet: 2, diamond_helmet: 3, netherite_helmet: 3,
      leather_chestplate: 3, golden_chestplate: 5, chainmail_chestplate: 5, iron_chestplate: 6, diamond_chestplate: 8, netherite_chestplate: 8,
      leather_leggings: 2, golden_leggings: 3, chainmail_leggings: 4, iron_leggings: 5, diamond_leggings: 6, netherite_leggings: 6,
      leather_boots: 1, golden_boots: 1, chainmail_boots: 1, iron_boots: 2, diamond_boots: 3, netherite_boots: 3,
    };
    let n = 0;
    for (const piece of Object.values(this.inventory.armor ?? {})) if (piece) n += score[piece.id] ?? 0;
    return n;
  }

  /** Armour pieces worn (0-4). */
  armorPieces() { return Object.values(this.inventory.armor ?? {}).filter(Boolean).length; }

  /**
   * Armour on, and in hand the weapon that does the most damage a second -- not the biggest single hit. The shared
   * equipBest scores raw damage, so a stone or iron axe (9 a hit) beats a diamond sword (7): two hits every 2.5 s
   * against five in the same time, and a fight is lost on that alone. Between the two of them every blow also goes
   * through meleeHit, which re-equips here, so a block placed by the walk can never be what the next swing lands with
   * (a fist hit: one damage). The hurt window lets a victim take one hit a half-second, so a very fast weapon's rate
   * is capped at two a second -- a knock-back stick (2 damage, 250 ms) is worth nothing next to a sword.
   */
  equipBattleGear() {
    this.inventory.equipBest();
    const charge = this.skills.swingAtCharge || 1;
    const score = (s) => {
      if (!s) return -1;
      const base = WEAPON_DAMAGE[s.id];
      if (!base) return -1;
      const sharp = (s.enchantments ?? []).reduce((a, e) => a + (e.id === 'sharpness' ? 0.5 * e.level + 0.5 : 0), 0);
      const rate = Math.min(1000 / (attackCooldownMs(s.id) * charge), 2); // two hits a second at most (the hurt window)
      return (base + sharp) * rate;
    };
    let best = -1, bestList = null, bestIdx = -1;
    for (const list of [this.inventory.hotbar, this.inventory.storage]) {
      for (let i = 0; i < list.length; i++) {
        const sc = score(list[i]);
        if (sc > best) { best = sc; bestList = list; bestIdx = i; }
      }
    }
    if (bestIdx < 0) return false;
    if (bestList === this.inventory.hotbar) { this.inventory.activeSlot = bestIdx; return true; }
    const target = this.inventory.hotbar.findIndex((s) => !s);
    const swap = target >= 0 ? target : 0;
    const prev = this.inventory.hotbar[swap];
    this.inventory.hotbar[swap] = this.inventory.storage[bestIdx];
    this.inventory.storage[bestIdx] = prev;
    this.inventory.activeSlot = swap;
    return true;
  }

  /** Standable ground: a solid block under it, and its own and head cells free. */
  standable(x, y, z) {
    return this.groundAt(x, y, z) && !this.isSolid(Math.floor(x), Math.floor(y), Math.floor(z)) && !this.isSolid(Math.floor(x), Math.floor(y) + 1, Math.floor(z));
  }

  /**
   * Is there a void on the straight line from me to (fx, fz) at my own foot height? The fight's walk then bridges only
   * where the crossing is actually a crossing: with bridge on over continuous ground the shared walk fills cells under
   * its feet, and a step up onto one of those cells makes the next one higher -- the staircase both round-2 games
   * climbed (easy y 31 to 36, normal 31 to 35) while neither could reach the other. A one-block drop counts as ground
   * (the walk steps down); only a real gap asks for a block.
   */
  voidOnLineTo(fx, fz, y) {
    const p = this.position;
    const dx = fx - p.x, dz = fz - p.z, dist = Math.hypot(dx, dz);
    if (dist < 1.5) return false;
    const ux = dx / dist, uz = dz / dist;
    for (let s = 1; s < dist - 0.4; s += 0.8) {
      if (this.hasGroundAt(p.x + ux * s, y, p.z + uz * s, 1) === null) return true;
    }
    return false;
  }

  /**
   * At home with the foe on a bridge or an edge and me on wide ground: wait, out of their reach, and let them come to
   * me. Walking out onto a one-block bridge to meet them gives the void the first say. False when they are already
   * close enough to hit.
   */
  holdGroundAgainst(foe, d) {
    if (d <= 4) return false;
    const p = this.position, fx = foe.x ?? 0, fy = foe.y ?? 31, fz = foe.z ?? 0;
    return this.wideAt(p.x, p.y, p.z) && !this.wideAt(fx, fy, fz);
  }

  /**
   * A point away from (fx, fz) with safe ground under the way: where I give ground after trading hits, so a foe acting
   * on where it saw me swings at air.
   */
  backOffSpot(fx, fz) {
    const p = this.position, dx = p.x - fx, dz = p.z - fz, len = Math.hypot(dx, dz);
    if (len < 0.05) return null;
    const base = Math.atan2(dz, dx);
    let fallback = null;
    for (let i = 0; i < 9; i++) {
      const a = base + (i === 0 ? 0 : ((i % 2 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 6);
      const x = p.x + Math.cos(a) * 4, z = p.z + Math.sin(a) * 4;
      if (!this.standable(x, p.y, z)) continue;
      if (!this.standable(p.x + Math.cos(a) * 2, p.y, p.z + Math.sin(a) * 2)) continue;
      // Room behind the spot on the way I give ground: a hit carries a fighter about three blocks, and fleeing to a
      // cell with the void a step further was the round-4 final's normal loss (the apple at 118.3 s went down on the
      // rim, and the knock-back at 118.9 s took me off it). Only a spot with ground three more blocks behind it is a
      // place to stand at low health; the rim is a fall waiting for one hit.
      let room = true;
      for (const k of [1, 2, 3]) if (!this.standable(x + Math.cos(a) * k, p.y, z + Math.sin(a) * k)) { room = false; break; }
      if (room && this.islandSpot(x, p.y, z)) return { x, z };
      if (room) fallback ??= { x, z };
      else if (!fallback && this.wideAt(x, p.y, z)) fallback = { x, z };
    }
    return fallback;
  }

  /** Where to stand so the foe has the void behind them on my line: my hit there is a step toward theirs. */
  edgeSpot(f, reach) {
    const fx = f.x ?? 0, fy = f.y ?? 31, fz = f.z ?? 0;
    for (let ring = 0; ring < 2; ring++) {
      const r = reach - 0.5 - ring * 0.8;
      let best = null, bestScore = Infinity;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const x = fx + Math.cos(a) * r, z = fz + Math.sin(a) * r;
        if (!this.standable(x, fy, z)) continue;
        // Inside the island, not on its rim: the herd walks me to this cell, and a one-cell ledge beside the void
        // was normal-5's fall at 100.3 s ("taking the island side"), pearled back for 5 health.
        if (!this.islandSpot(x, fy, z)) continue;
        const dx = fx - x, dz = fz - z, len = Math.hypot(dx, dz) || 1;
        let drop = false;
        for (const k of [1, 2]) if (!this.groundAt(fx + (dx / len) * k, fy, fz + (dz / len) * k)) drop = true;
        if (!drop) continue;
        const score = Math.hypot(x - this.position.x, z - this.position.z);
        if (score < bestScore) { bestScore = score; best = { x, z }; }
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * A fight, for one brain action: the bow (or a thrown item) while far, a golden apple before the blows, then pressure
   * -- swing whenever the foe is in reach as I last saw them; keep the void behind me, never in front of me; take the
   * side that puts their back to the void; pillar to one above; hold wide ground against one on a bridge (hard).
   */
  async engageTactics(peer) {
    {
      // The bow first, while drawing or when the foe is far: the whole action is spent on it (a draw stands still).
      const f = this.peers.get(peer.id) ?? peer;
      const d0 = Math.hypot((f.x ?? 0) - this.position.x, (f.y ?? 31) - this.position.y, (f.z ?? 0) - this.position.z);
      if (this.skills.bowRange > 0 && this.bowAction(f, d0)) { await sleep(this.profile.brainMoveDurationMs); return { ok: true, mode: 'bow' }; }
    }
    this.equipBattleGear();
    {
      // Eat only with room (consumeHealingItem refuses the in-reach eat now). With the foe far, eat as early as 15
      // health so the absorption and regeneration are already working when the blows start; the same rule as the
      // house bot's, one step safer.
      const f = this.perceive(this.peers.get(peer.id) ?? peer) ?? peer;
      const d = Math.hypot((f.x ?? 0) - this.position.x, (f.z ?? 0) - this.position.z);
      const absorb = this.absorption ?? 0;
      if (!f.dead) {
        this.consumeHealingItem();
        const apple = this.inventory.countItem('golden_apple') > 0;
        if (!this.isEating() && apple && absorb < 2 && this.health <= 15 && d > 8) {
          this.startEating('golden_apple');
          await sleep(this.profile.stepDelayMs);
        } else if (!this.isEating() && apple && absorb < 1 && !this.skills.crits && this.health <= 14 && d > 5.5) {
          // An apple before the blows, not after them: 4 absorption and Regeneration II are worth one hit, and the
          // round-4 final's normal loss was fought from 11 health with neither. The house ate at 112.8 s with the foe
          // 3 blocks off and came from 2.9 health to 20; I held the apple until 2.2 health at 118.3 s, on the rim.
          // At hard a critical hit (x1.5) can take this much at once, so this one is for the difficulties that cannot.
          this.startEating('golden_apple');
          await sleep(this.profile.stepDelayMs);
        } else if (!this.isEating() && apple && absorb < 1 && this.health <= 15 && this.foeQuiet()) {
          // No hit taken for 1.5 s while this fight is on: the foe is eating -- every guest's eat is 1.6 s with no
          // swing (startEating, and isEating gates meleeHit) -- or has broken off. That is the window to put my own
          // apple down, even inside their reach. Round-4 hard-2 is exactly the loss this saves: the house started
          // six golden apples at 6.78 health and below from 20.9 to 29.0 s while I stood 1.7 blocks off and fed it
          // 2.9-damage crits; I took no hit in those nine seconds, was at 10.88 health with no absorption, and never
          // ate one of my own -- it out-sustained me and then killed me at 33.3 s.
          this.startEating('golden_apple');
          await sleep(this.profile.stepDelayMs);
        } else if (!this.isEating() && apple && absorb < 1 && this.skills.swingAtCharge < 1 && this.health > 15 && d > 4.5) {
          // Easy's swings are half-charged (BOT_SKILLS.easy.swingAtCharge): a hit here is 1.5-3.4, so the 1.6 s
          // eat costs two or three of them -- less than the 4 absorption and 4 regeneration it buys, and the bar it
          // starts from is the difference between the house's 8-health apple winning the race and mine arriving
          // after it. Round-6 easy-1: the fight opened at 20 v 20 and I never had absorption until 67.5 s, four
          // seconds after the house's first apple had landed. The house eats at 8 health inside reach whenever it
          // likes; this is the same trade, one exchange earlier, and only where its hits are small.
          this.startEating('golden_apple');
          await sleep(this.profile.stepDelayMs);
        } else if (!this.isEating() && this.health <= 16 && this.foeQuiet()) {
          // No apple going down and the bar is not full: a filled hunger bar with saturation regenerates (vitalsTick,
          // 1 health a half-second), and healIfNeeded will not touch ordinary food with a foe inside 6 blocks. Round-4
          // hard-2: 11.88 health, food 17, nine quiet seconds at 1.7 blocks while the house ate apple after apple;
          // a full bar alone would have carried me back to 20 before it swung again at 29.5 s.
          const best = this.bestFood();
          if (best) { this.startEating(best); await sleep(this.profile.stepDelayMs); }
        }
      }
    }
    const reach = AUTOPILOT_MELEE_REACH;
    const live = () => this.perceive(this.peers.get(peer.id) ?? peer) ?? peer;
    const step = this.profile.stepDelayMs;
    const until = Date.now() + this.profile.brainMoveDurationMs;
    let hit = false;
    {
      const f = live(), d0 = Math.hypot((f.x ?? 0) - this.position.x, (f.y ?? 31) - this.position.y, (f.z ?? 0) - this.position.z);
      if (this.skills.pearls === 'full' && this.pearlToward(f, d0)) { this.equipBattleGear(); return { ok: true, mode: 'pearl' }; }
      if (d0 > reach && this.skills.throwables && this.throwAtFoe(f, d0)) { this.equipBattleGear(); return { ok: true, mode: 'throw' }; }
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
      const flat = Math.hypot(fx - p.x, fz - p.z);
      const d = Math.hypot(fx - p.x, fy - p.y, fz - p.z);
      const meWide = this.wideAt(p.x, p.y, p.z), foeWide = this.wideAt(fx, fy, fz);

      // At the bottom of the health bar, open the distance before the apple: the eat is 1.6 s with no swing, and at
      // 5-7 health the next hit is death. Round 2 normal stood at 1.67 health trading until it died, and Bed Wars ate
      // at 7.8 with the foe 4 blocks off and died. Once the apple is going down, keep backing off until it lands.
      // How much a hit costs me, measured rather than assumed: the largest drop in my health in one step where the
      // foe was in reach. The retreat triggers at two of those, not at a flat 7.5 -- round-5 hard-3 kept fighting at
      // 8.32 with the house's crits costing 5.34 (to 3.98) and had to win the rest from there; two measured hits is
      // the exchange that can kill before the next brain tick.
      if (this.fightHp != null && this.health < this.fightHp && meleeReachDistance(p, f) <= reach + 1.2) {
        const lost = this.fightHp - this.health;
        if (lost >= 0.5 && lost <= 8) this.hitSizeEst = Math.max(this.hitSizeEst ?? 0, lost);
      }
      this.fightHp = this.health;
      {
        const low = this.health <= Math.max(7.5, Math.min(11, 2 * (this.hitSizeEst ?? 0))) && (this.absorption ?? 0) < 1;
        if (low) this.breakOffSince ??= Date.now(); else this.breakOffSince = null;
        const eating = this.isEating() && this.health < 12;
        // An apple or a potion heals at once; ordinary food only after filling the bar and its saturation regenerate.
        // Both need the foe more than 6 blocks off to be eaten at all, so both are worth opening the distance for --
        // with neither, fighting is the only play left (running without a heal just loses the ground).
        const canHeal = this.hasCombatHeal() || this.hasFood();
        const fleeing = low && canHeal && (f.health ?? 20) > 5
          && flat < 6.5 && Date.now() - (this.breakOffSince ?? 0) < 3000;
        if (fleeing || (eating && flat < 4.5)) {
          // Only ground with room behind it (backOffSpot hands back a rim cell as a last resort): the retreat is
          // where the apple goes down, and a hit there must not be a fall.
          const spot = this.backOffSpot(fx, fz);
          if (spot) {
            this.lastActionSummary = `making room to heal from ${f.name || f.id}`;
            await this.moveStepToward(spot.x, p.y, spot.z, { avoidVoid: true, bridge: false, stopWithin: 0.4, durationMs: Math.max(step, 150) });
            this.consumeHealingItem(); // the moment there is room, the apple starts (healIfNeeded wants >3.6 blocks)
            continue;
          }
        }
      }

      // A snowball or an egg at a foe on narrow ground: one clean hit there is a fall. Then close on them -- with my
      // weapon back in hand (the thrown one may have been the slot I was holding).
      if (this.skills.throwables && d > reach && this.throwAtFoe(f, d)) this.equipBattleGear();

      // Swing the moment they are in reach (as I last saw them) and the recharge allows: pressure beats waiting.
      if (meleeReachDistance(p, f) <= reach && this.meleeHit(f)) hit = true;

      if (this.knockbackActive) { await sleep(step); continue; }
      // A foe 2 or more below, out of reach: get down to them (every difficulty: a beginner walks off a ledge too).
      if (fy <= p.y - 2 && meleeReachDistance(p, f) > reach && Math.hypot(fx - p.x, fz - p.z) < 8 && (await this.climbDown(fx, fz))) continue;

      // Never trade hits with the void behind me.
      if (this.skills.edge && d <= reach + 0.7 && this.voidBehind(fx, fz)) {
        const spot = this.saferSpot(fx, fz, reach);
        if (spot) { this.lastActionSummary = `stepping off the edge line of ${f.name || f.id}`; await this.moveStepToward(spot.x, p.y, spot.z, { avoidVoid: true, bridge: false, stopWithin: 0.2, durationMs: step }); continue; }
      }

      // A foe on higher ground comes down to me: hold at my own level and let them. The lower fighter's eyes reach the
      // higher one's body while the higher one's glance over the lower, so level or below is the better half of the
      // reach -- and following them up is how both round-2 SkyWars games climbed (easy y 31 to 36, normal 31 to 35)
      // with neither able to land a hit. Only a foe who *stays* above (normal/hard's pillar, below) goes chased.
      {
        const above = fy - p.y;
        if (above >= 1.5 && flat <= 6) {
          this.foeAboveSince ??= Date.now();
          if (Date.now() - this.foeAboveSince < 1500) {
            this.faceToward(fx, fy + 1.2, fz);
            this.lastActionSummary = `holding below ${f.name || f.id}`;
            await sleep(step);
            continue;
          }
        } else if (above < 1.5) this.foeAboveSince = null;
      }

      {
        // A foe standing on ground 2 or more above me, close across (up a tree, on a tower): pillar up to them.
        const above = fy - p.y, across = flat;
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

      // Bridge defence: they must come to me over narrow ground; I wait on mine, facing them (6 s at most). Out of
      // their reach only: standing still just outside reach is how hard-3 took its first free hits (13.6-15.8 s,
      // "holding for HouseBot on the bridge" while the house closed and hit down from one block higher).
      if (this.skills.bridgeDefence && meWide && !foeWide && d > 4.2 && d < 14 && Date.now() - (this.holdSince ?? Date.now()) < 6000) {
        this.holdSince ??= Date.now();
        this.faceToward(fx, fy + 1.2, fz);
        this.lastActionSummary = `holding for ${f.name || f.id} on the bridge`;
        await sleep(step);
        continue;
      }
      if (foeWide) this.holdSince = null; // they left the bridge: a later stand-off starts its own clock

      // When on narrow ground (bridge / edge), never advance head-on into an oncoming foe: retreat to wide island ground!
      if (this.skills.bridgeDefence && !meWide && d > reach && d < 14) {
        const spot = this.backOffSpot(fx, fz);
        if (spot) {
          this.lastActionSummary = `retreating to wide ground from ${f.name || f.id}`;
          await this.moveStepToward(spot.x, p.y, spot.z, { avoidVoid: true, bridge: false, stopWithin: 0.4, durationMs: step });
          continue;
        }
      }

      // The void is behind them on my line: take that side, so the next hit is a fall (and hard's sprint hit). Not at
      // the bottom of my own bar: standing on the rim to herd is how hard-3 fell at 20.0 s ("stepping off the edge
      // line") and again after the pearl brought it back to the same rim.
      if (this.skills.edge && !this.voidBehindOf(f) && d > 1.5 && d < 7 && Date.now() > (this.herdUntil ?? 0)
        && (this.health > 10 || (this.absorption ?? 0) >= 2)) {
        const spot = this.edgeSpot(f, reach);
        if (spot && Math.hypot(spot.x - p.x, spot.z - p.z) < 4.5) {
          this.herdUntil = Date.now() + 900;
          this.lastActionSummary = `taking the island side of ${f.name || f.id}`;
          await this.moveStepToward(spot.x, p.y, spot.z, { avoidVoid: true, bridge: false, stopWithin: 0.25, durationMs: step * 2 });
          continue;
        }
      }

      if (d > reach - 0.55) {
        this.lastActionSummary = `moving toward ${f.name || f.id}`;
        // Never build *upward* toward a foe: the shared walk turns a higher target into a stair, and each stair into
        // the other's next stair -- the tower race of game 1 (y 32 to 45, neither able to hit). Easy and normal have no
        // pillaring at all, and at hard the pillar branch above is the only place that skill is used. Aim at the
        // lower of our two heights instead: a foe one above is still in reach, and the lower fighter's eyes reach the
        // higher fighter's body while the higher one's glance over the lower -- so level or below is where to fight.
        // Bridge only over a real gap on my own level, too: over continuous ground the walk's bridge fills cells under
        // its feet and each step up onto one raises the next -- the round-2 staircases. A foe at another height is
        // walked to on mine; the bridge would build toward them.
        const walkY = Math.min(fy, p.y);
        const wantBridge = this.gameMode !== 'base'
          && (this.inventory.countPlaceableBlocks() > 0 || this.gamemode === 'creative')
          && Math.abs(fy - p.y) <= 1.5 && this.voidOnLineTo(fx, fz, p.y);
        await this.moveStepToward(fx, walkY, fz, {
          avoidVoid: true,
          bridge: wantBridge,
          // Just inside reach on level ground; across a height the walk measures across, not up.
          stopWithin: Math.abs(walkY - p.y) > 1.5 ? 2.2 : reach - 0.55,
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
    let best = null, bestScore = Infinity, fallbackOK = null;
    for (let a = 0; a < 8; a++) {
      const x = p.x + Math.cos((a * Math.PI) / 4), z = p.z + Math.sin((a * Math.PI) / 4);
      if (!this.groundAt(x, p.y, z) || this.isSolid(Math.floor(x), Math.floor(p.y), Math.floor(z))) continue;
      const dx = x - fx, dz = z - fz, len = Math.hypot(dx, dz) || 1;
      if (!this.groundAt(x + dx / len, p.y, z + dz / len) || !this.groundAt(x + (2 * dx) / len, p.y, z + (2 * dz) / len)) continue;
      // Not a corner: ground on both sides across the line, too. A corner cell passes the "ground behind" test along
      // one edge while the other edge is the void -- hard-3's fall at 20.0 s stepped onto exactly that (0.3, 28.7,
      // -11.9 after "stepping off the edge line"), and the pearl that followed landed on the same rim.
      const sx = -dz / len, sz = dx / len;
      if (!this.groundAt(x + sx, p.y, z + sz) || !this.groundAt(x - sx, p.y, z - sz)) continue;
      const score = Math.abs(len - (reach - 1));
      if (this.islandSpot(x, p.y, z)) { if (score < bestScore) { bestScore = score; best = { x, z }; } }
      else if (!fallbackOK) fallbackOK = { x, z };
    }
    return best ?? fallbackOK;
  }

  // guestPeer.js lines 2790-2902, with houseBotDs's gear and swing
  async engageEnemyOriginal(peer) {
    if (!peer) return { ok: false, reason: 'No enemy target' };
    this.equipBattleGear();
    // The same eating rule as the main loop: never a 1.6 s eat inside their reach.
    if (Math.hypot((peer.x ?? 0) - this.position.x, (peer.z ?? 0) - this.position.z) > 6) this.consumeHealingItem();

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

/** The name the arena's match runner and older code load a bot module by. */
export { ScriptedBotSession as HouseAutopilotSession };
