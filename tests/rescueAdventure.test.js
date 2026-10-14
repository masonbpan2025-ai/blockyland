import test from 'node:test';
import assert from 'node:assert/strict';
import {createRescueGame} from '../src/mods/rescue-adventure/server/game.js';
import {ModSession} from '../src/engine/modSession.js';
import {resolvePackages,satisfiesVersion} from '../src/mods/compatibility.js';
import {createUiState} from '../src/engine/presentationGraph.js';
import {readFileSync} from 'node:fs';
import {ModLoader} from '../src/mods/loader.js';

function begin(game){game.input(0,{type:'button',id:'go'});for(let i=0;i<4;i++)game.input(0,{type:'button',id:'story-next'});assert.equal(game.snapshot().phase,'play');}

for(const coop of [false,true])for(const seed of [1,7,2026,981274,4294967295])test(`Rescue ${coop?'co-op':'solo'} seed ${seed}: routes, guardians and rescue`,()=>{
  const game=createRescueGame({coop,seed,difficulty:'easy'});begin(game);
  let state=game.inspect();assert.equal(state.players.length,coop?2:1);assert.equal(state.bosses.length,5);
  const hero=state.players[0],before=hero.x;
  game.input(0,{type:'key',code:'KeyD',down:true});game.update(.04);game.release(0);assert.ok(hero.x>before);
  if(coop){const second=state.players[1],x=second.x;game.input(1,{type:'key',code:'ArrowRight',down:true});game.update(.04);game.release(1);assert.ok(second.x>x);}
  for(const mob of state.mobs)if(!mob.boss)mob.dead=true;
  for(let i=0;i<4;i++){
    hero.x=state.pointWorld(0).x;hero.z=state.pointWorld(0).z;state.buildFlow();
    assert.ok(state.map.every((tile,k)=>tile.b<=i||state.flow[k]<0),'Cannot skip a locked bridge');
    const gate=state.gates[i];assert.equal(state.passable(gate.x,gate.z,.9,.34),false);
    const probe={x:gate.x-4,z:gate.z,r:.34};state.move(probe,8,0);assert.ok(probe.x<gate.x-2,'Swept collision blocks a full-speed dodge');
    state.hurt(state.bosses[i],99999);assert.equal(gate.open,true);state.move(probe,8,0);assert.ok(probe.x>gate.x+2);
  }
  hero.hp=60;state.gainXP(10000);assert.equal(hero.hp,60,'Levels do not heal');
  const food=state.dropFood(hero.x,hero.z,0);state.eatFood(food,hero);assert.equal(hero.hp,80);assert.equal(state.eatFood(food,hero),false);
  const chest=state.treasures[0];state.openChest(chest);const rewards=game.snapshot().gems;state.openChest(chest);assert.equal(game.snapshot().gems,rewards);
  hero.x=state.cage.x;hero.z=state.cage.z+3;hero.face=Math.PI;hero.attackCd=0;state.melee(hero);assert.equal(state.cage.hp,90);
  state.hurt(state.bosses[4],99999);assert.equal(state.cage.unlocked,true);
  for(let i=0;i<30&&!state.cage.broken;i++){hero.attackCd=0;state.melee(hero);}
  assert.equal(game.snapshot().phase,'rescue');for(let i=0;i<90;i++)game.update(.1);assert.equal(game.snapshot().phase,'win');
});

test('World factories isolate state; inputs reject unsupported actions and foreign slots',()=>{
  const a=createRescueGame({seed:7}),b=createRescueGame({seed:7});begin(a);
  assert.equal(b.snapshot().phase,'mode');
  assert.equal(a.input(1,{type:'button',id:'restart'}),false);
  assert.equal(a.input(0,{type:'key',code:'KeyD',down:'yes'}),false);
  assert.equal(a.input(0,{type:'teleport',x:100}),false);
  assert.equal(a.input(0,{type:'key',code:'Digit2',down:true}),false);
});
test('Fixed-tick journals reproduce the same campaign, held inputs and UI',()=>{
  const a=new ModSession(createRescueGame,{seed:7,coop:true});let seq=0;
  for(const id of ['go','story-next','story-next','story-next','story-next'])assert.ok(a.command(0,++seq,{type:'button',id}));
  a.command(0,++seq,{type:'key',code:'KeyD',down:true});
  for(let i=0;i<120;i++){a.step();a.frame();}a.release(0);
  const restored=ModSession.restore(createRescueGame,a.save());
  const first=a.frame(true),second=restored.frame(true);first.state.events=[];second.state.events=[];
  assert.deepEqual(second,first);assert.equal(a.command(0,seq,{type:'button',id:'restart'}),false);
  assert.throws(()=>ModSession.restore(createRescueGame,{schemaVersion:99}),/save/);
});
test('Package compatibility rejects cycles, missing dependencies, API/protocol and capabilities before execution',()=>{
  const a={id:'a',version:'1.0.0',engineApi:'^1.0.0',dependencies:{b:'^1.0.0'}},b={id:'b',version:'1.2.0'};
  assert.deepEqual(resolvePackages('a',[a,b]).map(m=>m.id),['b','a']);
  assert.throws(()=>resolvePackages('a',[a]),/dependency/);
  assert.throws(()=>resolvePackages('a',[a,{...b,dependencies:{a:'*'}}]),/cycle/);
  assert.throws(()=>resolvePackages('a',[{...a,engineApi:'^2.0.0'},b]),/engine API/);
  assert.throws(()=>resolvePackages('a',[{...a,protocolVersion:2},b]),/protocol/);
  assert.throws(()=>resolvePackages('a',[{...a,requires:['unknown']},b]),/capability/);
  assert.equal(satisfiesVersion('0.0.2','^0.0.1'),false);
});

test('UI state preserves template text/visibility until the authority explicitly changes them',()=>{
  const ui=createUiState();ui.get('solo-mode').setAttribute('aria-pressed','true');ui.get('cancel').onclick=()=>{};
  assert.equal(ui.snapshot()['solo-mode'].text,null);assert.equal(ui.snapshot().cancel.hidden,null);
  ui.get('title').textContent='RESCUE SUKI';ui.get('cancel').hidden=true;
  assert.equal(ui.snapshot().title.text,'RESCUE SUKI');assert.equal(ui.snapshot().cancel.hidden,true);
  const source=readFileSync(new URL('../src/mods/rescue-adventure/server/game.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\b(setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random)\s*\(/,'Authority timing/randomness must be deterministic');
});

test('Rescue preserves restricted ammo, Kamehameha vulnerability and boss armor',()=>{
  const game=createRescueGame({seed:2026,coop:true,difficulty:'easy'});begin(game);
  const state=game.inspect(),hero=state.players[0],jayden=state.players[1];
  for(const mob of state.mobs)mob.dead=true;
  for(const tile of state.map)if(Math.hypot(tile.x*2+1-hero.x,tile.z*2+1-hero.z)<14){tile.block=false;tile.wet=false;tile.h=.9;}
  state.hurt(state.spawn('skeleton',hero.x+4,hero.z),9999);
  state.hurt(state.spawn('creeper',hero.x+4,hero.z),9999);
  const arrows=state.loot.find(l=>l.type==='arrow'),fireballs=state.loot.find(l=>l.type==='fireball');
  assert.equal(state.collectAmmo(arrows,jayden),false);assert.equal(state.collectAmmo(fireballs,hero),false);
  assert.equal(state.collectAmmo(arrows,hero),true);assert.equal(hero.ammo,3);
  const guardian=state.bosses[0];guardian.dead=false;guardian.hp=guardian.max;guardian.x=hero.x+5;guardian.z=hero.z;
  game.input(0,{type:'key',code:'KeyL',down:true});state.updateQi(4.99);assert.equal(state.qi.phase,'charging');
  const expected=state.qiDamage();state.updateQi(.011);assert.equal(state.qi.phase,'firing');
  assert.equal(guardian.hp,guardian.max-expected*(1-state.rules().resistance));
  state.updateQi(1);game.release(0);
  game.input(0,{type:'key',code:'KeyL',down:true});hero.inv=0;hero.roll=0;hero.hp=180;state.takeDamage(20);
  assert.equal(hero.hp,150);assert.equal(state.qi.phase,'idle');game.release(0);
  state.hurt(guardian,99999);assert.equal(hero.hp,150);assert.equal(hero.armor.max,120);assert.equal(jayden.armor.max,120);
  hero.inv=0;state.takeDamage(20);assert.equal(hero.hp,134);assert.ok(hero.armor.durability<hero.armor.max);
});

test('A failed game package rolls back dependencies loaded for that attempt',async()=>{
  const loader=new ModLoader({mods:[{id:'shared',name:'Shared',version:'1.0.0',entrypoint:'index.js'},
    {id:'broken',name:'Broken',version:'1.0.0',entrypoint:'index.js',dependencies:{shared:'^1.0.0'}}],
    importModule:async(path,manifest)=>({register(api){api.registerItem('owned',{name:'Owned'});if(manifest.id==='broken')throw new Error('Broken entrypoint');}})});
  const result=await loader.load('broken');assert.equal(result.ok,false);
  assert.equal(loader.isLoaded('shared'),false);assert.equal(loader.registry.entries('item',{scope:'all'}).length,0);
});

test('Inspector models do not start a campaign or allocate its terrain',()=>{
  const preview=createRescueGame({previewOnly:true});assert.equal(preview.update,undefined);assert.equal(preview.snapshot,undefined);
  for(const type of ['zombie','royal_guard','ancient','king']){
    const definition=preview.modelDefinition(type);assert.ok(definition.some(n=>n.geometry));assert.ok(definition.length<100);
  }
});
