# Test `/give` with the direct player-bot API

This is a task sheet for a small coding agent. Use deterministic JavaScript to execute commands and inspect results; use the language model to choose cases and explain failures. No game API key, Agent Terminal, chat input, or visible browser is required. A model provider key used by your coding-agent host is separate from the game's key.

Checked against this workspace on **2026-10-11**. Source can change while other agents work: perform the routing smoke test first on every run.

## 1. Reference and test objective

Reference: [Minecraft Wiki `/give`](https://minecraft.wiki/w/Commands/give).

Use **Java Edition plain-item syntax** for the main suite:

```text
/give <targets> <item> [<count>]
/give @s minecraft:stone
/give @p minecraft:diamond_sword 1
/give @s minecraft:ender_pearl 17
```

Check delivery, item identity, count, stack sizes, permission refusals, malformed arguments, and full-inventory overflow. Record the Java version/wiki revision used in your report. Do not combine Java and Bedrock syntax or call the browser game's policy identical to vanilla operator permissions.

Important distinction: the Java integer parser range and the command's delivery limit are different. This project's parser accepts 1 through 2,147,483,647, but [Mojang's 21w10a notes](https://www.minecraft.net/en-us/article/minecraft-snapshot-21w10a) introduced a **100-stack execution limit**: 6,400 ordinary 64-stack items, 1,600 pearls, or 100 unstackable swords. Verify the limit for the exact Java version under test before classifying the boundary cases. Do not use the implementation's constants as the sole specification.

The requested wiki page was blocked by robots restrictions during preparation. The plain-item baseline below is a test contract; edition/version-specific components and selector details must be checked against an accessible wiki revision or a matching vanilla server. If verification is unavailable, mark those cases `SPEC_UNVERIFIED` rather than claiming current full wiki parity.

## 2. Files to read, in this order

Read only these initially; search further after a failing case identifies the layer:

1. `src/playerBot.js`: `parsePlayerCommand`, `validatePlayerCommand`, `PlayerBot.run`.
2. `src/commandRunner.js`: `buildCommandContext`, `permissionRefusal`, `cmdGive`, `runCommand`.
3. `src/commands.js`: `resolveTargets`, `resolveItem`, `parseGive`, `giveItems`.
4. `src/inventory.js`: `addItem`, `clearAll`.
5. `src/entities.js`: `spawnDroppedItem`, dropped-item pickup.
6. `tests/commandParity.test.js`, `e2e/fixtures/survivalFixture.js`, `playwright.survival.config.js`.

The production command flow is:

```text
direct bot command action -> Game.handleCommand -> permission gate
                         -> commandRunner -> parseGive -> giveItems
                         -> real Inventory.addItem + real dropped entities
```

## 3. Known traps to check first

These are preparation findings, not instructions to assume that a later checkout has the same bugs:

- **Bot route:** the parser recognizes `type: 'command'`, but `PlayerBot.run()` currently falls through to `Unsupported player command.` There is no working command-action dispatch in the inspected version. A recognized command is not proof that it executes.
- **Overflow:** real `Inventory.addItem` can partially insert before returning `false`. `giveItems` assumes failure is non-mutating and probes by repeatedly calling it. A real-inventory probe with 63 stone, all other slots full, and `/give @s minecraft:stone 10` inserted one stone and requested ten dropped stone. Expected: insert one, drop nine. This duplicates one item.
- **Selectors:** `@a` and `@r` are explicitly refused; any syntactically valid literal name is treated as the local player. Both need separate vanilla-parity findings, not altered expected values.
- **Components:** the parser explicitly refuses square-bracket components. Report a supported-feature gap, not a malformed plain item.
- **Existing tests:** some overflow tests use `addItem` stubs that do not act like the real inventory. A green unit suite is insufficient evidence of correct delivery.

Do not change these findings into expected successes. Re-run and report the observed behavior.

## 4. Fast first pass: no browser

A ready-to-run diagnostic accompanies this guide:

```powershell
node scripts/probe-give-command.mjs --write
```

It writes `docs/artifacts/give-command-probe.json`. It uses the production command dispatcher and **real Inventory**, and records requested drops. It also tries the direct bot command route. It does not simulate dropped entities or player movement; do not label its results as a complete browser/bot test.

The probe's process exit code is not an assertion that `/give` passed. Inspect each row's `status`: `PASS`, `FAIL`, `GAP`, or `BLOCKED`.

Run the existing regression tests separately:

```powershell
node --test --test-isolation=none tests/commandParity.test.js
npm run test:bot
```

Do not install dependencies or regenerate a lockfile unless a dependency is actually missing. Preserve other agents' changes.

## 5. Direct bot route: mandatory smoke test

In a **disposable running test world**, configured Survival with cheats on:

```js
const game = window.game;
const bot = game.playerBot;
if (!game.worldReady || !bot || bot.active) throw new Error('Fixture is not ready.');

game.applyWorldSettings({ gameMode: 'survival', cheats: true });
game.inventory.clearAll(); // disposable fixture only

const result = await bot.run({
  type: 'command',
  command: '/give @s minecraft:stone 1'
});

const { BLOCKS } = await import('/src/blocks.js');
const received = [...game.inventory.hotbar, ...game.inventory.storage]
  .filter(Boolean).filter(s => s.id === BLOCKS.STONE)
  .reduce((total, s) => total + s.count, 0);
if (received !== 1) throw new Error(`BOT01: expected one stone; received ${received}`);
```

Prefer the object command form. The bot's string parser currently lowercases the whole prompt, including command arguments; that can corrupt case-sensitive component data or player names. Preserve the exact `/give` string in your evidence.

If this throws `Unsupported player command.`, record `BOT01: BLOCKED — bot command dispatch missing`. Do not claim `/give` rejected a valid command: it never reached `/give`.

If bot repairs are authorized, implement only the missing command dispatch using the existing **Game.handleCommand** route, preserving its permission checks. Do not implement `/give` independently inside the bot. Add tests for an allowed command, a refused command, unchanged inventory on refusal, and control release. If no bot-repair authorization exists, report the blocker and continue the separate dispatcher checks.

For independent diagnosis only, this directly invokes the game's normal chat-command handler without opening chat:

```js
game.handleCommand('/give @s minecraft:stone 1');
```

Label that result `GAME_DISPATCH`, not `BOT_API`. `handleCommand` can return `undefined` even on success; `runCommand` returning `true` means handled, not successful. Inspect state and error messages. Never silently substitute this route and claim the bot route passed.

## 6. Browser fixture and observation helper

Use a new headless Playwright browser context with the isolated server/config pattern in `playwright.survival.config.js`. Keep its port separate from the user's app at 3000. Start with `page.goto('/', {waitUntil:'domcontentloaded'})`, then:

```js
await page.waitForFunction(
  () => window.game?.playerBot && window.game?.inventory && window.game?.entities,
  null, { timeout: 60000 }
);
```

Inside `page.evaluate`, import `createSurvivalFixture` from `/e2e/fixtures/survivalFixture.js`. It creates the test world and exposes fixed-tick driving. Set cheats on for positive `/give` cases **after** fixture creation, because the Survival fixture starts with cheats off. Do not run `runBasicSurvival` merely to test `/give`.

For immediate command observations, pause normal animation in this disposable fixture using its lifecycle phase, execute one command, and snapshot before pickup ticks. The existing fixture already gates RAF while its driver owns simulation ticks. Do not put a production simulation into a loading phase or suppress genuine startup errors.

Copy this helper into the browser test body:

```js
const { createSurvivalFixture } = await import('/e2e/fixtures/survivalFixture.js');
const { BLOCKS, stackLimitFor } = await import('/src/blocks.js');
const game = window.game;
const fixture = createSurvivalFixture(game);
game.applyWorldSettings({ gameMode: 'survival', cheats: true });

function snapshot() {
  return {
    settings: structuredClone(game.settings),
    mode: game.player.gamemode,
    inventory: structuredClone({
      hotbar: game.inventory.hotbar, storage: game.inventory.storage,
      armor: game.inventory.armor, offhand: game.inventory.offhand,
      cursor: game.inventory.cursorItem,
      grid2: game.inventory.craft2x2, grid3: game.inventory.craft3x3
    }),
    drops: game.entities.droppedItems.map(d => ({
      id: d.itemType, isBlock: d.isBlock, count: d.count,
      position: d.group.position.toArray(), pickupDelay: d.pickupDelay,
      enchantments: d.enchantments, itemData: d.itemData
    })),
    botActive: game.playerBot.active,
    controls: structuredClone(game.player.botControls),
    terminalOpen: game.ui.isGeminiOpen()
  };
}

function quantity(state, id) {
  return [...state.inventory.hotbar, ...state.inventory.storage]
    .reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
}
function groundQuantity(state, id) {
  return state.drops.reduce((n, d) => n + (d.id === id ? d.count : 0), 0);
}

async function observe(command, route = 'BOT_API') {
  const before = snapshot(), messages = [];
  const original = game.ui.addChatMessage;
  let result = null, error = null;
  game.ui.addChatMessage = function(text, kind) {
    messages.push({text, kind}); // capture command evidence; no modal needed
  };
  try {
    if (route === 'BOT_API') {
      result = await game.playerBot.run({type:'command', command});
    } else if (route === 'GAME_DISPATCH') {
      result = game.handleCommand(command);
    } else throw new Error('Unknown test route');
  } catch (e) { error = e.message; }
  finally { game.ui.addChatMessage = original; }
  return {command, route, before, after:snapshot(), messages, result, error};
}

const row = await observe('/give @s minecraft:stone 65');
const delivered = quantity(row.after, BLOCKS.STONE) - quantity(row.before, BLOCKS.STONE);
const dropped = groundQuantity(row.after, BLOCKS.STONE) - groundQuantity(row.before, BLOCKS.STONE);
const stacks = [...row.after.inventory.hotbar, ...row.after.inventory.storage]
  .filter(s => s?.id === BLOCKS.STONE).map(s => s.count).sort((a,b)=>b-a);
const passed = !row.error && delivered === 65 && dropped === 0
  && JSON.stringify(stacks) === JSON.stringify([64,1]);
```

The example assumes an empty fixture. Never assert `[64,1]` against an inventory that already contains stone. Expected IDs are `BLOCKS.STONE`, `BLOCKS.OAK_PLANKS`, `'diamond_sword'`, and `'ender_pearl'` in the inspected registry. If storage representation changes, record the mapping and update observation normalization; do not use `resolveItem` itself as the only oracle for its own correctness.

Use a clean fixture per independent case, or explicitly clear inventory and dispose all previous dropped-item visuals/entities **in the disposable fixture**. Do not reset by `/clear` alone: it tests another command, can be refused with cheats off, and does not remove old ground drops. Do not create a fresh Chrome process for every case if a new context/page is sufficient.

## 7. Required case matrix

All positive cases start with empty inventory, no ground items, Survival, cheats on, unless setup says otherwise. For refusals, require an error and unchanged inventory, equipment, cursor, grids, and ground items. Each independent row gets its own baseline.

| ID | Command / setup | Expected result |
| --- | --- | --- |
| G01 | `/give @s minecraft:stone` | Exactly one stone; default count is one. |
| G02 | `/give @p minecraft:diamond_sword 1` | One sword, item form, no drops. |
| G03 | `/give @s minecraft:stone 65` | Inventory stacks 64 and 1; total 65. |
| G04 | `/give @s minecraft:ender_pearl 17` | Inventory stacks 16 and 1. |
| G04b | `/give @s minecraft:diamond_sword 2` | Two separate stacks of one. |
| G05 | Survival, cheats off; give one stone | Permission error; no mutation. |
| G06 | Creative, cheats off; give one stone | This game's policy currently allows it. Record as game-policy test, not vanilla op-level proof. |
| G07 | Counts `0`, `-1`, `1.5`, `64abc`, `many`, `2147483648` | Reject each independently; no mutation. |
| G07b | Counts `1e2`, `0x10`, `+1` | Check pinned Java integer syntax; do not assume `Number()` acceptance is vanilla acceptance. |
| G08 | `/give`, `/give @s`, `/give diamond_sword` | Usage/error; no mutation. |
| G09 | `/give @s minecraft:does_not_exist 1` | Unknown item; no mutation. |
| G09b | `/give @s other_namespace:stone 1` | Unknown resource location, not silently vanilla stone. |
| G10 | `/give @z minecraft:stone 1` | Invalid selector; no mutation. |
| G11 | All 36 slots full except stone stack 63; give stone 10 | Inventory delta 1; dropped delta 9; total delta **10**. |
| G12 | All 36 slots full of dirt; give stone 10 | Inventory delta 0; ground delta 10. |
| G12b | Same full inventory; give pearls 17 | Ground stacks 16 and 1; total 17. |
| G12c | Same full inventory; give swords 2 | Two ground stacks of one. |
| G13 | `/give @s minecraft:stone 1 extra` | Trailing token rejected; no mutation. |
| G14 | `/give @a minecraft:stone 1` | Vanilla single-player: local player gets one. Current project refusal is a parity gap. |
| G14b | `/give @r minecraft:stone 1` | Same one-player outcome; compare supported selector rules separately. |
| G15 | `/give NobodyHere minecraft:stone 1` | No matching player; no mutation. Any-name-to-self behavior is a gap. |
| G16 | Give 101 diamond swords | For a version with 100-stack limit: refuse; no mutation. Small enough to probe safely. |
| G17 | Component-bearing item from a verified version-specific wiki example | Verify metadata, not just base item; current unsupported refusal is `GAP`. |
| G18 | Creative full inventory, modest request | Verify actual delivery and version-specific overflow behavior. A success line without conserved items is a failure. |

Keep Bedrock's optional data/components arguments in a separate suite if requested. Do not treat extra Java tokens as Bedrock compatibility.

## 8. Full-inventory setup and conservation assertion

Setup writes are permitted only to prepare the disposable fixture. After this setup, only the command under test may add the requested stone.

```js
game.inventory.clearAll();
game.inventory.hotbar = Array.from({length:9}, () =>
  ({id:BLOCKS.DIRT, isBlock:true, count:64}));
game.inventory.storage = Array.from({length:27}, () =>
  ({id:BLOCKS.DIRT, isBlock:true, count:64}));
game.inventory.hotbar[0] = {id:BLOCKS.STONE, isBlock:true, count:63};

const row = await observe('/give @s minecraft:stone 10');
const gained = quantity(row.after, BLOCKS.STONE) - quantity(row.before, BLOCKS.STONE);
const onGround = groundQuantity(row.after, BLOCKS.STONE) - groundQuantity(row.before, BLOCKS.STONE);
if (gained !== 1 || onGround !== 9 || gained + onGround !== 10) {
  throw new Error(`G11: inventory +${gained}, ground +${onGround}; expected +1/+9`);
}
```

Record drop counts **before** pickup; automatic pickup otherwise changes the location of the items. For every successful bounded request, assert:

```text
inventory increase + ground-item increase = requested count
```

Also assert stack-size limits, correct item/block IDs, unchanged unrelated items, and bounded completion. Do not infer that items exist from `Gave ...` or from the bot's `ok` field.

Then test pickup separately: free an appropriate slot, advance `fixture.step(1/30)` for at most 90 ticks, and verify that inventory increases while ground count decreases by the same amount. The fixture's player starts near the command's drops. If needed, use `fixture.run({type:'goto',position:[x,y,z]})` to approach them through normal controls; do not grant items via `addItem` or teleport as the tested action.

Parser-only tests may inspect `parseGive` for `2147483647` and `2147483648`, but **never execute a billion-item `/give`**. The current implementation can generate an enormous number of ground-item requests. Use bounded execution cases, such as the 101-sword case, to assess the semantic cap.

## 9. Report and failure handling

Use these classifications:

- `PASS`: expected state and required evidence match.
- `FAIL`: supported behavior loses/duplicates items, ignores invalid syntax, or otherwise violates the pinned contract.
- `GAP`: deliberately unsupported vanilla feature, with clear rejection; not full parity.
- `BLOCKED`: bot dispatch, browser startup, fixture readiness, dependency, or permissions prevent the intended test route.
- `SPEC_UNVERIFIED`: no verified edition/version reference for that assertion.

On a failure: record the exact command, settings, before/after inventory and drops, messages, route, exception, and reproduction steps. Repeat once in a clean fixture. Do not retry the same mutating command repeatedly in a contaminated world. Keep expected failures in a results table; do not stop the whole matrix at the first failure.

Do not use `runScenario()` for the entire negative-case matrix: it stops on the first failed command. Its `report` is not a log of every command; store your own rows. Once routing is working, `runScenario()` is useful for a small positive sequence, with assertions that inspect actual inventory.

Save:

```text
docs/artifacts/give-command-results.json  # complete machine-readable rows
docs/give-command-test-report.md         # concise findings and reproductions
```

Example finding:

```text
ID: G11
Route: GAME_DISPATCH (BOT_API separately blocked)
Setup: Survival, cheats=true; 36 occupied slots; stone=63 in one slot
Command: /give @s minecraft:stone 10
Expected: inventory +1, ground +9, total +10
Observed: inventory +1, requested ground +10, total +11
Layer: production dispatcher + real Inventory; drop-hook observation
Impact: one duplicated stone per reproduction
Status: FAIL; actual browser dropped-entity check still required
```

The final report must say which layer was tested. A pure parser test, a production dispatcher test with recorded drop requests, and a real headless browser bot test are different evidence. List what was not run.

## 10. Copy this task prompt to the agent

> Test the browser game's `/give` command using `docs/give-command-agent-guide.md`. First read sections 1–3, run `node scripts/probe-give-command.mjs --write`, and inspect the JSON statuses. Use Java plain-item semantics; record the version/reference and treat version-specific behavior as unverified when necessary. Perform BOT01 first through `window.game.playerBot.run({type:'command',command:'...'})`. If bot dispatch is broken, report it separately and test the game's normal dispatcher without pretending the bot succeeded. Make only bot-routing repairs already authorized by the user; preserve the existing command permission gates. Do not modify `/give` or unrelated gameplay unless asked to fix them. Run the required case matrix against real inventory and, for browser cases, real dropped entities in a disposable headless fixture. Use bounded counts, reset each case, preserve other agents' changes, and never test against a user save. Verify item conservation, stack sizes, exact item identity, errors, permission behavior, and controls released. Do not trust success strings or synthetic inventory stubs. Repeat each unexpected result once in a clean fixture. Save detailed JSON and a short Markdown report with PASS/FAIL/GAP/BLOCKED/SPEC_UNVERIFIED, exact reproductions, sources, validation commands, and coverage limitations. Continue independent cases after failures; do not silently weaken assertions or substitute test routes.
