import * as THREE from 'three';
import type {City,Cell} from '../simulation/City';
import {isPublicKind,publicFacility,publicCoverage,type PublicKind} from '../services/PublicFacilities';

/** Dedicated temporary overlay; existing meshes, service calculations and saves are untouched. */
export class PublicFacilityView {
 private group=new THREE.Group();private kind:PublicKind|null=null;private hover:Cell|null=null;
 private signature='';private stamp=0;private owner:City|undefined;private pending=true;
 constructor(scene:THREE.Scene){scene.add(this.group);this.group.name='public-facility-coverage';}
 select(tool:string){this.kind=isPublicKind(tool)?tool:null;this.pending=true;if(!this.kind)this.clear();}
 point(cell:Cell|null){if(this.hover?.x===cell?.x&&this.hover?.z===cell?.z)return;this.hover=cell;this.pending=true;}
 private clear(){for(const child of [...this.group.children]){this.group.remove(child);const mesh=child as THREE.Mesh;mesh.geometry.dispose();(mesh.material as THREE.Material).dispose();if(mesh instanceof THREE.InstancedMesh)mesh.dispose();}}
 update(c:City){
  if(!this.kind||c.updating)return;const now=performance.now();if(!this.pending&&this.owner===c&&now-this.stamp<350)return;
  this.stamp=now;const force=this.pending||this.owner!==c;this.owner=c;this.pending=false;const kind=this.kind,{radius,goodRadius}=publicFacility(c,kind);
  const sources=kind==='fire'||kind==='police'?[...c.safety.stations]:kind==='park'||kind==='plaza'?c.scenerySites().map(cell=>[cell.z*c.size+cell.x,c.tile(cell).facility] as const):[...c.wellness.facilities];
  const active=sources.filter(([id,k])=>k===kind&&c.networkConnected({x:id%c.size,z:Math.floor(id/c.size)})),homes=c.residentHomes().filter(h=>publicCoverage(c,h.id,kind)<.8),signature=JSON.stringify([kind,radius,goodRadius,active,homes.map(h=>h.id)]);
  if(!force&&signature===this.signature)return;this.signature=signature;this.clear();
  const ring=(cell:Cell,preview:boolean)=>{const mesh=new THREE.Mesh(new THREE.RingGeometry(Math.max(.1,radius-.13),radius,96),new THREE.MeshBasicMaterial({color:preview?'#0F6E56':'#69baa4',transparent:true,opacity:preview?.85:.3,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(cell.x+.5,.19,cell.z+.5);mesh.renderOrder=8;mesh.userData.publicRange=preview?'preview':'existing';this.group.add(mesh);if(goodRadius<radius){const good=new THREE.Mesh(new THREE.RingGeometry(Math.max(.1,goodRadius-.09),goodRadius,64),new THREE.MeshBasicMaterial({color:'#0F6E56',transparent:true,opacity:preview?.85:.3,side:THREE.DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));good.rotation.copy(mesh.rotation);good.position.copy(mesh.position);good.renderOrder=8;this.group.add(good);}};
  for(const [id] of active)ring({x:id%c.size,z:Math.floor(id/c.size)},false);
  if(this.hover)ring(this.hover,true);
  if(homes.length){const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(.96,.035,.96),new THREE.MeshBasicMaterial({color:'#df4242',transparent:true,opacity:.65,depthTest:false,depthWrite:false,toneMapped:false}),homes.length),matrix=new THREE.Matrix4();for(const [i,h] of homes.entries()){matrix.makeTranslation(h.id%c.size+.5,.16,Math.floor(h.id/c.size)+.5);mesh.setMatrixAt(i,matrix);}mesh.renderOrder=7;mesh.frustumCulled=false;mesh.userData.publicUnserved=homes.length;this.group.add(mesh);}
 }
}
