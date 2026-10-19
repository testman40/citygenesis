import * as THREE from 'three';
import type {City} from '../simulation/City';
import {streetPeople,streetResidents,personPose,PEOPLE_LIMIT,type StreetPerson} from '../people/StreetPeople';
export class PeopleView {
 private body:THREE.InstancedMesh;private head:THREE.InstancedMesh;private legs:THREE.InstancedMesh;
 private people:StreetPerson[]=[];private residents:ReturnType<typeof streetResidents>=[];private poses=new Map<string,{x:number;z:number;angle:number}>();private owner:City|undefined;private stamp=0;private revision=-1;private last=performance.now();private time=0;private focus={x:-100,z:-100};private matrix=new THREE.Object3D();
 constructor(scene:THREE.Scene){
  const material=new THREE.MeshStandardMaterial({roughness:.9});this.body=new THREE.InstancedMesh(new THREE.BoxGeometry(.085,.14,.065),material,PEOPLE_LIMIT);this.head=new THREE.InstancedMesh(new THREE.SphereGeometry(.045,6,4),material,PEOPLE_LIMIT);this.legs=new THREE.InstancedMesh(new THREE.BoxGeometry(.027,.10,.035),material,PEOPLE_LIMIT*2);
  for(const mesh of [this.body,this.head,this.legs]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}for(let i=0;i<PEOPLE_LIMIT;i++){this.body.setColorAt(i,new THREE.Color(['#d97a55','#488aa3','#e4bb59','#a186aa'][i%4]));this.head.setColorAt(i,new THREE.Color('#d8b99b'));this.legs.setColorAt(i*2,new THREE.Color('#354c55'));this.legs.setColorAt(i*2+1,new THREE.Color('#354c55'));}
 }
 update(city:City,focus:{x:number;z:number},distance:number,paused:boolean,visible:boolean){
  const now=performance.now(),dt=Math.min(.1,(now-this.last)/1000);this.last=now;if(!paused&&!city.updating&&!document.hidden)this.time+=dt;
  visible=visible&&distance<110;for(const mesh of [this.body,this.head,this.legs])mesh.visible=visible;if(!visible||city.updating)return;
  if(this.owner!==city||this.revision!==city.network.revision||now-this.stamp>900||Math.hypot(focus.x-this.focus.x,focus.z-this.focus.z)>3){this.owner=city;this.revision=city.network.revision;this.stamp=now;this.focus={x:focus.x,z:focus.z};this.people=streetPeople(city,focus);this.residents=streetResidents(city,focus);this.poses.clear();}
  const set=(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,angle:number,swing=0)=>{this.matrix.position.set(x,y,z);this.matrix.rotation.set(swing,angle,0);this.matrix.updateMatrix();mesh.setMatrixAt(index,this.matrix.matrix);};
  const rendered=city.residents?this.residents.flatMap(person=>{
   if(city.residents!.tracked===person.id)return [];
   const current=city.residents!.person(person.id);if(!current||current.home!==person.home)return [];const a=city.residents!.activity(city,current);if(a.mode!=='徒歩'||(!a.moving&&a.label!=='横断待ち'))return [];
   if(Math.hypot(a.x-focus.x,a.z-focus.z)>18)return [];
   if(a.crossing!==undefined)city.network.pedestrianBusy.add(a.crossing);
   const last=this.poses.get(person.id),dx=a.x-(last?.x??a.x),dz=a.z-(last?.z??a.z),angle=Math.hypot(dx,dz)>.00001?Math.atan2(dx,dz):last?.angle??0;
   this.poses.set(person.id,{x:a.x,z:a.z,angle});return [{x:a.x,z:a.z,angle,stride:a.moving&&!paused?Math.sin(this.time*9+person.household)*.45:0}];
  }):this.people.map(person=>personPose(person,this.time));
  // Waiting bus passengers remain visible even when no resident happens to be walking.
  if(city.residents)for(const person of this.people.filter(p=>p.waiting))if(rendered.length<PEOPLE_LIMIT)rendered.push(personPose(person,this.time));
  rendered.forEach((p,i)=>{set(this.body,i,p.x,.28,p.z,p.angle);set(this.head,i,p.x,.395,p.z,p.angle);for(let leg=0;leg<2;leg++){const side=leg?1:-1;set(this.legs,i*2+leg,p.x+Math.cos(p.angle)*side*.025,.17,p.z-Math.sin(p.angle)*side*.025,p.angle,p.stride*side);}});
  this.body.count=this.head.count=rendered.length;this.legs.count=rendered.length*2;for(const mesh of [this.body,this.head,this.legs])mesh.instanceMatrix.needsUpdate=true;
 }
 diagnostics(){return {visible:this.body.visible,count:this.body.count,waiting:this.people.filter(p=>p.waiting).length,time:this.time,limit:PEOPLE_LIMIT};}
}
