# Changes to Sol's Bed Wars bot

## Strategy

- Replaced the inherited Bed Wars decision loop with a survival-first five-team strategy. Roles remain deterministic by teammate names, including respawning teammates.
- Split the forge while equipping the team. Save gold for permanent iron armour before apples. The main fighters and defender deploy together around 135 seconds, rather than sending two lightly armoured players out while leaving the defender alone indefinitely.
- The collector stocks armour and a real crossing reserve, collects diamonds, and returns to our keeper for Protection, Sharpness, and further Protection. Team combat upgrades now outrank late forge investment.
- Paired raids require a nearby partner, an exposed bed, sufficient blocks and health, and enough time before the raid deadline. Raid targets persist throughout the crossing.
- Focus nearby enemies that teammates can hit. Eat apples before contact. Regear after respawn, including a late emergency pickup instead of leaving home empty-handed.
- The defender saves gold for iron armour, a bow, and arrows instead of buying an iron sword first. It joins the advance after a short bounded ammunition stop. Ranged attacks from wide ground punish bridge crossings; evacuation still takes priority.

## Closing zone

- Use the host's published time limit, including the 360-second practice limit. At 45% of the match, all roles stop outer work and rally on the middle. Ordinary departures happen earlier.
- Any accumulated void exposure, low elevation, or approaching border overrides fights and shopping. A legal cooldown-limited strike can accompany an emergency retreat; it cannot hold the player outside.
- Stay in the eventual central fighting area rather than following the current border. Do not chase opponents toward outer bases after evacuation starts. A damaged bed cannot recall the deployed defender.

## Navigation

- Added an island graph using this round's landmarks, height penalties, and bridge costs. Routes retain their waypoints so they do not reverse halfway across a gap.
- Read the middle's real height from the published map plan or the guest arena's `midY` field. The host and guest have different arena shapes; a fixed y=31 would fail on elevated layouts.
- Terrain travel climbs before a high island's rim, descends onto lower islands with the existing safe-drop skill, and escapes sideways before ascending if already under an island roof.
- Budget for diagonal connecting blocks, ascent, and a reserve. Walk over continuous ground without unnecessarily building a floor. Collection requires arrival at the correct elevation.
- Leave room for allies on narrow bridges because players physically push each other. Exposure overrides this spacing pause.

## Validation and practice

- The required `node check.mjs` has passed after each completed edit (120 recorded Bed Wars scenarios, exports, imports, and unchanged difficulty limits).
- Decision tests cover role stability, all four bed orientations, scaled deadlines, exposed bed targeting, persistent raids, armour saving, coordinated departure, late respawn supplies, team upgrades, and zone priority.
- Navigation tests cover elevation, under-island escape, generator reach, bridge spacing, and finite routes across 100 generated maps with all five starting positions.
- Physical terrain tests use the real hard-difficulty movement, collision rules, inventory, and gravity. Seven runs passed: Compact (83), Standard (83), Flanks (83), High Middle (133 and 7), and Archipelago (133 and 71). Each reached the middle's top using its actual shop block budget, with at least eight blocks left over.
- Final `node test.mjs`: all 39 tests passed, with zero failures (24 strategy decisions, eight navigation/property checks, and seven physical terrain runs). The property checks cover 100 generated maps and all five starting positions.
- Practice 1: Compact Middle, seed 37, four opposing squads, red team. The initial revision finished fifth; referee reported nothing. Sol earned two final kills, but its four final deaths were combat deaths. This prompted the stronger armour saving and earlier grouped deployment described above. The recording has very sparse samples and reports 959 seconds for this nominal six-minute game, limiting detailed timing analysis.
- Further full five-team games were requested on Archipelago (71), High Middle (109), and Compact Middle (173). At final verification the Archipelago game was still running and the other two requests were queued. The final revision has not yet demonstrated a practice win; the verified navigation and decision tests do not establish a competitive win rate.

All play still goes through the session's legal skills. BOT_SKILLS, difficulty profiles, reach, weapon cooldowns, speeds, and bridge pauses are unchanged. No items are created by the bot.

## Round 2: timed digging and the higher void floor

### Evidence and priorities

The arena-supplied frozen-bot games both won: practice 5 on High Middle (seed 921212153, Aqua) and practice 6 on Archipelago (840405732, Red), both with clean referee reports. In High Middle our bed fell early and Sol4 was then eliminated. The team survived on the actual middle surface. I retained early central migration and concentrated this round on defence, tools, and the harder open-ground combat on Compact.

### Changes

- Added a mining planner that chooses a reachable open bed half or a covering block and keeps that block until it breaks. It chooses the fastest real owned tool with the game's `breakMs`, including Efficiency, Haste, and the airborne penalty. No game timers or item stacks are changed. A short action-sized loop holds the dig across calls and yields at the existing step pace; subsequent decisions continue it. The exposed head can be dug when the foot is out of reach.
- The defender reserves 24 iron for twelve end-stone blocks: eight inner faces and four roof cells. The wool outer shell is optional and time-bounded. Rushers buy permanent wooden pickaxes, and the primary miner buys shears before an optional iron-pickaxe upgrade. Raids account for estimated cover time and reject a cover taking over twelve seconds with the current tools.
- Corrected the archer economy. Buying iron armour first postponed the bow beyond departure. The defender now buys chain armour, a bow, and ammunition, then can depart with that kit. Iron armour is a later upgrade.
- Fixed a navigation bug exposed by the second practice: after construction the defender could be stranded on its roof, because safe descent was attempted only near the distant forge. Travel now looks for a safe landing whenever the goal is substantially lower, before spending blocks at roof height. A harmless drop remains allowed at low health; damaging drops retain the health reserve. The native regression constructs the defence and returns to the forge with just two wool blocks and three health.
- Tightened the final combat area to about 4.75 blocks around the middle, preserving central cohesion instead of pursuing several enemies at the rim. A shared team radio holds target ids for two pairs; each bot uses its own delayed enemy observation. Pairs choose different targets when possible, and allied melee swings on one enemy are spaced at least 520 ms apart to avoid Java's damage-protection window. Individual weapon cooldowns, damage, turning, reach, and difficulty profiles remain unchanged.
- The final safe-height test now requires the actual top surface. Physical navigation tests also check the host's final zone, including its one-block floor and under-island rule.

### Practice and validation

- Practice 7: Compact, seed 2813, Blue, four opposing squads. Fourth place, outlasting Aqua; clean referee. The twelve hard cells were built, and our bed survived until scheduled Bed Destruction. Final losses were combat deaths. The log exposed optional wool taking too long and the archer never buying a bow.
- Practice 8: same Compact seed, Green, four opposing squads. Fourth place, outlasting Aqua; clean referee. The shared-target and central-leash revision was present, but the defender became stranded after construction. This led to the safe-descent regression and fix above.
- Both permitted new practice slots were used. The final roof-descent and paired swing-timing changes were made after practice 8; no further competitive win is claimed for those changes.
- Added real-client regressions for end-stone and wool dig progress, the 1.25-second interruption, keeping a target despite a cheaper cover appearing, exposed head reach, obsidian tool tiers, action-sized repeated digs, paid material and bow purchases, low-resource roof escape, and coordinated sword swings against the game's actual hurt-window function.
- All seven physical map cases passed after the descent fix and satisfy the stricter final zone check. Final full-suite and required-check results are recorded below.

Final verification for this round: `node test.mjs` passed all **66 tests**, with zero failures, including the low-health roof exit, native timed mining and combat, and seven physical terrain cases. `node check.mjs` passed all **120 recorded Bed Wars scenarios**, with the required exports and unchanged difficulty profiles.
