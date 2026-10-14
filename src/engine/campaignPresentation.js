import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {SightMask} from './sightMask.js';

/** Scoped visual profile over the shared engine's renderer/chunks. */
export class CampaignPresentation {
  constructor(game,camera,profile){
    this.game=game;this.profile=profile;this.sight=new SightMask(profile.sightEdge??4);this.materials=new Set();this.meshes=[];this.replacements=[];
    const renderer=game.renderer;
    this.previous={toneMapping:renderer.toneMapping,exposure:renderer.toneMappingExposure,shadowType:renderer.shadowMap.type,pixelRatio:renderer.getPixelRatio(),fog:game.scene.fog};
    this.hidden=[game.ambientLight,game.sunLight,game.moonLight,game.sky?.mesh].filter(Boolean).map(object=>[object,object.visible]);
    for(const [object]of this.hidden)object.visible=false;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=profile.exposure??1.12;
    renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.needsUpdate=true;
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio??1,1.6));game.scene.background.setHex(0);game.scene.fog=null;
    this.root=new THREE.Group();game.scene.add(this.root);
    this.root.add(new THREE.HemisphereLight(profile.hemisphere.sky,profile.hemisphere.ground,profile.hemisphere.intensity));
    this.sun=new THREE.DirectionalLight(profile.sunlight.color,profile.sunlight.intensity);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-33,right:33,top:33,bottom:-33,near:1,far:100});
    this.sun.shadow.camera.updateProjectionMatrix();this.sun.shadow.bias=-.0003;this.sun.shadow.normalBias=.035;this.sun.shadow.radius=3;this.root.add(this.sun,this.sun.target);
    this.hero=new THREE.PointLight(0xb7dfff,7,12,2);this.spell=new THREE.PointLight(0xff813d,0,9,2);this.blast=new THREE.PointLight(0xffc779,0,17,2);
    this.torches=Array.from({length:4},()=>new THREE.PointLight(0xffae62,0,13,2));this.root.add(this.hero,this.spell,this.blast,...this.torches);
    const size=renderer.getSize(new THREE.Vector2());
    const target=new THREE.WebGLRenderTarget(size.x,size.y,{type:THREE.HalfFloatType,samples:4});
    this.composer=new EffectComposer(renderer,target);this.composer.addPass(new RenderPass(game.scene,camera));this.composer.addPass(new OutputPass());
    this.size=new THREE.Vector2();this.composer.setPixelRatio(renderer.getPixelRatio());
  }
  material(options){const material=new THREE.MeshStandardMaterial({roughness:.88,metalness:.04,...options});this.sight.patch(material);this.materials.add(material);return material;}
  configureMesh(mesh){this.sight.patch(mesh.material);}
  installTerrain(tiles){
    this.clearTerrain();const map=new Map(tiles.map(t=>[`${t.x},${t.z}`,t]));
    const palette=this.profile.terrain;
    for(const chunk of this.game.world.chunks.values())for(const slot of ['opaqueMesh','transparentMesh','waterMesh','lightMesh']){
      const mesh=chunk[slot];if(!mesh)continue;
      const old=mesh.material,positions=mesh.geometry.getAttribute('position'),normals=mesh.geometry.getAttribute('normal'),colors=mesh.geometry.getAttribute('color');
      const color=new THREE.Color();
      for(let i=0;i<positions.count;i+=4){
        let x=0,y=0,z=0;for(let j=i;j<Math.min(i+4,positions.count);j++){x+=positions.getX(j);y+=positions.getY(j);z+=positions.getZ(j);}x/=4;y/=4;z/=4;
        const tile=map.get(`${Math.floor((x-normals.getX(i)*.01)/2)},${Math.floor((z-normals.getZ(i)*.01)/2)}`);if(!tile)continue;
        const base=tile.wet?((palette.lavaBiomes??[]).includes(tile.b)?palette.lava:palette.water):tile.bridge?palette.bridge:tile.road?palette.roads[tile.b]:palette.ground[tile.b];
        color.setHex(base).multiplyScalar(tile.shade??1);
        for(let j=i;j<Math.min(i+4,positions.count);j++){
          const ao=Math.max(.65,Math.min(1,(colors.getX(j)+colors.getY(j)+colors.getZ(j))/3));
          colors.setXYZ(j,color.r*ao,color.g*ao,color.b*ao);
          // Preserve fractional authored heights and align feet/contact shadows with terrain.
          const vy=positions.getY(j),voxelTop=20+Math.round(tile.h),visualTop=20+tile.h;
          if(vy>=20&& !tile.wet)positions.setY(j,vy+(visualTop-voxelTop));
        }
      }
      colors.needsUpdate=true;positions.needsUpdate=true;mesh.geometry.computeBoundingSphere();
      const material=this.material({vertexColors:true,roughness:slot==='waterMesh'?.5:.9,metalness:0});
      this.replacements.push([mesh,old,material]);mesh.material=material;mesh.castShadow=slot!=='waterMesh';mesh.receiveShadow=true;
    }
    this.makeProps(tiles);
  }
  makeProps(tiles){
    const batches=new Map(),palette=this.profile.props;
    const box=(x,y,z,w,h,d,color)=>{const key=`${Math.floor(x/32)},${Math.floor(z/32)}`;if(!batches.has(key))batches.set(key,[]);batches.get(key).push({x,y,z,w,h,d,color});};
    const noise=(x,z,salt=0)=>{let n=Math.imul(x+salt+1,374761393)^Math.imul(z+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
    for(const tile of tiles){const x=tile.x*2+1,z=tile.z*2+1,y=20+tile.h,p=palette[tile.b];
      if(!tile.wet&&!tile.block&&!tile.bridge&&noise(tile.x,tile.z)<.16)box(x+(noise(tile.x,tile.z,1)-.5)*1.5,y+.07,z+(noise(tile.x,tile.z,2)-.5)*1.5,.22,.14,.25,tile.road?0xada17c:p.debris??0x87a149);
      if(!tile.prop)continue;
      const height=2.4+noise(tile.x,tile.z,3)*2.2;
      if(tile.prop===1&&p.tree){
        box(x,y+height/2,z,.48,height,.5,p.trunk);
        for(let j=0;j<3;j++){const size=2.65-j*.62;box(x,y+height-.2+j*.66,z,size,.91,size,j===2&&p.snow?p.snow:p.leaves);}
      }else if(tile.prop===4){for(const dx of[-.65,.65])box(x+dx,y+1.4,z,.4,2.8,.6,p.cap);box(x,y+2.9,z,1.9,.35,.75,p.cap);
      }else if(tile.prop===5){for(let j=0;j<3;j++)box(x+(j-1)*.48,y+.65+j*.25,z,.35,1.3+j*.5,.45,p.crystal??0xa68ac7);
      }else if(tile.prop===6){box(x,y+.3,z,1.8,.6,1.8,p.stone);box(x,y+1.2,z,.7,1.2,.7,p.stone);box(x,y+2,z,1.25,.35,1.25,p.cap);
      }else{const h=tile.prop===2?.8+noise(tile.x,tile.z)*1.5:1.4+noise(tile.x,tile.z)*2.1;box(x,y+h/2,z,tile.prop===2?1.6:.8,h,tile.prop===2?1.5:.8,p.stone);box(x+.15,y+h+.15,z,1.1,.3,1.1,p.cap);}
    }
    this.cube=new THREE.BoxGeometry(1,1,1);const material=this.material({color:0xffffff});this.propMaterial=material;
    const dummy=new THREE.Object3D(),color=new THREE.Color();
    for(const batch of batches.values()){
      const mesh=new THREE.InstancedMesh(this.cube,material,batch.length);
      batch.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,color.setHex(b.color));});
      mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();this.root.add(mesh);this.meshes.push(mesh);
    }
  }
  update(state,follow){
    this.sight.update(state.players);this.sun.position.copy(follow).add(new THREE.Vector3(-18,30,-14));this.sun.target.position.copy(follow);
    this.hero.position.set(follow.x,follow.y+3,follow.z);
    const lights=state.lighting??{},torches=(lights.torches??[]).filter(t=>Math.hypot(t.x-follow.x,t.z-follow.z)<25).sort((a,b)=>Math.hypot(a.x-follow.x,a.z-follow.z)-Math.hypot(b.x-follow.x,b.z-follow.z));
    this.torches.forEach((light,i)=>{const t=torches[i];light.intensity=t?24:0;if(t){light.position.set(t.x,t.y+20+.3,t.z);light.color.setHex(t.color);}});
    const spell=lights.spell;this.spell.intensity=spell?.intensity??0;if(spell){this.spell.position.set(spell.x,22.3,spell.z);this.spell.color.setHex(spell.color);}
    const flash=lights.flash;this.blast.intensity=flash?100*Math.pow(flash.life/.45,2):0;if(flash)this.blast.position.set(flash.x,22.7,flash.z);
  }
  render(){const size=this.game.renderer.getSize(new THREE.Vector2());if(!size.equals(this.size)){this.size.copy(size);this.composer.setSize(size.x,size.y);}this.composer.render();}
  clearTerrain(){for(const [mesh,old,material]of this.replacements){mesh.material=old;material.dispose();this.materials.delete(material);}this.replacements=[];for(const mesh of this.meshes){mesh.removeFromParent();mesh.dispose();}this.meshes=[];this.cube?.dispose();this.cube=null;if(this.propMaterial){this.propMaterial.dispose();this.materials.delete(this.propMaterial);this.propMaterial=null;}}
  dispose(){this.clearTerrain();this.root.removeFromParent();this.sun.shadow.dispose();for(const material of this.materials)material.dispose();this.composer.passes.forEach(pass=>pass.dispose?.());this.composer.dispose();
    const renderer=this.game.renderer;renderer.toneMapping=this.previous.toneMapping;renderer.toneMappingExposure=this.previous.exposure;renderer.shadowMap.type=this.previous.shadowType;renderer.shadowMap.needsUpdate=true;renderer.setPixelRatio(this.previous.pixelRatio);this.game.scene.fog=this.previous.fog;for(const [object,visible]of this.hidden)object.visible=visible;
  }
}
