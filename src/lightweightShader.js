import * as THREE from 'three';
export const SHADER_STORAGE_KEY='minecraft-lite-shader';
export function shaderTargetSize(width,height){const scale=Math.min(1,1600/Math.max(1,width),Math.sqrt(1250000/Math.max(1,width*height)));return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};}
const vertexShader='varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
export const glowFragment=`varying vec2 vUv;uniform sampler2D sceneColor,sceneDepth;uniform vec2 texel,sunUv;uniform float sunVisible;
void main(){
 vec3 bloom=vec3(0.0);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){vec3 c=texture2D(sceneColor,clamp(vUv+vec2(float(x),float(y))*texel*3.0,0.0,1.0)).rgb;bloom+=c*smoothstep(.65,1.25,max(c.r,max(c.g,c.b)))/9.0;}
 // Bounded depth-occluded screen-space approximation of volumetric sunlight.
 vec2 delta=(sunUv-vUv)/12.0,p=vUv;float shafts=0.0,decay=1.0;
 if(sunVisible>0.0)for(int i=0;i<12;i++){p+=delta;float inside=step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0);float sky=step(.9998,texture2D(sceneDepth,clamp(p,0.0,1.0)).r);shafts+=sky*decay*inside;decay*=.94;}
 float radial=exp(-length(sunUv-vUv)*3.0);
 gl_FragColor=vec4(bloom,shafts/12.0*radial*sunVisible*step(.9998,texture2D(sceneDepth,clamp(sunUv,0.0,1.0)).r));
}`;
export const compositeFragment=`varying vec2 vUv;uniform sampler2D sceneColor,sceneDepth,glow;uniform vec2 glowTexel;uniform vec3 fogColor,sunColor,eye;uniform mat4 inverseViewProjection;uniform float rain,underwater,twilight;
void main(){vec3 color=texture2D(sceneColor,vUv).rgb;vec4 light=texture2D(glow,vUv)*.4;
 light+=(texture2D(glow,vUv+vec2(glowTexel.x,0.0))+texture2D(glow,vUv-vec2(glowTexel.x,0.0))+texture2D(glow,vUv+vec2(0.0,glowTexel.y))+texture2D(glow,vUv-vec2(0.0,glowTexel.y)))*.15;
 float depth=texture2D(sceneDepth,vUv).r;
 vec4 world=inverseViewProjection*vec4(vUv*2.0-1.0,depth*2.0-1.0,1.0);world/=world.w;
 float distanceToEye=length(world.xyz-eye);float lowMist=exp(-max(world.y-eye.y,0.0)*.07);
 float fog=(1.0-exp(-distanceToEye*(.0015+rain*.003)))*lowMist*(1.0-underwater)*step(depth,.9998);
 color=mix(color,fogColor,clamp(fog,0.0,.5));
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
  this.compositeMaterial=new THREE.ShaderMaterial({vertexShader,fragmentShader:compositeFragment,depthTest:false,depthWrite:false,uniforms:{sceneColor:{value:null},sceneDepth:{value:null},glow:{value:null},glowTexel:{value:new THREE.Vector2()},fogColor:{value:new THREE.Color()},sunColor:{value:new THREE.Color()},eye:{value:new THREE.Vector3()},inverseViewProjection:{value:this.inverse},rain:{value:0},underwater:{value:0},twilight:{value:0}}});
  this.reducedMotion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  let saved=false;try{saved=this.storage?.getItem(SHADER_STORAGE_KEY)==='on';}catch{}this.setEnabled(saved,false);
 }
 bindButton(button){this.button=button;this.click=()=>this.setEnabled(!this.enabled);button?.addEventListener('click',this.click);this.updateButton();}
 updateButton(){if(this.button){this.button.textContent='Lightweight Shader: '+(this.enabled?'ON':'OFF');this.button.setAttribute('aria-pressed',String(this.enabled));}}
 setEnabled(enabled,persist=true){
  this.enabled=!!enabled;const g=this.game;
  g.renderer.shadowMap.enabled=this.enabled;g.renderer.shadowMap.autoUpdate=!this.enabled;g.renderer.shadowMap.needsUpdate=true;
  if(g.sunLight){g.sunLight.shadow.mapSize.set(1024,1024);g.sunLight.shadow.map?.dispose();g.sunLight.shadow.map=null;}
  for(const [i,light]of (g.blockLighting?.lights||[]).entries()){light.castShadow=this.enabled&&i===0;if(!light.castShadow){light.shadow.map?.dispose();light.shadow.map=null;}}
  if(g.sky?.uniforms.uEnhanced)g.sky.uniforms.uEnhanced.value=+this.enabled;
  if(g.textures?.waterUniforms?.uEnhanced)g.textures.waterUniforms.uEnhanced.value=+this.enabled;
  for(const material of [g.textures?.opaqueMaterial,g.textures?.transparentMaterial,g.textures?.lightMaterial])if(material){if(material.userData.windStrength)material.userData.windStrength.value=this.enabled&&!this.reducedMotion?1:0;material.needsUpdate=true;}
  if(g.textures?.waterMaterial)g.textures.waterMaterial.needsUpdate=true;
  if(g.weather)g.weather.enhanced=this.enabled;
  if(!this.enabled)this.releaseTargets();
  if(persist)try{this.storage?.setItem(SHADER_STORAGE_KEY,this.enabled?'on':'off');}catch{}
  this.updateButton();
 }
 releaseTargets(){if(this.targets){this.targets.scene.dispose();this.targets.glow.dispose();this.targets=null;}}
 ensureTargets(){const r=this.game.renderer;r.getDrawingBufferSize(this.size);const {width,height}=shaderTargetSize(this.size.x,this.size.y);if(this.targets?.scene.width===width&&this.targets?.scene.height===height)return;
  this.releaseTargets();const scene=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true});scene.depthTexture=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);
  const glow=new THREE.WebGLRenderTarget(Math.max(1,Math.ceil(width/4)),Math.max(1,Math.ceil(height/4)),{depthBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});this.targets={scene,glow};
  this.glowMaterial.uniforms.sceneColor.value=scene.texture;this.glowMaterial.uniforms.sceneDepth.value=scene.depthTexture;this.glowMaterial.uniforms.texel.value.set(1/width,1/height);
  const u=this.compositeMaterial.uniforms;u.sceneColor.value=scene.texture;u.sceneDepth.value=scene.depthTexture;u.glow.value=glow.texture;u.glowTexel.value.set(1/glow.width,1/glow.height);
 }
 render(dt=0){const g=this.game,r=g.renderer,c=g.camera;
  if(!this.enabled){r.setRenderTarget(null);r.clear();r.render(g.scene,c);return;}
  try{
   this.ensureTargets();this.shadowClock+=Math.min(dt,.1);if(this.shadowClock>=1/30){r.shadowMap.needsUpdate=true;this.shadowClock=0;}
   c.updateMatrixWorld();this.inverse.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse).invert();
   const sun=g.sky.sunDirection;this.sunPoint.copy(c.position).addScaledVector(sun,100).project(c);c.getWorldDirection(this.viewDirection);
   const u=this.glowMaterial.uniforms;u.sunUv.value.set(this.sunPoint.x*.5+.5,this.sunPoint.y*.5+.5);u.sunVisible.value=sun.y>-.03&&this.viewDirection.dot(sun)>.05?1:0;
   const f=this.compositeMaterial.uniforms;f.eye.value.copy(c.position);f.fogColor.value.copy(g.scene.fog?.color||g.sky.horizonColor);f.sunColor.value.copy(g.sunLight.color);f.rain.value=g.weather?.rainIntensity||0;f.underwater.value=g.isUnderwater?1:0;f.twilight.value=g.sky.uniforms.uTwilight.value;
   r.setRenderTarget(this.targets.scene);r.clear();r.render(g.scene,c);
   this.quad.material=this.glowMaterial;r.setRenderTarget(this.targets.glow);r.clear();r.render(this.quadScene,this.quadCamera);
   this.quad.material=this.compositeMaterial;r.setRenderTarget(null);r.clear();r.render(this.quadScene,this.quadCamera);
  }catch(error){this.setEnabled(false);r.setRenderTarget(null);r.clear();r.render(g.scene,c);console.warn('Lightweight shader disabled after a rendering error:',error);}
 }
 dispose(){this.button?.removeEventListener('click',this.click);this.releaseTargets();this.glowMaterial.dispose();this.compositeMaterial.dispose();this.quad.geometry.dispose();}
}
