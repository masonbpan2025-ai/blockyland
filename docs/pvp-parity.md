# Player-versus-player combat

Players in a shared world can fight when the host leaves **PvP** on (the default, as on a Minecraft server). The host decides
every hit. The rules are Java Edition's, from [Tutorial:PvP (Java Edition)](https://minecraft.wiki/w/Tutorial:PvP_(Java_Edition))
and the wiki's Damage, Knockback, Sweep attack and Particles pages, in `src/pvpCombat.js`.

| Rule | Value |
|---|---|
| Reach | 3 blocks ("the 3 block attack reach"), 5 in Creative; the crosshair must be on the exact 0.6 × 1.8 box (1.5 sneaking) |
| Attack cooldown | damage × (0.2 + 0.8 × charge²); a *strong* attack needs 84.8% of full damage (charge 0.9) |
| Critical hit | strong, falling, not on the ground, not sprinting, not in water, climbing, flying, riding, blind or slow-falling: ×1.5 |
| Sprint-knockback hit | strong while sprinting: one extra level of knockback along the attacker's facing; it ends the sprint, and the attacker keeps 60% of its speed; sprinting starts again only after forward or sprint is pressed again (the W-tap) |
| Sweep | a strong sword hit on the ground, neither critical nor a sprint hit, while barely moving: 1 damage (more with Sweeping Edge) to other players beside the target |
| Knockback | 0.4 blocks/tick away from the attacker, old horizontal speed halved, lifted to 0.4 when on the ground; Knockback enchantment levels add 0.5 each |
| Hurt window | 10 ticks after a hit: a weaker or equal hit does nothing, a harder one deals only the difference and does not knock back |
| Shields | block hits from the front half; an axe disables a shield for 5 seconds |
| Fire Aspect | sets the player alight for 4 seconds a level |
| Particles | crit stars for a critical hit, blue enchanted-hit stars for enchantment damage, ⌊damage × 0.5⌋ dark damage hearts for a hit of more than 2, a sweep arc — and no block fragments |
| The hit player | flashes red for 10 ticks; the knockback arrives as their own movement |
| Sounds | weak, strong, critical, knockback and sweep attack sounds |
| Death message | "*player* was slain by *player*" |

## Tests

```sh
node --test --test-isolation=none tests/pvpParity.test.js tests/pvpMechanics.test.js
npx playwright test -c playwright.share.config.js e2e/pvpBots.pw.js
```

The browser test has two bots fight through the real click path over a real shared world (`playerBot.js`: `fight player`,
`fight player with crits`, `fight player with sprint hits`). It checks the damage of a critical hit (9 with an iron sword) and
a plain one (6), the crit stars and the four damage hearts, that no block fragments appear, the knockback of a plain hit and
the longer one of a sprint hit, the reach, and the death message.
