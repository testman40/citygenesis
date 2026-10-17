import * as THREE from 'three';
/** Prepare both output variants without changing the render target across an await. */
export async function prepareShaderVariants(renderer:THREE.WebGLRenderer,objects:THREE.Object3D,camera:THREE.Camera,scene:THREE.Scene){
 const target=new THREE.WebGLRenderTarget(1,1),previous=renderer.getRenderTarget();
 try{
  renderer.setRenderTarget(null);const direct=renderer.compileAsync(objects,camera,scene);renderer.setRenderTarget(previous);await direct;
  renderer.setRenderTarget(target);const offscreen=renderer.compileAsync(objects,camera,scene);renderer.setRenderTarget(previous);await offscreen;
 }finally{renderer.setRenderTarget(previous);target.dispose();}
}
