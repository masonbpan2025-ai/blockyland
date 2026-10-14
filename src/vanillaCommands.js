// The Java Edition commands that act on systems this game has, added after the systems parity audit
// (src/systemsWikiAudit.js) compared the Commands page's Java list with the dispatcher and found eight of them.
// Each follows its Commands/<name> wiki page (Java 1.21.4): syntax, defaults, limits and the success message.
// Pure apart from the context fields commandRunner.js documents, so tests drive them with stubs.
import { EFFECTS } from './statusEffects.js';
import { ENCHANTMENT_REGISTRY, anvilAccepts, areIncompatible } from './enchanting.js';
import { addPlayerExperience, getTotalXpForLevel, getXpToNextLevel } from './experience.js';
import { resolveItem, resolveTargets } from './commands.js';

// --- shared argument parsing ------------------------------------------------------------------------

/** "~", "~2", "^"-free absolute or relative coordinates around `origin`. */
export function parseCoordinate(str, origin = 0) {
  if (typeof str !== 'string') return NaN;
  if (str.startsWith('~')) {
    const offset = str.length > 1 ? Number(str.slice(1)) : 0;
    return Number.isFinite(offset) ? Math.floor(origin + offset) : NaN;
  }
  const n = Number(str);
  return Number.isFinite(n) ? Math.floor(n) : NaN;
}
function parsePosition(parts, at, origin) {
  const p = [parseCoordinate(parts[at], origin.x), parseCoordinate(parts[at + 1], origin.y), parseCoordinate(parts[at + 2], origin.z)];
  return p.every(Number.isFinite) ? { x: p[0], y: p[1], z: p[2] } : null;
}

/**
 * A `time` argument: "a single-precision floating-point number suffixed with a unit": `t` ticks (the default),
 * `s` seconds (20 ticks), `d` in-game days (24000 ticks). Returns ticks, or NaN.
 */
export function parseTimeArgument(raw) {
  const m = /^(\d+(?:\.\d+)?)([tsd]?)$/i.exec(String(raw ?? ''));
  if (!m) return NaN;
  const scale = { '': 1, t: 1, s: 20, d: 24000 }[m[2].toLowerCase()];
  return Math.round(Number(m[1]) * scale);
}

/** `@e` (optionally `[type=zombie]`, `[type=!zombie]`), or a player selector / name. */
function parseEntitySelector(raw) {
  const text = String(raw ?? '@s').trim();
  const m = /^@e(?:\[type=(!?)(?:minecraft:)?([a-z_]+)\])?$/i.exec(text);
  if (m) return { ok: true, entities: true, type: m[2]?.toLowerCase() ?? null, negate: m[1] === '!' };
  const player = resolveTargets(text);
  return player.ok ? { ok: true, player: true } : player;
}
function mobsMatching(context, sel) {
  return (context.mobs?.mobs ?? []).filter((m) => m && m.health > 0 && !m.dying
    && (!sel.type || (sel.negate ? m.type !== sel.type : m.type === sel.type)));
}
const playerName = (context) => context.player?.name ?? 'Player';
const vecLike = (context, p) => (context.Vector3 ? new context.Vector3(p.x, p.y, p.z) : { ...p });

// --- /kill [<targets>] --------------------------------------------------------------------------------

export function cmdKill(context, parts) {
  const sel = parseEntitySelector(parts[1] ?? '@s');
  if (!sel.ok) { context.say(sel.reason, 'error'); return true; }
  let killed = 0; let only = null;
  if (sel.entities) {
    for (const mob of mobsMatching(context, sel)) {
      context.mobs.damageMob?.(mob, Number.MAX_SAFE_INTEGER, null, true, null, true);
      killed++; only = mob.type;
    }
  }
  if ((sel.player || (sel.entities && (!sel.type || (sel.negate && sel.type !== 'player')))) && context.player) {
    context.player.health = 0;
    context.player.die?.();
    killed++; only = playerName(context);
  }
  if (killed === 0) { context.say('No entity was found', 'error'); return true; }
  context.say(killed === 1 ? `Killed ${only}` : `Killed ${killed} entities`);
  return true;
}

// --- /effect give|clear -------------------------------------------------------------------------------

/** Java: `effect give <targets> <effect> [<seconds>|infinite] [<amplifier>] [<hideParticles>]`; default 30 s, amplifier 0. */
export function cmdEffect(context, parts) {
  const usage = 'Usage: /effect give <targets> <effect> [<seconds>|infinite] [<amplifier>] | /effect clear [<targets>] [<effect>]';
  const player = context.player;
  if (!player?.applyStatusEffect) { context.say('The player is not available in this session.', 'error'); return true; }
  const effectId = (raw) => String(raw ?? '').toLowerCase().replace(/^minecraft:/, '');
  if (parts[1] === 'clear') {
    const target = resolveTargets(parts[2] ?? '@s');
    if (!target.ok) { context.say(target.reason, 'error'); return true; }
    if (parts[3]) {
      const id = effectId(parts[3]);
      if (!player.statusEffects?.has?.(id)) { context.say(`Failed to remove effect: target does not have the requested effect`, 'error'); return true; }
      player.clearStatusEffect(id);
      context.say(`Removed effect ${EFFECTS[id]?.name ?? id} from ${playerName(context)}`);
    } else {
      const n = player.statusEffects?.size ?? 0;
      if (!n) { context.say('Failed to remove effect: target has no effects to remove', 'error'); return true; }
      for (const id of [...player.statusEffects.keys()]) player.clearStatusEffect(id);
      context.say(`Removed every effect from ${playerName(context)}`);
    }
    return true;
  }
  if (parts[1] !== 'give' || !parts[3]) { context.say(usage, 'error'); return true; }
  const target = resolveTargets(parts[2]);
  if (!target.ok) { context.say(target.reason, 'error'); return true; }
  const id = effectId(parts[3]);
  if (!EFFECTS[id]) { context.say(`Unknown effect: minecraft:${id}`, 'error'); return true; }
  // "seconds: 1..1000000", or `infinite`; an instant effect lasts one tick.
  const seconds = parts[4] === undefined ? 30 : parts[4] === 'infinite' ? Infinity : Number(parts[4]);
  const amplifier = parts[5] === undefined ? 0 : Number(parts[5]);
  if (!(seconds === Infinity || (Number.isInteger(seconds) && seconds >= 1 && seconds <= 1000000))) { context.say('Seconds must be between 1 and 1000000, or infinite', 'error'); return true; }
  if (!(Number.isInteger(amplifier) && amplifier >= 0 && amplifier <= 255)) { context.say('Amplifier must be between 0 and 255', 'error'); return true; }
  player.applyStatusEffect(id, EFFECTS[id].instant ? 0.05 : seconds, amplifier + 1);
  context.say(`Applied effect ${EFFECTS[id].name} to ${playerName(context)}`);
  return true;
}

// --- /enchant <targets> <enchantment> [<level>] -------------------------------------------------------

/**
 * Java's /enchant: the held item must support the enchantment (its primary or secondary items), the level must
 * not exceed the enchantment's maximum, and it must not conflict with one already on the item.
 */
export function cmdEnchant(context, parts) {
  const target = resolveTargets(parts[1]);
  if (!target.ok || !parts[2]) { context.say('Usage: /enchant <targets> <enchantment> [<level>]', 'error'); return true; }
  const key = String(parts[2]).toLowerCase().replace(/^minecraft:/, '');
  const def = ENCHANTMENT_REGISTRY[key];
  if (!def) { context.say(`Unknown enchantment: minecraft:${key}`, 'error'); return true; }
  const level = parts[3] === undefined ? 1 : Number(parts[3]);
  if (!Number.isInteger(level) || level < 1) { context.say('Level must be a whole number of at least 1', 'error'); return true; }
  if (level > def.maxLevel) { context.say(`${level} is higher than the maximum level of ${def.maxLevel} supported by that enchantment`, 'error'); return true; }
  const item = context.inventory?.getActiveItem?.();
  if (!item || item.isBlock) { context.say(`${playerName(context)} is not holding any item`, 'error'); return true; }
  if (!anvilAccepts(def, item.id) && item.id !== 'book') { context.say(`${playerName(context)} cannot support that enchantment`, 'error'); return true; }
  const existing = Array.isArray(item.enchantments) ? item.enchantments : [];
  if (existing.some((e) => e.id === key || areIncompatible(e.id, key))) { context.say(`${def.name} cannot be combined with the enchantments already on that item`, 'error'); return true; }
  item.enchantments = [...existing, { id: key, name: def.name, level }];
  context.ui?.updateHotbar?.();
  context.say(`Applied enchantment ${def.name}${def.maxLevel > 1 ? ` ${def.roman[level - 1] ?? level}` : ''} to ${playerName(context)}'s item`);
  return true;
}

// --- /experience (/xp) ---------------------------------------------------------------------------------

/** Total points the player holds. */
function totalPoints(player) {
  return getTotalXpForLevel(player.level || 0) + Math.floor(player.exp || 0);
}
/** Java: `experience add|set <targets> <amount> [levels|points]`, `experience query <targets> (levels|points)`. */
export function cmdExperience(context, parts) {
  const usage = 'Usage: /experience (add|set) <targets> <amount> [levels|points] | /experience query <targets> (levels|points)';
  const player = context.player;
  const [, op, who, amountRaw, unitRaw] = parts;
  if (!player || !['add', 'set', 'query'].includes(op)) { context.say(usage, 'error'); return true; }
  const target = resolveTargets(who);
  if (!target.ok) { context.say(target.reason, 'error'); return true; }
  if (op === 'query') {
    const unit = amountRaw;
    if (unit === 'levels') context.say(`${playerName(context)} has ${player.level || 0} experience levels`);
    else if (unit === 'points') context.say(`${playerName(context)} has ${Math.floor(player.exp || 0)} experience points`);
    else context.say(usage, 'error');
    return true;
  }
  const amount = Number(amountRaw);
  const unit = unitRaw ?? 'points';
  if (!Number.isInteger(amount) || !['levels', 'points'].includes(unit) || (op === 'set' && amount < 0)) { context.say(usage, 'error'); return true; }
  if (op === 'add') {
    if (unit === 'levels') player.level = Math.max(0, (player.level || 0) + amount);
    else if (amount >= 0) addPlayerExperience(player, amount, null, null);
    else {
      // Removing points can lower the level.
      const left = Math.max(0, totalPoints(player) + amount);
      player.level = 0; player.exp = 0;
      addPlayerExperience(player, left, null, null);
    }
    context.say(`Gave ${amount} experience ${unit} to ${playerName(context)}`);
  } else {
    // "set ... points": the points must fit in the current level ("cannot set experience points above the
    // maximum points for the player's current level").
    if (unit === 'levels') player.level = amount;
    else if (amount > getXpToNextLevel(player.level || 0)) { context.say('Unable to set experience points above the maximum points for the player\'s current level', 'error'); return true; }
    else player.exp = amount;
    context.say(`Set ${amount} experience ${unit} on ${playerName(context)}`);
  }
  context.ui?.updateStats?.();
  return true;
}

// --- /difficulty, /defaultgamemode, /gamerule ----------------------------------------------------------

export const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
export function cmdDifficulty(context, parts) {
  const game = context.game;
  if (!parts[1]) { context.say(`The difficulty is ${capital(game?.difficulty ?? 'normal')}`); return true; }
  const d = String(parts[1]).toLowerCase();
  if (!DIFFICULTIES.includes(d)) { context.say('Usage: /difficulty [peaceful|easy|normal|hard]', 'error'); return true; }
  if (game?.difficulty === d) { context.say(`The difficulty did not change; it is already set to ${capital(d)}`, 'error'); return true; }
  context.setDifficulty?.(d);
  context.say(`The difficulty has been set to ${capital(d)}`);
  return true;
}
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function cmdDefaultGamemode(context, parts) {
  const mode = String(parts[1] ?? '').toLowerCase();
  if (!['survival', 'creative', 'adventure', 'spectator'].includes(mode)) { context.say('Usage: /defaultgamemode <survival|creative|adventure|spectator>', 'error'); return true; }
  if (context.game) context.game.defaultGameMode = mode;
  context.say(`The default game mode is now ${capital(mode)} Mode`);
  return true;
}

/** Java 1.21.4's game rules (Game rule page) with their defaults. The game reads the ones it models from game.gamerules. */
export const GAMERULE_DEFAULTS = Object.freeze({
  announceAdvancements: true, blockExplosionDropDecay: true, commandBlockOutput: true, commandModificationBlockLimit: 32768,
  disableElytraMovementCheck: false, disablePlayerMovementCheck: false, disableRaids: false, doDaylightCycle: true, doEntityDrops: true,
  doFireTick: true, doImmediateRespawn: false, doInsomnia: true, doLimitedCrafting: false, doMobLoot: true, doMobSpawning: true,
  doPatrolSpawning: true, doTileDrops: true, doTraderSpawning: true, doVinesSpread: true, doWardenSpawning: true, doWeatherCycle: true,
  drowningDamage: true, enderPearlsVanishOnDeath: true, fallDamage: true, fireDamage: true, forgiveDeadPlayers: true, freezeDamage: true,
  globalSoundEvents: true, keepInventory: false, lavaSourceConversion: false, logAdminCommands: true, maxCommandChainLength: 65536,
  maxCommandForkCount: 65536, maxEntityCramming: 24, mobExplosionDropDecay: true, mobGriefing: true, naturalRegeneration: true,
  playersNetherPortalCreativeDelay: 0, playersNetherPortalDefaultDelay: 80, playersSleepingPercentage: 100, projectilesCanBreakBlocks: true,
  randomTickSpeed: 3, reducedDebugInfo: false, sendCommandFeedback: true, showDeathMessages: true, snowAccumulationHeight: 1,
  spawnChunkRadius: 2, spawnRadius: 10, spectatorsGenerateChunks: true, tntExplosionDropDecay: false, universalAnger: false,
  waterSourceConversion: true,
});
export function cmdGamerule(context, parts) {
  const rule = parts[1];
  if (!rule || !(rule in GAMERULE_DEFAULTS)) { context.say(rule ? `Unknown game rule: ${rule}` : 'Usage: /gamerule <rule> [<value>]', 'error'); return true; }
  const game = context.game ?? {};
  const current = game.gamerules?.[rule] ?? GAMERULE_DEFAULTS[rule];
  if (parts[2] === undefined) { context.say(`Gamerule ${rule} is currently set to: ${current}`); return true; }
  const want = typeof GAMERULE_DEFAULTS[rule] === 'boolean'
    ? (parts[2] === 'true' ? true : parts[2] === 'false' ? false : null)
    : (Number.isInteger(Number(parts[2])) ? Number(parts[2]) : null);
  if (want === null) { context.say(`Invalid value for ${rule}: ${parts[2]}`, 'error'); return true; }
  game.gamerules = { ...(game.gamerules ?? {}), [rule]: want };
  context.say(`Gamerule ${rule} is now set to: ${want}`);
  return true;
}

// --- /fill and /clone ------------------------------------------------------------------------------------

const blockLimit = (context) => context.game?.gamerules?.commandModificationBlockLimit ?? GAMERULE_DEFAULTS.commandModificationBlockLimit;
function box(a, b) {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y), z1: Math.max(a.z, b.z) };
}
const volume = (b) => (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1);
function refresh(context, touched) {
  for (const key of touched) {
    const [cx, cz] = key.split(',').map(Number);
    const chunk = context.world.getOrCreateChunk?.(cx, cz);
    if (chunk) context.game?.rebuildChunkMesh?.(chunk);
  }
  context.world.invalidateChunkCache?.();
}

/** Java: `fill <from> <to> <block> [destroy|hollow|keep|outline|replace [<filter>]]`, at most commandModificationBlockLimit blocks. */
export function cmdFill(context, parts) {
  const usage = 'Usage: /fill <x1> <y1> <z1> <x2> <y2> <z2> <block> [destroy|hollow|keep|outline|replace [<filter>]]';
  const world = context.world;
  if (!world?.setVoxel) { context.say('The world is not available in this session.', 'error'); return true; }
  const origin = context.player?.position ?? { x: 0, y: 0, z: 0 };
  const a = parsePosition(parts, 1, origin); const b = parsePosition(parts, 4, origin);
  const block = resolveItem(parts[7] ?? '');
  if (!a || !b || !block.ok || !block.isBlock) { context.say(parts[7] && !(block.ok && block.isBlock) ? `Unknown block '${parts[7]}'` : usage, 'error'); return true; }
  const mode = parts[8] ?? 'replace';
  if (!['destroy', 'hollow', 'keep', 'outline', 'replace'].includes(mode)) { context.say(usage, 'error'); return true; }
  const filter = mode === 'replace' && parts[9] ? resolveItem(parts[9]) : null;
  if (filter && !(filter.ok && filter.isBlock)) { context.say(`Unknown block '${parts[9]}'`, 'error'); return true; }
  const r = box(a, b);
  if (volume(r) > blockLimit(context)) { context.say(`Too many blocks in the specified area (maximum ${blockLimit(context)}, specified ${volume(r)})`, 'error'); return true; }
  let changed = 0; const touched = new Set();
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) for (let z = r.z0; z <= r.z1; z++) {
    const edge = x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1 || z === r.z0 || z === r.z1;
    const here = world.getVoxel?.(x, y, z) ?? 0;
    let put = block.id;
    if (mode === 'keep' && here !== 0) continue;
    if (mode === 'outline' && !edge) continue;
    if (mode === 'hollow' && !edge) put = 0;
    if (filter && here !== filter.id) continue;
    if (here === put) continue;
    if (mode === 'destroy' && here !== 0) context.game?.dropBlockAt?.(x, y, z, here);
    world.setVoxel(x, y, z, put);
    changed++; touched.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`);
  }
  if (!changed) { context.say('No blocks were filled', 'error'); return true; }
  refresh(context, touched);
  context.say(`Successfully filled ${changed} block(s)`);
  return true;
}

/** Java: `clone <begin> <end> <destination> [replace|masked] [force|move|normal]`. */
export function cmdClone(context, parts) {
  const usage = 'Usage: /clone <x1> <y1> <z1> <x2> <y2> <z2> <x> <y> <z> [replace|masked] [force|move|normal]';
  const world = context.world;
  if (!world?.setVoxel || !world.getVoxel) { context.say('The world is not available in this session.', 'error'); return true; }
  const origin = context.player?.position ?? { x: 0, y: 0, z: 0 };
  const a = parsePosition(parts, 1, origin); const b = parsePosition(parts, 4, origin); const d = parsePosition(parts, 7, origin);
  const mask = parts[10] ?? 'replace'; const how = parts[11] ?? 'normal';
  if (!a || !b || !d || !['replace', 'masked'].includes(mask) || !['force', 'move', 'normal'].includes(how)) { context.say(usage, 'error'); return true; }
  const r = box(a, b);
  if (volume(r) > blockLimit(context)) { context.say(`Too many blocks in the specified area (maximum ${blockLimit(context)}, specified ${volume(r)})`, 'error'); return true; }
  const dx = d.x - r.x0; const dy = d.y - r.y0; const dz = d.z - r.z0;
  // "The source and destination can not overlap" unless force.
  const overlaps = Math.abs(dx) <= r.x1 - r.x0 && Math.abs(dy) <= r.y1 - r.y0 && Math.abs(dz) <= r.z1 - r.z0;
  if (overlaps && how !== 'force') { context.say('The source and destination can not overlap', 'error'); return true; }
  const copy = [];
  for (let x = r.x0; x <= r.x1; x++) for (let y = r.y0; y <= r.y1; y++) for (let z = r.z0; z <= r.z1; z++) copy.push([x, y, z, world.getVoxel(x, y, z) ?? 0]);
  const touched = new Set(); let n = 0;
  if (how === 'move') for (const [x, y, z, id] of copy) if (id !== 0 || mask === 'replace') { world.setVoxel(x, y, z, 0); touched.add(`${Math.floor(x / 16)},${Math.floor(z / 16)}`); }
  for (const [x, y, z, id] of copy) {
    if (mask === 'masked' && id === 0) continue;
    world.setVoxel(x + dx, y + dy, z + dz, id); n++;
    touched.add(`${Math.floor((x + dx) / 16)},${Math.floor((z + dz) / 16)}`);
  }
  if (!n) { context.say('No blocks were cloned', 'error'); return true; }
  refresh(context, touched);
  context.say(`Successfully cloned ${n} block(s)`);
  return true;
}

// --- chat: /say, /me, /msg /tell /w, /list, /tellraw, /title ----------------------------------------------

export function cmdSay(context, parts) {
  if (parts.length < 2) { context.say('Usage: /say <message>', 'error'); return true; }
  context.say(`[${playerName(context)}] ${parts.slice(1).join(' ')}`, 'chat');
  return true;
}
export function cmdMe(context, parts) {
  if (parts.length < 2) { context.say('Usage: /me <action>', 'error'); return true; }
  context.say(`* ${playerName(context)} ${parts.slice(1).join(' ')}`, 'chat');
  return true;
}
export function cmdMsg(context, parts) {
  const target = resolveTargets(parts[1]);
  if (!target.ok || parts.length < 3) { context.say('Usage: /msg <targets> <message>', 'error'); return true; }
  const text = parts.slice(2).join(' ');
  context.say(`You whisper to ${playerName(context)}: ${text}`, 'chat');
  context.say(`${playerName(context)} whispers to you: ${text}`, 'chat');
  return true;
}
export function cmdList(context) {
  context.say(`There are 1 of a max of 1 players online: ${playerName(context)}`);
  return true;
}
/** The text of a JSON text component: a string, `{"text": ...}` with `extra`, or an array of components. */
export function componentText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(componentText).join('');
  if (value && typeof value === 'object') return `${value.text ?? value.translate ?? ''}${(value.extra ?? []).map(componentText).join('')}`;
  return String(value ?? '');
}
function parseComponent(raw) {
  try { return { ok: true, text: componentText(JSON.parse(raw)) }; } catch { return { ok: false }; }
}
export function cmdTellraw(context, parts) {
  const target = resolveTargets(parts[1]);
  const parsed = parseComponent(parts.slice(2).join(' '));
  if (!target.ok || !parsed.ok) { context.say('Usage: /tellraw <targets> <message: JSON text component>', 'error'); return true; }
  context.say(parsed.text, 'chat');
  return true;
}
export function cmdTitle(context, parts) {
  const usage = 'Usage: /title <targets> (clear|reset|title|subtitle|actionbar <JSON text>|times <fadeIn> <stay> <fadeOut>)';
  const target = resolveTargets(parts[1]);
  const kind = parts[2];
  if (!target.ok || !['clear', 'reset', 'title', 'subtitle', 'actionbar', 'times'].includes(kind)) { context.say(usage, 'error'); return true; }
  if (kind === 'clear' || kind === 'reset' || kind === 'times') {
    context.ui?.clearTitle?.();
    context.say(kind === 'times' ? `Changed title display times for ${playerName(context)}` : `${kind === 'clear' ? 'Cleared' : 'Reset'} titles for ${playerName(context)}`);
    return true;
  }
  const parsed = parseComponent(parts.slice(3).join(' '));
  if (!parsed.ok) { context.say(usage, 'error'); return true; }
  if (context.ui?.showTitle) context.ui.showTitle(kind, parsed.text);
  else context.say(kind === 'actionbar' ? parsed.text : `== ${parsed.text} ==`, 'chat');
  context.say(`Showing new ${kind} for ${playerName(context)}`);
  return true;
}

// --- /seed, /setworldspawn, /spawnpoint, /random, /damage, /clear --------------------------------------------

export function cmdSeed(context) {
  const seed = context.game?.seed ?? context.world?.seed;
  context.say(seed === undefined ? 'The seed is not available in this session.' : `Seed: [${seed}]`, seed === undefined ? 'error' : 'system');
  return true;
}
export function cmdSetWorldSpawn(context, parts) {
  const origin = context.player?.position ?? { x: 0, y: 0, z: 0 };
  const pos = parts.length > 1 ? parsePosition(parts, 1, origin) : { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
  if (!pos) { context.say('Usage: /setworldspawn [<x> <y> <z>] [<angle>]', 'error'); return true; }
  if (context.player) context.player.spawnPosition = vecLike(context, { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 });
  context.say(`Set the world spawn point to ${pos.x}, ${pos.y}, ${pos.z} [${Number(parts[4] ?? 0)}]`);
  return true;
}
export function cmdSpawnpoint(context, parts) {
  const target = resolveTargets(parts[1] ?? '@s');
  const origin = context.player?.position ?? { x: 0, y: 0, z: 0 };
  const pos = parts.length > 2 ? parsePosition(parts, 2, origin) : { x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) };
  if (!target.ok || !pos) { context.say('Usage: /spawnpoint [<targets>] [<x> <y> <z>] [<angle>]', 'error'); return true; }
  if (context.player) context.player.commandSpawnPosition = vecLike(context, { x: pos.x + 0.5, y: pos.y, z: pos.z + 0.5 });
  context.say(`Set spawn point to ${pos.x}, ${pos.y}, ${pos.z} [${Number(parts[5] ?? 0)}] in minecraft:overworld for ${playerName(context)}`);
  return true;
}
/** Java: `random (value|roll) <range>`; a range is `a..b`, with at least two values. */
export function cmdRandom(context, parts, random = Math.random) {
  const m = /^(-?\d+)?\.\.(-?\d+)?$/.exec(parts[2] ?? '');
  if (!['value', 'roll'].includes(parts[1]) || !m || m[1] === undefined || m[2] === undefined) { context.say('Usage: /random (value|roll) <min>..<max>', 'error'); return true; }
  const lo = Number(m[1]); const hi = Number(m[2]);
  if (hi <= lo) { context.say('The range must contain at least two values', 'error'); return true; }
  const n = lo + Math.floor(random() * (hi - lo + 1));
  context.say(parts[1] === 'roll' ? `${playerName(context)} rolled ${n} (from ${lo} to ${hi})` : `Random value: ${n}`, parts[1] === 'roll' ? 'chat' : 'system');
  return true;
}
/** Java: `damage <target> <amount> [<damageType>] ...`. */
export function cmdDamage(context, parts) {
  const sel = parseEntitySelector(parts[1]);
  const amount = Number(parts[2]);
  if (!sel.ok || !Number.isFinite(amount) || amount < 0) { context.say('Usage: /damage <target> <amount> [<damageType>]', 'error'); return true; }
  const type = String(parts[3] ?? 'generic').replace(/^minecraft:/, '');
  let hit = 0;
  if (sel.player && context.player?.takeDamage) { context.player.takeDamage(amount, null, type); hit++; }
  if (sel.entities) for (const mob of mobsMatching(context, sel)) { context.mobs.damageMob?.(mob, amount, null, true, null, false); hit++; }
  if (!hit) { context.say('No entity was found', 'error'); return true; }
  context.say(`Applied ${amount} damage to ${hit === 1 && sel.player ? playerName(context) : `${hit} entities`}`);
  return true;
}
/** Java: `clear [<targets>] [<item>] [<maxCount>]`: removes items from the player's inventory. */
export function cmdClearInventory(context, parts) {
  const inv = context.inventory;
  const target = resolveTargets(parts[1] ?? '@s');
  if (!target.ok) { context.say(target.reason, 'error'); return true; }
  if (!inv?.hotbar) { context.say('The inventory is not available in this session.', 'error'); return true; }
  const wanted = parts[2] ? resolveItem(parts[2]) : null;
  if (parts[2] && !wanted.ok) { context.say(`Unknown item '${parts[2]}'`, 'error'); return true; }
  let max = parts[3] === undefined ? Infinity : Number(parts[3]);
  if (!(max === Infinity || (Number.isInteger(max) && max >= 0))) { context.say('Usage: /clear [<targets>] [<item>] [<maxCount>]', 'error'); return true; }
  const matches = (s) => s && (!wanted || (s.id === wanted.id && Boolean(s.isBlock) === Boolean(wanted.isBlock)));
  let removed = 0;
  const take = (s) => {
    if (!matches(s)) return s;
    const n = Math.min(s.count ?? 1, max === Infinity ? Infinity : max - removed);
    if (max === 0) { removed += s.count ?? 1; return s; } // maxCount 0 counts without removing
    removed += n;
    return (s.count ?? 1) - n > 0 ? { ...s, count: (s.count ?? 1) - n } : null;
  };
  inv.hotbar = inv.hotbar.map(take);
  if (Array.isArray(inv.storage)) inv.storage = inv.storage.map(take);
  if (inv.armor) for (const slot of Object.keys(inv.armor)) inv.armor[slot] = take(inv.armor[slot]);
  if ('offhand' in inv) inv.offhand = take(inv.offhand);
  context.ui?.updateHotbar?.();
  if (!removed) { context.say(`No items were found on player ${playerName(context)}`, 'error'); return true; }
  context.say(max === 0 ? `Found ${removed} matching item(s) on player ${playerName(context)}` : `Removed ${removed} item(s) from player ${playerName(context)}`);
  return true;
}

// --- /time ----------------------------------------------------------------------------------------------------

/** Java 1.21.4's time markers ("/time set day ... is equivalent to 1000, ... night ... 13000"). */
export const TIME_MARKERS = Object.freeze({ day: 1000, noon: 6000, night: 13000, midnight: 18000 });
export function cmdTime(context, parts) {
  const usage = 'Usage: /time set (<time>|day|noon|night|midnight) | /time add <time> | /time query (daytime|gametime|day)';
  const game = context.game ?? {};
  const now = Number(game.worldTime ?? 0);
  const op = parts[1];
  if (op === 'query') {
    const what = parts[2];
    if (what === 'daytime') context.say(`The time is ${Math.floor(now) % 24000}`);
    else if (what === 'gametime') context.say(`The time is ${Math.floor(game.gameTime ?? now)}`);
    else if (what === 'day') context.say(`The time is ${Math.floor(now / 24000)}`);
    else context.say(usage, 'error');
    return true;
  }
  if (op !== 'set' && op !== 'add') { context.say(usage, 'error'); return true; }
  const ticks = op === 'set' && TIME_MARKERS[parts[2]] !== undefined ? TIME_MARKERS[parts[2]] : parseTimeArgument(parts[2]);
  if (!Number.isFinite(ticks)) { context.say(usage, 'error'); return true; }
  const next = op === 'set' ? ticks : now + ticks;
  context.setWorldTime?.(next);
  context.say(`Set the time to ${Math.floor(next) % 24000}`);
  return true;
}

// --- /ride, /rotate, /spreadplayers --------------------------------------------------------------------------

/** Java: `ride <target> mount <vehicle>` / `ride <target> dismount`. The vehicle is the nearest matching mob. */
export function cmdRide(context, parts) {
  const usage = 'Usage: /ride <target> mount <vehicle> | /ride <target> dismount';
  const target = resolveTargets(parts[1]);
  const player = context.player;
  const behaviours = context.mobs?.animalBehaviors;
  if (!target.ok || !['mount', 'dismount'].includes(parts[2]) || !player) { context.say(usage, 'error'); return true; }
  if (parts[2] === 'dismount') {
    if (!player.ridingMob) { context.say(`${playerName(context)} is not riding any vehicle`, 'error'); return true; }
    const was = player.ridingMob.type;
    behaviours?.dismount?.(player);
    context.say(`${playerName(context)} stopped riding ${was}`);
    return true;
  }
  const sel = parseEntitySelector(parts[3]);
  if (!sel.ok || !sel.entities) { context.say(sel.ok ? 'Can\'t mount a player' : sel.reason, 'error'); return true; }
  if (player.ridingMob) { context.say(`${playerName(context)} is already riding ${player.ridingMob.type}`, 'error'); return true; }
  const here = player.position;
  const vehicle = mobsMatching(context, sel).filter((m) => m.mesh?.position)
    .sort((a, b) => a.mesh.position.distanceTo(here) - b.mesh.position.distanceTo(here))[0];
  if (!vehicle) { context.say('No entity was found', 'error'); return true; }
  if (!behaviours?.mountMob || behaviours.mountMob(vehicle, player) === false) { context.say(`${playerName(context)} can't ride ${vehicle.type}`, 'error'); return true; }
  context.say(`${playerName(context)} started riding ${vehicle.type}`);
  return true;
}

/**
 * Java: `rotate <target> <yaw> <pitch>` (degrees; yaw 0 faces south, +Z, and 90 west; pitch positive looks down;
 * `~` relative). The camera's yaw here is in radians with yaw = pi facing +Z, so yaw_game = pi - yaw_java, and
 * pitch_game = -pitch_java.
 */
export function cmdRotate(context, parts) {
  const target = resolveTargets(parts[1]);
  const player = context.player;
  if (!target.ok || !player || parts.length < 4) { context.say('Usage: /rotate <target> <yaw> <pitch>', 'error'); return true; }
  const deg = (r) => (r * 180) / Math.PI;
  const curYaw = deg(Math.PI - (player.yaw ?? Math.PI)); const curPitch = -deg(player.pitch ?? 0);
  const angle = (raw, cur) => (String(raw).startsWith('~') ? cur + (Number(String(raw).slice(1)) || 0) : Number(raw));
  const yaw = angle(parts[2], curYaw); const pitch = Math.max(-90, Math.min(90, angle(parts[3], curPitch)));
  if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) { context.say('Usage: /rotate <target> <yaw> <pitch>', 'error'); return true; }
  player.yaw = Math.PI - (yaw * Math.PI) / 180;
  player.pitch = (-pitch * Math.PI) / 180;
  context.say(`Rotated ${playerName(context)}`);
  return true;
}

/**
 * Java: `spreadplayers <center: x z> <spreadDistance> <maxRange> <respectTeams> <targets>`: puts the player on the
 * surface at a random spot within maxRange of the centre.
 */
export function cmdSpreadPlayers(context, parts, random = Math.random) {
  const usage = 'Usage: /spreadplayers <x> <z> <spreadDistance> <maxRange> <respectTeams> <targets>';
  const origin = context.player?.position ?? { x: 0, z: 0 };
  const cx = parseCoordinate(parts[1], origin.x); const cz = parseCoordinate(parts[2], origin.z);
  const spread = Number(parts[3]); const range = Number(parts[4]);
  const target = resolveTargets(parts[6]);
  if (![cx, cz, spread, range].every(Number.isFinite) || spread < 0 || range < 1 || !['true', 'false'].includes(parts[5]) || !target.ok) { context.say(usage, 'error'); return true; }
  if (range < spread + 1) { context.say(`maxRange must be at least spreadDistance + 1`, 'error'); return true; }
  const x = cx + (random() * 2 - 1) * range; const z = cz + (random() * 2 - 1) * range;
  const placed = context.placeOnSurface?.({ x, z, radius: 4 });
  if (!placed?.found && context.player?.position) { context.player.position.x = x; context.player.position.z = z; }
  context.say(`Spread 1 player around ${cx.toFixed(2)}, ${cz.toFixed(2)} with an average distance of 0.00 blocks apart`);
  return true;
}

/** Dispatch one of this module's commands; false when the root is not one of them. */
export function runVanillaCommand(context, root, parts) {
  switch (root) {
    case '/kill': return cmdKill(context, parts);
    case '/effect': return cmdEffect(context, parts);
    case '/enchant': return cmdEnchant(context, parts);
    case '/experience': case '/xp': return cmdExperience(context, parts);
    case '/difficulty': return cmdDifficulty(context, parts);
    case '/defaultgamemode': return cmdDefaultGamemode(context, parts);
    case '/gamerule': return cmdGamerule(context, parts);
    case '/fill': return cmdFill(context, parts);
    case '/clone': return cmdClone(context, parts);
    case '/say': return cmdSay(context, parts);
    case '/me': return cmdMe(context, parts);
    case '/msg': case '/tell': case '/w': return cmdMsg(context, parts);
    case '/list': return cmdList(context);
    case '/tellraw': return cmdTellraw(context, parts);
    case '/title': return cmdTitle(context, parts);
    case '/seed': return cmdSeed(context);
    case '/setworldspawn': return cmdSetWorldSpawn(context, parts);
    case '/spawnpoint': return cmdSpawnpoint(context, parts);
    case '/random': return cmdRandom(context, parts);
    case '/damage': return cmdDamage(context, parts);
    case '/ride': return cmdRide(context, parts);
    case '/rotate': return cmdRotate(context, parts);
    case '/spreadplayers': return cmdSpreadPlayers(context, parts);
    default: return false;
  }
}
