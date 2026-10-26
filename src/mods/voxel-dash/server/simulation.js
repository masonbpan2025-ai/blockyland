// Classic cube/ship/ball/UFO physics in Geometry Dash's 30-unit grid. See RESEARCH.md.
export const PHYSICS=Object.freeze({tick:1/240,size:30,cubeGravity:2799.36,jump:603.72,
  yellowPad:864,pinkPad:540,yellowOrb:621,fallLimit:810,shipUpLimit:432,
  shipDownLimit:-345.6,shipSwitch:103.48549461364746,
  // Ball and UFO (levels 7-12). Gravity scales and the mini factors are measured (RESEARCH.md); the flip, flap and
  // pink-orb impulses are adapter values.
  ballGravity:.6,ballPad:.6,ballOrb:.7,ballFlip:.3,ufoGravity:.6,ufoFlap:378,ufoFallLimit:345.6,
  pinkOrb:.7,miniScale:.6,miniImpulse:.8,ballCorridor:300,flightCorridor:300,
  // Coyote time (Geometry Dash 2.2/2.201: "Coyote time has been added for jumping off platforms"): a cube that walks off
  // an edge can still jump while it has turned at most 30 degrees since leaving it -- 1/15 s at its 450 degrees a second.
  coyoteTilt:Math.PI/6});
export function createSimulation(course,{speed=311.58,length=26000,maxObjectWidth=Math.max(0,...course.map(o=>o.w))}={},saved=null) {
  let x=saved?.x??0,y=saved?.y??0,vy=saved?.vy??0,angle=saved?.angle??0,
    gravity=saved?.gravity??1,mode=saved?.mode??'cube',phase='play',time=saved?.time??0,
    floor=saved?.floor??0,ceiling=saved?.ceiling??300,grounded=saved?.grounded??true,
    scale=saved?.scale??1,mirrored=saved?.mirrored??false,
    held=saved?.controls?.held??false,queued=saved?.controls?.queued??false,
    accumulator=saved?.controls?.accumulator??0,coins=saved?.coins??0,deathBy=null,
    // When gravity last flipped: for 0.1 s after, a block's side re-seats the player instead of killing (RESEARCH.md).
    flipAt=saved?.flipAt??-Infinity,
    // The cube's angle when it walked off an edge, while a late press may still jump (coyote time); otherwise null.
    coyote=saved?.coyote??null;
  const used=new Set(saved?.used??[]);
  // The player's box: 30 units, or 18 when mini, centred on x+15 and standing on y.
  const half=()=>15*scale,left=()=>x+15-half(),bottomY=()=>y,size=()=>30*scale;
  const intersects=(o,pad=0)=>left()+size()>o.x-pad&&left()<o.x+o.w+pad&&y+size()>o.y-pad&&y<o.y+o.h+pad;
  // What ended the run: an object's source index, or 'bounds' for leaving the world. For tests and the course verifier.
  const die=(o=null)=>{phase='dead';held=false;queued=false;deathBy=o?o.sourceIndex:'bounds';};
  // Mini launches lower; the ball's and UFO's own scales apply on top (RESEARCH.md).
  const impulse=()=>scale<1?PHYSICS.miniImpulse:1;
  const flying=()=>mode==='ship'||mode==='ufo';
  function corridor(o,height) {
    floor=Math.max(0,Math.round((o.cy-15)/30)*30-height/2);ceiling=floor+height;
    y=Math.max(floor,Math.min(ceiling-size(),y));
  }
  function tick() {
    const d=PHYSICS.tick,oldY=y;x+=speed*d;time+=d;
    // Whether the cube stood on something, and how it was turned, coming into this tick; whether anything launched it.
    const wasGrounded=grounded,groundAngle=angle;let launched=false;
    let lo=0,hi=course.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(course[mid].x<x-maxObjectWidth-60)lo=mid+1;else hi=mid;}
    const near=[];for(let i=lo;i<course.length&&course[i].x<x+60;i++)if(course[i].x+course[i].w>x-60)near.push(course[i]);
    // Coin-route gravity portals must only activate when actually touched.
    for(const o of near)if(o.type==='portal'&&!used.has(o.sourceIndex)&&intersects(o)){
      used.add(o.sourceIndex);
      if(o.gravity){if(gravity!==o.gravity)flipAt=time;gravity=o.gravity;vy*=.5;grounded=false;launched=true;}
      if(o.size){scale=o.size;}
      if(o.mirror!==undefined)mirrored=o.mirror;
      if(o.mode){mode=o.mode;angle=0;grounded=false;launched=true;coyote=null;
        if(mode==='ship'){
          floor=Math.max(0,Math.round((o.cy-15)/30)*30-150);ceiling=floor+300;
          y=Math.max(floor,Math.min(ceiling-30,y));vy=Math.max(-345.6,Math.min(432,vy));
        }
        if(mode==='ufo'){corridor(o,PHYSICS.flightCorridor);vy=Math.max(-PHYSICS.ufoFallLimit,Math.min(PHYSICS.ufoFlap,vy));}
        if(mode==='ball')corridor(o,PHYSICS.ballCorridor);
      }
    }
    if(mode==='cube') {
      // On the ground, or just off an edge and turned no more than coyoteTilt: the press is a jump.
      const coyoteJump=!grounded&&coyote!==null&&Math.abs(angle-coyote)<=PHYSICS.coyoteTilt;
      if((grounded||coyoteJump)&&held){vy=PHYSICS.jump*impulse()*gravity;grounded=false;queued=false;launched=true;coyote=null;}
      vy-=PHYSICS.cubeGravity*gravity*d;
      vy=gravity===1?Math.max(-PHYSICS.fallLimit,vy):Math.min(PHYSICS.fallLimit,vy);
    }else if(mode==='ball') {
      // A press on a surface flips gravity and pushes off towards the other side; held, it flips again on landing.
      if(grounded&&held){gravity*=-1;flipAt=time;vy=-PHYSICS.jump*PHYSICS.ballFlip*impulse()*gravity;grounded=false;queued=false;}
      vy-=PHYSICS.cubeGravity*PHYSICS.ballGravity*gravity*d;
      vy=gravity===1?Math.max(-PHYSICS.fallLimit,vy):Math.min(PHYSICS.fallLimit,vy);
    }else if(mode==='ufo') {
      // One flap for each press, in the air as on the ground; holding does not flap again. An orb in reach takes the
      // press instead (below), as it does in Geometry Dash.
      const orbInReach=near.some(o=>o.type==='ring'&&!used.has(o.sourceIndex)&&intersects(o,6));
      if(queued&&!orbInReach){vy=PHYSICS.ufoFlap*impulse()*gravity;grounded=false;queued=false;}
      vy-=PHYSICS.cubeGravity*PHYSICS.ufoGravity*gravity*d;
      vy=gravity===1?Math.max(-PHYSICS.ufoFallLimit,vy):Math.min(PHYSICS.ufoFallLimit,vy);
    }else {
      const v=vy*gravity,threshold=PHYSICS.shipSwitch*gravity;
      // Measured 240-Hz acceleration branches, no artificial drag.
      const acceleration=held?(v<=threshold?0.108:0.086):(v>threshold?-0.103:-0.069);
      vy=Math.max(PHYSICS.shipDownLimit,Math.min(PHYSICS.shipUpLimit,v+acceleration*54))*gravity;
    }
    y+=vy*d;grounded=false;
    const s=size();
    // Clear world boundaries are surfaces, not invisible death planes.
    if(mode!=='cube'){
      if(y<floor){y=floor;vy=Math.max(0,vy);grounded=gravity===1;}
      if(y+s>ceiling){y=ceiling-s;vy=Math.min(0,vy);grounded=gravity===-1;}
    }else if(y<0){if(gravity===1){y=0;vy=0;grounded=true;}else {y=0;vy=Math.max(0,vy);}}
    // Outer box lands, inner box kills on side impacts. Ships, UFOs and balls slide on both
    // horizontal solid faces. Surfaces resolve before spike/pit hitboxes.
    const l=left();
    for(const o of near)if(o.type==='block'&&l+s>o.x&&l<o.x+o.w){
      const top=o.y+o.h,bottom=o.y;
      if(vy<=0&&oldY>=top-1&&y<=top&&y+s>bottom){y=top;vy=0;grounded=gravity===1;continue;}
      if(vy>=0&&oldY+s<=bottom+1&&y+s>=bottom&&y<top){
        if(mode!=='cube'||gravity===-1){y=bottom-s;vy=0;grounded=gravity===-1;continue;}
      }
      const inner=(flying()?10:4.5)*scale,cx=x+15,cy=y+s/2;
      if(cx+inner>o.x&&cx-inner<o.x+o.w&&cy+inner>o.y&&cy-inner<top){
        // Just after a gravity flip the player is put back on the nearer face rather than killed.
        if(time-flipAt<.1){if(cy<o.y+o.h/2){y=bottom-s;grounded=gravity===-1;}else {y=top;grounded=gravity===1;}vy=0;continue;}
        die(o);return;}
    }
    for(const o of near){
      const key=o.sourceIndex;
      const modeScale=mode==='ball'?PHYSICS.ballPad:1;
      // A gravity pad fires only for a player falling onto it: a floor pad for normal gravity, a ceiling pad upside down.
      if(o.type==='pad'&&!used.has(key)&&intersects(o,1)&&(o.pad!=='gravity'||(o.inverted?gravity===-1:gravity===1))){
        used.add(key);grounded=false;launched=true;
        // Flipped, and launched towards the new down: away from the pad.
        if(o.pad==='gravity'){gravity*=-1;flipAt=time;vy=-PHYSICS.jump*.5*impulse()*gravity;}
        else vy=(o.pad==='pink'?PHYSICS.pinkPad:PHYSICS.yellowPad)*modeScale*impulse()*(o.inverted?-1:1);
      }
      if(o.type==='ring'&&queued&&!used.has(key)&&intersects(o,6)){
        used.add(key);grounded=false;queued=false;launched=true;
        const orbScale=(mode==='ball'?PHYSICS.ballOrb:1)*impulse();
        if(o.orb==='blue'){gravity*=-1;flipAt=time;vy=-PHYSICS.jump*.5*orbScale*gravity;}
        else vy=PHYSICS.yellowOrb*(o.orb==='pink'?PHYSICS.pinkOrb:1)*orbScale*gravity;
      }
      if(o.type==='coin'&&!used.has(key)&&intersects(o)){used.add(key);coins++;}
      if(o.type==='spike'||o.type==='pit'){
        const rad=o.rotation*Math.PI/180,dx=x+15-o.cx,dy=y+s/2-o.cy;
        const localX=dx*Math.cos(rad)-dy*Math.sin(rad),localY=dx*Math.sin(rad)+dy*Math.cos(rad);
        const hw=o.type==='pit'?15*o.scale:3*o.scale,
          hh=o.type==='pit'?4*o.scale:(o.id===8?6:3)*o.scale,h2=s/2;
        if(Math.abs(localX)<hw+h2&&Math.abs(localY)<hh+h2){die(o);return;}
      }
      if(o.type==='saw'){
        // A round blade: the nearest point of the player's box inside its radius.
        const nx=Math.max(l,Math.min(o.cx,l+s)),ny=Math.max(y,Math.min(o.cy,y+s));
        if(Math.hypot(o.cx-nx,o.cy-ny)<o.radius){die(o);return;}
      }
    }
    if(mode==='ship'){
      const desired=Math.atan2(-vy,speed);angle+=(desired-angle)*(1-Math.exp(-39*d));
      angle=Math.max(-Math.PI/2+.05,Math.min(Math.PI/2-.05,angle));
    }else if(mode==='ufo')angle=Math.max(-.25,Math.min(.25,-vy/1500));
    else if(mode==='ball')angle+=gravity*speed*d/(15*scale);
    else if(grounded)angle=Math.round(angle/(Math.PI/2))*(Math.PI/2);
    else angle+=gravity*d*Math.PI*2.5;
    // Coyote time: opened by walking off an edge (not by a jump, pad, orb or portal), closed on landing or past the tilt.
    if(mode!=='cube'||grounded||launched)coyote=null;
    else if(wasGrounded)coyote=groundAngle;
    else if(coyote!==null&&Math.abs(angle-coyote)>PHYSICS.coyoteTilt)coyote=null;
    if(y>1500||y<-300){die();return;}
    if(x>=length){x=length;phase='complete';held=false;}
  }
  const snapshot=()=>({phase,x,y,vy,angle,gravity,mode,grounded,floor,ceiling,coins,time,jumpQueued:queued,used:[...used],scale,mirrored,deathBy,flipAt,coyote,
    // Time not yet spent on a whole physics tick: drawing carries the motion on by it, so the course moves evenly at any frame rate.
    lag:accumulator,speed});
  return {jump(down){if(down&&!held)queued=true;if(!down)queued=false;held=down;},
    release(){held=false;queued=false;},
    advance(dt){if(!Number.isFinite(dt)||dt<=0||dt>.25||phase!=='play')return;accumulator+=dt;while(accumulator+1e-9>=PHYSICS.tick&&phase==='play'){accumulator-=PHYSICS.tick;tick();}},
    snapshot,
    fork(){return createSimulation(course,{speed,length,maxObjectWidth},{...snapshot(),controls:{held,queued,accumulator}});}};
}
