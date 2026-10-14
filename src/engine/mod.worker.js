import { ModSession } from './modSession.js';
import { GAME_FACTORIES, GAME_MANIFESTS } from './gameFactories.js';
let session,timer,manifest;
self.onmessage=({data})=>{
  try {
    if(data.type==='start'){
      const factory=GAME_FACTORIES[data.modId];if(!factory)throw new Error('Unknown authoritative game');
      const nextManifest=GAME_MANIFESTS.find(m=>m.id===data.modId);
      if(data.saved&&(data.saved.packageId!==data.modId||data.saved.packageVersion!==nextManifest.version))throw new Error('Saved run requires a compatible package version');
      const next=data.saved?ModSession.restore(factory,data.saved):new ModSession(factory,data.options);
      clearInterval(timer);session=next;manifest=nextManifest;
      self.postMessage({type:'frame',frame:session.frame(true)});
      timer=setInterval(()=>{try{session.step();self.postMessage({type:'frame',frame:session.frame()});}catch(error){clearInterval(timer);self.postMessage({type:'error',message:error.message});}},1000/30);
    }
    if(data.type==='intent')session?.command(data.slot,data.sequence,data.intent);
    if(data.type==='release')session?.release(data.slot);
    if(data.type==='save')self.postMessage({type:'saved',requestId:data.requestId,saved:{...session.save(),packageId:manifest.id,packageVersion:manifest.version}});
  }catch(error){self.postMessage({type:'error',message:error.message});}
};
