import {VEHICLE_VISUAL,ROAD_VISUAL} from '../traffic/visualConfig';
import {vehicleDiagnostic} from './VehicleFleet';
import {constrainVehicle} from './VehicleConstraint';
import * as THREE from 'three';
import type {VehiclePose} from '../traffic/Traffic';
/** Display-only models and damping; route data and simulation clocks are untouched. */
export class VehicleView {
 private geometry=new THREE.BoxGeometry(1,1,1);
 paused=false;private night=0;private lights=new THREE.InstancedMesh(this.geometry,new THREE.MeshBasicMaterial({color:'#fff0cb',toneMapped:false,transparent:true,opacity:0,depthWrite:false}),192);
 setNight(n:number){this.night=n;this.lights.visible=n>.01;(this.lights.material as THREE.MeshBasicMaterial).opacity=n;}

 readonly bodies=new THREE.InstancedMesh(this.geometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.7}),96);
 private cabins=new THREE.InstancedMesh(this.geometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.5}),192);
 private matrix=new THREE.Matrix4();private pos=new THREE.Vector3();private scale=new THREE.Vector3();private rotation=new THREE.Quaternion();private up=new THREE.Vector3(0,1,0);private color=new THREE.Color();
 private displayed:VehiclePose[]=[];private last=performance.now();
 constructor(scene:THREE.Scene){this.bodies.count=0;this.cabins.count=0;this.bodies.frustumCulled=false;this.cabins.frustumCulled=false;this.lights.count=0;this.lights.frustumCulled=false;this.lights.visible=false;scene.add(this.bodies,this.cabins,this.lights);}
 pose(id:string){return this.displayed.find(p=>p.id===id);}
 reset(){this.displayed=[];this.last=performance.now();this.bodies.count=0;this.cabins.count=0;this.lights.count=0;}
 diagnostics(){return this.displayed.map((p,i)=>({...vehicleDiagnostic(p),kind:p.kind??['car','van','truck'][i%3]}));}
 sync(poses:VehiclePose[]){
  const now=performance.now(),dt=Math.min(.1,Math.max(0,(now-this.last)/1000));this.last=now;
  this.bodies.count=Math.min(poses.length,96);this.displayed.length=this.bodies.count;let upper=0;
  for(let i=0;i<this.bodies.count;i++){
   const target=poses[i];let p=this.displayed[i];
   if(!p||p.id!==target.id||Math.hypot(p.x-target.x,p.z-target.z)>6)p={...target};
   else if(!this.paused){const move=1-Math.exp(-dt/0.06),turn=1-Math.exp(-dt/0.12);p.x+=(target.x-p.x)*move;p.z+=(target.z-p.z)*move;const angle=Math.atan2(Math.sin(target.angle-p.angle),Math.cos(target.angle-p.angle));p.angle+=angle*turn;}
   constrainVehicle(p,target);this.displayed[i]=p;this.rotation.setFromAxisAngle(this.up,p.angle);
   const kind=target.kind?['car','van','truck'].indexOf(target.kind):i%3,w=kind===0?.22:.25,l=kind===0?.40:kind===1?.49:.59,s=VEHICLE_VISUAL.carScale*(target.scale??1),y=(h:number)=>ROAD_VISUAL.surfaceY+(h-.11)*s;
   this.pos.set(p.x,y(.17),p.z);this.scale.set(w*s,.12*s,l*s);this.bodies.setMatrixAt(i,this.matrix.compose(this.pos,this.rotation,this.scale));this.bodies.setColorAt(i,this.color.set(kind===0?['#e1a070','#8fb7af','#d7c183'][Math.floor(i/3)%3]:kind===1?'#b7c5c2':'#809da1'));
   const cabin=(offset:number,y:number,cw:number,ch:number,cl:number,color:string)=>{this.pos.set(p.x+Math.sin(p.angle)*offset*s,ROAD_VISUAL.surfaceY+(y-.11)*s,p.z+Math.cos(p.angle)*offset*s);this.scale.set(cw*s,ch*s,cl*s);this.cabins.setMatrixAt(upper,this.matrix.compose(this.pos,this.rotation,this.scale));this.cabins.setColorAt(upper++,this.color.set(color));};
   for(const dx of [-.075,.075]){this.pos.set(p.x+(Math.sin(p.angle)*l*.48+Math.cos(p.angle)*dx)*s,y(.18),p.z+(Math.cos(p.angle)*l*.48-Math.sin(p.angle)*dx)*s);this.scale.set(.055*s,.045*s,.035*s);this.lights.setMatrixAt(i*2+(dx<0?0:1),this.matrix.compose(this.pos,this.rotation,this.scale));}
   if(kind===0)cabin(0,.265,.18,.08,.21,'#dbe9e8');
   else if(kind===1)cabin(-.035,.30,.21,.20,.39,i%2?'#ece5d1':'#c3d6d8');
   else{cabin(.185,.275,.23,.16,.18,'#b5d2d4');cabin(-.10,.31,.24,.24,.32,i%2?'#c7bca5':'#e1d7be');}
  }
  this.lights.count=this.bodies.count*2;this.lights.instanceMatrix.needsUpdate=true;this.cabins.count=upper;this.bodies.instanceMatrix.needsUpdate=true;this.cabins.instanceMatrix.needsUpdate=true;if(this.bodies.instanceColor)this.bodies.instanceColor.needsUpdate=true;if(this.cabins.instanceColor)this.cabins.instanceColor.needsUpdate=true;
 }
}
