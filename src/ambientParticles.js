import * as THREE from 'three';
import {BLOCKS as B,BLOCK_DEFS} from './blocks.js';
import {weatherDimension,precipitationForBiome} from './weatherRules.js';
import {AMBIENT_PARTICLES,AMBIENT_SOURCE_IDS,biomeParticle,blockParticleSources,leafParticle,leafTint,isFireflyNight,isParticleCellOpen} from './ambientParticleRules.js';
import {markOverWater} from './waterPass.js';

// A fixed pool, a single draw call, and at most four chunk scans per refresh.
// Particles stay in world coordinates when the player walks past them.
export class AmbientParticles {
  constructor(scene,{random=Math.random,capacity=512}={}){
    this.scene=scene;this.random=random;this.capacity=capacity;this.particles=[];this.cache=new Map();this.time=0;this.emission=0;this.scanTime=0;
    this.geometry=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['color',3],['sprite',4],['turn',1]])this.geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(capacity*size),size).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setDrawRange(0,0);
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{pointScale:{value:470},light:{value:1}},
      vertexShader:'attribute vec3 color;attribute vec4 sprite;attribute float turn;varying vec3 tint;varying vec4 style;varying float angle;uniform float pointScale;void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(sprite.x*pointScale/max(.3,-p.z),1.0,42.0);tint=color;style=sprite;angle=turn;}',
      fragmentShader:`varying vec3 tint;varying vec4 style;varying float angle;uniform float light;
        void main(){vec2 p=gl_PointCoord-.5;p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;float a=0.0;
        if(style.z<.5){a=step(length(p*vec2(1.0,1.3)),.42)*(.65+.35*step(.0,p.x));}
        else if(style.z<1.5){p.x/=max(.28,abs(cos(angle*.7)));a=step(abs(p.x)+abs(p.y)*.8,.43);a*=1.0-step(.025,abs(p.x-p.y*.4))*.15;}
        else if(style.z<2.5){float lobes=min(length(p-vec2(-.13,.12)),length(p-vec2(.13,.12)));a=max(step(lobes,.20),step(abs(p.x)+abs(p.y+.08)*.75,.30));}
        else if(style.z<3.5){a=exp(-dot(p,p)*18.0);}
        else if(style.z<4.5){a=step(length(p*vec2(1.4,.8)),.30);}
        else if(style.z<5.5){a=exp(-dot(p,p)*24.0);}
        else{a=(1.0-smoothstep(.12,.49,length(p)))*.3;}
        if(a<.02)discard;gl_FragColor=vec4(tint*(mix(light,1.0,step(.01,style.w))+style.w),a*style.y);
        #include <colorspace_fragment>
        }`});
    this.mesh=new THREE.Points(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.visible=false;markOverWater(this.mesh);scene.add(this.mesh);
  }
  spawn(kind,x,y,z,world,overrides={}){
    const profile=AMBIENT_PARTICLES[kind];if(!profile||this.particles.length>=this.capacity||!isParticleCellOpen(world,x,y,z,kind))return false;
    const r=this.random,life=profile.life*(.7+r()*.6);
    this.particles.push({kind,x,y,z,vx:(r()-.5)*.12,vz:(r()-.5)*.12,vy:profile.vy,age:0,life,maxLife:life,phase:r()*Math.PI*2,color:profile.color,...overrides});return true;
  }
  refresh(world,eye){
    if(!world?.chunks)return;
    const nearby=[...world.chunks.values()].filter(c=>Math.abs(c.cx*16+8-eye.x)<48&&Math.abs(c.cz*16+8-eye.z)<48).sort((a,b)=>Math.hypot(a.cx*16+8-eye.x,a.cz*16+8-eye.z)-Math.hypot(b.cx*16+8-eye.x,b.cz*16+8-eye.z));
    const valid=new Set(nearby);for(const c of this.cache.keys())if(!valid.has(c))this.cache.delete(c);
    let scans=0;
    for(const c of nearby){
      if(!c.voxels)continue;
      const cached=this.cache.get(c);if(cached&&cached.revision===c.weatherRevision)continue;if(scans++>=4)break;
      const sources=[];
      for(let i=0;i<c.voxels.length;i++){
        const id=c.voxels[i];if(id===B.AIR)continue;
        const x=c.cx*16+(i&15),y=i>>8,z=c.cz*16+((i>>4)&15);
        if(AMBIENT_SOURCE_IDS.has(id))sources.push({id,x,y,z,kinds:blockParticleSources(id)});
        else if(y>0&&y<63&&BLOCK_DEFS[id]?.solid!==false&&c.voxels[i-256]===B.AIR&&[B.WATER,B.LAVA].includes(c.voxels[i+256]))sources.push({id,x,y,z,kinds:[c.voxels[i+256]===B.WATER?'falling_water':'falling_lava'],seep:true});
      }
      this.cache.set(c,{revision:c.weatherRevision,sources});
    }
  }
  leafIsWet(world,s,weather){
    if(!weather?.isRaining?.()||precipitationForBiome(world.getBiome?.(s.x,s.z)??world.selectedBiome,s.y+1,world)!=='rain')return false;
    let y=s.y+1;while(y<64&&leafParticle(world.getVoxel(s.x,y,s.z)))y++;
    return weather.isRainingAt?.(s.x+.5,y,s.z+.5)??false;
  }
  emit(world,eye,game){
    const r=this.random,dimension=weatherDimension(world);
    // Nether atmospherics are biome ambience, including under its natural roof.
    // They aren't rain and don't damage mobs or alter weather timers.
    for(let i=0;i<4;i++){
      const x=eye.x+(r()-.5)*48,y=eye.y+(r()-.5)*24,z=eye.z+(r()-.5)*48;
      const kind=game?.isUnderwater?'underwater':biomeParticle(world.getBiome?.(Math.floor(x),Math.floor(z))??world.selectedBiome,dimension);
      if(kind)this.spawn(kind,x,y,z,world);
    }
    let emitted=0;
    for(const entry of this.cache.values())for(const s of entry.sources){
      if(emitted>=48||Math.hypot(s.x+.5-eye.x,s.y+.5-eye.y,s.z+.5-eye.z)>32||world.getVoxel(s.x,s.y,s.z)!==s.id)continue;
      for(const kind of s.kinds){
        const profile=AMBIENT_PARTICLES[kind],leaf=profile.leaf;
        if(r()>(leaf?.025:kind==='lava'?.025:kind==='flame'||kind==='soul_fire_flame'?.12:.055))continue;
        if(kind==='firefly'&&!isFireflyNight(game?.worldTime))continue;
        let x=s.x+r(),z=s.z+r(),y=s.y+1.03;
        if(leaf||kind==='falling_spore_blossom'||s.seep||kind==='falling_water'){y=s.y-.03;}
        if(kind==='spore_blossom_air'){x=s.x+.5+(r()-.5)*32;z=s.z+.5+(r()-.5)*32;y=s.y-r()*16;}
        if(kind==='firefly'){x+=(r()-.5)*5;z+=(r()-.5)*5;y+=r()*2;}
        if(kind==='end_rod'){x+=(r()-.5);z+=(r()-.5);y=s.y+r();}
        if(kind==='falling_obsidian_tear'){x=s.x+(r()<.5?-.03:1.03);y=s.y+r();}
        const color=kind==='tinted_leaves'?leafTint(s.id,world.getBiome?.(s.x,s.z)??world.selectedBiome):profile.color;
        if(this.spawn(kind,x,y,z,world,{color}))emitted++;
      }
      if(leafParticle(s.id)&&r()<.04&&this.leafIsWet(world,s,game?.weather))this.spawn('falling_water',s.x+r(),s.y-.03,s.z+r(),world);
    }
  }
  update(dt,eye,game){
    const world=game?.world;if(!world?.getVoxel){this.mesh.visible=false;return;}
    const dim=weatherDimension(world);
    if(this.world!==world||this.dimension!==dim||this.lastEye&&this.lastEye.distanceToSquared(eye)>4096){this.clear();this.world=world;this.dimension=dim;}
    this.lastEye??=new THREE.Vector3();this.lastEye.copy(eye);
    dt=Math.min(.5,Math.max(0,dt));this.time+=dt;this.scanTime-=dt;
    if(this.scanTime<=0){this.refresh(world,eye);this.scanTime=.25;}
    this.emission+=dt;while(this.emission>=.1){this.emission-=.1;this.emit(world,eye,game);}
    for(let i=this.particles.length-1;i>=0;i--){
      const p=this.particles[i],profile=AMBIENT_PARTICLES[p.kind];p.age+=dt;p.life-=dt;
      if(p.life<=0||Math.hypot(p.x-eye.x,p.y-eye.y,p.z-eye.z)>32){this.particles.splice(i,1);continue;}
      if(!p.settled){
        p.vy-=dt*(profile.gravity||0);const sway=profile.leaf?.22:.04;
        const drag=world.getVoxel(Math.floor(p.x),Math.floor(p.y),Math.floor(p.z))===B.COBWEB?.1:1;
        const nx=p.x+(p.vx+Math.sin(this.time*1.2+p.phase)*sway)*dt*drag,nz=p.z+(p.vz+Math.cos(this.time*.8+p.phase)*sway)*dt*drag,ny=p.y+p.vy*dt*drag;
        if(isParticleCellOpen(world,nx,p.y,p.z,p.kind))p.x=nx;
        if(isParticleCellOpen(world,p.x,p.y,nz,p.kind))p.z=nz;
        if(isParticleCellOpen(world,p.x,ny,p.z,p.kind))p.y=ny;
        else if(profile.leaf&&p.vy<0){
          const def=BLOCK_DEFS[world.getVoxel(Math.floor(p.x),Math.floor(ny),Math.floor(p.z))];
          const height=def?.slab?.5:def?.carpet?(def.carpetHeight??1/16):1;
          p.settled=true;p.life=Math.min(p.life,.6);p.y=Math.floor(ny)+height+.005;
        }
        else {this.particles.splice(i,1);continue;}
      }
    }
    const pos=this.geometry.attributes.position,col=this.geometry.attributes.color,style=this.geometry.attributes.sprite,turn=this.geometry.attributes.turn,color=new THREE.Color();
    for(let i=0;i<this.particles.length;i++){
      const p=this.particles[i],profile=AMBIENT_PARTICLES[p.kind];pos.setXYZ(i,p.x,p.y,p.z);color.setHex(p.color);col.setXYZ(i,color.r,color.g,color.b);
      let opacity=Math.min(1,p.age*4,p.life*2);if(p.kind==='firefly')opacity*=Math.pow(.5+.5*Math.sin(this.time*3+p.phase),3);
      style.setXYZW(i,profile.size*(.75+.25*Math.sin(p.phase+this.time)),opacity,profile.shape,profile.glow||0);turn.setX(i,p.phase+(profile.leaf?this.time*.9:0));
    }
    for(const a of [pos,col,style,turn])a.needsUpdate=true;
    this.geometry.setDrawRange(0,this.particles.length);this.mesh.visible=this.particles.length>0;
    this.material.uniforms.pointScale.value=(game?.renderer?.domElement?.height||720)*.65;
    this.material.uniforms.light.value=dim==='overworld'?(game.sky?.uniforms.uDay.value??.7)*.7+.3:.65;
  }
  clear(){this.particles.length=0;this.cache.clear();this.emission=0;this.scanTime=0;this.geometry.setDrawRange(0,0);this.mesh.visible=false;}
  dispose(){this.clear();this.mesh.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
