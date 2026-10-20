import * as THREE from 'three';
import type {City} from '../simulation/City';
import type {InfoMode} from '../info/CityInformation';
import {landValueAt,landRevision} from '../urban/LandValue';
/** Recolors a separate heatmap; never rebuilds city chunks for each environment tick. */
export class EnvironmentView {
 private mesh:THREE.InstancedMesh;private owner:City|undefined;private revision='';private mode='';private stamp=0;private o=new THREE.Object3D();private color=new THREE.Color();
 constructor(scene:THREE.Scene){const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);this.mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:.48,depthWrite:false,side:THREE.DoubleSide}),65536);this.mesh.frustumCulled=false;this.mesh.count=0;scene.add(this.mesh);}
 update(c:City,mode:InfoMode){if(c.updating){this.mesh.visible=false;return;}const e=c.environment,land=mode==='landValue',active=land||!!e&&['environment','air','noise'].includes(mode);this.mesh.visible=active;if(!active)return;const revision=land?landRevision(c):String(e!.revision),now=performance.now();if(this.owner===c&&this.mode===mode&&(this.revision===revision||now-this.stamp<400))return;this.owner=c;this.revision=revision;this.mode=mode;this.stamp=now;let count=0;
  const add=(x:number,z:number,size:number,value:number)=>{if((value<.1&&mode!=='environment'&&!land)||count>=65536)return;this.o.position.set(x,.11,z);this.o.scale.set(size,1,size);this.o.updateMatrix();this.mesh.setMatrixAt(count,this.o.matrix);this.color.set(land?(value<35?'#d85a4c':value<60?'#e9bc50':'#3b995b'):value<=20?'#45b6a0':value<=60?'#e9bc50':'#db6461');this.mesh.setColorAt(count++,this.color);};
  if(land){const stride=c.size>=128?4:2;for(let z=0;z<c.size;z+=stride)for(let x=0;x<c.size;x+=stride){const id=Math.min(c.size-1,z+Math.floor(stride/2))*c.size+Math.min(c.size-1,x+Math.floor(stride/2));if(c.hydrology?.river.has(id))continue;add(x+stride/2,z+stride/2,stride*.98,landValueAt(c,id).value);}}
  else if(mode==='environment'){for(const id of c.hydrology?.river??[])add(id%c.size+.5,Math.floor(id/c.size)+.5,.98,e!.at(id).water);}
  else for(let z=0;z<e!.width;z++)for(let x=0;x<e!.width;x++){const id=Math.min(c.size-1,z*e!.stride)*c.size+Math.min(c.size-1,x*e!.stride),value=e!.at(id)[mode==='air'?'air':'noise'];add(x*e!.stride+e!.stride/2,z*e!.stride+e!.stride/2,e!.stride*.98,value);}
  this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;if(this.mesh.instanceColor)this.mesh.instanceColor.needsUpdate=true;
 }
}
