import { LEVELS, createCourse } from '../levels.js';
import { levelPalette } from './theme.js';
const fract=n=>n-Math.floor(n),rand=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
export function createPainter(canvas) {
  const ctx=canvas.getContext('2d'),trails=[];let width=960,height=540,lastX=-1,lastLevel=-1,course=[],cameraY=0,lastTime=0;
  // The player's outline for this frame: light on a dark level, dark on a light one (theme.js). Null for trails.
  let outline=null;
  const outlineWidth=3;
  function stroke(){if(!outline)return;ctx.strokeStyle=outline;ctx.lineWidth=outlineWidth;ctx.lineJoin='round';ctx.stroke();}
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
  function glow(x,y,r,color,alpha=1){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}
  function block(x,y,w,h,color){rect(x,y,w,h,color);rect(x,y,w,5,'#ffffff30');rect(x+w-6,y,6,h,'#0003');for(let i=0;i<w/12;i++)rect(x+5+i*12,y+10+rand(i+x)*Math.max(1,h-20),5,4,'#0002');}
  function cube(px,py,angle,color){ctx.save();ctx.translate(px+15,py+15);ctx.rotate(angle);ctx.shadowColor=color;ctx.shadowBlur=20;block(-15,-15,30,30,color);ctx.shadowBlur=0;
    ctx.beginPath();ctx.rect(-16,-16,32,32);stroke();rect(-10,-7,7,7,'#17372b');rect(3,-7,7,7,'#17372b');rect(-4,0,8,9,'#17372b');rect(-8,5,4,8,'#17372b');rect(4,5,4,8,'#17372b');ctx.restore();}
  function ship(px,py,angle,color,inverted=false){
    ctx.save();ctx.translate(px+15,py+15);ctx.rotate(angle);if(inverted)ctx.scale(1,-1);
    glow(-25,6,24,'#ffcc7b',.6);rect(-31,3,12,6,'#ffcb76');rect(-25,5,9,3,'#fff7ce');
    ctx.shadowColor=color;ctx.shadowBlur=15;
    // A forward-pointing Minecraft rocket hull; the cockpit does not inherit
    // a cube's spinning animation. Only the flight path supplies its pitch.
    ctx.fillStyle='#d7c6ff';ctx.beginPath();ctx.moveTo(-22,5);ctx.lineTo(11,5);ctx.lineTo(25,11);ctx.lineTo(10,16);ctx.lineTo(-17,16);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;stroke();rect(-18,13,26,4,'#8765c1');block(-8,-12,19,19,color);ctx.beginPath();ctx.rect(-9,-13,21,21);stroke();
    rect(-5,-7,4,4,'#17372b');rect(3,-7,4,4,'#17372b');rect(-1,-2,5,6,'#17372b');
    rect(13,7,7,4,'#9cfbff');ctx.restore();
  }
  // The ball: a slime block rolled round, its face turning with it.
  function ball(px,py,angle,color){
    ctx.save();ctx.translate(px+15,py+15);ctx.rotate(angle);ctx.shadowColor=color;ctx.shadowBlur=18;
    ctx.fillStyle=color;ctx.beginPath();ctx.arc(0,0,15,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle='#ffffff40';ctx.beginPath();ctx.arc(-4,-5,9,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#17372b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.stroke();
    rect(-8,-6,5,5,'#17372b');rect(3,-6,5,5,'#17372b');rect(-4,3,8,3,'#17372b');
    ctx.beginPath();ctx.arc(0,0,16.5,0,Math.PI*2);stroke();ctx.restore();
  }
  // The UFO: a minecart under a glass dome, with the cube riding in it.
  function ufo(px,py,angle,color,inverted=false){
    ctx.save();ctx.translate(px+15,py+15);ctx.rotate(angle);if(inverted)ctx.scale(1,-1);
    glow(0,14,26,'#9cfbff',.35);ctx.fillStyle='#bfe9ff66';ctx.beginPath();ctx.arc(0,-1,12,Math.PI,0);ctx.fill();
    block(-7,-10,14,12,color);rect(-4,-7,3,3,'#17372b');rect(2,-7,3,3,'#17372b');
    ctx.shadowColor=color;ctx.shadowBlur=12;block(-18,1,36,9,'#7d7d7d');ctx.shadowBlur=0;
    rect(-18,1,36,3,'#a9a9a9');rect(-13,9,6,5,'#3a3a3a');rect(7,9,6,5,'#3a3a3a');
    ctx.beginPath();ctx.arc(0,-1,13,Math.PI,0);ctx.lineTo(19,0);ctx.lineTo(19,11);ctx.lineTo(-19,11);ctx.lineTo(-19,0);ctx.closePath();stroke();ctx.restore();
  }
  /** The player in whatever form it is in, drawn mini (0.6) about its middle when it has been shrunk. */
  function player(px,py,p,color){
    const scale=p.scale??1;ctx.save();
    if(scale!==1){ctx.translate(px+15,py+30);ctx.scale(scale,scale);ctx.translate(-px-15,-py-30);}
    if(p.mode==='ship')ship(px,py,p.angle,color,p.gravity===-1);
    else if(p.mode==='ball')ball(px,py,p.angle,color);
    else if(p.mode==='ufo')ufo(px,py,p.angle,color,p.gravity===-1);
    else cube(px,py,p.angle,color);
    ctx.restore();
  }
  // The backdrop details of the biomes after the first five, on the nearest hill layer: what makes a jungle a jungle.
  function scenery(kind,px,top,size,world,t) {
    const r=rand(world*7.3);
    if(kind==='jungle'){block(px+size*.4,top-70,12,75,'#5b3b1e');block(px+size*.1,top-108,size*.8,42,'#2f7d2a');block(px+size*.2,top-128,size*.55,24,'#3f9a35');for(let v=0;v<3;v++)rect(px+size*(.2+v*.25),top-66,3,20+rand(world+v)*40,'#2c6b26');if(r>.6){rect(px+size*.62,top-84,7,7,'#c4632d');rect(px+size*.3,top-90,7,7,'#c4632d');}}
    if(kind==='sculk'){rect(px,top,size,6,'#0b3b47');for(let k=0;k<3;k++){const sx=px+8+rand(world+k)*(size-16);rect(sx,top-10,10,10,'#123b45');glow(sx+5,top-12,14+6*Math.sin(t*2+k+world),'#3fe0e8',.45);rect(sx+3,top-16,4,6,'#5ff6ff');}if(r>.7){block(px+size*.3,top-60,size*.4,60,'#1b2a33');rect(px+size*.3,top-60,size*.4,6,'#3a5562');}}
    if(kind==='nether'){if(r>.45){block(px+size*.35,top-55-r*40,16,60+r*40,'#5c1a14');rect(px+size*.35,top-58-r*40,16,10,'#f6c35b');glow(px+size*.35+8,top-55-r*40,30,'#ffcf6b',.4);}rect(px,top,size,4,'#a4402f');}
    if(kind==='mushroom'){const big=r>.5,stemH=big?70:45,capW=big?size*.9:size*.6,cap=r>.75?'#b8432f':'#9b7656';block(px+size*.45,top-stemH,12,stemH,'#d9cfc0');block(px+size*.45+6-capW/2,top-stemH-22,capW,24,cap);if(cap==='#b8432f')for(let k=0;k<4;k++)rect(px+size*.45+6-capW/2+6+k*capW/4.5,top-stemH-16,6,6,'#f3e7d6');rect(px,top,size,5,'#8f6b95');}
    if(kind==='mineshaft'){block(px+4,top-80,8,80,'#6b4a26');block(px+size-12,top-80,8,80,'#6b4a26');block(px,top-86,size,9,'#8a6432');for(let k=0;k<size;k+=12)rect(px+k,top-3,8,3,'#7d7d7d');if(r>.6){ctx.save();ctx.globalAlpha=.35;ctx.strokeStyle='#ddd';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px+12,top-77);ctx.lineTo(px+30,top-60);ctx.moveTo(px+30,top-77);ctx.lineTo(px+12,top-60);ctx.stroke();ctx.restore();}if(r<.3){rect(px+size*.5,top-40,6,8,'#ffcf6b');glow(px+size*.5+3,top-36,22,'#ffb347',.45);}}
    if(kind==='stronghold'){block(px+size*.15,top-90,22,90,'#5d6660');for(let k=0;k<6;k++)rect(px+size*.15,top-90+k*15,22,2,'#3c4440');if(r>.55){block(px+size*.5,top-24,size*.4,10,'#9fb09c');rect(px+size*.5+4,top-30,size*.4-8,6,'#1d5a4a');glow(px+size*.7,top-27,26,'#7cff9e',.35);}}
  }
  function background(l,index,t,scroll,floor,ceiling,flight=false,flightFloor=floor) {
    const grad=ctx.createLinearGradient(0,0,0,540);grad.addColorStop(0,l.sky[0]);grad.addColorStop(1,l.sky[1]);ctx.fillStyle=grad;ctx.fillRect(0,0,960,540);
    glow(index===2?750:680,130,230,l.color,.18);
    if(index===0||index===2){rect(715-scroll*.015%100,88,48,48,index===0?'#fff3b1':'#ffcd8d');glow(739,112,95,'#ffe2a6',.23);}
    else for(let i=0;i<65;i++)rect(rand(i)*960,rand(i+100)*310,rand(i+80)> .8?3:1,2,`rgba(230,255,255,${.2+rand(i+44)*.5})`);
    if(index===1||index===4){ctx.save();ctx.globalCompositeOperation='screen';for(let k=0;k<4;k++){ctx.beginPath();ctx.moveTo(0,50+k*20);for(let xx=0;xx<=960;xx+=16)ctx.lineTo(xx,75+k*23+Math.sin(xx*.006+t*.3+k)*32);ctx.lineTo(960,180+k*15);ctx.lineTo(0,190+k*10);ctx.closePath();const a=ctx.createLinearGradient(0,40,0,250);a.addColorStop(0,index===1?'#4cf2d626':'#b164ff26');a.addColorStop(1,'transparent');ctx.fillStyle=a;ctx.fill();}ctx.restore();}
    for(let layer=0;layer<3;layer++) {
      const size=layer===0?120:80,offset=(scroll*(.06+layer*.065))%size;
      for(let i=-2;i<960/size+2;i++) {
        const world=i+Math.floor(scroll*(.06+layer*.065)/size),h=65+rand(world+layer*37+index*90)*(index===1?155:95),px=i*size-offset,base=floor-20+layer*30;
        const colors=l.hills??(index===2?['#75544d','#97644d','#bd7750']:index===4?['#29243f','#37304c','#51455b']:['#193e47','#25545a','#336a60']);
        block(px,base-h,size+1,h+100,colors[layer]);
        if(l.scenery&&layer===2)scenery(l.scenery,px,base-h,size,world,t);
        if(index===1)rect(px,base-h,size,13,'#a1c9d0');
        if(index===4){rect(px,base-h,size,10,'#9a97a0');rect(px+25,base-h-55,12,55,'#25213a');glow(px+30,base-h-60,25,'#d4a7ff',.3);}
        if(index===0&&layer===2){block(px+30,base-h-45,11,50,'#563f36');block(px+4,base-h-87,67,30,'#4d8659');block(px+15,base-h-111,45,27,'#72a469');}
        if(index===3&&layer===2){block(px+27,base-h-65,14,68,'#688875');glow(px+34,base-h-60,55,'#70ffc5',.35);rect(px+11,base-h-72,47,15,'#9de9bc');}
      }
    }
    if(index===3)for(let i=0;i<16;i++){const px=(i*79-scroll*.12)%1020;rect(px,0,8,35+rand(i)*85,'#1e554a');rect(px+8,40,10,8,'#538965');}
    for(let i=0;i<42;i++){const px=(rand(i+8)*1080-scroll*.18+t*(index===1?-14:5))%1080;const py=(rand(i+72)*500+t*(index===1?19:-6))%540;ctx.globalAlpha=.2+rand(i)*.5;rect(px,py,index===1?3:2,index===1?3:2,l.color);}ctx.globalAlpha=1;
    const beam=ctx.createLinearGradient(0,0,900,400);beam.addColorStop(0,'transparent');beam.addColorStop(.5,'#ffffff07');beam.addColorStop(1,'transparent');ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(600,0);ctx.lineTo(770,0);ctx.lineTo(430,540);ctx.lineTo(90,540);ctx.fill();
    if(floor<540)for(let xx=-40;xx<1000;xx+=40){const px=xx-(scroll%40);block(px,floor,40,540-floor,l.stone);rect(px,floor,40,9,l.ground);rect(px+7,floor+16,9,6,'#ffffff0b');}
    if(flight){rect(0,ceiling-10,960,10,l.ground);rect(0,0,960,ceiling-10,l.stone);if(flightFloor<floor){rect(0,flightFloor,960,8,l.ground);rect(0,flightFloor+8,960,Math.max(0,floor-flightFloor-8),l.stone);}}
    glow(380,floor,460,l.color,.07);
  }
  return {render(state,visualTime) {
    const bounds=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
    if(width!==bounds.width||height!==bounds.height||canvas.width!==Math.round(bounds.width*dpr)){width=bounds.width;height=bounds.height;canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    const index=state?.levelIndex??0,l=LEVELS[index],menu=!state||state.phase==='menu';
    if(!menu&&width<700&&height>width){
      // Keep the cube square in portrait; a narrower world view still shows
      // over a second of upcoming track without distorting jump geometry.
      ctx.setTransform(1,0,0,1,0,0);const surround=ctx.createLinearGradient(0,0,0,canvas.height);surround.addColorStop(0,l.sky[0]);surround.addColorStop(1,'#06161b');ctx.fillStyle=surround;ctx.fillRect(0,0,canvas.width,canvas.height);
      const scale=Math.min(canvas.width/600,canvas.height/540);ctx.setTransform(scale,0,0,scale,0,(canvas.height-540*scale)/2);
    }else ctx.setTransform(canvas.width/960,0,0,canvas.height/540,0,0);
    // A mirror portal shows the world back to front (Time Machine, Cycles, Clutterfunk, Theory of Everything).
    if(!menu&&state.mirrored)ctx.transform(-1,0,0,1,960,0);
    const flight=!menu&&['ship','ufo','ball'].includes(state.mode);
    if(index!==lastLevel){course=createCourse(index);trails.length=0;lastLevel=index;}
    if(state?.x<lastX||menu){cameraY=0;trails.length=0;}
    const desired=menu?0:flight?Math.max(0,state.floor):Math.max(0,state.y-210);
    cameraY+=(desired-cameraY)*(1-Math.exp(-Math.max(0,visualTime-lastTime)*8));lastTime=visualTime;
    const floor=440+cameraY,ceiling=floor-(state?.ceiling??300),scroll=menu?visualTime*32:state.x-205,t=visualTime;
    background(l,index,t,scroll,floor,ceiling,flight,floor-(state?.floor??0));
    // The background pushed back (darker on a dark level, lighter on a light one), so the course stands out from it.
    const pal=levelPalette(l);rect(0,0,960,540,pal.veil);
    // A soft pulse keeps the scenery in time with the original synthesized beat.
    if(!menu){ctx.globalAlpha=Math.max(0,1-(state.time*l.bpm/60)%1)*.025;rect(0,0,960,540,l.color);ctx.globalAlpha=1;}
    const used=new Set(state?.used??[]);
    for(let i=0;i<course.length;i++){
      const o=course[i],px=o.x-scroll,py=floor-o.y-o.h;if(px<-100||px>1060||used.has(o.sourceIndex)&&o.type==='coin')continue;
      if(o.type==='block'){block(px,py,o.w,o.h,pal.solid);rect(px,py,o.w,4,pal.solidTop);ctx.strokeStyle=pal.solidEdge;ctx.lineWidth=1.5;ctx.strokeRect(Math.round(px)+.75,Math.round(py)+.75,o.w-1.5,o.h-1.5);}
      // An inner square: the inside of a wall, drawn as stone with no surface edge (it has no collision).
      if(o.type==='fill')block(px,py,o.w,o.h,pal.fill);
      if(o.type==='spike'){ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.rotate(o.rotation*Math.PI/180);ctx.scale(o.flipX?-1:1,o.flipY?-1:1);ctx.shadowColor=pal.light?'transparent':l.color;ctx.shadowBlur=9;ctx.fillStyle=pal.spike;ctx.beginPath();ctx.moveTo(-o.localW/2,o.localH/2);ctx.lineTo(0,-o.localH/2);ctx.lineTo(o.localW/2,o.localH/2);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=pal.spikeEdge;ctx.lineWidth=1.5;ctx.lineJoin='round';ctx.stroke();ctx.restore();}
      if(o.type==='pit'){rect(px,py,o.w,o.h,pal.light?'#141418':'#0a0f12');for(let k=0;k<o.w;k+=6){ctx.fillStyle=pal.spike;ctx.beginPath();ctx.moveTo(px+k,py+o.h);ctx.lineTo(px+k+3,py);ctx.lineTo(px+k+6,py+o.h);ctx.fill();}}
      if(o.type==='pad'){const color=o.pad==='gravity'?pal.padGravity:o.pad==='pink'?pal.padPink:pal.padYellow;glow(o.cx-scroll,floor-o.cy,35,color,.45);rect(px,py,o.w,Math.max(4,o.h),color);ctx.strokeStyle=pal.edge;ctx.lineWidth=1.5;ctx.strokeRect(Math.round(px)-.75,Math.round(py)-.75,o.w+1.5,Math.max(4,o.h)+1.5);}
      if(o.type==='saw'){ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.rotate(t*6);const r=o.radius;glow(0,0,r*1.6,'#ff5b4a',.18);// Steel that stands out: light on a dark level, dark on a light one.
ctx.fillStyle=pal.light?'#262b30':'#d5dbe1';ctx.beginPath();for(let k=0;k<16;k++){const a=k/16*Math.PI*2,rr=k%2?r*.78:r;ctx.lineTo(Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.strokeStyle=pal.light?'#ffffff':'#0b0d12';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle=pal.light?'#6b737b':'#5c646c';ctx.beginPath();ctx.arc(0,0,r*.45,0,Math.PI*2);ctx.fill();rect(-r*.12,-r*.12,r*.24,r*.24,pal.light?'#262b30':'#e8edf2');ctx.restore();}
      if(o.type==='ring'){const color=o.orb==='pink'?pal.orbPink:o.orb==='blue'?pal.orbBlue:pal.orbYellow,spent=used.has(o.sourceIndex);glow(o.cx-scroll,floor-o.cy,34,color,spent?.12:.45);ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.globalAlpha=spent?.35:1;ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.fillStyle=color+'99';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle=color;ctx.stroke();ctx.beginPath();ctx.arc(0,0,16,0,Math.PI*2);ctx.lineWidth=1.5;ctx.strokeStyle=pal.edge;ctx.stroke();ctx.restore();}
      if(o.type==='coin'){const color='#ffd977';glow(o.cx-scroll,floor-o.cy,32,color,.35);ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,o.type==='coin'?10:15,0,Math.PI*2);if(o.type==='coin'){ctx.fillStyle=color;ctx.fill();rect(-2,-6,4,12,'#9e702e');}else{ctx.globalAlpha=used.has(o.sourceIndex)?.3:1;ctx.stroke();}ctx.restore();}
      if(o.type==='portal'){const color=o.mode==='ship'?'#71f9fa':o.mode==='cube'?'#a9f478':o.mode==='ball'?'#ff6a5a':o.mode==='ufo'?'#ffb14a':o.size===1?'#6dff7a':o.size?'#ff7ad9':o.mirror===true?'#ffa040':o.mirror===false?'#48a8ff':o.gravity===-1?'#e1a4ff':'#ffe8a4';glow(o.cx-scroll,floor-o.cy,65,color,.22);ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.rotate(o.rotation*Math.PI/180);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,18,50,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
    const px=menu?685:205,py=menu?floor-30:floor-state.y-30;
    if(state?.x!==lastX){trails.unshift({x:px,y:py,a:state?.angle??0,mode:state?.mode,gravity:state?.gravity,scale:state?.scale});if(trails.length>12)trails.pop();lastX=state?.x;}
    outline=null;
    if(!menu&&state.phase==='play'){for(let i=trails.length-1;i>=0;i--){ctx.globalAlpha=(1-i/trails.length)*.16;const p=trails[i];player(p.x-i*9,p.y,{mode:p.mode,angle:p.a,gravity:p.gravity,scale:p.scale},l.color);}ctx.globalAlpha=1;}
    if(state?.phase==='dead'){for(let i=0;i<28;i++){const age=Math.min(2,t%2),a=rand(i)*Math.PI*2,dist=35+rand(i+70)*130;glow(px+16+Math.cos(a)*dist,py+16+Math.sin(a)*dist,8,l.color,.65);}}
    else{outline=pal.outline;if(!menu)player(px,py,state,l.color);else cube(px,py,Math.sin(t)*.12,l.color);outline=null;}
    if(state?.checkpoint!==null&&state?.checkpoint!==undefined){const cx=state.checkpoint-scroll;rect(cx,floor-65,3,65,'#76ffd7');rect(cx,floor-65,28,16,'#76ffd7');}
    const finish=l.length-scroll;if(finish<1000){glow(finish,270,150,l.color,.35);rect(finish,ceiling,7,300,l.color);}
    const vignette=ctx.createRadialGradient(480,270,180,480,270,640);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#0008');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,540);
  }};
}
