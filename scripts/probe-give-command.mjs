// Fast diagnostic using production inventory/dispatcher, without a browser or AI.
// This is NOT a substitute for the bot-route and real dropped-entity checks.
import { Inventory } from '../src/inventory.js';
import { BLOCKS } from '../src/blocks.js';
import { PlayerBot } from '../src/playerBot.js';
import { buildCommandContext, runCommand, permissionRefusal } from '../src/commandRunner.js';
import { parseGive } from '../src/commands.js';
import { writeFile, mkdir } from 'node:fs/promises';

function fixture({mode='survival',cheats=true,fill=false,partial=false}={}) {
  const inventory=new Inventory(), messages=[], drops=[];
  if(fill||partial) {
    inventory.hotbar=Array.from({length:9},()=>({id:BLOCKS.DIRT,isBlock:true,count:64}));
    inventory.storage=Array.from({length:27},()=>({id:BLOCKS.DIRT,isBlock:true,count:64}));
    if(partial)inventory.hotbar[0]={id:BLOCKS.STONE,isBlock:true,count:63};
  }
  const game={world:{},worldReady:true,inventory,
    settings:{gameMode:mode,cheats},player:{gamemode:mode,position:{x:0,y:1,z:0}},
    ui:{addChatMessage:(text,kind)=>messages.push({text,kind}),updateHotbar(){}},
    entities:{spawnDroppedItem:(position,id,isBlock,count)=>drops.push({position,id,isBlock,count})}};
  game.handleCommand = line => {
    const root = String(line).trim().split(/\s+/)[0];
    const refusal = permissionRefusal(game.settings, root, game.player);
    if (refusal) { game.ui.addChatMessage(refusal, 'error'); return false; }
    return runCommand(buildCommandContext(game), line);
  };
  return {game,inventory,messages,drops};
}
function count(f,id){return [...f.inventory.hotbar,...f.inventory.storage].reduce((n,s)=>n+(s?.id===id?s.count:0),0);}
const rows=[];
function probe(id,command,{setup={},item=BLOCKS.STONE,inventoryDelta=0,dropped=0,refused=false,category='core'}={}) {
  const f=fixture(setup), before=count(f,item), snapshot=JSON.stringify([f.inventory.hotbar,f.inventory.storage]);
  runCommand(buildCommandContext(f.game),command);
  const actual={inventoryDelta:count(f,item)-before,dropped:f.drops.filter(d=>d.id===item).reduce((n,d)=>n+d.count,0),error:f.messages.some(m=>m.kind==='error'),inventoryUnchanged:snapshot===JSON.stringify([f.inventory.hotbar,f.inventory.storage])};
  const ok=actual.inventoryDelta===inventoryDelta&&actual.dropped===dropped&&actual.error===refused&&(!refused||actual.inventoryUnchanged&&f.drops.length===0);
  rows.push({id,category,command,status:ok?'PASS':category==='gap'?'GAP':'FAIL',expected:{inventoryDelta,dropped,refused},actual,messages:f.messages,drops:f.drops});
}
probe('G01','/give @s minecraft:stone',{inventoryDelta:1});
probe('G02','/give @p minecraft:diamond_sword 1',{item:'diamond_sword',inventoryDelta:1});
probe('G03','/give @s minecraft:stone 65',{inventoryDelta:65});
probe('G04','/give @s minecraft:ender_pearl 17',{item:'ender_pearl',inventoryDelta:17});
probe('G05','/give @s minecraft:stone 1',{setup:{cheats:false},refused:true});
probe('G06','/give @s minecraft:stone 1',{setup:{mode:'creative',cheats:false},inventoryDelta:1,category:'game-policy'});
for(const [n,c] of ['0','-1','1.5','64abc','2147483648'].entries())probe(`G07-${n}`,`/give @s minecraft:stone ${c}`,{refused:true});
probe('G08','/give @s',{refused:true});
probe('G09','/give @s minecraft:does_not_exist 1',{refused:true});
probe('G10','/give @z minecraft:stone 1',{refused:true});
probe('G11','/give @s minecraft:stone 10',{setup:{partial:true},inventoryDelta:1,dropped:9});
probe('G12','/give @s minecraft:stone 10',{setup:{fill:true},dropped:10});
probe('G13','/give @s minecraft:stone 1 extra',{refused:true});
probe('G14','/give @a minecraft:stone 1',{inventoryDelta:1,category:'gap'});
probe('G15','/give NobodyHere minecraft:stone 1',{refused:true,category:'gap'});
probe('G16','/give @s minecraft:diamond_sword 101',{item:'diamond_sword',refused:true,category:'gap'});
const f=fixture();
try {
  const result=await new PlayerBot(f.game).run({type:'command',command:'/give @s minecraft:stone 1'});
  rows.push({id:'BOT01',status:count(f,BLOCKS.STONE)===1?'PASS':'FAIL',result,inventoryStone:count(f,BLOCKS.STONE)});
}catch(e){rows.push({id:'BOT01',status:'BLOCKED',reason:e.message});}
const report={referenceProfile:'Java plain-item /give; modern 100-stack limit. See guide for version qualification.',
  layer:'production dispatcher and real Inventory; drop hook records requests only, not entity physics',
  parserOnly:{maxInt:parseGive(['@s','stone','2147483647']).ok,aboveInt:parseGive(['@s','stone','2147483648']).ok},rows};
if(process.argv.includes('--write')) {
  await mkdir('docs/artifacts',{recursive:true});
  await writeFile('docs/artifacts/give-command-probe.json',JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(process.argv.includes('--write')
  ? {artifact:'docs/artifacts/give-command-probe.json',rows:rows.map(r=>({id:r.id,status:r.status,actual:r.actual,reason:r.reason}))}
  : report,null,2));
