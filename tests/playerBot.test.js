import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Player } from '../src/player.js';
import { PlayerBot, parsePlayerCommand } from '../src/playerBot.js';
import { WorldAgent } from '../src/worldAgent.js';
import { BLOCKS, ITEMS } from '../src/blocks.js';
import { breakTimeSeconds } from '../src/miningRules.js';
import { validatePlan } from '../src/agentPlans.js';

function fixture({tool=true}={}) {
  const cells=new Map(), logs=[];
  const world={getVoxel(x,y,z){return cells.get(`${x},${y},${z}`) ?? (y<0?BLOCKS.STONE:BLOCKS.AIR);},setVoxel(x,y,z,id){cells.set(`${x},${y},${z}`,id);}};
  const camera=new THREE.PerspectiveCamera();
  const player=new Player(camera,{addEventListener(){},requestPointerLock(){}},world,{playStep(){},playJump(){}});
  player.position.set(.5,0,.5); player.onGround=true;player.gamemode='survival';
  const inv={hotbar:[tool?{id:'stone_pickaxe',count:1,isBlock:false}:null,...Array(8).fill(null)],storage:[],activeSlot:0,getActiveItem(){return this.hotbar[this.activeSlot];},getOffhandItem(){return null;},updateHotbar(){},updateUI(){}};
  const game={world,player,inventory:inv,worldReady:true,mobs:{mobs:[]},camera,ui:{isGeminiOpen:()=>true,isModalOpen:()=>false},miningTime:0};
  player.game=game;player.inventory=inv;
  const bot=new PlayerBot(game,{log:(...args)=>logs.push(args)});game.playerBot=bot;
  function step(dt=1/60) {
    bot.tick(dt);player.update(dt);
    // A raycast, rather than a privileged direct dig, supplies the mining target.
    game.targetBlock=null;const direction=camera.getWorldDirection(new THREE.Vector3());
    for(let d=0;d<5.2;d+=.05){const point=camera.position.clone().addScaledVector(direction,d);const x=Math.floor(point.x),y=Math.floor(point.y),z=Math.floor(point.z);const blockId=world.getVoxel(x,y,z);if(blockId!==BLOCKS.AIR){game.targetBlock={x,y,z,blockId};break;}}
    bot.afterRaycast();
    if(game.isMouseDown&&game.targetBlock){const b=game.targetBlock,held=inv.getActiveItem();game.miningTime+=dt;if(game.miningTime>=breakTimeSeconds(b.blockId,ITEMS[held?.id],held?.id)){world.setVoxel(b.x,b.y,b.z,BLOCKS.AIR);inv.storage.push({id:'raw_iron',count:1});game.miningTime=0;}}
  }
  async function drive(promise,max=12000){let done=false;promise.then(()=>done=true);for(let i=0;i<max&&!done;i++){if(bot.active)step();await Promise.resolve();}assert.equal(done,true,'task must terminate');return promise;}
  return {game,bot,cells,logs,step,drive};
}

test('player command parser distinguishes controls from building requests',()=>{
  assert.deepEqual(parsePlayerCommand('mine some iron ore'),{type:'mine',test:'mining',block:'iron ore',count:3});
  assert.deepEqual(parsePlayerCommand('go to -10, 64, 20'),{type:'goto',position:[-10,64,20]});
  assert.equal(parsePlayerCommand('build an iron tower'),null);
  assert.equal(parsePlayerCommand('stop bot').type,'stop');
});
test('PrismarineJS pathfinding drives real Player physics while terminal is open',async()=>{
  const f=fixture();const start=f.game.player.position.clone();
  const result=await f.drive(f.bot.run('go to 4 0 0'));
  assert.equal(result.ok,true,result.message);assert.ok(f.game.player.position.distanceTo(start)>3);
  assert.equal(f.game.player.areControlsDisabled(),true,'human input stays blocked by terminal');
  assert.equal(f.game.player.botControls,null);assert.equal(f.game.isMouseDown,false);
});
test('bot navigates around an obstacle instead of teleporting through it',async()=>{
  const f=fixture();f.game.world.setVoxel(1,0,0,BLOCKS.BEDROCK);f.game.world.setVoxel(1,1,0,BLOCKS.BEDROCK);
  const result=await f.drive(f.bot.run('go to 3 0 0'));
  assert.equal(result.ok,true,result.message);assert.equal(f.game.world.getVoxel(1,0,0),BLOCKS.BEDROCK);
});
test('bot searches, selects a tool, walks and raycasts before mining iron',async()=>{
  const f=fixture();f.game.world.setVoxel(4,0,0,BLOCKS.IRON_ORE);
  const result=await f.drive(f.bot.run('mine 1 iron ore'));
  assert.equal(result.ok,true,result.message);assert.equal(result.mined,1);
  assert.equal(f.game.world.getVoxel(4,0,0),BLOCKS.AIR);assert.ok(f.game.inventory.storage.length);
  assert.equal(f.game.player.botControls,null);
});
test('missing harvest tool fails without destroying the ore or giving items',async()=>{
  const f=fixture({tool:false});f.game.world.setVoxel(2,0,0,BLOCKS.IRON_ORE);
  const result=await f.drive(f.bot.run('mine 1 iron ore'));
  assert.equal(result.ok,false);assert.match(result.message,/tool/);
  assert.equal(f.game.world.getVoxel(2,0,0),BLOCKS.IRON_ORE);assert.deepEqual(f.game.inventory.storage,[]);
});

test('multi-block mining waits for fresh aim after walking into a cleared cell',async()=>{
  const f=fixture();f.game.world.setVoxel(2,0,0,BLOCKS.IRON_ORE);f.game.world.setVoxel(3,0,0,BLOCKS.IRON_ORE);
  const result=await f.drive(f.bot.run('mine 2 iron ore'));
  assert.equal(result.ok,true,result.message);assert.equal(result.mined,2);
});
test('incremental ore scanning reaches targets beyond the first scan slice',async()=>{
  const f=fixture();f.game.world.setVoxel(12,0,0,BLOCKS.IRON_ORE);
  const result=await f.drive(f.bot.run('mine 1 iron ore'));
  assert.equal(result.ok,true,result.message);assert.equal(result.mined,1);
});
test('stop releases controls and resolves the waiting command',async()=>{
  const f=fixture();const pending=f.bot.run('go to 20 0 0');f.step();f.bot.stop();
  assert.equal((await pending).ok,false);assert.equal(f.bot.active,false);assert.equal(f.game.player.botControls,null);assert.deepEqual(f.game.player.keys,{});
});
test('death aborts movement and releases mining input',async()=>{
  const f=fixture();const pending=f.bot.run('go to 20 0 0');f.game.player.isDead=true;f.step();
  assert.equal((await pending).ok,false);assert.equal(f.game.isMouseDown,false);assert.equal(f.game.player.botControls,null);
});
test('invalid counts and destinations never acquire player control',async()=>{
  const f=fixture();await assert.rejects(f.bot.run({type:'mine',block:'iron ore',count:1000}));
  await assert.rejects(f.bot.run({type:'goto',position:[Infinity,0,0]}));assert.equal(f.bot.active,false);
  assert.throws(()=>validatePlan({action:'player_control',command:{code:'evil'}}));
  assert.doesNotThrow(()=>validatePlan({action:'player_control',command:'mine 1 iron ore'}));
});
test('Agent Terminal dispatches controls locally without calling an API',async()=>{
  const f=fixture();const agent=new WorldAgent(f.game);agent.playerBot=f.bot;agent.queryLanguageModel=()=>{throw Error('Must not call API');};
  const result=await f.drive(agent.executePrompt('go to 3 0 0'));
  assert.equal(result.ok,true,result.message);assert.equal(agent.isExecuting,false);
  const pending=agent.executePrompt('go to 20 0 0');f.step();await agent.executePrompt('stop bot');await pending;
  assert.equal(f.bot.active,false);assert.equal(agent.isExecuting,false);
});
test('scenario API checks real postconditions after commands complete',async()=>{
  const f=fixture();const pending=f.bot.runScenario({commands:['go to 2 0 0'],assertions:[{name:'arrived',check:game=>game.player.position.x>2}]});
  const result=await f.drive(pending);assert.equal(result.ok,true);assert.equal(result.checks[0].ok,true);
});
test('built-in movement test returns to the starting location and records a report',async()=>{
  const f=fixture();const start=f.game.player.position.clone();const result=await f.drive(f.bot.run('test movement'));
  assert.equal(result.ok,true,result.message);assert.ok(f.game.player.position.distanceTo(start)<.5);assert.equal(f.bot.report.length,1);
});
test('multi-step scenario stops on failure and does not execute remaining commands',async()=>{
  const f=fixture({tool:false});f.game.world.setVoxel(2,0,0,BLOCKS.IRON_ORE);const start=f.game.player.position.clone();
  const result=await f.drive(f.bot.runScenario({commands:['mine 1 iron ore','go to 5 0 0']}));
  assert.equal(result.ok,false);assert.equal(result.results.length,1);assert.ok(f.game.player.position.distanceTo(start)<.01);
});
