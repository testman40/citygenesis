import {Vector3,type PerspectiveCamera} from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const keys=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE']);
export function cameraInputAllowed(target:EventTarget|null){
 return !(target instanceof Element&&target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"],[role="dialog"]'));
}
/** Hold-to-move input. All motion is relative to the current camera heading. */
export class KeyboardCamera {
 private held=new Set<string>();private last=performance.now();private offset=new Vector3();
 constructor(private camera:PerspectiveCamera,private controls:OrbitControls,private manual:()=>void){
  window.addEventListener('keydown',e=>{
   if(!keys.has(e.code))return;
   if(e.ctrlKey||e.metaKey||e.altKey||e.isComposing||!cameraInputAllowed(e.target)){this.held.clear();return;}
   e.preventDefault();if(!this.held.has(e.code))this.manual();this.held.add(e.code);
  });
  window.addEventListener('keyup',e=>this.held.delete(e.code));
  window.addEventListener('blur',()=>this.held.clear());
  document.addEventListener('visibilitychange',()=>this.held.clear());
  document.addEventListener('focusin',e=>{if(!cameraInputAllowed(e.target))this.held.clear();});
 }
 update(now=performance.now()){
  const dt=Math.max(0,Math.min(.05,(now-this.last)/1000));this.last=now;
  if(document.hidden||!this.controls.enabled||!cameraInputAllowed(document.activeElement)||document.querySelector('#load-progress:not([hidden])')){this.held.clear();return;}
  if(!this.held.size)return;
  const axis=(positive:string,negative:string)=>Number(this.held.has(positive))-Number(this.held.has(negative));
  this.offset.copy(this.camera.position).sub(this.controls.target);
  const turn=axis('KeyQ','KeyE')*dt*1.2;
  if(turn){this.offset.applyAxisAngle(new Vector3(0,1,0),turn);this.camera.position.copy(this.controls.target).add(this.offset);}
  const forward=new Vector3(-this.offset.x,0,-this.offset.z).normalize(),right=new Vector3(-forward.z,0,forward.x);
  const move=forward.multiplyScalar(axis('KeyW','KeyS')).addScaledVector(right,axis('KeyD','KeyA'));
  if(move.lengthSq())move.normalize().multiplyScalar(dt*Math.max(4,Math.min(80,this.offset.length()*.35)));
  this.camera.position.add(move);this.controls.target.add(move);
 }
}
