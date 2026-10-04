import * as THREE from 'three';
export function squidRayDistance(m,origin,direction,maxDistance=4.5) {
  const size=m.isBaby?.5:.8,p=m.mesh.position;
  const box=new THREE.Box3(new THREE.Vector3(p.x-size/2,p.y,p.z-size/2),new THREE.Vector3(p.x+size/2,p.y+size,p.z+size/2));
  const hit=new THREE.Ray(origin,direction).intersectBox(box,new THREE.Vector3());
  const distance=hit?.distanceTo(origin);return distance!==undefined&&distance<=maxDistance?distance:Infinity;
}
