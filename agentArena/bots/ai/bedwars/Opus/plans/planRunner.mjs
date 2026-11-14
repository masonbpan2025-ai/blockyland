// Plans: what a slow thinker (a model, thinker.mjs) decides, run by fast code every brain tick. A plan is JSON rules
// over general facts (facts.mjs) with general skills (../skills/skills.mjs) -- nothing in it names a game:
//
//   {
//     "intent": "loot home, then take the high middle before the refill; fight only with a sword",
//     "reflexes": { "fightWithin": 3.5 },          // a foe this close is fought whatever the rules say (0: never)
//     "rules": [
//       { "id": "flee-hurt", "when": { "all": [ { "fact": "me.health", "op": "<", "value": 7 },
//                                               { "fact": "enemies.nearest", "op": "<", "value": 6 } ] },
//         "do": "flee", "target": { "enemy": "nearest" } },
//       { "id": "home-chests", "when": { "fact": "chest.mine.open", "op": ">", "value": 0 },
//         "do": "loot", "target": { "objective": "chest", "relation": "mine", "pick": "nearest" } },
//       { "id": "high-middle", "when": { "fact": "me.blocks", "op": ">=", "value": 8 },
//         "do": "loot", "target": { "objective": "chest", "relation": "neutral", "pick": "highest" }, "bridge": true }
//     ],
//     "otherwise": { "do": "default" }               // the scripted playbook decides
//   }
//
// Conditions: { fact, op: < <= > >= == !=, value | valueFact, plus }, { all: [...] }, { any: [...] }, { not: cond }, true.
// Actions (do): fight, shoot, throw, loot, collect, goTo, destroy, hide, flee, guard, follow, buy, wait, default.
// Targets: { enemy: nearest | weakest | highest | lowest }, { objective: kind, relation, where: { tag: value }, pick },
//   { place: kind, mine: true, pick }. pick: nearest | farthest | highest | lowest.
// `flee`/`hide` rules are tried before the reflex; a bridge is only attempted when the blocks on hand can pay for the
// void on the way, so a crossing you cannot afford falls through to the next rule instead of walking into the gap.
import { computeFacts, relationOf, isOpen } from './facts.mjs';

export const PLAN_ACTIONS = Object.freeze(['fight', 'shoot', 'throw', 'loot', 'collect', 'goTo', 'destroy', 'hide', 'flee', 'guard', 'follow', 'buy', 'wait', 'default']);
const OPS = Object.freeze(['<', '<=', '>', '>=', '==', '!=']);
const PICKS = Object.freeze(['nearest', 'farthest', 'highest', 'lowest', 'weakest']);
const MAX_RULES = 24;

// Small, safe spelling tolerances: a plan with "<=" written "=<" or "goTo" written "goto" is still the plan the model
// meant. Anything these do not cover is rejected and the model is asked once more with the error.
const OP_ALIASES = Object.freeze({ '=': '==', '===': '==', '=<': '<=', '=>': '>=', '!==': '!=', '≥': '>=', '≤': '<=' });
const DO_ALIASES = Object.freeze({
  goto: 'goTo', move: 'goTo', walk: 'goTo', travel: 'goTo', attack: 'fight', hit: 'fight', pvp: 'fight',
  retreat: 'flee', run: 'flee', gather: 'collect', pickup: 'collect', mine: 'destroy', break: 'destroy', follow: 'follow',
});

function normalizeCondition(c) {
  if (!c || typeof c !== 'object') return;
  if (Array.isArray(c.all)) { c.all.forEach(normalizeCondition); return; }
  if (Array.isArray(c.any)) { c.any.forEach(normalizeCondition); return; }
  if (c.not !== undefined) { normalizeCondition(c.not); return; }
  if (typeof c.fact === 'string') c.fact = c.fact.trim();
  if (typeof c.valueFact === 'string') c.valueFact = c.valueFact.trim();
  if (typeof c.op === 'string') { const op = c.op.trim(); c.op = OP_ALIASES[op] ?? op; }
  if (typeof c.value === 'string' && c.value.trim() !== '' && Number.isFinite(Number(c.value))) c.value = Number(c.value);
  if (typeof c.plus === 'string' && c.plus.trim() !== '' && Number.isFinite(Number(c.plus))) c.plus = Number(c.plus);
}

function normalizeTarget(t) {
  if (!t || typeof t !== 'object') return;
  for (const k of ['enemy', 'objective', 'place', 'relation', 'pick']) {
    if (typeof t[k] === 'string') t[k] = t[k].trim().toLowerCase();
  }
}

function normalizeAction(a) {
  if (!a || typeof a !== 'object') return;
  if (typeof a.do === 'string') {
    const lower = a.do.trim().toLowerCase();
    a.do = DO_ALIASES[lower] ?? lower;
  }
  if (typeof a.item === 'string') a.item = a.item.trim().toLowerCase();
  if (typeof a.count === 'string' && Number.isFinite(Number(a.count))) a.count = Number(a.count);
  normalizeTarget(a.target);
}

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
  if (Array.isArray(raw.rules)) for (const r of raw.rules) {
    if (!r || typeof r !== 'object') continue;
    normalizeCondition(r.when);
    normalizeAction(r);
  }
  normalizeAction(raw.otherwise);
  const fw = raw.reflexes?.fightWithin;
  if (typeof fw === 'string' && fw.trim() !== '' && Number.isFinite(Number(fw))) raw.reflexes.fightWithin = Number(fw);
}

// --- checking a plan -------------------------------------------------------------------------------------------------

function checkCondition(c, path, errors, depth = 0) {
  if (depth > 6) { errors.push(`${path}: nested too deep`); return; }
  if (c === true || c === undefined) return;
  if (!c || typeof c !== 'object') { errors.push(`${path}: not a condition`); return; }
  if (Array.isArray(c.all) || Array.isArray(c.any)) {
    const list = c.all ?? c.any;
    if (!list.length) errors.push(`${path}: an empty ${c.all ? 'all' : 'any'}`);
    list.forEach((x, i) => checkCondition(x, `${path}.${c.all ? 'all' : 'any'}[${i}]`, errors, depth + 1));
    return;
  }
  if (c.not !== undefined) { checkCondition(c.not, `${path}.not`, errors, depth + 1); return; }
  if (typeof c.fact !== 'string' || !/^[a-z0-9_.]{1,64}$/i.test(c.fact)) errors.push(`${path}: "fact" must be a fact's name`);
  if (!OPS.includes(c.op)) errors.push(`${path}: "op" must be one of ${OPS.join(' ')}`);
  const hasValue = typeof c.value === 'number' || typeof c.value === 'boolean';
  const hasFact = typeof c.valueFact === 'string' && /^[a-z0-9_.]{1,64}$/i.test(c.valueFact);
  if (!hasValue && !hasFact) errors.push(`${path}: needs a number "value" or a "valueFact"`);
  if (c.plus !== undefined && typeof c.plus !== 'number') errors.push(`${path}: "plus" must be a number`);
}

function checkTarget(t, path, errors) {
  if (t === undefined) return;
  if (!t || typeof t !== 'object') { errors.push(`${path}: not a target`); return; }
  if (t.enemy !== undefined) { if (!PICKS.includes(t.enemy)) errors.push(`${path}.enemy: one of ${PICKS.join(' ')}`); return; }
  if (t.objective !== undefined) {
    if (typeof t.objective !== 'string') errors.push(`${path}.objective: a kind of objective`);
    if (t.relation !== undefined && !['any', 'mine', 'enemy', 'neutral'].includes(t.relation)) errors.push(`${path}.relation: any mine enemy neutral`);
    if (t.pick !== undefined && !PICKS.includes(t.pick)) errors.push(`${path}.pick: one of ${PICKS.join(' ')}`);
    if (t.where !== undefined && (typeof t.where !== 'object' || Array.isArray(t.where))) errors.push(`${path}.where: { tag: value }`);
    if (t.minStock !== undefined && typeof t.minStock !== 'number') errors.push(`${path}.minStock: a number`);
    return;
  }
  if (t.place !== undefined) { if (typeof t.place !== 'string') errors.push(`${path}.place: a kind of place`); return; }
  errors.push(`${path}: an enemy, an objective or a place`);
}

function checkAction(a, path, errors) {
  if (!a || typeof a !== 'object') { errors.push(`${path}: not an action`); return; }
  if (!PLAN_ACTIONS.includes(a.do)) { errors.push(`${path}.do: one of ${PLAN_ACTIONS.join(' ')}`); return; }
  checkTarget(a.target, `${path}.target`, errors);
  if (a.do === 'buy' && typeof a.item !== 'string') errors.push(`${path}.item: what to buy`);
}

/** A plan from a model, checked: { ok: true, plan } with defaults filled in, or { ok: false, errors }. */
export function validatePlan(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['a plan is a JSON object'] };
  normalizePlan(raw);
  if (!Array.isArray(raw.rules)) errors.push('"rules" must be a list');
  else if (raw.rules.length > MAX_RULES) errors.push(`at most ${MAX_RULES} rules`);
  else raw.rules.forEach((r, i) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) { errors.push(`rules[${i}]: not an action object`); return; }
    checkCondition(r.when, `rules[${i}].when`, errors);
    checkAction(r, `rules[${i}]`, errors);
  });
  if (raw.otherwise !== undefined) checkAction(raw.otherwise, 'otherwise', errors);
  const fw = raw.reflexes?.fightWithin;
  if (fw !== undefined && !(typeof fw === 'number' && fw >= 0 && fw <= 12)) errors.push('reflexes.fightWithin: a number 0-12');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      intent: typeof raw.intent === 'string' ? raw.intent.slice(0, 300) : '',
      reflexes: { fightWithin: fw ?? 3.5 },
      rules: raw.rules.map((r, i) => ({ ...r, id: typeof r.id === 'string' ? r.id.slice(0, 40) : `rule-${i + 1}` })),
      otherwise: raw.otherwise ?? { do: 'default' },
    },
  };
}

// --- running a plan --------------------------------------------------------------------------------------------------

function factValue(facts, name) {
  if (name in facts) return facts[name];
  // A kind the round does not have: none of it, none near.
  if (/\.(count|open|looted|alive|seen|above|below|close|tools|wool|stock|hasSword|hasPickaxe|hasAxe|hasShears|hasBow)$/.test(name)) return 0;
  if (/\.(nearestDy|highestDy|lowestDy)$/.test(name)) return 0;
  if (/\.(nearest|dist|foeDist|lowest)$/.test(name)) return Infinity;
  if (/\.highest$/.test(name)) return -Infinity;
  return undefined;
}

const numeric = (v) => (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : v);

/** Whether a condition holds over `facts`. A fact the round does not know makes its comparison false. */
export function holds(c, facts) {
  if (c === true || c === undefined) return true;
  if (c.all) return c.all.every((x) => holds(x, facts));
  if (c.any) return c.any.some((x) => holds(x, facts));
  if (c.not !== undefined) return !holds(c.not, facts);
  const a = numeric(factValue(facts, c.fact));
  const b0 = numeric(c.valueFact !== undefined ? factValue(facts, c.valueFact) : typeof c.value === 'boolean' ? Number(c.value) : c.value);
  // `plus` lets a plan compare against another fact with a margin: blocks >= distance + 8.
  const b = typeof c.plus === 'number' && typeof b0 === 'number' ? b0 + c.plus : b0;
  if (a === undefined || b === undefined) return false;
  switch (c.op) {
    case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
    case '==': return a === b; case '!=': return a !== b; default: return false;
  }
}

const flat = (me, at) => Math.hypot(at[0] - me.at.x, at[2] - me.at.z);
/** The numeric total of an objective's stock fields (0 when it has none). */
const stockOf = (o) => (o && o.stock && typeof o.stock === 'object'
  ? Object.values(o.stock).reduce((n, v) => n + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0) : 0);
function pickFrom(list, pick, me, posOf) {
  if (!list.length) return null;
  const by = {
    nearest: (a, b) => flat(me, posOf(a)) - flat(me, posOf(b)),
    farthest: (a, b) => flat(me, posOf(b)) - flat(me, posOf(a)),
    highest: (a, b) => posOf(b)[1] - posOf(a)[1] || flat(me, posOf(a)) - flat(me, posOf(b)),
    lowest: (a, b) => posOf(a)[1] - posOf(b)[1] || flat(me, posOf(a)) - flat(me, posOf(b)),
  }[pick === 'weakest' ? 'nearest' : pick ?? 'nearest'];
  return [...list].sort(by)[0];
}

/**
 * What a target names, now: { kind: 'enemy', player } | { kind: 'objective', objective, at } | { kind: 'place', place, at } | null.
 * `includeClosed` lets `collect` aim at a source that is momentarily empty (a generator still worth standing on).
 */
export function resolveTarget(t, view, enemies, { includeClosed = false } = {}) {
  if (!t) return null;
  const me = view.me;
  if (t.enemy) {
    if (!enemies.length) return null;
    const pos = (p) => [p.x ?? 0, p.y ?? 31, p.z ?? 0];
    const player = t.enemy === 'weakest' ? [...enemies].sort((a, b) => (a.health ?? 20) - (b.health ?? 20))[0] : pickFrom(enemies, t.enemy, me, pos);
    return player ? { kind: 'enemy', player, at: pos(player) } : null;
  }
  if (t.objective) {
    const list = view.objectives.filter((o) => o.kind === t.objective && (includeClosed || isOpen(o))
      && (t.relation === undefined || t.relation === 'any' || relationOf(o, me) === t.relation)
      && (t.minStock === undefined || stockOf(o) >= t.minStock)
      && Object.entries(t.where ?? {}).every(([k, v]) => o[k] === v));
    const objective = pickFrom(list, t.pick, me, (o) => o.at);
    return objective ? { kind: 'objective', objective, at: objective.at } : null;
  }
  if (t.place) {
    const list = view.places.filter((p) => p.kind === t.place && (!t.mine || relationOf(p, me) === 'mine'));
    const place = pickFrom(list, t.pick, me, (p) => p.at);
    return place ? { kind: 'place', place, at: place.at } : null;
  }
  return null;
}

/**
 * One decision by a plan: the reflex, then the first rule whose condition holds and whose action can be done now,
 * else `otherwise`. `fallback` is the scripted playbook (a function of { view, skills }), run for 'default' and for no
 * plan at all. Returns what it did: { by: 'reflex' | rule id | 'otherwise' | 'fallback', action, ok }.
 */
export async function runPlan({ plan, view, skills, fallback, session = null }) {
  if (!plan) { await fallback({ view, skills }); return { by: 'fallback', action: 'default' }; }
  if (view.phase !== 'playing' || !view.me.canAct) {
    // Outside play (the lobby: pick a team) the playbook knows what to do.
    await fallback({ view, skills });
    return { by: 'fallback', action: 'default' };
  }
  const enemies = skills.enemies();
  const facts = computeFacts(view, enemies, session);
  skills.heal();
  const ctx = { view, skills, enemies, fallback };
  const blocked = [];     // rules that matched but could not act (no target, or a bridge I cannot afford)
  // An explicit retreat runs before the reflex: the plan asked to get away, and self-defence must not overrule it.
  for (const rule of plan.rules) {
    if (rule.do !== 'flee' && rule.do !== 'hide') continue;
    if (!holds(rule.when, facts)) continue;
    if (await act(rule, ctx)) return { by: rule.id, action: rule.do, ok: true, blocked };
  }
  const fw = plan.reflexes?.fightWithin ?? 3.5;
  if (fw > 0 && enemies.length && facts['enemies.nearest'] <= fw) {
    await skills.fight(enemies[0]);
    return { by: 'reflex', action: 'fight', blocked };
  }
  for (const rule of plan.rules) {
    if (!holds(rule.when, facts)) continue;
    if (await act(rule, ctx)) return { by: rule.id, action: rule.do, ok: true, blocked };
    blocked.push(rule.id);
  }
  const otherwise = plan.otherwise ?? { do: 'default' };
  const done = await act(otherwise, ctx);
  if (!done && otherwise.do !== 'default') {
    // The catch-all could not be done (its target is gone): better the scripted play than an idle tick.
    await fallback({ view, skills });
    return { by: 'otherwise', action: otherwise.do, ok: false, fallback: true, blocked };
  }
  if (!done) blocked.push('otherwise');
  return { by: 'otherwise', action: otherwise.do, ok: done, blocked };
}

/** Whether a bridge to `at` can be paid for now: at most one block per cell of void on the straight way. */
function canBridgeNow(a, at, view, skills) {
  if (!at || a.bridge === false) return true;
  const blocks = view.me?.carrying?.blocks ?? 0;
  const voidCells = typeof skills.voidCellsToward === 'function' ? skills.voidCellsToward(at[0], at[2]) : 0;
  return !(Number.isFinite(voidCells) && voidCells > blocks);
}

/** Do one action; false when it cannot be done now (no such target), so the next rule is tried. */
async function act(a, { view, skills, enemies, fallback }) {
  const target = resolveTarget(a.target, view, enemies, { includeClosed: a.do === 'collect' });
  const bridge = a.bridge ?? true;
  switch (a.do) {
    case 'default': await fallback({ view, skills }); return true;
    case 'wait': skills.lookAround(); await new Promise((r) => setTimeout(r, 300)); return true;
    case 'fight': { const p = target?.player ?? enemies[0]; if (!p) return false; await skills.fight(p); return true; }
    case 'shoot': { const p = target?.player ?? enemies[0]; if (!p) return false; return Boolean(skills.shoot(p)); }
    case 'throw': { const p = target?.player ?? enemies[0]; if (!p) return false; return Boolean(skills.throwAt(p)); }
    case 'loot': if (!target?.objective || !canBridgeNow(a, target.at, view, skills)) return false; await skills.loot(target.at, { bridge, summary: `plan: looting ${target.objective.id}` }); return true;
    case 'collect': if (!target?.objective || !canBridgeNow(a, target.at, view, skills)) return false; await skills.collect(target.objective.id, target.at, { bridge, summary: `plan: collecting ${target.objective.id}` }); return true;
    case 'destroy':
      if (!target?.objective) return false;
      if (Math.hypot(target.at[0] + 0.5 - view.me.at.x, target.at[2] + 0.5 - view.me.at.z) > 4.2) {
        if (!canBridgeNow(a, target.at, view, skills)) return false;
        await skills.goTo([target.at[0] + 0.5, target.at[1], target.at[2] + 0.5], { bridge, stopWithin: 2.2, summary: `plan: going to break ${target.objective.id}` });
      } else skills.breakBed(target.at, { summary: `plan: breaking ${target.objective.id}` });
      return true;
    case 'goTo':
      if (!target || !canBridgeNow(a, target.at, view, skills)) return false;
      await skills.goTo(target.at, { bridge, stopWithin: a.stopWithin ?? 2, summary: `plan: going to ${target.place?.id ?? target.objective?.id ?? 'a foe'}` });
      return true;
    case 'follow': { const p = target?.player ?? enemies[0]; if (!p || !canBridgeNow(a, target.at ?? [p.x ?? 0, p.y ?? 31, p.z ?? 0], view, skills)) return false; await skills.follow(p, { distance: a.distance ?? 8, bridge }); return true; }
    case 'flee': { const from = target?.at ?? (enemies[0] ? [enemies[0].x, enemies[0].y, enemies[0].z] : null); if (!from) return false; await skills.flee(from, { distance: a.distance ?? 6 }); return true; }
    case 'hide': { const from = target?.at ?? (enemies[0] ? [enemies[0].x, enemies[0].y, enemies[0].z] : null); if (!from) return false; return skills.hide(from, { radius: a.radius ?? 8 }); }
    case 'guard': if (!target) return false; await skills.guard(target.at, { radius: a.radius ?? 6 }); return true;
    case 'buy': return Boolean(skills.buy(a.item, a.count ?? 1)?.ok);
    default: return false;
  }
}
