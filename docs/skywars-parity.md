# SkyWars

A designed world (`src/mods/skywars/`) for 2 to 8 players over the game's own world sharing. Sources:
[minecraft.wiki Tutorial:SkyWars](https://minecraft.wiki/w/Tutorial:SkyWars) and
[Hypixel SkyWars](https://hypixel.fandom.com/wiki/SkyWars), the best-known server version of the minigame.

## Playing

1. **Host:** start screen → **Designed Worlds** → **SkyWars**. You wait in a glass cage on your island while a lobby panel
   shows a 4-digit code, the players who have joined, the **map** and its **theme**, and the loot (**Normal** or **Insane**).
   Every pick, every **New islands** and every round generates the islands afresh.
2. **Friends:** start screen → **Join** → type the code. Each gets an island of their own and waits in its cage.
3. **Start** is enabled once at least one other player has joined; only the host can press it. The screen counts down
   **3, 2, 1**, then **Fight!**: the cages open and everyone switches from Adventure to Survival.
4. Loot your island's chests, bridge across with the planks and stone, and knock the others into the void. The last one
   alive wins. **Bridging works as on Bedrock:** face the void, look down at the empty place in front of your feet (an
   outline shows where the block will go) and right-click; walk forward and repeat. Java's way (sneak backwards and click
   the side of the edge block) works too. The host can then **Play again**: the islands are rebuilt and everyone goes back to a cage.

## Rules and where they come from

| Rule | Source | Where |
|---|---|---|
| Each player on a separate island floating in the void; last player alive wins | Tutorial:SkyWars | `arena.js`, `rules.js` |
| A larger centre island with better loot, an enchanting table and an anvil | Tutorial:SkyWars | `arena.js` |
| Three chests on each spawn island; players start above the island (in a cage) | Hypixel | `arena.js` |
| Normal spawn loot: leather or iron armour worth 1–15 points; 1–3 swords (stone, stone Sharpness I, iron); planks and stone 8–16 a slot | Tutorial:SkyWars | `loot.js` |
| Insane spawn loot: at least 3 iron or diamond pieces worth 9–20; 1–3 swords (stone Sharpness I, diamond, diamond Sharpness I); the wiki's random items (water/lava bucket, diamond pickaxe/axe, Regeneration and Swiftness splash potions, Fire Resistance, Power I bow + 15 arrows or Power III + 20, fishing rod, eggs or snowballs) | Tutorial:SkyWars | `loot.js` |
| Centre loot: enchanted diamond helmets and boots, enchanted iron chestplates and leggings, 1–2 ender pearls, 1–3 golden apples, a knockback rod (Normal); enchanted diamond armour and swords, more pearls and apples, a stronger rod (Insane) | Hypixel | `loot.js` |
| All blocks can be broken and placed | Hypixel | the base game |
| Bridging forward: looking at the empty place beside the block underfoot places a block there ("Simple bridging", Bedrock only); when the exact place is not under the crosshair, the place in front, for a player looking at least 30 degrees down | [Tutorial:Bridging](https://minecraft.wiki/w/Tutorial:Bridging) | `src/bedrockBridging.js` |
| Killed players drop their loot | Hypixel | `client.js` (drops claimed through the host) |
| All chests refill; a second refill adds ender pearls to every chest | Hypixel | `rules.js` (3:00 and 6:00) |
| Time running out is a draw among the players left | Hypixel | `rules.js` (10:00) |
| PvP is Java Edition's | Tutorial:PvP (Java Edition) | `src/pvpCombat.js`, `docs/pvp-parity.md` |

Choices where neither source gives a number: the refill times (3:00, 6:00) and the time limit (10:00); a kill is credited
to the last player who hit the victim within 10 seconds, including a knock into the void ("X was knocked into the void by Y",
as servers word it); falling below the islands is immediately fatal (vanilla's void only starts hurting 64 blocks under the
world); players start empty-handed; nobody can fight before the cages open, and a spectator neither hits nor is hit.

Not done: kits and perks, teams (Doubles), the Doom dragons after the second refill, and the souls and coins economy.

## Maps and data packs

A map is a **template** (`src/mods/skywars/templates.js`): a recipe, not a fixed build. From a seed it lays out a new
arena each time -- the ring's size, every island's outline and depth, where chests and decorations go. A **data pack**
(`src/mods/skywars/packs/`) gives it its materials, what grows on it, its middle, and extra loot. Each template has three.

| Template | Layout | After |
|---|---|---|
| Classic Ring | 8 spawn islands (3 chests) round a big middle (4 chests, enchanting table, anvil) | minecraft.wiki Tutorial:SkyWars; Hypixel |
| Archipelago | spawn islands far out; 4 or 8 small connector islands of one chest each on the way to a smaller middle | Mineplex's "connecting islands" and "semi middle islands -- 1 chest -- you can't jump straight to ... middle island" |
| Citadel | a castle middle, higher than every island, a chest in each of four corner towers, a roofed keep over the tables | Castle Renovah (towers in the corners, each holding a chest); "the central hub is the highest point" |
| Sectors | four slices of two spawn islands sharing a sector island with two chests, round a small middle with six | Hypixel's Desserted Islands (slices with their own middle chest, round a centre with more) |

| Pack | Template | Made of, and grows | Extra loot |
|---|---|---|---|
| Meadow | Classic | grass; oaks, birches, flowers; glowstone lamp posts | apples, bread, bottles o' enchanting |
| Frozen Peaks | Classic | snow over stone; spruces, packed-ice spikes, icicles under the islands | snowballs on every island, packed ice |
| Nether Rift | Classic | crimson nylium, netherrack, blackstone; huge fungi, basalt columns, a lava pool, a brewing stand | fire charges, fire resistance, obsidian |
| Tropical Atoll | Archipelago (8 connectors) | sand on sandstone; palms, a lagoon | fishing rods, water buckets, a trident in the middle |
| Mushroom Isles | Archipelago (4 connectors) | mycelium; huge red and brown mushrooms | mushroom stew; pearls and golden apples on the connectors |
| Sky Ruins | Archipelago (8 connectors) | moss; broken stone-brick walls for cover, azaleas, hanging roots | the treasure is on the connectors |
| Stone Keep | Citadel | grass; stone-brick castle, lanterns | shields, a Sharpness axe, a crossbow |
| Desert Fortress | Citadel | sand and sandstone; cut-sandstone castle, cacti | TNT and flint and steel |
| End Citadel | Citadel | end stone; purpur castle, obsidian pillars crowned with end rods | ender pearls, chorus fruit |
| Sweet Slices | Sectors | wool frosting on terracotta sponge; candy canes, cakes | cookies, golden carrots, pumpkin pie |
| Volcanic Shards | Sectors | blackstone and basalt; basalt columns, a lava pool, magma below | fire resistance, lava, fire charges |
| Cherry Grove | Sectors | grass over calcite-veined stone; cherry trees, pink petals | honey, sweet berries, healing |

What every map keeps, whatever the template, pack and seed (`tests/skywarsMaps.test.js` checks all twelve on several
seeds): one island and one closed cage per player for 8 players, every spawn as far from the middle and as high as every
other; three chests on each spawn island, every chest on solid ground with air above it; at least **5 blocks of void
between any two islands** (a sprint-jump clears 4, so every gap is bridged); no island farther than the 16 blocks the
chests always give; water and lava only in walled pools; the path from each cage toward the middle kept clear.

**The pack format.** A pack is laid out as a data pack, path -> JSON, the form the game's data pack loader reads:

```
pack.mcmeta                                  {"pack": {"pack_format": 61, "description": "..."}}
data/skywars/skywars/arena.json              templates, palette, terrain, decorations, center
data/skywars/loot_table/chests/island.json   vanilla loot tables, rolled per spawn island,
data/skywars/loot_table/chests/mid.json        per connector or sector chest,
data/skywars/loot_table/chests/center.json     and per middle chest, on top of Normal/Insane
```

`arena.json`: `palette` (`surface`, `subsurface`, `core`, `ores` with chances, `cage`, `accent`, `trim`, `light`, all
`minecraft:` block ids), `terrain` (`roughness` 0-0.5, `depth`, `size`), `decorations` (`tree` of oak, birch, spruce, jungle,
cherry, acacia, dark_oak or azalea; `huge_mushroom`; `huge_fungus`; `plants`; `spike`; `boulder`; `pool` of water or lava;
`ruin`; `lamp_post`; `striped_pillar`; `hanging`), each with `on` (spawn, center, mid, sector islands) and a `count`;
`center` (`feature`, `chests`, `enchanting_tables`, `anvils`, `brewing_stand`). Loot tables take vanilla pools, `rolls`,
weighted `minecraft:item` and `minecraft:empty` entries, `set_count`, `set_enchantments` and `random_chance`. A pack
that names a block, item, enchantment or decoration the game does not have is reported, entry by entry
(`packs.js` `loadPack`).

## How it works

The host's browser runs the match (`rules.js`, pure and deterministic) and tells everyone what happens over the shared world's
`game` channel, the map included: `{template, pack, seed}`, from which every browser builds the same islands. Each browser does its own part from that: its player in a cage, its gamemode, its spectating, opening the
cages and rebuilding the islands from the same template (`arena.js`), so none of those are sent block by block. Chest
contents travel as shared chest updates. A dead player's items drop for everyone, and walking over one asks the host, which
gives each drop to the first player who claims it.

## Tests

```sh
node scripts/test.mjs mods             # tests/skywars.test.js (rules, loot), tests/skywarsMaps.test.js (templates, packs), tests/skywarsClient.test.js, tests/bedrockBridging.test.js
npx playwright test -c playwright.share.config.js e2e/skywarsBots.pw.js
```

The browser test is a whole match played by two bots in two real browsers: the lobby and its code, the Start button refusing
a lone host, 3-2-1, the cages opening, each bot looting its own chests (and the other browser seeing them empty), bridging to
the middle (and the other browser seeing the bridge), fighting until one is left, the death message, the winner screen, the
loot dropping for both, and Play again restoring the islands and the cages.
