// The slow thinker: a model that plans, while fast code plays. It is asked for a plan (planRunner.mjs) when something
// changes -- the round starts, a player dies, an objective changes (a bed broken, chests refilled), I am hurt, a foe
// comes close, the plan runs out or gets stuck -- and never more than one question at a time, nor more often than
// minIntervalMs. Between answers the last plan keeps running; with none (or a bad one), the scripted playbook plays.
// A model too slow to answer costs nothing but the plan it did not make.
//
// The model sees only general words: the game's rules as text, the facts (facts.mjs), the objectives and places, the
// foes it has seen, what happened since its last plan and how that plan went -- and answers with a plan as JSON.
import { computeFacts, factsText, relationOf, isOpen } from './facts.mjs';
import { validatePlan, PLAN_ACTIONS } from './planRunner.mjs';

export const PLAN_GUIDE = `You are the strategist for a bot in a real-time block game (a Minecraft-like mini-game). Fast
code moves and fights; you decide WHAT the bot does by writing short rules. The code runs your rules several times a
second until a new plan replaces them, and asks you again when something important changes.

HOW TO THINK ABOUT A ROUND
1. Read RULES: it says HOW the round is won and whether there is a time limit. Winning is the only thing that counts.
   If the time limit expires with more than one player or team left, the round is a TIE, not a win. A plan that only
   loots, only defends or only waits is a losing plan. It must contain the action that actually wins before time runs out.
2. Most rounds are a race through phases: survive -> get the minimum gear -> take the best position or objective ->
   finish the opponent. Do not spend the whole round in an early phase. Stop looting once you have enough to fight;
   the opponent is getting stronger too.
3. "default" is the built-in scripted play. It walks, bridges, loots a chest it is sent to, fights, heals, collects at
   generators, shops and (where it has a base) covers a bed sensibly. Use "default" as "otherwise" for routine local
   play; write a rule only where your strategy differs from the script (for example: to leave home earlier, to take
   high ground, to rush a bed, to force a last fight). Do not duplicate a default behaviour with rules that fire
   every tick. Do not hand the opening to default with a timer such as time.elapsed < 25: your answer arrives
   seconds after it was asked, so that timer may already have passed (or it may keep the bot in the script's
   opening far too long). Let "otherwise": {"do":"default"} cover the routine states, and write your own rules
   as conditions on the STATE where you want to take over (weapon, blocks, open chests, foes seen).
4. Rules are a priority list, first match wins, one step per tick. Put the emergency (low health) first, then the
   action that wins the round, then the economy/positioning that makes it possible.
5. A rule whose target does not exist is skipped, and so is a bridge you cannot afford: crossing open space costs
   one block per void cell, and the code refuses to walk into a gap it cannot span. So budget blocks in the
   condition against K.R.void (the exact cost to the nearest open objective of that kind/relation), e.g.
   {"fact":"me.blocks","op":">=","valueFact":"bed.enemy.void","plus":4} -- and put an earning rule (collect a
   generator, buy blocks) above the crossing. If no rule applies, "otherwise" runs; if that cannot be done either,
   the scripted play runs anyway.
6. Keep plans SHORT: 3-6 rules, one clear intent, "otherwise": {"do":"default"}. Six is a ceiling, not a target: every
   extra rule costs answer time, and a late plan loses to the plan already running. Conditions should use the state,
   not the clock: an answer can arrive 10-40 s after its snapshot, when a time-based condition has already passed.
   Use time.left only for real deadlines (the last fight, a forced push), never to schedule the opening.

HOW TO ANSWER
Your answer is used seconds after the snapshot. If the prompt says OPENING QUESTION, answer with only 2-4 rules
for the first moves and keep the JSON compact: a full plan will be asked when play starts. One of them MUST handle a
close foe (fight, shoot, or leave-edge). If any rule crosses void or a bridge, put a leave-edge rule above it and gate
the crossing on enemies.nearest > 10 (or enemies.seen == 0): a reflex fight on a bridge is how a bot falls in the
first ten seconds. In every plan, prefer state conditions; a rule gated on time.elapsed can be stale on arrival.
Answer with ONE JSON object and nothing else (no prose, no markdown):
{
  "intent": "one sentence: the plan and why",
  "reflexes": { "fightWithin": 4 },
  "rules": [ { "id": "short-name", "when": <condition>, "do": <action>, ...action fields } ],
  "otherwise": { "do": "default" }
}
"reflexes.fightWithin": any foe this many blocks away or closer is fought before your ordinary rules (0 turns the
reflex off, 12 is the maximum). It is for self-defence only. A rule whose "do" is flee or hide is different: those
rules run BEFORE the reflex, so an explicit retreat works even while a foe is inside fightWithin. Every other action
(shoot, buy, wait, or default to heal) runs only after the reflex, so set fightWithin to 0 (or low) when you want to
shoot, heal or hand a close fight to the script.
Rules are tried in order every tick. The first whose condition holds AND whose target exists is done for one step.

CONDITIONS
  {"fact": NAME, "op": "<" | "<=" | ">" | ">=" | "==" | "!=", "value": NUMBER}
  {"fact": NAME, "op": ..., "valueFact": OTHER_FACT}      compare two facts
  {"fact": NAME, "op": ..., "valueFact": OTHER_FACT, "plus": NUMBER}   that fact plus a margin (minus with a negative)
  {"all": [ ... ]}, {"any": [ ... ]}, {"not": cond}, true
Numbers are blocks, health points, seconds or counts. "valueFact" is useful (e.g. me.blocks >= a needed count).
A comparison against a fact about something the round does not have is false, never an error.

FACTS (the prompt prints the actual names and values of this round; "inf" means none/never)
  Objectives: for each kind K the round has (chest, bed, generator, flag, ...) and relation R = any | mine | enemy |
  neutral (mine = my team's/island's/slot's; enemy = another team's; neutral = nobody's):
    K.R.count     how many exist
    K.R.open      how many are still usable (not looted, broken or empty)
    K.R.looted    how many are gone
    K.R.nearest   blocks to the nearest open one (inf when none)
    K.R.highest / K.R.lowest      the y of the highest/lowest open one
    K.R.nearestDy / highestDy / lowestDy   its height over mine (positive = above me)
    K.R.stock     total pile in them (a generator's stock; 0 when empty)
    K.R.void      void cells on the straight route to the nearest open one: exactly what a bridge there costs
    K.R.foeDist   blocks from the nearest foe I have seen to the nearest open one
  K.R.count counts the ones that exist even when they are not usable; K.R.open counts only usable ones (a looted
    chest or an empty generator is not open). Use count for "the generator exists" and open for "there is still loot".
  Places: place.P.dist, place.P.mine.dist, place.P.count, place.P.mine.count, place.P.highest/lowest/nearestDy.
  Players: enemies.alive, enemies.seen (foes I actually see), enemies.nearest, enemies.nearestDy,
    enemies.nearestHealth, enemies.weakestHealth, enemies.above, enemies.below, enemies.close, allies.alive,
    allies.nearest, players.alive. enemies.nearestVoid is the void on the straight route to the nearest seen foe:
    0 means a direct route, a larger number means a gap (inf = no foe seen). It is a CROSSING test, not a fight
    test: do not put it on every melee rule; a foe on your bridge or platform may still report a nonzero route cost.
  Me: me.health (of 20), me.absorption, me.food, me.blocks, me.weapon (best carried weapon's damage; 1 = fist, about
    4 wooden, 5 stone, 6 iron, 7 diamond sword; an axe may be higher, so read the number, not the item name), me.armor
    (best pieces, one per slot, that I can wear), me.armorPoints (at most 20), me.hasSword,
    me.hasPickaxe, me.hasAxe, me.hasShears, me.tools, me.wool, me.gapples, me.pearls, me.arrows, me.hasBow, me.y,
    me.iron, me.gold, me.diamond, me.emerald. me.voidNear counts void cells within 3 blocks of my feet: 0 = solid
    ground around me; a larger number means a void edge, where one hit can knock me out of the round. me.dropNear
    counts nearby cells whose ground is 3+ blocks lower: a ledge or tower edge a step (or a blind flee) can fall from.
  Time: time.elapsed, time.left (inf without a limit), time.next (seconds to the next scheduled event).

ACTIONS ("do"): ${PLAN_ACTIONS.join(', ')}.
  fight / shoot / throw: a foe: "target": {"enemy": "nearest" | "weakest" | "highest" | "lowest"}.
  loot / collect / destroy: an objective: "target": {"objective": KIND, "relation": R, "where": {TAG: VALUE},
    "minStock": NUMBER, "pick": "nearest" | "farthest" | "highest" | "lowest"}. loot takes a chest; collect stands
    on a generator (it works on an empty generator too); destroy walks to a bed and breaks it. minStock: 1 skips a
    generator whose pile is empty.
    "bridge": true | false on loot/destroy/goTo/collect/follow: build the way over void. It needs one block per void
    cell on the straight way; with fewer blocks the action is skipped for that tick, so a rule that only bridges
    will wait until an earning rule above it has given you the blocks.
  goTo / guard / hide / flee / follow: a place {"place": KIND, "mine": true, "pick": ...}, an objective, or a foe.
    goTo takes "stopWithin" (default 2); guard "radius" (default 6); flee "distance" (default 6); follow "distance".
    goTo/follow toward a foe are CHASES: they walk toward it and do not attack. Near a ledge a chase can step off.
    When a foe is in sight and within about 12 blocks, use fight (or shoot from range); use goTo a foe only to close a
    long gap over solid ground. For a retreat that must happen even while a foe is close, use flee or hide: only
    those run before reflexes.fightWithin; a goTo retreat after it can be overruled by the reflex.
  buy: {"do": "buy", "item": SHOP_KEY, "count": 1}. Keys include: wool, stone_sword, iron_sword, diamond_sword,
    chain_armor, iron_armor, diamond_armor, pickaxe, axe, gapple, pearl, end_stone, wood, and team upgrades
    sharpness, protection, forge. A buy that cannot be afforded fails and the next rule is tried.
  wait: stand and look around for a moment. default: hand this tick to the scripted play.
  Targets may also use "where" to pick by a tag the prompt shows (for example {"ring": "center"} or
  {"resource": "diamond"}); tags must match exactly.

STRATEGY THAT TRANSFERS
- Gear thresholds: do not cross open void with no blocks, and do not take a fair fight with a fist. Loot home only
  while missing a weapon/blocks/armour; then leave. A rule like "when chest.mine.open > 0 and me.weapon < 5 -> loot"
  stops the moment you have a stone sword. Eight blocks is a bare crossing; 12-16 is safer for a far objective, and
  the bridge consumes them.
- Crossing budget: before a bridge, compare me.blocks with K.R.void -- the void cells on the straight route to the
  nearest open objective of that kind/relation, which is exactly what crossing to it costs. Add a small margin if you
  may need to come back. If you cannot pay, the action is skipped; earn blocks first (collect a generator, buy wool,
  loot a chest) with a rule ABOVE the push. Never let the winning push be a rule that can never afford its own path.
  Never guess a block count for a crossing: FACTS prints K.R.void exactly. A fixed number (56, 64, 89) is how a push
  stalls while the enemy farms; write me.blocks >= bed.enemy.void (or the relevant K.R.void) with a plus margin.
- Void is the biggest killer. me.voidNear > 0 means a void edge is within 3 blocks: do not start or continue a melee
  there, where one knockback ends the round; move to solid ground or shoot. me.dropNear > 0 means a ledge or tower
  edge: a blind flee can run off it and the fall can kill; prefer hide, default, a safe goTo or a heal over a blind
  flee, and never flee off a height to escape a foe you can fight. enemies.nearestVoid > 0 means the nearest seen foe
  is across a gap: do not goTo/follow across it. Shoot if you have a bow, guard your side, or make them come to you.
- A bridge with a foe within about 12 blocks is a trap, not a route: the foe can knock you off. Gate every
  "bridge": true crossing on enemies.nearest > 10 (or enemies.seen == 0), put leave-edge above it, and set
  reflexes.fightWithin low while crossing. If a foe appears mid-bridge, stop, shoot, or retreat to your end; do not
  continue to the objective.
- A fair fight is a coin flip. Fight with an advantage: more health/absorption, better weapon or armour, a bow at
  range, height, or a weakened foe. If it is even, take another chest/gapple/position or shoot first. The scripted
  play is a strong duelist; do not gift it an even fight far from your ground. A foe at 8 health or less within about
  8 blocks is the win: finish it before you loot or reposition, even if the fight is not otherwise fair. Do not gate
  that finish on enemies.nearestVoid; a foe on your bridge can have a nonzero route cost. A foe who eats a golden
  apple while you open a chest is the round.
- Do not loot in a fight. A chest or generator while a seen foe is within about 12-14 blocks is free hits (especially
  against a bow): shoot, fight, or take cover first. Gate a neutral loot rule on enemies.nearest > 10, and keep home
  looting for when no foe is near. A loot rule that outranks the finish is worse than no plan.
- Do not chase a foe across the void just because you can see them. Fight close foes (enemies.nearest small), or
  fight anyone once the clock forces it (time.left small). The rest of the time, take the objective that makes the
  last fight winnable. With a bow and arrows, a foe at 8-30 blocks is free damage: use shoot before closing, from
  height if possible, and make them cross to you. A kite rule only for low health wastes a bow you already have.
- Height is power in a knockback game: hits from above push foes down, and an objective high up is usually the good
  one. Use pick "highest" when the good loot or the strong position is high, "nearest" when speed matters more, and
  "lowest" to finish a foe below you. enemies.nearestDy tells you whether you have the height.
- The win condition is usually another player (or another team). Once the loot that matters is gone, or the clock is
  short, HUNT: fight/follow the nearest foe instead of waiting. An idle bot at the time limit ties or loses, and a
  draw is not a win. Do not leave the final push to time.left < 10: you may need several attempts, so open the
  endgame rule at 60-120 s left and keep fighting while the clock runs down. fight needs a foe you can see
  (enemies.seen > 0); to hunt an unseen one, goTo or guard a place they must come to (their base, the middle, the
  remaining objective), or follow the objective they still want.
- Low health without healing is a special case. If me.gapples is 0 and me.food is low, fleeing does not heal you, and
  a flee rule can pin you at the edge of the map forever: give the retreat a destination (goTo your spawn or a
  safe place), or shoot from range with a bow, or use the time you have to loot a chest for a golden apple. If none
  of that is possible, a late fight is better than a guaranteed tie. A flee/hide rule runs first and stays in
  front, so guard it with both a health and a foe-distance condition, and add a time.left < 60 last-stand above it.
  On high ground, flee can step off a ledge (me.dropNear): use hide or a safe destination instead of a blind flee.
- In team games each objective kind has a relation. Breaking an enemy objective can be more valuable than another
  chest; check the enemy's open count, not just yours. If the objective that keeps the enemy in the game is gone,
  the plan's next priority must be to eliminate the player. If you are already at the enemy objective, take it even
  under fire; and when the clock is short, make the risky push rather than tie.
- If your own bed/objective is gone (K.mine.open == 0 for the objective that lets you respawn), deaths are final and
  trading them is losing: break theirs or force the fight now. Do not spend the remaining clock farming generators
  for a push you cannot afford; keep only the economy rule that earns the blocks for the push, with a timer.
- Economy: collect/buy before long crossings; a rule that buys what you can afford (wool, sword, armour, a team
  upgrade) costs one tick and keeps working. A generator refills over time, so collect when the pile is worth the
  trip (stock >= 3) or when you are already there; do not stand on it for the whole round. Typical shop prices:
  wool 4 iron (16 blocks), stone_sword 10 iron, iron_sword 7 gold, iron_armour 12 gold, gapple 3 gold, end_stone
  24 iron, wood 4 gold, sharpness 8 diamonds, protection 5 diamonds, forge 4 diamonds -- confirm against what a buy
  attempt tells you. Do not save for a luxury item while the opponent takes the map.
- Scheduling: time.next is the next event (a refill, a generator tier, a shop restock). Be at the valuable
  objective just before it; time.left is the deadline. Use both.
- If a previous plan's rules almost never ran (see HOW IT WENT), the conditions were wrong for this round: write
  rules that match the state the prompt shows, or simply let default play and only override the one thing you want.
  If a single rule ran for a long time without winning, or a rule kept matching but could not act (see MATCHED BUT
  COULD NOT ACT), its condition or target is wrong for the map: fix the budget/height/distance or replace it.

EXAMPLE A -- a last-player-alive round on maps with home chests, a contested middle/high ground and a 5-minute limit.
It is a menu of rules, not a template: a good plan uses only the 3-6 of them that fit the state it was shown.
{
  "intent": "Loot home only until I have a real weapon and bridging blocks, take the best neutral chests and the high ground while no foe is close, shoot from range instead of chasing over void, leave an edge before a melee, then hunt and force a kill before the limit.",
  "reflexes": { "fightWithin": 4 },
  "rules": [
    { "id": "escape", "when": { "all": [ { "fact": "me.health", "op": "<", "value": 7 },
                                         { "fact": "enemies.nearest", "op": "<", "value": 6 } ] },
      "do": "flee", "target": { "enemy": "nearest" }, "distance": 8 },
    { "id": "leave-edge", "when": { "all": [ { "fact": "me.voidNear", "op": ">", "value": 0 },
                                             { "fact": "enemies.nearest", "op": "<=", "value": 6 } ] },
      "do": "flee", "target": { "enemy": "nearest" }, "distance": 8 },
    { "id": "finish-weak", "when": { "all": [ { "fact": "enemies.seen", "op": ">", "value": 0 },
                                             { "fact": "enemies.nearest", "op": "<=", "value": 8 },
                                             { "fact": "enemies.nearestHealth", "op": "<=", "value": 8 } ] },
      "do": "fight", "target": { "enemy": "nearest" } },
    { "id": "leave-drop", "when": { "all": [ { "fact": "me.dropNear", "op": ">", "value": 0 },
                                            { "fact": "enemies.nearest", "op": "<=", "value": 6 } ] },
      "do": "hide", "target": { "enemy": "nearest" }, "radius": 6 },
    { "id": "open-fire", "when": { "all": [ { "fact": "me.hasBow", "op": "==", "value": 1 },
                                            { "fact": "me.arrows", "op": ">", "value": 0 },
                                            { "fact": "enemies.seen", "op": ">", "value": 0 },
                                            { "fact": "enemies.nearest", "op": ">", "value": 6 },
                                            { "fact": "enemies.nearest", "op": "<=", "value": 28 } ] },
      "do": "shoot", "target": { "enemy": "nearest" } },
    { "id": "finish", "when": { "all": [ { "fact": "time.left", "op": "<", "value": 60 },
                                         { "fact": "enemies.alive", "op": ">", "value": 0 },
                                         { "fact": "enemies.seen", "op": ">", "value": 0 } ] },
      "do": "fight", "target": { "enemy": "nearest" } },
    { "id": "get-weapon", "when": { "all": [ { "fact": "chest.mine.open", "op": ">", "value": 0 },
                                            { "fact": "me.weapon", "op": "<", "value": 5 } ] },
      "do": "loot", "target": { "objective": "chest", "relation": "mine", "pick": "nearest" } },
    { "id": "get-blocks", "when": { "all": [ { "fact": "chest.mine.open", "op": ">", "value": 0 },
                                            { "fact": "me.blocks", "op": "<", "value": 12 } ] },
      "do": "loot", "target": { "objective": "chest", "relation": "mine", "pick": "nearest" } },
    { "id": "take-high-ground", "when": { "all": [ { "fact": "chest.neutral.open", "op": ">", "value": 0 },
                                                  { "fact": "me.blocks", "op": ">=", "valueFact": "chest.neutral.void", "plus": 4 },
                                                  { "fact": "enemies.nearest", "op": ">", "value": 10 } ] },
      "do": "loot", "target": { "objective": "chest", "relation": "neutral", "pick": "highest" }, "bridge": true },
    { "id": "hunt", "when": { "all": [ { "fact": "enemies.seen", "op": ">", "value": 0 },
                                      { "fact": "enemies.nearestVoid", "op": "==", "value": 0 },
                                      { "fact": "enemies.nearest", "op": "<=", "value": 12 } ] },
      "do": "fight", "target": { "enemy": "nearest" } },
    { "id": "seek", "when": { "all": [ { "fact": "enemies.alive", "op": ">", "value": 0 },
                                      { "fact": "enemies.seen", "op": "==", "value": 0 },
                                      { "fact": "time.left", "op": "<", "value": 180 } ] },
      "do": "goTo", "target": { "place": "middle", "pick": "highest" }, "bridge": true }
  ],
  "otherwise": { "do": "default" }
}

EXAMPLE B -- a team round with beds, a forge, generators and a 10-minute limit; the bed must fall before the player.
Again, choose the 3-6 rules this state needs, not the whole menu:
{
  "intent": "Let default handle the routine bed cover and shop, but make the winning push explicit: buy a sword and keep earning wool until I can pay to cross, break the enemy bed, then eliminate the player; if my bed falls, stop farming and force the win.",
  "reflexes": { "fightWithin": 4 },
  "rules": [
    { "id": "break-now", "when": { "all": [ { "fact": "bed.enemy.open", "op": ">", "value": 0 },
                                           { "fact": "bed.enemy.nearest", "op": "<=", "value": 4 } ] },
      "do": "destroy", "target": { "objective": "bed", "relation": "enemy", "pick": "nearest" }, "bridge": false },
    { "id": "finish", "when": { "all": [ { "fact": "bed.enemy.open", "op": "==", "value": 0 },
                                        { "fact": "enemies.alive", "op": ">", "value": 0 },
                                        { "fact": "enemies.seen", "op": ">", "value": 0 } ] },
      "do": "fight", "target": { "enemy": "nearest" } },
    { "id": "defend-bed", "when": { "all": [ { "fact": "bed.mine.open", "op": ">", "value": 0 },
                                            { "fact": "bed.mine.foeDist", "op": "<", "value": 14 } ] },
      "do": "fight", "target": { "enemy": "nearest" } },
    { "id": "push-bed", "when": { "all": [ { "fact": "bed.enemy.open", "op": ">", "value": 0 },
                                          { "fact": "me.weapon", "op": ">=", "value": 5 },
                                          { "fact": "me.blocks", "op": ">=", "valueFact": "bed.enemy.void", "plus": 4 },
                                          { "fact": "enemies.nearest", "op": ">", "value": 10 } ] },
      "do": "destroy", "target": { "objective": "bed", "relation": "enemy", "pick": "nearest" }, "bridge": true },
    { "id": "no-bed-all-in", "when": { "all": [ { "fact": "bed.mine.open", "op": "==", "value": 0 },
                                               { "fact": "enemies.alive", "op": ">", "value": 0 } ] },
      "do": "fight", "target": { "enemy": "nearest" } },
    { "id": "sword", "when": { "all": [ { "fact": "me.iron", "op": ">=", "value": 10 },
                                       { "fact": "me.weapon", "op": "<", "value": 5 } ] },
      "do": "buy", "item": "stone_sword" },
    { "id": "armour", "when": { "all": [ { "fact": "me.gold", "op": ">=", "value": 12 },
                                        { "fact": "me.armorPoints", "op": "<", "value": 10 } ] },
      "do": "buy", "item": "iron_armor" },
    { "id": "buy-wool", "when": { "all": [ { "fact": "bed.enemy.open", "op": ">", "value": 0 },
                                          { "fact": "me.iron", "op": ">=", "value": 4 },
                                          { "fact": "me.blocks", "op": "<", "valueFact": "bed.enemy.void" } ] },
      "do": "buy", "item": "wool" },
    { "id": "forge", "when": { "all": [ { "fact": "bed.enemy.open", "op": ">", "value": 0 },
                                       { "fact": "me.blocks", "op": "<", "valueFact": "bed.enemy.void" },
                                       { "fact": "generator.mine.count", "op": ">", "value": 0 } ] },
      "do": "collect", "target": { "objective": "generator", "relation": "mine", "pick": "nearest" } }
  ],
  "otherwise": { "do": "default" }
}`;

/** The first JSON object in a model's answer, tolerant of fences, prose and a trailing comma. */
export function extractJson(text) {
  const s = String(text ?? '');
  const bodies = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fence.exec(s))) bodies.push(m[1]);
  bodies.push(s);
  const repair = (x) => x.replace(/,\s*([}\]])/g, '$1');
  for (const body of bodies) {
    const t = body.trim();
    try { const v = JSON.parse(t); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* scan below */ }
    for (let start = body.indexOf('{'); start >= 0; start = body.indexOf('{', start + 1)) {
      const end = matchingBrace(body, start);
      if (end < 0) continue;
      try {
        const v = JSON.parse(repair(body.slice(start, end + 1)));
        if (v && typeof v === 'object' && !Array.isArray(v)) return v;
      } catch { /* try the next opening brace */ }
    }
  }
  return null;
}

/** The index of the `}` that closes the `{` at `start`, respecting strings; -1 when unbalanced. */
function matchingBrace(s, start) {
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i;
  }
  return -1;
}

const r1 = (n) => Math.round(n * 10) / 10;
const dyText = (dy) => (Math.abs(dy) < 1.5 ? 'level with me' : dy > 0 ? `${r1(dy)} above me` : `${r1(-dy)} below me`);
const distXZ = (me, at) => Math.hypot(at[0] - me.at.x, at[2] - me.at.z);

/** One line per kind: counts by relation, open count and height range. */
function kindsSummary(view) {
  const me = view.me, kinds = new Map();
  for (const o of view.objectives) {
    if (!kinds.has(o.kind)) kinds.set(o.kind, { total: 0, open: 0, mine: 0, enemy: 0, neutral: 0, ys: [] });
    const k = kinds.get(o.kind);
    k.total++;
    if (isOpen(o)) k.open++;
    k[relationOf(o, me)]++;
    k.ys.push(o.at[1]);
  }
  return [...kinds].map(([kind, k]) => `${kind}: ${k.total} (mine ${k.mine}, enemy ${k.enemy}, neutral ${k.neutral}), ${k.open} open, y ${Math.min(...k.ys)}-${Math.max(...k.ys)}`).join('; ');
}

/** One line per place kind. */
function placesSummary(view) {
  const me = view.me, kinds = new Map();
  for (const p of view.places) {
    if (!kinds.has(p.kind)) kinds.set(p.kind, { total: 0, mine: 0, ys: [] });
    const k = kinds.get(p.kind);
    k.total++;
    if (relationOf(p, me) === 'mine') k.mine++;
    k.ys.push(p.at[1]);
  }
  return [...kinds].map(([kind, k]) => `${kind}: ${k.total}${k.mine ? ` (mine ${k.mine})` : ''}, y ${Math.min(...k.ys)}-${Math.max(...k.ys)}`).join('; ');
}

/** The round as the model is shown it. */
export function describeForModel(view, facts, enemies, { events = [], lastPlan = null, lastStats = null, lastBlocked = null, lastErrors = null, notes = '', opening = false, lastMs = null, short = false } = {}) {
  const me = view.me;
  const objectives = [...view.objectives]
    .map((o) => ({ o, d: distXZ(me, o.at) }))
    .sort((a, b) => a.d - b.d).slice(0, opening ? 10 : 18)
    .map(({ o, d }) => {
      const tags = Object.entries(o).filter(([k]) => !['id', 'kind', 'at', 'team', 'state', 'looted', 'seenItems', 'head', 'stock'].includes(k)).map(([k, v]) => `${k}=${v}`).join(' ');
      const condition = isOpen(o) ? 'open' : o.looted ? 'looted by me' : o.state;
      return `- ${o.id}: ${o.kind}, ${relationOf(o, me)}, ${condition}, at [${o.at.map(Math.round).join(', ')}], ${Math.round(d)} blocks away, ${dyText(o.at[1] - me.at.y)}${tags ? `, ${tags}` : ''}${o.stock ? `, stock ${JSON.stringify(o.stock)}` : ''}`;
    });
  const places = [...view.places]
    .map((p) => ({ p, d: distXZ(me, p.at) }))
    .sort((a, b) => a.d - b.d).slice(0, opening ? 8 : 14)
    .map(({ p, d }) => `- ${p.id}: ${p.kind}${p.team || (p.slot !== undefined && p.slot !== null) ? ` (${relationOf(p, me)})` : ''} at [${p.at.map(Math.round).join(', ')}], ${Math.round(d)} blocks away, ${dyText(p.at[1] - me.at.y)}`);
  const foes = enemies.map((e) => `- ${e.name || e.id}${e.team ? ` [${e.team}]` : ''} at [${[e.x, e.y, e.z].map((v) => Math.round(v ?? 0)).join(', ')}], ${r1(distXZ(me, [e.x ?? 0, e.y ?? me.at.y, e.z ?? 0]))} blocks away, ${dyText((e.y ?? me.at.y) - me.at.y)}${Number.isFinite(e.health) ? `, health ${r1(e.health)}` : ''}`);
  const rules = view.rules ?? {};
  const teams = rules.teams ? 'teams' : 'free-for-all';
  const limit = Number.isFinite(rules.timeLimit) && rules.timeLimit !== null ? `, time limit ${rules.timeLimit} s` : '';
  const carry = `weapon ${r1(facts['me.weapon'])}${facts['me.hasBow'] ? `, bow (${facts['me.arrows']} arrows)` : ''}, armour ${facts['me.armor']} pieces/${r1(facts['me.armorPoints'])} points, ${facts['me.blocks']} blocks${facts['me.gapples'] ? `, ${facts['me.gapples']} golden apples` : ''}${facts['me.pearls'] ? `, ${facts['me.pearls']} pearls` : ''}${facts['me.wool'] ? `, ${facts['me.wool']} wool` : ''}`;
  const resources = `iron ${r1(facts['me.iron'])}, gold ${r1(facts['me.gold'])}, diamond ${r1(facts['me.diamond'])}, emerald ${r1(facts['me.emerald'])}`;
  let kit = '';
  try { kit = view.me.kit && Object.keys(view.me.kit).length ? `; kit ${JSON.stringify(view.me.kit)}` : ''; } catch { kit = ''; }
  let ability = '';
  try { ability = view.me.ability ? `; ability ${JSON.stringify(view.me.ability)}` : ''; } catch { ability = ''; }
  const statTotal = Object.values(lastStats ?? {}).reduce((a, b) => a + b, 0);
  const statDefault = (lastStats?.otherwise ?? 0) + (lastStats?.fallback ?? 0);
  const statNote = lastPlan && statTotal >= 15 && statDefault / statTotal >= 0.8
    ? ` The scripted default decided ${Math.round((100 * statDefault) / statTotal)}% of those ticks: your rules barely applied.`
    : '';
  // Make the exact crossing costs salient. The model has repeatedly written a guessed fixed block count (32, 40, 56)
  // for a bridge even though the fact is in FACTS; a short dedicated line is what it tends to copy into a condition.
  const budgets = Object.entries(facts)
    .filter(([k, v]) => /\.void$/.test(k) && Number.isFinite(v) && v > 0)
    .sort((a, b) => a[1] - b[1]).slice(0, 8)
    .map(([k, v]) => `${k}=${Math.round(v)}`)
    .join(', ');
  return [
    `GAME: ${view.game}; goal ${rules.goal ?? 'unknown'}, ${teams}, ${rules.respawn ? 'respawn on' : 'no respawn'}${limit}. RULES: ${rules.text ?? ''}`,
    `ME: at [${[me.at.x, me.at.y, me.at.z].map(Math.round).join(', ')}]${me.team ? `, team ${me.team}` : ''}${me.slot !== null && me.slot !== undefined ? `, slot ${me.slot}` : ''}; difficulty ${me.difficulty}${me.style ? `, style ${me.style}` : ''}; carrying ${carry}; ${resources}${kit}${ability}; can bridge about ${facts['me.blocks']} blocks of void; ${facts['me.voidNear']} void cells within 3 blocks of my feet; ${facts['me.dropNear']} cells with ground 3+ blocks lower around me.`,
    me.canAct ? '' : `STATUS: the round is in "${view.phase}" and I cannot act yet; the plan will run when play starts.`,
    facts['me.voidNear'] > 0 || facts['me.dropNear'] > 0
      ? `EDGE: ${facts['me.voidNear']} void cells and ${facts['me.dropNear']} cells with a 3+ block drop within 3 blocks. Put a leave-edge rule above every fight rule; on high ground prefer hide or default to a blind flee, which can step off the ledge.`
      : '',
    opening ? 'OPENING QUESTION: play has not started. Answer with an OPENING plan of 2-4 rules only, in compact JSON. One rule MUST handle a close foe (fight, shoot, or leave-edge). If any rule crosses void or a bridge, put a leave-edge rule above it and gate the crossing on enemies.nearest > 10 (or enemies.seen == 0); a reflex fight on a bridge falls. Write only the opening rules where you want to differ from the script; "otherwise": {"do":"default"} still covers routine play. Do not use time.elapsed to hand the opening to default. If the time limit is short (under about 2 minutes), this opening plan may be the whole round: include the action that wins.' : '',
    short ? 'SHORT ANSWER: the last question did not complete in time. Answer with 2-3 rules only -- the one action that wins and one survival rule -- in compact JSON. No prose.' : '',
    `TIME: ${Math.round(view.elapsed)} s played${Number.isFinite(view.timeLeft ?? Infinity) && view.timeLeft !== null ? `, ${Math.round(view.timeLeft)} s left` : ''}${view.next ? `; next: ${view.next.label} in ${Math.round(view.next.in)} s` : ''}.`,
    `KINDS: ${kindsSummary(view) || 'none'}. PLACE KINDS: ${placesSummary(view) || 'none'}.`,
    `FACTS: ${factsText(facts)}`,
    budgets ? `BRIDGE BUDGET (void cells on the straight route to the nearest open objective): ${budgets}. Use the exact fact in the condition, with a margin; never a fixed block count.` : '',
    view.objectives.length > 18 ? 'PLAN SHAPE: many objectives; keep the plan to 3-6 rules and make one of them the action that wins.' : '',
    `PLAYERS: ${view.players.map((p) => `${p.name || p.id}${p.id === me.id ? ' (me)' : ''}${p.team ? ` [${p.team}]` : ''} ${p.alive ? 'alive' : 'out'}`).join(', ')}`,
    `FOES I SEE (nearest first${Number.isFinite(facts['enemies.nearestVoid']) ? `; ${facts['enemies.nearestVoid']} void cells on the straight route to the nearest` : ''}):\n${foes.join('\n') || '- none'}`,
    `OBJECTIVES (nearest first):\n${objectives.join('\n') || '- none'}`,
    `PLACES:\n${places.join('\n') || '- none'}`,
    `SINCE YOUR LAST PLAN: ${events.join('; ') || 'nothing yet (the round is starting)'}`,
    lastPlan ? `YOUR LAST PLAN: ${JSON.stringify(lastPlan)}\nHOW IT WENT (ticks each rule ran): ${JSON.stringify(lastStats ?? {})}.${statNote}${Number.isFinite(lastMs) && lastMs > 0 ? ` The last answer took ${r1(lastMs / 1000)} s; the round moved on while I thought.${lastMs > 15000 ? ' Write a shorter plan this time: 3-4 rules that change the outcome, not a catalogue.' : ''}` : ''}` : 'YOUR LAST PLAN: none',
    lastBlocked && Object.keys(lastBlocked).length ? `MATCHED BUT COULD NOT ACT (ticks): ${JSON.stringify(lastBlocked)}. A rule fails here when its target is gone, or when a bridge needs more void blocks than I carry; fix that rule or put a blocks-earning rule above it.` : '',
    lastErrors ? `YOUR LAST ANSWER WAS REJECTED: ${lastErrors.slice(0, 8).join('; ')}` : '',
    notes && !opening ? `NOTES FROM EARLIER GAMES:\n${notes}` : '',
    'Your plan (JSON only):',
  ].filter(Boolean).join('\n\n');
}

export class SlowThinker {
  /**
   * `ask(system, user)` -> the model's text. `minIntervalMs`: the least time between questions; `ttlMs`: how long a
   * plan lasts before it is renewed; `notes`: text from earlier games. `clock` for tests.
   */
  constructor({ ask, minIntervalMs = 6000, ttlMs = 30000, askTimeoutMs = 45000, notes = '', clock = () => Date.now(), guide = PLAN_GUIDE, describe = describeForModel } = {}) {
    Object.assign(this, { ask, minIntervalMs, ttlMs, askTimeoutMs, notes, clock, guide, describe });
    this.plan = null;
    this.planAt = 0;
    this.planOpening = false; // the running plan was asked in the countdown; it is not the full plan yet
    this.forceShort = false;  // the last question timed out; the next answer should be 2-3 rules
    this.busy = false;
    this.lastAskAt = -Infinity;
    this.pending = [];      // reasons waiting for the next question
    this.events = [];       // what happened since the last plan
    this.stats = {};        // ticks each rule ran under the current plan
    this.blockedStats = {}; // ticks each rule matched but could not act (no reachable target)
    this.planTicks = 0;     // ticks under the current plan, and how many the scripted default decided
    this.defaultTicks = 0;
    this.warnedDefault = false;
    this.longRuleWarned = null;
    this.seen = null;       // the last observation, to notice changes
    this.history = [];      // every question and answer: { at, reasons, plan, errors, ms }
    this.stuckTicks = 0;
  }

  /** Each brain tick, before the plan runs: notice what changed, and ask when there is reason to. */
  observe(view, enemies, session = null) {
    // In the countdown the bot cannot act, but the round's layout, gear and rules are already known: ask for a SHORT
    // opening plan now (see OPENING QUESTION), then ask for the full plan when play starts. A full plan asked in the
    // countdown is answered seconds later, when its time-based opening has already gone stale.
    const playing = view.phase === 'playing' && view.me.canAct;
    if (!playing && view.phase !== 'countdown') { this.seen = null; return; }
    const now = this.clock();
    const facts = computeFacts(view, enemies, session);
    const open = {};
    for (const [k, v] of Object.entries(facts)) if (/\.any\.open$/.test(k)) open[k.split('.')[0]] = v;
    const s = {
      phase: view.phase,
      alive: facts['enemies.alive'],
      seenFoes: facts['enemies.seen'],
      open,
      health: facts['me.health'],
      gapples: facts['me.gapples'],
      food: facts['me.food'],
      blocks: facts['me.blocks'],
      weapon: facts['me.weapon'],
      hasBow: facts['me.hasBow'],
      arrows: facts['me.arrows'],
      nearest: facts['enemies.nearest'],
      weakest: facts['enemies.seen'] > 0 ? facts['enemies.weakestHealth'] : Infinity,
      nextIn: facts['time.next'],
      timeLeft: facts['time.left'],
      players: view.players.map((p) => `${p.name || p.id}:${p.alive}`).join(','),
    };
    if (!this.seen) this.want(playing ? 'the round started (or I am back in it)' : 'the round is about to start');
    else {
      const p = this.seen;
      if (p.phase === 'countdown' && s.phase === 'playing') this.want('play has started: the opening plan is over; give the full plan');
      if (s.alive < p.alive) this.want(`a foe died (${s.alive} left)`);
      if (s.alive > p.alive) this.want(`more foes (${s.alive})`);
      if (p.seenFoes === 0 && s.seenFoes > 0) this.want('I can see a foe now');
      if (p.seenFoes > 0 && s.seenFoes === 0) this.want('the foe is out of sight');
      for (const kind of new Set([...Object.keys(s.open), ...Object.keys(p.open)])) {
        const v = s.open[kind] ?? 0, before = p.open[kind] ?? 0;
        if (v > before) this.want(`${kind}s became available (${before} -> ${v})`);
        if (v < before) this.want(kind === 'bed' ? `a bed was broken (${before} -> ${v} standing)` : `${kind}s are gone (${before} -> ${v})`);
      }
      if (s.health < 10 && p.health >= 10) this.want(`I am hurt (${Math.round(s.health)} health)`);
      else if (s.health <= p.health - 4) this.want(`I lost health (${Math.round(p.health)} -> ${Math.round(s.health)})`);
      if (s.health <= 8 && s.gapples === 0 && p.health > 8) {
        this.want(`I am badly hurt (${Math.round(s.health)} health) with nothing to heal me (0 gapples, food ${Math.round(s.food)})`);
      }
      if (s.weapon > p.weapon + 0.01) this.want(`I have a better weapon now (damage ${Math.round(s.weapon)})`);
      if (s.blocks < 4 && p.blocks >= 4) this.want('I am low on blocks');
      if (p.hasBow === 0 && s.hasBow === 1) this.want(`I have a bow now (${s.arrows} arrows): shoot at range before closing`);
      else if (s.hasBow === 1 && s.arrows >= 8 && (p.arrows ?? 0) < 8) this.want(`I have ${s.arrows} arrows now: use the bow at range, not only when hurt`);
      if (s.nearest <= 9 && p.nearest > 9) this.want(`a foe is close (${Math.round(s.nearest)} blocks)`);
      if (p.nearest <= 9 && s.nearest > 11) this.want('the close foe is gone');
      const weak = (hp) => Number.isFinite(hp) && hp <= 8;
      if (s.seenFoes > 0 && weak(s.weakest) && !weak(p.weakest)) {
        this.want(`a foe is nearly dead (${Math.round(s.weakest)} health): finish it now, before it heals`);
      }
      if (Number.isFinite(s.nextIn) && s.nextIn <= 15 && (!Number.isFinite(p.nextIn) || p.nextIn > 15)) {
        this.want(`the next event (${view.next?.label ?? 'scheduled'}) is in ${Math.round(s.nextIn)} s`);
      }
      // The deadline: a draw is not a win, so the plan must be thinking about the finish well before the end.
      if (Number.isFinite(s.timeLeft) && Number.isFinite(p.timeLeft)) {
        for (const mark of [120, 60]) if (s.timeLeft <= mark && p.timeLeft > mark) {
          this.want(`${mark} s left: the round deadline is close; the plan must force the win, not wait`);
        }
      }
      if (this.plan && now - this.planAt > this.ttlMs) this.want('the plan ran its time');
    }
    // The opening answer can arrive after play has started, so the countdown -> playing transition may already be
    // behind this.seen by the time the plan is installed. Never let an opening plan silently become the whole round:
    // while it is the running plan and play is on, ask for the full plan.
    if (playing && this.plan && this.planOpening && !this.busy) this.want('the opening plan is still running: give the full plan for the rest of the round');
    // With no plan (first tick, or the last answer was rejected) the bot is on the scripted play: keep asking.
    if (!this.plan) this.want('I have no valid plan yet');
    this.seen = s;
    if (this.pending.length && !this.busy && now - this.lastAskAt >= this.minIntervalMs) void this.think(view, enemies, facts);
  }

  want(reason) { if (!this.pending.includes(reason)) this.pending.push(reason); }

  /** After each tick: what the plan did, to count it and to notice a rule that gets nowhere, or a plan that does. */
  noteResult(result, moved) {
    if (!this.plan || !result) return;
    this.stats[result.by] = (this.stats[result.by] ?? 0) + 1;
    this.planTicks += 1;
    if (result.by === 'otherwise' || result.by === 'fallback') this.defaultTicks += 1;
    // A rule that keeps matching but cannot act is usually a target the bot cannot reach or a bridge it cannot pay for.
    for (const id of result.blocked ?? []) {
      this.blockedStats[id] = (this.blockedStats[id] ?? 0) + 1;
      if (this.blockedStats[id] === 8) this.want(`rule "${id}" has matched but could not act ${this.blockedStats[id]} times; its target may be unreachable or the bridge unaffordable`);
    }
    // One rule deciding a long run of ticks is either the winning plan or a loop; ask the model which.
    if (result.by !== 'reflex' && result.by !== 'otherwise' && result.by !== 'fallback') {
      const ticks = this.stats[result.by] ?? 0;
      if (ticks >= 40 && this.longRuleWarned !== result.by) {
        this.longRuleWarned = result.by;
        this.want(`rule "${result.by}" has decided ${ticks} ticks; if it is not making progress, change its condition or target`);
      }
    }
    this.stuckTicks = moved ? 0 : this.stuckTicks + 1;
    if (this.stuckTicks >= 12) { this.stuckTicks = 0; this.want(`the bot has not moved for a while under rule "${result.by}" (${result.action})`); }
    if (!this.warnedDefault && this.planTicks >= 24 && this.defaultTicks / this.planTicks >= 0.8) {
      this.warnedDefault = true;
      this.want(`the scripted default has decided ${this.defaultTicks} of my last ${this.planTicks} ticks; my rules are not applying`);
    }
  }

  /** `ask`, but never longer than askTimeoutMs: a slow model must not block the next planning chance forever. */
  async askWithTimeout(system, user) {
    if (!this.askTimeoutMs) return this.ask(system, user);
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`the model did not answer within ${Math.round(this.askTimeoutMs / 1000)} s`)), this.askTimeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => this.ask(system, user)), timeout]);
    } finally { clearTimeout(timer); }
  }

  async think(view, enemies, facts) {
    this.busy = true;
    const reasons = this.pending.splice(0);
    this.events.push(...reasons);
    if (this.events.length > 24) this.events = this.events.slice(-24);
    this.lastAskAt = this.clock();
    const started = this.clock();
    const previous = this.history[this.history.length - 1];
    const lastErrors = previous && !previous.plan ? previous.errors : null;
    // How the plan it replaces went: the ticks each of its rules ran, and the rules it could not act on.
    const entry = { at: view.elapsed, reasons, plan: null, errors: null, ms: 0, previousRan: { ...this.stats }, previousBlocked: { ...this.blockedStats } };
    try {
      const user = this.describe(view, facts, enemies, {
        events: this.events, lastPlan: this.plan, lastStats: this.stats, lastBlocked: this.blockedStats,
        lastErrors, notes: this.notes, opening: view.phase === 'countdown', short: this.forceShort,
        lastMs: this.history.length ? this.history[this.history.length - 1].ms : null,
      });
      let text = await this.askWithTimeout(this.guide, user);
      let parsed = extractJson(text);
      if (parsed && !parsed.rules && parsed.plan && typeof parsed.plan === 'object') parsed = parsed.plan;
      let checked = parsed ? validatePlan(parsed) : { ok: false, errors: ['no JSON object in the answer'] };
      if (!checked.ok) {
        // One more try, told exactly what was wrong.
        text = await this.askWithTimeout(this.guide, `${user}\n\nYour last answer was not a valid plan: ${checked.errors.slice(0, 8).join('; ')}. Answer with the JSON plan only, following the schema and the examples.`);
        parsed = extractJson(text);
        if (parsed && !parsed.rules && parsed.plan && typeof parsed.plan === 'object') parsed = parsed.plan;
        checked = parsed ? validatePlan(parsed) : { ok: false, errors: ['no JSON object in the answer'] };
      }
      if (checked.ok) {
        this.plan = checked.plan; this.planAt = this.clock();
        this.planOpening = view.phase === 'countdown';
        this.forceShort = false;
        this.stats = {}; this.blockedStats = {}; this.planTicks = 0; this.defaultTicks = 0;
        this.warnedDefault = false; this.longRuleWarned = null;
        this.events = []; this.stuckTicks = 0;
        entry.plan = checked.plan;
      } else {
        entry.errors = checked.errors;
        this.want('my last answer was not usable; the plan did not change');
      }
    } catch (err) {
      entry.errors = [String(err?.message ?? err)];
      if (/did not answer within/i.test(String(err?.message ?? err))) this.forceShort = true;
      this.want('the last question did not complete; asking again');
    } finally {
      entry.ms = this.clock() - started;
      this.history.push(entry);
      this.busy = false;
    }
  }
}
