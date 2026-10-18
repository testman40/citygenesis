import {VEHICLE_VISUAL,ROAD_VISUAL} from '../traffic/visualConfig';
import {vehicleDiagnostic} from './VehicleFleet';
import {constrainVehicle} from './VehicleConstraint';
import * as THREE from 'three';import type {VehiclePose} from '../traffic/Traffic';
/** Three shared instance batches, independent of passenger count. */
export class BusView {
 readonly body:THREE.InstancedMesh;private windows:THREE.InstancedMesh;private lights:THREE.InstancedMesh;private geometry=new THREE.BoxGeometry(1,1,1);private poses:VehiclePose[]=[];private time=performance.now();paused=false;
 private matrix=new THREE.Matrix4();private position=new THREE.Vector3();private scale=new THREE.Vector3();private rotation=new THREE.Quaternion();private up=new THREE.Vector3(0,1,0);
 constructor(scene:THREE.Scene){this.body=new THREE.InstancedMesh(this.geometry,new THREE.MeshStandardMaterial({color:'#e7ba73',roughness:.7}),24);this.windows=new THREE.InstancedMesh(this.geometry,new THREE.MeshStandardMaterial({color:'#80b5c0',roughness:.4}),72);this.lights=new THREE.InstancedMesh(this.geometry,new THREE.MeshBasicMaterial({color:'#fff1cf',toneMapped:false}),48);for(const mesh of [this.body,this.windows,this.lights]){mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);}}
 reset(){this.poses=[];this.body.count=0;this.windows.count=0;this.lights.count=0;this.time=performance.now();}
 diagnostics(){return this.poses.map(vehicleDiagnostic);}
 sync(targets:VehiclePose[],night:number){const now=performance.now(),dt=Math.min(.1,(now-this.time)/1000);this.time=now;this.body.count=Math.min(24,targets.length);this.poses.length=this.body.count;this.windows.count=this.body.count*3;this.lights.count=this.body.count*2;this.body.visible=this.body.count>0;this.windows.visible=this.body.count>0;this.lights.visible=this.body.count>0&&night>.1;
  for(let i=0;i<this.body.count;i++){const t=targets[i];let p=this.poses[i];if(!p||Math.hypot(t.x-p.x,t.z-p.z)>3)p={...t};else if(!this.paused){const move=1-Math.exp(-dt/.06),turn=1-Math.exp(-dt/.12);p.x+=(t.x-p.x)*move;p.z+=(t.z-p.z)*move;p.angle+=Math.atan2(Math.sin(t.angle-p.angle),Math.cos(t.angle-p.angle))*turn;}constrainVehicle(p,t);this.poses[i]=p;this.rotation.setFromAxisAngle(this.up,p.angle);
   const part=(mesh:THREE.InstancedMesh,index:number,dx:number,dz:number,y:number,w:number,h:number,d:number)=>{const s=VEHICLE_VISUAL.busScale*(t.scale??1);this.position.set(p.x+(Math.cos(p.angle)*dx+Math.sin(p.angle)*dz)*s,ROAD_VISUAL.surfaceY+(y-.10)*s,p.z+(-Math.sin(p.angle)*dx+Math.cos(p.angle)*dz)*s);this.scale.set(w*s,h*s,d*s);mesh.setMatrixAt(index,this.matrix.compose(this.position,this.rotation,this.scale));};
   part(this.body,i,0,0,.25,.28,.30,.76);part(this.windows,i*3,0,.32,.32,.245,.12,.02);part(this.windows,i*3+1,.142,0,.33,.015,.11,.58);part(this.windows,i*3+2,-.142,0,.33,.015,.11,.58);part(this.lights,i*2,-.08,.385,.20,.06,.05,.015);part(this.lights,i*2+1,.08,.385,.20,.06,.05,.015);
  }for(const mesh of [this.body,this.windows,this.lights])mesh.instanceMatrix.needsUpdate=true;
 }
}
