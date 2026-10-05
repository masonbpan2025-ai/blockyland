# Minecraft survival rules, as verified against Mineclonia

Research notes for survival parity. Mineclonia (https://codeberg.org/mineclonia/mineclonia) is the
closest open-source implementation of vanilla survival behaviour, so it is the reference for *rules*,
while PrismarineJS/minecraft-data is the reference for *data*.

**Verification method.** A full clone of the Mineclonia repository at commit
`8f4f57094569385283d35eb4bda1e141d47b0e02`, branch `main` (the default branch is `main`, not
`master` — `/raw/branch/master/` URLs 404). Version 0.123.1. Every file path and number below was read
from that checkout. Nothing here is inferred from documentation prose unless it says so.

**How to read this.** Section 1 is the survival model to implement. Section 2 is progression. Section 3
is the most important one for planning: **where Mineclonia is deliberately NOT vanilla**, and therefore
where copying it would take this game *away* from parity rather than towards it.

---

## 1. Survival model

### 1.1 Health and the damage pipeline
Max HP 20, stored as a float. All damage flows through one entry point
(`mods/CORE/mcl_damage/init.lua`, `damage_player`) which runs modifiers in ascending priority, and a
modifier returning `0` short-circuits the rest. That design is worth copying directly: a single
pipeline means armour, enchantments, difficulty scaling and status effects compose in a defined order
instead of each caller applying its own arithmetic.

### 1.2 Hunger, saturation and exhaustion — exact model
`mods/PLAYER/mcl_hunger/init.lua`. Mineclonia stores exhaustion as an integer *times 1000*, in
`[0, 4000]`, "unlike in Minecraft", so the constants read as integers:

```
EXHAUST_DIG          = 5     per block dug
EXHAUST_JUMP         = 50    per jump
EXHAUST_SPRINT_JUMP  = 200   per sprint-jump
EXHAUST_ATTACK       = 100   per hit landed on an enemy
EXHAUST_SWIM         = 10    per block swum
EXHAUST_SPRINT       = 100   per block sprinted
EXHAUST_DAMAGE       = 100   per instance of damage taken
EXHAUST_REGEN        = 6000  per 1 HP regenerated
EXHAUST_LVL          = 4000  the threshold at which saturation drops
SATURATION_INIT      = 5     on new or respawning players
```
These are vanilla's values times 1000. The conversion, from `api.lua::mcl_hunger.exhaust`:

```lua
exhaustion += increase
if exhaustion >= 4000 then
  exhaustion = 0
  if saturation > 0       then saturation = max(saturation - 1.5, 0)
  elseif saturation <= 1e-4 then hunger     = max(hunger - 1, 0) end
end
```
**Known deviation:** `set_exhaustion` clamps to `[0, 4000]`, so one enormous increase triggers exactly
one decrement, where vanilla lets exhaustion overshoot and processes several. Worth being deliberate
about; copying the clamp is a bug.

Eating adds `eatable` group points to hunger and `_mcl_saturation` to saturation, clamped to current
hunger. Sampled values are vanilla-identical: apple 4/2.4, golden apple 4/9.6, carrot 3/3.6,
bread 5/6.0, beetroot 1/1.2, baked potato 5/6.0, cooked beef 8.

### 1.3 Regeneration
Ticked every frame in `mcl_hunger/init.lua`:

| Condition | Effect |
|---|---|
| difficulty 0 (Peaceful) | heal 1 HP/s, and hunger +1 every 0.5 s up to 20 |
| `food >= 18` | slow regen: 1 HP / 4.0 s, costs `EXHAUST_REGEN` |
| `food == 20 AND saturation > 0` | fast regen: 1 HP / 0.5 s, costs `EXHAUST_REGEN` |
| `food == 0` | starvation 1 HP / 4.0 s, floored by difficulty (see 1.7) |

Vanilla-identical.

### 1.4 Breath and drowning
Player breath is delegated to the Luanti engine, and **Mineclonia's own source documents that this
does not match vanilla** (`mods/ITEMS/mcl_enchanting/enchantments.lua:622-625`): default 10 breath is
about 19 s where Minecraft is 15 s, and Respiration III is about 78 s where Minecraft is 60 s. So
**do not copy Mineclonia for drowning**; implement the vanilla numbers directly (15 s base, 60 s at
Respiration III, 2 damage/s). Mobs do have a real model: 2.0 damage/s once breath goes negative
(`mods/ENTITIES/mcl_mobs/physics.lua`).

### 1.5 Fall damage
The distance-to-damage arithmetic is **not in the repository** — it lives in the `mcl_localplayer`
client-side mod, which is a separate Luanti fork (`settingtypes.txt:248-251`). Only the server-side
validation and the per-block amplification are present:

```lua
greatest = 0.0
for each collision node with group fall_damage_add_percent ~= 0:
    this < 0 -> greatest = this            -- negative wins outright
    else     -> greatest = max(greatest, this)
damage = max(0, damage + damage * (greatest / 100.0))
```
Real node values: hay and beds `-80`, slime block `-100`, honey `-80`, dripstone `+100`. So the
per-block modifiers are usable as data, but the base formula has to come from the vanilla wiki (1 damage
per block beyond the first 3, i.e. `floor(fallDistance - 3)`).

### 1.6 Fire, lava and contact damage
`damage_per_second`, applied verbatim by the damage pipeline:

| Source | damage/s |
|---|---|
| Fire, soul fire | 1 |
| Lava, flowing or source | 8 |
| Magma block, soul-fire block | 2 |
| Campfire | `def.damage * 2` |

Being on fire is separate: 1 HP per second, `bypasses_armor`, for the duration set by
`group:set_on_fire` — fire 8 s, lava 15 s. Fire Protection reduces it by
`floor(burn_time * level * 0.15)`.

### 1.7 Difficulty
`mcl_vars.difficulty` is 0..3 (peaceful, easy, normal, hard):

- **Damage scaling** (priority -1000, applied only when the damage type has `flags.scales` or the
  source is a mob): Peaceful `0`; Easy `min(damage/2 + 1, damage)`; Normal unchanged; Hard `damage * 1.5`.
- **Hunger**: no exhaustion accrues at all on Peaceful.
- **Starvation floor**: Easy stops at 10 HP, Normal at 1 HP, Hard at 0 (can kill).
- **Spawning**: hostile spawns hard-fail on Peaceful and existing hostiles despawn.

### 1.8 Armour — exact arithmetic
`mods/ITEMS/mcl_armor/damage.lua:115`, the vanilla formula verbatim:

```lua
damage = damage * (1 - math.min(20, math.max((points / 5),
                          points - damage / (2 + (toughness / 4)))) / 25)
```
Protection enchantments then apply at line 118 as `damage * (1 - min(20, factor) / 25)`, and Breach
adds `damage / 100 * 15 * level`. Durability cost is `max(1, floor(damage / 4))`.

Protection factors, summed as `level * factor` and capped at 20: `protection` 1 (applies to all),
`blast_protection` 2, `fire_protection` 2, `projectile_protection` 2, `feather_falling` 3.

Armour points per set, in helmet/chest/legs/boots order, with durability:

| Set | base durability | points | toughness | enchantability |
|---|---|---|---|---|
| leather | 80 | 1/3/2/1 | – | 15 |
| chain | 240 | 2/5/4/1 | – | 12 |
| iron | 240 | 2/6/5/2 | – | 9 |
| gold | 112 | 2/5/3/1 | – | 25 |
| diamond | 528 | 3/8/6/3 | 2 | 10 |
| netherite | **592 (vanilla)** | 3/8/6/3 | 3 | 10 |

**Deviation:** Mineclonia uses 555 for netherite where vanilla is 592, which makes its netherite
leggings and boots *weaker* than vanilla. Use 592.

Also: Mineclonia adds **copper tools and copper armour**, which vanilla does not have, and that
addition is what creates its `pickaxey = 2` harvest tier. Vanilla has copper blocks only. And its
harvest-level array is `{wood, gold, stone, iron, diamond}`, putting **gold between wood and stone**
where vanilla treats gold as equal to wood. Both are places where copying Mineclonia would reduce
parity.

### 1.9 Status effects
Real numbers, all vanilla-identical:

| Effect | Level 1 | Level 2+ | Damage type | Can kill? |
|---|---|---|---|---|
| poison | 1 HP / 1.25 s | 1 HP / 0.6 s | magic | **No** |
| wither | 1 HP / 2 s | 1 HP / 1 s | magic | yes |
| regeneration | +1 HP / 2.5 s | +1 HP / 1.25 s | – | – |
| strength | damage ×1.3 | ×1.6 | – | – |
| weakness | damage ×0.8 | ×0.6 | – | – |
| hunger | exhaustion 100/s | 200/s | – | – |
| nausea | saturation flip / 2 s | / 1 s | – | – |
| water breathing | clamps breath ≥ 10 | – | – | – |

Poison not being able to kill is deliberate and matches vanilla; the guard is `get_hp() - 1 > 0`.

### 1.10 XP — vanilla formula exactly
```
level_to_xp(L): 1..16  : floor(L^2 + 6L)
               17..31 : floor(2.5L^2 - 40.5L + 360)
               >= 32  : floor(4.5L^2 - 162.5L + 2220)
xp_to_level:    inverse, with the thresholds 352 and 1507
```
Gains: mob kill `random(xp_min, xp_max)`; breeding `random(1,7)`; fishing `random(1,6)`;
bottle o' enchanting `random(3,11)`; mob spawner break `random(15,43)`; villager trade `3 + random(3)`.

**Two deviations to avoid.** Mineclonia gives *every* smelted item exactly 1 XP, with the source
comment `-- ToDo give each recipe an idividial XP count`; vanilla varies per recipe (0.1 for food,
0.7 for iron, 1.0 for gold and diamond). And its ore XP is a single fixed integer rather than a range:
coal 1, diamond 4, lapis 6, emerald 6, redstone 7, quartz 3, and **iron and gold ore give 0**. Vanilla:
coal 0–2, diamond/emerald 3–7, redstone 1–5, lapis 2–5, quartz 2–5. Use the vanilla ranges.

Death drops all XP as orbs and resets to 0 unless keep-inventory. Orbs are capped at 100 entities with
value `random(1, min(32767, total - floor(i/2)))`.

### 1.11 Death, respawn, gamemode
On death, the `main`, `craft`, `armor` and `offhand` lists drop unless keep-inventory is set; items
scatter within ±3 blocks onto air with line of sight, offset ±0.25; `curse_of_vanishing` items are
deleted. Respawn prefers a stored bed or respawn anchor, and falls back to world spawn. Mineclonia has
**only survival and creative** — no adventure, no spectator, no hardcore.

### 1.12 Inventory and stack sizes
Player inventory is 36 slots at width 9, and the survival screen renders a **2x2** crafting grid while
the crafting table is 3x3 (its group value is literally the slot count: `crafting_table = 9`).
Stack sizes are 64 by default; 1 for tools, armour, buckets, potions and shears; 16 for signs, eggs,
snowballs and ender pearls.

---

## 2. Progression

### 2.1 There is no skill tree
`grep -i skill` across every source, markdown, config and locale file returns **zero matches**.
Mineclonia has no skills, no progression tree, and no advancement-tree UI. The nearest equivalent is
the achievements list (62 entries, `mods/HUD/mcl_achievements/init.lua`), built on the stock `awards`
mod, with a `reward_xp` extension and triggers of type `dig`, `place`, `craft`, `death`, `chat`,
`join`, `eat` and `counted_key`. If a "skills" feature is wanted, it is a design choice for this
project, not something to port.

### 2.2 The build order the game itself documents
`README.md:58-71`: punch a trunk, craft 4 planks in the 2x2 grid, craft a crafting table, wooden
pickaxe, stone tools, furnace, coal or charcoal, iron, then diamond. Beyond that the recipe and
achievement set supports enchanting (diamonds plus obsidian), a nether portal (obsidian), and
netherite via a smithing table.

### 2.3 Tool tiers
| Set | uses | harvest level | dig speed | enchantability |
|---|---|---|---|---|
| wood | 60 | 1 | 2 | 15 |
| gold | 33 | 2 *(vanilla: 1)* | 12 | 22 |
| copper | 191 | 3 | 5 | 13 | *(not in vanilla at all)*
| stone | 132 | 3 | 4 | 5 |
| iron | 251 | 4 | 6 | 14 |
| diamond | 1562 | 5 | 8 | 10 |
| netherite | 2031 | 6 *(vanilla: 5)* | 9.5 | 10 |

Sword damage by tier, from wood to netherite: 4, 4, 5, 5, 6, 7, 9. Pickaxe and shovel: 2, 2, 3, 3, 4,
5, 6. Axe: 2, 7, 9, 9, 9, 9, 10. Swords take half durability wear when digging but full when
attacking. Shears: 238 uses, enchantability -1, stack 1.

### 2.4 Dig time — exact formula
`mods/CORE/_mcl_autogroup/init.lua:214-239`:
```lua
speed = base_speed
if efficiency then speed = speed + efficiency * efficiency + 1 end
digtime = hardness / speed
if can_harvest then digtime = digtime * 1.5 else digtime = digtime * 5 end
if digtime <= 0.05 then digtime = 0 else digtime = ceil(digtime * 20) / 20 end
```
Tool wear is `ceil(65535 / uses)`. The hand counts as harvest level 1 for axe, shovel and hoe groups
(so it yields drops) but level 0 for pickaxe, sword and shears (so it does not). This 1.5-versus-5
split is the mechanism behind "you can always break it by hand, you just do not get the drop", and it
is worth copying exactly.

### 2.5 Enchanting
39 enchantments. The table's three offers, from `engine.lua:532-554`:
```lua
bookshelves = min(15, count)
base = random(8) + floor(bookshelves / 2) + random(0, bookshelves)
required = { max(base / 3, 1), (base * 2) / 3 + 1, max(base, bookshelves * 2) }
```
**Lapis cost and XP charged are both the slot index** (1, 2 or 3), while the displayed requirement up
to 30 is only a gate. This matches vanilla 1.8+ and is a common thing to get wrong.

Random selection is a faithful 1.8+ port: add enchantability, add a triangular ±15% jitter, double,
then halve repeatedly until the roll passes `random() >= (level + 1) / 50`.

Anvil costs use a prior-work penalty stored per item: `(2^pwp1 - 1) + (2^pwp2 - 1)`, plus 2 for a
same-tool repair, plus the material count, plus the enchantment level requirement, plus 1 for a rename;
the new penalty is `max(p1, p2) + 1`. Mineclonia does **not** implement vanilla's 39-level survival cap.

Numeric effects worth copying: sharpness +0.5 damage per level, smite and bane +2.5 per level against
undead and arthropods, efficiency adds `level^2 + 1` to dig speed, unbreaking multiplies attack uses by
`1 + level`, fire aspect sets the target on fire for `level * 4` seconds, frost walker radius
`level + 2`, depth strider speed `level/3 + 0.75`, thorns procs at `level * 0.15` per piece for up to 4
damage.

Three enchantments are **commented out** for engine reasons — `aqua_affinity`, `sweeping_edge` — and
`impaling` is registered but has no implemented effect. So Mineclonia is not a reference for those.

### 2.6 Brewing
Brew time 10 s; fuel is blaze powder only, 20 brews each; 3 bottle slots and 1 ingredient slot.
Duration constants: base 180 s, extended by `8/3`, halved by potency 2, poison 45 s, lingering `0.25`,
tipped arrow `0.125`. The recipe structure is a set of tables — water, awkward, mundane, thick — plus
two modifier tables: fermented spider eye inverts (healing to harming, swiftness to slowness, night
vision to invisibility, and so on), redstone extends duration, glowstone amplifies potency. `thick` is
deliberately an empty table with the comment "Nothing here but crickets...".

---

## 3. Where Mineclonia is NOT a parity reference

This is the most important section for planning. Copying the following would move *away* from vanilla:

1. **Drowning timing** — 19 s base and 78 s at Respiration III, versus vanilla 15 s and 60 s, and its
   own source says so.
2. **Copper tools and copper armour** — these do not exist in vanilla, and they create Mineclonia's
   `pickaxey = 2` tier used by 18 nodes.
3. **Gold as harvest level 2**, between wood and stone. Vanilla treats gold as equal to wood. This has
   a real consequence: Mineclonia's gold pickaxe can mine copper blocks that a wooden one cannot.
4. **Netherite armour durability 555** where vanilla is 592.
5. **Smelting XP is always 1** — an acknowledged TODO in the source.
6. **Ore XP is a fixed integer, not a range**, and iron and gold ore give 0.
7. **The Fortune ore curve is not vanilla.** `mcl_core.fortune_drop_ore` gives Fortune I a 33% chance
   to double, II a 50% chance for 2–3, III a 60% chance for 2–4. Vanilla is a uniform
   `random(1, level + 2)` multiplier with no failure chance. Worse, that helper sets no
   `drop_without_fortune`, so **a failed Fortune roll on coal, iron, gold, lapis, emerald or diamond
   ore drops nothing at all**. That is a bug; do not port it.
8. **Exhaustion clamping** to 4000, as described in 1.2.
9. **Fall damage arithmetic is absent** from the repository, as described in 1.5.
10. **No stonecutting or smithing recipe type** — both stations are bespoke implementations. Blast
    furnace and smoker have no recipe type either; they reuse cooking filtered by a group, at double
    speed, and **every cooking recipe takes 10 s** because `_mcl_cooktime` is read but never set
    anywhere in the repo. Vanilla has per-recipe cook times (food 10 s, ores 10 s, stone 10 s,
    but cactus 10 s and clay brick 10 s while logs are 15 s).
11. **No skill tree and no advancement UI**, per 2.1.
12. **Mob drop `chance` is 1-in-N, not a probability** (`local chance = 1 / dropdef.chance`). This is
    the opposite of what the field name suggests and is easy to invert.
13. **Temporary helper recipes** (`mods/MISC/mcl_temp_helper_recipes/init.lua`) exist purely to make
    unobtainable items reachable, and the file says so: trapped chests, and armour-trim templates that
    vanilla only provides as structure loot.
14. **`_mcl_hardness = -1` means infinite**, not unset. Bedrock, barrier and realm barrier rely on it.
15. **`mcl_extra_nodes` adds blocks that are not in Minecraft** — extra stairs and slabs, red nether
    brick fences and gates, bamboo bark.
16. **Only two gamemodes**, no adventure or spectator.
17. **Documents that it is beta**: redstone circuits partial, minecarts partial, status effects partial,
    brewing partial, and backwards compatibility explicitly not guaranteed.

### 3.1 Things that could not be verified from source
- The **fall damage distance formula** (client-side, not in the repository).
- **Runtime recipe counts**, because a large fraction is generated at load time from node fields plus
  tool and armour set loops. Solid static numbers: 243 explicit `register_craft` calls, 76
  `_mcl_cooking_output` declarations, 97 `_mcl_burntime` (30 of them zero), 106 `_mcl_crafting_output`,
  122 `_mcl_stonecutter_recipes`, roughly 30 tool and 24 armour recipes. Realistic runtime total:
  order 700–900 craftable entries.

---

## 4. Where this project stands against it

Measured against minecraft-data 1.21.4. Recipe figures come from `scripts/parity-coverage.mjs`, block
and item figures from `scripts/parity-coverage.mjs`, and mob drops from
`scripts/mob-loot-parity.mjs`. Each is pinned as a floor in the tests, so a regression fails rather than
going unnoticed.

### 4.1 Content

| | have | vanilla | coverage |
|---|---|---|---|
| Vanilla recipes implemented | 1546 | 1557 | 99.3% |
| Crafting recipes expressible | 1547 | 1557 | 99.4% |
| Blocks named | 897 | 1095 | 81.9% |
| Items named | 1216 | 1385 | 87.8% |

"Implemented" counts recipes generated from vanilla's own recipe data, so it cannot exceed the total.
Hand-written recipes are reported separately and deliberately **not** added to the percentage: only some
of them are vanilla (the red bed item and several redstone components are this project's own additions),
and folding them in once produced a headline of 100.3%.

"Expressible" means the result and every ingredient resolve to real content. It is a ceiling on what
could be crafted, not a count of implemented recipes.

The remaining ten recipes are blocked by results that need **engine work, not shapes** — `ender_chest`,
`shulker_box`, `trapped_chest`, `scaffolding`, `cake`, `bundle`, `map`, `spyglass`, `recovery_compass`
and `brush`. The geometry work is complete: this project now draws slabs, stairs, fences, gates, walls,
doors, trapdoors, signs, hanging signs, beds, panes, carpets, candles, chains, buttons, pressure plates,
rods, rails and flower pots, each with tests.

### 4.1.1 The remaining gap is ART, not code — for blocks and for items

The "Blocks named 78.8%" and "Items named 85.4%" rows read like missing implementation. They are not, and the
distinction decides what work is left.

The content generator emits a block only when `textureExists()` finds a PNG in `public/assets/blocks`, and
`tests/item_icons.test.js` requires a non-empty PNG at `/assets/items/<name>.png` for every entry in ITEMS.
So an item with no art cannot be added however well it is understood — and every geometry family this
project needed already exists. Measured by `scripts/content-gap.mjs`:

| | blocks | items |
|---|---|---|
| vanilla | 1095 | 1385 |
| present | 827 | 1130 |
| missing | 268 | 255 |
| **missing, has its OWN art** | **0** | **0** |
| missing, could reuse art already present | **1** | **9** |
| **missing, needs NEW art** | **267** | **246** |
| art files | 241 | 974 |

Both gaps are the same shape. Of 268 missing blocks, **one** is reachable by writing code —
`redstone_wall_torch`, reusing `redstone_torch.png`. Of 255 missing items, **nine** are — all spawn eggs
drawing the shared `spawn_egg.png`. Everything else needs art that does not exist.

The item row counts 1130 present where `scripts/parity-coverage.mjs` reports 1138. The difference is the
name-derivation rule, not the conclusion: this measurement asks "is there an icon file", and eight items
the coverage script can name have no icon of their own. Both figures are honest about different questions.

The reuse counts are deliberately conservative rather than a guess. The generator really does draw a sign
with its wood's plank texture, so a missing wall sign can reuse one; it does **not** draw a sapling that way,
and a sapling textured as planks would be a visual bug. Likewise a birch boat must not reuse an oak boat's
icon, though a spawn egg may share the egg. Counting those would have reported 15 code-reachable blocks and
some hundreds of items instead of 1 and 9, which is the kind of number that sends the next person down the
wrong path.

`tests/contentGap.test.js` pins all of it, including that no missing block or item acquires its own art —
the moment one does, it becomes a code gap and this section has to change.

### 4.2 Mob drops — there are TWO tables, and the verified one is the unused one

**This is the most misleading corner of the repository and the earlier versions of this section made it
worse.** There are two independent mob drop tables:

| table | where | imported by | verified against vanilla |
|---|---|---|---|
| `MOB_LOOT` | `src/mobLootData.js` | **nothing** | **yes**, 104/104 entries |
| `getMobDeathDrops` | `src/mobs.js` | `mobs.js`, i.e. the live path | **not measured** |

`MOB_LOOT` is dead code: nothing imports `mobLootData.js`, and the only reference anywhere is a comment in
`player.js`. The table that actually produces drops is `MobManager.getMobDeathDrops`, which is thorough --
it has a base table plus about twenty per-mob helper functions (`spiderDrops`, `phantomDrops`,
`polarBearDrops`, `variantBonusDrops` and so on) and cites the wiki at most rows. It had never been
compared against vanilla.

So the honest position is: **the data that matches vanilla is unused, and the data that is used is
unmeasured.** A section that reported "mob drops verified 104/104" was describing the wrong table.

### 4.2.1 Two attempts to measure the live table, both invalid

Recorded because both produced confident-looking numbers that were wrong, and because the next person to
try should start from a different place.

1. **Calling `getMobDeathDrops` with a stub mob and an empty `this`.** It reported 21 entities missing
   items. Invalid: the method delegates to per-mob helpers that read live mob state, so a stub produces
   nothing for any mob handled that way. It also reported `sheep` as having no wool row when the row is
   right there and simply needs `mob.woolColor`.
2. **Checking the source text for each mob type.** It reported 22 entities "not named at all", including
   `blaze`, `sheep` and `spider`, all of which are present. The regex required `type: [[` while the real
   rows look like `blaze: mob.playerDamaged ? [['blaze_rod', ...]] : []`, and the helper-based mobs name no
   type at all.

A valid comparison needs real mob instances driven through each drop path. **One now exists:**
`scripts/mob-drop-live.mjs` spawns every loot-bearing mob through the ordinary dispatcher using the fixture
`tests/mobUpdateSmoke.test.js` established, forces the drop roll so chance checks pass, and compares the
result against vanilla's chance-1 drops.

### 4.2.2 The live table, measured

| | |
|---|---|
| Vanilla entities with drops | 55 |
| Measured with real mobs | **50** |
| **In this game at all** | **5 missing** |
| Spawn or drop errors | 0 |
| Real drop gaps | **2, both now fixed** |
| Name or vanilla-data differences | 3 |

**Two real gaps, fixed**: `cat` (string) and `ravager` (saddle) had no drop row and no helper. Rows added.

**No mob is missing any more**: all five that were absent have since been added: `pufferfish`, `skeleton_horse`, `snow_golem`, `tropical_fish`,
`zombie_horse`. Round 34 reported these as drop gaps, which was wrong, and the reason is a defect worth
naming: **`spawnMob` falls back to a VILLAGER for any type it does not know** -- its `default:` branch ends
in `return this.spawnVillager(...)`. So spawning by name and reading the mob measures a villager for any
mob that does not exist, and a drop row for one of these would fix nothing. The harness now detects the
substitution and reports it as its own category.

That fallback is silent, so any typo or unported mob becomes a villager rather than failing. It is worth
fixing on its own account; `tests/mobDropLive.test.js` asserts the current behaviour and will fail the day
it is corrected, which is the signal to update this section.

**Three differences that are not gaps**, kept separate because round 34 lumped them in and overstated the
result: `stray` drops `tipped_arrow_slowness` where vanilla's data says `tipped_arrow`, a variant name
rather than a missing drop; `turtle` drops seagrass as vanilla does, and its listed `bowl` looks like a
minecraft-data artifact; `elder_guardian` lists `tide_armor_trim_smithing_template`, which is structure
loot in vanilla rather than a mob drop.

**Two harness traps, both recorded because both produced confident numbers.** The roll was first forced
with `random = () => 0.5`, and `phantomDrops` tests `random() < 0.5`, so the phantom looked empty; the roll
is now forced to 0 with a test for both directions. And the villager substitution above hid five mobs
entirely.

| | compared | differences |
|---|---|---|
| `MOB_LOOT` entities with drops | 55 | — |
| `MOB_LOOT` drop entries | 104 | — |
| `MOB_LOOT` drop chance | 104 | 0 |
| `MOB_LOOT` stack count | 104 | 0 |
| `MOB_LOOT` `playerKill` condition | 104 | 0 |
| `getMobDeathDrops` | not measured | — |

**This project follows vanilla's semantics, not Mineclonia's.** Mineclonia's `chance` field is 1-in-N
(see 3.12 above), so a smaller number means a *rarer* drop; vanilla's is a probability, so a smaller
number also means rarer but the arithmetic is inverted. This game uses vanilla's: a zombie's iron ingot
is stored as `0.008333`, matching vanilla's `dropChance`, and a reroll of the table reproduces vanilla's
outcomes.

One structural note: no drop entry uses the `"lo-hi"` string count form, so every drop is a single item
today. The ranged form is implemented and covered by a test, but it is unexercised by the current data.

- **A firework rocket did nothing when used, and elytra flight does not exist.** Both were found by the
  same question that found the tipped arrows and the potions: which registered items has no consumer.
  `firework_rocket` had **zero** references outside the registry, while `spawnFireworkRocket` was already
  fully built -- mesh, rising trail, burst, launch sound -- and called from exactly one place, a
  tournament celebration. `src/fireworks.js` now launches one from the player, with the look direction
  choosing the burst height.

  Two honest deviations. Vanilla fires a rocket **along the look direction**; the existing rocket
  animates straight up to a burst height, and changing that is a renderer change rather than an item
  hook, so a rocket always rises and the pitch only sets how high. And **vanilla's main use for a rocket
  is boosting elytra flight, which this game does not have at all**: `player.isGliding` and
  `player.elytraActive` are read in one place, `parrotBehavior.js`, and **set nowhere**. The item
  `elytra` exists, its 432 durability is in `durability.js`, and there is no glide physics behind any of
  it. Implementing elytra is a movement-system job rather than an item hook, and it is not done.
### 4.3 What is not verified

- **Drop probabilities under Looting — implemented and now tested.** The earlier note here said the loot
  table "has no per-level figures, so this is not measurable from the available data". That was true of the
  table and beside the point: the rule is not per-level data, it is vanilla's formula, `chance + 0.01 *
  level` capped at one, and the table needed a way to carry a chance at all before it could apply.

  The live rows were `[id, isBlock, min, max]` — a range with no probability — so a drop that happens one
  time in a hundred and twenty had no representation and was simply absent. An optional fifth field carries
  it, and the death handler rolls it against `mob.lootingLevel`, which the kill path already sets from the
  killer's weapon. That closed nine missing rare drops: iron ingot, carrot and potato from a zombie and a
  husk, carrot and potato from a zombie villager, and copper ingot from a drowned.

  `tests/lootingChance.test.js` drives `updateDeath` rather than reading the table, because the roll happens
  in the death handler and a test of the table alone would pass whether or not anything ever rolled it. The
  roll is forced to a constant, which makes the outcome a pure function of the effective chance: at a roll
  of 0.02 a zombie drops no iron ingot at level 0 and does drop one at level 3, since the threshold moves
  from 0.008333 to 0.038333.

  **The cap is defensive rather than load-bearing, and the test now says so.** Mutation testing showed that
  deleting `Math.min(1, …)` fails nothing: the cap and its absence behave identically whenever the roll is
  below one, which `Math.random` guarantees. The test that claimed to check it was overclaiming and has been
  renamed to what it actually checks. No row has a chance within one percent of certainty at Looting III, so
  the cap cannot be reached in practice either.
- ~~Brewing and potion-to-effect mapping~~ — **now implemented and verified against section 2.6.** An
  earlier version of this list said it was not implemented, which was wrong: `src/brewing.js` already had
  40 recipes and 36 potions. Auditing it against the researched rules found three faults, all silent:

  - The brew took **20 seconds** where vanilla and Mineclonia both take 10, and the comment asserted 20 as
    well — so the code and its own documentation agreed with each other and disagreed with the game.
  - **`potion_of_slowness` did not exist at all.** The fermented spider eye table converted night vision,
    healing and poison, and had no row for swiftness or leaping, so the potion could not be brewed.
  - **`potion_of_slowness_2` then existed with no recipe able to produce it**, which is the same fault in
    the other direction. Referential integrity is now checked BOTH ways by a test, since either direction
    can be broken silently.

  **The tipped-arrow factor is now implemented and the lingering one cannot be.** The arrow side turned out
  not to be a duration problem at all: `updateArrows` already applied `arrow.effect` and `spawnArrow` already
  stored it, but `bow.js` chose ammo from `['arrow','spectral_arrow']` and passed no effect, so the three
  tipped-arrow items in the game could not be fired and were droppable loot with no use. `src/tippedArrows.js`
  now derives each arrow's effect and duration from `POTION_DATA` at `1/8`, and the bow loads them.

  Weakness (11 s from a 90 s potion) and Poison (5 s from 45 s) come out at exactly the wiki's figures, which
  is the check on flooring rather than rounding — rounding gives six for the poison arrow. **Slowness is the
  one value this data cannot confirm**: the table gives 90 s so the eighth rule yields 11 s, where the figure
  often quoted is 30 s, which would be a third. Nothing in `.cache/mc-data` carries potion durations, so the
  rule is applied consistently rather than special-cased on a half-remembered number, and
  `tests/tippedArrows.test.js` names that one assertion as the thing to change if a source turns up.

- **Potions could not be drunk at all, and only three of thirty-nine existed as items.**
  POTION_DATA defines 39 potions and getBrewingResult can produce every one of them, but nothing
  consumed a 	ype: 'potion' item -- main.js handled 	ype === 'food' and stopped -- and only
  potion_of_fire_resistance, splash_potion_of_fire_resistance and splash_potion_of_weakness\n  were registered in ITEMS. So the brewing stand could hand the player a Potion of Healing with no name,
  no icon and no way to use it. 	ests/item_icons.test.js walks ITEMS only, so a brewable potion with
  no entry was invisible to every test in the suite.

  src/potions.js now drinks a potion by reading its effect from POTION_DATA, and 73 potion items
  (37 drinkable plus their 36 splash forms) were registered beside the three that existed. Both halves
  are derived from the table, so anything the brewing stand can produce is obtainable and drinkable by
  construction rather than by a list somebody has to remember to extend.

  Lingering potions do not exist in this game at all — no item, no cloud — so the `x0.25` factor has nothing
  to apply to. It is not implemented rather than unimplemented; splash-potion behaviour beyond the
  fire-resistance case in `barterItems.js` also remains unverified.
- **Unbreaking is now wired, because tool durability now exists.** It had been recorded as outstanding for
  three rounds on the reasoning that it "needs a durability system to spend against". That was correct, and
  the system genuinely did not exist: mining a block never wore the tool, and the only item in the registry
  carrying a `durability` value was the brush, so a diamond pickaxe was permanent. That removes one of the
  central pressures of survival mode.

  `src/durability.js` now holds vanilla's maxima -- wood 59, gold 32, stone 131, iron 250, diamond 1561,
  netherite 2031, plus the fixed figures for shears, flint and steel, fishing rod, bow, crossbow, shield,
  trident, elytra, brush and the five armour materials -- and `spendDurability` applies unbreaking. The
  measured lifetimes come out at the vanilla multipliers of level + 1: 250, 500, 754 and 1004 uses for
  unbreaking 0 to III on an iron pickaxe. Mining wears the held tool in survival and clears the slot when
  it breaks.

  **Thorns**: `Player.takeDamage` rolls it per armour piece and reports through an `onThornsReflect` hook
  that `main.js` connects to the mob manager, so the player never damages a mob itself. The attacker is
  identified from the damage source POSITION rather than passed by the caller, because `mobs.js` passes
  `mob.mesh.position` in four places and that file is another agent's workspace; the lookup in `main.js`
  also covers every damage source with a position rather than only those four call sites.

  **Depth strider**: applied in `Player.selectBaseSpeed()`, the water branch, reaching 1.75x at level III
  where the penalty is gone and water speed passes land speed. Clamped above level III.

### 4.4 Enchantment damage — implemented

`src/enchantmentEffects.js` holds the damage bonuses, extracted from the melee call site so the numbers
live in one place and can be asserted directly:

| Enchantment | Effect | Applies to |
|---|---|---|
| Sharpness | +0.5 × level + 0.5 | everything |
| Smite | +2.5 × level | undead (16 types) |
| Bane of Arthropods | +2.5 × level | arthropods (6 types) |
| Impaling | +2.5 × level | aquatic (13 types) |
| Fire Aspect | burns 4 × level seconds | everything |

Two notes on fidelity. The extraction preserved sharpness and smite exactly, which the tests assert
against the numbers the inline code produced. **Impaling was broadened**: the inline code applied it only
to `squid` and `glow_squid`, and vanilla 1.21 applies it to aquatic mobs generally, so the wider set is a
deliberate correction rather than a faithful extraction. Bane of Arthropods and Fire Aspect are new.


