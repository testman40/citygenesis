import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
/** One bounded render target and one screen pass; no duplicate normal/depth scene pass. */
export class PostView {
 enabled=true;private target:THREE.WebGLRenderTarget|null=null;
 private material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{image:{value:null},depth:{value:null},pixel:{value:new THREE.Vector2()},night:{value:0}},vertexShader:'varying vec2 uvScreen;void main(){uvScreen=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
 uniform sampler2D image;uniform sampler2D depth;uniform vec2 pixel;uniform float night;varying vec2 uvScreen;
 void main(){
  vec3 color=texture2D(image,uvScreen).rgb;float center=texture2D(depth,uvScreen).r;float occlusion=0.;vec3 halo=vec3(0.);
  for(int i=0;i<2;i++){vec2 offset=i==0?vec2(2.,0.):i==1?vec2(-2.,0.):i==2?vec2(0.,2.):vec2(0.,-2.);vec2 p=uvScreen+offset*pixel;float neighbor=texture2D(depth,p).r;occlusion+=smoothstep(.00005,.002,max(0.,center-neighbor));halo+=max(vec3(0.),texture2D(image,p).rgb-vec3(.72));}
  color*=1.-occlusion*.025;color+=halo*night*.035;color=mix(vec3(dot(color,vec3(.2126,.7152,.0722))),color,1.015);gl_FragColor=vec4(max(color,vec3(0.)),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`});
 private quad=new FullScreenQuad(this.material);
 async prepareShaders(renderer:THREE.WebGLRenderer){const geometry=new THREE.PlaneGeometry(2,2),probe=new THREE.Mesh(geometry,this.material),scene=new THREE.Scene();scene.add(probe);try{await renderer.compileAsync(scene,new THREE.Camera());}finally{geometry.dispose();scene.clear();}}
 render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.Camera,active:boolean,night:number){
  if(!active||!this.enabled){this.disposeTarget();renderer.render(scene,camera);return;}
  const w=Math.min(1280,Math.round(innerWidth*renderer.getPixelRatio())),h=Math.round(w*innerHeight/innerWidth);
  if(!this.target){this.target=new THREE.WebGLRenderTarget(w,h,{depthTexture:new THREE.DepthTexture(w,h)});}
  else if(this.target.width!==w||this.target.height!==h)this.target.setSize(w,h);
  this.material.uniforms.image.value=this.target.texture;this.material.uniforms.depth.value=this.target.depthTexture;this.material.uniforms.pixel.value.set(1/w,1/h);this.material.uniforms.night.value=night;
  renderer.setRenderTarget(this.target);renderer.render(scene,camera);renderer.setRenderTarget(null);this.quad.render(renderer);
 }
 disposeTarget(){if(this.target){this.target.dispose();this.target=null;}}
 snapshot(){return {active:!!this.target,pixels:this.target?this.target.width*this.target.height:0};}
}
