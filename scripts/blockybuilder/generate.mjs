import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { writeNbt, readNbt, TagType } from '../../src/io/nbt.js';
import { furnishedHouse, copyAudit, fittedDoor, ladderShaft } from './interiors.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const OUTPUT = path.join(ROOT, 'outputs/BlockyBuilder');
const SCHEMS = path.join(OUTPUT, 'schematics');
const AUTHOR = 'BlockyBuilder';
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/minecraft/blocks-1.21.4.json')));
const leaf = (wood='oak') => `${wood}_leaves[distance=1,persistent=true,waterlogged=false]`;
const stair = (wood, facing, half='bottom') => `${wood}_stairs[facing=${facing},half=${half},shape=straight,waterlogged=false]`;
const slab = (wood, type='bottom') => `${wood}_slab[type=${type},waterlogged=false]`;
const hash = (x,y,z) => { let a=Math.imul(x+177,374761393)^Math.imul(y+39,668265263)^Math.imul(z+177,1274126177);a=Math.imul(a^(a>>>13),1274126177);return ((a^(a>>>16))>>>0)/4294967296; };

class Build {
  constructor(id,name,w,h,l,category,description) { Object.assign(this,{id,name,w,h,l,category,description});this.vox=new Uint16Array(w*h*l);this.palette=['minecraft:air'];this.ids=new Map([['minecraft:air',0]]);this.features=[];this.pois=[];this.audit={doors:[],rooms:[],ladders:[],routes:[]};this.anchor=[Math.floor(w/2),4,Math.floor(l/2)]; }
  idFor(s) { s=s.startsWith('minecraft:')?s:`minecraft:${s}`;if(!this.ids.has(s)){this.ids.set(s,this.palette.length);this.palette.push(s);}return this.ids.get(s); }
  valid(x,y,z){return x>=0&&x<this.w&&y>=0&&y<this.h&&z>=0&&z<this.l;}
  put(x,y,z,s){x=Math.round(x);y=Math.round(y);z=Math.round(z);if(this.valid(x,y,z))this.vox[x+z*this.w+y*this.w*this.l]=typeof s==='number'?s:this.idFor(s);}
  get(x,y,z){return this.valid(x,y,z)?this.vox[x+z*this.w+y*this.w*this.l]:0;}
  nameAt(x,y,z){return this.palette[this.get(x,y,z)];}
  box(x1,y1,z1,x2,y2,z2,s){for(let y=Math.max(0,y1);y<=Math.min(this.h-1,y2);y++)for(let z=Math.max(0,z1);z<=Math.min(this.l-1,z2);z++)for(let x=Math.max(0,x1);x<=Math.min(this.w-1,x2);x++)this.put(x,y,z,typeof s==='function'?s(x,y,z):s);}
  disk(x,y,z,r,s,inner=-1){for(let zz=Math.ceil(z-r);zz<=z+r;zz++)for(let xx=Math.ceil(x-r);xx<=x+r;xx++){let d=Math.hypot(xx-x,zz-z);if(d<=r&&d>inner)this.put(xx,y,zz,typeof s==='function'?s(xx,y,zz):s);}}
  sphere(x,y,z,rx,ry,rz,s,air=true){for(let yy=Math.floor(y-ry);yy<=y+ry;yy++)for(let zz=Math.floor(z-rz);zz<=z+rz;zz++)for(let xx=Math.floor(x-rx);xx<=x+rx;xx++)if(((xx-x)/rx)**2+((yy-y)/ry)**2+((zz-z)/rz)**2<=1&&(!air||!this.get(xx,yy,zz)))this.put(xx,yy,zz,s);}
  base(top=4,mat='grass_block',rounded=false){for(let z=0;z<this.l;z++)for(let x=0;x<this.w;x++){if(rounded&&Math.hypot((x-this.w/2)/(this.w/2-2),(z-this.l/2)/(this.l/2-2))>1)continue;this.box(x,0,z,x,top-1,z,'stone');this.put(x,top,z,mat);}this.anchor[1]=top;}
  path(x1,z1,x2,z2,width=3,y=4,mat='stone_bricks'){const n=Math.max(Math.abs(x2-x1),Math.abs(z2-z1));for(let i=0;i<=n;i++){const t=n?i/n:0;this.disk(Math.round(x1+(x2-x1)*t),y,Math.round(z1+(z2-z1)*t),width/2,mat);}}
  tree(x,y,z,s=8,wood='oak'){this.box(x,y,z,x,y+s,z,`${wood}_log[axis=y]`);for(const [dx,dz,dy] of [[-3,0,0],[3,1,1],[0,-3,1],[0,3,-1]]){for(let t=0;t<=3;t++)this.put(x+dx*t/3,y+s-3+t*.5,z+dz*t/3,`${wood}_log[axis=y]`);this.sphere(x+dx,y+s+dy,z+dz,3.5,2.8,3.5,leaf(wood));}this.sphere(x,y+s+2,z,4.5,3.2,4.5,leaf(wood));}
  lamp(x,y,z,mat='spruce',h=4){this.put(x,y,z,'chiseled_stone_bricks');this.box(x,y+1,z,x,y+h-1,z,`${mat}_fence`);this.put(x,y+h,z,'lantern[hanging=false,waterlogged=false]');}
  flowers(x1,z1,x2,z2,y=5){for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)if(!this.get(x,y,z)&&this.nameAt(x,y-1,z)==='minecraft:grass_block'&&hash(x,7,z)>.965)this.put(x,y,z,leaf('flowering_azalea'));}
  bench(x,y,z,face='south',mat='spruce'){for(let dx=0;dx<3;dx++)this.put(x+dx,y,z,stair(mat,face));for(const dx of [-1,3])this.put(x+dx,y,z,`${mat}_trapdoor[facing=${dx<0?'east':'west'},half=bottom,open=true,powered=false,waterlogged=false]`);}
  copy(other,dx=0,dy=0,dz=0){for(let y=0;y<other.h;y++)for(let z=0;z<other.l;z++)for(let x=0;x<other.w;x++){const v=other.get(x,y,z);if(v)this.put(x+dx,y+dy,z+dz,other.palette[v]);}copyAudit(this,other,dx,dy,dz);}
  roof(x1,x2,z1,z2,eave,mat='brick'){
    const mid=(x1+x2)/2;
    for(let x=x1-1;x<=x2+1;x++){const rise=Math.max(0,Math.floor(Math.min(x-x1+1,x2+1-x)));const y=eave+rise;this.box(x,eave-1,z1-1,x,y-1,z2+1,`${mat==='brick'?'bricks':mat==='dark_oak'?'dark_oak_planks':mat==='spruce'?'spruce_planks':mat}`);for(let z=z1-1;z<=z2+1;z++)this.put(x,y,z,stair(mat,x<=mid?'east':'west'));}
    const peak=eave+Math.floor((x2-x1+2)/2);this.box(Math.floor(mid),peak+1,z1-2,Math.floor(mid),peak+1,z2+2,slab(mat));
  }
  connect(){const changes=[];for(let y=0;y<this.h;y++)for(let z=0;z<this.l;z++)for(let x=0;x<this.w;x++){const s=this.nameAt(x,y,z),base=s.slice(10).split('[')[0];if(!base.endsWith('_fence')&&!base.endsWith('_glass_pane')&&base!=='glass_pane'&&base!=='iron_bars')continue;let p=[];for(const [n,dx,dz] of [['north',0,-1],['south',0,1],['east',1,0],['west',-1,0]]){const ns=this.nameAt(x+dx,y,z+dz);p.push(`${n}=${!/air|water|leaves|grass|flower|torch|lantern/.test(ns)}`);}changes.push([x,y,z,base+'['+p.join(',')+',waterlogged=false]']);}for(const args of changes)this.put(...args);}
  write(){this.connect();const data=[];let nonAir=0;for(let v of this.vox){if(v)nonAir++;do{let byte=v&127;v>>>=7;data.push(byte|(v?128:0));}while(v);}for(const s of this.palette){const [,base,props]=s.match(/^minecraft:([^[]+)(?:\[(.*)\])?$/);if(!registry[base])throw Error(`Unknown Java 1.21.4 block ${s}`);for(const p of (props||'').split(',').filter(Boolean)){const [k,v]=p.split('=');if(!registry[base][0][k]?.includes(v))throw Error(`Invalid property ${s}`);}}
    const offset=this.anchor.map(v=>-v);const metadata={Name:this.name,Author:AUTHOR,Description:this.description,WEOffsetX:offset[0],WEOffsetY:offset[1],WEOffsetZ:offset[2],PlayerSpawn:[this.anchor[0],this.anchor[1]+2,this.anchor[2],Math.PI,0]};
    const root={Version:2,DataVersion:4189,Width:this.w,Height:this.h,Length:this.l,Offset:Int32Array.from(offset),PaletteMax:this.palette.length,Palette:Object.fromEntries(this.palette.map((s,i)=>[s,i])),BlockData:Uint8Array.from(data),BlockEntities:[],Entities:[],Metadata:metadata};
    const file=`${this.id}.schem`;fs.writeFileSync(path.join(SCHEMS,file),zlib.gzipSync(writeNbt(root,{rootName:'Schematic',types:{Width:TagType.SHORT,Height:TagType.SHORT,Length:TagType.SHORT}}),{level:9}));
    return {id:this.id,name:this.name,author:AUTHOR,file:`schematics/${file}`,category:this.category,description:this.description,size:[this.w,this.h,this.l],nonAir,palette:this.palette.length,anchor:this.anchor,features:this.features,pois:this.pois,audit:this.audit};
  }
}

function windowFront(b,x,y,z,wood='spruce',outward=-1){b.box(x-1,y,z,x+1,y+2,z,'light_blue_stained_glass');b.box(x-2,y+3,z,x+2,y+3,z,'smooth_sandstone');b.box(x-2,y+3,z+outward,x+2,y+3,z+outward,slab('sandstone'));b.box(x-2,y-1,z+outward,x+2,y-1,z+outward,slab('sandstone','top'));for(const dx of [-2,2])b.box(x+dx,y,z+outward,x+dx,y+2,z+outward,`${wood}_planks`);}
function door(b,x,y,z){for(let i=0;i<2;i++)b.put(x,y+i,z,`spruce_door[facing=south,half=${i?'upper':'lower'},hinge=left,open=false,powered=false]`);}

function house(kind,w=27,l=29){return furnishedHouse(Build,kind,w,l);}

function spawn(){const b=new Build('willowbrook_spawn','Willowbrook SMP Spawn',97,52,97,'Server spawn','A garden hub with four monumental gateway bays, a fountain plaza, market stalls, NPC pads and crate terraces.');b.base(4,'grass_block',true);const c=48;
  for(let r=38;r<=41;r++)b.disk(c,4,c,r,'stone_bricks',r-1);
  b.disk(c,4,c,22,(x,y,z)=>Math.floor(Math.hypot(x-c,z-c))%6===0?'polished_andesite':'smooth_sandstone');b.disk(c,4,c,23,'deepslate_tiles',22);
  for(const [x,z] of [[c,4],[c,92],[4,c],[92,c]])b.path(c,c,x,z,9,4,'smooth_sandstone');
  // Fountain bowl, quatrefoil petals and upper water basin, all water contained.
  b.disk(c,5,c,7,'stone_bricks');b.disk(c,6,c,7,slab('stone_brick'),5.5);b.disk(c,5,c,5.5,'water[level=0]');b.box(c,5,c,c,10,c,'chiseled_stone_bricks');b.disk(c,10,c,3,'stone_bricks');b.disk(c,11,c,3,slab('stone_brick'),1.7);b.disk(c,11,c,1.7,'water[level=0]');b.put(c,12,c,'sea_lantern');
  function gate(cx,cz,rot){const p=(u,y,v,s)=>b.put(cx+(rot?v:u),y,cz+(rot?u:v),s);for(let u=-8;u<=8;u++)for(let y=5;y<=22;y++){const opening=Math.abs(u)<=4&&y<=18-Math.max(0,Math.abs(u)-1);if(!opening&&Math.abs(u)<=6)for(let v=-2;v<=2;v++)p(u,y,v,y%6===0?'polished_andesite':'stone_bricks');}for(const u of [-7,7])for(let y=5;y<=25;y++)for(let v=-3;v<=3;v++)p(u,y,v,y===24?'chiseled_stone_bricks':'smooth_sandstone');for(let u=-9;u<=9;u++)for(let v=-3;v<=3;v++){p(u,26,v,'dark_prismarine');p(u,27,v,slab('dark_prismarine'));}for(const u of [-7,7]){p(u,28,0,'gold_block');p(u,29,0,'lantern[hanging=false,waterlogged=false]');}for(let u=-4;u<=4;u++)p(u,4,0,'cyan_terracotta');b.pois.push({label:`Gateway ${b.pois.length+1} (empty plugin bay)`,pos:[cx,5,cz]});}
  gate(c,12,false);gate(c,84,false);gate(12,c,true);gate(84,c,true);
  for(const [x,z] of [[23,23],[73,23],[23,73],[73,73]]){b.disk(x,5,z,8,'stone_bricks');b.disk(x,6,z,7,'smooth_sandstone');for(const dx of [-5,5])for(const dz of [-5,5]){b.box(x+dx,7,z+dz,x+dx,16,z+dz,'stripped_oak_log[axis=y]');b.put(x+dx,15,z+dz,'lantern[hanging=true,waterlogged=false]');}for(let k=0;k<=6;k++)b.box(x-7+k,17+k,z-7+k,x+7-k,17+k,z+7-k,'dark_prismarine');b.put(x,24,z,'gold_block');b.disk(x,7,z,2,'chiseled_stone_bricks');}
  for(let k=0;k<8;k++){const a=k*Math.PI/4+Math.PI/8,x=Math.round(c+17*Math.cos(a)),z=Math.round(c+17*Math.sin(a));b.disk(x,5,z,1.6,'chiseled_stone_bricks');b.put(x,5,z,'gold_block');b.pois.push({label:`NPC ${k+1}`,pos:[x,6,z]});}
  for(const [x,z] of [[34,66],[40,70],[30,60]]){b.disk(x,5,z,2,'polished_andesite');b.put(x,6,z,'gold_block');b.put(x,7,z,'chest[facing=north,type=single,waterlogged=false]');b.pois.push({label:'Crate display',pos:[x,7,z]});}
  for(const [x,z] of [[64,36],[72,34]]){for(const dx of [-3,3])b.box(x+dx,5,z,x+dx,9,z,'spruce_fence');b.box(x-3,10,z-2,x+3,10,z+1,(xx)=>xx%2?'white_wool':'yellow_wool');b.box(x-2,5,z,x+2,6,z,'barrel[facing=up,open=false]');}
  for(const [x,z] of [[31,11],[65,11],[11,31],[85,31],[11,65],[85,65],[31,85],[65,85]])b.tree(x,5,z,6);
  for(let k=0;k<12;k++){const a=k*Math.PI/6,x=Math.round(c+29*Math.cos(a)),z=Math.round(c+29*Math.sin(a));if(Math.abs(x-c)>6&&Math.abs(z-c)>6)b.lamp(x,5,z);}
  for(const [x,z] of [[35,28],[57,28],[35,67],[57,67]])b.bench(x,5,z,z<48?'north':'south');b.flowers(5,5,91,91);b.anchor=[48,4,65];b.features=['Four empty portal bays','Eight NPC pads','Three crate displays','Four pavilions','Fountain and market stalls'];return b;}

function arena(){const b=new Build('sunken_temple_arena','Sunken Temple Duel Arena',73,46,73,'PvP arena','A rotationally balanced sandstone arena framed by ruined arches, blue pools, ivy and a spectator promenade.');b.base(4,'sandstone');const c=36;b.disk(c,4,c,29,(x,y,z)=>Math.floor(Math.hypot(x-c,z-c))%8===0?'cut_sandstone':'smooth_sandstone');
  // Enclosing walk, protected spectator rail and regularly spaced ruined columns.
  for(let y=5;y<=9;y++)b.disk(c,y,c,34,y===9?slab('sandstone'):'sandstone',31);b.disk(c,10,c,34,'smooth_sandstone',29);
  for(let k=0;k<16;k++){const a=k*Math.PI/8,x=Math.round(c+32*Math.cos(a)),z=Math.round(c+32*Math.sin(a)),h=14+(k%3)*3;b.box(x-1,11,z-1,x+1,h,z+1,'cut_sandstone');b.box(x-2,h+1,z-2,x+2,h+1,z+2,slab('sandstone'));}
  for(const side of [-1,1]){const x=c+side*20;b.disk(x,5,c,3,'cyan_terracotta');b.put(x,5,c,'sea_lantern');b.pois.push({label:`Duel start ${side<0?'A':'B'}`,pos:[x,6,c]});}
  // All combat obstacles mirrored by 180 degrees; even the detailing is balanced.
  for(const [dx,dz,h] of [[8,11,5],[-9,13,3],[0,20,4]])for(const m of [-1,1]){const x=c+dx*m,z=c+dz*m;b.box(x-2,5,z-2,x+2,h+4,z+2,'sandstone');b.box(x-3,h+5,z-3,x+3,h+5,z+3,slab('sandstone'));b.sphere(x,5,z,3,1,3,'mossy_stone_bricks');}
  for(const z of [17,55]){b.box(29,4,z-2,43,4,z+2,'prismarine_bricks');b.box(30,4,z-1,42,4,z+1,'water[level=0]');}
  for(const x of [14,58])for(const z of [14,58]){b.tree(x,5,z,7);b.lamp(x+3,5,z, 'spruce',3);}b.anchor=[36,4,36];b.features=['Two opposite spawn pads','180° symmetric combat obstacles','Enclosed combat floor','Raised spectator promenade','Shallow contained pools'];return b;}

function island(theme){const data={forest:['Verdant Refuge','grass_block','oak','mossy_cobblestone'],snow:['Frostpine Refuge','snow_block','spruce','packed_ice'],desert:['Sunspire Refuge','sandstone','acacia','sandstone']};const [name,surface,wood,rock]=data[theme],b=new Build(`starter_island_${theme}`,name,49,52,49,'Starter islands',`A ${theme}-themed floating island with a habitable cabin, safe arrival pad and dramatic tapered stone underside.`),c=24,ground=22;
  for(let z=3;z<46;z++)for(let x=3;x<46;x++){const r=Math.hypot(x-c,z-c),angle=Math.atan2(z-c,x-c),edge=19+Math.sin(angle*3)*1.5+Math.cos(angle*5);if(r>edge)continue;const bottom=Math.max(0,Math.floor(ground-(1-r/edge)*18-3));for(let y=bottom;y<=ground;y++)b.put(x,y,z,y===ground?surface:y>ground-3?'dirt':hash(x,y,z)<.12?rock:'stone');}
  b.disk(24,ground,30,4,'stone_bricks');b.disk(24,ground,30,3,slab('stone_brick','double'));b.pois=[{label:'Safe arrival',pos:[24,23,30]}];
  b.box(17,ground+1,13,30,ground+1,24,'stone_bricks');b.box(18,ground+2,14,29,ground+7,23,`${wood}_planks`);b.box(19,ground+2,15,28,ground+6,22,'air');for(const x of [18,29])for(const z of [14,23])b.box(x,ground+2,z,x,ground+7,z,`${wood}_log[axis=y]`);b.box(21,ground+3,14,25,ground+4,14,'light_blue_stained_glass');b.box(21,ground+3,23,25,ground+4,23,'light_blue_stained_glass');door(b,23,ground+2,23);b.roof(17,30,13,24,ground+8,theme==='desert'?'brick':'spruce');b.box(22,ground+1,25,24,ground+1,26,'stone_bricks');b.put(23,ground+1,27,stair('stone_brick','north'));
  b.put(20,ground+2,16,'crafting_table');b.put(21,ground+2,16,'furnace[facing=south,lit=false]');b.put(27,ground+2,16,'chest[facing=south,type=single,waterlogged=false]');b.put(25,ground+6,18,'lantern[hanging=true,waterlogged=false]');b.tree(12,ground+1,29,7,wood);b.tree(34,ground+1,30,6,wood);for(const x of [18,30])b.lamp(x,ground+1,31,wood,3);
  b.path(24,28,24,39,3,ground,'stone_bricks');for(const [x,z] of [[10,21],[38,20],[13,36]])b.sphere(x,ground+1,z,2,2,2,rock);if(theme==='forest'){b.flowers(5,5,44,44,ground+1);b.disk(35,ground,17,3,'clay');b.disk(35,ground,17,2,'water[level=0]');}if(theme==='snow')for(let z=5;z<44;z++)for(let x=5;x<44;x++)if(b.nameAt(x,ground,z)==='minecraft:snow_block'&&!b.get(x,ground+1,z)&&hash(x,1,z)>.5)b.put(x,ground+1,z,'snow[layers=1]');b.anchor=[24,ground,30];b.features=['Furnished cabin','Safe arrival platform','Floating terrain underside','Two permanent custom trees','Decorative starter variant; resources require server balancing'];return b;}

function outpost(){const b=new Build('frostgate_outpost','Frostgate RPG Outpost',97,62,97,'RPG environment','A snowy mountain trading post with three furnished lodges, a watchtower, frozen pond and a traversable dungeon entrance.');b.base(7,'snow_block');
  // Back mountain silhouette; a deliberately open foreground for encounters.
  for(let z=56;z<96;z++)for(let x=2;x<95;x++){const h=Math.max(0,Math.floor(30-Math.hypot((x-64)*.55,(z-80)*1.2)+Math.sin(x*.24)*2));for(let y=8;y<=8+h;y++)b.put(x,y,z,y===8+h?'snow_block':hash(x,y,z)<.08?'andesite':'stone');}
  for(const [id,x,z] of [['cottage',8,13],['tavern',58,12],['blacksmith',10,50]]){const h=house(id,27,29);b.box(x+3,8,z+3,x+h.w-4,61,z+h.l-4,'air');for(let zz=0;zz<h.l;zz++)for(let xx=0;xx<h.w;xx++)for(let yy=5;yy<h.h;yy++){const v=h.get(xx,yy,zz);if(v){let s=h.palette[v];if(s==='minecraft:smooth_sandstone')s='minecraft:stone_bricks';if(s.startsWith('minecraft:brick_stairs'))s=s.replace('brick_stairs','spruce_stairs');if(s==='minecraft:bricks')s='minecraft:spruce_planks';b.put(x+xx,yy+3,z+zz,s);}}}
  b.path(48,2,48,69,7,7,'stone_bricks');b.path(22,20,75,20,5,7,'stone_bricks');b.path(22,35,75,35,5,7,'stone_bricks');b.path(23,58,48,58,4,7,'stone_bricks');b.disk(48,7,40,10,'stone_bricks');
  // Guard tower with accessible ladder and enclosed platform.
  b.box(75,8,47,85,27,57,'stone_bricks');b.box(77,8,49,83,26,55,'air');b.box(78,8,47,82,11,48,'air');b.box(76,28,48,84,28,56,'spruce_planks');for(let y=8;y<29;y++)b.put(83,y,54,'ladder[facing=west,waterlogged=false]');b.box(74,29,46,86,30,58,'stone_bricks');b.box(76,29,48,84,30,56,'air');for(let x=74;x<=86;x+=3)for(const z of [46,58])b.box(x,31,z,x,32,z,'stone_bricks');
  // Short real corridor cut into mountain, stone arch and illuminated vault room.
  b.box(43,8,65,53,15,88,'stone_bricks');b.box(45,8,64,51,13,87,'air');for(let x=42;x<=54;x++)for(let y=8;y<=18;y++)if(Math.abs(x-48)<=5&&y<17-Math.abs(x-48)*.5)b.put(x,y,64,'air');else b.put(x,y,64,'polished_andesite');b.box(40,8,80,57,17,93,'stone_bricks');b.box(42,8,81,55,15,91,'air');b.box(42,7,81,55,7,91,'deepslate_tiles');b.put(48,15,85,'lantern[hanging=true,waterlogged=false]');b.put(48,8,90,'chest[facing=north,type=single,waterlogged=false]');for(const z of [69,76])b.put(48,13,z,'lantern[hanging=true,waterlogged=false]');
  b.disk(74,7,75,9,'packed_ice');b.disk(74,7,75,9,'snow_block',8);for(const [x,z] of [[7,9],[42,12],[88,9],[7,84],[88,85],[64,52]])b.tree(x,8,z,9,'spruce');for(const [x,z] of [[42,25],[54,25],[42,53],[54,53]])b.lamp(x,8,z,'spruce',4);b.pois=[{label:'Arrival',pos:[48,8,5]},{label:'Dungeon entrance',pos:[48,8,64]},{label:'Boss/encounter clearing',pos:[48,8,40]},{label:'Guard tower',pos:[80,8,47]}];b.anchor=[48,7,5];b.features=['Three furnished lodges','Accessible guard tower','Mountain dungeon corridor and treasure chamber','Encounter clearing','Frozen pond'];return b;}

function castleShowcase(){const b=new Build('ivy_crown_castle','Ivy Crown Castle',113,58,113,'Castle showcase','An ivy-clad fortress with four round towers, a furnished great hall, a gatehouse, moat, lantern bridge and formal courtyard gardens.');b.base();
  const stone=(x,y,z)=>hash(x,y,z)<.09?'mossy_stone_bricks':hash(x,y,z)<.13?'cracked_stone_bricks':'stone_bricks';
  for(let z=0;z<113;z++)for(let x=0;x<113;x++){const d=Math.hypot(Math.max(17-x,0,x-95),Math.max(23-z,0,z-99));if(d>0&&d<7){b.put(x,2,z,'gravel');b.put(x,3,z,'water[level=0]');b.put(x,4,z,'air');}}
  for(const [x1,z1,x2,z2] of [[23,40,23,91],[89,40,89,91],[23,91,89,91],[23,34,43,34],[69,34,89,34]]){b.box(x1-1,5,z1-1,x2+1,25,z2+1,stone);b.box(x1-2,26,z1-2,x2+2,26,z2+2,'polished_andesite');if(x1===x2){for(let z=z1;z<=z2;z++)for(const x of [x1-2,x1+2]){b.put(x,27,z,'stone_bricks');if(z%5<2)b.box(x,28,z,x,29,z,'stone_bricks');}}else for(let x=x1;x<=x2;x++)for(const z of [z1-2,z1+2]){b.put(x,27,z,'stone_bricks');if(x%5<2)b.box(x,28,z,x,29,z,'stone_bricks');}}
  function tower(cx,cz,r,top){for(let y=5;y<=top;y++)b.disk(cx,y,cz,r+(y>top-3?1:0),y===14||y===24||y===top-3?'polished_andesite':stone,r-2);for(let y=5;y<top;y+=10){b.disk(cx,y,cz,r-2,'spruce_planks');b.put(cx,y+1,cz,'lantern[hanging=false,waterlogged=false]');b.put(cx+2,y+1,cz,'barrel[facing=up,open=false]');}
    b.disk(cx,top,cz,r+1,'stone_bricks');for(let z=cz-r-1;z<=cz+r+1;z++)for(let x=cx-r-1;x<=cx+r+1;x++){const d=Math.hypot(x-cx,z-cz);if(d>r-1&&d<=r+1){b.put(x,top+1,z,'stone_bricks');if((Math.round(Math.atan2(z-cz,x-cx)*r)+100)%4<2)b.box(x,top+2,z,x,top+3,z,'stone_bricks');}}
    for(let y=10;y<top-5;y+=10)for(const [dx,dz] of [[0,-1],[0,1],[-1,0],[1,0]]){b.box(cx+dx*(r-1),y,cz+dz*(r-1),cx+dx*(r-1),y+3,cz+dz*(r-1),'light_blue_stained_glass');for(let i=0;i<3;i++)b.put(cx+dx*r,y+i,cz+dz*r,'air');b.put(cx+dx*r,y-1,cz+dz*r,slab('stone_brick','top'));}
    for(let y=6;y<=top;y++)b.put(cx-r+2,y,cz,'ladder[facing=east,waterlogged=false]');for(let y=6;y<=9;y++)for(let d=r-2;d<=r;d++)b.put(cx, y,cz+(cz<60?d:-d),'air');
    for(let y=6;y<top-2;y++){const x=cx-Math.round(r*.7),z=cz-Math.round(r*.7);if(!b.get(x,y,z))b.put(x,y,z,'vine[east=true,south=true,up=false]');if(y%8===0)b.sphere(x,y,z,2,2,2,leaf());}
  }
  tower(31,34,8,42);tower(81,34,8,38);tower(23,91,7,33);tower(89,91,7,36);
  b.box(44,5,29,68,33,39,stone);b.box(47,19,31,65,30,37,'air');b.box(47,18,31,65,18,37,'spruce_planks');b.box(43,34,28,69,34,40,'polished_andesite');for(let x=43;x<=69;x++)for(const z of [28,40]){b.put(x,35,z,'stone_bricks');if(x%5<2)b.box(x,36,z,x,37,z,'stone_bricks');}
  for(let x=50;x<=62;x++)for(let y=5;y<=17-Math.max(0,Math.abs(x-56)-2);y++)b.box(x,y,28,x,y,40,'air');for(const x of [49,63])b.box(x,5,28,x,15,28,'polished_andesite');for(const x of [46,66])b.lamp(x,5,26,'dark_oak',5);
  // Block-built heraldic pennant with gold border and cross, visible without block-entity data.
  for(let y=23;y<=31;y++)for(let x=53;x<=59;x++)b.put(x,y,28,x===53||x===59||y===31||y===23?'yellow_wool':'red_wool');b.box(55,25,28,57,28,28,'yellow_wool');b.box(54,27,28,58,27,28,'yellow_wool');
  const hall=house('tavern',43,35);for(let y=5;y<hall.h;y++)for(let z=0;z<hall.l;z++)for(let x=0;x<hall.w;x++){const v=hall.get(x,y,z);if(!v)continue;let s=hall.palette[v];if(s==='minecraft:smooth_sandstone')s='minecraft:stone_bricks';if(s.startsWith('minecraft:brick_stairs'))s=s.replace('brick_stairs','deepslate_tile_stairs');if(s.startsWith('minecraft:brick_slab'))s=s.replace('brick_slab','deepslate_tile_slab');if(s==='minecraft:bricks')s='minecraft:deepslate_tiles';b.put(x+35,y,z+56,s);}
  b.path(56,0,56,65,9);b.path(29,57,83,57,5);b.disk(56,4,52,6,'polished_andesite');b.disk(56,5,52,5,'stone_bricks',3.5);b.disk(56,4,52,3.5,'water[level=0]');b.box(56,4,52,56,8,52,'chiseled_stone_bricks');b.put(56,9,52,'sea_lantern');
  for(const x of [35,73])for(const z of [48,62,77]){b.box(x-3,5,z-2,x+3,5,z+2,'oak_leaves[distance=1,persistent=true,waterlogged=false]');b.box(x-2,5,z-1,x+2,5,z+1,'grass_block');b.flowers(x-2,z-1,x+2,z+1,6);}
  for(let z=13;z<=24;z++){b.box(51,5,z,61,5,z,'spruce_planks');for(const x of [51,61]){b.put(x,6,z,'dark_oak_fence');if(z%5===0){b.box(x,2,z,x,7,z,'dark_oak_log[axis=y]');b.put(x,8,z,'lantern[hanging=false,waterlogged=false]');}}}b.box(52,4,12,60,4,12,stair('spruce','south'));b.box(52,4,25,60,4,25,'stone_bricks');
  for(const [x,z] of [[7,13],[104,14],[7,66],[104,68],[14,106],[100,105]])b.tree(x,5,z,8);for(const x of [15,97])for(const z of [30,55,80])b.lamp(x,5,z);b.flowers(1,1,111,111);b.anchor=[56,4,5];b.features=['Four round towers and gatehouse','Furnished great hall','Heraldic banner','Moat and lantern bridge','Courtyard fountain and gardens','Fits Building Studio height'];b.pois=[{label:'Arrival',pos:[56,5,5]},{label:'Gate',pos:[56,5,28]},{label:'Great hall',pos:[56,6,63]}];return b;
}

export function generatePortfolio(){fs.mkdirSync(SCHEMS,{recursive:true});const builds=[spawn(),arena(),...['forest','snow','desert'].map(island),outpost(),castleShowcase()];const houses=[house('cottage'),house('tavern',31,31),house('blacksmith',29,29),house('bakery'),house('shop'),house('watchtower',25,27)];builds.push(...houses);
  const village=new Build('harbor_village_collection','Harbor Village Collection',105,56,105,'Village kit','Six furnished Mediterranean buildings arranged around a lantern-lit market street; individual building schematics are included.');village.base();const spots=[[6,3],[64,3],[5,38],[65,39],[6,73],[66,75]];houses.forEach((h,i)=>village.copy(h,...[spots[i][0],0,spots[i][1]]));village.path(51,0,51,104,9,4,'stone_bricks');for(const z of [20,55,90])village.path(22,z,82,z,5,4,'stone_bricks');for(const z of [9,33,67,97]){village.lamp(44,5,z);village.lamp(58,5,z);}village.anchor=[51,4,6];village.features=['Six distinct furnished buildings','Individual modular files included','Coordinated palette','Lantern-lit connecting streets'];builds.push(village);
  const items=builds.map(b=>b.write());
  const manifest={author:AUTHOR,title:'BlockyBuilder — Worlds worth exploring',target:'Minecraft Java 1.21.4',dataVersion:4189,format:'Sponge schematic v2',created:'2026-10-19',items};fs.writeFileSync(path.join(OUTPUT,'manifest.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify(items.map(({id,size,nonAir})=>({id,size,nonAir})),null,2));return manifest;
}
if(process.argv[1]===fileURLToPath(import.meta.url))generatePortfolio();
