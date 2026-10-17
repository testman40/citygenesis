import * as THREE from 'three';
import {easeConstruction} from './Environment';
import type {Part} from './CityModules';
export class ConstructionView {
 private previous=new Map<number,string>();private active=new Map<number,{start:number;from:number;road:boolean}>();
 private completed=new Map<number,boolean>();
 private ghosts:{part:Part;start:number}[]=[];
 private mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#b7c1ae',transparent:true,opacity:.55,depthWrite:false}),64);
 private matrix=new THREE.Matrix4();private pos=new THREE.Vector3();private scale=new THREE.Vector3();private rotation=new THREE.Quaternion();private axis=new THREE.Vector3(0,1,0);
 constructor(scene:THREE.Scene){this.mesh.count=0;this.mesh.frustumCulled=false;scene.add(this.mesh);}
 reset(){this.previous.clear();this.active.clear();this.completed.clear();this.ghosts=[];this.mesh.count=0;}
 observe(id:number,key:string,level:number,road:boolean,oldParts:Part[]){
  const old=this.previous.get(id);this.previous.set(id,key);
  if(old===undefined||old===key)return;
  this.completed.delete(id);if(this.active.size>=128){const oldest=this.active.keys().next().value!;this.completed.set(oldest,this.active.get(oldest)!.road);this.active.delete(oldest);}
  if(oldParts.length&&level===0&&!road)for(const part of oldParts.filter(p=>p.owner===id&&p.shape==='mass').slice(0,3)){if(this.ghosts.length<64)this.ghosts.push({part,start:performance.now()});}
  const oldLevel=Number(old.split(':')[2])||0;
  this.active.set(id,{start:performance.now(),from:oldLevel&&level?Math.min(1.12,oldLevel/level):0,road});
 }
 factor(id:number,now:number){if(this.completed.has(id)){const road=this.completed.get(id)!;this.completed.delete(id);return {scale:1,road};}const a=this.active.get(id);if(!a)return null;const p=(now-a.start)/550;if(p>=1){this.active.delete(id);return {scale:1,road:a.road};}return {scale:easeConstruction(p,a.from),road:a.road};}
 get owners(){return [...this.completed.keys(),...this.active.keys()];}
 get animated(){return this.active.size;}
 update(){
  const now=performance.now();this.ghosts=this.ghosts.filter(g=>now-g.start<450);this.mesh.count=this.ghosts.length;
  for(let i=0;i<this.ghosts.length;i++){const {part:p,start}=this.ghosts[i],f=1-easeConstruction((now-start)/450);this.pos.set(p.x,.08+(p.y-.08)*f,p.z);this.scale.set(p.w,p.h*f,p.d);this.rotation.setFromAxisAngle(this.axis,p.angle);this.mesh.setMatrixAt(i,this.matrix.compose(this.pos,this.rotation,this.scale));}
  this.mesh.instanceMatrix.needsUpdate=true;
 }
}
