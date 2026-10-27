# Bed Wars

Teams on floating islands, each protecting a bed. Played as Hypixel's Bed Wars, the game the name means to most players.

## Sources

- Hypixel wiki, *Bed Wars* (raw wikitext through the MediaWiki API): the modes, the 5-second respawn, final kills, the
  Item Shop and Team Upgrades price tables (Solo/Doubles and 3s/4s), the generators' tier-I rates (diamonds about every
  30 s, emeralds about every 65 s), the event order.
- Hypixel forum guides and the wiki timetable: Diamond II 6:00, Emerald II 12:00, Diamond III 18:00, Emerald III 24:00,
  Bed Destruction 30:00, Sudden Death 40:00, Game End 50:00; the traps and their effects.

## Files

| File | What it is |
|---|---|
| `teams.js` | The eight teams (Red, Blue, Green, Yellow, Aqua, White, Pink, Gray), their blocks, and the modes. |
| `arena.js` | The map from `{ teams, theme, seed }`: bases, diamond islands, the middle, the waiting room. Pure. |
| `rules.js` | The match: lobby, teams, generators, deaths and respawns, beds, upgrades, traps, the timetable. Pure. |
| `shop.js` | The Item Shop and Team Upgrades, purchases, the permanent kit, the loadout. Pure. |
| `explosions.js` | TNT and fireballs: what they break and whom they hurt. Pure. |
| `client.js` | The game in the browser: host and guests, the world, shopkeepers, generators, the player. |
| `visuals.js` | Holograms, generator piles, primed TNT, fireballs. |
| `ui.js` | Lobby, scoreboard, titles, shop windows, end screen. |

It reuses SkyWars' design (host-run match over the shared world's game channel, `sendGame`) and its seeded random and
cell keys (`../skywars/generator.js`).

## Not yet

- Sudden Death is announced, but no ender dragons come (and so no Dragon Buff upgrade).
- Bed Bug and Dream Defender are not sold: this game's mobs belong to each player's own world, so a silverfish or golem
  could not fight other players.
- The ender chest is not there; the team chest is.
- The generator rates for iron and gold (1.5 s and 6 s) are approximate: the wiki gives no figure.
