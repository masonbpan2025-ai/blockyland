# Research: winning SkyWars and Bed Wars from code

What I read, what it says, and what I am building into `houseBotDs`. Sources at the end of each section and
collected at the bottom. The arena's own rules (`docs/`) win wherever a server's rules differ: SkyWars is 5:00
with one refill at 3:00; Bed Wars is 4v4 prices at fast pace with a 10:00 tie, no spawn invulnerability is
listed, and a bed is broken by digging either half.

## 1. SkyWars: the shape of a winning round

**Loot fast, then contest the middle.** Several guides put the middle rush at roughly the first 15-25 seconds:
the middle chests hold diamond armour pieces, a diamond sword, golden apples, ender pearls and a knockback
stick; island chests hold leather/iron armour, a stone-to-iron sword, planks/stone and some extras. The
opening is armour -> weapon -> blocks, every chest on the island, equipping armour as you loot. Rushing the
middle only pays with blocks and at least an iron sword; without them, finish the island first. The middle is
contested, so arriving late into someone else's fight is often better than arriving first.
([Astroworld](https://guide.astroworldmc.com/minecraft-skywars-pvp-tips), [Minecraft Wiki: SkyWars](https://minecraft.wiki/w/Tutorial:SkyWars), [Hypixel mini-guide](https://hypixel.net/threads/skywars-mini-guide.3225972/))

**What that means for the bot.** Loot own chests until it has a real weapon and blocks, then take the middle.
After the middle, hold it / hunt rather than hiding. The 3:00 refill refills *every* chest, middle included:
a bot that remembers "chest looted" forever throws away the strongest loot of the second half. Track chests
per refill epoch. The second refill (6:00) never happens in a 5:00 round.

**Fight near the void, not near your own edge.** Knockback is the strongest weapon in SkyWars: sprint hits
push further, and a hit near an edge wins the round. Fight with the void behind the *other* player. High
ground (2-3 blocks up) improves downward knockback. Snowballs and eggs do no damage but knock back; they are
especially good against someone on a one-block bridge. Block-clutching (place a block under yourself while
falling) and pearl-clutching are the survival skills that separate good players; our API cannot easily throw
an accurate pearl, but a block under the feet in a fall is worth attempting. Sprint hits cost 0.63 s per
swing (sword) versus 1.0 s for an axe.
([Astroworld](https://guide.astroworldmc.com/minecraft-skywars-pvp-tips))

**W-tapping, strafing, crits.** A W-tap is releasing sprint for a moment and re-sprinting into the next hit;
in Java a sprint hit adds knockback (and ends the sprint), while a critical hit (1.5x) needs a fall and *no*
sprint. So the two are alternatives: sprint-hit when the opponent is near an edge (push them off), jump-crit
when they have ground behind them (win the damage race). Strafing/circling makes the opponent's aim lag and
changes the knockback angle. The arena rules confirm both mechanics.
([Hypixel SkyWars thread](https://hypixel.net/threads/i-need-to-get-better-at-sky-wars.2842879/), [docs/skywars-rulebook.md](../docs/skywars-rulebook.md))

**Bridge fights decide by knockback, not gear (round-2 reading).** Multiple guides say the same three things:
fight on solid ground and keep the void behind the *enemy*; never cross an exposed bridge while someone is
watching it with eggs/snowballs/a rod; and after a hit lands, step back instead of chasing, because the cooldown
window is when you get knocked off. A hit pushes along the attacker->victim line, so a blow taken at an angle has
a sideways component; on a one-wide walkway that is enough to walk a whole player off. The defensive version is
a one-block wall on the void side of the bridge while building it; the survival version is placing a block under
your feet during the fall. Both are cheaper than losing the gear advantage.
([CubeCraft how-to-play thread](https://www.cubecraft.net/threads/how-to-play-skywars-thread.186891/), [Hypixel: how to a-void the void](https://hypixel.net/threads/guide-how-to-a-void-the-void-get-it.1481874/), [Astroworld SkyWars PvP tips](https://guide.astroworldmc.com/minecraft-skywars-pvp-tips), [Minecraft Wiki: SkyWars](https://minecraft.wiki/w/Tutorials/SkyWars))

**Hold the ground you are on (round-3 reading).** The guides that discuss the forced bridge fight are explicit
that sprint-reset (W-tap) hits are the ones with knockback, and that a player who backs off a one-wide walkway
forfeits both the sprint hit and the block behind them: the counter to a player coming along your bridge is to
stand, face them and trade sprint hits, not to retreat down the lane. The Astroworld guide's "step back after a
hit" is about an opponent on *wide* ground, where there is somewhere safe to step; its stated rule above all is
"fight on solid ground, keep the void behind your opponent". The same threads add two building habits we already
have: a wall on the void side of the walkway (we rail the side the knockback would push toward, only when the
bridge can spare the blocks) and diagonal/zig-zag routes, which are harder to knock a player off than a straight
line; and the one cheap attack we already own -- an egg or snowball at a player strung out on a lane.
([PikaNetwork SkyWars tips](https://www.pika-network.net/threads/skywars-tips-n-tricks.8893/), [CubeCraft thread](https://www.cubecraft.net/threads/how-to-play-skywars-thread.186891/), [Astroworld](https://guide.astroworldmc.com/minecraft-skywars-pvp-tips))
For the bot: when a foe is within sword reach, swing; retreat only to a foe still beyond reach, and never retreat
merely because the lane is narrow. That is the round-3 fight fix.

**Endgame against the clock.** A tie is worth nothing. Let other players fight and clean up the winner when
both are low; after winning a fight, heal/wall up immediately so you are not third-partied. Campers can be
pearled onto or bowed out; a player who never looks for the other only ties. In a 5:00 arena round, the last
60 seconds must be spent hunting, not looting.
([Hypixel mega-thread](https://hypixel.net/threads/guide-skywars-mega-thread.2148157/), [CubeCraft guide](https://www.cubecraft.net/threads/%E2%98%81%EF%B8%8F-guide-quick-effective-solo-skywars-tips-%E2%9A%94%EF%B8%8F.423377/))

## 2. Bed Wars: opening, bed, rush, finish

**The first rush wins games.** The consensus opening is wool first, a stone sword/tools second, then bridge
straight at the enemy bed. Speed beats gear: break the bed before they finish defending. In 4v4 the "IYN"
plan has rushers buy 96 blocks each and hit adjacent bases fast (3-4 minute wins); defenders place a split
butterfly defence. For solo/doubles, 16 wood + 16 wool is a standard defence; wool alone is acceptable only
because it is fastest. Layers: wool -> wood -> end stone -> blast-proof glass -> obsidian; the cheap
high-value team buy is a trap, but our arena has only one opponent and a 10:00 limit, so traps and emerald
upgrades are a poor use of time.
([Hypixel first-rush guide](https://hypixel.net/threads/bedwars-guide-how-to-defend-and-first-rush.5312603/), [Hypixel guide](https://hypixel.net/threads/my-guide-to-bed-wars.5316534/), [MinecraftPatchs prices](https://minecraftpatchs.com/minecraft-bedwars/))

**Prices in our arena (4v4):** wool 16 for 4 iron; stone sword 10 iron; iron sword 7 gold; chainmail 24 iron;
iron armour 12 gold; shears 20 iron; golden apple 3 gold. The forge gives 1 iron / 1.5 s and 1 gold / 6 s.
That makes 16 wool reachable in ~6 s of farming, a stone sword at ~15 s, and iron armour (the efficient armour,
replacing leggings+boots) at ~72 s of gold. Chainmail (24 iron for +2 armour points) is a trap next to the
iron-armour upgrade (+4 for 12 gold). The model should prefer gold armour and spend iron on wool and swords.

**Defence.** Cover the bed before the first rush if it is cheap: a top + side shell of 8 wool costs half a
wool purchase and forces the attacker to spend seconds digging. The bot reads the actual cover from the world
(8 cells around the two bed halves) and re-covers after a death if the blocks were broken.

**After the bed breaks.** The round is not won by the bed; it is won by the final kill. Guides recommend
tagging a player just before they fall into the void (void kill credit can be inconsistent) and, once beds
are gone, tracking/hunting rather than farming. Hypixel gives a compass; our API has no compass, so the bot
tracks the last seen position, the enemy base, the middle and its own base as a sweep, and keeps pressure at
the enemy spawn during the 5-second respawn window. The house bot's known weakness is exactly here: it breaks
a bed and then goes back to farming. The fix is a hard "finish" mode once the enemy bed is gone, plus using
the respawn window to finish the bed or kill the respawned (gearless) player.
([Namu Wiki Bed Wars strategy](https://namu.wiki/w/%ED%95%98%EC%9D%B4%ED%94%BD%EC%85%80/Bed%20Wars/%EC%A0%84%EB%9E%B5), [Bed Wars rules explainer](https://eathealthy365.com/understanding-the-official-rules-of-bed-wars/), [2026 strategy guide](https://minecraftwikihub.com/articles/from-bed-destroyed-to-bed-wars-champion-my-2026-strategy-guide.html))

**Breaking a covered bed (round-2 reading).** The guides that explain *how* to finish a defended bed agree on
three things: the window is the ~5 s respawn, so the attacker must arrive with the dig time and the escape route
already known; dig the defence layer by layer with the fastest tool for each (wool by hand or shears, wood with
an axe, stone/glass with a pickaxe); and box yourself in with 3-4 blocks from the defender's side while mining
the inner layer, so their sword cannot reach you while your back is exposed. The last one is what a 4v4
defence guide calls the "mining box". Our arena differs on one point: the house bot's own log line
`cover: broken` shows it *rebuilds* cover after a death, so a bed trip must either finish the whole cover in one
respawn window or expect it back.
([Hypixel: How To Break Common Bed Defences](https://hypixel.net/threads/how-to-break-common-bed-defences.4786169/), [bitebynight guide](https://www.bitebynightgame.org/zh-CN/t/how-to-break-base-defenses-fast-in-bedwars))
For houseBotDs this confirms the order the round-2 log got wrong: kill -> bed within the respawn window ->
player, never `hunt` while the enemy bed still stands. Boxing in is a candidate if defenders start interrupting
the dig; our `breakBed` already aborts and fights on a hit and on a defender within 4.5 blocks.

**Respawn economics.** A death while the bed stands costs everything carried (blocks, iron, gold, bought
swords) but keeps permanent armour/tools; the killer gets the resources. So a plan that works only once
("buy, bridge, attack") stalls. The opening must be state-based and rerun from whatever is in the inventory
after every respawn. Conversely, killing a farmer transfers their iron/gold to us: an early defensive kill at
home is an economic win, not just a survival one.

## 3. Bridging: the bot's measured bottleneck

The arena allows one block per `placeBlock` call, each costing ~220 ms plus 200-280 ms reaction time; the
pathfinder never crosses a void. The house bot's bridge places one block, walks onto it sneaking, then
re-centres - roughly 1.5-2 s per block. Human techniques are not directly available (we cannot hold right-click
while walking backwards in the same tick sense), but the same principles apply: keep the crosshair on the face
you are placing against, sneak only where an edge could kill you, and never step onto a block before it exists
in the world. Ninja bridging (~2.3 blocks/s) alternates crouch/uncrouch with place-and-step; schneller
bridging is ~4.2 blocks/s in theory; both are faster than continuous sneak-bridging. The key insight for a
program is **a run buffer**: place several blocks ahead while standing still (reach allows the 3rd and 4th
face), then walk across them at full speed, putting the next run down from the far end. That moves the cost
from "walk + place per block" to "place per block" and removes the per-block centring.
([Minecraft.net: How to Speed Bridge](https://www.minecraft.net/en-us/article/how-speed-bridge-), [Sportskeeda speeds](http://opera.sportskeeda.com/minecraft/minecraft-1-19-use-different-speed-bridge-methods))

Reference implementation notes: Baritone/mineflayer-scaffold place against the floor block under the bot and
use the face vector of the movement direction; they centre the bot and avoid liquids. The LiquidBounce
scaffold module exposes exactly the parameters a program needs: a `BlocksToEagle`/edge distance at which to
sneak, a `SneakTime`, and separate "normal/down/backwards" god-bridge modes. Our bridge keeps the same
anchor-against-the-face rule, but adds a 3-block look-ahead run, a per-tick "is the cell in front still
solid?" check, and fixes the known failure mode (a step after a placement that was not seen in the world).
([mineflayer-scaffold](https://github.com/PrismarineJS/mineflayer-scaffold), [LiquidBounce scaffold docs](https://github.com/ccbluex/documentation/blob/f140570724c3163e5a9c21d17a25587112e1565c/md/modules/world/scaffold.md), [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/readme.md))

## 4. Scripted Minecraft bots: what their code does and what is worth copying

### Baritone / AltoClef / AutoClef
Baritone is the reference for goal-based pathfinding and block placing; its pathfinder treats the world as a
graph of walkable cells and refuses void/dangerous drops. AutoClef (a fork of AltoClef) is a task-based
Minecraft bot with a `SkyWarsTask`; it delegates walking to Baritone, opens chests with a loot wishlist
(armour/tools/planks/gapples/arrows/pearls/water bucket), picks up drops, equips by slot priority, and enables
a "force field players" combat mode with a KillPlayerTask. Its `SkyWarsTask` constants include
`MIN_BUILDING_BLOCKS = 10`, `PREFERRED_BUILDING_BLOCKS = 60`, `FEAR_SEE_DISTANCE = 30`. The block-placement
recovery handler is a useful pattern: if Baritone places a block and it is still air, the task holds sneak +
forward + right-click briefly, then sneak + backwards + right-click for up to 6 s, retrying the placement
instead of stepping into the gap.
([AutoClef](https://github.com/3ndetz/autoclef), [Habr write-up with SkyWarsTask code](https://habr.com/en/articles/812387/), [AltoClef](https://github.com/gaucho-matrero/altoclef))

**Take:** the "building blocks are a resource threshold" idea (do not start a bridge without enough blocks),
the chest loot wishlist, and the placement-recovery retry. I am not taking the force-field/attack-everything
behaviour: it ignores the void and the attack cooldown.

### BedwarsPracticeBot
A Minecraft 1.8.9 Forge mod with a behaviour tree (selector -> sequence -> leaf tasks), managers for maps,
teams, beds, spawners and shops, and 33 shop items with dynamic evaluation. Branches are prioritised
survival > combat > economy > strategy > navigation. Its combat engine has four tactics (aggressive, normal,
defensive, bow-strafe), a five-state FSM (retreat < 6 HP, fight < 5 blocks, engage < 20, idle), combo
counting, W-tap/S-tap flags, alternating strafes, 10-tick aim prediction, and attacks gated on
`ticksSinceLastHit >= 8 && distance < 4.0`. Its bridge builder has five patterns and a 2-4 tick randomized
placement delay with a pause every 4 blocks. Its pathfinder is 3D A* with a Chebyshev heuristic, 26-direction
movement, two-block climbs, 200-node/5000-iteration limits; the VoidAnalyzer scores a position by the
fraction of neighbours above the void, finds safe ground by scanning down and then rings outward to radius 16,
and `needsBridge` samples the straight line at the source Y. The shop buys wool below 32 blocks, the next
sword/armour tier, and prioritises sword > armour > blocks > potions > tools.
([BedwarsPracticeBot](https://github.com/CreepyNightmares/BedwarsPracticeBot), [CombatEngine.java](https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/ai/combat/CombatEngine.java), [VoidAnalyzer.java](https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/ai/pathfinding/VoidAnalyzer.java), [ShopCatalog.java](https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/game/shop/ShopCatalog.java))

**Take:** the safety-first behaviour tree ordering (survival before economy), the "rush when blocks >= 16 or
iron >= 32" gate, wool-below-32 restock rule, the void-risk scoring (count void neighbours before stepping),
and attack gating on a cooldown. Note that several of its tasks are stubs (BreakBedTask does not actually dig;
DefendBedTask only sets a target; W-tap/S-tap are flags without key timing) - the architecture is better than
its implementation. I am implementing the parts that matter in the real API: bed-state read from the world,
cover digging, a respawn-window rush, and a hard finish mode.

### Mineflayer PvP
`mineflayer-pvp` is the base attack loop (`bot.pvp.attack(entity)`, attack range, melee rate). The richer
`@nxg-org/mineflayer-custom-pvp` adds AABB hit detection, critical modes (hop/packet/reactive, 80-100% crit
rate), sprint tapping (`tapConfig.mode = 'wtap'`), strafing patterns (circle/random/intelligent), rotation
modes with target-movement prediction, and a `cps` option. The combination used by good bots is: aim at the
target with a little prediction, attack exactly on the cooldown, W-tap for knockback, crit when the target is
not near an edge, and disengage to heal below a health threshold.
([mineflayer-pvp](https://github.com/PrismarineJS/mineflayer-pvp), [mineflayer-custom-pvp](https://github.com/nxg-org/mineflayer-custom-pvp))

**Take:** attack on cooldown, jump-crit vs sprint-knockback choice from the target's footing, gapple at a
threshold, and a strafe that is only taken when the side ground is solid. The arena's 0.8 s swing cap
(rather than the 0.6 s sword recharge) sets the attack cadence.

## 5. What I am changing in houseBotDs (summary)

1. **Run bridging** (3 blocks placed ahead, then a full-speed walk with a sneak/stop guard, no per-block
   centring) and a measured bridge rate fed back into the planner. Placement retries and a hard "never step
   onto air" check.
2. **Combat**: attack at the 0.8 s cap, jump-crits when the enemy has ground behind them, sprint-reset hits
   when the enemy is near a void edge or a one-block bridge, snowball/egg throws at an enemy bridging, golden
   apple at 13 HP, strafing only onto solid ground, and a narrower auto-engage radius across a gap so the bot
   does not bridge into a fight it chose for itself.
3. **SkyWars**: chest refill epochs (3:00), middle-first value, a hard hunt override in the last 70 s, a
   defend-home move when the enemy is crossing, and a model that uses real walking/bridging times.
4. **Bed Wars**: state-based opening (wool -> cover -> sword -> wool -> rush), bundling shop purchases into
   one visit, robust shop-slot matching by `name`/`displayName`, real 0-8 bed cover tracking, persistent bed
   digging (cover first), a hard finish mode after the enemy bed falls (hunt their base, then the middle),
   using the 5 s respawn window, and a model that knows respawns are gearless and that the killer gets the
   victim's resources.
5. **Planner**: calibrated walk/bridge rates, refills, numeric cover, real bed break cost, foe sightings
   with velocity, and stronger time pressure (a tie is zero) plus deterministic endgame overrides.

## Sources

- https://guide.astroworldmc.com/minecraft-skywars-pvp-tips
- https://minecraft.wiki/w/Tutorial:SkyWars
- https://hypixel.net/threads/skywars-mini-guide.3225972/
- https://hypixel.net/threads/i-need-to-get-better-at-sky-wars.2842879/
- https://hypixel.net/threads/guide-skywars-mega-thread.2148157/
- https://www.cubecraft.net/threads/%E2%98%81%EF%B8%8F-guide-quick-effective-solo-skywars-tips-%E2%9A%94%EF%B8%8F.423377/
- https://hypixel.net/threads/bedwars-guide-how-to-defend-and-first-rush.5312603/
- https://hypixel.net/threads/my-guide-to-bed-wars.5316534/
- https://minecraftpatchs.com/minecraft-bedwars/
- https://namu.wiki/w/%ED%95%98%EC%9D%B4%ED%94%BD%EC%85%80/Bed%20Wars/%EC%A0%84%EB%9E%B5
- https://eathealthy365.com/understanding-the-official-rules-of-bed-wars/
- https://minecraftwikihub.com/articles/from-bed-destroyed-to-bed-wars-champion-my-2026-strategy-guide.html
- https://www.minecraft.net/en-us/article/how-speed-bridge-
- http://opera.sportskeeda.com/minecraft/minecraft-1-19-use-different-speed-bridge-methods
- https://github.com/3ndetz/autoclef
- https://habr.com/en/articles/812387/
- https://github.com/gaucho-matrero/altoclef
- https://github.com/CreepyNightmares/BedwarsPracticeBot
- https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/ai/combat/CombatEngine.java
- https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/ai/bridge/BridgeBuilder.java
- https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/ai/pathfinding/VoidAnalyzer.java
- https://github.com/CreepyNightmares/BedwarsPracticeBot/blob/main/src/main/java/com/bedwarsbot/game/shop/ShopCatalog.java
- https://github.com/PrismarineJS/mineflayer-pvp
- https://github.com/nxg-org/mineflayer-custom-pvp
- https://github.com/PrismarineJS/mineflayer-scaffold
- https://github.com/PrismarineJS/mineflayer-pathfinder/blob/master/readme.md
- https://github.com/ccbluex/documentation/blob/f140570724c3163e5a9c21d17a25587112e1565c/md/modules/world/scaffold.md
