import * as THREE from 'three';import type {RoadNetwork} from '../simulation/RoadNetwork';
export class SignalView {
 private lights:THREE.InstancedMesh;private o=new THREE.Object3D();private color=new THREE.Color();
 constructor(scene:THREE.Scene){this.lights=new THREE.InstancedMesh(new THREE.SphereGeometry(.035,5,4),new THREE.MeshBasicMaterial(),256);this.lights.frustumCulled=false;this.lights.count=0;scene.add(this.lights);}
 update(g:RoadNetwork,focus:{x:number;z:number}){let count=0;const phase=((g.signalTime%8)+8)%8;for(const id of g.ids()){if(count>=254)break;if(g.adjacent(id).length<3&&!g.crossings.has(id))continue;const x=id%g.size,z=Math.floor(id/g.size);if(Math.hypot(x-focus.x,z-focus.z)>24)continue;for(let axis=0;axis<2;axis++){const green=axis===0?phase<2.8:phase>=3.3&&phase<6.1;this.o.position.set(x+(axis?.85:.15),.67,z+.15);this.o.updateMatrix();this.lights.setMatrixAt(count,this.o.matrix);this.lights.setColorAt(count++,this.color.set(green?'#63e29c':'#ec6555'));}}this.lights.count=count;this.lights.instanceMatrix.needsUpdate=true;if(this.lights.instanceColor)this.lights.instanceColor.needsUpdate=true;}
}
