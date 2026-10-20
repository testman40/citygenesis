import {test} from 'node:test';import assert from 'node:assert/strict';import * as THREE from 'three';import {SurroundingTerrain} from '../src/render/SurroundingTerrain';
test('map-edge ground fills the view outside every map size and stays below the playable surface',()=>{
 const scene=new THREE.Scene(),grass=new THREE.Texture(),surround=new SurroundingTerrain(scene,grass,64,600);
 const base=new THREE.Mesh(new THREE.BoxGeometry(64,1.6,64),new THREE.MeshBasicMaterial());base.position.set(32,-.81,32);scene.add(base);
 const hit=(x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObjects(scene.children)[0];
 scene.updateMatrixWorld(true);assert.equal(hit(32,32).object,base);assert.equal(hit(-20,32).object,surround.mesh);assert.ok(hit(-20,32).point.y< -1.6);
 scene.remove(base);for(const size of [64,128,256]){surround.resize(size,600*size/64);scene.updateMatrixWorld(true);for(const [x,z] of [[-500*size/64,size/2],[size+500*size/64,size/2],[size/2,-500*size/64],[size/2,size+500*size/64]])assert.equal(hit(x,z).object,surround.mesh);}
});
test('resizing surrounding ground reuses GPU objects and does not change the playable grass texture',()=>{
 const grass=new THREE.Texture();grass.repeat.set(16,16);const surround=new SurroundingTerrain(new THREE.Scene(),grass,64,600),geometry=surround.mesh.geometry,material=surround.mesh.material,map=material.map;
 for(const size of [128,256,64])surround.resize(size,600*size/64);
 assert.equal(surround.mesh.geometry,geometry);assert.equal(surround.mesh.material,material);assert.equal(surround.mesh.material.map,map);assert.notEqual(map,grass);assert.deepEqual(grass.repeat.toArray(),[16,16]);
});
