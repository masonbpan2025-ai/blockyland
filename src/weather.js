import * as THREE from 'three';
import { markOverWater } from './waterPass.js';
import { overworldFogRange } from './atmosphere.js';
import { WeatherClock } from './weatherClock.js';
import { precipitationColumn, precipitationForBiome, weatherDimension } from './weatherRules.js';
import { WeatherVisuals } from './weatherVisuals.js';
import { AmbientParticles } from './ambientParticles.js';
import { applyLightningStrike, weatherSurfaceTick, redirectLightning } from './weatherGameplay.js';

export class WeatherManager {
  constructor(scene, sounds, {random=Math.random, particleRandom=Math.random}={}) {
    this.scene=scene;this.sounds=sounds;this.random=random;this.particleRandom=particleRandom;
    this.clock=new WeatherClock(random);this.visuals=new WeatherVisuals(scene,particleRandom);
    this.ambientParticles=new AmbientParticles(scene,{random:particleRandom});
    this.rainCount=1800;this.rainRadius=28;this.rainHeight=32;
    this.rainIntensity=0;this.windTime=0;this.enhanced=false;
    this.isFlashing=false;this.flashDuration=0;this.flashIntensity=0;
    this.lightningTimer=this.nextLightningDelay();this.endFlashTimer=20+random()*60;
    this.columns=new Map();this.surfaceTicks=0;this.audioPlaying=false;
    this.initParticles();
  }
  get weatherType(){return this.clock.type;}
  set weatherType(type){this.setWeather(type);}
  setWeather(type,seconds=null){const was=this.weatherType,result=this.clock.set(type,seconds);if(result){if(type==='thunder'&&was!=='thunder')this.lightningTimer=this.nextLightningDelay();this.previousWeather=type;}return result;}
  isRaining(){return this.clock.raining&&weatherDimension(this.game?.world)==='overworld';}
  isRainingInBiome(biome,y=22){return this.isRaining()&&precipitationForBiome(biome,y,this.game?.world)==='rain';}
  column(x,z){
    const world=this.game?.world;x=Math.floor(x);z=Math.floor(z);
    if(this.columnWorld!==world){this.columns.clear();this.columnWorld=world;}
    const key=x+','+z,chunk=world?.getChunk?.(Math.floor(x/16),Math.floor(z/16));
    const cached=this.columns.get(key);
    if(cached&&cached.chunk===chunk&&cached.revision===chunk?.weatherRevision&&this.windTime-cached.time<.25)return cached.column;
    const column=precipitationColumn(world,x,z);
    this.columns.set(key,{column,chunk,revision:chunk?.weatherRevision,time:this.windTime});
    return column;
  }
  precipitationAt(x,y,z){
    if(!this.isRaining()||y<this.column(x,z).height-1e-6)return 'none';
    const world=this.game?.world;
    return precipitationForBiome(world?.getBiome?.(Math.floor(x),Math.floor(z))??world?.selectedBiome,y,world,x,z);
  }
  isRainingAt(x,y,z){return this.precipitationAt(x,y,z)==='rain';}
  initParticles(){
    this.particles=new Float32Array(this.rainCount*3);
    this.rainPositions=new Float32Array(this.rainCount*6);this.snowPositions=new Float32Array(this.rainCount*3);
    this.rainVelocities=new Float32Array(this.rainCount);
    for(let i=0;i<this.rainCount;i++){this.resetParticle(i,false);this.rainVelocities[i]=32+this.particleRandom()*12;}
    this.rainGeometry=new THREE.BufferGeometry();this.rainGeometry.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3));
    this.rainMaterial=new THREE.LineBasicMaterial({color:0xbedcff,transparent:true,opacity:0,depthWrite:false});
    this.rainMesh=new THREE.LineSegments(this.rainGeometry,this.rainMaterial);
    this.snowGeometry=new THREE.BufferGeometry();this.snowGeometry.setAttribute('position',new THREE.BufferAttribute(this.snowPositions,3));
    this.snowMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{opacity:{value:0}},
      vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(55.0/max(1.0,-p.z),2.0,7.0);}',
      fragmentShader:'uniform float opacity;void main(){vec2 p=abs(gl_PointCoord-.5);float a=1.0-smoothstep(.15,.49,length(p));float arms=1.0-smoothstep(.04,.12,min(p.x,p.y));gl_FragColor=vec4(.95,.98,1.0,opacity*max(a,arms*.6));}'});
    this.snowMesh=new THREE.Points(this.snowGeometry,this.snowMaterial);
    for(const mesh of [this.rainMesh,this.snowMesh]){mesh.visible=false;mesh.frustumCulled=false;markOverWater(mesh);this.scene.add(mesh);}
  }
  resetParticle(i,top=true){const j=i*3;this.particles[j]=(this.particleRandom()-.5)*this.rainRadius*2;this.particles[j+1]=top?this.rainHeight/2+this.particleRandom()*4:(this.particleRandom()-.5)*this.rainHeight;this.particles[j+2]=(this.particleRandom()-.5)*this.rainRadius*2;}
  updateParticles(dt,eye){
    let rain=0,snow=0;
    for(let i=0;i<this.rainCount;i++){
      const j=i*3,p=this.particles,x=eye.x+p[j],z=eye.z+p[j+2],column=this.column(x,z);
      const kind=column.biome?precipitationForBiome(column.biome,eye.y+p[j+1],this.game?.world,x,z):column.kind;
      p[j+1]-=dt*(kind==='snow'?1.8+(i%7)*.15:this.rainVelocities[i]);
      p[j]+=dt*(kind==='snow'?Math.sin(this.windTime*.7+i)*.45:this.enhanced?.7:.15);
      if(p[j+1]<-this.rainHeight/2||Math.abs(p[j])>this.rainRadius)this.resetParticle(i);
      const wx=eye.x+p[j],wz=eye.z+p[j+2],c=this.column(wx,wz),y=eye.y+p[j+1];
      if(c.kind==='none'||y<=c.height)continue;
      const particleKind=precipitationForBiome(c.biome,y,this.game?.world,wx,wz);
      // Clip the complete streak to the roof/surface, not just its centre.
      if(particleKind==='rain'){
        const k=rain++*6,roof=Math.max(c.height,this.column(wx-.08,wz-.04).height);
        if(y<=roof){rain--;continue;}
        this.rainPositions.set([p[j],p[j+1],p[j+2],p[j]-.08,Math.max(p[j+1]-.9,roof-eye.y),p[j+2]-.04],k);
      }else{this.snowPositions.set([p[j],p[j+1],p[j+2]],snow++*3);}
    }
    this.rainGeometry.setDrawRange(0,rain*2);this.snowGeometry.setDrawRange(0,snow);
    this.rainGeometry.attributes.position.needsUpdate=true;this.snowGeometry.attributes.position.needsUpdate=true;
    this.rainMesh.position.copy(eye);this.snowMesh.position.copy(eye);
    this.rainMesh.visible=rain>0&&this.rainIntensity>.01;this.snowMesh.visible=snow>0&&this.rainIntensity>.01;
    this.rainMaterial.opacity=(this.enhanced?.38:.55)*this.rainIntensity;this.snowMaterial.uniforms.opacity.value=this.rainIntensity*.85;
  }
  nextLightningDelay(){const chunks=this.game?.world?.chunks?.size||1;return Math.max(.05,-Math.log(Math.max(1e-7,1-this.random()))/(chunks*20/100000));}
  naturalLightning(){
    const chunks=[...(this.game?.world?.chunks?.values?.()||[])];if(!chunks.length)return false;
    const c=chunks[Math.floor(this.random()*chunks.length)],x=c.cx*16+Math.floor(this.random()*16),z=c.cz*16+Math.floor(this.random()*16),column=this.column(x,z);
    if(column.kind!=='rain'||!Number.isFinite(column.height))return false;
    const strike=redirectLightning(this.game.world,new THREE.Vector3(x+.5,column.height,z+.5));
    this.triggerLightning(null,null,strike,{natural:true});return true;
  }
  triggerLightning(ambientLight,sunLight,strike=null,options={}){
    if(weatherDimension(this.game?.world)!=='overworld')return false;
    strike??=this.game?.player?.position?.clone?.()??new THREE.Vector3();
    this.visuals.strike(strike);applyLightningStrike(this.game,strike,this.random,options);
    this.isFlashing=true;this.flashDuration=.48;this.flashIntensity=1;this.sounds?.playThunder?.();return true;
  }
  triggerEndFlash(){if(!this.enhanced||weatherDimension(this.game?.world)!=='the_end')return false;this.visuals.flashEnd();this.sounds?.playEndFlash?.();return true;}
  update(dt,eye,ambientLight,sunLight,fog,background){
    dt=Math.max(0,Number.isFinite(dt)?dt:0);this.windTime+=dt;
    this.clock.advance(dt,this.game?.gamerules?.doWeatherCycle!==false);
    const dim=weatherDimension(this.game?.world),wet=this.isRaining();
    const chunkCount=this.game?.world?.chunks?.size||1;
    if(this.weatherType==='thunder'&&this.previousWeather!=='thunder')this.lightningTimer=this.nextLightningDelay();
    else if(this.previousLightningChunks&&chunkCount!==this.previousLightningChunks)this.lightningTimer*=this.previousLightningChunks/chunkCount;
    this.previousLightningChunks=chunkCount;this.previousWeather=this.weatherType;
    this.rainIntensity+=(Number(wet)-this.rainIntensity)*Math.min(1,dt*2);
    if(dim!=='overworld')this.rainIntensity=0;
    this.flashDuration=Math.max(0,this.flashDuration-dt);this.isFlashing=this.flashDuration>0&&dim==='overworld';
    const age=.48-this.flashDuration;
    this.flashIntensity=this.isFlashing&&(age<.11||age>.16&&age<.29||age>.34)?1:0;
    if(dim==='overworld'&&this.rainIntensity>.01)this.updateParticles(dt,eye);
    else this.rainMesh.visible=this.snowMesh.visible=false;
    const localKind=wet?this.precipitationAt(eye.x,eye.y,eye.z):'none';
    // Roofs muffle nearby outdoor rain; snow and dry biomes have no rain loop.
    const nearbyRain=wet&&this.column(eye.x,eye.z).kind==='rain';
    if(nearbyRain&&(!this.audioPlaying||this.sounds?.soundEnabled&&this.sounds?.ctx&&!this.sounds?.rainSource)){this.sounds?.startRainSound?.();this.audioPlaying=true;}
    if(!nearbyRain&&this.audioPlaying){this.sounds?.stopRainSound?.();this.audioPlaying=false;}
    if(this.audioPlaying)this.sounds?.setRainVolume?.(this.rainIntensity*(localKind==='rain'?1:.12));
    if(dim==='overworld'&&this.rainIntensity>.01){
      const severity=this.rainIntensity*(this.clock.thundering?1:.6);
      background?.lerp(new THREE.Color(0x48515f),severity*.55);
      if(fog&&!this.game?.isUnderwater){fog.color.copy(background??fog.color);const range=overworldFogRange(this.game?.renderDistance,this.rainIntensity);fog.near=range.near;fog.far=range.far;}
      if(ambientLight)ambientLight.intensity*=1-severity*.42;
      if(sunLight)sunLight.intensity*=1-severity*.65;
    }
    if(this.flashIntensity){if(ambientLight)ambientLight.intensity=2.2;if(sunLight)sunLight.intensity=2.5;background?.setRGB(.9,.95,1);}
    if(wet&&this.clock.thundering){this.lightningTimer-=dt;if(this.lightningTimer<=0){this.naturalLightning();this.lightningTimer=this.nextLightningDelay();}}
    if(dim==='the_end'&&this.enhanced){this.endFlashTimer-=dt;if(this.endFlashTimer<=0){this.triggerEndFlash();this.endFlashTimer=20+this.random()*60;}}
    this.visuals.update(dt,eye,dim==='the_end'&&this.enhanced);
    if(dim!=='overworld')for(const bolt of this.visuals.bolts)bolt.group.visible=false;
    if(dim==='the_end'&&background){this.endBaseBackground??=background.clone();background.copy(this.endBaseBackground);}
    else this.endBaseBackground=null;
    if(dim==='the_end'&&this.enhanced&&this.visuals.endPulse>0){background?.lerp(new THREE.Color(0x674299),this.visuals.endPulse*.45);if(ambientLight)ambientLight.intensity+=this.visuals.endPulse*.35;}
    if(wet&&dt>0){
      this.surfaceTicks+=dt*20;
      // One precipitation sample per chunk on average every 16 game ticks.
      const ticks=Math.min(20,Math.floor(this.surfaceTicks));this.surfaceTicks-=ticks;
      for(let t=0;t<ticks;t++)for(const c of this.game?.world?.chunks?.values?.()||[]){if(this.random()>=1/16)continue;
        const x=c.cx*16+Math.floor(this.random()*16),z=c.cz*16+Math.floor(this.random()*16);
        weatherSurfaceTick(this.game.world,this.column(x,z),x,z,this.random);
      }
    }else this.surfaceTicks=0;
    if(this.columns.size>12000)this.columns.clear();
    this.ambientParticles.update(dt,eye,this.game);
  }
  resetAfterSleep(){if(this.game?.gamerules?.doWeatherCycle!==false)this.clock.resetAfterSleep();}
  captureState(){return {...this.clock.snapshot(),rainIntensity:this.rainIntensity,cauldronLevels:[...(this.game?.world?.cauldronLevels||[])]};}
  restoreState(state){this.clock.restore(state);this.rainIntensity=Math.max(0,Math.min(1,Number(state.rainIntensity)||0));this.clearEffects();if(this.game?.world)this.game.world.cauldronLevels=new Map((state.cauldronLevels||[]).filter(entry=>Array.isArray(entry)&&typeof entry[0]==='string'&&Number.isInteger(entry[1])&&entry[1]>=1&&entry[1]<=3));}
  clearEffects(){this.ambientParticles.clear();if(this.endBaseBackground&&this.scene.background?.isColor)this.scene.background.copy(this.endBaseBackground);this.endBaseBackground=null;this.isFlashing=false;this.flashDuration=this.flashIntensity=0;this.visuals.dispose();this.visuals=new WeatherVisuals(this.scene,this.particleRandom);this.columns.clear();this.rainMesh.visible=this.snowMesh.visible=false;this.sounds?.stopRainSound?.();this.audioPlaying=false;}
  dispose(){this.clearEffects();this.ambientParticles.dispose();for(const mesh of [this.rainMesh,this.snowMesh]){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}}
}
