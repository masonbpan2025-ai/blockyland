# Redstone engineering

The redstone engine runs in loaded chunks at ten redstone ticks per second. It has a centered 3D lever with an angled handle and ON/OFF indicator, connected dust that changes brightness with power, and lamps whose light switches with the circuit. See [the current audit and remaining parity gaps](redstone-audit.md) before relying on exact Java Edition behavior.

## Controls

- Right-click levers to toggle, buttons to pulse, repeaters to cycle 1–4 tick delay, comparators to select compare/subtract, daylight detectors to invert, and note blocks to change pitch.
- Place directional devices facing the direction you are looking. Sneak-right-click cycles east, west, up, down, south and north. Extended pistons must retract first.
- Redstone dust inventory items place wire. Components are available in the Creative Redstone tab; core controls, repeaters and pistons also have recipes.
- Right-click a dispenser, dropper or hopper with an item to insert one. Empty-hand right-click retrieves its first stack. Dispensers fire arrows or prime TNT on a rising edge; other contents are dropped. Hoppers transfer one item between connected device inventories every four redstone ticks unless powered.
- Right-click a crafter to edit its nine-slot grid. Select a hotbar item then a slot; right-click an empty slot to disable it. A rising signal schedules one craft operation after four game ticks.
- Copper bulbs toggle and retain their light on each rising edge; comparators read 15 when lit. Detector/activator rails and trapped chests now participate in redstone.

## Working examples

Use an open loaded area. Examples refuse to overwrite occupied cells.

- /redstone demo elevator builds a sticky-piston/slime platform beside you. Step onto it and toggle its lever to travel up or down one block. A ceiling that would trap a rider prevents extension.
- /redstone demo flyer builds and starts a six-block one-way engine. It uses one piston, one sticky piston, two slime blocks and two observers. It repeatedly pushes the front section and pulls the rear section. Put obsidian ahead to park it.

These examples use the same component simulation as hand-built circuits; their movement is not scripted. The engine can be oriented vertically to make a flying-machine lift. The shipped elevator is a simple one-block teaching example, not an automatic multi-floor lift.

## Supported behavior

Dust has strength 0–15 and loses one per wire; disconnected loops discharge. Repeaters restore strength and delay output. Comparators compare or subtract side input. Torches invert their support's input. Observers pulse after watched block/state changes and when moved. Buttons, pressure plates, daylight detectors, redstone blocks and arrow-hit targets supply power. Powered iron gates/trapdoors open, lamps illuminate, notes play and TNT primes.

Pistons push at most twelve blocks. Sticky pistons pull on retraction, except that a one-redstone-tick pulse can spit a block; slime/honey carry adjacent blocks but do not stick to each other. Slime conducts redstone; honey does not. Obsidian, bedrock, extended pistons and immovable block entities cannot move. Riders move with platforms, and movement stops at unloaded chunks. Circuit settings, facing, component inventories and pending pulses persist in map saves.

## Compatibility limits

This is not complete Java/Bedrock parity. Short-pulse sticky behavior, latent piston quasi-connectivity, torch burnout, crafter recipes, bulb toggling, basic rail automation and dropped-stack hopper pickup are implemented. Exact Java update-order/CUD exploits, sculk vibration circuits, every analog container and dispenser action, all note-block instruments and complete variant coverage remain unfinished. Moving blocks advance in voxel steps. The audit lists the exact tested scope and outstanding work.

Validation: tests/redstone.test.js covers circuits, timing, controls, a rider elevator, a running flying engine, immovable blocks, twelve-block limits, save/restore and inventory pulses. Open /tests/redstone-effects.html on the dev server to inspect models and controls.

## Bot workshop

Open [the lightweight redstone bot workshop](http://localhost:3000/tests/redstone-tutorials.html) on the development server. Choose a circuit and press **Build and test**, or **Run all scenarios**. It uses actual PlayerBot controls, loaded flat chunks, inventories, redstone and the world mesher without generating a playable map. The comparator inventory example is a prerequisite readout test, not a reproduction of stale-state CUD designs.

`/bot activate x y z` (also `toggle` or `press`) walks into reach, aims and right-clicks a control. Run `node scripts/test.mjs redstone`, `node scripts/test-redstone-browser.mjs` (requires the server and Edge), and `npm run build`. Browser screenshots and the report go into `test-results/redstone-audit/`.

References: https://minecraft.wiki/w/Tutorial:Redstone, https://minecraft.wiki/w/Tutorial:Elevators, https://minecraft.wiki/w/Tutorial:Flying_machines
