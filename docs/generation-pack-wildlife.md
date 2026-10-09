# Generation pack wildlife

Preset biome files preserve native spawn categories and explicitly change density independently of
relative species weights. Scaling every weight in a category does not increase its population.

`engine_spawning` is an optional engine extension on biome JSON:

```json
{
  "engine_spawning": {
    "generation": { "creature": { "probability": 0.95, "groups": 1 } },
    "caps": { "creature": 240, "monster": 12 },
    "chance": { "monster": 0.12 },
    "passive_interval": 80
  }
}
```

Generation uses at most `groups` consecutive rolls per category per newly generated chunk; every roll
must pass `probability`. Caps use the normal 289-chunk scaling. Runtime chance gates attempts in the
candidate chunk's biome; passive cadence and caps come from the player's biome. Generation ignores
runtime caps, so animals elsewhere do not prevent newly explored areas from receiving wildlife.
Values are bounded: probability/chance 0–1, groups 1–3, caps 0–400, interval 20–1200 ticks.
Vanilla biome `creature_spawn_probability` is also honored when no generation extension applies.
Applying/reverting packs changes these settings through the same biome registry as terrain.

Generation still requires valid ground, light, clearance and fluid. Aquatic categories sample actual
water beneath the surface (including beneath ice); ambient categories sample sheltered cave spaces.
Bats live in dark caves, not on sunny lawns. Deep Dark remains free of ordinary mobs, and the void
and non-Overworld dimensions retain their existing generation behavior.

| Pack | Population and terrain intent |
| --- | --- |
| Lush Havens | Frequent small groups, balanced diversity, bees/parrots in woodlands, polar bears on snow, fish in water; fewer trees leave usable ground; low hostile cap/chance. |
| Pollinator Meadows | Open flower-rich plains, meadows and flower/cherry forests; bees, sheep, cows and rabbits; calm nights. |
| Jungle Canopy | Jungle-family biomes only; jungle trees, parrots, pandas, ocelots, tropical fish and sheltered bats. |
| Taiga Trails | Taiga-family biomes only; spruce, native snow/podzol, foxes, wolves and rabbits. |
| Desert Caravans | Arid biomes only; native surfaces, sparse vegetation, camels, rabbits and armadillos. |
| Reef Life | Warm/lukewarm oceans only; native terrain, tropical fish/pufferfish schools, squid and dolphins. |
| Mushroom Sanctuary | Mushroom fields only; native mycelium and mushrooms, frequent mooshroom groups, no natural monsters. |
| Wild Highlands | Taller terrain; native wildlife and rates. |
| Amplified Peaks | More extreme height variation; native wildlife and rates. |
| Verdant Overgrowth | Very dense vegetation, frequent wildlife and normal hostile cap. |
| Amber Autumn | Warm foliage/grass/sky colors; foxes, wolves and rabbits able to spawn on podzol. |
| Frozen Frontier | Snow, cold temperature and snow-compatible wildlife; lower population than Lush. |
| Scorched Badlands | Sparse vegetation and desert wildlife; increased hostile cap. |
| Sunken Shores | Raised sea and frequent aquatic groups, with aquatic categories preserved. |
| Dungeon Rush | Sparse surface animals and low hostile cap/chance; a wider selection of buried structures. |
| Beast Wilds | High hostile cap and larger groups; no structures; normal day/night cycle. |

The original presets had uniform terrestrial tables, no authored density settings, and several floor
mismatches: snow with grass-only cows, podzol with grass-only animals, and water with no fish categories.
These are corrected in the generated pack files rather than by bypassing spawn validation.

Run `node --test --test-isolation=none tests/presetWildlife.test.js tests/lushGeneration.test.js`.
Fixtures cover constructors on explicit habitats, all land biomes, all sixteen packs on real seeded terrain,
aquatic diversity, density caps/cadence/chance, and registry restoration. For seed 4289 over 25 chunks,
Lush forest and jungle fixtures contain bees, parrots and a broad mix of terrestrial animals, and oceans
contain fish, squid, dolphins and cave bats. These are reproducible sample measurements,
not a promise that every individual chunk will contain every species. Existing populated chunks are
not rerolled; evaluate changed generation using a new world or newly explored chunks.

The six biome-focused packs appear in the same World Generation Packs menu and use the same pack loader.
Select a matching biome for a focused world, or All Biomes for selective changes in a mixed world.
Their biome overrides leave unrelated biome terrain and wildlife untouched. Structure selection is a
world-wide setting: named structure types still obey the engine's placement and biome restrictions.
