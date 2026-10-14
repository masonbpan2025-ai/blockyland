import {ENGINE_API_VERSION,MOD_PROTOCOL_VERSION} from '../mods/compatibility.js';
import {BUILTIN_MODS} from '../mods/catalog.generated.js';
export class ModClientSession {
  constructor(modId, options, onFrame, onError=console.error) {
    this.modId=modId;this.options=options;this.onFrame=onFrame;this.onError=onError;this.sequence=0;this.slot=0;this.pending=new Map();this.requestId=0;
    this.worker=new Worker(new URL('./mod.worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      if(data.type==='frame'){this.tick=data.frame.tick;this.onFrame(data.frame);}
      if(data.type==='error')this.onError(data.message);
      if(data.type==='saved'){const pending=this.pending.get(data.requestId);if(pending){clearTimeout(pending.timer);pending.resolve(data.saved);this.pending.delete(data.requestId);}}
    };
    this.worker.onerror=error=>this.onError(error.message);
    this.worker.postMessage({type:'start',modId,options,saved:options.saved});
  }
  input(intent, slot=this.slot) {
    const data={type:'intent',slot,sequence:++this.sequence,intent};
    if(this.socket&&!this.joined)return;
    if(this.socket?.readyState===1)this.socket.send(JSON.stringify(data));else this.worker?.postMessage(data);
  }
  release(slot=this.slot){if(this.socket?.readyState===1)this.socket.send(JSON.stringify({type:'release'}));else this.worker?.postMessage({type:'release',slot});}
  save() {
    if(this.socket)return Promise.reject(new Error('Online worlds are saved by their authority'));
    if(!this.worker)return Promise.reject(new Error('Reconnect to the online room to resume this run'));
    const requestId=++this.requestId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('The authority did not finish saving'));},10000);this.pending.set(requestId,{resolve,reject,timer});this.worker.postMessage({type:'save',requestId});});
  }
  restore(saved) {
    if(this.socket)throw new Error('Online saves belong to the server');
    this.sequence=0;this.worker.postMessage({type:'start',modId:this.modId,options:this.options,saved});
  }
  connect(room=null) {
    if(this.socket)return Promise.reject(new Error('Already connected to an online room'));
    return new Promise((resolve,reject)=>{
      const url=new URL('/ws/mod-games',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';
      const socket=new WebSocket(url);this.socket=socket;
      socket.onopen=()=>socket.send(JSON.stringify({type:room?'join':'host',room,modId:this.modId,options:{seed:this.options.seed,coop:true,difficulty:this.options.difficulty},protocol:MOD_PROTOCOL_VERSION}));
      socket.onmessage=({data})=>{const packet=JSON.parse(data);
        if(packet.type==='joined'){const expected=BUILTIN_MODS.find(m=>m.id===this.modId)?.manifest.version;
          if(packet.protocol!==MOD_PROTOCOL_VERSION||packet.apiVersion!==ENGINE_API_VERSION||packet.packages?.[0]?.id!==this.modId||packet.packages[0].version!==expected){socket.onclose=null;socket.close();this.socket=null;reject(new Error('Room requires a compatible game package and engine'));return;}
          this.joined=true;this.worker?.terminate();this.worker=null;this.slot=packet.slot;this.room=packet.room;resolve(packet);}
        if(packet.type==='frame'){this.tick=packet.frame.tick;this.onFrame(packet.frame);}
        if(packet.type==='error'){reject(new Error(packet.message));this.onError(packet.message);if(!this.joined){socket.onclose=null;socket.close();this.socket=null;}}
      };
      socket.onerror=()=>reject(new Error('Unable to reach the mod game server'));
      socket.onclose=()=>{const wasJoined=this.joined;this.socket=null;this.joined=false;if(!wasJoined)reject(new Error('Connection closed before joining'));this.onError('Online game disconnected; reconnect to the room to continue.');};
    });
  }
  dispose(){this.worker?.terminate();if(this.socket){this.socket.onclose=null;this.socket.close();}for(const pending of this.pending.values()){clearTimeout(pending.timer);pending.reject(new Error('Game session closed'));}this.pending.clear();}
}
