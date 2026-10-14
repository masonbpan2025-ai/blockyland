import { LEVELS, createCourse } from '../levels.js';
const fract=n=>n-Math.floor(n),rand=n=>fract(Math.sin(n*127.1+311.7)*43758.5453);
export function createPainter(canvas) {
  const ctx=canvas.getContext('2d'),trails=[];let width=960,height=540,lastX=-1,lastLevel=-1,course=[],cameraY=0,lastTime=0;
  function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),w,h);}
  function glow(x,y,r,color,alpha=1){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();}
  function block(x,y,w,h,color){rect(x,y,w,h,color);rect(x,y,w,5,'#ffffff30');rect(x+w-6,y,6,h,'#0003');for(let i=0;i<w/12;i++)rect(x+5+i*12,y+10+rand(i+x)*Math.max(1,h-20),5,4,'#0002');}
  function cube(px,py,angle,color){ctx.save();ctx.translate(px+15,py+15);ctx.rotate(angle);ctx.shadowColor=color;ctx.shadowBlur=20;block(-15,-15,30,30,color);ctx.shadowBlur=0;rect(-10,-7,7,7,'#17372b');rect(3,-7,7,7,'#17372b');rect(-4,0,8,9,'#17372b');rect(-8,5,4,8,'#17372b');rect(4,5,4,8,'#17372b');ctx.restore();}
  function ship(px,py,angle,color,inverted=false){
    ctx.save();ctx.translate(px+15,py+15);ctx.rotate(angle);if(inverted)ctx.scale(1,-1);
    glow(-25,6,24,'#ffcc7b',.6);rect(-31,3,12,6,'#ffcb76');rect(-25,5,9,3,'#fff7ce');
    ctx.shadowColor=color;ctx.shadowBlur=15;
    // A forward-pointing Minecraft rocket hull; the cockpit does not inherit
    // a cube's spinning animation. Only the flight path supplies its pitch.
    ctx.fillStyle='#d7c6ff';ctx.beginPath();ctx.moveTo(-22,5);ctx.lineTo(11,5);ctx.lineTo(25,11);ctx.lineTo(10,16);ctx.lineTo(-17,16);ctx.closePath();ctx.fill();
    ctx.shadowBlur=0;rect(-18,13,26,4,'#8765c1');block(-8,-12,19,19,color);
    rect(-5,-7,4,4,'#17372b');rect(3,-7,4,4,'#17372b');rect(-1,-2,5,6,'#17372b');
    rect(13,7,7,4,'#9cfbff');ctx.restore();
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
        const colors=index===2?['#75544d','#97644d','#bd7750']:index===4?['#29243f','#37304c','#51455b']:['#193e47','#25545a','#336a60'];
        block(px,base-h,size+1,h+100,colors[layer]);
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
    if(index!==lastLevel){course=createCourse(index);trails.length=0;lastLevel=index;}
    if(state?.x<lastX||menu){cameraY=0;trails.length=0;}
    const desired=menu?0:state.mode==='ship'?Math.max(0,state.floor):Math.max(0,state.y-210);
    cameraY+=(desired-cameraY)*(1-Math.exp(-Math.max(0,visualTime-lastTime)*8));lastTime=visualTime;
    const floor=440+cameraY,ceiling=floor-(state?.ceiling??300),scroll=menu?visualTime*32:state.x-205,t=visualTime;
    background(l,index,t,scroll,floor,ceiling,!menu&&state.mode==='ship',floor-(state?.floor??0));
    // A soft pulse keeps the scenery in time with the original synthesized beat.
    if(!menu){ctx.globalAlpha=Math.max(0,1-(state.time*l.bpm/60)%1)*.025;rect(0,0,960,540,l.color);ctx.globalAlpha=1;}
    const used=new Set(state?.used??[]);
    for(let i=0;i<course.length;i++){
      const o=course[i],px=o.x-scroll,py=floor-o.y-o.h;if(px<-100||px>1060||used.has(o.sourceIndex)&&o.type==='coin')continue;
      if(o.type==='block'){block(px,py,o.w,o.h,l.stone);rect(px,py,o.w,5,l.ground);}
      if(o.type==='spike'){ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.rotate(o.rotation*Math.PI/180);ctx.scale(o.flipX?-1:1,o.flipY?-1:1);ctx.shadowColor=l.color;ctx.shadowBlur=9;ctx.fillStyle=index===4?'#d7b5ff':index===2?'#ffd0a1':'#c9f3e2';ctx.beginPath();ctx.moveTo(-o.localW/2,o.localH/2);ctx.lineTo(0,-o.localH/2);ctx.lineTo(o.localW/2,o.localH/2);ctx.closePath();ctx.fill();ctx.restore();}
      if(o.type==='pit'){rect(px,py,o.w,o.h,'#142126');for(let k=0;k<o.w;k+=6){ctx.fillStyle=l.color;ctx.beginPath();ctx.moveTo(px+k,py+o.h);ctx.lineTo(px+k+3,py);ctx.lineTo(px+k+6,py+o.h);ctx.fill();}}
      if(o.type==='pad'){const color=o.pad==='gravity'?'#79dcff':o.pad==='pink'?'#ffa2dc':'#ffee8c';glow(o.cx-scroll,floor-o.cy,35,color,.35);block(px,py,o.w,Math.max(4,o.h),color);}
      if(o.type==='ring'||o.type==='coin'){const color=o.type==='coin'?'#ffd977':'#fff19a';glow(o.cx-scroll,floor-o.cy,32,color,.35);ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,o.type==='coin'?10:15,0,Math.PI*2);if(o.type==='coin'){ctx.fillStyle=color;ctx.fill();rect(-2,-6,4,12,'#9e702e');}else{ctx.globalAlpha=used.has(o.sourceIndex)?.3:1;ctx.stroke();}ctx.restore();}
      if(o.type==='portal'){const color=o.mode==='ship'?'#71f9fa':o.mode==='cube'?'#a9f478':o.gravity===-1?'#e1a4ff':'#ffe8a4';glow(o.cx-scroll,floor-o.cy,65,color,.22);ctx.save();ctx.translate(o.cx-scroll,floor-o.cy);ctx.rotate(o.rotation*Math.PI/180);ctx.strokeStyle=color;ctx.shadowColor=color;ctx.shadowBlur=18;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,18,50,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
    }
    const px=menu?685:205,py=menu?floor-30:floor-state.y-30;
    if(state?.x!==lastX){trails.unshift({x:px,y:py,a:state?.angle??0,mode:state?.mode,gravity:state?.gravity});if(trails.length>12)trails.pop();lastX=state?.x;}
    if(!menu&&state.phase==='play'){for(let i=trails.length-1;i>=0;i--){ctx.globalAlpha=(1-i/trails.length)*.16;const p=trails[i];if(p.mode==='ship')ship(p.x-i*9,p.y,p.a,l.color,p.gravity===-1);else cube(p.x-i*9,p.y,p.a,l.color);}ctx.globalAlpha=1;}
    if(state?.phase==='dead'){for(let i=0;i<28;i++){const age=Math.min(2,t%2),a=rand(i)*Math.PI*2,dist=35+rand(i+70)*130;glow(px+16+Math.cos(a)*dist,py+16+Math.sin(a)*dist,8,l.color,.65);}}
    else if(!menu&&state.mode==='ship')ship(px,py,state.angle,l.color,state.gravity===-1);
    else cube(px,py,menu?Math.sin(t)*.12:state.angle,l.color);
    if(state?.checkpoint!==null&&state?.checkpoint!==undefined){const cx=state.checkpoint-scroll;rect(cx,floor-65,3,65,'#76ffd7');rect(cx,floor-65,28,16,'#76ffd7');}
    const finish=l.length-scroll;if(finish<1000){glow(finish,270,150,l.color,.35);rect(finish,ceiling,7,300,l.color);}
    const vignette=ctx.createRadialGradient(480,270,180,480,270,640);vignette.addColorStop(0,'transparent');vignette.addColorStop(1,'#0008');ctx.fillStyle=vignette;ctx.fillRect(0,0,960,540);
  }};
}
