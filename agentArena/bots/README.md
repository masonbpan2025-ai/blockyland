# House bots

Strategy programs for SkyWars and Bed Wars with **no AI behind them**: they use only the arena's bot API
(`agentArena/docs/strategy-api.md`), under the same reaction time, speeds and view rules as an agent's program.

| File | What |
| --- | --- |
| `core.js` | shared: gear and inventory helpers, safe bridging and stepping, walking, combat reflexes, the planner's search engine |
| `skywars.game.js`, `bedwars.game.js` | each game's model for the planner, its moves in the real game, and `main` |
| `skywars.js`, `bedwars.js` | **generated** (`node agentArena/bots/build.mjs`): core + game, the self-contained files the arena runs |
| `build.mjs` | builds them; `--check` fails when a built file is out of date (`tests/houseBots.test.js` runs it) |

Play them against each other, or one against any strategy file:

```
node agentArena/houseMatch.mjs skywars [--a bots/skywars.js] [--b <file>|dummy] [--seconds N] [--no-video] [--practice-map]
node agentArena/houseMatch.mjs bedwars [--layout standard|offset|...] [--seconds N]
```

## How they decide

Two layers.

- **Reflexes**, every moment: a foe within fighting range is fought (sprint hits at the sword's cooldown with a sprint
  reset for knockback, a golden apple when hurt, no step that is not onto ground, sneaking and no sprint on a bridge); a
  heard foe is faced; in Bed Wars a foe at my bed is fought when I am there to defend it.
- **The planner**, between moves: a small **Monte Carlo tree search**. There is rarely one best next step -- two chests
  opened and good loot already: open the third, or rush the middle before the other player gets there? -- so the bot
  estimates. It simulates the rest of the round hundreds of times in a fast, rough model of the game and keeps the
  statistics in a tree (UCT, two moves deep, playouts after) over its own next moves:
  - SkyWars moves: loot my island's next chest, rush the middle, loot the middle, hunt, hold the middle, rush the other
    island. Bed Wars: farm the forge, buy wool, a sword or armour, cover the bed, rush the enemy bed, hunt, go home.
  - What it knows goes into the model: its gear (armour points worn, weapon damage), health, golden apples, blocks;
    the **void to bridge** toward each place, measured from the blocks along the way (so existing bridges and the
    layout of this map count); which chests are done; the beds and their wool cover, read from the world; where the
    other player was last seen and what it wore and held, or an estimate from the clock; and the time left.
  - In a playout both players act: chests give random loot, travel and bridging take time and blocks in proportion to
    the gaps, the other player follows a randomised sensible policy, a meeting (the same place, or crossing on the
    way) is a fight won with a probability that rises with the gear and health difference; in Bed Wars the loser
    respawns with nothing if its bed stands, and is out if not. A round not decided is worth less the less time is
    left, because a tie scores nothing.
- **Variation**: the move is drawn with probability rising with how often the search chose it (not always the top
  one), and each bot draws a **personality** at the start of a match -- greed, aggression, how loosely it chooses, how
  much it trusts its own strength -- so the same bot plays differently from game to game.

Every plan is logged (`plan <move> | <each move's visits and mean value> | <the state as modelled>`), so a round's
strategy log shows why it did what it did.

## Lessons built in (from `agentArena/runs/gemini-vs-deepseek-sw*` and the house matches)

- Rounds were lost to falls, not fights (sw1, sw3). A bridge block is placed only from the middle of the block below;
  the bot steps onto a new block only once it is seen in the world; it sneaks while bridging; and it moves in a way that
  allows for the arena's reaction time (150-210 ms on every press and release): hold forward and release early, then
  short taps. On an island it walks with the pathfinder, round obstacles (a lamp post on the straight line to the
  middle stopped the first version for four minutes).
- A program restarted mid-round went back to its first stage and walked off (sw5). The plan is worked out from the
  world every time, never from a remembered stage; the search yields every 15 ms, inside the arena's 50 ms limit.
- A round with nobody looking for the other was a tie (sw6). The planner values hunting, and values a tie at nothing.
- Fights on a one-block bridge are lost to one's own sprint: on narrow ground the bot keeps sneaking and never sprints.
- It must answer an attack (a player hit it from behind while it farmed; arrows knocked it off a bridge): it listens for its
  own hurts, and every long move -- bridging, farming, looting, covering a bed -- stops when it is hit or hears or sees a
  player within 10 blocks. Then it turns to the attacker: sword if close, bow if far and it has one, back to land if hit on
  a bridge by someone out of reach. While bridging it looks behind every five blocks and, with an enemy about, places a
  block either side of each step.
- **The scripted bot** (`agentArena/scriptedBot/`): one of the five bots the lobby's "Bot join" plays, with the four the AI
  models wrote in the arena (`agentArena/bots/ai/`, run by `agentArena/botHost.mjs`); by hand, `agentArena/scriptedBotJoin.mjs` (`--brain mcp`
  runs the MCP guest's own autopilot, `--brain program` these strategy programs) and the starting point of every agent
  in the scripted arena (`agentArena/scriptedArena.mjs`). DeepSeek built it in the arena's labs (as "houseBotDs": it
  beat the house bot 6 of 8, then 7 of 8 after its rewrite) and rewrote it on general skills; the house bot it replaced
  is gone. Its layers:
  - `base.mjs`: a guest player with a human's pace and the difficulty's skills (`BOT_SKILLS`), perception a reaction
    time late, turning, the bow, throws, pearls, pillaring, climbing down, flat bridging; the brain that runs a
    subclass's playbooks (or a slow thinker's plan over them: `agentArena/plans/`). It began as the house bots'
    autopilot, a fork of the MCP guest's autopilot (guestPeer.js `#brainSkyWars`, `#brainBedWars`).
  - `scriptedBot.mjs`: DeepSeek's fighting (bridge defence, edge sense, staying off the rim), eating (an apple before
    the blows, on a quiet foe), gear and getting unstuck.
  - `skills.mjs`: the general skills (`agentArena/skills/skills.mjs`: movement, combat, items, building, senses) and
    its own (its clock, an early apple, a safer spot, ...).
  - `playbooks/skywars.mjs`, `playbooks/bedwars.mjs`: what to do each tick, seeing only the general view of a round
    (`agentArena/skills/view.mjs`: the general state every mod reports, `packages/blockyland-mcp/generalState.js`) and
    acting only through skills.
  Melee reach is Minecraft's: 3 blocks from the eyes to the target's body (guestPeer.js meleeReachDistance).
  `agentArena/botMatch.mjs` plays it as `{ name, scripted: 'normal' }` (another version: `sessionModule`, a module
  exporting `ScriptedBotSession`), recorded for film (`scriptedRecording.mjs`) and judged by `referee.mjs`.
  Tests: tests/scriptedBot.test.js, tests/scriptedBotBase.test.js, tests/javaRules.test.js.
- **Java rules, the same at every difficulty** (shared guest code, the MCP autopilot included): weapon damage; attack
  recharge by weapon and the weaker early swing (ATTACK_COOLDOWN_MS, attackStrength); arrows 6 at full draw plus a
  critical 0-4; walking and sprinting speeds; hunger, saturation, natural regeneration, 1.6 s eating, golden apples'
  Regeneration II and absorption (vitalsTick, startEating); the bots' eating rule (healIfNeeded: a golden apple at 8
  health, food when hungry and alone); looting. **Difficulty is skill** (scriptedBot/base.mjs BOT_SKILLS, and the pace
  of thought and of bridging in DIFFICULTY_PROFILES): easy swings at half charge, never sprints, no projectiles, pearls
  or pillaring, no edge sense, wool-only Bed Wars shop; normal full-charge sprint hits, snowballs and a loose bow to 15
  blocks, a pearl clutch, pillaring, edge sense; hard adds critical hits or sprint resets, a leading bow to 30 blocks,
  pearls to close in, bridge defence, the full shop. Tests: tests/javaRules.test.js, tests/scriptedBotBase.test.js.
  And a human's pace (BOT_SKILLS, easy / normal / hard): reaction time 700 / 400 / 220 ms (it acts on what it saw
  that long ago; a swing at where it saw a foe misses if they have moved out of reach), turning 180 / 360 / 720
  degrees a second (it swings or shoots only once facing the target), hesitation (away from a fight, 40 / 20 / 5% of its
  decisions spent looking around), bridging (easy sneak-bridges at 1.3 blocks/s; a pause of 600 / 300 / 200 ms a
  block), looting (open 1.4 / 0.8 / 0.5 s, then 300 / 150 / 80 ms an item).
  Getting down, at every difficulty: with a foe 2+ blocks below and out of reach (or wedged), it walks off the nearest
  edge with ground below -- the smallest fall first, never one leaving it under 6 health, never the void (climbDown).
  Guests take Java's fall damage (each block past 3 hurts 1), so a drop costs what it costs a player.
- **A model as the slow thinker** (`agentArena/plans/`): `brain: 'planner'` puts a model (DeepSeek, `deepseekClient.mjs`) on
  top of the skills. `thinker.mjs` asks it for a plan when the round starts and when something changes (a player out,
  a bed broken, chests refilled, hurt, the plan old or stuck), never more than one question at a time; it is shown the
  rules text, general facts, objectives and places, the foes it sees and how its last plan went. A plan is JSON rules
  (`planRunner.mjs`: conditions over `facts.mjs`, actions that are skills with targets) that fast code runs every
  tick, with a reflex (fight a foe in reach) and `default` -- the scripted playbook -- where the plan has nothing to say,
  and for every tick until the first plan comes. `agentArena/plannerLab.mjs` plays the planner against the same bot
  without one, on SkyWars maps the scripted play does not suit (Twin Peaks, Sky Tiers, Sub-Mid Cross, Rush), and lets
  DeepSeek improve the planner between rounds. Tests: tests/planRunner.test.js.
- **Rules**: in the Agent Arena a house bot plays under the arena's limits (reaction time, perception, Java speeds).
  `scriptedBotJoin.mjs --brain program` plays under the **MCP autopilot's standard** at normal difficulty
  (`botRunner.playRules`): no reaction delay, every player's place known, normal speeds and hit cooldown, the
  autopilot's 5.8-block reach and 0.8 damage -- the terms an MCP agent's guest gets, so the two meet on equal terms. The
  program reads its rules in `bot.arena.rules` (`reach`, `reactionMs`) and swings from as far as they allow.
- **Ranged play** (the Gemini and DeepSeek series found that projectiles never left the hand: the bot API only ate food;
  it now fires and throws, `packages/blockyland-mcp/projectiles.js`): arrows and thrown items are aimed by simulating
  their flight (vanilla speed, drag and gravity), ahead of a moving target by the flight time, and only along a path
  clear of blocks; with cover in the way, a high lob over it (autoclef's "Bow master"). Snowballs and eggs go at a
  player on a bridge or an edge (knock-back into the void); arrows at 6-30 blocks. Falling into the void with an ender
  pearl, it throws it back onto the last wide ground (a pearl clutch).
- **Pillaring**: a foe above it and out of reach (on a ledge, on a pillar), it pillars up to their height: look down,
  jump, place a block in the cell it left.
- **Melee** (after CreepyNightmares/BedwarsPracticeBot's CombatEngine): it leads a moving target with its look, S-taps
  after a hit at close range, strafes between hits on wide ground, backs off hurt and outmatched with nothing to eat,
  fights any foe in sight within 10 blocks (its own hit knocks them past 6, and they come back), and stops bridging or
  walking when a foe in sight is close enough to hit it.
- **No unarmed rush**: it does not leave its island bare-handed while its own chests are unlooted (the autopilot loots
  first, then rushes, and met it on its bridge with an axe).
