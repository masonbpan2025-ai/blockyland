import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/inventory.js';
import { BotSurvival, validateSurvivalAction } from '../src/playerBotSurvival.js';
import { BLOCKS } from '../src/blocks.js';

function fixture(table=true){
  const inventory=new Inventory({playClick(){}});
  const game={inventory,player:{position:{x:0,y:1,z:0}},world:{getVoxel(x,y,z){return table&&x===1&&y===1&&z===0?BLOCKS.CRAFTING_TABLE:BLOCKS.AIR;}}};
  return {inventory,actions:new BotSurvival({game})};
}
test('crafting transfers real ingredients through Inventory recipe consumption',()=>{
  const {inventory,actions}=fixture();inventory.addItem(BLOCKS.OAK_LOG,true,3);
  actions.craft({item:'oak_planks',count:3});
  assert.equal(actions.count(BLOCKS.OAK_LOG),0);assert.equal(actions.count(BLOCKS.OAK_PLANKS),12);
  actions.craft({item:'stick',count:1});actions.craft({item:'wooden_pickaxe'});
  assert.equal(actions.count('wooden_pickaxe'),1);assert.equal(actions.count('stick'),2);
  assert.equal(actions.count(BLOCKS.OAK_PLANKS),7);assert.equal(inventory.cursorItem,null);
});
test('missing table rejects tools without consuming ingredients',()=>{
  const {inventory,actions}=fixture(false);inventory.addItem(BLOCKS.OAK_PLANKS,true,3);inventory.addItem('stick',false,2);
  const before=structuredClone(inventory.hotbar);
  assert.throws(()=>actions.craft({item:'wooden_pickaxe'}),/recipe/);assert.deepEqual(inventory.hotbar,before);
});
test('crafting rolls back when the result cannot fit',()=>{
  const {inventory,actions}=fixture();inventory.hotbar=Array.from({length:9},()=>({id:BLOCKS.DIRT,isBlock:true,count:64}));
  inventory.storage=Array.from({length:27},()=>({id:BLOCKS.DIRT,isBlock:true,count:64}));
  inventory.hotbar[0]={id:BLOCKS.OAK_LOG,isBlock:true,count:64};
  const before=structuredClone(inventory.hotbar);
  assert.throws(()=>actions.craft({item:'oak_planks'}),/full/);assert.deepEqual(inventory.hotbar,before);
  assert.ok(inventory.craft2x2.every(v=>v===null));assert.equal(inventory.cursorItem,null);
});
test('station actions reject unknown items, invalid counts and noninteger positions',()=>{
  assert.throws(()=>validateSurvivalAction({type:'place',item:'oak_planks',position:[0,1.5,0]}));
  assert.throws(()=>validateSurvivalAction({type:'craft',item:'wooden_pickaxe',count:0}));
  assert.throws(()=>validateSurvivalAction({type:'cook',item:'mutton',fuel:'invented',position:[0,1,0]}));
  assert.doesNotThrow(()=>validateSurvivalAction({type:'sleep',position:[0,1,0]}));
});
