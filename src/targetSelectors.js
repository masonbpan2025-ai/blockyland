// Target selectors, as the Target selectors page describes them (Java Edition), resolved against this game's one
// player and its mobs. Used by the commands added in round 4 (advancedCommands.js).
//
// "@p nearest player, @r random player, @a every player, @e every entity, @s the executing entity"; arguments
// "type=", "tag=", "name=", "limit=", "sort=(nearest|furthest|random|arbitrary)", "distance=", "team=", "scores=",
// with "!" negating type, tag, name and team. A player name names that player.

const SELECTOR = /^@([parse])(?:\[(.*)\])?$/;

/** The arguments of a selector, as [key, value, negated] triples (values may hold commas inside braces). */
export function selectorArguments(text = '') {
  const out = [];
  let depth = 0; let token = '';
  const flush = () => {
    if (!token.trim()) return;
    const eq = token.indexOf('=');
    const key = token.slice(0, eq).trim(); let value = token.slice(eq + 1).trim();
    const negated = value.startsWith('!');
    if (negated) value = value.slice(1);
    out.push([key, value, negated]);
    token = '';
  };
  for (const ch of text) {
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { flush(); continue; }
    token += ch;
  }
  flush();
  return out;
}

/** "..5", "2..", "3" -> [min, max]. */
export function parseRange(text) {
  const s = String(text ?? '').trim();
  const num = (v) => (v === '' ? null : Number(v));
  if (!s.includes('..')) { const n = num(s); return Number.isFinite(n) ? [n, n] : null; }
  const [lo, hi] = s.split('..');
  const a = lo === '' ? -Infinity : num(lo); const b = hi === '' ? Infinity : num(hi);
  return Number.isNaN(a) || Number.isNaN(b) || (lo === '' && hi === '') ? null : [a, b];
}

const stripNs = (id) => String(id ?? '').replace(/^minecraft:/, '');
export const entityName = (e) => e?.customName ?? e?.name ?? (e?.isPlayerEntity ? 'Player' : e?.type ?? '?');
/** A stable name a scoreboard can hold for an entity: the player's name, or a mob's uuid. */
export function holderName(e) {
  if (!e) return null;
  if (e.isPlayerEntity) return e.name ?? 'Player';
  e.uuid ??= `${Math.random().toString(16).slice(2, 10)}-${Date.now().toString(16)}`;
  return e.uuid;
}
const positionOf = (e) => e?.position ?? e?.mesh?.position ?? null;

/**
 * Every entity the context can see: the player first (marked), then the living mobs. `context.executor` is @s
 * (the player unless /execute as changed it); `context.origin` is where distances are measured from.
 */
function everyEntity(context) {
  const player = context.player;
  if (player) player.isPlayerEntity = true;
  const mobs = (context.mobs?.mobs ?? []).filter((m) => m && m.health > 0 && !m.dying);
  return [...(player ? [player] : []), ...mobs];
}

/**
 * Resolve a target argument. Returns { ok, entities } or { ok: false, reason }.
 * @param {object} context  player, mobs, executor, origin, teams (for team=), scores (for scores=)
 */
export function selectTargets(context, raw = '@s', random = Math.random) {
  const text = String(raw ?? '@s').trim();
  const all = everyEntity(context);
  const origin = context.origin ?? positionOf(context.executor ?? context.player) ?? { x: 0, y: 0, z: 0 };
  const m = SELECTOR.exec(text);
  if (!m) {
    if (!/^[A-Za-z0-9_\-.]{1,40}$/.test(text)) return { ok: false, reason: `Invalid target: ${text}` };
    // A name: the player answers to any name in a single-player world, as resolveTargets does; a mob to its custom name or uuid.
    const named = all.filter((e) => (e.isPlayerEntity ? true : e.customName === text || e.uuid === text));
    return named.length ? { ok: true, entities: named.slice(0, 1) } : { ok: false, reason: 'No entity was found' };
  }
  const kind = m[1];
  let list;
  if (kind === 's') list = [context.executor ?? context.player].filter(Boolean);
  else if (kind === 'e') list = all;
  else list = all.filter((e) => e.isPlayerEntity);
  let limit = kind === 'p' || kind === 'r' ? 1 : Infinity;
  let sort = kind === 'p' ? 'nearest' : kind === 'r' ? 'random' : 'arbitrary';
  const dist = (e) => { const p = positionOf(e); return p ? Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z) : Infinity; };
  for (const [key, value, negated] of selectorArguments(m[2] ?? '')) {
    const not = (ok) => (negated ? !ok : ok);
    if (key === 'type') { const t = stripNs(value); list = list.filter((e) => not((e.isPlayerEntity ? 'player' : e.type) === t)); }
    else if (key === 'tag') list = list.filter((e) => not(value === '' ? !(e.tags?.size) : Boolean(e.tags?.has(value))));
    else if (key === 'name') list = list.filter((e) => not(entityName(e) === value.replace(/^"|"$/g, '')));
    else if (key === 'team') list = list.filter((e) => not((context.teamOf?.(holderName(e)) ?? '') === value));
    else if (key === 'limit') limit = Math.max(1, Number(value) || 1);
    else if (key === 'sort') sort = value;
    else if (key === 'distance') { const r = parseRange(value); if (r) list = list.filter((e) => dist(e) >= r[0] && dist(e) <= r[1]); }
    else if (key === 'scores') {
      for (const part of value.replace(/^\{|\}$/g, '').split(',').filter(Boolean)) {
        const [obj, range] = part.split('='); const r = parseRange(range);
        list = list.filter((e) => { const s = context.scoreOf?.(holderName(e), obj.trim()); return s !== undefined && r && s >= r[0] && s <= r[1]; });
      }
    } else if (['x', 'y', 'z', 'dx', 'dy', 'dz', 'gamemode', 'level', 'x_rotation', 'y_rotation', 'nbt', 'advancements', 'predicate'].includes(key)) {
      if (key === 'gamemode') list = list.filter((e) => not(e.gamemode === value));
      // The others narrow nothing this game can tell apart; they are accepted rather than refused.
    } else return { ok: false, reason: `Unknown selector option '${key}'` };
  }
  if (sort === 'nearest') list = [...list].sort((a, b) => dist(a) - dist(b));
  else if (sort === 'furthest') list = [...list].sort((a, b) => dist(b) - dist(a));
  else if (sort === 'random') list = [...list].sort(() => random() - 0.5);
  list = list.slice(0, limit);
  return list.length ? { ok: true, entities: list } : { ok: false, reason: 'No entity was found' };
}
