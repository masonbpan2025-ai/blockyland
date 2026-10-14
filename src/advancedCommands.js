// The Java commands that drive a system of their own -- the scoreboard, tags, teams, /execute, functions and
// their scheduling, command storage and entity data, attributes, boss bars, the world border, the tick rate,
// force-loading, biomes, item slots, loot, placement, particles, sounds, recipes, advancements, spectating and the
// profilers. Round 4 of the systems parity audit: these were the 31 commands reported KNOWN ("no backing system").
// Each follows its Commands/<name> page (Java Edition); messages are the game's own. The state lives in
// commandState.js; target selectors in targetSelectors.js; SNBT in snbt.js.
import { BLOCKS, BLOCK_DEFS, ITEMS } from './blocks.js';
import { resolveItem } from './commands.js';
import { parseCoordinate, parseTimeArgument, GAMERULE_DEFAULTS } from './vanillaCommands.js';
import { selectTargets, holderName, entityName, parseRange } from './targetSelectors.js';
import { parseSnbt, toSnbt, getPath, setPath, removePath, SnbtError } from './snbt.js';
import {
  getCommandState, scoreOf, setScore, teamOf, scoreOperation, borderSize,
  BOSSBAR_COLORS, BOSSBAR_STYLES, TEAM_COLORS, TEAM_OPTIONS, DISPLAY_SLOTS, SIMPLE_CRITERIA, TICK_DEFAULTS, BORDER_DEFAULTS,
} from './commandState.js';
import { WIKI_ADVANCEMENTS, WIKI_PARTICLES } from './systemsWikiData.js';
import { enabledPacks, allPacks, setPackEnabled } from './dataPackStore.js';
import { harvestDrops } from './blockDrops.js';
import { rollStructureLoot, hasStructureLoot } from './structureLoot.js';

// --- shared helpers ---------------------------------------------------------------------------------------------

const stateOf = (context) => getCommandState(context.game);
const say = (context, text, kind = 'system') => context.say(text, kind);
/** Report a failure: the message in red, and the command counted as failed (for /execute store success). */
function fail(context, text) { context.failed = true; context.say(text, 'error'); return true; }
/** Report a success with a result value (for /execute store result). */
function ok(context, text, result = 1) { context.result = result; if (text) context.say(text); return true; }
const stripNs = (id) => String(id ?? '').replace(/^minecraft:/, '');
const nsId = (id) => (String(id).includes(':') ? String(id) : `minecraft:${id}`);
const origin = (context) => context.origin ?? context.player?.position ?? { x: 0, y: 0, z: 0 };
function position(context, parts, at) {
  const o = origin(context);
  const p = [parseCoordinate(parts[at], o.x), parseCoordinate(parts[at + 1], o.y), parseCoordinate(parts[at + 2], o.z)];
  return p.every(Number.isFinite) ? { x: p[0], y: p[1], z: p[2] } : null;
}
/** The rest of the line from word `at`, joined back (for messages, JSON and SNBT with spaces). */
const rest = (parts, at) => parts.slice(at).join(' ');
// Object.create, not a spread: an /execute frame or a function's context inherits the player, mobs and world.
const selectorContext = (context) => {
  const state = stateOf(context);
  const c = Object.create(context);
  c.teamOf = (h) => teamOf(state, h); c.scoreOf = (h, o) => scoreOf(state, h, o);
  return c;
};
const targets = (context, raw) => selectTargets(selectorContext(context), raw);
/** Score holders: a selector's entities, a literal name, or * (everyone with a score). */
function holders(context, raw, objective = null) {
  const state = stateOf(context);
  if (raw === '*') {
    const set = new Set();
    for (const [obj, map] of state.scoreboard.scores) if (!objective || obj === objective) for (const h of map.keys()) set.add(h);
    return { ok: true, names: [...set] };
  }
  if (String(raw).startsWith('@')) {
    const r = targets(context, raw);
    return r.ok ? { ok: true, names: r.entities.map(holderName) } : r;
  }
  return raw ? { ok: true, names: [raw] } : { ok: false, reason: 'A score holder is needed' };
}

// --- /scoreboard --------------------------------------------------------------------------------------------------

function cmdScoreboard(context, parts) {
  const state = stateOf(context); const sb = state.scoreboard;
  const [, section, action] = parts;
  if (section === 'objectives') {
    if (action === 'list') {
      const names = [...sb.objectives.keys()];
      return ok(context, names.length ? `There are ${names.length} objective(s): ${names.map((n) => `[${sb.objectives.get(n).displayName}]`).join(', ')}` : 'There are no objectives', names.length);
    }
    if (action === 'add') {
      const [name, criterion] = [parts[3], parts[4]];
      if (!name || !criterion) return fail(context, 'Usage: /scoreboard objectives add <objective> <criteria> [<displayName>]');
      if (sb.objectives.has(name)) return fail(context, 'An objective already exists by that name');
      if (!SIMPLE_CRITERIA.includes(criterion) && !/^minecraft\.[a-z_]+:/.test(criterion) && !/^[a-z_]+\.[a-z_.]+:?/.test(criterion)) return fail(context, `Unknown criterion '${criterion}'`);
      sb.objectives.set(name, { criterion, displayName: parts[5] ? jsonText(rest(parts, 5)) : name, renderType: criterion === 'health' ? 'hearts' : 'integer' });
      if (!sb.scores.has(name)) sb.scores.set(name, new Map());
      renderHud(context);
      return ok(context, `Created new objective [${sb.objectives.get(name).displayName}]`);
    }
    if (action === 'remove') {
      if (!sb.objectives.delete(parts[3])) return fail(context, `Unknown scoreboard objective '${parts[3]}'`);
      sb.scores.delete(parts[3]);
      for (const slot of Object.keys(sb.display)) if (sb.display[slot] === parts[3]) delete sb.display[slot];
      renderHud(context);
      return ok(context, `Removed objective [${parts[3]}]`);
    }
    if (action === 'setdisplay') {
      const slot = parts[3] === 'belowName' ? 'below_name' : parts[3];
      if (!DISPLAY_SLOTS.includes(parts[3])) return fail(context, `Unknown display slot '${parts[3]}'`);
      if (!parts[4]) { delete sb.display[slot]; renderHud(context); return ok(context, `Cleared objective display slot ${slot}`); }
      if (!sb.objectives.has(parts[4])) return fail(context, `Unknown scoreboard objective '${parts[4]}'`);
      sb.display[slot] = parts[4]; renderHud(context);
      return ok(context, `Set display slot ${slot} to show objective ${parts[4]}`);
    }
    if (action === 'modify') {
      const obj = sb.objectives.get(parts[3]);
      if (!obj) return fail(context, `Unknown scoreboard objective '${parts[3]}'`);
      if (parts[4] === 'displayname') obj.displayName = jsonText(rest(parts, 5));
      else if (parts[4] === 'rendertype' && ['hearts', 'integer'].includes(parts[5])) obj.renderType = parts[5];
      else if (parts[4] === 'displayautoupdate' || parts[4] === 'numberformat') obj[parts[4]] = rest(parts, 5);
      else return fail(context, 'Usage: /scoreboard objectives modify <objective> (displayname|rendertype|displayautoupdate|numberformat) ...');
      renderHud(context);
      return ok(context, `Changed objective ${parts[3]}`);
    }
    return fail(context, 'Usage: /scoreboard objectives (list|add|remove|setdisplay|modify) ...');
  }
  if (section === 'players') {
    const needObj = (name) => (sb.objectives.has(name) ? null : `Unknown scoreboard objective '${name}'`);
    if (action === 'list') {
      if (!parts[3]) {
        const all = new Set(); for (const m of sb.scores.values()) for (const h of m.keys()) all.add(h);
        return ok(context, all.size ? `There are ${all.size} tracked entity/entities: ${[...all].join(', ')}` : 'There are no tracked entities', all.size);
      }
      const h = holders(context, parts[3]); if (!h.ok) return fail(context, h.reason);
      const lines = [...sb.scores].filter(([, m]) => m.has(h.names[0])).map(([o, m]) => `[${o}]: ${m.get(h.names[0])}`);
      return ok(context, lines.length ? `${h.names[0]} has ${lines.length} score(s): ${lines.join(', ')}` : `${h.names[0]} has no scores to show`, lines.length);
    }
    if (action === 'get') {
      const h = holders(context, parts[3]); if (!h.ok) return fail(context, h.reason);
      const err = needObj(parts[4]); if (err) return fail(context, err);
      const v = scoreOf(state, h.names[0], parts[4]);
      if (v === undefined) return fail(context, `Can't get value of ${parts[4]} for ${h.names[0]}; none is set`);
      return ok(context, `${h.names[0]} has ${v} [${parts[4]}]`, v);
    }
    if (['set', 'add', 'remove'].includes(action)) {
      const h = holders(context, parts[3]); if (!h.ok) return fail(context, h.reason);
      const err = needObj(parts[4]); if (err) return fail(context, err);
      const n = Number(parts[5]);
      if (!Number.isInteger(n) || (action !== 'set' && n < 0)) return fail(context, `Usage: /scoreboard players ${action} <targets> <objective> <score>`);
      if (['health', 'xp', 'level', 'food', 'air', 'armor', 'deathCount', 'playerKillCount', 'totalKillCount'].includes(sb.objectives.get(parts[4]).criterion) && action !== 'set') return fail(context, `${parts[4]} is a read-only objective`);
      let last = 0;
      for (const name of h.names) {
        const cur = scoreOf(state, name, parts[4]) ?? 0;
        last = action === 'set' ? n : action === 'add' ? cur + n : cur - n;
        setScore(state, name, parts[4], last);
      }
      renderHud(context);
      const verb = { set: 'Set', add: 'Added', remove: 'Removed' }[action];
      return ok(context, h.names.length === 1
        ? (action === 'set' ? `Set [${parts[4]}] for ${h.names[0]} to ${n}` : `${verb} ${n} to [${parts[4]}] for ${h.names[0]} (now ${last})`)
        : `${verb} [${parts[4]}] for ${h.names.length} entities`, last);
    }
    if (action === 'reset') {
      const h = holders(context, parts[3]); if (!h.ok) return fail(context, h.reason);
      for (const name of h.names) for (const [o, m] of sb.scores) if (!parts[4] || o === parts[4]) m.delete(name);
      renderHud(context);
      return ok(context, parts[4] ? `Reset ${parts[4]} for ${h.names.join(', ')}` : `Reset all scores for ${h.names.join(', ')}`);
    }
    if (action === 'enable') {
      const h = holders(context, parts[3]); if (!h.ok) return fail(context, h.reason);
      const obj = sb.objectives.get(parts[4]);
      if (!obj) return fail(context, `Unknown scoreboard objective '${parts[4]}'`);
      if (obj.criterion !== 'trigger') return fail(context, 'That objective is not a "trigger" objective');
      if (!sb.enabled.has(parts[4])) sb.enabled.set(parts[4], new Set());
      for (const name of h.names) sb.enabled.get(parts[4]).add(name);
      return ok(context, `Enabled trigger ${parts[4]} for ${h.names.length === 1 ? h.names[0] : `${h.names.length} entities`}`);
    }
    if (action === 'operation') {
      const t = holders(context, parts[3]); const s = holders(context, parts[6]);
      if (!t.ok) return fail(context, t.reason); if (!s.ok) return fail(context, s.reason);
      for (const o of [parts[4], parts[7]]) { const err = needObj(o); if (err) return fail(context, err); }
      let last = 0;
      for (const tn of t.names) for (const sn of s.names) {
        const a = scoreOf(state, tn, parts[4]) ?? 0; const b = scoreOf(state, sn, parts[7]) ?? 0;
        const result = scoreOperation(parts[5], a, b);
        if (!result) return fail(context, `Invalid operation '${parts[5]}'`);
        if (parts[5] === '/=' && b === 0 || parts[5] === '%=' && b === 0) return fail(context, 'Cannot divide by zero');
        setScore(state, tn, parts[4], result[0]); last = result[0];
        if (parts[5] === '><') setScore(state, sn, parts[7], result[1]);
      }
      renderHud(context);
      return ok(context, `Set [${parts[4]}] for ${t.names.length === 1 ? t.names[0] : `${t.names.length} entities`} to ${last}`, last);
    }
    return fail(context, 'Usage: /scoreboard players (list|get|set|add|remove|reset|enable|operation) ...');
  }
  return fail(context, 'Usage: /scoreboard (objectives|players) ...');
}

/** /trigger <objective> [add|set <value>]: the executor's own trigger score, once per enable. */
function cmdTrigger(context, parts) {
  const state = stateOf(context); const sb = state.scoreboard;
  const obj = sb.objectives.get(parts[1]);
  if (!obj) return fail(context, `Unknown scoreboard objective '${parts[1]}'`);
  if (obj.criterion !== 'trigger') return fail(context, 'You can only trigger objectives that are \'trigger\' type');
  const me = holderName(context.executor ?? context.player);
  if (!sb.enabled.get(parts[1])?.has(me)) return fail(context, 'You cannot trigger this objective yet');
  const mode = parts[2] ?? 'add'; const n = parts[3] === undefined ? 1 : Number(parts[3]);
  if (!['add', 'set'].includes(mode) || !Number.isInteger(n)) return fail(context, 'Usage: /trigger <objective> [add|set <value>]');
  const v = mode === 'set' ? n : (scoreOf(state, me, parts[1]) ?? 0) + n;
  setScore(state, me, parts[1], v);
  sb.enabled.get(parts[1]).delete(me);
  renderHud(context);
  return ok(context, mode === 'set' ? `Triggered [${parts[1]}] (set value to ${n})` : `Triggered [${parts[1]}] (added ${n} to value)`, v);
}

// --- /tag ---------------------------------------------------------------------------------------------------------

function cmdTag(context, parts) {
  const r = targets(context, parts[1]); if (!r.ok) return fail(context, r.reason);
  const action = parts[2]; const name = parts[3];
  if (action === 'list') {
    const tags = [...new Set(r.entities.flatMap((e) => [...(e.tags ?? [])]))];
    return ok(context, tags.length ? `${entityName(r.entities[0])} has ${tags.length} tags: ${tags.join(', ')}` : `${entityName(r.entities[0])} has no tags`, tags.length);
  }
  if (!['add', 'remove'].includes(action) || !/^[A-Za-z0-9_.+-]+$/.test(name ?? '')) return fail(context, 'Usage: /tag <targets> (add|remove) <name> | /tag <targets> list');
  let changed = 0;
  for (const e of r.entities) {
    e.tags ??= new Set();
    if (action === 'add' && !e.tags.has(name) && e.tags.size < 1024) { e.tags.add(name); changed++; }
    if (action === 'remove' && e.tags.delete(name)) changed++;
  }
  if (!changed) return fail(context, action === 'add' ? 'Nothing changed. Those players already have that tag or have too many tags' : 'Nothing changed. Those players don\'t have that tag');
  return ok(context, `${action === 'add' ? 'Added' : 'Removed'} tag '${name}' ${action === 'add' ? 'to' : 'from'} ${changed === 1 ? entityName(r.entities[0]) : `${changed} entities`}`, changed);
}

// --- /team, /teammsg ----------------------------------------------------------------------------------------------

function cmdTeam(context, parts) {
  const state = stateOf(context); const teams = state.teams;
  const [, action, name] = parts;
  if (action === 'list') {
    if (name) { const t = teams.get(name); if (!t) return fail(context, `Unknown team '${name}'`); return ok(context, t.members.size ? `Team [${t.displayName}] has ${t.members.size} member(s): ${[...t.members].join(', ')}` : `There are no members on team [${t.displayName}]`, t.members.size); }
    return ok(context, teams.size ? `There are ${teams.size} team(s): ${[...teams.values()].map((t) => `[${t.displayName}]`).join(', ')}` : 'There are no teams', teams.size);
  }
  if (action === 'add') {
    if (!name || !/^[A-Za-z0-9_.+-]+$/.test(name)) return fail(context, 'Usage: /team add <team> [<displayName>]');
    if (teams.has(name)) return fail(context, 'A team already exists by that name');
    teams.set(name, { displayName: parts[3] ? jsonText(rest(parts, 3)) : name, color: 'reset', friendlyFire: true, seeFriendlyInvisibles: true, nametagVisibility: 'always', deathMessageVisibility: 'always', collisionRule: 'always', prefix: '', suffix: '', members: new Set() });
    return ok(context, `Created team [${teams.get(name).displayName}]`);
  }
  const team = teams.get(name);
  if (action === 'remove') { if (!team) return fail(context, `Unknown team '${name}'`); teams.delete(name); return ok(context, `Removed team [${team.displayName}]`); }
  if (action === 'empty') { if (!team) return fail(context, `Unknown team '${name}'`); const n = team.members.size; if (!n) return fail(context, 'Nothing changed. That team is already empty'); team.members.clear(); return ok(context, `Removed ${n} member(s) from team [${team.displayName}]`, n); }
  if (action === 'join') {
    if (!team) return fail(context, `Unknown team '${name}'`);
    const h = holders(context, parts[3] ?? '@s'); if (!h.ok) return fail(context, h.reason);
    for (const t of teams.values()) for (const m of h.names) t.members.delete(m);
    for (const m of h.names) team.members.add(m);
    return ok(context, `Added ${h.names.length === 1 ? h.names[0] : `${h.names.length} entities`} to team [${team.displayName}]`, h.names.length);
  }
  if (action === 'leave') {
    const h = holders(context, parts[2] ?? '@s'); if (!h.ok) return fail(context, h.reason);
    let n = 0; for (const t of teams.values()) for (const m of h.names) if (t.members.delete(m)) n++;
    if (!n) return fail(context, 'Nothing changed. That player isn\'t on any team');
    return ok(context, `Removed ${h.names.length === 1 ? h.names[0] : `${n} entities`} from any team`, n);
  }
  if (action === 'modify') {
    if (!team) return fail(context, `Unknown team '${name}'`);
    const option = parts[3]; const allowed = TEAM_OPTIONS[option]; const value = rest(parts, 4);
    if (!allowed) return fail(context, `Unknown team option '${option}'`);
    if (allowed !== 'text' && !allowed.includes(value)) return fail(context, `Invalid value for ${option}: ${value}`);
    team[option] = allowed === 'text' ? jsonText(value) : value === 'true' ? true : value === 'false' ? false : value;
    return ok(context, `Updated the ${option} for team ${name}`);
  }
  return fail(context, 'Usage: /team (add|remove|empty|join|leave|list|modify) ...');
}

function cmdTeamMsg(context, parts) {
  const state = stateOf(context);
  const me = holderName(context.executor ?? context.player);
  const team = teamOf(state, me);
  if (!team) return fail(context, 'You must be on a team to message your team');
  if (parts.length < 2) return fail(context, 'Usage: /teammsg <message>');
  return ok(context, `-> [${state.teams.get(team).displayName}] <${entityName(context.executor ?? context.player)}> ${rest(parts, 1)}`);
}

// --- functions: /function, /schedule, /return, /reload, /datapack -----------------------------------------------

/** Every .mcfunction file the enabled packs carry, by resource id, and the function tags. */
export function packFunctions(store) {
  const functions = new Map(); const tags = new Map();
  for (const pack of enabledPacks(store)) {
    for (const [path, content] of Object.entries(pack.files ?? {})) {
      const clean = path.replace(/\\/g, '/');
      let m = /data\/([^/]+)\/functions?\/(.+)\.mcfunction$/.exec(clean);
      if (m) { functions.set(`${m[1]}:${m[2]}`, String(content)); continue; }
      m = /data\/([^/]+)\/tags\/functions?\/(.+)\.json$/.exec(clean);
      if (m) { try { const json = typeof content === 'string' ? JSON.parse(content) : content; tags.set(`${m[1]}:${m[2]}`, (json.values ?? []).map((v) => (typeof v === 'string' ? v : v.id))); } catch { /* not JSON: skipped */ } }
    }
  }
  return { functions, tags };
}

/** The function ids a /function argument names: one id, or every id in a #tag. */
function resolveFunctions(context, raw) {
  const { functions, tags } = packFunctions(context.game?.dataPacks);
  if (String(raw).startsWith('#')) {
    const ids = tags.get(nsId(raw.slice(1)));
    return ids ? { ok: true, ids: ids.map(nsId), functions } : { ok: false, reason: `Unknown function tag '${raw}'` };
  }
  return functions.has(nsId(raw)) ? { ok: true, ids: [nsId(raw)], functions } : { ok: false, reason: `Unknown function '${raw}'` };
}

/**
 * Run a function's lines in order through the dispatcher, at function permission, stopping at /return. The chain
 * is bounded by the maxCommandChainLength game rule (65536).
 */
export function runFunction(context, id, functions = null) {
  const state = stateOf(context);
  const source = (functions ?? packFunctions(context.game?.dataPacks).functions).get(nsId(id));
  if (source === undefined) return { ok: false, reason: `Unknown function '${id}'` };
  const limit = context.game?.gamerules?.maxCommandChainLength ?? GAMERULE_DEFAULTS.maxCommandChainLength;
  if (state.functionDepth > 64) return { ok: false, reason: 'Function recursion is too deep' };
  state.functionDepth++;
  const frame = { returned: false, value: undefined, commands: 0 };
  const sub = Object.create(context);
  sub.elevated = true; sub.functionFrame = frame; sub.failed = false; sub.result = undefined;
  if (state.profiler.debugFunction) state.profiler.debugFunction.push(`[F] ${id}`);
  try {
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (++frame.commands > limit) break;
      if (state.profiler.debugFunction) state.profiler.debugFunction.push(`[C] ${line}`);
      context.dispatch?.(`/${line.replace(/^\//, '')}`, sub);
      if (frame.returned) break;
    }
  } finally { state.functionDepth--; }
  return { ok: true, commands: frame.commands, value: frame.value };
}

function cmdFunction(context, parts) {
  if (!parts[1]) return fail(context, 'Usage: /function <name> [<arguments>]');
  const r = resolveFunctions(context, parts[1]);
  if (!r.ok) return fail(context, r.reason);
  let total = 0; let value;
  for (const id of r.ids) { const run = runFunction(context, id, r.functions); total += run.commands ?? 0; if (run.value !== undefined) value = run.value; }
  return ok(context, r.ids.length === 1 ? `Running function ${r.ids[0]}` : `Running ${r.ids.length} functions from ${parts[1]}`, value ?? total);
}

function cmdSchedule(context, parts) {
  const state = stateOf(context);
  if (parts[1] === 'clear') {
    const before = state.schedules.length;
    state.schedules = state.schedules.filter((s) => s.fn !== nsId(parts[2]) && s.fn !== parts[2]);
    const n = before - state.schedules.length;
    if (!n) return fail(context, `No schedule with id ${parts[2]}`);
    return ok(context, `Removed ${n} schedule(s) with id ${parts[2]}`, n);
  }
  if (parts[1] !== 'function' || !parts[2] || !parts[3]) return fail(context, 'Usage: /schedule function <function> <time> [append|replace] | /schedule clear <function>');
  const ticks = parseTimeArgument(parts[3]);
  if (!Number.isFinite(ticks) || ticks <= 0) return fail(context, 'Can\'t schedule for current tick');
  const r = resolveFunctions(context, parts[2]); if (!r.ok) return fail(context, r.reason);
  const fn = String(parts[2]).startsWith('#') ? parts[2] : nsId(parts[2]);
  // "in replace mode, overrides an unexecuted schedule"; append keeps both.
  if ((parts[4] ?? 'replace') === 'replace') state.schedules = state.schedules.filter((s) => s.fn !== fn);
  state.schedules.push({ fn, dueTick: state.gameTicks + ticks });
  return ok(context, `Scheduled function ${fn} in ${ticks} ticks at gametime ${state.gameTicks + ticks}`, state.gameTicks + ticks);
}

function cmdReturn(context, parts) {
  const frame = context.functionFrame;
  if (!frame) return fail(context, '/return can only be used in a function');
  if (parts[1] === 'fail') { frame.returned = true; frame.value = 0; context.failed = true; return true; }
  if (parts[1] === 'run') {
    const sub = Object.create(context); sub.failed = false; sub.result = undefined;
    context.dispatch?.(`/${rest(parts, 2)}`, sub);
    frame.returned = true; frame.value = sub.failed ? 0 : sub.result ?? 1;
    return true;
  }
  const v = Number(parts[1]);
  if (!Number.isInteger(v)) return fail(context, 'Usage: /return <value> | /return fail | /return run <command>');
  frame.returned = true; frame.value = v;
  return ok(context, null, v);
}

function cmdReload(context) {
  context.game?.reloadDataPacks?.();
  return ok(context, 'Reloading!');
}

function cmdDatapack(context, parts) {
  const store = context.game?.dataPacks;
  if (!store) return fail(context, 'Data packs are not available in this session.');
  const [, action, name] = parts;
  if (action === 'list') {
    const packs = allPacks(store);
    const enabled = packs.filter((p) => p.enabled).map((p) => `[${p.name}]`); const available = packs.filter((p) => !p.enabled).map((p) => `[${p.name}]`);
    if (name === 'enabled') return ok(context, `There are ${enabled.length} data pack(s) enabled: ${enabled.join(', ')}`, enabled.length);
    if (name === 'available') return ok(context, available.length ? `There are ${available.length} data pack(s) available: ${available.join(', ')}` : 'There are no more data packs available', available.length);
    say(context, `There are ${enabled.length} data pack(s) enabled: ${enabled.join(', ')}`);
    return ok(context, available.length ? `There are ${available.length} data pack(s) available: ${available.join(', ')}` : 'There are no more data packs available', packs.length);
  }
  if (action === 'enable' || action === 'disable') {
    const id = String(name ?? '').replace(/^"|"$/g, '').replace(/^file\//, '');
    const pack = allPacks(store).find((p) => p.name === id);
    if (!pack) return fail(context, `Unknown data pack '${name}'`);
    if (pack.enabled === (action === 'enable')) return fail(context, `Pack '${id}' is already ${action}d!`);
    setPackEnabled(store, id, action === 'enable');
    context.game?.reloadDataPacks?.();
    return ok(context, `${action === 'enable' ? 'Enabled' : 'Disabled'} data pack [${id}]`);
  }
  return fail(context, 'Usage: /datapack (list [available|enabled]|enable <name>|disable <name>)');
}

// --- /execute -----------------------------------------------------------------------------------------------------

/**
 * /execute: a chain of modifiers and conditions over execution frames (executor, position), ending in `run` or a
 * test. Supported: as, at, positioned (pos | as), align, anchored, rotated, facing, in, on (vehicle|passengers|
 * attacker), summon, if/unless (block | entity | score | data | biome | loaded | dimension | function), and
 * store (result|success) (score | bossbar | storage).
 */
function cmdExecute(context, parts) {
  let frames = [{ executor: context.executor ?? context.player, origin: { ...origin(context) }, dimension: context.dimension ?? 'overworld' }];
  const stores = [];
  let i = 1;
  const frameCtx = (f) => { const c = Object.create(context); c.executor = f.executor; c.origin = f.origin; c.dimension = f.dimension; return c; };
  const posOf = (e) => e?.position ?? e?.mesh?.position;
  while (i < parts.length) {
    const word = parts[i++];
    if (word === 'run') {
      const line = `/${rest(parts, i)}`;
      let successes = 0; let last = 0;
      for (const f of frames) {
        const c = frameCtx(f); c.failed = false; c.result = undefined;
        context.dispatch?.(line, c);
        const success = !c.failed; const result = c.failed ? 0 : (c.result ?? 1);
        if (success) successes++; last = result;
        for (const s of stores) applyStore(context, s, s.kind === 'success' ? (success ? 1 : 0) : result, f);
      }
      context.result = last;
      if (!successes && frames.length) context.failed = true;
      return true;
    }
    if (word === 'as' || word === 'at') {
      const next = [];
      for (const f of frames) {
        const r = targets(frameCtx(f), parts[i]);
        if (!r.ok) continue;
        for (const e of r.entities) next.push(word === 'as' ? { ...f, executor: e } : { ...f, origin: { ...posOf(e) } });
      }
      frames = next; i++; continue;
    }
    if (word === 'positioned') {
      if (parts[i] === 'as') { const next = []; for (const f of frames) { const r = targets(frameCtx(f), parts[i + 1]); if (r.ok) for (const e of r.entities) next.push({ ...f, origin: { ...posOf(e) } }); } frames = next; i += 2; continue; }
      if (parts[i] === 'over') { frames = frames.map((f) => ({ ...f, origin: { ...f.origin, y: (context.world?.surfaceHeightAt?.(Math.floor(f.origin.x), Math.floor(f.origin.z)) ?? f.origin.y) + 1 } })); i += 2; continue; }
      frames = frames.map((f) => { const p = position(frameCtx(f), parts, i); return p ? { ...f, origin: p } : null; }).filter(Boolean); i += 3; continue;
    }
    if (word === 'align') { const axes = parts[i++]; frames = frames.map((f) => ({ ...f, origin: { x: axes.includes('x') ? Math.floor(f.origin.x) : f.origin.x, y: axes.includes('y') ? Math.floor(f.origin.y) : f.origin.y, z: axes.includes('z') ? Math.floor(f.origin.z) : f.origin.z } })); continue; }
    if (word === 'anchored') { i++; continue; }
    if (word === 'rotated') { i += parts[i] === 'as' ? 2 : 2; continue; }
    if (word === 'facing') { i += parts[i] === 'entity' ? 3 : 3; continue; }
    if (word === 'in') { const dim = stripNs(parts[i++]); frames = frames.map((f) => ({ ...f, dimension: dim })); continue; }
    if (word === 'on') {
      const rel = parts[i++];
      frames = frames.flatMap((f) => { const e = f.executor; const to = rel === 'vehicle' ? e?.vehicle ?? e?.ridingMob : rel === 'passengers' ? e?.rider : rel === 'attacker' ? e?.lastAttacker : rel === 'target' ? e?.target : rel === 'owner' ? e?.owner : null; return to ? [{ ...f, executor: to }] : []; });
      continue;
    }
    if (word === 'summon') {
      const type = stripNs(parts[i++]);
      frames = frames.map((f) => { const m = context.mobs?.spawnMob?.(type, f.origin.x, f.origin.y, f.origin.z); return m ? { ...f, executor: m } : null; }).filter(Boolean);
      continue;
    }
    if (word === 'if' || word === 'unless') {
      const want = word === 'if';
      const kind = parts[i++];
      const consumed = { block: 4, entity: 1, score: null, data: 3, biome: 4, loaded: 3, dimension: 1, function: 1, items: 3 }[kind];
      if (consumed === undefined) return fail(context, `Unsupported condition '${kind}'`);
      let n = consumed;
      if (kind === 'score') n = parts[i + 2] === 'matches' ? 4 : 5;
      const args = parts.slice(i, i + n); i += n;
      frames = frames.filter((f) => testCondition(frameCtx(f), kind, args) === want);
      if (i >= parts.length) {
        const passed = frames.length;
        context.result = passed;
        for (const s of stores) applyStore(context, s, passed, frames[0] ?? { executor: context.player });
        return passed ? ok(context, passed === 1 ? 'Test passed' : `Test passed, count: ${passed}`, passed) : fail(context, 'Test failed');
      }
      continue;
    }
    if (word === 'store') {
      const kind = parts[i++]; const where = parts[i++];
      if (where === 'score') { stores.push({ kind, where, targets: parts[i], objective: parts[i + 1] }); i += 2; continue; }
      if (where === 'bossbar') { stores.push({ kind, where, id: parts[i], field: parts[i + 1] }); i += 2; continue; }
      if (where === 'storage') { stores.push({ kind, where, id: parts[i], path: parts[i + 1], type: parts[i + 2], scale: Number(parts[i + 3] ?? 1) }); i += 4; continue; }
      if (where === 'entity' || where === 'block') { stores.push({ kind, where, target: parts.slice(i, i + (where === 'block' ? 3 : 1)), path: parts[i + (where === 'block' ? 3 : 1)] }); i += (where === 'block' ? 6 : 4); continue; }
      return fail(context, `Unknown store target '${where}'`);
    }
    return fail(context, `Unknown /execute subcommand '${word}'`);
  }
  return fail(context, 'Usage: /execute ... run <command>');
}

function applyStore(context, s, value, frame) {
  const state = stateOf(context);
  if (s.where === 'score') {
    const c = Object.create(context); c.executor = frame.executor;
    const h = holders(c, s.targets); if (!h.ok || !state.scoreboard.objectives.has(s.objective)) return;
    for (const name of h.names) setScore(state, name, s.objective, value);
    renderHud(context);
  } else if (s.where === 'bossbar') {
    const bar = state.bossbars.get(nsId(s.id)); if (!bar) return;
    if (s.field === 'max') bar.max = Math.max(1, value); else bar.value = value;
    renderHud(context);
  } else if (s.where === 'storage') {
    const id = nsId(s.id); if (!state.storage.has(id)) state.storage.set(id, {});
    setPath(state.storage.get(id), s.path, ['int', 'long', 'short', 'byte'].includes(s.type) ? Math.trunc(value * s.scale) : value * s.scale);
  }
}

function testCondition(context, kind, args) {
  const state = stateOf(context);
  if (kind === 'entity') return targets(context, args[0]).ok;
  if (kind === 'block') {
    const p = position(context, args, 0); const want = resolveItem(args[3]);
    return Boolean(p && want.ok && want.isBlock && (context.world?.getVoxel?.(p.x, p.y, p.z) ?? 0) === want.id);
  }
  if (kind === 'score') {
    const a = holders(context, args[0]); if (!a.ok) return false;
    const v = scoreOf(state, a.names[0], args[1]); if (v === undefined) return false;
    if (args[2] === 'matches') { const r = parseRange(args[3]); return Boolean(r) && v >= r[0] && v <= r[1]; }
    const b = holders(context, args[3]); if (!b.ok) return false;
    const w = scoreOf(state, b.names[0], args[4]); if (w === undefined) return false;
    return { '<': v < w, '<=': v <= w, '=': v === w, '>=': v >= w, '>': v > w }[args[2]] ?? false;
  }
  if (kind === 'data') return getPath(dataSource(context, args[0], args.slice(1)).value ?? {}, args[args[0] === 'block' ? 4 : 2]) !== undefined;
  if (kind === 'biome') { const p = position(context, args, 0); return Boolean(p) && (context.world?.getBiome?.(p.x, p.z) ?? '') === stripNs(args[3]); }
  if (kind === 'loaded') { const p = position(context, args, 0); return Boolean(p && context.world?.getChunk?.(Math.floor(p.x / 16), Math.floor(p.z / 16))); }
  if (kind === 'dimension') return (context.dimension ?? 'overworld') === stripNs(args[0]);
  if (kind === 'function') { const r = resolveFunctions(context, args[0]); if (!r.ok) return false; return r.ids.some((id) => (runFunction(context, id, r.functions).value ?? 0) !== 0); }
  if (kind === 'items') return false;
  return false;
}

// --- /data --------------------------------------------------------------------------------------------------------

/** An entity as NBT (the fields the Player format and Entity format pages name that this game keeps). */
export function entityNbt(e) {
  const p = e.position ?? e.mesh?.position ?? { x: 0, y: 0, z: 0 };
  const base = { Pos: [p.x, p.y, p.z], Health: e.health ?? 0, Tags: [...(e.tags ?? [])], UUID: holderName(e), Fire: e.fireTicks ?? -20, OnGround: e.onGround ? 1 : 0 };
  if (e.isPlayerEntity) {
    const inv = e.game?.inventory;
    return { ...base, XpLevel: e.level ?? 0, XpP: e.exp ?? 0, foodLevel: e.hunger ?? 20, foodSaturationLevel: e.saturation ?? 5, playerGameType: ['survival', 'creative', 'adventure', 'spectator'].indexOf(e.gamemode), Rotation: [e.yaw ?? 0, e.pitch ?? 0],
      SelectedItemSlot: inv?.activeSlot ?? 0, Inventory: inv ? inv.hotbar.map((s, slot) => (s ? { Slot: slot, id: nsId(s.isBlock ? (BLOCK_DEFS[s.id]?.name ?? s.id) : s.id), count: s.count ?? 1 } : null)).filter(Boolean) : [] };
  }
  return { ...base, id: nsId(e.type), ...(e.customName ? { CustomName: e.customName } : {}), NoAI: e.noAI ? 1 : 0, ...(e.isBaby !== undefined ? { IsBaby: e.isBaby ? 1 : 0 } : {}) };
}
/** Where /data reads and writes: an entity, a block (its container contents) or a storage id. */
function dataSource(context, kind, args) {
  const state = stateOf(context);
  if (kind === 'entity') { const r = targets(context, args[0]); if (!r.ok) return { reason: r.reason }; const e = r.entities[0]; e.game ??= context.game; return { value: entityNbt(e), entity: e, label: entityName(e) }; }
  if (kind === 'block') {
    const p = position(context, args, 0); if (!p) return { reason: 'Invalid position' };
    const chest = context.game?.chestManager?.getChest?.(p.x, p.y, p.z);
    if (!chest) return { reason: 'The target block is not a block entity' };
    return { value: { x: p.x, y: p.y, z: p.z, id: 'minecraft:chest', Items: chest.items.map((s, slot) => (s ? { Slot: slot, id: nsId(s.id), count: s.count } : null)).filter(Boolean) }, chest, label: `${p.x}, ${p.y}, ${p.z}` };
  }
  if (kind === 'storage') { const id = nsId(args[0]); if (!state.storage.has(id)) state.storage.set(id, {}); return { value: state.storage.get(id), storage: id, label: `storage ${id}` }; }
  return { reason: `Unknown data source '${kind}'` };
}

function cmdData(context, parts) {
  const [, action, kind] = parts;
  const width = kind === 'block' ? 3 : 1;
  const src = dataSource(context, kind, parts.slice(3));
  if (src.reason) return fail(context, src.reason);
  const after = 3 + width;
  if (action === 'get') {
    const path = parts[after]; const v = getPath(src.value, path);
    if (v === undefined) return fail(context, `Found no elements matching ${path}`);
    const scale = Number(parts[after + 1] ?? 1);
    const result = typeof v === 'number' ? Math.trunc(v * scale) : Array.isArray(v) ? v.length : typeof v === 'object' ? Object.keys(v).length : String(v).length;
    const what = kind === 'storage' ? `Storage ${src.storage} has the following contents` : kind === 'block' ? `${src.label} has the following block data` : `${src.label} has the following entity data`;
    return ok(context, `${what}: ${toSnbt(path ? v : src.value)}`, result);
  }
  if (action === 'merge') {
    let patch; try { patch = parseSnbt(rest(parts, after)); } catch (e) { return fail(context, e instanceof SnbtError ? `Invalid NBT: ${e.message}` : String(e)); }
    applyDataPatch(context, src, patch);
    return ok(context, `Modified ${kind === 'storage' ? `storage ${src.storage}` : `${kind} data of ${src.label}`}`);
  }
  if (action === 'modify') {
    const path = parts[after]; const op = parts[after + 1]; const from = parts[after + 2];
    let value;
    if (from === 'value') { try { value = parseSnbt(rest(parts, after + 3)); } catch (e) { return fail(context, `Invalid NBT: ${e.message}`); } }
    else if (from === 'from') { const k = parts[after + 3]; const w = k === 'block' ? 3 : 1; value = getPath(dataSource(context, k, parts.slice(after + 4)).value, parts[after + 4 + w]); }
    else return fail(context, 'Usage: /data modify <target> <path> (set|append|prepend|insert|merge) (value <nbt>|from <source> [<path>])');
    const cur = getPath(src.value, path);
    const next = op === 'set' ? value : op === 'append' ? [...(cur ?? []), value] : op === 'prepend' ? [value, ...(cur ?? [])] : op === 'merge' ? { ...(cur ?? {}), ...value } : value;
    const patch = setPath({}, path, next);
    applyDataPatch(context, src, patch);
    return ok(context, `Modified ${kind === 'storage' ? `storage ${src.storage}` : `${kind} data of ${src.label}`}`);
  }
  if (action === 'remove') {
    const path = parts[after];
    if (kind === 'storage') { if (!removePath(src.value, path)) return fail(context, `Found no elements matching ${path}`); return ok(context, `Modified storage ${src.storage}`); }
    if (kind === 'entity' && path === 'CustomName') { delete src.entity.customName; return ok(context, `Modified entity data of ${src.label}`); }
    if (kind === 'entity' && path?.startsWith('Tags')) { src.entity.tags?.clear(); return ok(context, `Modified entity data of ${src.label}`); }
    return fail(context, `Found no elements matching ${path}`);
  }
  return fail(context, 'Usage: /data (get|merge|modify|remove) (entity|block|storage) ...');
}

/** Write a patch back: storage takes anything; an entity the fields it really has; a chest its Items. */
function applyDataPatch(context, src, patch) {
  if (src.storage) { Object.assign(src.value, patch); return; }
  if (src.entity) {
    const e = src.entity;
    if (patch.Health !== undefined) e.health = Math.min(Number(patch.Health), e.maxHealth ?? Infinity);
    if (patch.CustomName !== undefined) e.customName = typeof patch.CustomName === 'string' ? jsonText(patch.CustomName) : String(patch.CustomName);
    if (patch.NoAI !== undefined) e.noAI = Boolean(patch.NoAI); if (e.noAI) e.frozen = true; else if (patch.NoAI !== undefined) e.frozen = false;
    if (patch.Tags) e.tags = new Set(patch.Tags);
    if (Array.isArray(patch.Pos) && e.mesh?.position) e.mesh.position.set(...patch.Pos);
    if (patch.Fire !== undefined) e.fireTicks = Number(patch.Fire);
    return;
  }
  if (src.chest && Array.isArray(patch.Items)) {
    for (const it of patch.Items) { const r = resolveItem(stripNs(it.id)); if (r.ok) src.chest.items[it.Slot ?? 0] = { id: r.id, isBlock: r.isBlock, count: it.count ?? it.Count ?? 1 }; }
  }
}

/** A JSON text component or plain string, as display text. */
function jsonText(raw) {
  const s = String(raw ?? '').trim();
  try { const v = JSON.parse(s); return typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.text ?? '')).join('') : v?.text ?? s; } catch { return s.replace(/^"|"$/g, ''); }
}

// --- /attribute ---------------------------------------------------------------------------------------------------

/** Attribute defaults (Attribute page, Java): the player's and a generic mob's base values. */
export const ATTRIBUTES = Object.freeze({
  max_health: 20, max_absorption: 0, movement_speed: 0.1, attack_damage: 1, attack_speed: 4, attack_knockback: 0, knockback_resistance: 0,
  armor: 0, armor_toughness: 0, luck: 0, scale: 1, step_height: 0.6, gravity: 0.08, jump_strength: 0.42, safe_fall_distance: 3,
  fall_damage_multiplier: 1, block_interaction_range: 4.5, entity_interaction_range: 3, block_break_speed: 1, burning_time: 1,
  explosion_knockback_resistance: 0, mining_efficiency: 0, movement_efficiency: 0, oxygen_bonus: 0, sneaking_speed: 0.3,
  submerged_mining_speed: 0.2, sweeping_damage_ratio: 0, water_movement_efficiency: 0, follow_range: 32, flying_speed: 0.4, tempt_range: 10,
});
const OPERATIONS = ['add_value', 'add_multiplied_base', 'add_multiplied_total'];

/** An attribute's value with its modifiers: base + sum(add_value); x (1 + sum(add_multiplied_base)); x each (1 + add_multiplied_total). */
export function attributeValue(entity, name) {
  const a = entity.attributes?.[name];
  const base = a?.base ?? baseFor(entity, name);
  const mods = Object.values(a?.modifiers ?? {});
  let v = base + mods.filter((m) => m.operation === 'add_value').reduce((s, m) => s + m.amount, 0);
  v *= 1 + mods.filter((m) => m.operation === 'add_multiplied_base').reduce((s, m) => s + m.amount, 0);
  for (const m of mods.filter((x) => x.operation === 'add_multiplied_total')) v *= 1 + m.amount;
  return v;
}
function baseFor(entity, name) {
  if (name === 'max_health') return entity.maxHealth ?? 20;
  if (name === 'armor' && entity.isPlayerEntity) return 0;
  return ATTRIBUTES[name];
}
/** Push an attribute's value into the fields the game reads. */
function applyAttribute(entity, name) {
  const v = attributeValue(entity, name);
  if (name === 'max_health') { entity.maxHealth = v; if (entity.health > v) entity.health = v; }
  if (name === 'movement_speed' && entity.isPlayerEntity) entity.speedAttributeScale = v / ATTRIBUTES.movement_speed;
  if (name === 'movement_speed' && !entity.isPlayerEntity && entity.baseSpeed === undefined) entity.baseSpeed = entity.speed;
  if (name === 'movement_speed' && !entity.isPlayerEntity && entity.baseSpeed !== undefined) entity.speed = entity.baseSpeed * (v / ATTRIBUTES.movement_speed);
  if (name === 'jump_strength' && entity.isPlayerEntity) entity.jumpAttributeScale = v / ATTRIBUTES.jump_strength;
  if (name === 'gravity' && entity.isPlayerEntity) entity.gravityAttributeScale = v / ATTRIBUTES.gravity;
  if (name === 'attack_damage' && entity.isPlayerEntity) entity.attackAttribute = v;
  if (name === 'safe_fall_distance' && entity.isPlayerEntity) entity.safeFallDistance = v;
  if (name === 'scale' && entity.mesh?.scale) entity.mesh.scale.setScalar(v);
}

function cmdAttribute(context, parts) {
  const r = targets(context, parts[1]); if (!r.ok) return fail(context, r.reason);
  const e = r.entities[0]; const name = stripNs(parts[2]);
  if (!(name in ATTRIBUTES)) return fail(context, `Unknown attribute '${parts[2]}'`);
  e.attributes ??= {}; e.attributes[name] ??= { modifiers: {} };
  const a = e.attributes[name]; const who = entityName(e);
  if (parts[3] === 'get') { const v = attributeValue(e, name) * Number(parts[4] ?? 1); return ok(context, `Value of attribute ${name} for entity ${who} is ${+v.toFixed(4)}`, Math.trunc(v)); }
  if (parts[3] === 'base') {
    if (parts[4] === 'get') { const v = (a.base ?? baseFor(e, name)) * Number(parts[5] ?? 1); return ok(context, `Base value of attribute ${name} for entity ${who} is ${+v.toFixed(4)}`, Math.trunc(v)); }
    if (parts[4] === 'set') { const v = Number(parts[5]); if (!Number.isFinite(v)) return fail(context, 'Usage: /attribute <target> <attribute> base set <value>'); a.base = v; applyAttribute(e, name); return ok(context, `Base value for attribute ${name} for entity ${who} set to ${v}`); }
    if (parts[4] === 'reset') { delete a.base; applyAttribute(e, name); return ok(context, `Base value for attribute ${name} for entity ${who} reset to default ${baseFor(e, name)}`); }
  }
  if (parts[3] === 'modifier') {
    const id = nsId(parts[5]);
    if (parts[4] === 'add') {
      const amount = Number(parts[6]); const op = parts[7];
      if (!Number.isFinite(amount) || !OPERATIONS.includes(op)) return fail(context, 'Usage: /attribute <target> <attribute> modifier add <id> <value> (add_value|add_multiplied_base|add_multiplied_total)');
      if (a.modifiers[id]) return fail(context, `Entity ${who} already has modifier ${id} for attribute ${name}`);
      a.modifiers[id] = { amount, operation: op }; applyAttribute(e, name);
      return ok(context, `Added modifier ${id} to attribute ${name} for entity ${who}`);
    }
    if (parts[4] === 'remove') { if (!a.modifiers[id]) return fail(context, `Entity ${who} has no modifier ${id} for attribute ${name}`); delete a.modifiers[id]; applyAttribute(e, name); return ok(context, `Removed modifier ${id} from attribute ${name} for entity ${who}`); }
    if (parts[4] === 'value' && parts[5] === 'get') { const m = a.modifiers[nsId(parts[6])]; if (!m) return fail(context, `Entity ${who} has no modifier ${parts[6]} for attribute ${name}`); return ok(context, `Value of modifier ${parts[6]} on attribute ${name} for entity ${who} is ${m.amount}`, Math.trunc(m.amount * Number(parts[7] ?? 1))); }
  }
  return fail(context, 'Usage: /attribute <target> <attribute> (get [<scale>]|base (get|set|reset)|modifier (add|remove|value get) ...)');
}

// --- /bossbar -----------------------------------------------------------------------------------------------------

function cmdBossbar(context, parts) {
  const state = stateOf(context); const bars = state.bossbars;
  const [, action, raw] = parts; const id = raw ? nsId(raw) : null; const bar = id ? bars.get(id) : null;
  if (action === 'list') return ok(context, bars.size ? `There are ${bars.size} custom bossbar(s) active: ${[...bars.values()].map((b) => `[${b.name}]`).join(', ')}` : 'There are no custom bossbars active', bars.size);
  if (action === 'add') {
    if (!id || parts.length < 4) return fail(context, 'Usage: /bossbar add <id> <name>');
    if (bars.has(id)) return fail(context, `A bossbar already exists with the ID '${id}'`);
    bars.set(id, { name: jsonText(rest(parts, 3)), color: 'white', style: 'progress', value: 0, max: 100, visible: true, players: new Set() });
    renderHud(context);
    return ok(context, `Created custom bossbar [${bars.get(id).name}]`);
  }
  if (!bar) return fail(context, `No bossbar exists with the ID '${raw}'`);
  if (action === 'remove') { bars.delete(id); renderHud(context); return ok(context, `Removed custom bossbar [${bar.name}]`); }
  if (action === 'get') {
    const field = parts[3];
    if (field === 'max') return ok(context, `Custom bossbar [${bar.name}] has a maximum of ${bar.max}`, bar.max);
    if (field === 'value') return ok(context, `Custom bossbar [${bar.name}] has a value of ${bar.value}`, bar.value);
    if (field === 'visible') return ok(context, `Custom bossbar [${bar.name}] is currently ${bar.visible ? 'shown' : 'hidden'}`, bar.visible ? 1 : 0);
    if (field === 'players') return ok(context, bar.players.size ? `Custom bossbar [${bar.name}] has ${bar.players.size} player(s) currently online: ${[...bar.players].join(', ')}` : `Custom bossbar [${bar.name}] has no players currently online`, bar.players.size);
    return fail(context, 'Usage: /bossbar get <id> (max|players|value|visible)');
  }
  if (action === 'set') {
    const field = parts[3]; const v = parts[4];
    if (field === 'color') { if (!BOSSBAR_COLORS.includes(v)) return fail(context, `Invalid color '${v}'`); bar.color = v; }
    else if (field === 'style') { if (!BOSSBAR_STYLES.includes(v)) return fail(context, `Invalid style '${v}'`); bar.style = v; }
    else if (field === 'max') { const n = Number(v); if (!Number.isInteger(n) || n < 1) return fail(context, 'The maximum must be at least 1'); bar.max = n; }
    else if (field === 'value') { const n = Number(v); if (!Number.isInteger(n) || n < 0) return fail(context, 'The value must be at least 0'); bar.value = n; }
    else if (field === 'visible') { if (!['true', 'false'].includes(v)) return fail(context, 'Usage: /bossbar set <id> visible (true|false)'); bar.visible = v === 'true'; }
    else if (field === 'name') bar.name = jsonText(rest(parts, 4));
    else if (field === 'players') { bar.players = new Set(); if (v) { const r = targets(context, v); if (r.ok) for (const e of r.entities) bar.players.add(entityName(e)); } }
    else return fail(context, 'Usage: /bossbar set <id> (color|max|name|players|style|value|visible) ...');
    renderHud(context);
    return ok(context, `Custom bossbar [${bar.name}] has changed ${field}`);
  }
  return fail(context, 'Usage: /bossbar (add|remove|list|get|set) ...');
}

/** Draw the boss bars a player sees and the sidebar objective (ui.renderCommandHud, when the page has one). */
export function hudModel(state, playerName = 'Player') {
  const bars = [...state.bossbars.entries()].filter(([, b]) => b.visible && b.players.has(playerName)).map(([id, b]) => ({ id, name: b.name, color: b.color, style: b.style, fraction: b.max ? Math.min(1, b.value / b.max) : 0 }));
  const sidebarObj = state.scoreboard.display.sidebar;
  const sidebar = sidebarObj ? {
    title: state.scoreboard.objectives.get(sidebarObj)?.displayName ?? sidebarObj,
    rows: [...(state.scoreboard.scores.get(sidebarObj) ?? new Map())].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, score]) => ({ name, score })),
  } : null;
  return { bars, sidebar };
}
function renderHud(context) {
  context.ui?.renderCommandHud?.(hudModel(stateOf(context), context.player?.name ?? 'Player'));
}

// --- /worldborder -------------------------------------------------------------------------------------------------

function cmdWorldborder(context, parts) {
  const state = stateOf(context); const b = state.border;
  const [, action] = parts;
  if (action === 'get') { const s = borderSize(state); return ok(context, `The world border is currently ${Math.round(s)} block(s) wide`, Math.round(s)); }
  if (action === 'center') {
    const x = parseCoordinate(parts[2], origin(context).x); const z = parseCoordinate(parts[3], origin(context).z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return fail(context, 'Usage: /worldborder center <pos>');
    if (x === b.centerX && z === b.centerZ) return fail(context, 'Nothing changed. The world border is already centered there');
    b.centerX = x; b.centerZ = z;
    return ok(context, `Set the center of the world border to ${x.toFixed(2)}, ${z.toFixed(2)}`);
  }
  if (action === 'set' || action === 'add') {
    const d = Number(parts[2]); const secs = parts[3] === undefined ? 0 : Number(parts[3]);
    if (!Number.isFinite(d) || !Number.isFinite(secs)) return fail(context, `Usage: /worldborder ${action} <distance> [<time>]`);
    const target = action === 'set' ? d : borderSize(state) + d;
    if (target < 1) return fail(context, 'Nothing changed. The world border cannot be smaller than 1 block wide');
    if (target > BORDER_DEFAULTS.size) return fail(context, `Nothing changed. The world border cannot be bigger than ${BORDER_DEFAULTS.size} blocks wide`);
    if (secs > 0) { b.from = borderSize(state); b.to = target; b.lerpLeft = secs; b.lerpTotal = secs; return ok(context, `${target < b.from ? 'Shrinking' : 'Growing'} the world border to ${target} blocks wide over ${secs} seconds`); }
    b.size = target; b.from = null; b.lerpLeft = 0;
    return ok(context, `Set the world border to ${target} block(s) wide`, target);
  }
  if (action === 'damage') {
    const v = Number(parts[3]); if (!Number.isFinite(v) || v < 0) return fail(context, 'Usage: /worldborder damage (amount <damagePerBlock>|buffer <distance>)');
    if (parts[2] === 'amount') { b.damage = v; return ok(context, `Set the world border damage to ${v} per block each second`); }
    if (parts[2] === 'buffer') { b.buffer = v; return ok(context, `Set the world border damage buffer to ${v} block(s)`); }
  }
  if (action === 'warning') {
    const v = Number(parts[3]); if (!Number.isFinite(v) || v < 0) return fail(context, 'Usage: /worldborder warning (distance|time) <value>');
    if (parts[2] === 'distance') { b.warningDistance = v; return ok(context, `Set the world border warning distance to ${v} block(s)`); }
    if (parts[2] === 'time') { b.warningTime = v; return ok(context, `Set the world border warning time to ${v} second(s)`); }
  }
  return fail(context, 'Usage: /worldborder (add|center|damage|get|set|warning) ...');
}

// --- /tick --------------------------------------------------------------------------------------------------------

function cmdTick(context, parts) {
  const t = stateOf(context).tick;
  const [, action] = parts;
  if (action === 'query') return ok(context, t.frozen ? 'The game is frozen' : `The game is running normally. Target tick rate: ${t.rate} per second`, t.rate);
  if (action === 'rate') {
    const r = Number(parts[2]);
    if (!Number.isFinite(r) || r < TICK_DEFAULTS.min || r > TICK_DEFAULTS.max) return fail(context, `The rate must be between ${TICK_DEFAULTS.min.toFixed(1)} and ${TICK_DEFAULTS.max.toFixed(1)}`);
    t.rate = r; return ok(context, `Set the target tick rate to ${r} per second`, Math.trunc(r));
  }
  if (action === 'freeze') { t.frozen = true; return ok(context, 'The game is frozen'); }
  if (action === 'unfreeze') { t.frozen = false; t.stepTicks = 0; return ok(context, 'The game is running normally'); }
  if (action === 'step') {
    if (parts[2] === 'stop') { t.stepTicks = 0; return ok(context, 'Stepping stopped'); }
    if (!t.frozen) return fail(context, 'Can\'t step when the game is not frozen');
    const n = parts[2] === undefined ? 1 : parseTimeArgument(parts[2]);
    if (!Number.isFinite(n) || n < 1) return fail(context, 'Usage: /tick step [<time>|stop]');
    t.stepTicks = n; return ok(context, `Stepping ${n} tick(s)`, n);
  }
  if (action === 'sprint') {
    if (parts[2] === 'stop') { t.sprintTicks = 0; return ok(context, 'Sprint stopped'); }
    const n = parts[2] === undefined ? 1 : parseTimeArgument(parts[2]);
    if (!Number.isFinite(n) || n < 1) return fail(context, 'Usage: /tick sprint [<time>|stop]');
    t.sprintTicks = n; return ok(context, `Sprinting ${n} tick(s)`, n);
  }
  return fail(context, 'Usage: /tick (query|rate <rate>|freeze|unfreeze|step [<time>|stop]|sprint [<time>|stop])');
}

// --- /forceload, /fillbiome ---------------------------------------------------------------------------------------

function cmdForceload(context, parts) {
  const forced = stateOf(context).forced; const o = origin(context);
  const [, action] = parts;
  const chunkRange = (at) => {
    const x0 = parseCoordinate(parts[at], o.x); const z0 = parseCoordinate(parts[at + 1], o.z);
    const x1 = parts[at + 2] !== undefined ? parseCoordinate(parts[at + 2], o.x) : x0; const z1 = parts[at + 3] !== undefined ? parseCoordinate(parts[at + 3], o.z) : z0;
    if (![x0, z0, x1, z1].every(Number.isFinite)) return null;
    const keys = [];
    for (let cx = Math.floor(Math.min(x0, x1) / 16); cx <= Math.floor(Math.max(x0, x1) / 16); cx++) for (let cz = Math.floor(Math.min(z0, z1) / 16); cz <= Math.floor(Math.max(z0, z1) / 16); cz++) keys.push(`${cx},${cz}`);
    return keys;
  };
  if (action === 'query') {
    if (parts[2] === undefined) return ok(context, forced.size ? `There are ${forced.size} force loaded chunk(s) in minecraft:overworld at: ${[...forced].map((k) => `[${k}]`).join(', ')}` : 'No force loaded chunks were found in minecraft:overworld', forced.size);
    const keys = chunkRange(2); if (!keys) return fail(context, 'Usage: /forceload query [<pos>]');
    return forced.has(keys[0]) ? ok(context, `Chunk at [${keys[0]}] in minecraft:overworld is marked for force loading`) : fail(context, `Chunk at [${keys[0]}] in minecraft:overworld is not marked for force loading`);
  }
  if (action === 'remove' && parts[2] === 'all') { const n = forced.size; forced.clear(); return ok(context, 'Unmarked all force loaded chunks in minecraft:overworld', n); }
  if (action === 'add' || action === 'remove') {
    const keys = chunkRange(2); if (!keys) return fail(context, `Usage: /forceload ${action} <from> [<to>]`);
    if (keys.length > 256) return fail(context, `Too many chunks in the specified area (maximum 256, specified ${keys.length})`);
    let n = 0;
    for (const k of keys) { if (action === 'add' ? !forced.has(k) && forced.add(k) : forced.delete(k)) n++; }
    if (!n) return fail(context, action === 'add' ? `No chunks were marked for force loading` : 'No chunks were removed from force loading');
    return ok(context, n === 1 ? `Marked chunk ${keys[0]} in minecraft:overworld to be force loaded` : `Marked ${n} chunks in minecraft:overworld to be force ${action === 'add' ? 'loaded' : 'unloaded'}`, n);
  }
  return fail(context, 'Usage: /forceload (add|remove|query) ...');
}

function cmdFillbiome(context, parts) {
  const world = context.world;
  if (!world) return fail(context, 'The world is not available in this session.');
  const a = position(context, parts, 1); const b = position(context, parts, 4); const biome = stripNs(parts[7]);
  if (!a || !b || !biome) return fail(context, 'Usage: /fillbiome <from> <to> <biome> [replace <filter>]');
  const filter = parts[8] === 'replace' ? stripNs(parts[9]) : null;
  // Biomes are stored per 4x4x4 cell; this world keeps one per column, so the fill is per column.
  const volume = (Math.abs(a.x - b.x) + 1) * (Math.abs(a.y - b.y) + 1) * (Math.abs(a.z - b.z) + 1);
  const limit = context.game?.gamerules?.commandModificationBlockLimit ?? GAMERULE_DEFAULTS.commandModificationBlockLimit;
  if (volume > limit) return fail(context, `Too many blocks in the specified volume (maximum ${limit}, specified ${volume})`);
  world.biomeOverrides ??= new Map();
  let n = 0;
  for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) for (let z = Math.min(a.z, b.z); z <= Math.max(a.z, b.z); z++) {
    if (filter && world.getBiome?.(x, z) !== filter) continue;
    world.biomeOverrides.set(`${x},${z}`, biome); n++;
  }
  return ok(context, `${n * (Math.abs(a.y - b.y) + 1)} biome entry/entries set between ${a.x}, ${a.y}, ${a.z} and ${b.x}, ${b.y}, ${b.z}`, n);
}

// --- /item --------------------------------------------------------------------------------------------------------

/** A slot name (Slot page) on the player: hotbar.N, inventory.N, armor.head|chest|legs|feet, weapon(.mainhand|.offhand), container.N. */
function playerSlot(inv, slot) {
  const m = /^(hotbar|inventory|container)\.(\d+)$/.exec(slot);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === 'hotbar' && n < 9) return { get: () => inv.hotbar[n], set: (v) => { inv.hotbar[n] = v; } };
    if (m[1] === 'inventory' && n < 27) return { get: () => inv.storage[n], set: (v) => { inv.storage[n] = v; } };
    if (m[1] === 'container' && n < 36) return n < 9 ? playerSlot(inv, `hotbar.${n}`) : playerSlot(inv, `inventory.${n - 9}`);
  }
  const armour = /^armor\.(head|chest|legs|feet)$/.exec(slot);
  if (armour && inv.armor) return { get: () => inv.armor[armour[1]], set: (v) => { inv.armor[armour[1]] = v; } };
  if (slot === 'weapon' || slot === 'weapon.mainhand') return { get: () => inv.hotbar[inv.activeSlot ?? 0], set: (v) => { inv.hotbar[inv.activeSlot ?? 0] = v; } };
  if (slot === 'weapon.offhand') return { get: () => inv.offhand, set: (v) => { inv.offhand = v; } };
  return null;
}

function cmdItem(context, parts) {
  const [, action, kind] = parts;
  const width = kind === 'block' ? 3 : 1;
  const slotAt = 3 + width;
  const resolveSlot = (k, args, slot) => {
    if (k === 'entity') { const r = targets(context, args[0]); if (!r.ok || !r.entities[0].isPlayerEntity) return null; return playerSlot(context.inventory, slot); }
    const p = position(context, args, 0); const chest = p && context.game?.chestManager?.getChest?.(p.x, p.y, p.z);
    const n = Number(/^container\.(\d+)$/.exec(slot)?.[1]);
    return chest && Number.isInteger(n) && n < chest.items.length ? { get: () => chest.items[n], set: (v) => { chest.items[n] = v; } } : null;
  };
  const target = resolveSlot(kind, parts.slice(3), parts[slotAt]);
  if (!target) return fail(context, kind === 'block' ? 'Target position is not a container' : `Unknown slot or target`);
  if (action === 'replace') {
    if (parts[slotAt + 1] === 'with') {
      const r = resolveItem(parts[slotAt + 2] ?? ''); if (!r.ok) return fail(context, `Unknown item '${parts[slotAt + 2]}'`);
      const count = parts[slotAt + 3] === undefined ? 1 : Number(parts[slotAt + 3]);
      if (!Number.isInteger(count) || count < 0 || count > 99) return fail(context, 'The count must be between 0 and 99');
      target.set(count ? { id: r.id, isBlock: r.isBlock, count } : null);
    } else if (parts[slotAt + 1] === 'from') {
      const k = parts[slotAt + 2]; const w = k === 'block' ? 3 : 1;
      const source = resolveSlot(k, parts.slice(slotAt + 3), parts[slotAt + 3 + w]);
      if (!source) return fail(context, 'Unknown source slot');
      target.set(source.get() ? { ...source.get() } : null);
    } else return fail(context, 'Usage: /item replace (entity|block) ... <slot> (with <item> [<count>]|from ...)');
    context.ui?.updateHotbar?.();
    return ok(context, `Replaced a slot on ${kind === 'block' ? `${parts[3]}, ${parts[4]}, ${parts[5]}` : 'Player'} with ${target.get()?.id ?? 'air'}`);
  }
  if (action === 'modify') {
    const modifierId = nsId(parts[slotAt + 1] ?? '');
    const modifier = packItemModifiers(context.game?.dataPacks).get(modifierId);
    if (!modifier) return fail(context, `Unknown item modifier '${parts[slotAt + 1]}'`);
    const item = target.get(); if (!item) return fail(context, 'The source slot is empty');
    target.set(applyItemModifier(item, modifier));
    context.ui?.updateHotbar?.();
    return ok(context, `Applied modifier to item`);
  }
  return fail(context, 'Usage: /item (replace|modify) (entity|block) ...');
}

/** Item modifiers the packs carry (data/<ns>/item_modifier/*.json). */
function packItemModifiers(store) {
  const out = new Map();
  for (const pack of enabledPacks(store)) for (const [path, content] of Object.entries(pack.files ?? {})) {
    const m = /data\/([^/]+)\/item_modifiers?\/(.+)\.json$/.exec(path.replace(/\\/g, '/'));
    if (m) { try { out.set(`${m[1]}:${m[2]}`, typeof content === 'string' ? JSON.parse(content) : content); } catch { /* skipped */ } }
  }
  return out;
}
/** The item modifier functions a slot can take here: set_count, set_name, set_damage, set_enchantments. */
export function applyItemModifier(item, modifier) {
  const out = { ...item };
  for (const fn of Array.isArray(modifier) ? modifier : [modifier]) {
    const f = stripNs(fn.function);
    const num = (v) => (typeof v === 'number' ? v : v?.min !== undefined ? v.min : Number(v?.value ?? 1));
    if (f === 'set_count') out.count = Math.max(0, fn.add ? out.count + num(fn.count) : num(fn.count));
    else if (f === 'set_name') out.customName = jsonText(JSON.stringify(fn.name));
    else if (f === 'set_damage') out.damage = num(fn.damage);
    else if (f === 'set_enchantments') out.enchantments = Object.entries(fn.enchantments ?? {}).map(([id, level]) => ({ id: stripNs(id), level: num(level) }));
  }
  return out;
}

// --- /loot --------------------------------------------------------------------------------------------------------

function cmdLoot(context, parts) {
  // Target: give <players> | insert <pos> | spawn <pos> | replace ...
  const kind = parts[1]; let at = 2; let targetSpec;
  if (kind === 'give') { targetSpec = { kind, who: parts[2] }; at = 3; }
  else if (kind === 'spawn' || kind === 'insert') { const p = position(context, parts, 2); if (!p) return fail(context, `Usage: /loot ${kind} <pos> <source>`); targetSpec = { kind, pos: p }; at = 5; }
  else if (kind === 'replace') { const k = parts[2]; const w = k === 'block' ? 3 : 1; targetSpec = { kind, k, args: parts.slice(3, 3 + w), slot: parts[3 + w] }; at = 4 + w; }
  else return fail(context, 'Usage: /loot (give|insert|spawn|replace) ... (loot|kill|mine|fish) ...');
  // Source.
  const source = parts[at]; let drops = [];
  if (source === 'loot' || source === 'fish') {
    const table = nsId(parts[at + 1]);
    if (!hasStructureLoot(table) && !/chests\/village/.test(table)) return fail(context, `Unknown loot table '${parts[at + 1]}'`);
    drops = rollStructureLoot(table, Math.floor(Math.random() * 2 ** 31)).filter(Boolean).map((s) => ({ id: s.id, isBlock: Boolean(s.isBlock), count: s.count ?? 1 }));
  } else if (source === 'kill') {
    const r = targets(context, parts[at + 1]); if (!r.ok) return fail(context, r.reason);
    const mob = r.entities[0];
    if (mob.isPlayerEntity) return fail(context, 'A player has no loot table to roll');
    drops = (context.mobs?.getMobDeathDrops?.(mob) ?? []).map(([id, isBlock, min, max]) => ({ id, isBlock, count: min + Math.floor(Math.random() * (max - min + 1)) })).filter((d) => d.count > 0);
  } else if (source === 'mine') {
    const p = position(context, parts, at + 1); if (!p) return fail(context, 'Usage: /loot ... mine <pos> [<tool>|mainhand|offhand]');
    const id = context.world?.getVoxel?.(p.x, p.y, p.z) ?? 0;
    const tool = parts[at + 4] === 'mainhand' ? context.inventory?.getActiveItem?.() : parts[at + 4] ? resolveItem(parts[at + 4]) : null;
    drops = harvestDrops(id, { toolId: tool && !tool.isBlock ? tool.id : null });
  } else return fail(context, `Unknown loot source '${source}'`);
  // Deliver.
  const total = drops.reduce((n, d) => n + (d.count ?? 1), 0);
  if (targetSpec.kind === 'give') {
    const r = targets(context, targetSpec.who); if (!r.ok) return fail(context, r.reason);
    for (const d of drops) context.inventory?.addItem?.(d.id, d.isBlock, d.count);
    context.ui?.updateHotbar?.();
  } else if (targetSpec.kind === 'spawn') {
    for (const d of drops) context.entities?.spawnDroppedItem?.(context.Vector3 ? new context.Vector3(targetSpec.pos.x + 0.5, targetSpec.pos.y + 0.5, targetSpec.pos.z + 0.5) : { x: targetSpec.pos.x + 0.5, y: targetSpec.pos.y + 0.5, z: targetSpec.pos.z + 0.5 }, d.id, d.isBlock, d.count);
  } else if (targetSpec.kind === 'insert') {
    const chest = context.game?.chestManager?.getChest?.(targetSpec.pos.x, targetSpec.pos.y, targetSpec.pos.z);
    if (!chest) return fail(context, 'Target position is not a container');
    for (const d of drops) { const i = chest.items.findIndex((s) => !s); if (i >= 0) chest.items[i] = { ...d }; }
  } else {
    const slot = targetSpec.k === 'entity' ? playerSlot(context.inventory, targetSpec.slot) : null;
    if (!slot) return fail(context, 'Unknown slot or target');
    slot.set(drops[0] ? { ...drops[0] } : null);
  }
  return ok(context, `Dropped ${total} item(s)`, total);
}

// --- /place -------------------------------------------------------------------------------------------------------

/** /place feature takes the trees the world generator grows (Feature page: the configured tree features). */
const TREE_FEATURES = { oak: 'oak', fancy_oak: 'oak', birch: 'birch', super_birch_bees: 'birch', spruce: 'spruce', pine: 'spruce', mega_spruce: 'spruce', jungle_tree: 'jungle', mega_jungle_tree: 'jungle', dark_oak: 'dark_oak', acacia: 'acacia', mangrove: 'mangrove', tall_mangrove: 'mangrove', cherry: 'cherry', pale_oak: 'pale_oak' };
/** /place jigsaw pools, as the structure each pool starts. */
const JIGSAW_POOLS = { 'village/plains': 'village_plains', 'village/desert': 'village_desert', 'village/savanna': 'village_savanna', 'village/snowy': 'village_snowy', 'village/taiga': 'village_taiga', 'bastion': 'bastion_remnant', 'pillager_outpost': 'pillager_outpost', 'trail_ruins': 'trail_ruins', 'trial_chambers': 'trial_chambers', 'ancient_city': 'ancient_city' };

function cmdPlace(context, parts) {
  const [, kind, raw] = parts;
  const id = stripNs(raw ?? '');
  if (kind === 'feature') {
    const p = parts[3] !== undefined ? position(context, parts, 3) : position(context, ['~', '~', '~'], 0);
    const tree = TREE_FEATURES[id];
    if (!tree) return fail(context, `Unknown feature '${raw}' (this game places the tree features: ${Object.keys(TREE_FEATURES).join(', ')})`);
    const world = context.world; const chunk = world?.getOrCreateChunk?.(Math.floor(p.x / 16), Math.floor(p.z / 16));
    if (!chunk || !world.generateTree) return fail(context, 'Failed to place feature');
    world.generateTree(chunk, ((p.x % 16) + 16) % 16, p.y, ((p.z % 16) + 16) % 16, tree);
    context.game?.rebuildChunkMesh?.(chunk); world.invalidateChunkCache?.();
    return ok(context, `Placed feature "${nsId(id)}" at ${p.x}, ${p.y}, ${p.z}`);
  }
  if (kind === 'structure' || kind === 'jigsaw') {
    const structureId = kind === 'jigsaw' ? Object.entries(JIGSAW_POOLS).find(([pool]) => id.startsWith(pool))?.[1] : id;
    if (!structureId) return fail(context, `Unknown template pool '${raw}'`);
    const posAt = kind === 'jigsaw' ? 5 : 3;
    const p = parts[posAt] !== undefined ? position(context, parts, posAt) : position(context, ['~', '~', '~'], 0);
    const placed = context.game?.placeStructureAt?.(structureId, p.x, p.z);
    if (!placed?.ok) return fail(context, placed?.reason ?? 'Failed to place structure');
    return ok(context, kind === 'jigsaw' ? `Jigsaw generated at ${p.x}, ${p.y}, ${p.z}` : `Generated structure "${nsId(structureId)}" at ${p.x}, ${p.y}, ${p.z}`);
  }
  if (kind === 'template') {
    const p = parts[3] !== undefined ? position(context, parts, 3) : position(context, ['~', '~', '~'], 0);
    const placed = context.game?.placeTemplateAt?.(nsId(id), p);
    if (!placed?.ok) return fail(context, placed?.reason ?? `Template not found: ${raw}`);
    return ok(context, `Structure ${nsId(id)} loaded at ${p.x}, ${p.y}, ${p.z}`);
  }
  return fail(context, 'Usage: /place (feature|jigsaw|structure|template) ...');
}

// --- /particle, /playsound, /stopsound ----------------------------------------------------------------------------

/** A colour per particle family, for the game's particle bursts. */
function particleColour(id) {
  if (/flame|lava|fire/.test(id)) return 0xff8a1e; if (/soul/.test(id)) return 0x3fd0d4; if (/heart/.test(id)) return 0xff3355;
  if (/smoke|ash|poof|cloud/.test(id)) return 0x9a9a9a; if (/happy_villager|composter|spore|glow|sculk/.test(id)) return 0x4cd964;
  if (/angry|crit|damage/.test(id)) return 0xd94c4c; if (/portal|witch|dragon|reverse_portal|enchant/.test(id)) return 0xb05cff;
  if (/bubble|splash|rain|drip_water|dolphin|nautilus|fishing/.test(id)) return 0x5aa0ff; if (/note/.test(id)) return 0xffd23f;
  if (/snow|white|end_rod|firework|flash/.test(id)) return 0xffffff; return 0xcccccc;
}
function cmdParticle(context, parts) {
  const id = stripNs(parts[1] ?? '').replace(/\{.*$/, '');
  if (!WIKI_PARTICLES.includes(id)) return fail(context, `Unknown particle: ${parts[1]}`);
  const p = parts[2] !== undefined ? position(context, parts, 2) : position(context, ['~', '~', '~'], 0);
  if (!p) return fail(context, 'Usage: /particle <name> [<pos>] [<delta>] [<speed>] [<count>]');
  const count = Math.max(1, Math.min(200, Number(parts[9] ?? 8) || 8));
  const at = context.Vector3 ? new context.Vector3(p.x + 0.5, p.y + 0.5, p.z + 0.5) : { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 };
  context.mobs?.spawnParticleBurst?.(at, particleColour(id), count);
  return ok(context, `Displaying particle ${id}`, count);
}

/** Sound event ids (the Sounds.json page's names) mapped to the game's own sounds, by family. */
const SOUND_FAMILIES = [
  [/^ui\.button\.click$/, (s) => s.playClick?.()], [/^entity\.player\.levelup$/, (s) => s.playLevelUp?.()], [/^entity\.experience_orb\.pickup$|^entity\.item\.pickup$/, (s) => s.playPop?.()],
  [/explode|explosion/, (s) => s.playExplosion?.()], [/thunder/, (s) => s.playThunder?.()], [/^entity\.generic\.eat$|\.eat$/, (s) => s.playEat?.()],
  [/^block\.([a-z_]+)\.break$/, (s, m) => s.playBreak?.(soundGroup(m[1]))], [/^block\.([a-z_]+)\.place$/, (s, m) => s.playPlace?.(soundGroup(m[1]))], [/^block\.([a-z_]+)\.step$/, (s, m) => s.playStep?.(soundGroup(m[1]))],
  [/door\.open/, (s) => s.playDoor?.(true)], [/door\.close/, (s) => s.playDoor?.(false)], [/chest\.open/, (s) => s.playChestOpen?.()], [/chest\.close/, (s) => s.playChestClose?.()],
  [/^entity\.(zombie|husk|drowned)\./, (s) => s.playZombie?.()], [/^entity\.cow\./, (s) => s.playCow?.()], [/^entity\.sheep\./, (s) => s.playSheep?.()], [/^entity\.chicken\./, (s) => s.playChicken?.()],
  [/^entity\.pig\./, (s) => s.playPig?.()], [/^entity\.villager\./, (s) => s.playVillager?.()], [/^entity\.wolf\./, (s) => s.playWolf?.()], [/^entity\.cat\./, (s) => s.playCat?.()],
  [/^entity\.ghast\./, (s) => s.playGhast?.()], [/^entity\.enderman\.teleport/, (s) => s.playEndermanTeleport?.()], [/^entity\.firework_rocket\.launch/, (s) => s.playFireworkLaunch?.()],
  [/^entity\.firework_rocket\.(blast|large_blast|twinkle)/, (s) => s.playFireworkExplode?.()], [/^event\.raid\.horn/, (s) => s.playRaidHorn?.()], [/^entity\.player\.hurt|\.hurt$/, (s) => s.playHurt?.()],
  [/^block\.note_block\./, (s) => s.playTone?.(440, 0.2)], [/^entity\.generic\.splash|^entity\.player\.splash/, (s) => s.playSplash?.()],
];
const soundGroup = (block) => (/stone|deepslate|ore|brick|tuff/.test(block) ? 'stone' : /wood|log|plank|bamboo/.test(block) ? 'wood' : /grass|leaves|moss/.test(block) ? 'grass' : /sand/.test(block) ? 'sand' : /gravel/.test(block) ? 'gravel' : /glass/.test(block) ? 'glass' : /wool/.test(block) ? 'wool' : /snow/.test(block) ? 'snow' : 'stone');
const SOUND_SOURCES = ['master', 'music', 'record', 'weather', 'block', 'hostile', 'neutral', 'player', 'ambient', 'voice', 'ui'];

function cmdPlaysound(context, parts) {
  const sound = stripNs(parts[1] ?? '');
  if (!/^[a-z0-9_.]+$/.test(sound)) return fail(context, 'Usage: /playsound <sound> [<source>] [<targets>] [<pos>] [<volume>] [<pitch>] [<minVolume>]');
  if (parts[2] && !SOUND_SOURCES.includes(parts[2])) return fail(context, `Unknown sound source '${parts[2]}'`);
  const r = targets(context, parts[3] ?? '@s'); if (!r.ok) return fail(context, r.reason);
  if (!r.entities.some((e) => e.isPlayerEntity)) return fail(context, 'The sound is too far away to be heard');
  // "Any resource location is accepted": a sound with no matching sound plays nothing, as an unknown event does in Java.
  const hit = SOUND_FAMILIES.find(([re]) => re.test(sound));
  if (hit && context.game?.sounds) hit[1](context.game.sounds, hit[0].exec(sound));
  return ok(context, `Played sound ${nsId(sound)} to ${entityName(r.entities[0])}`);
}
function cmdStopsound(context, parts) {
  const r = targets(context, parts[1] ?? '@s'); if (!r.ok) return fail(context, r.reason);
  if (parts[2] && parts[2] !== '*' && !SOUND_SOURCES.includes(parts[2])) return fail(context, `Unknown sound source '${parts[2]}'`);
  context.game?.sounds?.stopAll?.();
  return ok(context, parts[3] ? `Stopped sound '${nsId(parts[3])}'${parts[2] ? ` on source '${parts[2]}'` : ''}` : parts[2] && parts[2] !== '*' ? `Stopped all '${parts[2]}' sounds` : 'Stopped all sounds');
}

// --- /recipe, /advancement ----------------------------------------------------------------------------------------

/** Every recipe id: its result's id (a crafting recipe in this game is known by what it makes). */
export function recipeIdOf(result) {
  const id = result?.id;
  return nsId(typeof id === 'number' ? String(BLOCK_DEFS[id]?.name ?? id).toLowerCase().replace(/[^a-z0-9]+/g, '_') : id);
}
export function allRecipeIds(recipeLists) {
  const ids = new Set();
  for (const list of recipeLists) for (const r of list) if (r?.result) ids.add(recipeIdOf(r.result));
  return ids;
}
function cmdRecipe(context, parts) {
  const [, action, who, recipe] = parts;
  if (!['give', 'take'].includes(action) || !recipe) return fail(context, 'Usage: /recipe (give|take) <targets> (<recipe>|*)');
  const r = targets(context, who); if (!r.ok) return fail(context, r.reason);
  const player = r.entities.find((e) => e.isPlayerEntity); if (!player) return fail(context, 'Only players can have recipes');
  const known = player.knownRecipes ??= new Set();
  const universe = context.recipeIds?.() ?? new Set();
  const ids = recipe === '*' ? [...universe] : [nsId(recipe)];
  if (recipe !== '*' && universe.size && !universe.has(ids[0])) return fail(context, `Unknown recipe '${recipe}'`);
  let n = 0;
  for (const id of ids) { if (action === 'give' ? !known.has(id) && known.add(id) : known.delete(id)) n++; }
  if (!n) return fail(context, action === 'give' ? 'No new recipes were learned' : 'No recipes could be forgotten');
  return ok(context, action === 'give' ? `Unlocked ${n} recipe(s) for ${entityName(player)}` : `Took ${n} recipe(s) from ${entityName(player)}`, n);
}

const ADVANCEMENT_BY_ID = new Map(WIKI_ADVANCEMENTS.map((a) => [`minecraft:${a.id}`, a]));
const ADVANCEMENT_BY_TITLE = new Map(WIKI_ADVANCEMENTS.map((a) => [a.title, a]));
/** An advancement's ancestors (by its parent title), root first. */
function ancestors(a) { const out = []; let p = a; while (p?.parent && ADVANCEMENT_BY_TITLE.get(p.parent)) { p = ADVANCEMENT_BY_TITLE.get(p.parent); out.unshift(p); } return out; }
function descendants(a) { const out = []; const walk = (x) => { for (const c of WIKI_ADVANCEMENTS.filter((y) => y.parent === x.title && y.id.split('/')[0] === x.id.split('/')[0])) { out.push(c); walk(c); } }; walk(a); return out; }

function cmdAdvancement(context, parts) {
  const [, action, who, mode, raw] = parts;
  if (!['grant', 'revoke'].includes(action)) return fail(context, 'Usage: /advancement (grant|revoke) <targets> (everything|only|from|through|until) [<advancement>]');
  const r = targets(context, who); if (!r.ok) return fail(context, r.reason);
  const player = r.entities.find((e) => e.isPlayerEntity); if (!player) return fail(context, 'Only players have advancements');
  let list;
  if (mode === 'everything') list = WIKI_ADVANCEMENTS;
  else {
    const a = ADVANCEMENT_BY_ID.get(nsId(raw ?? ''));
    if (!a) return fail(context, `Unknown advancement '${raw}'`);
    list = mode === 'only' ? [a] : mode === 'from' ? [a, ...descendants(a)] : mode === 'until' ? [...ancestors(a), a] : mode === 'through' ? [...ancestors(a), a, ...descendants(a)] : null;
    if (!list) return fail(context, `Unknown mode '${mode}'`);
  }
  const done = player.advancements ??= new Set();
  const changed = list.filter((a) => (action === 'grant' ? !done.has(a.id) && (done.add(a.id), true) : done.delete(a.id)));
  if (!changed.length) return fail(context, action === 'grant' ? `Couldn't grant advancement(s) to ${entityName(player)} as they already have them` : `Couldn't revoke advancement(s) from ${entityName(player)} as they don't have them`);
  if (action === 'grant') for (const a of changed.slice(0, 5)) say(context, `${entityName(player)} has made the advancement [${a.title}]`, 'chat');
  return ok(context, changed.length === 1 ? `${action === 'grant' ? 'Granted' : 'Revoked'} the advancement [${changed[0].title}] ${action === 'grant' ? 'to' : 'from'} ${entityName(player)}` : `${action === 'grant' ? 'Granted' : 'Revoked'} ${changed.length} advancements ${action === 'grant' ? 'to' : 'from'} ${entityName(player)}`, changed.length);
}

// --- /spectate, /kick ---------------------------------------------------------------------------------------------

function cmdSpectate(context, parts) {
  const player = context.player;
  if (!player) return fail(context, 'The player is not available in this session.');
  if (player.gamemode !== 'spectator') return fail(context, 'Player is not in spectator mode');
  if (!parts[1]) { const was = player.spectating; player.spectating = null; return was ? ok(context, 'Stopped spectating entity') : fail(context, 'Not spectating anything'); }
  const r = targets(context, parts[1]); if (!r.ok) return fail(context, r.reason);
  const target = r.entities[0];
  if (target === player) return fail(context, 'Cannot spectate yourself');
  player.spectating = target;
  return ok(context, `Now spectating ${entityName(target)}`);
}

function cmdKick(context, parts) {
  const r = targets(context, parts[1]); if (!r.ok) return fail(context, r.reason);
  if (!r.entities.some((e) => e.isPlayerEntity)) return fail(context, 'Only players can be kicked');
  // In a single-player world the only player is the owner, and Java refuses: "Cannot kick an owner of singleplayer game".
  if (!context.game?.multiplayer) return fail(context, 'Cannot kick an owner of singleplayer game');
  context.game?.disconnectPlayer?.(rest(parts, 2) || 'Kicked by an operator');
  return ok(context, `Kicked ${entityName(r.entities[0])}: ${rest(parts, 2) || 'Kicked by an operator'}`);
}

// --- /debug, /jfr -------------------------------------------------------------------------------------------------

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
function cmdDebug(context, parts) {
  const state = stateOf(context); const p = state.profiler;
  if (parts[1] === 'start') {
    if (p.debug) return fail(context, 'Can\'t start profiling; profiler is already started');
    p.debug = { started: now(), ticks: state.gameTicks };
    return ok(context, 'Started the debug profiler');
  }
  if (parts[1] === 'stop') {
    if (!p.debug) return fail(context, 'Can\'t stop profiling; profiler is not started');
    const secs = (now() - p.debug.started) / 1000; const ticks = state.gameTicks - p.debug.ticks; p.debug = null;
    return ok(context, `Stopped tick profiling after ${secs.toFixed(2)} second(s) and ${ticks} tick(s) (${(secs > 0 ? ticks / secs : 0).toFixed(2)} tick(s) per second)`, ticks);
  }
  if (parts[1] === 'function') {
    const r = resolveFunctions(context, parts[2] ?? ''); if (!r.ok) return fail(context, r.reason);
    p.debugFunction = [];
    let total = 0; for (const id of r.ids) total += runFunction(context, id, r.functions).commands ?? 0;
    const trace = p.debugFunction; p.debugFunction = null;
    for (const line of trace.slice(0, 50)) say(context, line);
    return ok(context, `Traced ${total} command(s) from function ${parts[2]}`, total);
  }
  return fail(context, 'Usage: /debug (start|stop|function <name>)');
}
function cmdJfr(context, parts) {
  const state = stateOf(context); const p = state.profiler;
  // The browser's performance timeline stands in for the JVM's flight recorder.
  if (parts[1] === 'start') { if (p.jfr) return fail(context, 'JFR profiling is already running'); p.jfr = { started: now(), frames: [], ticks: state.gameTicks }; return ok(context, 'Started JFR profiling'); }
  if (parts[1] === 'stop') {
    if (!p.jfr) return fail(context, 'JFR profiling has not started');
    const record = { durationMs: now() - p.jfr.started, ticks: state.gameTicks - p.jfr.ticks, frames: p.jfr.frames.length, averageFrameMs: p.jfr.frames.length ? p.jfr.frames.reduce((a, b) => a + b, 0) / p.jfr.frames.length : 0 };
    p.jfr = null; state.lastJfr = record;
    context.ui?.offerDownload?.('debug-profile.json', JSON.stringify(record, null, 1));
    return ok(context, `Profiling ended and dumped to debug-profile.json (${record.ticks} ticks, ${record.frames} frames)`);
  }
  return fail(context, 'Usage: /jfr (start|stop)');
}

// --- the rows and the dispatcher ----------------------------------------------------------------------------------

export function runAdvancedCommand(context, root, parts) {
  switch (root) {
    case '/scoreboard': return cmdScoreboard(context, parts);
    case '/trigger': return cmdTrigger(context, parts);
    case '/tag': return cmdTag(context, parts);
    case '/team': return cmdTeam(context, parts);
    case '/teammsg': case '/tm': return cmdTeamMsg(context, parts);
    case '/execute': return cmdExecute(context, parts);
    case '/function': return cmdFunction(context, parts);
    case '/schedule': return cmdSchedule(context, parts);
    case '/return': return cmdReturn(context, parts);
    case '/reload': return cmdReload(context);
    case '/datapack': return cmdDatapack(context, parts);
    case '/data': return cmdData(context, parts);
    case '/attribute': return cmdAttribute(context, parts);
    case '/bossbar': return cmdBossbar(context, parts);
    case '/worldborder': return cmdWorldborder(context, parts);
    case '/tick': return cmdTick(context, parts);
    case '/forceload': return cmdForceload(context, parts);
    case '/fillbiome': return cmdFillbiome(context, parts);
    case '/item': return cmdItem(context, parts);
    case '/loot': return cmdLoot(context, parts);
    case '/place': return cmdPlace(context, parts);
    case '/particle': return cmdParticle(context, parts);
    case '/playsound': return cmdPlaysound(context, parts);
    case '/stopsound': return cmdStopsound(context, parts);
    case '/recipe': return cmdRecipe(context, parts);
    case '/advancement': return cmdAdvancement(context, parts);
    case '/spectate': return cmdSpectate(context, parts);
    case '/kick': return cmdKick(context, parts);
    case '/debug': return cmdDebug(context, parts);
    case '/jfr': return cmdJfr(context, parts);
    default: return false;
  }
}
