import {defineConfig} from 'vite';
import {modGamesPlugin} from '../../server/modGames.js';
import {loadModTable} from '../../src/mods/manifestFile.js';
import {readFileSync} from 'node:fs';
import path from 'node:path';
// Isolate browser mod checks from the separately hosted native Minecraft relay.
export default defineConfig({
  optimizeDeps:{noDiscovery:true,include:['three']},
  plugins:[modGamesPlugin(),{name:'fixture-designed-maps',configureServer(vite){
    const files=new Map();for(const mod of loadModTable().mods)for(const name of mod.maps)files.set(name,path.resolve(mod.directory,'maps',name));
    vite.middlewares.use((req,res,next)=>{
      const filename=req.url?.split('?')[0].replace('/api/designed-worlds/','');
      if(!req.url?.startsWith('/api/designed-worlds/')||!files.has(filename))return next();
      res.setHeader('Content-Type','application/json');res.end(readFileSync(files.get(filename)));
    });
  }}],
  server:{host:'127.0.0.1',port:3105,strictPort:true,hmr:false},
});
