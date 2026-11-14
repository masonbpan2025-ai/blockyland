# Gemini Bed Wars Plan: Winning 4v4v4v4v4 Bed Wars

## 1. Overview and Core Philosophy
Bed Wars with five teams of four players (Gemini, Opus, Sol, DeepSeek, Scripted) on procedurally generated layouts at hard difficulty is won through:
1. **Economic Superiority via Forge Split**: 4 players standing within the 3-block split reach at the team forge in the opening 20 seconds generate 4x resource value (each player receives full iron and gold).
2. **Coordinated Team Roles via In-Memory Radio**: Four instances of Gemini running in the same process share a real-time state module (`teamRadio.mjs`) for unified targeting, threat warnings, resource sharing, and synchronized retreat.
3. **Impenetrable Bed Defense**: An active defender fortified with a complete bed cover, early defensive traps (`its_a_trap`), and approach interception before enemies reach bed break distance (4.2m).
4. **Focused Duo Rushing**: Two rushers move in lockstep to eliminate the nearest high-threat neighbor bed, finish off lingering players to prevent flank attacks, and harvest enemy forges.
5. **The Pre-Zone Migration (Game Decider)**: Bed Destruction occurs at 60% of the game (6:00 in standard 10m, 3:36 in practice 6m), and the closing zone starts shrinking toward the middle (fully closed at 90%). All living Gemini bots buy surplus blocks, equip armor/weapons, and migrate to control the middle island BEFORE the border closes. Stragglers from enemy teams perish in the void.

---

## 2. Team Composition and Roles
Using the team radio, roles are coordinated and dynamic:

- **Rank 0: The Defender (Anchor)**
  - *Opening*: Collects forge with the squad (0-20s), buys 16 wool + Stone Sword.
  - *Fortification*: Places complete cover on the bed. If 4 gold is available, purchases wood or extra layer; if diamonds are brought home, queues `its_a_trap` (1 diamond: Blindness + Slowness).
  - *Interception*: Holds the bridge entrance 3 blocks in front of the bed. Meets attackers before they reach 4.2m. Never allows an enemy a free swing at the bed.
  - *Late Game*: At the zone migration warning, restocks blocks (48+) and joins the squad in the middle.

- **Rank 1: The Collector (Upgrades & Economy)**
  - *Opening*: Collects forge (0-20s), buys Stone Sword + 32 blocks.
  - *Gathering*: Bridges to the nearest diamond generator (or middle rim on `compact`).
  - *Upgrades*: Brings diamonds back or buys team upgrades:
    1. Trap: `its_a_trap` (1 diamond) -> instant defensive security.
    2. Reinforced Armor I (5 diamonds) -> +1 Protection on all 4 players!
    3. Sharpened Swords (8 diamonds) -> Sharpness I for everyone!
  - *Mid Game*: Secures emeralds from the middle island (Diamond Swords for rushers, Diamond Armor, Ender Pearls, Golden Apples).

- **Rank 2 & 3: The Rushers (Assault Duo)**
  - *Opening*: Collect forge (0-20s), buy Stone Sword + 48 blocks.
  - *Synchronized Rush*: Wait for each other at base perimeter (max 10s wait), then cross together toward the chosen target bed.
  - *Target Selection*: In a 5-team ring, coordinate to hit the closest adjacent neighbor bed.
  - *Execution*: Rusher A engages defender / draws fire; Rusher B breaks the bed (or vice versa).
  - *Wipeout*: Once the bed is destroyed, eliminate surviving players of that team before departing. Loot their accumulated forge.

---

## 3. The Five-Team Game Dynamics (Ring Diplomacy & Anti-Third-Party)
- On a 5-base ring, each team has two immediate neighbors (left and right) and two distant cross-map bases.
- Target the closer neighbor first. If neighbor A is actively attacking us, crush them at our bridge or counter-rush.
- Avoid getting sandwich-rushed: The defender and collector provide 360-degree vision around base. If an enemy attacks while rushers are out, radio alerts notify the team immediately.
- Never chase single stragglers across the entire map while beds are standing; prioritize securing diamonds, emeralds, and beds.

---

## 4. Layout Adaptations
1. **Compact Middle (`compact`)**:
   - Diamond generators are on the rim of the middle island; emeralds in the center.
   - Void gaps are short (~20 blocks). Rushers and collector bridge directly into the mid-rim diamonds, controlling emeralds early.
2. **Classic Cross (`standard`)**:
   - Diamond islands sit between adjacent bases.
   - Rushers flank through the diamond island directly into the neighbor base.
3. **Flanking Diamonds (`flanks`)**:
   - Diamond islands are off to each base's flank (~48 blocks).
   - Collector secures the flanking diamond island while rushers push neighbor base or middle.
4. **High Middle (`highmid`)**:
   - Middle is elevated (+3 to +6 blocks); diamond islands are sunken (-2 to -4 blocks).
   - Bridging flat across the void until 6 blocks from the island prevents tower races, then stair-steps cleanly onto the middle plateau.
   - Middle high ground is the ultimate defensive redoubt in the end game.
5. **Archipelago (`archipelago`)**:
   - Bases are far out (58-64 blocks); multiple stepping stones climb and drop.
   - Stepping stones allow hopping between islands without long, continuous exposed bridges. Rushers use stepping stones to conserve wool.

---

## 5. End Game: Bed Destruction & The Closing Zone
- **Timetable**:
  - 10-Minute Game: Bed Destruction & Zone Start at 6:00 (360s); Zone fully closed at 9:00 (540s).
  - 6-Minute Practice: Bed Destruction & Zone Start at 3:36 (216s); Zone fully closed at 5:24 (324s).
- **Zone Warning (60s prior to Bed Destruction)**:
  - All bots check their block counts. If `blocks < 32`, buy wool immediately.
  - If excess gold/emeralds exist, buy Iron Armor (12 gold), Golden Apples (3 gold), Diamond Swords (3 emeralds).
  - All living players transition to `zoneMigrate`: bridge to the center of the middle island `[0, y, 0]`.
- **Sudden Death / Final Circle**:
  - The middle island becomes a 9-block circle.
  - Gemini holds the center with high ground, numbers advantage (squad of 4 vs scattered solos), and projectile pressure.
  - Any enemy attempting to bridge into middle is shot with bows or pelted with snowballs into the rising void.
