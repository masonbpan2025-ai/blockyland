# Weather and ambient particles

Weather uses the [Minecraft Wiki weather rules](https://minecraft.wiki/w/Weather). Ambient source mappings use the [Java particle catalogue](https://minecraft.wiki/w/Particles_(Java_Edition)) and [Minecraft's Spring to Life release notes](https://www.minecraft.net/en-us/article/minecraft-java-edition-1-21-5). Sprite shapes are original procedural artwork.

## Weather fixes

- Independent natural rain/thunder timers; `doWeatherCycle` freezes their progression. Sleeping resets wet weather without continually postponing rain during clear days.
- Rain becomes drifting snow in cold biomes, including Frozen Peaks. Dry biomes remain dry. Altitude changes precipitation in transitional climates.
- Precipitation stops at solid roofs, glass, leaves, slabs, snow layers, and liquids. Roof edits invalidate cached columns immediately. Rain sounds become quieter under cover; snow is quiet.
- Branching lightning bolts, multiple light pulses, thunder, damage, fire, charged creepers, pig/villager/mooshroom conversions and skeleton traps. Natural strikes choose rain-exposed loaded columns. Exposed lightning rods redirect strikes and generate a redstone pulse.
- Rain hydrates uncovered farmland and extinguishes actors/fire/arrows. Snow does neither. Snow restores missing layers and freezes exposed source-water edges away from lamps.
- Rain/snow slowly fill cauldrons in three levels. Bottles remove one water level; buckets retrieve full water, lava, or powder-snow cauldrons.
- Map saves correctly distinguish clear/rain/thunder and preserve weather timers and cauldron levels. Legacy weather saves still load.
- No rain or thunderstorms in Nether/End. The shader adds a separate purple End sky flash and sound, inspired by the [Vibrant Visuals End effect](https://minecraft.wiki/w/Vibrant_Visuals).

Quick checks with Creative or cheats enabled:

```text
/weather rain 120
/weather thunder 120
/summon lightning_bolt ~ ~ ~5
/give @s firefly_bush 1
/time set night
```

`/weather rain` produces snow in Frozen Peaks; snowfall is not a separate command or permanent weather. Natural storms can take a long time to begin. End flashes require the shader enabled in ESC settings.

## Ambient flake coverage

| Source | Effect |
| --- | --- |
| Soul Sand Valley | Dark drifting ash |
| Basalt Deltas | White drifting ash |
| Crimson / Warped Forest | Coral / teal spores |
| Cherry leaves | Fluttering pink petals |
| Pale oak leaves | Pale falling leaves |
| Every other leaf block | Falling leaves with species/biome tint |
| Spore blossom | Green falling spores and local airborne spores |
| Mycelium | Small surface dust |
| Exposed lava / fire / torches / campfires | Rising orange sparks and smoke; blue soul-fire sparks |
| Firefly bush | Blinking fireflies at night |
| Underwater | Suspended specks confined to water |
| Rain-wet leaves / wet sponge / ceilings below liquids | Falling water/lava droplets |
| Crying obsidian / end rods | Purple tears / small glowing motes |

Particles come from real blocks, not a global cherry-petal overlay. Roofs beneath canopies block emission into rooms. Particles collide with blocks, settle or expire, slow in cobwebs, and retain their world positions as the camera moves. Dimension changes, teleports, map loads and teardown clear them. Firefly bushes are placeable and generate beside water in their supported habitats in newly generated chunks.

The ambient system uses one reusable geometry and a fixed 512-particle pool. Chunk emitter discovery is cached, scans at most four chunks per refresh, and never generates missing chunks. The browser fixture measured about 0.09–0.55 ms per ambient update on this machine; this is a fixture measurement, not a frame-rate guarantee.

## Validation

```powershell
node --test --test-isolation=none tests/weatherParity.test.js tests/ambientParticles.test.js
node scripts/preview-weather.mjs
npm run build
```

There are 44 weather tests and 28 ambient tests. The browser fixture exercises 12 weather cases and 10 ambient cases through the actual Game materials and renderer. Images and measurements are in `docs/artifacts/weather-preview-results.json`, `weather-*.png` and `ambient-*.png`. No saved worlds or user browser sessions are changed.

## Engine-specific limits

The baseline is Java-style weather plus an optional End flash. Bedrock-only snow-layer accumulation and frosted leaf textures are not implemented. Climate altitude is scaled to this engine's 64-block world. Particle density, lifetimes, artwork and emission sampling are bounded approximations rather than identical Mojang renderer internals. Skeleton trap probability uses regional difficulty when supplied by the host; otherwise it uses the difficulty's starting probability. This work does not add thrown-trident/channeling combat or reproduce every combat/event particle in the catalogue.
