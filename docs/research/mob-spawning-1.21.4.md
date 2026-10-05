# Research notes: Minecraft Java Edition 1.21.4 natural spawning

Working notes captured while implementing `src/spawning/`. These are the primary-source claims the
implementation is written against, with the URL each came from, so a reviewer can check a constant
without re-deriving it. The formatted summary lives in `docs/MOB_SPAWNING_PARITY.md`.

Target version: **Minecraft Java Edition 1.21.4** (the version this repo's other parity data is
pinned to: `scripts/generate-mc-data.mjs` fetches `pc/1.21.4` blocks and items, and the block parity
review is measured against it).

## 1. Spawn cycle frequency

> "Most mobs have a spawning cycle once every game tick (1⁄20 of a second), but passive mobs have
> only one spawning cycle every 400 game ticks (20 seconds)."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

So: MONSTER, AMBIENT, AXOLOTLS, UNDERGROUND_WATER_CREATURE, WATER_CREATURE, WATER_AMBIENT every
tick; CREATURE every 400 ticks.

## 2. Spawn region

> "Mobs spawn naturally within chunks that have a player horizontally within 128 blocks of the chunk
> center, and can only spawn within a 128 block radius sphere centered on the player. When there are
> multiple players, mobs can spawn within the given distance of _any_ of them."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

Note "horizontally ... of the chunk center" for the CHUNK test and "sphere" for the POSITION test.
128 blocks / 16 = 8 chunks, which is where the familiar 17x17 square comes from -- the square is a
bound, not the definition.

Also, from the spawn conditions list:

> "For all mob types excluding passives and fish, spawns fail unless within a 128 radius block sphere
> around the player. For fish, spawns fail unless within a 64 block radius of the player."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

So **fish use a 64-block sphere**, not 128. That is a per-category difference, not the global rule.

## 3. Mob caps

> "All non-persistent loaded mobs are counted against the global cap, including those in chunks not
> in range of a player or eligible for spawns. The cap is scaled by the total number of chunks within
> a 17×17 chunk square around any player. The cap is then scaled as `globalCap = mobCap × chunks ÷ 289`.
> Because chunks that are in the range of multiple players are counted once, more chunks and higher
> mob caps result from the players spreading out."

> "Each non-persistent mob in a chunk that has its center within 128 blocks horizontally of a player
> is counted toward that player's per-player mob cap. For each chunk, spawns are only allowed if at
> least one player has that chunk in range and has not reached their per-player mob cap."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

Two corrections this forces on a naive port:

1. **Persistent mobs do not count toward either cap.** `SpawnState.countMobsInEligibleChunks` must
   skip them. (I had this backwards: I assumed vanilla counted them.)
2. **The global cap counts mobs ANYWHERE loaded, not only inside the 17x17 square.** The square is
   used for the DIVISOR (the number of spawnable chunks), not for the numerator. A mob in a loaded
   chunk 20 chunks away still occupies global cap space.

Base caps per category, from the table in that section:

| Category | Cap | Notes |
| --- | --- | --- |
| Monster | 70 | includes ender dragon and wither (MC-272976) |
| Creature | 10 | includes wandering trader and trader llama (MC-272975) |
| Ambient | 15 | bat |
| Axolotls | 5 | |
| Underground water creature | 5 | glow squid |
| Water creature | 5 | squid, dolphin, nautilus |
| Water ambient | 20 | cod, salmon, pufferfish, tropical fish |
| Misc | -1 | unlimited; never spawns naturally |

> "The mob caps are checked once for each spawn-eligible chunk. The group size in which particular
> mobs spawn is not taken into account, meaning the spawning of a group of mobs may cause the total
> number of mobs for that category to exceed the respective cap."

That last sentence is important: a pack is allowed to EXCEED the cap, because the cap is checked
once, not per member. `NaturalSpawner` here checks once before the pack and then places the whole
pack -- which matches.

## 4. Pack spawning

> "For each spawning cycle, attempts are made to spawn _packs_ of mobs per _each_ eligible chunk. An
> eligible chunk is determined by the same check for which chunks are randomly ticked. A random
> location in the chunk is chosen to be the center point of the pack. The X and Z coordinates are
> chosen completely at random, while the Y coordinate is a random coordinate between the block above
> the highest block in the column and the minimum vertical limit. This makes lower maximum elevations
> a strong way to increase spawn rates and is the reason why perimeters are so effective. If the block
> in which a pack spawn occurs is an opaque full cube, further pack spawn attempts are canceled.
> There are a maximum of 3 pack spawn attempts per mob category."

> "Before the attempt to spawn each mob in the pack, the position is offset by ±5 (triangular
> distribution) on the X and Z axes."

> "All mobs within a pack are the same species. The species for the entire pack is chosen randomly,
> but based on a weight system from those eligible to spawn at the location of the first spawn
> attempt in the pack. For later mob spawn attempts in the pack, if the selected species cannot spawn
> at the location (e.g. due to being in a different biome or structure) then that attempt fails."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

Corrections this forces:

1. **Y is not "heightmap + 1" and not "half surface, half random".** It is a uniform random draw
   between the top of the column and the world's minimum Y. That single rule is why caves fill up
   and why a perimeter works. `NaturalSpawner.pickY` must draw uniformly from that range.
2. **The pack offset is a TRIANGULAR distribution over ±5**, not a uniform one. Vanilla's
   `Mth.triangle(base, 5)` is `base + (nextDouble() - nextDouble()) * 5`. Roughly 85% of members land
   within 5 blocks of the centre and 99% within 10 -- which a uniform ±5 would not reproduce.
3. **The species is chosen ONCE per pack**, at the position of the first attempt, and later members
   re-validate that same species at their own positions rather than re-rolling. A member that cannot
   place there simply fails.
4. **Offsets are re-rolled per member**, and a member that fails does not abort the pack.

Max pack sizes: 8 for wolves/cod/tropical fish; 6 for horses and donkeys; 4 for most others. The
per-mob min/max in the biome data governs, and `packSizeFor` reads it.

## 5. Spawn conditions -- generic

> "* There must be no players or the world spawn point within a 24 block radius (spherical) of the
> spawning block.
> * The number of loaded mobs of that type must be less than the mob cap for that type ...
> * The mob's collision box upon spawning must not collide with another collision box. ...
> * The mob's collision box must not intersect with a solid block.
> * For all mob types excluding passives and fish, spawns fail unless within a 128 radius block sphere
> around the player. For fish, spawns fail unless within a 64 block radius of the player."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

For non-aquatic mobs, the block above the spawning surface must not be: a full 1x1x1 collision block;
a redstone component; a fluid; in the `prevent_mob_spawning_inside` tag (rails); or a block that
would damage the spawning mob (fire, wither rose, sweet berry bush, powder snow).

The **world spawn point** is also protected inside 24 blocks. That is implemented here as a
protected-volume check.

## 6. Spawn conditions -- light (the part that matters most)

> "* In the Overworld, if the internal sky light level is 7 or less (which always occurs inside a
> cave) and the block level is 0, all Overworld monsters can spawn. On the surface of the Overworld
> this occurs for 8 minutes of the 20 minutes [day].
> * In the Nether, if the block light level is 7 or less, all Nether monsters can spawn. Sky light is
> always 0 in the Nether.
> * In the End, block light level must be 0.
>
> When doing the light check in the Overworld and End, the spawn chances are randomized and a spawn
> only occurs if the light level is less than or equal to a random number between 0 and 7. In the
> Nether, as long as the light level is 11 or below, the spawn is allowed."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

This is the single most useful paragraph in the whole page, and it corrects the "light 0" folklore:

- **Overworld/End:** compute the internal light (`max(blockLight, skyLight - skyDarken)`). If it is
  **> 7, refuse**. Otherwise **roll `nextInt(8)` and require `internalLight <= roll`**. At internal
  light 0 that always passes (0 <= anything); at 7 it passes 1 time in 8. So the surface at night
  (raw sky 15, skyDarken 11, internal 4) passes 5 times in 8 -- not always.
- **Nether:** `internalLight <= 11` passes, with no roll.
- **End:** block light must be 0.

I had implemented a plain `light <= 0` check. That is wrong in both directions: it refuses the eight
minutes of Overworld night when internal light is 1..7, and it would allow spawning at any light in
the Nether.

This also explains the widely-cited "light level 0" figure: it is the case where the roll always
passes, which is what a dark cave gives you.

## 7. Spawn conditions -- per mob

From the tables in the same section:

| Mob | Extra rule |
| --- | --- |
| Blaze | only in nether fortresses |
| Drowned | spawning block and block below must be water; 1/15 in rivers; 1/40 in oceans and must be 5+ blocks below sea level |
| Ghast | 95% chance of spawn failure |
| Guardian | spawning block and below must be water (including waterlogged/bubble columns); 95% failure if the block has sky exposure |
| Hoglin | cannot spawn on nether wart block |
| Husk | the spawn location must have sky access |
| Magma Cube | cannot spawn on liquid |
| Ocelot | 1/3 chance of failure; can spawn on leaves |
| Piglin | cannot spawn on nether wart block |
| Skeleton (nether fortress) | 80% chance of a wither skeleton instead |
| Slime (swamp) | must be in a swamp; spawn block on Y 51..69 inclusive; failure chance from moon phase; 50% chance of failure |
| Slime (slime chunk) | below Y 40; 90% chance of failure |
| Stray | the spawn location must have sky access |
| Wither Skeleton | only in nether fortresses |
| Zombie Horse | only on grass blocks |
| Zombified Piglin | cannot spawn on nether wart block |

Hostile extras:

- The block directly below must have a solid, complete top surface (top slabs / upside-down stairs
  count) or be soul sand or mud.
- The block directly below must not emit light level 14 or higher (matters for slimes; jack
  o'lanterns and lit redstone lamps are exceptions).
- The hitbox must not collide with any liquid.
- The mob must be immune to the spawning block and the block below.

Blocks that do not allow hostile spawning even though they are solid: all glass variants, bedrock,
barrier, trapdoors, chorus flower, scaffolding, copper grate, leaves (only ocelots and parrots may
spawn on leaves), ice and frosted ice (only polar bears).

## 8. Spawn conditions -- passive

> "* The mob's collision box must not collide with any liquid.
> * The spawning block must have a light level of 9 or greater.
> * The block directly below the spawning block must be one associated to the mob."

Sources: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>,
<https://minecraft.wiki/w/Mob_spawning?action=raw&section=1>

Per-mob floor blocks: mooshroom -> mycelium; turtle -> sand with spawn Y <= 66; parrot -> grass,
leaves, logs or air; rabbit -> grass, sand, snow block, snow; wolf -> grass, podzol, coarse dirt,
snow block, snow; fox -> same as wolf; polar bear -> grass or ice; goat -> stone, gravel, packed ice,
snow block, snow; armadillo -> grass, coarse dirt, terracotta, red sand; frog -> grass, mud, mangrove
roots, muddy mangrove roots; camel -> sand or red sand; every other passive -> grass block.

Chunk-generation spawning probability per biome: 0.03 badlands/eroded badlands, 0.04 wooded badlands,
0.07 snowy plains/ice spikes, **0.1 all others**. The loop runs attempts until the probability check
fails, so more than one pack per chunk is possible.

Chunk-generation spawning:
- uses the biome of the **north-west corner of the chunk at maximum world height** for all decisions;
- ignores the mob cap, spawn costs and `doMobSpawning`;
- ignores structure spawn overrides;
- randomness derives from the world seed and the chunk position;
- each member's Y is on top of the highest non-empty collision shape at its own X/Z (unlike the
  runtime cycle, where the whole pack shares one Y);
- up to four position attempts per member, with triangular offsets around the pack centre;
- a mob wider than a block is nudged inwards so its box stays inside the chunk.

Biomes that spawn no CREATURE at all: pale garden, river, frozen river, snowy beach, stony shore, all
ocean variants, all cave biomes, every End biome, the void. (This falls out of the generated tables.)

## 9. Structure spawn overrides

> "For all dimensions, structure-based spawns take priority over biome for hostile spawns. This means
> that in a swamp hut, pillager outpost, Nether fortress (outer bounding box only when there is Nether
> bricks below it), and ocean monument, one sees only the corresponding hostile mobs for that
> structure within that structure."

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

The vanilla data pack's `spawn_overrides` blocks carry `{ bounding_box: 'piece'|'rigid', spawns:
{ category: [entries] } }`, reproduced in `biomeSpawnResolver.js`.

## 10. Spawn costs (warped forest / soul sand valley)

> "The spawn cost (also called spawn potential or spawn density) takes on a value for each block in
> the biome. Certain mobs increase that value by some number ("charge") divided by their distance to
> the block. If a new spawn attempt would bring the "potential" of the spawning block above a certain
> threshold, the spawn attempt is canceled."

> "a mob may be spawned at a location if `sum(existing mob's charge / distance to mob) * new mob's
> charge < new mob's maximum potential`"

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=6>

Implemented in `potentialCalculator.js`, with the charge values taken from
`data/minecraft/worldgen/biome/{warped_forest,soul_sand_valley}.json`'s `spawn_costs` block (the
generator keeps them).

## 11. Spawn-on-chunk-generation vs the runtime cycle

These are separate systems and the task explicitly forbids conflating them. The chunk-generation pass
places CREATURE groups as terrain is generated and runs once per chunk; the runtime cycle runs every
tick forever. `chunkGenerationSpawner.js` and `naturalSpawner.js` are separate modules for that
reason, sharing only the biome resolver and the placement validator.

## 12. Despawning

See `docs/MOB_SPAWNING_PARITY.md` section "Despawning" for the numbers; the implementation is in
`despawnManager.js`. Key claims:

- mobs beyond **128 blocks** from the nearest player despawn **instantly** (hostiles and most others);
- the intermediate rule uses a **random draw** in the 32..128 block band, not a hard cutoff;
- mobs marked persistent (named, tamed, leashed, picked-up equipment, spawn-egg/command/spawner
  origin, structure mobs placed at world generation) are never removed by the natural rule;
- hostile structure mobs still despawn on Peaceful.

Source: <https://minecraft.wiki/w/Mob_spawning?action=raw&section=5>

## Licensing

- **minecraft.wiki** text is CC BY-NC-SA 3.0. Quoted above only as short behavioural claims with
  attribution; no article text is reproduced in the shipped source.
- **misode/mcmeta** (the biome/spawn JSON) has no LICENSE file; the repository describes itself as
  processed output of the game's data generator. The numbers are vendored as factual configuration
  data, with provenance recorded in `docs/MOB_SPAWNING_REFERENCES.md`.
- **PaperMC/Paper** is GPL-3.0. Used for architecture and file names only; no source copied.
