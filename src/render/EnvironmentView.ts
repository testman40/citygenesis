import * as THREE from 'three';
import type {City} from '../simulation/City';
import type {InfoMode} from '../info/CityInformation';
/** Recolors a separate heatmap; never rebuilds city chunks for each environment tick. */
export class EnvironmentView {
 private mesh:THREE.InstancedMesh;private owner:City|undefined;private revision=-1;private mode='';private o=new THREE.Object3D();private color=new THREE.Color();
 constructor(scene:THREE.Scene){const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);this.mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide}),65536);this.mesh.frustumCulled=false;this.mesh.count=0;scene.add(this.mesh);}
 update(c:City,mode:InfoMode){if(c.updating){this.mesh.visible=false;return;}const e=c.environment,active=!!e&&['environment','air','noise'].includes(mode);this.mesh.visible=active;if(!active)return;if(this.owner===c&&this.revision===e!.revision&&this.mode===mode)return;this.owner=c;this.revision=e!.revision;this.mode=mode;let count=0;
  const add=(x:number,z:number,size:number,value:number)=>{if((value<.1&&mode!=='environment')||count>=65536)return;this.o.position.set(x,.11,z);this.o.scale.set(size,1,size);this.o.updateMatrix();this.mesh.setMatrixAt(count,this.o.matrix);this.color.set(value<=20?'#45b6a0':value<=60?'#e9bc50':'#db6461');this.mesh.setColorAt(count++,this.color);};
  if(mode==='environment'){for(const id of c.hydrology?.river??[])add(id%c.size+.5,Math.floor(id/c.size)+.5,.98,e!.at(id).water);}
  else for(let z=0;z<e!.width;z++)for(let x=0;x<e!.width;x++){const id=Math.min(c.size-1,z*e!.stride)*c.size+Math.min(c.size-1,x*e!.stride),value=e!.at(id)[mode==='air'?'air':'noise'];add(x*e!.stride+e!.stride/2,z*e!.stride+e!.stride/2,e!.stride*.98,value);}
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
 }
}
