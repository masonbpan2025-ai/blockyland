import base from '../../vite.config.js';
// Skip the full game's dependency scan for focused mod browser checks.
export default {...base,cacheDir:'node_modules/.vite-voxel-dash',optimizeDeps:{noDiscovery:true,include:['three']},server:{host:'127.0.0.1',port:3109,strictPort:true,hmr:false}};
