import {Vector2} from 'three';

/** Shared world-space visibility policy; shader state stays on the client. */
export class SightMask {
  constructor(edge=4){
    this.edge=edge;this.centers=[{value:new Vector2()},{value:new Vector2()}];
    this.radii={value:new Vector2(16,16)};this.materials=new WeakSet();
  }
  update(players){
    const living=players.filter(p=>p.hp>0),visible=living.length?living:players.slice(0,1);
    const a=visible[0],b=visible[1]??a;if(!a)return;
    this.centers[0].value.set(a.x,a.z);this.centers[1].value.set(b.x,b.z);
    this.radii.value.set(a.sight,b.sight);
  }
  amount(x,z){
    const smooth=t=>t*t*(3-2*t);
    return Math.max(...this.centers.map((center,i)=>{
      const radius=i?this.radii.value.y:this.radii.value.x;
      const t=Math.max(0,Math.min(1,(center.value.distanceTo(new Vector2(x,z))-radius+this.edge)/this.edge));
      return 1-smooth(t);
    }));
  }
  patch(material){
    if(this.materials.has(material))return;this.materials.add(material);
    const original=material.onBeforeCompile,key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      original.call(material,shader,renderer);
      shader.uniforms.campaignSightA=this.centers[0];shader.uniforms.campaignSightB=this.centers[1];shader.uniforms.campaignSightRadii=this.radii;
      shader.vertexShader='varying vec2 campaignWorldXZ;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 campaignPosition=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          campaignPosition=instanceMatrix*campaignPosition;
        #endif
        campaignWorldXZ=(modelMatrix*campaignPosition).xz;`);
      shader.fragmentShader='uniform vec2 campaignSightA;\nuniform vec2 campaignSightB;\nuniform vec2 campaignSightRadii;\nvarying vec2 campaignWorldXZ;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <dithering_fragment>',`#include <dithering_fragment>
        float campaignSight=max(1.0-smoothstep(campaignSightRadii.x-${this.edge.toFixed(1)},campaignSightRadii.x,distance(campaignWorldXZ,campaignSightA)),1.0-smoothstep(campaignSightRadii.y-${this.edge.toFixed(1)},campaignSightRadii.y,distance(campaignWorldXZ,campaignSightB)));
        gl_FragColor.rgb*=campaignSight;`);
    };
    material.customProgramCacheKey=()=>key+':campaign-sight-v1';material.needsUpdate=true;
  }
}
