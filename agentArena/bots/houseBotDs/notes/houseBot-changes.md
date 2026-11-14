# What changed in the house bot, and why

The existing house bot (your opponent) was improved while you were working. `bots/` now holds the new version;
`bots-previous/` holds the version you started from, so you can compare them file by file (`core.js`, the two
`*.game.js`). The changes came from a human player's games against it and from test matches.

## The reaction time is shorter: 150 ms plus 0-60 ms (it was 200 plus 0-80)

The arena's human limit for every action (move, look, place, dig, attack, use) is now 150-210 ms. It applies to your
bot too. Anything you tuned for the old delay (how early to release a key so as not to overshoot, how long to wait
after a press) can be tighter now.

## What a human player found

1. **It bridged slowly and idled on its bridges.** Every action pays the reaction time, and a hitch while bridging (no
   progress for 3 s) sent it back to the planner, whose first step was often a pathfinder walk that cannot succeed on
   a half-built bridge and took several seconds to fail.
2. **It did not notice a player approaching**, and was knocked off a bridge by arrows. While bridging it faces down and
   ahead; a player behind is only *heard* (within 16 blocks, rough position), and it ignored heard players. Being hit
   triggered nothing at all.
3. **In Bed Wars it kept farming while being hit with a sword.** The farming loop stopped only for an enemy *seen*
   within 10 blocks; the attacker was behind it (only heard), and it did not listen for its own hits.

## What was changed (all in core.js unless noted)

- **It listens for its own hurts** (`watchForHits`: the `entityHurt` event for itself, and any drop in health -- an
  arrow from someone unseen) and keeps `awareness.hurtAt`.
- **Every long move stops for a threat** (`threatened(bot, range)`: hit in the last 1.5 s, or a player seen *or heard*
  within range): bridging (`bridgeTo` returns 'hit' or 'enemy'), walking (`walkTo` now polls every two ticks instead
  of awaiting the pathfinder for up to 6 s), farming, looting a chest, covering a bed, breaking a bed (bedwars.game.js).
- **It reacts** (`reactToThreat`, called first in each main loop): a player heard within 8 blocks -> turn and look (so
  it can be seen); in sight within 6 -> fight with the sword; in sight 6-25 and a bow with arrows -> shoot (`shoot`:
  draw one second, aim above for the drop); hit on a narrow bridge by someone out of reach -> walk back to the last wide
  ground (`awareness.lastLand`).
- **While bridging** it looks behind every five blocks (what it can see is what it faces), and with an enemy seen or
  heard in the last 20 s it places a block either side of each bridge block (rails against knockback).
- **Faster steps**: the release comes earlier (0.38 blocks from the middle, was 0.45) and the wait after it is 4 ticks
  (was 6), for the shorter reaction time.
- Walks that are part of a fight or a retreat do not stop for the threat they answer (`walkTo(..., { interrupt: false })`).

## How it tested

A test opponent that walks up behind and hits at the cooldown, both bots on the practice map's middle island:
- Bed Wars, before: hit once, never swung back, knocked into the void after 6 s (it was stuck in a 6 s pathfinder walk
  toward home at the island's edge). After: it turned and fought, 6 hits each way.
- SkyWars, after: it swung back from the second second and won (the attacker out at 15 s).

## What to do with this

Review these changes and the reasoning. Take what is good for houseBotDs -- especially reacting to hits and to heard
players, interruptible long moves, and the shorter reaction time -- and improve on it where you can (you know your own
bot's structure). Remember the opponent now does all of this too: it notices you behind it, fights back, shoots if it
has a bow, rails its bridges when you are about.
