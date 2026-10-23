import * as THREE from 'three';
import { WaterPass } from './waterPass.js';
import { hideOutOfViewMobs, restoreHidden } from './entityVisibility.js';
import { hideDistantMobDetails } from './mobLod.js';
import { edgeAntialiasFunctions, edgeAntialiasFragment } from './edgeAntialiasing.js';
export const SHADER_STORAGE_KEY='minecraft-lite-shader';
// Keep normal 1080p views sharp; only larger displays downsample the world.
// Bloom remains quarter resolution and shadow budgets remain unchanged.
export function shaderTargetSize(width,height){const scale=Math.min(1,1920/Math.max(1,width),Math.sqrt(2073600/Math.max(1,width*height)));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
export const glowFragment=`varying vec2 vUv;uniform sampler2D sceneColor,sceneDepth;uniform vec2 texel,sunUv;uniform float sunVisible;
void main(){
 vec3 bloom=vec3(0.0);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
  vec2 p=clamp(vUv+vec2(float(x),float(y))*texel*3.0,0.0,1.0);vec3 c=texture2D(sceneColor,p).rgb;
  float peak=max(c.r,max(c.g,c.b)),low=min(c.r,min(c.g,c.b));
  float saturation=(peak-low)/max(peak,.001);
  // White terrain is reflective, not a lamp. Bloom the sun/sky and vivid
  // luminous colours, without spreading every snow ledge into its neighbours.
  float sky=step(.9998,texture2D(sceneDepth,p).r);
  bloom+=c*smoothstep(.8,1.3,peak)*max(sky,smoothstep(.18,.5,saturation))/9.0;
 }
 // Bounded depth-occluded screen-space approximation of volumetric sunlight.
 vec2 delta=(sunUv-vUv)/12.0,p=vUv;float shafts=0.0,decay=1.0;
 if(sunVisible>0.0)for(int i=0;i<12;i++){p+=delta;float inside=step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);float sky=step(.9998,texture2D(sceneDepth,clamp(p,0.0,1.0)).r);shafts+=sky*decay*inside;decay*=.94;}
 float radial=exp(-length(sunUv-vUv)*3.0);
 gl_FragColor=vec4(bloom,shafts/12.0*radial*sunVisible*step(.9998,texture2D(sceneDepth,clamp(sunUv,0.0,1.0)).r));
}`;
export const compositeFragment=`varying vec2 vUv;uniform sampler2D sceneColor,sceneDepth,glow;uniform vec2 glowTexel,sceneTexel;uniform vec3 fogColor,sunColor,eye,sunDirection;uniform mat4 inverseViewProjection;uniform float rain,underwater,twilight,time,waterSurfaceY,sunUp;
${edgeAntialiasFunctions}
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
// The same net of light the water surface throws on the bottom, seen from inside the water.
float caustics(vec2 p){p*=.85;float t=time*.55,c=0.0;for(int i=0;i<3;i++){float fi=float(i);vec2 q=p+vec2(sin(t+p.y*1.4+fi*2.1),cos(t*.9+p.x*1.2-fi*1.7))*.55;c+=1.0/(1.0+26.0*abs(sin(q.x*2.2+fi)*sin(q.y*2.2-fi)));p=p*1.37+vec2(1.7,-.9);}float net=smoothstep(.2,.8,c/3.0);return net*net*net;}
void main(){vec3 color=ApplyFXAA(sceneColor,sceneTexel,vUv).rgb;vec4 light=texture2D(glow,vUv)*.4;
 light+=(texture2D(glow,vUv+vec2(glowTexel.x,0.0))+texture2D(glow,vUv-vec2(glowTexel.x,0.0))+texture2D(glow,vUv+vec2(0.0,glowTexel.y))+texture2D(glow,vUv-vec2(0.0,glowTexel.y)))*.15;
 float depth=texture2D(sceneDepth,vUv).r;
 vec4 world=inverseViewProjection*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);world/=world.w;
 float distanceToEye=length(world.xyz-eye);float lowMist=exp(-max(world.y-eye.y,0.0)*.07);
 float fog=(1.0-exp(-distanceToEye*(.00015+rain*.0015)))*lowMist*(1.0-underwater)*step(depth,.9998);
 color=mix(color,fogColor,clamp(fog,0.0,.22));
 if(underwater>.5){
  // Caustics on whatever lies below the surface, fading with depth below it and with distance from the eye.
  if(depth<.9998&&world.y<waterSurfaceY-.05){float below=waterSurfaceY-world.y;color*=1.0+caustics(world.xz)*1.1*sunUp*exp(-below*.06)*exp(-distanceToEye*.05);}
  // Light shafts: six samples along the view ray, each lit where the column above it lines up with a bright patch
  // of the moving surface. Short, faded and bounded, so the cost is fixed per pixel.
  vec3 ray=normalize(world.xyz-eye);float reach=min(distanceToEye,18.0),shafts=0.0;
  for(int i=0;i<6;i++){float t=(float(i)+.5)/6.0*reach;vec3 at=eye+ray*t;if(at.y>waterSurfaceY)continue;
   vec2 q=at.xz+sunDirection.xz*(waterSurfaceY-at.y)/max(sunDirection.y,.25);
   shafts+=smoothstep(.58,.95,vnoise(q*.33+vec2(time*.07,time*.05)))*exp(-t*.075);}
  color+=sunColor*shafts/6.0*.6*sunUp;
 }
 color+=light.rgb*.19+sunColor*light.a*(.12+twilight*.1)*(1.0-rain*.8)*(1.0-underwater);
 float luma=dot(color,vec3(.2126,.7152,.0722));color=mix(vec3(luma),color,1.06);
 color*=vec3(1.025,1.005,.975);color=mix(color,color/(color+.45)*1.15,.18);
 float vignette=dot(vUv-.5,vUv-.5);color*=1.0-vignette*.12;
 gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
 #include <colorspace_fragment>
}`;
export class LightweightShader {
 constructor(game,{storage}={}){
  this.game=game;try{this.storage=storage??globalThis.localStorage;}catch{this.storage=null;}this.enabled=false;this.shadowClock=0;this.size=new THREE.Vector2();this.sunPoint=new THREE.Vector3();this.viewDirection=new THREE.Vector3();this.inverse=new THREE.Matrix4();this.targets=null;
  this.quadScene=new THREE.Scene();this.quadCamera=new THREE.Camera();this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2));this.quad.material.dispose();this.quad.frustumCulled=false;this.quadScene.add(this.quad);
  this.glowMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader:glowFragment,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},sceneDepth:{value:null},texel:{value:new THREE.Vector2()},sunUv:{value:new THREE.Vector2()},sunVisible:{value:0}}});
  this.compositeMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader:compositeFragment,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},sceneDepth:{value:null},glow:{value:null},glowTexel:{value:new THREE.Vector2()},fogColor:{value:new THREE.Color()},sunColor:{value:new THREE.Color()},eye:{value:new THREE.Vector3()},sunDirection:{value:new THREE.Vector3(0,1,0)},inverseViewProjection:{value:this.inverse},rain:{value:0},underwater:{value:0},twilight:{value:0},time:{value:0},waterSurfaceY:{value:0},sunUp:{value:0}}});
  this.compositeMaterial.uniforms.sceneTexel={value:new THREE.Vector2(1,1)};
  this.edgeAntialiasing=true;this.edgeTarget=null;
  this.edgeMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader:edgeAntialiasFragment,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},sceneTexel:{value:new THREE.Vector2(1,1)}}});
  this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  let saved=false;try{saved=this.storage?.getItem(SHADER_STORAGE_KEY)==='on';}catch{}this.setEnabled(saved,false);
 }
 bindButton(button){this.button=button;this.click=()=>this.setEnabled(!this.enabled);button?.addEventListener('click',this.click);this.updateButton();}
 updateButton(){if(this.button){this.button.textContent='Lightweight Shader: '+(this.enabled?'ON':'OFF');this.button.setAttribute('aria-pressed',String(this.enabled));}}
 setEnabled(enabled,persist=true){
  this.enabled=!!enabled;const g=this.game;
  // Shadows are refreshed per light, not all together: `updateShadows` decides which maps a frame redraws.
  g.renderer.shadowMap.enabled=this.enabled;g.renderer.shadowMap.autoUpdate=true;g.renderer.shadowMap.needsUpdate=true;
  if(g.sunLight){g.sunLight.shadow.autoUpdate=!this.enabled;g.sunLight.shadow.needsUpdate=true;}
  for(const light of (g.blockLighting?.lights||[])){light.shadow.autoUpdate=!this.enabled;light.shadow.needsUpdate=true;}
  if(g.sunLight){g.sunLight.shadow.mapSize.set(2048,2048);g.sunLight.shadow.map?.dispose();g.sunLight.shadow.map=null;}
  for(const [i,light]of (g.blockLighting?.lights||[]).entries()){light.castShadow=this.enabled&&i===0;if(!light.castShadow){light.shadow.map?.dispose();light.shadow.map=null;}}
  if(g.sky?.uniforms.uEnhanced)g.sky.uniforms.uEnhanced.value=+this.enabled;
  if(g.textures?.waterUniforms?.uEnhanced)g.textures.waterUniforms.uEnhanced.value=+this.enabled;
  for(const material of [g.textures?.opaqueMaterial,g.textures?.transparentMaterial,g.textures?.cutoutMaterial,g.textures?.lightMaterial])if(material){if(material.userData.windStrength)material.userData.windStrength.value=this.enabled&&!this.reducedMotion?1:0;material.needsUpdate=true;}
  if(g.textures?.waterMaterial)g.textures.waterMaterial.needsUpdate=true;
  if(g.weather)g.weather.enhanced=this.enabled;
  if(!this.enabled)this.releaseTargets();
  else this.releaseEdgeTarget();
  if(persist)try{this.storage?.setItem(SHADER_STORAGE_KEY,this.enabled?'on':'off');}catch{}
  this.updateButton();
 }
 releaseTargets(){if(this.targets){this.targets.scene.dispose();this.targets.glow.dispose();this.targets=null;}}
 releaseEdgeTarget(){this.edgeTarget?.dispose();this.edgeTarget=null;}
 ensureEdgeTarget(){
  const r=this.game.renderer;r.getDrawingBufferSize(this.size);
  const width=Math.max(1,Math.round(this.size.x)),height=Math.max(1,Math.round(this.size.y));
  if(this.edgeTarget?.width===width&&this.edgeTarget?.height===height)return;
  this.releaseEdgeTarget();
  this.edgeTarget=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:true});
  this.edgeMaterial.uniforms.sceneColor.value=this.edgeTarget.texture;
  this.edgeMaterial.uniforms.sceneTexel.value.set(1/width,1/height);
 }
 ensureTargets(){const r=this.game.renderer;r.getDrawingBufferSize(this.size);const {width,height}=shaderTargetSize(this.size.x,this.size.y);if(this.targets?.scene.width===width&&this.targets?.scene.height===height)return;
  this.releaseTargets();const scene=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:true});scene.depthTexture=new THREE.DepthTexture(width,height,THREE.UnsignedInt248Type);scene.depthTexture.format=THREE.DepthStencilFormat;
  const glow=new THREE.WebGLRenderTarget(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)),{depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});this.targets={scene,glow};
  this.glowMaterial.uniforms.sceneColor.value=scene.texture;this.glowMaterial.uniforms.sceneDepth.value=scene.depthTexture;this.glowMaterial.uniforms.texel.value.set(1/width,1/height);
  const u=this.compositeMaterial.uniforms;u.sceneColor.value=scene.texture;u.sceneDepth.value=scene.depthTexture;u.glow.value=glow.texture;u.glowTexel.value.set(1/glow.width,1/glow.height);u.sceneTexel.value.set(1/width,1/height);
 }
 render(dt=0){const g=this.game,r=g.renderer,c=g.camera;
  if(!this.enabled){
   if(!this.edgeAntialiasing){r.setRenderTarget(null);r.clear();this.renderWorld();return;}
   this.ensureEdgeTarget();r.setRenderTarget(this.edgeTarget);r.clear();this.renderWorld();
   this.quad.material=this.edgeMaterial;r.setRenderTarget(null);r.clear();r.render(this.quadScene,this.quadCamera);return;
  }
  try{
   this.ensureTargets();this.updateShadows(dt);
   c.updateMatrixWorld();this.inverse.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse).invert();
   const sun=g.sky.sunDirection;this.sunPoint.copy(c.position).addScaledVector(sun,100).project(c);c.getWorldDirection(this.viewDirection);
   const u=this.glowMaterial.uniforms;u.sunUv.value.set(this.sunPoint.x*.5+.5,this.sunPoint.y*.5+.5);u.sunVisible.value=sun.y>-.03&&this.viewDirection.dot(sun)>.05?1:0;
   const f=this.compositeMaterial.uniforms;f.eye.value.copy(c.position);f.fogColor.value.copy(g.scene.fog?.color||g.sky.horizonColor);f.sunColor.value.copy(g.sunLight.color);f.rain.value=g.weather?.rainIntensity||0;f.underwater.value=g.isUnderwater?1:0;f.twilight.value=g.sky.uniforms.uTwilight.value;f.time.value=g.textures?.waterUniforms?.uTime.value||0;f.sunDirection.value.copy(sun);f.waterSurfaceY.value=g.underwaterSurfaceY??c.position.y+1;f.sunUp.value=Math.max(0,Math.min(1,sun.y*3))*(1-(g.weather?.rainIntensity||0)*.7);
   r.setRenderTarget(this.targets.scene);r.clear();this.renderWorld();
   this.quad.material=this.glowMaterial;r.setRenderTarget(this.targets.glow);r.clear();r.render(this.quadScene,this.quadCamera);
   this.quad.material=this.compositeMaterial;r.setRenderTarget(null);r.clear();r.render(this.quadScene,this.quadCamera);
  }catch(error){this.setEnabled(false);r.setRenderTarget(null);r.clear();r.render(g.scene,c);console.warn('Lightweight shader disabled after a rendering error:',error);}
 }
 /**
  * Choose which shadow maps this frame redraws.
  *
  * The sun's map follows the player and the time of day, so it is redrawn 30 times a second as before. A lamp's
  * map is a cube -- six renders of the scene -- and was redrawn on the same 30 Hz clock whether anything near it
  * had moved or not. Now it is redrawn when the lamp itself moves, and otherwise four times a second, which keeps
  * a mob's shadow walking with it while spending a sixth of the work.
  */
 updateShadows(dt){const g=this.game;this.shadowClock+=Math.min(dt,.1);this.lampClock=(this.lampClock||0)+Math.min(dt,.1);
  if(this.shadowClock>=1/30){this.shadowClock=0;if(g.sunLight)g.sunLight.shadow.needsUpdate=true;}
  const lampDue=this.lampClock>=.25;if(lampDue)this.lampClock=0;
  for(const light of (g.blockLighting?.lights||[])){if(!light.castShadow||!light.visible)continue;
   const p=light.position,last=light.userData.shadowAt;
   if(lampDue||!last||last.x!==p.x||last.y!==p.y||last.z!==p.z){light.shadow.needsUpdate=true;(light.userData.shadowAt||=new THREE.Vector3()).copy(p);}}
 }
 /**
  * Draw the world into the current target, water last so it can refract what is behind it (see waterPass.js).
  * Falls back to one plain render if the water pass fails, so a driver that cannot copy a framebuffer still
  * shows the world -- the water then uses its translucent look.
  */
 renderWorld(){const g=this.game;
  // Mobs only where their terrain is drawn and short of the fog's far edge; flags restored after the frame.
  const hidden=hideOutOfViewMobs(g);
  // And, on distant mobs, the parts too small to see (mobLod.js), when the game has that switched on.
  const details=g.mobDetailLod?hideDistantMobDetails(g):[];
  try{this.renderWorldPasses();}finally{restoreHidden(details);restoreHidden(hidden);}
 }
 renderWorldPasses(){const g=this.game,r=g.renderer,c=g.camera;
  if(!this.waterPass)this.waterPass=new WaterPass();
  if(this.waterPassFailed){r.render(g.scene,c);return;}
  try{this.waterPass.render(r,g.scene,c,g.textures?.waterMaterial||null,{waterMeshes:this.waterMeshes()});}
  catch(error){this.waterPassFailed=true;console.warn('Water refraction disabled after a rendering error:',error);r.render(g.scene,c);}
 }
 /** The loaded chunks' water meshes, so the water steps are skipped on a frame with no water in view (waterPass.js). */
 *waterMeshes(){const chunks=this.game.world?.chunks;if(!chunks)return;for(const chunk of chunks.values())if(chunk.waterMesh)yield chunk.waterMesh;}
 dispose(){this.button?.removeEventListener('click',this.click);this.releaseTargets();this.releaseEdgeTarget();this.waterPass?.dispose();this.glowMaterial.dispose();this.compositeMaterial.dispose();this.edgeMaterial.dispose();this.quad.geometry.dispose();}
}
