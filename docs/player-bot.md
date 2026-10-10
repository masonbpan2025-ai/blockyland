# Player bot

Open the Agent Terminal (C, in worlds where the terminal is enabled) and enter:

- `mine some iron ore` — finds and mines up to three nearby iron/deepslate iron ores.
- `mine 8 coal ore` — mines a requested number, from 1 to 64.
- `go to 10 64 10` — walks to nearby world coordinates.
- `follow cow` — follows the closest living cow until stopped.
- `attack zombie` — approaches and attacks through the normal player attack handler.
- `look at pig`, `jump`, or `equip stone pickaxe`.
- `test movement` — walks two blocks and returns, checking that movement happened.
- `test mining iron ore` — mines one ore and checks that drops enter inventory in survival.
- `stop bot` — cancels immediately. The **Stop bot** button works during a running task.
- `bot status` — reports the current task and its last result.

These commands work without an API key. With an API key, the planner can also
translate other phrasing into validated `player_control` plans. Existing building
and world commands retain their previous execution paths.

The bot controls the actual player, not a separate entity. It uses the game's
physics, raycasting, mining duration, harvest tool checks, durability, item drops,
pickup and combat. Survival needs a suitable tool already in the inventory; the
bot can move it from storage to the hotbar. It never grants items or teleports.
Creative breaks blocks using creative rules and does not yield survival loot.
The bot temporarily uses first-person perspective and releases synthetic input
on success, failure, cancellation or death. Human keyboard input remains blocked
while the terminal is open.

Navigation reuses the MIT-licensed A* and binary heap from
[PrismarineJS/mineflayer-pathfinder](https://github.com/PrismarineJS/mineflayer-pathfinder).
The browser adaptations and license are in `src/vendor/mineflayer-pathfinder`.
Mineflayer itself requires a Minecraft protocol server; this local game supplies
its own movement and world adapter to the reusable pathfinding code instead.

Current bounds: ore search within 24 blocks, walking paths within 32 horizontal
and 24 vertical blocks, one-block steps, no swimming or parkour, and a three-minute
task timeout. Mining may dig a safe access tunnel with the existing tool. It avoids
unbreakable blocks and fluids. If the destination is unreachable or the tool
breaks, it stops and reports the reason. Following also ends at the timeout.
Crafting, arbitrary item interactions and long-distance exploration are not yet
implemented.

## Functional testing

`npm run test:bot` runs controller tests using the real Player physics and
PrismarineJS pathfinder. `npm run test:agent` includes these tests along with the
existing terminal regressions. `npm run test:bot:browser` runs Chrome against a
private arena in the actual game, through terminal dispatch, raycasting, mining,
durability and entity pickup. The browser test does not load or alter saved worlds.

For custom functional tests, use `window.game.playerBot.runScenario` in a running
world. Scenario assertions are JavaScript supplied by test code, never model
output:

```js
const bot = window.game.playerBot;
const before = bot.itemCount('raw_iron');
const report = await bot.runScenario({
  commands: ['equip stone pickaxe', 'mine 1 iron ore'],
  assertions: [
    { name: 'iron collected', check: () => bot.itemCount('raw_iron') > before },
    { name: 'controls released', check: game => game.player.botControls === null }
  ]
});
console.log(report);
```

Keep the game simulation running while awaiting a scenario. `snapshot()` exposes
task state and `report` keeps the last 50 built-in test results. Test commands
actually play in the current world, so mining tests consume resources and tools.
