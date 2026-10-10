These files are vendored from PrismarineJS/mineflayer-pathfinder:
https://github.com/PrismarineJS/mineflayer-pathfinder/tree/master/lib

Retrieved October 10, 2026. `astar.js` and `heap.js` retain the upstream
algorithm. The adaptations replace CommonJS exports/imports with ESM and use
the browser's global `performance` instead of Node's `perf_hooks`.
The upstream MIT license is included in LICENSE.

`src/playerBot.js` supplies movement neighbors and goals for this game's local
voxel world. No Minecraft protocol connection or Microsoft login is required.
