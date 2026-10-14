import * as THREE from 'three';

export class WeatherVisuals {
  constructor(scene,random=Math.random){this.scene=scene;this.random=random;this.bolts=[];this.endPulse=0;}
  strike(position){
    const group=new THREE.Group(),points=[];
    for(let i=0;i<=8;i++)points.push(new THREE.Vector3(i===8?0:(this.random()-.5)*3,(1-i/8)*40,i===8?0:(this.random()-.5)*3));
    const tube=(path,radius,color,opacity)=>{
      const geometry=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),path.length*2,radius,5,false);
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:THREE.AdditiveBlending});
      group.add(new THREE.Mesh(geometry,material));
    };
    tube(points,.10,0xf6fbff,1);tube(points,.24,0x8faaff,.36);
    for(let b=1;b<=3;b++){
      const p=points[b*2];tube([p,p.clone().add(new THREE.Vector3(3, -3, -2)),p.clone().add(new THREE.Vector3(6,-8,-4))],.055,0xdbe9ff,.85);
    }
    group.position.copy(position);const light=new THREE.PointLight(0xc8d9ff,22,30,1);light.position.set(0,3,0);group.add(light);this.scene.add(group);
    this.bolts.push({group,life:.48,time:0});return group;
  }
  initEnd(){
    const geometry=new THREE.SphereGeometry(400,20,12);
    const material=new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{pulse:{value:0},phase:{value:0}},
      vertexShader:'varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec3 vDirection;uniform float pulse,phase;void main(){vec3 d=normalize(vDirection);float bands=pow(max(0.0,sin(d.x*12.0+d.z*9.0+phase)*cos(d.y*8.0-phase)),4.0);gl_FragColor=vec4(vec3(.46,.22,.8)*(0.25+bands),pulse*.65);}' });
    this.endMesh=new THREE.Mesh(geometry,material);this.endMesh.renderOrder=-1;this.scene.add(this.endMesh);
  }
  flashEnd(){if(!this.endMesh)this.initEnd();this.endPulse=1;this.endMesh.material.uniforms.phase.value=this.random()*6.28;}
  update(dt,eye,end=false){
    for(let i=this.bolts.length-1;i>=0;i--){const bolt=this.bolts[i];bolt.life-=dt;bolt.time+=dt;
      bolt.group.visible=bolt.life>0&&(bolt.time<.11||bolt.time>.16&&bolt.time<.29||bolt.time>.34);
      if(bolt.life<=0){this.scene.remove(bolt.group);bolt.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});this.bolts.splice(i,1);}
    }
    this.endPulse=Math.max(0,this.endPulse-dt*1.8);
    if(this.endMesh){this.endMesh.visible=end&&this.endPulse>0;this.endMesh.position.copy(eye);this.endMesh.material.uniforms.pulse.value=this.endPulse;}
  }
  dispose(){for(const b of this.bolts){this.scene.remove(b.group);b.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}this.bolts=[];if(this.endMesh){this.endMesh.removeFromParent();this.endMesh.geometry.dispose();this.endMesh.material.dispose();}}
}
