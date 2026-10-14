import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import {createModGameServer} from '../server/modGames.js';

async function start(saveDirectory){
  const service=createModGameServer({saveDirectory}),server=http.createServer();
  server.on('upgrade',(req,socket,head)=>service.handleUpgrade(req,socket,head));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {service,url:`ws://127.0.0.1:${server.address().port}/ws/mod-games`,async close(){service.close();await new Promise(resolve=>server.close(resolve));}};
}
async function client(url,packet){
  const ws=new WebSocket(url),messages=[];ws.on('message',bytes=>messages.push(JSON.parse(bytes.toString())));
  await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.send(JSON.stringify(packet));
  const wait=async type=>{const deadline=Date.now()+10000;while(Date.now()<deadline){const found=messages.find(m=>m.type===type);if(found)return found;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error(`No ${type} packet`);};
  return {ws,messages,wait};
}

test('Online authority binds slots, supports late joins, isolates worlds and restores disk saves',async t=>{
  const folder=mkdtempSync(path.join(tmpdir(),'rescue-authority-'));let host;
  t.after(async()=>{if(host)await host.close();assert.equal(path.dirname(path.resolve(folder)),path.resolve(tmpdir()));assert.match(path.basename(folder),/^rescue-authority-/);rmSync(folder,{recursive:true,force:true});});
  host=await start(folder);
  const a=await client(host.url,{type:'host',modId:'rescue_adventure',protocol:1,options:{seed:7}}),joined=await a.wait('joined');
  assert.equal(joined.slot,0);assert.equal(joined.packages[0].id,'rescue_adventure');assert.match(joined.packages[0].hash,/^[a-f0-9]{64}$/);
  await a.wait('frame');
  let sequence=0;for(const id of ['go','story-next','story-next','story-next','story-next'])a.ws.send(JSON.stringify({type:'intent',sequence:++sequence,intent:{type:'button',id}}));
  const b=await client(host.url,{type:'join',room:joined.room,protocol:1});assert.equal((await b.wait('joined')).slot,1);
  const frame=(await b.wait('frame')).frame;assert.equal(frame.reset,true);assert.equal(frame.state.phase,'play');assert.equal(frame.state.players.length,2);assert.ok(frame.terrain.length>10000);
  const room=host.service.rooms.get(joined.room),heroes=room.session.game.inspect().players,initialX=heroes.map(p=>p.x);
  b.ws.send(JSON.stringify({type:'intent',slot:0,sequence:1,intent:{type:'key',code:'KeyD',down:true}}));
  b.ws.send(JSON.stringify({type:'intent',slot:0,sequence:2,intent:{type:'button',id:'restart'}}));
  b.ws.send(JSON.stringify({type:'intent',slot:0,sequence:3,intent:{type:'key',code:'ArrowRight',down:true}}));
  await new Promise(resolve=>setTimeout(resolve,250));
  assert.equal(heroes[0].x,initialX[0],'Spoofed slot cannot move the host');assert.ok(heroes[1].x>initialX[1],'Guest moves its assigned hero');assert.equal(room.session.game.snapshot().phase,'play');
  b.ws.send(JSON.stringify({type:'release'}));
  const c=await client(host.url,{type:'host',modId:'rescue_adventure',protocol:1,options:{seed:2026}});const other=await c.wait('joined');assert.notEqual(other.room,joined.room);assert.equal(host.service.rooms.get(other.room).session.game.snapshot().phase,'mode');
  const incompatible=await client(host.url,{type:'join',room:joined.room,protocol:2});assert.match((await incompatible.wait('error')).message,/protocol/);const closed=new Promise(resolve=>incompatible.ws.once('close',resolve));incompatible.ws.send('x'.repeat(5000));assert.equal(await closed,1009,'Oversized packets close the offender without crashing the host');
  a.ws.send(JSON.stringify({type:'save'}));await new Promise(resolve=>setTimeout(resolve,100));assert.ok(existsSync(path.join(folder,`${joined.room}.json`)));
  await host.close();host=null;
  host=await start(folder);
  const reopened=await client(host.url,{type:'join',room:joined.room,protocol:1});await reopened.wait('joined');const restored=(await reopened.wait('frame')).frame;
  assert.equal(restored.state.phase,'play');assert.equal(restored.state.seed,7);assert.ok(restored.state.players[1].x>initialX[1]);
});
