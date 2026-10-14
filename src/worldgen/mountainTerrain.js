import {BLOCKS} from '../blocks.js';

// Browser-scale mountain profiles fit the 64-block world without clipping summits.
// These are original terrain rules, informed by the Wiki biome descriptions.
export function mountainHeight(world,x,z,profile,rounded=true){
  const bend=world.detailNoise.noise2D(x*.006+31,z*.006-77)*13;
  const ridge=1-Math.abs(world.noise.noise2D((x+bend)*.018,z*.018));
  const shoulder=1-Math.abs(world.detailNoise.noise2D(x*.027+100,z*.022+70));
  const broad=world.noise.noise2D(x*.007-240,z*.007+180);
  const quantize=h=>rounded?Math.floor(h):h;
  switch(profile){
    case 'frozen':return quantize(30+broad*4+Math.pow(ridge,2.3)*18+shoulder*4);
    case 'jagged':return quantize(29+broad*4+Math.pow(ridge,4)*21+Math.pow(shoulder,2)*3);
    case 'stony':return quantize(29+broad*4+Math.pow(ridge,3.4)*21+shoulder*3);
    case 'slopes':return quantize(28+broad*3+Math.pow(ridge,1.7)*16+shoulder*3);
    case 'grove':return quantize(27+broad*3+Math.pow(ridge,1.5)*13+shoulder*3);
    default:return null;
  }
}

export function mountainColumn(world,x,z,biome,height){
  const profile=biome.mountainProfile;if(!profile)return null;
  // Query pure heights, never chunks: a border sample cannot generate a neighbour recursively.
  const actual=mountainHeight(world,x,z,profile,false);
  const north=mountainHeight(world,x,z-2,profile,false),east=mountainHeight(world,x+2,z,profile,false);
  const south=mountainHeight(world,x,z+2,profile,false),west=mountainHeight(world,x-2,z,profile,false);
  const slope=Math.max(Math.abs(actual-north),Math.abs(actual-east),Math.abs(actual-south),Math.abs(actual-west))/2;
  const lee=Math.max(actual-north,actual-east)/2;
  const drift=world.detailNoise.noise2D(x*.045-81,z*.045+137);
  const patch=world.featureNoise.noise2D(x*.023+93,z*.023-61);
  const steep=lee>=1;
  let snowDepth=0,iceDepth=0,powderDepth=0,top=BLOCKS.SNOW;
  if(profile==='frozen'){
    const glacier=patch>-.12||steep;
    snowDepth=steep?0:glacier?1+Math.floor((drift+1)*1.2):3+Math.floor((drift+1)*2);
    iceDepth=glacier?7+Math.floor((patch+1)*4):0;
    top=snowDepth?BLOCKS.SNOW:BLOCKS.PACKED_ICE;
    if(!snowDepth && patch>.55 && drift>.25)top=BLOCKS.ICE;
  }else if(profile==='jagged'){
    snowDepth=steep||slope>=1.5?0:1+Math.floor((drift+1)*1.5);top=snowDepth?BLOCKS.SNOW:BLOCKS.STONE;
  }else if(profile==='stony'){
    top=Math.abs(patch)<.11?BLOCKS.CALCITE:BLOCKS.STONE;
  }else{
    snowDepth=(profile==='grove'?2:4)+Math.floor((drift+1)*1.5);
    const stripe=world.featureNoise.noise2D(x*.06+21,z*.04-43);
    if(Math.abs(stripe)<.13 && slope<1.25){powderDepth=2+Math.floor((drift+1)*.75);top=BLOCKS.POWDER_SNOW;}
    else if(steep && profile==='slopes'){snowDepth=0;top=BLOCKS.STONE;}
  }
  const under=profile==='grove'?BLOCKS.DIRT:BLOCKS.STONE;
  return {top,snowDepth,iceDepth,powderDepth,slope,layer:top===BLOCKS.SNOW && slope<=1,blockAt(y){
    const depth=height-y;
    if(depth===0)return top;
    if(powderDepth && depth<powderDepth)return BLOCKS.POWDER_SNOW;
    if(depth<snowDepth)return BLOCKS.SNOW;
    if(iceDepth && depth<snowDepth+iceDepth)return BLOCKS.PACKED_ICE;
    if(depth<Math.max(4,snowDepth+2))return under;
    return null;
  }};
}
