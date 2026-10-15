# Minecraft in the Browser

A from-scratch, Minecraft-style voxel game that runs entirely in the browser (three.js + Vite, plain JavaScript, no game server required). It pairs a **survival-faithful Minecraft 1.21.4 replica** — terrain, biomes, structures, redstone, brewing, enchanting, dozens of mobs with ported AI — with things most voxel projects don't have: an **LLM world agent** that edits the world from natural-language requests, an in-game **Building Studio**, a **data-pack runtime**, a **mod/game-package system** with an authoritative server model, and a **bot-driven parity test suite** that checks the game against the Minecraft Wiki.

```sh
npm install
npm run dev        # http://localhost:3000
```

Requires Node.js 22+ (tested on 24). `npm run dev` regenerates the mod catalog automatically.

---

## Contents

- [Key features](#key-features)
- [How it differs from Luanti and Minecraft Web Client](#how-it-differs-from-luanti-and-minecraft-web-client)
- [AI world agent](#ai-world-agent)
- [Mods and designed worlds](#mods-and-designed-worlds)
- [Sharing a world](#sharing-a-world)
- [Engine performance](#engine-performance)
- [Lighting, water and effects](#lighting-water-and-effects)
- [Testing](#testing)
- [Repository layout](#repository-layout)
- [Documentation index](#documentation-index)
- [Known limits](#known-limits)

---

## Key features

**Gameplay replica (target: Java Edition 1.21.4)**
- Procedural worlds with seeded, order-independent chunk generation, many biomes, caves, oceans (including warm-ocean reefs) and trees across ten species plus huge mushrooms.
- Structure generators ported from the game's own logic: villages, pillager outposts, ancient cities, bastions, end cities, mansions, monuments, trial chambers, trail ruins, shipwrecks, ruined portals, pyramids, igloos and more (`src/worldgen/`, with a jigsaw system and NBT template support).
- Survival systems: hunger, durability, status effects, crafting, smelting, brewing, enchanting, anvils, smithing, villager trading and a raid system, beds, fishing, farming, elytra, beacons, nether and end portals, boss fights, weather and day/night.
- A large mob roster, each with its own behavior module (animals, hostile mobs, nether and aquatic mobs, villagers, the wandering trader, golems, bosses) plus a natural mob-spawning engine built around a tick clock and a light engine.
- Flowing water with sources, seven flow levels, falling water, buckets and currents; lava-to-obsidian interaction.
- Redstone, rails, and an Inspector for browsing mobs, blocks, items and structures in isolation.
- Creative and survival modes, difficulty levels, game rules and a `/give`-style command layer.

**Beyond a replica**
- **AI World Agent** — press **C** and describe what you want built, edited or removed. The model sees the terrain around you and a screenshot of your view. See [AI world agent](#ai-world-agent).
- **Player bot** — a scriptable bot that drives the *real* player (physics, raycasting, mining times, tool checks, drops) using A* pathfinding. No API key needed for built-in commands.
- **Building Studio** — design, save and reuse your own buildings in-game, on an invisible ground in empty space.
- **Data packs** — import/paste vanilla-style JSON data packs and apply or revert them in a running world.
- **Mod / game-package system** — namespaced content, dependency and engine-version checks, and a server-authoritative game model (a Web Worker locally, a Node host online). Two example packages ship in `src/mods/`.
- **Share a world with a link** — *Share This World* gives you a link; friends click it and join your world directly from their browsers (peer to peer, your computer is the server, up to 8 players). See [Sharing a world](#sharing-a-world).
- **Import/export layer** — a canonical block-state model with Sponge `.schem` and vanilla structure NBT codecs, plus a `.mcworld` exporter. Format-specific code is confined to `src/io/`.
- **Test-first parity work** — 21 documented defects found and fixed by comparing against the Minecraft Wiki through both deterministic Node probes and a headless-browser bot, with open gaps listed honestly.

---

## How it differs from Luanti and Minecraft Web Client

These projects solve different problems. This table is about intent, not quality.

| | **This project** | **[Luanti](https://www.luanti.org/)** (ex-Minetest) | **[Minecraft Web Client](https://github.com/zardoy/minecraft-web-client)** |
| --- | --- | --- | --- |
| **What it is** | A Minecraft-1.21.4-style game *and* a small package platform, in the browser | A general-purpose voxel **game engine**; the look and rules come from the installed game | A vanilla-compatible **client** (plus integrated singleplayer server) for real Java servers |
| **Runs as** | Static web app + optional Node helpers; no install for players | Native app (desktop, Android); servers run separately | Web app; needs a TCP→WebSocket proxy to reach Java servers |
| **Gameplay source** | Reimplemented locally: worldgen, mobs, redstone, brewing, etc. | Whatever game you choose (e.g. Luanti Game, community games) | The Java server's world and rules, or its built-in server |
| **Primary goal** | Faithful, self-contained survival sandbox you can extend and test | Moddable engine for *many different* voxel games | Play on existing Minecraft servers from a browser tab |
| **Extending it** | JS packages with manifests, dependencies and an authoritative session; LLM agent; data packs; Building Studio | Lua mods, server-side, via ContentDB | Resource packs, Mineflayer plugins |
| **Language** | JavaScript (ES modules), three.js | Engine in native code; Lua for content | TypeScript, three.js, Mineflayer/Prismarine |
| **AI building** | Built in: LLM agent with terrain and screenshot context, plus offline presets | Not part of the engine | Mineflayer-based bots possible |
| **Real Minecraft servers** | No: worlds are shared between browsers peer to peer through a link, with your computer as the server | No (different protocol) | Yes, its main purpose (1.8–1.21.5) |
| **Verification** | Wiki-parity test passes with recorded defects and open gaps | Mature, community-maintained | Maintained upstream (currently in maintenance mode) |

**Where each is the better choice**
- Pick **Luanti** to build a *different* voxel game with a mature native engine, Lua mod ecosystem and server-side content distribution. This project deliberately does not embed Lua, copy its package format or let servers push arbitrary code to clients.
- Pick **Minecraft Web Client** to join real Java servers or open real world saves in a browser. This project's local world is its own replica, not Java server state, and it does not connect to Java servers.
- Pick **this project** when you want a hackable, readable, single-language Minecraft-like in the browser with deep survival parity, LLM-assisted building, authored/designed worlds and a test suite you can trust to catch regressions.

Luanti and Minecraft Web Client facts above come from their public documentation and READMEs; both projects evolve, so check them for current details. The design notes in [`docs/voxel-engine-plan.md`](docs/voxel-engine-plan.md) and [`docs/mod-system.md`](docs/mod-system.md) record what this project learned from reading Luanti, noa, Voxelize and prismarine-viewer.

---

## AI world agent

Press **C** to open the agent terminal. In **⚙️ Settings**, pick a vendor, model and API key. Model choices persist in browser `localStorage`; **API keys are session-only by default**, held in this page's memory (not `sessionStorage` or `localStorage`). Requests go directly from the browser to the selected vendor over HTTPS, with no proxy. Using or unlocking a key also refreshes that vendor's model list.

### API key storage and security

- **Use for session** keeps a key only in the current page. Reloading, closing the page, or choosing **Lock / forget session** removes the active copy. Choosing session-only also deletes any previously remembered key for that vendor.
- **Remember key (encrypted)** is optional. Enter an API key, select the checkbox, enter a unique passphrase of at least 12 characters, then choose **Remember encrypted**. Web Crypto uses AES-256-GCM with a fresh random salt/IV and PBKDF2-SHA-256 (600,000 iterations). Only the ciphertext and its public encryption metadata are stored locally; the passphrase and derived encryption key are not retained. This requires HTTPS or localhost. It works independently for each vendor and website origin.
- After reopening or reloading the game, remembered keys start **locked**. Enter the passphrase and choose **Unlock** to use the key in this page. **Lock / forget session** keeps the encrypted copy but discards the active key; **Delete key** removes both. Locking/deleting in one tab does not clear another tab's already unlocked key or cancel requests already in progress. Forgotten passphrases cannot be recovered: delete the vault and enter the API key again.
- Existing unencrypted `mc_agent_key_*` / `gemini_api_key` entries are removed when the agent initializes. A recovered key remains available for that page only (unless an encrypted vault already exists, in which case that vault stays locked). The terminal announces the migration. Select Remember to opt into encryption; otherwise reload discards the recovered key. Deleting browser storage is not guaranteed forensic erasure of previous disk copies/backups; revoke an old key at the provider if it may have been exposed.
- Encryption protects the saved copy **while locked**. Scripts running on the page, trusted executable mods, compromised dependencies, browser extensions with sufficient permissions or malware can still capture an unlocked key or passphrase. This is not equivalent to server-side secret storage. Keep your passphrase separate from the API key and use trusted builds/mods.
- **Best practice:** use a dedicated, least-privilege API key with an **expiration date** where supported. Set a **small hard spending limit** or **limited prepaid balance**, with auto top-up disabled if available, and enable usage alerts. Provider support varies; an alert or soft budget is not a hard cap. Rotate keys regularly and revoke them in the provider console when no longer needed. Deleting a local key does not revoke it at the provider.

Run `npm run test:agent:vault` for storage/cryptography regression tests, and `npm run test:agent:vault:browser` for the real terminal controls in Microsoft Edge. The browser test uses fake credentials and blocks provider requests.

| Vendor | Default model | Default effort | Key |
| --- | --- | --- | --- |
| **DeepSeek** (default) | `deepseek-flash` | `high` | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| ChatGPT | `gpt-6-astra` | `medium` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Gemini | `gemini-3.8-flash` | not applicable | [aistudio.google.com](https://aistudio.google.com/apikey) |

Each vendor keeps its own key, model and reasoning effort. Override defaults with `VITE_DEEPSEEK_MODEL`, `VITE_OPENAI_MODEL` or `VITE_GEMINI_MODEL` in `.env.local` and restart Vite.

Each prompt carries recent conversation turns, stable structure IDs, names and positions, the local terrain, and (optionally) a downscaled screenshot of your first-person view, so spatial requests work:

- “Build a lighthouse overlooking the water.”
- “Replace its stone walls with brick, keeping the windows.”
- “Bridge that gap in front of me.”
- “Destroy the lighthouse.”

**Safety by design:** the agent returns validated JSON plans for the game's own actions; it never executes model-generated JavaScript. Structures track the blocks they change, so removal restores the originals while preserving later player edits.

**Streaming and long requests:** responses stream, with live reasoning display, elapsed time and a progress bar. Requests abort only after 60 s of silence. If a model exhausts its output budget while thinking, the agent retries once with thinking off. HTTP failures explain what to do (bad key, no credit, rate limit, unavailable model).

**Offline mode** (⚙️ Settings or `/offline`) switches to a built-in preset planner without deleting your key. It is not a language model: it handles preset builds (e.g. “build a lighthouse”, “destroy it”) and basic world commands. With no key at all the status reads **NO KEY**; API errors never silently fall back to offline presets.

**Player bot commands** (no key needed): `mine 8 coal ore`, `go to 10 64 10`, `follow cow`, `attack zombie`, `equip stone pickaxe`, `bot status`, `stop bot`. Details and limits in [`docs/player-bot.md`](docs/player-bot.md).

---

## Mods and designed worlds

The engine/game/package split follows ideas from Luanti (engine hosts separately installed games) and Fabric/Bedrock (manifests, `namespace:path` identities, dependency and version metadata), implemented in JavaScript.

- **Layers:** engine (chunks, meshing, rendering, collision, ticks) → base game (Minecraft-style content) → packages (rules, maps, presentation) → world instances (seed, state, save).
- **Packages** live in `src/mods/<id>/` with a `mod.json` manifest. `npm run mods:generate` validates them and emits the catalog; deleting a package and regenerating removes it from the build.
- **Authority:** a package's rules run in an isolated `createGame()` factory — in a Web Worker for local play or on a Node host online (30 Hz ticks, snapshot then deltas, bounded input packets). Clients render declarative scene definitions.
- **Examples:** `rescue-adventure` (a two-hero co-op campaign with five biomes) and `dragonball-tournament`.
- **Trust model:** packages are trusted, build-installed code. This is not a sandbox for downloaded code, and there is no marketplace installer.

Start with [`docs/mod-system.md`](docs/mod-system.md), [`docs/mod-api.md`](docs/mod-api.md) and [`docs/creating-mods.md`](docs/creating-mods.md).

---

## Sharing a world

Play with a few friends in your world, with nothing to install and no account to make.

1. Open the pause menu (or the start screen) and choose **Share This World**.
2. Copy the link and send it to your friends.
3. They click it. They are in your world.

Your computer is the server: friends connect straight to your browser, not to a service in the middle, so keep your tab open while they play. Up to 8 players. Blocks, players and chat are shared; see [`docs/sharing.md`](docs/sharing.md) for exactly what is, how a link reaches friends on another network (it needs the game served from an address they can open), the security model and troubleshooting.

```sh
npm run dev      # friends on the same Wi-Fi: the share dialog lists links they can open
npm run share    # build and serve the game plus the sharing service, for a tunnel or a server
```

Java server play (`/multiplayer.html` and its bridge) was removed: this project focuses on sharing worlds peer to peer.

---

## Engine performance

Performance is measured, not assumed. Highlights from [`docs/voxel-engine-plan.md`](docs/voxel-engine-plan.md) (harness figures on one development machine; ratios matter more than absolutes):

- Voxel lookup: 121 → **28 ns/call**; one-chunk mesh: 44 → **14 ms**.
- Time-sliced meshing with a shared per-frame budget: frames over 16.7 ms while walking at view radius 8 fell from **16.1% → 0.2%**.
- Chunk streaming with nearest-first ordering and real unloading keeps resident geometry bounded (≈6.5 MB on a long walk, down from 41 MB and growing).
- Deterministic generation: chunks are byte-identical regardless of generation order.
- Warm-ocean reef optimization cut underwater mean frame interval by 35% and draw calls by 42% ([`docs/reef-performance.md`](docs/reef-performance.md)).

The docs also record what was measured and rejected, and the bugs that made earlier “done” claims false.

---

## Lighting, water and effects

- Colored block lights (lava, glowstone, sea lantern, torches, redstone lamp, enchanting table, lit furnace, soul torch). The nearest eight exposed lights within 40 blocks cast filtered shadows; change `MAX_BLOCK_LIGHTS` in `src/lighting.js` to adjust the budget. Sun shadows cover a 64-block square around the player.
- An optional **Lightweight Shader** adds bloom, water and atmosphere.
- Water: sources, flow levels, falling water, buckets, currents; levels are saved with the world and updates are work-budgeted.
- Pickups, textured TNT with smoke, light flash and debris.
- Loading overlay with real progress: generation and meshing are batched with yields so the page never freezes.

Visual test pages: `/tests/visual-effects.html`, `/tests/water-flow.html` on the dev server.

---

## Testing

```sh
npm test                 # node --test, real voxel/execution code, mocked LLM responses
npm run test:list        # list grouped suites
npm run test:mob | test:agent | test:redstone | test:world | test:build | test:combat | test:render | test:persist
npm run test:bot         # player-bot controller tests
npm run test:bot:browser # Playwright: bot in a private arena in the real game
npm run test:share:browser # Playwright: two real browsers join one world through a link
npm run test:mods
```

Automated tests make no billable API calls. The parity suites combine a seeded Node probe with a headless-browser bot that reads real inventories, voxels and entities, and never trusts the bot's own success message. See [`docs/parity-testing-summary.md`](docs/parity-testing-summary.md) for the full record: defects fixed, and open issues with reasons.

---

## Repository layout

```text
index.html                      entry page (the game)
src/                              game and engine modules (main.js, world.js, mesher.js, mobs, crafting, ...)
src/worldgen/                     structure generators, jigsaw, NBT templates, terrain adaptation
src/io/                           canonical model, NBT, Sponge/vanilla codecs, .mcworld export
src/engine/                       engine services for authored/mod games
src/mods/                         game packages, loader, registry, compatibility checks
src/multiplayer/                world sharing: links, WebRTC session, remote players
server/                           world relay, Java-server bridge, mod-game host
public/datapacks, public/assets   bundled data packs and assets
docs/                             architecture notes, parity reports, mod API
tests/, e2e/, scripts/            unit, browser and tooling scripts
```

---

## Documentation index

| Topic | Docs |
| --- | --- |
| Engine design and benchmarks | `docs/voxel-engine-plan.md`, `docs/reef-performance.md` |
| Mods | `docs/mod-system.md`, `docs/mod-api.md`, `docs/creating-mods.md` |
| Sharing a world | `docs/sharing.md` |
| Import/export | `docs/MINECRAFT_IO_ARCHITECTURE.md`, `_PARITY.md`, `_REFERENCES.md` |
| Structures | `docs/STRUCTURE_ARCHITECTURE.md`, `STRUCTURE_PARITY.md` |
| Mob spawning | `docs/MOB_SPAWNING_ARCHITECTURE.md`, `MOB_SPAWNING_PARITY.md` |
| Per-mob parity | `docs/*-parity.md` |
| Testing | `docs/parity-testing-summary.md`, `docs/test-determinism.md` |
| Player bot, `/give` | `docs/player-bot.md`, `docs/give-command-agent-guide.md` |

---

## Known limits

- Not a general voxel engine like Luanti, and not a Java-protocol client for its local worlds.
- Targets Java 1.21.4 behavior; the parity report lists open gaps (for example, structures cannot yet span chunk borders, and some mob/system details remain).
- No redstone power simulation for the always-on redstone lamp; no waterlogging, bubble columns or full lava flow.
- Mod packages are trusted code.
- Shared worlds are peer to peer: mobs, redstone, fluids and the clock run separately on each player's computer, and anyone holding the link can join until the host stops sharing. There is no kick or ban yet. See [`docs/sharing.md`](docs/sharing.md).
- Bot limits: ore search within 24 blocks, no swimming or parkour, no crafting yet.
- This is an unofficial fan project, not affiliated with Mojang or Microsoft. Third-party licenses (e.g. mineflayer-pathfinder) are preserved under `docs/licenses/` and `src/vendor/`. Add a top-level `LICENSE` before publishing.
