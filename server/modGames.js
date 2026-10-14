import { WebSocketServer } from 'ws';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ModSession } from '../src/engine/modSession.js';
import { GAME_FACTORIES, GAME_MANIFESTS } from '../src/engine/gameFactories.js';
import { ENGINE_API_VERSION, MOD_PROTOCOL_VERSION } from '../src/mods/compatibility.js';

export function createModGameServer({ saveDirectory=path.resolve('saves/mod-games') }={}) {
  const wss=new WebSocketServer({noServer:true,maxPayload:4096}),rooms=new Map();
  const packages=new Map(GAME_MANIFESTS.map(manifest=>{
    // Package content plus the engine authority contract identify compatible saves.
    const hasher=createHash('sha256').update(JSON.stringify(manifest)).update(ENGINE_API_VERSION);
    const source=new URL('../src/mods/'+manifest.packageDirectory+'/',import.meta.url);
    function hashFiles(folder){for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=new URL(entry.name+(entry.isDirectory()?'/':''),folder);if(entry.isDirectory())hashFiles(file);else hasher.update(entry.name).update(readFileSync(file));}}
    hashFiles(source);
    for(const file of ['modSession.js','gridCollision.js','presentationGraph.js'])hasher.update(readFileSync(new URL('../src/engine/'+file,import.meta.url)));
    return [manifest.id,{manifest,hash:hasher.digest('hex')}];
  }));
  const send=(ws,data)=>{if(ws.readyState!==1)return;if(ws.bufferedAmount>=8_000_000){ws.close(1013,'Client is too slow; rejoin for a full snapshot');return;}ws.send(JSON.stringify(data));};
  function save(room){
    if(!saveDirectory)return;
    mkdirSync(saveDirectory,{recursive:true});const file=path.join(saveDirectory,`${room.id}.json`);
    const {manifest,hash}=room.package;
    const data={worldId:room.id,game:manifest.id,packages:[{id:manifest.id,version:manifest.version,hash}],state:room.session.save()};
    writeFileSync(file+'.tmp',JSON.stringify(data));renameSync(file+'.tmp',file);
  }
  function closeRoom(room){clearInterval(room.timer);save(room);rooms.delete(room.id);}
  function tickRoom(room){
    try {
      if(!room.clients.size){if(Date.now()-room.emptyAt>60000)closeRoom(room);return;}
      room.session.step();const frame=room.session.frame();for(const client of room.clients.values())send(client,{type:'frame',frame});
      if(++room.ticksSinceSave>=900){save(room);room.ticksSinceSave=0;}
    }catch(error){for(const client of room.clients.values())send(client,{type:'error',message:error.message});clearInterval(room.timer);}
  }
  wss.on('connection',ws=>{
    ws.on('error',()=>ws.close()); // Malformed/oversized packets close only this connection.
    let room,slot,windowStart=Date.now(),count=0;
    ws.on('message',bytes=>{try{
      if(Date.now()-windowStart>1000){windowStart=Date.now();count=0;}if(++count>120){ws.close(1008,'Too many messages');return;}
      const packet=JSON.parse(bytes.toString());
      if(!room){
        if(packet.protocol!==MOD_PROTOCOL_VERSION)throw new Error('Incompatible mod protocol');
        if(packet.type==='host'){
          const packageInfo=packages.get(packet.modId);
          if(!packageInfo)throw new Error('Game is not server-authoritative yet');
          if(rooms.size>=8)throw new Error('Server world limit reached');
          const options={seed:Number.isSafeInteger(packet.options?.seed)?packet.options.seed:2026,coop:true,online:true,difficulty:packet.options?.difficulty??'normal'};
          const id=randomUUID().slice(0,8);room={id,package:packageInfo,session:new ModSession(GAME_FACTORIES[packet.modId],options),clients:new Map(),emptyAt:0,ticksSinceSave:0};rooms.set(id,room);
          room.timer=setInterval(()=>tickRoom(room),1000/30);
        }else if(packet.type==='join'){
          const id=String(packet.room);if(!/^[a-f0-9]{8}$/.test(id))throw new Error('Invalid room code');room=rooms.get(id);
          if(!room&&saveDirectory&&existsSync(path.join(saveDirectory,`${id}.json`))) {
            const saved=JSON.parse(readFileSync(path.join(saveDirectory,`${id}.json`),'utf8'));const packageInfo=packages.get(saved.game);
            if(!packageInfo||saved.packages?.[0]?.hash!==packageInfo.hash)throw new Error('Saved room requires its original compatible package');
            if(rooms.size>=8)throw new Error('Server world limit reached');
            room={id,package:packageInfo,session:ModSession.restore(GAME_FACTORIES[saved.game],saved.state),clients:new Map(),emptyAt:0,ticksSinceSave:0};rooms.set(id,room);
            room.timer=setInterval(()=>tickRoom(room),1000/30);
          }
        }
        if(!room)throw new Error('Room not found');
        slot=[0,1].find(candidate=>!room.clients.has(candidate));if(slot===undefined){room=undefined;throw new Error('This adventure has two player slots');}
        room.clients.set(slot,ws);room.emptyAt=0;room.session.lastSequence.delete(slot);
        const {manifest,hash}=room.package;
        send(ws,{type:'joined',room:room.id,slot,protocol:MOD_PROTOCOL_VERSION,apiVersion:ENGINE_API_VERSION,
          packages:[{id:manifest.id,version:manifest.version,hash}],definitions:manifest.provides});
        send(ws,{type:'frame',frame:room.session.frame(true)});return;
      }
      if(packet.type==='intent')room.session.command(slot,packet.sequence,packet.intent);
      else if(packet.type==='release')room.session.release(slot);
      else if(packet.type==='save'&&slot===0)save(room);
    }catch(error){send(ws,{type:'error',message:error.message});}});
    ws.on('close',()=>{if(room?.clients.get(slot)===ws){room.session.release(slot);room.clients.delete(slot);if(!room.clients.size)room.emptyAt=Date.now();save(room);}});
  });
  return {rooms,wss,handleUpgrade(req,socket,head){if(new URL(req.url,'http://localhost').pathname!=='/ws/mod-games')return false;
    const origin=req.headers.origin;try{if(origin&&new URL(origin).host!==req.headers.host){socket.destroy();return true;}}catch{socket.destroy();return true;}
    wss.handleUpgrade(req,socket,head,client=>wss.emit('connection',client,req));return true;},
    close(){for(const room of rooms.values())closeRoom(room);for(const client of wss.clients)client.terminate();wss.close();}};
}

export function modGamesPlugin(){
  const attach=server=>{const service=createModGameServer();server.httpServer?.on('upgrade',(req,socket,head)=>service.handleUpgrade(req,socket,head));server.httpServer?.once('close',()=>service.close());};
  return {name:'authoritative-mod-games',configureServer:attach,configurePreviewServer:attach};
}
