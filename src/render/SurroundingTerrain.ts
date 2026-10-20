import * as THREE from 'three';
/** Visual ground beyond the playable map. Picking still uses City.contains(). */
export class SurroundingTerrain {
 readonly mesh:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshStandardMaterial>;
 private texture:THREE.Texture;
 constructor(scene:THREE.Scene,grass:THREE.Texture,size:number,far:number){
  this.texture=grass.clone();this.texture.needsUpdate=true;
  this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({map:this.texture,roughness:1}));
  this.mesh.name='surrounding-terrain';this.mesh.rotation.x=-Math.PI/2;this.mesh.receiveShadow=true;
  this.resize(size,far);scene.add(this.mesh);
 }
 resize(size:number,far:number){
  const extent=size+far*2;
  this.mesh.position.set(size/2,-1.62,size/2);this.mesh.scale.set(extent,extent,1);
  this.texture.repeat.set(extent/4,extent/4);
 }
}
