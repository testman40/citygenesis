import * as THREE from 'three';
import {atmosphere,blendAtmosphere,type Weather,type TimePreview} from './Environment';
export class AtmosphereView {
 dayNight=true;weatherEnabled=true;weather:Weather='clear';preview:TimePreview='auto';gameTime=12;
 state=atmosphere(12);private last=performance.now();private seconds=0;private shadowTime=0;private lastShadowPosition=new THREE.Vector3();private sunTarget=new THREE.Vector3();
 readonly nightUniform={value:0};
 readonly rain:THREE.LineSegments;
 private rainPositions=new Float32Array(400*6);
 constructor(private scene:THREE.Scene,private renderer:THREE.WebGLRenderer,private sun:THREE.DirectionalLight,private ambient:THREE.HemisphereLight,private size:number){
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(this.rainPositions,3));geometry.setDrawRange(0,0);
  this.rain=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#cfdeeb',transparent:true,opacity:.3,depthWrite:false}));this.rain.frustumCulled=false;scene.add(this.rain);
 }
 resize(size:number){this.size=size;}
 update(quality:'standard'|'high',surface:THREE.MeshStandardMaterial){
  const now=performance.now(),dt=Math.min(.1,(now-this.last)/1000);this.last=now;this.seconds+=dt;
  this.state=blendAtmosphere(this.state,atmosphere(this.gameTime,this.dayNight,this.weather,this.weatherEnabled,this.preview),dt);
  const s=this.state;this.nightUniform.value=s.night;
  const color=(c:THREE.Color,v:[number,number,number])=>c.setRGB(v[0],v[1],v[2],THREE.SRGBColorSpace);
  color(this.sun.color,s.sunColor);color(this.ambient.color,s.ambientColor);this.sun.intensity=s.sun;this.ambient.intensity=s.ambient;
  const sky=new THREE.Color();color(sky,s.sky);this.renderer.setClearColor(sky);const fog=this.scene.fog as THREE.Fog;fog.color.copy(sky);fog.near=115*this.size/64;fog.far=s.fogFar*this.size/64;
  surface.roughness=.85-s.wet*.4;surface.metalness=s.wet*.04;
  // Quantized shadow motion bounds refresh cost. Light color stays continuous.
  const angle=(s.hour-12)*Math.PI/24;
  this.sunTarget.set(this.size/2-35*Math.cos(angle),Math.max(15,65-35*Math.abs(Math.sin(angle))),this.size/2-25+35*Math.sin(angle));
  this.sun.position.lerp(this.sunTarget,1-Math.exp(-dt/.7));this.shadowTime+=dt;
  if(this.shadowTime>=(quality==='high'?.5:1)&&this.sun.position.distanceToSquared(this.lastShadowPosition)>.16){
    this.shadowTime=0;this.lastShadowPosition.copy(this.sun.position);this.renderer.shadowMap.needsUpdate=true;
  }
  const count=quality==='high'?400:160;this.rain.visible=s.wet>.02;
  if(this.rain.visible){this.rain.geometry.setDrawRange(0,count*2);(this.rain.material as THREE.LineBasicMaterial).opacity=.30*s.wet;
   for(let i=0;i<count;i++){const x=((i*17.13)%this.size),z=((i*29.41)%this.size),y=9-((i*.371+this.seconds*10)%9),o=i*6;
    this.rainPositions[o]=x;this.rainPositions[o+1]=y;this.rainPositions[o+2]=z;this.rainPositions[o+3]=x+.09;this.rainPositions[o+4]=y+.45;this.rainPositions[o+5]=z;
   }this.rain.geometry.getAttribute('position').needsUpdate=true;
  }
 }
 snapshot(){return {hour:this.state.hour,night:this.state.night,wet:this.state.wet,weather:this.weather,dayNight:this.dayNight,weatherEnabled:this.weatherEnabled,rainCount:this.rain.visible?this.rain.geometry.drawRange.count/2:0};}
}
export function enableNightGlow(material:THREE.MeshStandardMaterial,night:{value:number}){
 material.onBeforeCompile=shader=>{
  shader.uniforms.uNight=night;
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vCityGlow;').replace('#include <begin_vertex>','#include <begin_vertex>\nvCityGlow=0.0;\n#ifdef USE_INSTANCING_COLOR\nvCityGlow=max(step(0.08,instanceColor.b-instanceColor.r)*step(0.05,instanceColor.g-instanceColor.r),step(0.7,instanceColor.r)*step(0.6,instanceColor.g)*(1.0-step(0.65,instanceColor.b)));\n#endif');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uNight; varying float vCityGlow;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(1.0,0.67,0.28)*vCityGlow*uNight*0.72;');
 };
 material.customProgramCacheKey=()=> 'city-night-glow-v1';
}
