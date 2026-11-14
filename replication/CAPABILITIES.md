# Capability matrix: the paper's run, step by step, in Blockyland

Status: **OK** = present in the source (desk check, 2026-11-02); **GAP** = missing or differs from Minecraft in a way that
matters, with the fix planned; **TEST** = present but must be proven end to end, through the Mineflayer-style API and
without cheats, in the P4 part tests. Every row ends as OK with a test named, or as a documented difference.

## World and rules

| Need | Status | Where / notes |
| --- | --- | --- |
| Random Overworld, survival, Easy, cheats off | TEST | `World(seed, biome)`; difficulty on the game object (`game.difficulty`), read by `mobs.js` and the behaviour modules (Easy branches in 36 files). |
| World height | GAP (accepted) | 64 blocks tall, against Minecraft's 384. Ore and structure heights are compressed. Documented, not fixed. |
| Day/night, 20-minute day | OK | `Game.updateDayNightCycle`, `DAY_LENGTH_SECONDS`. |
| Several players, each in any dimension at once | **GAP** | `World.switchDimension` swaps one active dimension; `MobManager.update(dt, player)`, `EntityManager.update(dt, player, inventory)` and the spawner take one player. Fix: the P2 server (one world per dimension; mobs, items and spawning run per player on the slice nearest each player). |
| Saves every 5 minutes, restart from save | **GAP** | Browser saves go to IndexedDB (`mapManager.js`). Fix: P2 disk saves of all dimensions, entities, containers, players. |

## Overworld progression

| Need | Status | Where / notes |
| --- | --- | --- |
| Punch trees, planks, table, wooden → stone → iron tools | TEST | `Game.breakTargetBlock`, `updateMining`, `miningRules.js`, `crafting.js`, `blockDrops.js`. |
| Furnace smelting, fuel | TEST | `furnace.js` (`FurnaceManager`). |
| Food: animals, cooking, crops; hunger; Easy starvation stops at 10 HP | TEST | `hunger.js`, `foodData.js`, `farming.js`; `starv` in `hunger.js`/`player.js`. |
| Beds: sleep, set spawn | TEST | `bed.js` (`BedManager`); sleeping needs every player in bed (multiplayer rule) — check. |
| Hostile mobs at night, combat, armour | TEST | `mobs.js`, `hostileMobBehaviors.js`, spawner `spawning/`. |
| Death: drop everything, respawn at bed or world spawn; items despawn after 5 minutes | TEST | `deathAndRespawn.js`; `entities.js:501` (6000-tick despawn). |
| Diamonds | TEST | Ore placement in a 64-high world. |
| Villages (beds, chests, food) | TEST | `worldgen/generators/village.js`. |
| Water and lava buckets; obsidian from water + lava | TEST | `buckets.js`, `waterSimulation.js`, `lavaSimulation.js`. |
| Flint and steel lights a Nether portal | OK | `netherPortal.js`; the bot lit portals in an earlier session. |

## Nether

| Need | Status | Where / notes |
| --- | --- | --- |
| Portal travel both ways, linked portals | **GAP** for multiplayer | `NetherPortalManager` calls `game.travelToDimension`, which swaps the one world. Fix: the server moves the player between dimension worlds. |
| Fortresses with blaze spawners | TEST | `fortress.js` (blaze platforms, `minecraft:mob_spawner` with blaze), `monsterSpawner.js`. |
| Blazes, blaze rods; ghasts; piglins; magma cubes | TEST | `blaze-parity.md`, `blazeScenarios.js`. |
| Endermen (pearls) in the Overworld and Nether | TEST | `enderman-parity.md`. |

## Stronghold

| Need | Status | Where / notes |
| --- | --- | --- |
| Eye of ender crafting | TEST | `extraRecipes.js`. |
| Eye of ender flight | **GAP** | `Game.throwEnderEye` aims at `this.endPortalRoom` (a room the game builds **48 blocks from spawn**, see below) and **prints the compass bearing in chat**. Vanilla: the eye flies about 12 blocks toward the nearest stronghold, hovers, then drops (80%) or shatters (20%); no bearing is shown. Fix: target the nearest generated stronghold portal room (`worldgen/registry.js` has `minecraft:eye_of_ender_located: ['stronghold']`), vanilla flight, an eye entity the bot can see, no chat bearing. |
| Strongholds far from spawn | **GAP, fixed for the server**: the game's default structure list does not include `stronghold` at all (so no stronghold ever generated). The replication server enables it (`REPLICATION_STRUCTURES`); verified realized with its portal room. |
| (original note) | OK in worldgen, **GAP** in the game | Generated in concentric rings (`registry.js:298`, `stronghold.js`), with a portal room whose frames each hold an eye 10% of the time. But `Game.generateNewWorld` also calls `placeEndPortalRoom(spawn)`: a ready room at spawn + (48, 48), 2 eyes filled, a shaft to the surface. The server must not build it. |
| Filling frames, lighting the portal, travel to the End | TEST | `endPortal.js`, `Game.updateEndPortalTravel` (single-world swap: same multiplayer gap as the Nether). |

## The End

| Need | Status | Where / notes |
| --- | --- | --- |
| Central island, obsidian spikes, crystals, two caged | OK | `docs/end-survival-audit.md`. |
| Dragon AI, breath, perch, crystal healing | TEST | `enderDragonBehavior.js`, `bossFights.js`; simplified against vanilla's phase graph (audit). Must be beatable in survival with bows/melee and not trivially easy. |
| Dragon in multiplayer (several players, any of them in the End) | **GAP** | `BossFightManager.update(dt, player)` takes one player. |
| Free the End (dragon kill) logged | TEST | `advancements.js` (`kill_dragon`). |
| Void, death in the End, respawn in the Overworld | TEST | `deathAndRespawn.js`. |

## Agent interface (what the paper's agents used)

| Need | Status | Where / notes |
| --- | --- | --- |
| Mineflayer `bot` API and the pathfinder plugin | **GAP** | Nothing like it; `playerBot.js` has its own step language. Only the pathfinder's A* is vendored (`vendor/mineflayer-pathfinder/`). P3 builds it. |
| Program runner (async body, timeout, logs, return value, persistent globals, no processes or file writes) | **GAP** | P3. |
| Chat to every bot, shown in the next program's output | **GAP** | P3. |
| Event log (chat, deaths with cause, advancements, programs) | **GAP** | P2. |
| API documentation for the agents | **GAP** | P3: Mineflayer's API page, reduced to what works, with the differences stated. |
