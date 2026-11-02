# Third-party notices

Blockyland is an independent fan project. It is not affiliated with, endorsed by or associated with Mojang Studios
or Microsoft. Minecraft is a trademark of Mojang Synergies AB.

Blockyland's own code is under the MIT license (`LICENSE`). This page lists what Blockyland uses that it didn't
make, which keeps its own terms. `public/assets/PROVENANCE.json` says file by file where
each shipped asset came from, and `scripts/checkPublicTree.mjs` keeps that list complete.

## Art shipped in `public/assets/`

| What | Where it comes from | Terms | Files |
| --- | --- | --- | --- |
| Block, item, entity, GUI and particle textures | Mojang's Minecraft textures, fetched from the [PrismarineJS/minecraft-assets](https://github.com/PrismarineJS/minecraft-assets) mirror by `scripts/download_assets.js` and `scripts/download_creative_assets.js` | © Mojang. The mirror's MIT license covers its code, not Mojang's art. Mojang's [usage guidelines](https://www.minecraft.net/en-us/usage-guidelines) govern it | 1,868 verified identical by content hash (`vanilla` in the provenance file) |
| The 64x texture pack (`packs/faithful_64x/`) | Made by `scripts/generate-faithful-64x.py`, which upscales the vanilla textures above | A derivative of Mojang's art. It is **not** the Faithful community pack, despite the folder name | 1,257 |
| Textures named like vanilla ones, with different contents | Edited vanilla textures, script-made replacements, or other versions: not yet confirmed one by one | Treat them as Mojang's until confirmed | 368 (`unknown-modified`) |
| Other textures | Mostly icons made by the `scripts/generate_*` and `scripts/compose-*` scripts, many of them drawn from vanilla textures | Not yet confirmed one by one | 558 (`unknown`) |
| `fonts/PixelifySans.ttf`: the game's pixel font | [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) by eifetx, from [Google Fonts](https://github.com/google/fonts/tree/main/ofl/pixelifysans). It replaced a fan-made `Minecraft.otf` whose license was not recorded | SIL Open Font License 1.1 (`fonts/PixelifySans-OFL.txt`) | 2 |

## Game data

| What | Source | Terms |
| --- | --- | --- |
| Mining, loot and food tables (`scripts/generate-mc-data.mjs`) | [PrismarineJS/minecraft-data](https://github.com/PrismarineJS/minecraft-data) | MIT for the repository. The data describes Mojang's game |
| Vanilla data pack JSON: recipes, loot, worldgen, tags (`scripts/build-vanilla-pack.mjs`, `scripts/generate-mob-spawn-data.mjs`, `scripts/fetch-misode-fixtures.mjs`) | [misode/mcmeta](https://github.com/misode/mcmeta), the output of Mojang's own data generator | Mojang's data |
| Wiki-derived figures (`scripts/fetch-*-wiki.mjs`, `scripts/generate-*-wiki-data.mjs`) | [Minecraft Wiki](https://minecraft.wiki) | CC BY-NC-SA 3.0 |

## Code

| Package | Use | License |
| --- | --- | --- |
| [three.js](https://threejs.org) | Rendering | MIT |
| [ws](https://github.com/websockets/ws) | The share server's WebSockets | MIT |
| [mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder) | The player bot's A* search, vendored in `src/vendor/mineflayer-pathfinder/` | MIT, © 2020 Karang (`src/vendor/mineflayer-pathfinder/LICENSE`) |
| [Vite](https://vitejs.dev), [Playwright](https://playwright.dev) | Build and browser tests only, not shipped | MIT, Apache-2.0 |
