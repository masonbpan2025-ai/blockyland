# SkyWars Bot Master Strategy: Winning on Any Map in 5-Player FFA

## 1. Analysis of Map Variations & Dynamic Environment

In the SkyWars tournament, maps progress from simple single-height rings to complex layouts with multiple heights, towers, staircases, and unconventional middle structures. The bot must never assume a static map layout, fixed coordinates like `(0.5, 0.5)`, or a uniform `y = 31`.

### Map Archetypes & Environmental Factors
1. **Classic Ring (`classic`)**:
   - Single central island at `(0, 0)` with 4 center chests at `y ≈ 31`.
   - 8 spawn islands at radius 23-25; void gap ~9-11 blocks.
   - Baseline layout: straightforward bridging to center.

2. **Archipelago (`archipelago`)**:
   - Spawns far out (radius 32-34).
   - 4-8 small connector ("mid") islands at radius 19-21, each with 1 chest, at random heights `y = surfaceY ± 2`.
   - Center island is smaller (radius 6-7).
   - Direct jump to mid is impossible: bot must step through connector islands to save blocks and loot intermediate chests.

3. **Citadel (`citadel`)**:
   - Vertical elevation: spawns are lower (`surfaceY - [1, 3]`), center is elevated (`surfaceY + [1, 2]`).
   - Four corner towers (height +4 to +6 above center) with walls and a single door facing center `(0, 0)`.
   - Chests are inside the towers at ground level; the keep houses the enchanting table.
   - Navigating towers requires entering through doors, not slamming into outer walls.

4. **Sectors (`sectors`)**:
   - Spawns arranged in 4 sector pairs around 4 sector islands (radius 16-17) with 2 chests each.
   - Center island with 6 chests.
   - Sector islands provide fast initial expansion before center contest.

5. **Twin Peaks (`twin_peaks`)**:
   - **CRITICAL**: No island at `(0, 0)`!
   - East peak at `(+apart, 0)` is HIGH (`surfaceY + [4, 6]`) with 3 center chests.
   - West peak at `(-apart, 0)` is LOW (`surfaceY - [4, 6]`) with 3 center chests.
   - North and south stepping islands with 1 chest each.
   - Any hardcoded move toward `(0.5, 31, 0.5)` bridges into the abyss! Target must be dynamically derived from actual places and chests.

6. **Sky Tiers (`tiers`)**:
   - Center island has a multi-tier structure: ground level and a 7x7 platform 6 blocks up (`top = y + 6`) accessible via a staircase on the south edge.
   - Stepping islands between spawns at `surfaceY + 3` and `surfaceY - 3`.
   - High-tier chests are split between top platform and foot of tower.

7. **Sub-Mid Cross (`sub_mids`)**:
   - Center island plus 4 sub-middle islands placed lower (`surfaceY - 3`), each with 2 chests.
   - Fights frequently happen at different vertical levels.

8. **Rush (`rush`)**:
   - Close spawn islands (radius 21-22) with pre-built 1-block wide bridges to center.
   - Immediate combat potential; bridging is unnecessary initially, but bridge combat hazards (getting knocked into void) are elevated.

---

## 2. 5-Player Free-For-All (FFA) Dynamics & Game Theory

Unlike 1v1 duels where trading damage or rushing is zero-sum, a 5-player FFA is governed by survival ranking:
- **Placement & Scoring**: Your score equals the number of players you outlast. Surviving while opponents eliminate each other directly boosts points.
- **The Third-Party Hazard**:
  - In a 1v1v1 encounter, engaging first almost always leads to death: while trading hits with Player A, Player B hits you in the back.
  - The baseline bot blindly attacks `foe = enemies[0]` if within 8 blocks. In FFA, this causes suicidal dives into existing brawls.
- **The "Vulture" / Opportunist Advantage**:
  - When two opponents fight, the optimal tactic is to position just outside melee range (or harass with ranged weapons: snowballs, eggs, bow).
  - Once an opponent dies or reaches critical health (< 8 HP), strike the weakened survivor.
  - Collect dropped player gear (fallen enemies drop all weapons, armor, gapples, pearls).
- **Anti-Sandwich Positioning**:
  - If multiple enemies are within proximity, never stay between them.
  - Fall back toward solid island interior (`islandSpot`), keeping all foes in front.

---

## 3. Architecture of Improvements for `bot/`

### A. Dynamic Map & Target Discovery (`bot/scriptedBot/playbooks/skywars.mjs`)
1. **Dynamic Center/Mid Target Resolution**:
   - Remove hardcoded `(0.5, 0.5)` and `y = 31`.
   - Locate the true centers from `view.places`: look for `kind === 'middle'`, or cluster centroids of `ring === 'center'` objectives.
   - For `twin_peaks`, choose the closest peak (east or west) or stepping island.
2. **3D Distance & Reachability Metric**:
   - Weight vertical distance: chests far above/below require stair-stepping or climbing, chests on the same plane are faster to reach.
   - Account for available blocks before attempting long void crossings.
3. **Smart Chest Prioritization**:
   - Home spawn chests first until equipped with a solid weapon (damage ≥ 5), 1+ armor piece, and sufficient building blocks.
   - Transition to nearest viable unlooted mid/center chest.

### B. FFA Combat Strategy & Target Selection (`bot/scriptedBot/playbooks/skywars.mjs` & `scriptedBot.mjs`)
1. **Multi-Enemy Awareness**:
   - Inspect all visible enemies (`skills.enemies()`).
   - If 2+ enemies are in close range (<= 9 blocks):
     - Check if they are fighting each other (distance between Enemy 0 and Enemy 1 < 4 blocks).
     - If they are fighting each other and not actively hitting Gemini, HOLD GROUND or harass from 5-8 blocks with snowballs/bow, rather than leaping between them.
     - If Gemini is targeted/hit, focus the closest aggressor or back off to safe ground.
2. **Prioritize Weakened Foes**:
   - Among nearby enemies, prefer targeting foes with low health or without armor, as eliminating them immediately reduces threat count and triggers placement score.
3. **Safe Disengagement & Recovery**:
   - Maintain proactive golden apple consumption before entering melee when room allows.
   - Avoid corner and rim traps when multiple opponents are present.

### C. Combat Mechanics & Edge Protection (`bot/scriptedBot/scriptedBot.mjs`)
1. **Never Trade on Rims**:
   - Use `islandSpot` and enhanced `saferSpot` to prevent getting sprint-knocked into the void.
2. **Ranged Interruption**:
   - Use snowballs/eggs against opponents crossing narrow bridges or fighting on edges to knock them into the void.
3. **Pearl Preservation & Clutch**:
   - Reserve ender pearls for recovery clutches (`pearlClutch`) and escape, rather than aggressive forward teleports into multi-enemy clusters.

---

## 4. Verification & Testing Plan
- Run `node check.mjs` after every single modification to ensure strict compliance with game limits, profile matching, and scenario replays.
- Write unit tests in `tests/` covering:
  - Target selection logic under multi-enemy scenarios.
  - Map center resolution for all 8 templates (including `twin_peaks`, `tiers`, `citadel`).
  - Chest filtering and nearest-target ranking.
- Run `node test.mjs` to execute automated test suites.
- Execute practice games via `node practice.mjs [template] [seed] 4` to validate performance in live 5-player simulations.
