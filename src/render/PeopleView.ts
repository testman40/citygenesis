import * as THREE from 'three';
import type {City} from '../simulation/City';
import {streetPeople,personPose,PEOPLE_LIMIT,type StreetPerson} from '../people/StreetPeople';
export class PeopleView {
 private body:THREE.InstancedMesh;private head:THREE.InstancedMesh;private legs:THREE.InstancedMesh;
 private people:StreetPerson[]=[];private owner:City|undefined;private stamp=0;private last=performance.now();private time=0;private focus={x:-100,z:-100};private matrix=new THREE.Object3D();
 constructor(scene:THREE.Scene){
  const material=new THREE.MeshStandardMaterial({roughness:.9});this.body=new THREE.InstancedMesh(new THREE.BoxGeometry(.085,.14,.065),material,PEOPLE_LIMIT);this.head=new THREE.InstancedMesh(new THREE.SphereGeometry(.045,6,4),material,PEOPLE_LIMIT);this.legs=new THREE.InstancedMesh(new THREE.BoxGeometry(.027,.10,.035),material,PEOPLE_LIMIT*2);
  for(const mesh of [this.body,this.head,this.legs]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);}for(let i=0;i<PEOPLE_LIMIT;i++){this.body.setColorAt(i,new THREE.Color(['#d97a55','#488aa3','#e4bb59','#a186aa'][i%4]));this.head.setColorAt(i,new THREE.Color('#d8b99b'));this.legs.setColorAt(i*2,new THREE.Color('#354c55'));this.legs.setColorAt(i*2+1,new THREE.Color('#354c55'));}
 }
 update(city:City,focus:{x:number;z:number},distance:number,paused:boolean,visible:boolean){
  const now=performance.now(),dt=Math.min(.1,(now-this.last)/1000);this.last=now;if(!paused&&!city.updating&&!document.hidden)this.time+=dt;
  visible=visible&&distance<75;for(const mesh of [this.body,this.head,this.legs])mesh.visible=visible;if(!visible||city.updating)return;
  if(this.owner!==city||now-this.stamp>900||Math.hypot(focus.x-this.focus.x,focus.z-this.focus.z)>3){this.owner=city;this.stamp=now;this.focus={x:focus.x,z:focus.z};this.people=streetPeople(city,focus);}
  const set=(mesh:THREE.InstancedMesh,index:number,x:number,y:number,z:number,angle:number,swing=0)=>{this.matrix.position.set(x,y,z);this.matrix.rotation.set(swing,angle,0);this.matrix.updateMatrix();mesh.setMatrixAt(index,this.matrix.matrix);};
  this.people.forEach((person,i)=>{const p=personPose(person,this.time);set(this.body,i,p.x,.28,p.z,p.angle);set(this.head,i,p.x,.395,p.z,p.angle);for(let leg=0;leg<2;leg++){const side=leg?1:-1;set(this.legs,i*2+leg,p.x+Math.cos(p.angle)*side*.025,.17,p.z-Math.sin(p.angle)*side*.025,p.angle,p.stride*side);}});
  this.body.count=this.head.count=this.people.length;this.legs.count=this.people.length*2;for(const mesh of [this.body,this.head,this.legs])mesh.instanceMatrix.needsUpdate=true;
 }
 diagnostics(){return {visible:this.body.visible,count:this.body.count,waiting:this.people.filter(p=>p.waiting).length,time:this.time,limit:PEOPLE_LIMIT};}
}
