// A script-driven player (the scripted bot, an agent's version of it) recorded the way a strategy player is
// (botRunner.mjs), so its match becomes a film (filmExport.mjs, scripts/arena-duel-film-data.mjs): every tick its
// frame (recording/frames.jsonl), each hurt (events.jsonl), what it was doing whenever that changes
// (strategy-<name>.jsonl: the film's "thoughts"), and -- for one player -- the block changes it saw (world.jsonl) and
// the map as play began (arena-blocks.json).
import { BLOCKS, NAME_BY_BLOCK } from '../packages/blockyland-mcp/guestPeer.js';

const r2 = (n) => Math.round(n * 100) / 100;
const ARMOR_POINTS = { leather: [1, 3, 2, 1], chainmail: [2, 5, 4, 1], iron: [2, 6, 5, 2], golden: [2, 5, 3, 1], diamond: [3, 8, 6, 3], netherite: [3, 8, 6, 3], turtle: [2, 0, 0, 0] };
const SLOTS = ['head', 'chest', 'legs', 'feet'];

/** Armour points worn (Java's): each piece by its material and slot. */
export function armorPoints(armor = {}) {
  let n = 0;
  SLOTS.forEach((slot, i) => { const id = armor?.[slot]?.id; if (!id) return; const mat = String(id).split('_')[0]; n += ARMOR_POINTS[mat]?.[i] ?? 0; });
  return n;
}

export class ScriptedRecording {
  /** `watchBlocks`: this player's view of the world is the one whose block changes are recorded. */
  constructor({ name, session, rec, game, watchBlocks = false }) {
    Object.assign(this, { name, session, rec, game });
    this.lastHealth = null;
    this.lastDoing = null;
    this.blockChanges = [];
    if (watchBlocks) {
      const setVoxel = session.setVoxel.bind(session);
      session.setVoxel = (x, y, z, id) => {
        const before = session.getVoxel(x, y, z);
        setVoxel(x, y, z, id);
        if (before !== id) this.blockChanges.push([Math.floor(x), Math.floor(y), Math.floor(z), id]);
      };
      this.watchBlocks = true;
    }
  }

  /** The map as this player sees it: every block within the arena's reach. */
  worldDump() {
    const s = this.session;
    const R = this.game === 'bedwars' ? 64 : 48;
    const cells = [], names = {};
    for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) for (let y = 0; y < 64; y++) {
      const id = s.getVoxel(x, y, z);
      if (!id) continue;
      cells.push(x, y, z, id);
      if (!names[id]) names[id] = NAME_BY_BLOCK.get(id) ?? String(id);
    }
    for (const id of Object.values(BLOCKS)) if (!names[id]) names[id] = NAME_BY_BLOCK.get(id) ?? String(id);
    return { names, bounds: { minX: -R, maxX: R, minY: 0, maxY: 63, minZ: -R, maxZ: R }, cells, surfaceY: s.bedwarsArena?.surfaceY ?? 30 };
  }

  step() {
    const s = this.session, rec = this.rec;
    if (this.lastHealth !== null && s.health < this.lastHealth - 1e-6) rec.write('events.jsonl', { kind: 'hurt', who: this.name, amount: r2(this.lastHealth - s.health), health: r2(s.health) });
    this.lastHealth = s.health;
    const held = s.isEating?.() && s.eatingId ? s.eatingId : s.inventory.getActiveItem()?.id ?? null;
    const swinging = Boolean(s.isSwinging) || Date.now() - (s.lastMeleeAt ?? 0) < 300;
    const using = s._bot?._drawStart ? 'bow' : s.isEating?.() ? 'eat' : null;
    rec.write('frames.jsonl', {
      who: this.name,
      me: {
        pos: { x: r2(s.position.x), y: r2(s.position.y), z: r2(s.position.z) }, yaw: r2(s.yaw ?? 0), pitch: r2(s.pitch ?? 0),
        health: r2(s.health), absorption: r2(s.absorption ?? 0), hunger: s.food ?? 20, armorPoints: armorPoints(s.inventory.armor), held,
        armor: Object.fromEntries(SLOTS.map((k) => [k, s.inventory.armor?.[k]?.id ?? null])),
        sneaking: Boolean(s.isSneaking), sprinting: Boolean(s.isSprinting), onGround: Boolean(s.onGround), dead: Boolean(s.isDead),
        gamemode: s.gamemode, using,
      },
      screen: 'none', buttons: { left: swinging, right: Boolean(using) },
    });
    const doing = s.lastActionSummary ?? null;
    if (doing && doing !== this.lastDoing) { rec.write(`strategy-${this.name}.jsonl`, { line: doing }); this.lastDoing = doing; }
    if (this.watchBlocks && this.blockChanges.length) rec.write('world.jsonl', { changes: this.blockChanges.splice(0) });
  }
}
