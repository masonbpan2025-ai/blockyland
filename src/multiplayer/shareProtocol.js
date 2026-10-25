// What passes between the host and its guests, and what the host will accept.
//
// The host is the server. Every guest message is therefore untrusted input arriving at the server: a guest can be a
// modified client, or just a bug. Nothing here trusts a field's type, size or range. Names and chat are plain text
// that the game inserts into the page, so they are stripped of markup; positions and block edits are clamped or
// refused; and every guest has a budget of messages per second.
//
// Pure functions only, so the same rules run in the browser and in the tests.

// 2: a relay through the introduction service, a world's own game channel (`game`), and shared chest contents (`container`).
export const PROTOCOL_VERSION = 2;

/** Host and guests together. "A small number of players": the host plus seven friends. */
export const MAX_PLAYERS = 8;

export const MAX_NAME_LENGTH = 24;
export const MAX_CHAT_LENGTH = 256;
/** Blocks are the world's own limits: far beyond these a position is nonsense, not a place. */
export const MAX_COORDINATE = 30_000_000;
export const WORLD_HEIGHT = 64;
export const MAX_BLOCK_ID = 65535;

export const GUEST_TO_HOST = Object.freeze(['hello', 'ping', 'pong', 'player_state', 'block_update', 'chat', 'attack', 'game', 'container']);
export const HOST_TO_GUEST = Object.freeze([
  'welcome', 'snapshot', 'peer_joined', 'peer_left', 'player_state', 'block_update', 'chat', 'ping', 'pong', 'error', 'host_closing',
  'hurt', 'settings', 'time_sync', 'peer_hurt', 'game', 'container',
]);

// --- players attacking players (PvP) ----------------------------------------------------------

/** The host's choices for a shared world. `pvp` is Minecraft's server setting of that name, on by default there too. */
export const DEFAULT_SHARE_SETTINGS = Object.freeze({ pvp: true });

/** The settings a host sends, or the defaults for anything missing or malformed. */
export function sanitizeShareSettings(raw) {
  return { pvp: typeof raw?.pvp === 'boolean' ? raw.pvp : DEFAULT_SHARE_SETTINGS.pvp };
}

/**
 * The most one hit may deal. A netherite sword's critical hit with Sharpness V is about 15; a mace's smash attack after
 * a long fall is far more, so the bound is generous: it is there to refuse nonsense, not to balance the game.
 */
export const MAX_ATTACK_DAMAGE = 100;
/**
 * How far an attacker may be from the target, in blocks, by the host's record of where both are. A player reaches
 * 3 blocks (Creative 5); the rest is slack for positions that are a few updates old.
 */
export const MAX_ATTACK_REACH = 7;

/** A guest's attack, or null when it is not one. */
export function sanitizeAttack(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.target !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(raw.target)) return null;
  if (!finite(raw.damage) || raw.damage <= 0 || raw.damage > MAX_ATTACK_DAMAGE) return null;
  const attack = { target: raw.target, damage: raw.damage };
  if (raw.isCritical) attack.isCritical = true;
  if (raw.isSprint) attack.isSprint = true;
  if (typeof raw.weapon === 'string' && /^[a-z0-9_:-]{1,64}$/i.test(raw.weapon)) attack.weapon = raw.weapon;
  // Knockback levels: the enchantment (II at most) plus one for a sprint hit; Fire Aspect II at most.
  if (Number.isInteger(raw.knockbackLevel) && raw.knockbackLevel > 0) attack.knockbackLevel = Math.min(3, raw.knockbackLevel);
  if (Number.isInteger(raw.fireAspect) && raw.fireAspect > 0) attack.fireAspect = Math.min(2, raw.fireAspect);
  return attack;
}

/**
 * Whether the host lets an attack through, and if not, why. The host decides every hit, its own and its guests', so a
 * modified client cannot hurt anyone with PvP off, from across the world, or by attacking itself.
 * @returns {string|null} the reason it is refused, or null when it lands
 */
export function refuseAttack({ settings, attackerId, targetId, attackerPos, targetPos }) {
  if (!sanitizeShareSettings(settings).pvp) return 'pvp_off';
  if (!targetId || attackerId === targetId) return 'bad_target';
  if (!attackerPos || !targetPos) return 'unknown_position';
  const distance = Math.hypot(attackerPos.x - targetPos.x, attackerPos.y - targetPos.y, attackerPos.z - targetPos.z);
  if (!(distance <= MAX_ATTACK_REACH)) return 'too_far';
  return null;
}

// --- a world's own game, and chest contents ---------------------------------------------------------

/** The largest `game` message, as JSON: a mod's lobby state or event, never a world. */
export const MAX_GAME_DATA_CHARS = 8192;

/**
 * A mod's game message (`{t:'game', data}`): a plain object of data, small. The mod checks what it means; this only
 * makes sure it is data -- no prototype tricks, nothing large.
 * @returns {object|null} a fresh copy, or null
 */
export function sanitizeGameData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let text;
  try { text = JSON.stringify(raw); } catch { return null; }
  if (typeof text !== 'string' || text.length > MAX_GAME_DATA_CHARS) return null;
  const copy = JSON.parse(text, (key, value) => (key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value));
  return copy && typeof copy === 'object' && typeof copy.type === 'string' && copy.type.length <= 40 ? copy : null;
}

/** Slots in one chest. A double chest is two chests, sent one at a time. */
export const CONTAINER_SLOTS = 27;
const ITEM_ID = /^[a-z0-9_:]{1,64}$/;

function sanitizeStack(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return undefined;
  const id = typeof raw.id === 'string' ? (ITEM_ID.test(raw.id) ? raw.id : undefined)
    : Number.isInteger(raw.id) && raw.id > 0 && raw.id <= MAX_BLOCK_ID ? raw.id : undefined;
  if (id === undefined) return undefined;
  if (!Number.isInteger(raw.count) || raw.count < 1 || raw.count > 64) return undefined;
  const stack = { id, count: raw.count, isBlock: Boolean(raw.isBlock) };
  if (finite(raw.durability) && raw.durability >= 0 && raw.durability <= 100000) stack.durability = raw.durability;
  if (Array.isArray(raw.enchantments)) {
    const list = raw.enchantments.slice(0, 12)
      .filter((e) => e && typeof e.id === 'string' && /^[a-z_]{1,40}$/.test(e.id) && Number.isInteger(e.level) && e.level >= 1 && e.level <= 10)
      .map((e) => ({ id: e.id, level: e.level, ...(typeof e.name === 'string' ? { name: e.name.slice(0, 40) } : {}) }));
    if (list.length) stack.enchantments = list;
  }
  return stack;
}

/**
 * One chest's contents (`{t:'container', x, y, z, items}`): whole-block coordinates in the world and 27 stacks or
 * empty slots. A malformed stack refuses the whole message.
 * @returns {{x:number,y:number,z:number,items:(object|null)[]}|null}
 */
export function sanitizeContainer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y, z } = raw;
  if (![x, y, z].every(Number.isInteger) || Math.abs(x) > MAX_COORDINATE || Math.abs(z) > MAX_COORDINATE || y < 0 || y >= WORLD_HEIGHT) return null;
  if (!Array.isArray(raw.items) || raw.items.length !== CONTAINER_SLOTS) return null;
  const items = raw.items.map(sanitizeStack);
  if (items.includes(undefined)) return null;
  return { x, y, z, items };
}

// Control characters, and the characters that turn text into markup.
const UNSAFE_NAME = /[\u0000-\u001f\u007f-\u009f<>&"'`\\]/g;
const UNSAFE_CHAT = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

/**
 * A display name that is safe to show anywhere.
 * @param {unknown} raw
 * @param {string} [fallback]
 */
export function sanitizeName(raw, fallback = 'Player') {
  const text = typeof raw === 'string' ? raw.replace(UNSAFE_NAME, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim() : '';
  return text || fallback;
}

/**
 * Chat text: plain, trimmed, bounded. Markup is NOT removed here -- the game escapes it on display, which is the
 * only reliable place -- but control characters are, and a message that is empty afterwards is refused.
 * @returns {string|null}
 */
export function sanitizeChat(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(UNSAFE_CHAT, '').trim().slice(0, MAX_CHAT_LENGTH);
  return text || null;
}

/** Escape text for insertion as HTML. */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const clampCoordinate = (n) => Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, n));

/**
 * A player's pose and held item, or null when it is not one.
 *
 * Only the fields the game uses are kept; anything else a guest adds is dropped. The held item is an item id, so it
 * is limited to the characters an id uses.
 */
export function sanitizePlayerState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!finite(raw.x) || !finite(raw.y) || !finite(raw.z)) return null;
  const state = { x: clampCoordinate(raw.x), y: Math.max(-1000, Math.min(1000, raw.y)), z: clampCoordinate(raw.z) };
  state.yaw = finite(raw.yaw) ? raw.yaw % (Math.PI * 2) : 0;
  state.pitch = finite(raw.pitch) ? Math.max(-Math.PI / 2, Math.min(Math.PI / 2, raw.pitch)) : 0;
  state.isSneaking = raw.isSneaking === true;
  state.isSprinting = raw.isSprinting === true;
  state.isSwinging = raw.isSwinging === true;
  state.activeItem = typeof raw.activeItem === 'string' && /^[a-z0-9_:.\-]{1,64}$/i.test(raw.activeItem) ? raw.activeItem : null;
  return state;
}

/**
 * A block edit, or null when it is not one the world could hold.
 *
 * @param {object} raw
 * @param {object} [limits]
 * @param {(id: number) => boolean} [limits.isBlockId] whether an id names a block; the game passes its own table
 */
export function sanitizeBlockUpdate(raw, { isBlockId = (id) => Number.isInteger(id) && id >= 0 && id <= MAX_BLOCK_ID } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const { x, y, z, blockId } = raw;
  if (![x, y, z, blockId].every(Number.isInteger)) return null;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(z) > MAX_COORDINATE) return null;
  if (y < 0 || y >= WORLD_HEIGHT) return null;
  if (!isBlockId(blockId)) return null;
  return { x, y, z, blockId };
}

/**
 * A token bucket: `perSecond` actions a second, with a burst of `burst`.
 * Time is passed in so a test can run it without waiting.
 */
export class RateLimiter {
  constructor({ perSecond, burst = perSecond, now = () => Date.now() }) {
    this.perSecond = perSecond;
    this.burst = burst;
    this.now = now;
    this.tokens = burst;
    this.last = now();
  }

  /** Spend one action; false when the budget is empty. */
  take() {
    const t = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** The budgets the host applies to each guest. Generous for play, small for a flood. */
export function guestLimiters(now) {
  return {
    state: new RateLimiter({ perSecond: 40, burst: 60, now }),
    block: new RateLimiter({ perSecond: 30, burst: 90, now }),
    chat: new RateLimiter({ perSecond: 1.5, burst: 5, now }),
    // Faster than any weapon swings at full strength; the attack cooldown makes quicker hits weak anyway.
    attack: new RateLimiter({ perSecond: 5, burst: 5, now }),
    // A world's own game (a mod's lobby, deaths, item claims) and chest contents: a few a second at most.
    game: new RateLimiter({ perSecond: 20, burst: 40, now }),
    container: new RateLimiter({ perSecond: 20, burst: 40, now }),
    any: new RateLimiter({ perSecond: 150, burst: 300, now }),
  };
}

// --- large messages ----------------------------------------------------------------------------

/** Data channels carry messages of limited size, so a long message is sent as frames. Chrome's limit is 256 KB; this stays far under it. */
export const MAX_FRAME_CHARS = 15000;
/** The largest message the receiver will assemble: a compressed world is far smaller than this. */
export const MAX_MESSAGE_CHARS = 96 * 1024 * 1024;

export class ProtocolError extends Error {
  constructor(message, code = 'protocol') {
    super(message);
    this.name = 'ProtocolError';
    this.code = code;
  }
}

let nextMessageId = 1;

/**
 * Split a message into frames: `<id>|<index>|<count>|<data>`. A short message is one frame.
 * @param {string} text
 * @param {number} [maxFrame]
 * @returns {string[]}
 */
export function encodeFrames(text, maxFrame = MAX_FRAME_CHARS) {
  const id = (nextMessageId++ % 0x7fffffff).toString(36);
  const count = Math.max(1, Math.ceil(text.length / maxFrame));
  const frames = [];
  for (let i = 0; i < count; i++) frames.push(`${id}|${i}|${count}|${text.slice(i * maxFrame, (i + 1) * maxFrame)}`);
  return frames;
}

/** Puts frames back together, refusing anything that would let a peer exhaust memory. */
export class FrameReassembler {
  constructor({ maxChars = MAX_MESSAGE_CHARS, maxPending = 4, maxFrame = MAX_FRAME_CHARS } = {}) {
    this.maxChars = maxChars;
    this.maxPending = maxPending;
    this.maxFrame = maxFrame;
    this.pending = new Map();
  }

  /**
   * @param {string} frame
   * @returns {string|null} the whole message when this frame completes it
   * @throws {ProtocolError} on a malformed or abusive frame
   */
  push(frame) {
    if (typeof frame !== 'string') throw new ProtocolError('frames are text');
    const a = frame.indexOf('|');
    const b = frame.indexOf('|', a + 1);
    const c = frame.indexOf('|', b + 1);
    if (a < 1 || b < 0 || c < 0) throw new ProtocolError('malformed frame');
    const id = frame.slice(0, a);
    const index = Number(frame.slice(a + 1, b));
    const count = Number(frame.slice(b + 1, c));
    const data = frame.slice(c + 1);
    if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) throw new ProtocolError('bad frame index');
    if (data.length > this.maxFrame) throw new ProtocolError('frame too large');
    if (count * this.maxFrame > this.maxChars + this.maxFrame) throw new ProtocolError('message too large');
    if (count === 1) return data;

    let entry = this.pending.get(id);
    if (!entry) {
      if (this.pending.size >= this.maxPending) throw new ProtocolError('too many messages at once');
      entry = { count, parts: new Array(count), received: 0, chars: 0 };
      this.pending.set(id, entry);
    }
    if (entry.count !== count) throw new ProtocolError('frame count changed');
    if (entry.parts[index] === undefined) {
      entry.parts[index] = data;
      entry.received++;
      entry.chars += data.length;
      if (entry.chars > this.maxChars) throw new ProtocolError('message too large');
    }
    if (entry.received < entry.count) return null;
    this.pending.delete(id);
    return entry.parts.join('');
  }
}

// --- compressed snapshots ----------------------------------------------------------------------

const toBase64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (text) => Uint8Array.from(atob(text), (ch) => ch.charCodeAt(0));

async function pipe(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  return stream.readable;
}

/**
 * Pack a snapshot for the wire: JSON, gzipped and base64 where the browser can gzip. A world is mostly repeats, so
 * this is a large saving on a slow upload.
 * @param {object} snapshot
 * @returns {Promise<{enc: 'gzip-b64'|'json', data: string}>}
 */
export async function packSnapshot(snapshot) {
  const json = JSON.stringify(snapshot);
  if (typeof CompressionStream === 'undefined') return { enc: 'json', data: json };
  const readable = await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'));
  const chunks = [];
  let total = 0;
  const reader = readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return { enc: 'gzip-b64', data: toBase64(out) };
}

/**
 * Unpack a snapshot, refusing one that expands past `maxChars` (a "zip bomb" sent by a hostile host).
 * @param {{enc: string, data: string}} packed
 * @returns {Promise<object>}
 */
export async function unpackSnapshot(packed, { maxChars = MAX_MESSAGE_CHARS } = {}) {
  if (!packed || typeof packed.data !== 'string') throw new ProtocolError('empty snapshot');
  if (packed.enc === 'json') {
    if (packed.data.length > maxChars) throw new ProtocolError('snapshot too large');
    return JSON.parse(packed.data);
  }
  if (packed.enc !== 'gzip-b64') throw new ProtocolError('unknown snapshot encoding');
  if (typeof DecompressionStream === 'undefined') throw new ProtocolError('this browser cannot read compressed worlds');
  const readable = await pipe(fromBase64(packed.data), new DecompressionStream('gzip'));
  const decoder = new TextDecoder();
  const reader = readable.getReader();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > maxChars) {
      await reader.cancel().catch(() => {});
      throw new ProtocolError('snapshot too large');
    }
  }
  return JSON.parse(text + decoder.decode());
}
