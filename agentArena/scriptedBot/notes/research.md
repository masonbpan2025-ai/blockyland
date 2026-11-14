# Research: what wins SkyWars and Bed Wars, and what a scripted bot can use

Sources read for this pass: the Minecraft Wiki's PvP and SkyWars tutorials, MCTrainer's sprint-reset guide, two Hypixel
forum guides (a SkyWars opening guide and the solo Bed Wars guide), a Bed Wars price/strategy write-up, the AutoClef
and BedwarsPracticeBot bot code, and mineflayer-pvp's README. Links at the bottom. I also re-read the arena's own rule
books and `ref/guestPeer.js` for what is actually implementable here (3-block reach, Java recharge, real projectile
flight, instant bed breaking).

## SkyWars

**The opening is a race to the middle.** The consensus from the forum guides is: loot spawn chests in seconds each,
take only what you need, and be bridging to mid inside ~15 s. One guide says to skip the third spawn chest when the
first two gave a weapon and full armour. The wiki's chest tables explain why: spawn chests give 1-3 swords and 8-64
blocks, while **middle chests have the strongest items** (diamond armour, pearls, knockback weapons, bows). Nobody
disagrees that arriving at mid first is the highest-value opening move; contested mid is a risk, but the loot and the
position are what converts into a win.

**Loot priority** from the guides: sword -> projectiles (rod/snowballs/eggs) -> blocks -> potions -> bow. Armour is
taken whenever it is there. The loot order matters less than the time spent; this is a speed contest.

**The void is the real killer.** Wiki and guides both stress knockback toward the void and the risk of being knocked
into it while fighting over mid. The wiki notes camping is the low-kill alternative and that pearls counter it.
Practically: never trade hits with the void behind you, and position so the other player's back is to the void.

**Endgame.** No guide has a separate endgame section for a duel; the structural point is that a round that ends with
both players alive scores nothing, so the clock has to force contact. The wiki's "camping" endgame is exactly the
failure mode to avoid against a bot. This arena adds a wrinkle the guides do not have: the round lasts 5:00, and every
chest -- the four middle chests included -- **refills at 3:00**. A bot that stops looting at 2:40 leaves the last and
best loot wave to the opponent; the right clock is to take the 3:00 wave and force the fight after it.

### What I use in `houseBotDs`
- Loot home only until **geared** (a 5-damage sword, enough blocks for the void to mid, one armour piece), then go
  to mid; do not finish the third home chest if mid is open.
- Loot the four mid chests while the other player is more than ~9 blocks away; if they come, fight.
- Throw snowballs/eggs at a foe on a bridge (5-18 blocks) where the knock-back is a fall (normal/hard skills only).
- Never fight with the void behind me; take the side that puts their back to the void (normal/hard edge sense).
- Take the 3:00 refill of the middle chests (skipping the last wave hands the opponent the best loot), then go to the
  other player from 3:20: a tie scores nothing and the round ends at 5:00.

## Bed Wars

**First rush is speed, not gear.** The solo guides and the price write-up agree: hold the spawn gens, take the first
resource wave, buy **wool and a stone sword**, and rush. The iron sword (7 gold) is often called a luxury early
because it is lost on death; a diamond sword is explicitly a later buy. Diamonds go to team upgrades, with
**Sharpness first**, then Protection. Emeralds: pearl, diamond armour, potions.

**Bed defence.** For solos/doubles the guides often recommend a single wool layer or none, with the point that a
defender must never leave the top of the bed open; tools (pickaxe/axe) are for breaking defences. In *this* arena the
bed break is one action through a cover block (`breakBlockAt` does the cover and the bed in one tick), and the house
bot's own cover is one or two wool blocks. So cover is nearly worthless here and a defender's job is to **fight the
rusher on the approach**, not to build.

**The economy is an exchange rate.** Wool is 4 iron for 16; a stone sword is 10 iron; chain is 24 iron; the iron sword
is 7 gold; a gapple is 3 gold. Gold accrues at 1 per 6 s and iron at 1 per 1.5 s, so a 7-gold sword costs ~42 s of
gold income. The house bot spends 3 gold at 18 s on an apple, 3 more at 36 s, then saves for the sword: its iron
sword lands around 78 s and 20 iron goes to a pickaxe and an axe it does not need here. That is the edge to take:
same blocks, earlier real sword, no wasted tools.

**After the bed.** A defender with a bed can trade deaths; a player without one cannot. The winning sequence is to
break the bed on a respawn window (the other player is dead for five seconds and has no inventory) and then hunt the
respawned player down. The house bot's brain has no explicit hunt after the last bed; it only fights a foe within
7 blocks, so a break plus a deliberate hunt is decisive.

### What I use in `houseBotDs`
- Shop order: stone sword -> wool to the crossing need -> iron sword (gold) -> chain -> hard extras (gapple, iron
  armour, sharpness/protection, diamond gear, pearl). No pickaxe, axe, end stone, or bed cover.
- Hold the ground **in front of my bed** (the enemy's bridge arrives there), facing the approach; farm the forge while
  the other player is far (>26 blocks) and stop farming when they are coming.
- If they are on a bridge and I am on wide ground, wait at the edge of my ground -- they must cross to me; do not walk
  out onto the void.
- Push when they are dead (the five-second respawn window), when my bed is gone, or by 8:00; restock at home first if
  the crossing would leave me short of blocks.
- Break the bed the moment it is within 4.2 blocks (before fighting a defender), then hunt the last player at their
  spawn/forge.
- `bedwarsShop` gates purchases: easy = wool only, normal = iron-tier kit, hard = the full shop (apples, armour,
  upgrades, emeralds).

## Java combat mechanics (shared rules)

- Attack charge: `0.2 + 0.8 * charge^2`; swords recharge in 625 ms; a full-charge hit is required for a crit (x1.5) or
  a sprint hit (extra knockback). Normal/hard tree: normal uses full-charge sprint hits, hard chooses a sprint reset
  when the foe has the void behind them, otherwise a critical.
- The 0.5 s hurt window makes the **first hit of an exchange dominate**: a second, equal-or-weaker hit inside the
  window is ignored. Pressure and the first clean hit matter more than disengaging.
- Sprint-reset guides (MCTrainer): land the hit while sprinting, then briefly break forward movement and follow the
  knockback. Spacing is the part most players miss: keep the distance where the next hit still reaches. S-tapping
  gives stronger separation than a W-tap. There is no single correct reset length; it depends on knockback and terrain.
- The wiki notes a sprint hit gains its extra knockback only against a target with a lower speed; in this arena both
  players share the same walk/sprint speeds, so chase-and-hit is symmetric and the edge must come from position
  (island side / void behind them) and from hitting first.

### What I use in `houseBotDs` (combat)
- Swing the moment the foe is in reach and the recharge allows; do not spend the action waiting.
- Keep the void behind me, not in front; step off the edge line when a hit would put me over it.
- Take the island side of the opponent so their next knockback goes toward the void (edge sense, normal/hard).
- Use the bow first when far (normal/hard bow range), snowballs/eggs on narrow ground, a pearl to close (hard), and
  pillar to a foe above (normal/hard) -- exactly the difficulty's `HOUSE_SKILLS` gates, not more.
- Eat a golden apple before the blows only when there is room (>7.5 blocks); at <=8 health the shared
  `healIfNeeded` still uses one immediately.

## Scripted-bot code reviewed

- **AutoClef** (Java, archived AltoClef fork): a client-side task bot with a Python bridge; its README documents
  smooth aim, high-arc bow aiming ("Bow master" style), and SkyWars tasks that use gapples and pearls and loot dropped
  items. Confirms the value of a ranged plan B and pearl movement; it does not document the melee timing internals.
- **BedwarsPracticeBot**: behaviour tree "Survival -> Combat -> Economy -> Strategy -> Navigation", a combat engine
  with aggressive/normal/defensive/bow-strafe tactics, a five-stage fight FSM (idle/engaging/fighting/retreating/
  healing), W/S-tapping and sprint resets, A* pathfinding with 2-block climbs, a void-risk analyser, bridge styles
  with randomised placement delays, and a priority-list shop. What transfers: a combat FSM with a heal/retreat stage,
  void risk as a first-class score, and a priority purchase list. What does not: its retreat stage needs a
  damage/knockback model this arena does not expose; here, equal speeds and the hurt window make disengaging weak.
- **mineflayer-pvp** (PrismarineJS): the standard plugin API (`bot.pvp.attack(entity)`), useful as a reference for the
  shape of a fight loop, not for strategy.

## House bot weaknesses used against it

From `house/houseAutopilot.mjs` (read-only) and the shared guest brain it forks:
- SkyWars: loots all three spawn chests before mid; engages at 7.5 blocks; only loots mid when the foe is >12 blocks
  away. It can be beaten to mid by skipping the third chest, and it can be met there with mid gear.
- Bed Wars: buys a gapple at 3 gold and another at 6 before its 7-gold sword (hard), buys a pickaxe and axe (20 iron)
  that do nothing to an instantly-broken bed, covers its bed with 1-2 wool blocks (also broken instantly), and after
  its own bed is broken it has no hunt step: it only fights a foe within 7 blocks.
- Both: it tanks nothing, but it does not use a kill window deliberately; a bot that pushes during the 5-second
  respawn and then hunts the respawned player is playing a plan the house bot does not have.

## Sources

- Minecraft Wiki, Tutorial:PvP (Java Edition): https://minecraft.wiki/w/Tutorial:PvP_(Java_Edition)
- Minecraft Wiki, Tutorial:SkyWars: https://minecraft.wiki/w/Tutorials/SkyWars
- MCTrainer, Sprint Resetting: https://mctrainer.club/guides/sprint-resetting
- Hypixel Forums, "Skywars guide for struggling 8-9 stars": https://hypixel.net/threads/skywars-guide-for-struggling-8-9-stars-first-guide.5673844/
- Hypixel Forums, "[GUIDE] How to Win Skywars": https://hypixel.net/threads/guide-how-to-win-skywars.1545733/
- Hypixel Forums, "The Ultimate Solo Bedwars Guide": https://hypixel.net/threads/the-ultimate-solo-bedwars-guide.5691587/
- Hypixel Forums, "bedwars strategy": https://hypixel.net/threads/bedwars-strategy.6153672/
- MinecraftPatchs, "Minecraft Bedwars Guide: Tips, Prices and Strategy": https://minecraftpatchs.com/minecraft-bedwars/
- SkyGuide, Hypixel BedWars guide (fr): https://skyblock-guide.fr/articles/hypixel-bedwars-guide-complet/
- JartexNetwork, "Skywars (TIPS & Tricks)": https://jartexnetwork.com/threads/skywars-tips-tricks.333998/
- Gurugamer, PvP tips (W-tap/S-tap basics): https://gurugamer.com/pc-console/tips-and-tricks-for-pvp-in-minecraft-2026-26793/
- AutoClef (AltoClef fork): https://github.com/3ndetz/autoclef
- BedwarsPracticeBot / BedwarsBot AI: https://github.com/CreepyNightmares/BedwarsPracticeBot
- mineflayer-pvp: https://github.com/PrismarineJS/mineflayer-pvp
- PrismarineJS mineflayer: https://github.com/PrismarineJS/mineflayer
- CCBlueX docs, SuperKnockback (sprint-tap/W-tap mechanics reference): https://github.com/ccbluex/documentation/blob/2a03d66b76c19e94ad2de8431aa26a6bb21b30a3/md/modules/combat/superknockback.md
