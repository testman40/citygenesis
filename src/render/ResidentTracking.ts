import * as THREE from 'three';
import type {City} from '../simulation/City';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import type {VehicleView} from './VehicleView';
export class ResidentTracking {
 private id:string|undefined;private badge:HTMLElement;private text:HTMLElement;private mark:THREE.Mesh;private line:THREE.Line;private actor=new THREE.Group();private signature='';
 constructor(scene:THREE.Scene){this.mark=new THREE.Mesh(new THREE.RingGeometry(.24,.34,24),new THREE.MeshBasicMaterial({color:'#ffd36a',side:THREE.DoubleSide,depthTest:false,depthWrite:false}));this.mark.rotation.x=-Math.PI/2;this.mark.renderOrder=40;this.mark.visible=false;this.line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:'#f5bb48',depthTest:false,transparent:true,opacity:.8}));this.line.visible=false;const body=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,.18,6),new THREE.MeshStandardMaterial({color:'#ffd36a'}));body.position.y=.29;const head=new THREE.Mesh(new THREE.SphereGeometry(.045,6,4),new THREE.MeshStandardMaterial({color:'#d8b99b'}));head.position.y=.42;this.actor.add(body,head);this.actor.visible=false;scene.add(this.mark,this.line,this.actor);this.badge=document.createElement('div');this.badge.id='resident-tracking';this.badge.hidden=true;this.text=document.createElement('span');const stop=document.createElement('button');stop.type='button';stop.textContent='追跡を停止';stop.id='resident-stop-follow';stop.onclick=()=>this.stop();this.badge.append(this.text,stop);document.getElementById('app')!.append(this.badge);}
 follow(id:string){this.id=id;this.signature='';}
 stop(){this.id=undefined;this.badge.hidden=true;this.mark.visible=this.line.visible=this.actor.visible=false;}
 update(city:City,camera:THREE.PerspectiveCamera,controls:OrbitControls,vehicles:VehicleView){
  if(city.updating)return;const r=city.residents;if(r)r.tracked=this.id;const person=this.id?r?.person(this.id):undefined;if(!person||!r){this.stop();return;}const a=r.activity(city,person),rendered=a.vehicle&&vehicles.pose(a.vehicle.id!),position=rendered??a;this.badge.hidden=false;this.text.textContent=person.name+' · '+person.group+' / '+a.label+'（'+a.mode+'）';this.mark.visible=true;this.mark.position.set(position.x,.18,position.z);this.actor.visible=a.moving&&a.mode==='徒歩';this.actor.position.set(position.x,0,position.z);
  const dx=position.x-controls.target.x,dz=position.z-controls.target.z;camera.position.x+=dx;camera.position.z+=dz;controls.target.x=position.x;controls.target.z=position.z;
  const key=a.path.join(',');if(key!==this.signature){this.signature=key;this.line.geometry.dispose();this.line.geometry=new THREE.BufferGeometry().setFromPoints(a.path.map(id=>new THREE.Vector3(id%city.size+.5,.17,Math.floor(id/city.size)+.5)));}this.line.visible=a.path.length>1;
 }
 diagnostics(){return {id:this.id??null,active:!!this.id,position:this.mark.position.toArray()};}
}
