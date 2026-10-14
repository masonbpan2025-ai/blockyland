# Rescue Adventure source migration

Origin: user-supplied shattered-realms-source.zip. Gameplay and procedural models were adapted from public/game/game.js; markup/styles from index.html and game.css. Hosting scaffold, bundled Three.js and Canvas renderer are not used. No additional authorship/license is asserted for the supplied game.

The server uses engine declarative scene handles and grid collision. It has no DOM, renderer, browser input listeners or animation-frame loop. The engine owns rendering, voxel storage, input transport and authority.

## Preserved rules

Five seeded realms and sequential bridge guardians; 180 ordinary enemies with increasingly strong biome rosters; six elite types; boss armor/resistance and themed summons; distinct Mason/Jayden controls and statistics; food-only healing and teammate revival; exclusive arrow/fireball drops; shared levels, elemental weapons and ammunition capacity; five-second Kamehameha with interruption; story, locked cage and final rescue celebration.

The original generator, combat, AI and procedural models remain in `server/game.js`, inside a per-world factory. Engine scene handles replace actual Three meshes there; engine `gridCollision` replaces movement sampling. The old standalone renderer, shader setup, global key handlers, canvas minimap renderer and RAF loop were removed. `client/` contains scoped presentation markup/styles; `maps/` contains the launch template.

## Engine adaptation

Terrain descriptors become real base-engine block chunks. The engine renders those chunks and interprets entity geometry and animation definitions. Local play runs the authority in a worker, online co-op in Node. Server-assigned slots prevent clients from controlling another hero. Save restoration replays accepted inputs at the same fixed tick interval.

The shared engine's `CampaignPresentation` restores the source's warm lighting, ACES tone mapping, soft shadows, antialiasing, styled terrain/props, hero/spell/torch/explosion lights and soft sight boundary. `client/presentation.js` supplies package-owned colors and settings; the engine owns GPU resources and uses the existing renderer and voxel chunks. Living co-op heroes contribute their own sight circles. Camera following uses the original elevated angle with smoothing. Leaving the campaign disposes its resources and restores the base game's lighting/render settings. Tone events use the shared engine sound system. The finite campaign uses a shared engine swept-grid controller with game-owned gate/cage permissions.

## Menu integration repair

The base map loader originally requested first-person pointer lock after mounting the campaign view and reset the view's control policy. This prevented menu clicks. The loader now preserves exclusive authoritative controls, the base UI skips pointer lock for those games, and mounting the view releases an existing lock. Untouched declarative UI fields use null so they cannot erase template labels or reveal buttons that the template hides. Menus scroll independently from camera zoom, and the fullscreen host is transparent so it cannot cover the shared renderer.

## Running and validation

Select Rescue Adventure in Designed Worlds. Begin the story, then continue its four dialogue steps. Solo and local co-op use the local worker. Host New Online creates a two-player server room; Join Room opens another player's room or restores a server save. See `docs/creating-mods.md` for controls and validation commands.
