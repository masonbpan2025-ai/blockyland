// The referee for script-driven bots (the scripted bot, and every agent's version of it): it sits on a bot's packets and
// drops any hit that Minecraft Java and the difficulty would not allow -- beyond the 3-block reach, faster than the
// weapon's recharge, harder than the weapon, a critical or sprint hit the difficulty lacks, a projectile hit with no
// projectile thrown -- and notes movement faster than sprinting. The limits are the repository's own (BOT_SKILLS of
// agentArena/scriptedBot/base.mjs), never a bot's copy of them: an agent's bot cannot widen what its referee allows.
//
//   onSession: referee('Name', violations)   (agentArena/botMatch.mjs player spec)
// Each violation: { t, who, kind: 'hit' | 'speed', detail, dropped }.
import { BOT_SKILLS } from './scriptedBot/base.mjs';
import { attackCooldownMs, meleeReachDistance, WEAPON_DAMAGE, AUTOPILOT_MELEE_REACH, DIFFICULTY_PROFILES } from '../packages/blockyland-mcp/guestPeer.js';

/** The sprinting speed the rules allow at a difficulty (the guest's profile, not the bot's). */
const sprintSpeed = (difficulty) => DIFFICULTY_PROFILES?.[difficulty]?.sprintSpeed ?? 5.612;
const sprintAllowed = (difficulty) => DIFFICULTY_PROFILES?.[difficulty]?.sprintAllowed ?? true;

export function referee(name, violations) {
  return (s) => {
    const send = s.sendPacket.bind(s);
    let lastMelee = 0, lastSpeedNote = 0;
    const trail = [];
    const shots = [];
    const flag = (kind, detail, dropped) => violations.push({ t: Date.now(), who: name, kind, detail, dropped });
    s.sendPacket = (m) => {
      const now = Date.now();
      if (m?.t === 'shot') shots.push({ kind: m.shot?.kind, t: now });
      if (m?.t === 'player_state' && m.state) {
        // Speed over a second: never past sprinting, bar knock-back (hurt within the window) and an ender pearl. A jump
        // of more than 6 blocks in one update is the game moving them (a respawn, a round start): start over.
        const st = m.state;
        const prev = trail[trail.length - 1];
        if (prev && Math.hypot(st.x - prev.x, st.z - prev.z) > 6) trail.length = 0;
        trail.push({ x: st.x, z: st.z, t: now });
        while (trail.length > 2 && now - trail[1].t >= 1000) trail.shift();
        const from = trail[0];
        if (now - from.t >= 1000 && !s.knockbackActive && now - (s.lastHurtAt ?? 0) > 2500 && now - lastSpeedNote > 2000) {
          const v = Math.hypot(st.x - from.x, st.z - from.z) / ((now - from.t) / 1000);
          const pearl = shots.some((x) => x.kind === 'ender_pearl' && now - x.t < 4000);
          if (v > sprintSpeed(s.difficulty) * 1.15 && !pearl) { flag('speed', `${v.toFixed(1)} blocks/s over a second`, false); lastSpeedNote = now; }
        }
      }
      if (m?.t === 'attack') {
        const target = s.peers.get(m.target);
        const sk = BOT_SKILLS[s.difficulty] ?? BOT_SKILLS.normal;
        let bad = null;
        if (m.projectile) {
          const i = shots.findIndex((x) => (x.kind === m.projectile || (m.projectile === 'snowball' && x.kind === 'ender_pearl')) && now - x.t < 8000);
          if (i < 0) bad = 'a projectile hit with no projectile thrown';
          else { shots.splice(i, 1); if (m.projectile === 'arrow' && m.damage > 12.5) bad = `an arrow for ${m.damage}`; }
        } else {
          const held = s.inventory.getActiveItem()?.id ?? null;
          const sharp = (s.inventory.getActiveItem()?.enchantments ?? []).find((e) => e.id === 'sharpness');
          const base = (WEAPON_DAMAGE[held] ?? 1) + (sharp ? 0.5 * sharp.level + 0.5 : 0);
          if (!target) bad = 'a hit on no one';
          else if (meleeReachDistance(s.position, target) > AUTOPILOT_MELEE_REACH + 0.05) bad = `reach ${meleeReachDistance(s.position, target).toFixed(2)}`;
          else if (now - lastMelee < attackCooldownMs(held) * sk.swingAtCharge - 60) bad = `${now - lastMelee} ms after the last hit (recharge ${attackCooldownMs(held)} ms)`;
          else if (m.damage > base * 1.5 + 0.01) bad = `damage ${m.damage} with ${held ?? 'a fist'}`;
          else if (m.isCritical && !sk.crits) bad = 'a critical hit, not a skill at this difficulty';
          else if (m.isSprint && !sprintAllowed(s.difficulty)) bad = 'a sprint hit, no sprinting at this difficulty';
          if (!bad) lastMelee = now;
        }
        if (bad) { flag('hit', bad, true); return true; }
      }
      return send(m);
    };
  };
}

/** The frame that called the function the referee wrapped (its stack: the error, the wrapper, then the caller). */
const callerOf = (stack) => String(stack ?? '').split('\n')[2] ?? '';
/** Code of the game client the bots run on (packages/blockyland-mcp/guestPeer.js): never a bot's own file. */
const fromGame = (frame) => /blockyland-mcp[\/]guestPeer\.js/.test(frame);
/** Within this of a team's shopkeeper (guestPeer.js SHOP_REACH), and a little slack for a position a tick old. */
const KEEPER_REACH = 6.5;

/**
 * The Bed Wars referee: the hits and speed of referee() above, and Bed Wars' own economy, where the bot's inventory
 * lives in its own process and the host takes its word for what it bought:
 * - an item enters the inventory only through the game client (a purchase, a host's grant, a pickup), never from the
 *   bot's own code: anything else is dropped;
 * - a team upgrade or trap is sent only by the game client's own purchase (which takes the diamonds first), and only
 *   near the team upgrades keeper; an item bought only near the item shop;
 * - no explosion or TNT message: the bot client has neither, so a bot never sends one.
 */
export function bedwarsReferee(name, violations) {
  const base = referee(name, violations);
  return (s) => {
    base(s);
    const flag = (kind, detail, dropped) => violations.push({ t: Date.now(), who: name, kind, detail, dropped });
    const near = (which) => {
      const team = s.me?.()?.team;
      const npc = s.bedwarsArena?.bases?.find((b) => b.team === team)?.[which];
      return !npc || Math.hypot(s.position.x - npc.x, s.position.z - npc.z) <= KEEPER_REACH;
    };
    // Items: only the game client adds them.
    const inv = s.inventory, add = inv.addItem.bind(inv);
    inv.addItem = (...a) => {
      const frame = callerOf(new Error().stack);
      if (!fromGame(frame)) { flag('item', `an item added by the bot's own code (${String(a[0]?.id ?? a[0])} x${a[2] ?? 1}): ${frame.trim().slice(0, 160)}`, true); return false; }
      return add(...a);
    };
    // Purchases: at the right keeper.
    const buy = s.buyInBedWars.bind(s);
    s.buyInBedWars = (key, count) => {
      const upgrade = /^(sharpness|protection|haste|forge|healPool|cushioned|its_a_trap|counter|alarm|miner)$/.test(String(key));
      // A purchase away from the keeper is refused, as the game client refuses it (a failed try, not a note).
      if (!near(upgrade ? 'upgrades' : 'shop')) return { ok: false, reason: 'Too far from the shopkeeper' };
      return buy(key, count);
    };
    // Game messages the economy trusts.
    const send = s.sendPacket.bind(s);
    s.sendPacket = (m) => {
      const type = m?.t === 'game' ? m.data?.type : null;
      // Blocks and beds change only through the game client, which times the digging (guestPeer.js breakBlockAt).
      if (m?.t === 'block_update' || type === 'bed') {
        const frame = callerOf(new Error().stack);
        if (!fromGame(frame)) { flag('block', `a ${type === 'bed' ? 'bed' : 'block'} change sent by the bot's own code: ${frame.trim().slice(0, 160)}`, true); return true; }
      }
      if (type === 'boom' || type === 'tnt') { flag('explosion', `a ${type} message (the bot client has no TNT or fireball)`, true); return true; }
      if (type === 'upgrade' || type === 'trap') {
        const frame = callerOf(new Error().stack);
        if (!fromGame(frame)) { flag('shop', `a ${type} message from the bot's own code (${m.data.key ?? m.data.trap})`, true); return true; }
        if (!near('upgrades')) { flag('shop', `a ${type} away from the team upgrades`, true); return true; }
      }
      return send(m);
    };
  };
}
