// Go through Vite's normal bare-import resolution, exactly as the game does.
// Importing three.module.js directly alongside optimized `three` creates two
// independent Object3D id counters and corrupts the renderer's light cache.
export * as THREE from 'three';
