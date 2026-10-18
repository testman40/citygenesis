import {EnvironmentView} from './EnvironmentView';
import {BicycleView} from './BicycleView';
import {SignalView} from './SignalView';
import {ResidentTracking} from './ResidentTracking';
import {PeopleView} from './PeopleView';
import {BusStopMarkers,type StopPreview} from './BusStopMarkers';
import {rotorPose} from './WindMotion';
import {VEHICLE_VISUAL} from '../traffic/visualConfig';
import {VehicleFleet,VehicleClock} from './VehicleFleet';
import {prepareShaderVariants} from './ShaderPreparation';
import {PartIndex} from './PartIndex';
import {BusView} from './BusView';
import {chunkLod} from './ChunkLod';
import {ChunkQueue} from './ChunkQueue';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { City, CHUNK_SIZE, type Cell } from '../simulation/City';
import {VehicleView} from './VehicleView';
import {AtmosphereView,enableNightGlow} from './AtmosphereView';
import {ConstructionView} from './ConstructionView';
import {PostView} from './PostView';
import {createChunk,type Part,type Shape} from './CityModules';

type Batch=Shape|'marking'|'highlight';
export class CityView {
  readonly updates=new ChunkQueue();readonly updateBudget={maxChunks:8,maxMs:4};
  profileEnabled=false;readonly updateProfile={generationMs:0,instancesMs:0,observeMs:0,chunkMs:0,chunks:0,maxChunkMs:0,queueMs:0,matrixMs:0,boundsMs:0,roadMs:0,decorMs:0,otherMs:0,parts:0};
  private environmentView:EnvironmentView|undefined;
  overlay:import('../info/CityInformation').InfoMode='normal';
  quality:'standard'|'high'='standard';
  readonly environment:AtmosphereView;
  readonly construction:ConstructionView;
  readonly post=new PostView();
  readonly shaderProfile={ready:false,elapsedMs:0,error:''};private shaderPreparation:Promise<void>|null=null;
  private preparedRevision=-1;private palette=new Map<string,THREE.Color>();
  private preparedParts=new Map<string,Part[]>();private retired:THREE.InstancedMesh[]=[];
  private partIndexes=new Map<string,PartIndex>();
  private ambient=new THREE.HemisphereLight('#e6f1fb','#839b70',1.55);
  private detailMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85});
  private informationMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.62,depthWrite:false,toneMapped:false});
  private overlayMaterial=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});
  private surfaceMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.85});
  private lastAnimationShadow=0;private windPose={x:0,z:0,angle:0};private windTime=0;private lastWind=performance.now();private windBatches=new Map<string,{mesh:THREE.InstancedMesh;entries:{index:number;part:Part}[]}[]>();
  private terrain:THREE.Mesh|null=null;private terrainGrid:THREE.GridHelper|null=null;private grass:THREE.CanvasTexture|null=null;
  private gridMaterial:THREE.Material|null=null;
  private sun=new THREE.DirectionalLight('#fff0da',2.5);
  private chunkFrustum=new THREE.Frustum();private chunkProjection=new THREE.Matrix4();private chunkBox=new THREE.Box3();
  private batches=new Map<string,Map<Batch,THREE.InstancedMesh>>();
  private geometries:Record<Shape,THREE.BufferGeometry>={surface:new THREE.BoxGeometry(1,1,1),mass:new THREE.BoxGeometry(1,1,1),detail:new THREE.BoxGeometry(1,1,1),roof:new THREE.ConeGeometry(1,1,4),foliage:new THREE.IcosahedronGeometry(.5,1)};
  private fleet=new VehicleFleet();private vehicleClock=new VehicleClock();
  readonly bicycles:BicycleView;private signals:SignalView;readonly vehicles:VehicleView;readonly people:PeopleView;readonly tracking:ResidentTracking;
  readonly buses:BusView;showTrafficComparison=false;trafficSelection=0;private trafficSignature='';private trafficLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false}));private transitRevision="";private routeLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false,depthTest:false,depthWrite:false}));showBusRoutes=true;busDraft:{segments:{name:string;path:number[];valid:boolean;from?:number;to?:number}[];color:string;stops:number[];invalid?:boolean}|null=null;
  private stopMarkers=new BusStopMarkers();busStopPreview:StopPreview=null;busPicking=false;private vehicleRevision=-1;
  readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  readonly controls: OrbitControls;
  private material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .85 });
  private hover = new THREE.Mesh(new THREE.BoxGeometry(.98,.09,.98), new THREE.MeshBasicMaterial({ color: '#f2d27d', transparent:true, opacity:.42,depthTest:false,depthWrite:false,toneMapped:false }));
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private matrix = new THREE.Matrix4();
  private color = new THREE.Color();
  private position = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private up=new THREE.Vector3(0,1,0);
  private outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(.98,.035,.98)),new THREE.LineBasicMaterial({color:'#226e5b',depthTest:false,depthWrite:false,toneMapped:false}));
  constructor(public city: City, host: HTMLElement) {
    this.bicycles=new BicycleView(this.scene);this.signals=new SignalView(this.scene);this.tracking=new ResidentTracking(this.scene);this.people=new PeopleView(this.scene);this.vehicles=new VehicleView(this.scene);this.buses=new BusView(this.scene);this.scene.add(this.routeLines,this.trafficLines);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;
    this.scene.fog=new THREE.Fog('#dfeceb',115,245);
    this.renderer.setClearColor('#dfeceb');
    host.append(this.renderer.domElement);this.renderer.domElement.addEventListener('webglcontextrestored',()=>{this.renderer.shadowMap.needsUpdate=true;this.shaderPreparation=null;this.shaderProfile.ready=false;void this.prepareShaders().catch(()=>{});});
    this.scene.add(this.ambient);this.environment=new AtmosphereView(this.scene,this.renderer,this.sun,this.ambient,city.size);enableNightGlow(this.detailMaterial,this.environment.nightUniform);this.construction=new ConstructionView(this.scene);this.renderer.info.autoReset=false;
    const mid=city.size/2;this.sun.position.set(mid-35,65,mid-25);this.sun.target.position.set(mid,0,mid);this.sun.castShadow=true;
    const cam=this.sun.shadow.camera;cam.left=-48;cam.right=48;cam.top=48;cam.bottom=-48;cam.near=1;cam.far=150;
    this.sun.shadow.bias=-.0002;this.sun.shadow.normalBias=.025;this.sun.shadow.radius=3;this.scene.add(this.sun,this.sun.target);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#a6bb96';ctx.fillRect(0,0,64,64);for(let i=0;i<256;i++){ctx.fillStyle=i%2?'#a9be99':'#a3b893';ctx.fillRect((i*17)%64,(i*29)%64,2,2);}
    const grass=new THREE.CanvasTexture(canvas);grass.colorSpace=THREE.SRGBColorSpace;grass.wrapS=grass.wrapT=THREE.RepeatWrapping;grass.repeat.set(city.size/4,city.size/4);this.grass=grass;
    const ground=new THREE.MeshStandardMaterial({map:grass,roughness:1}),side=new THREE.MeshStandardMaterial({color:'#82997a',roughness:1});
    const base = new THREE.Mesh(new THREE.BoxGeometry(city.size,1.6,city.size), [side,side,ground,side,side,side]);
    this.terrain=base;base.receiveShadow=true;base.position.set(city.size/2,-.81,city.size/2); this.scene.add(base);
    const grid = new THREE.GridHelper(city.size,city.size,'#90b2a0','#83a692'); grid.position.set(city.size/2,.005,city.size/2); this.terrainGrid=grid;this.gridMaterial=grid.material as THREE.Material;(grid.material as THREE.Material).transparent=true;(grid.material as THREE.Material).opacity=.35;this.scene.add(grid);
    this.hover.renderOrder=10;this.outline.renderOrder=11;this.hover.visible=false;this.outline.visible=false; this.scene.add(this.hover,this.outline);
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    this.controls.minDistance=8; this.controls.maxDistance=145*city.size/64;
    this.controls.minPolarAngle=.15; this.controls.maxPolarAngle=Math.PI*.43;
    this.controls.enableDamping=true; this.controls.screenSpacePanning=false;
    for(let z=0;z<Math.ceil(city.size/16);z++)for(let x=0;x<Math.ceil(city.size/16);x++)city.dirty.add(x+','+z);
    if(city.size!==64)this.resizeMap();this.reset();this.setQuality('standard'); this.resize(); window.addEventListener('resize', this.resize);
    void this.prepareShaders().catch(()=>{});
    this.renderer.setAnimationLoop(()=> { this.environment.update(this.quality,this.surfaceMaterial);if(this.gridMaterial)this.gridMaterial.opacity=.35*(1-this.environment.state.night*.35);this.vehicles.setNight(this.environment.state.night);document.body.classList.toggle('night-mode',this.environment.state.night>.5);this.sync();this.retireMeshes();this.animateWind();this.animateConstruction();if(this.vehicleRevision!==this.city.network.revision){this.vehicles.reset();this.buses.reset();this.fleet.reset();this.vehicleClock.reset();this.vehicleRevision=this.city.network.revision;}if(!this.city.updating){const time=this.vehicleClock.sample(this.city.traffic.displayTime,performance.now(),this.vehicles.paused),visible=this.city.transit.operations.buses.size?this.city.transit.operations.presentation():this.fleet.update(this.city.streetVehicles(time,3),this.city.transit.vehicles(time*VEHICLE_VISUAL.timeScale,1),this.city.network.signalTime,this.city.network.pedestrianBusy);this.city.network.busyCrossings=new Set(this.city.transit.operations.buses.size?this.city.transit.operations.busyRoads():this.fleet.busyRoads());this.bicycles.sync(visible.cars.filter(p=>p.kind==='bike'));this.vehicles.sync(visible.cars.filter(p=>p.kind!=='bike'));this.buses.paused=this.vehicles.paused;this.buses.sync(visible.buses,this.environment.state.night);this.syncRoutes();this.syncTrafficComparison();} this.controls.update();this.clampCamera();this.signals.update(this.city.network,this.controls.target);(this.environmentView??=new EnvironmentView(this.scene)).update(this.city,this.overlay);this.tracking.update(this.city,this.camera,this.controls,this.vehicles,this.bicycles);this.people.update(this.city,this.controls.target,this.camera.position.distanceTo(this.controls.target),this.vehicles.paused,this.overlay==='normal');this.stopMarkers.update(this.city,this.camera,this.renderer.domElement.getBoundingClientRect(),(this.showBusRoutes||this.busPicking||this.busStopPreview!==null)&&(this.overlay==='normal'||this.overlay==='transit'),this.busDraft?.stops??[],this.busStopPreview,this.busDraft?.color??'#58d9bc');this.updateChunkVisibility(); this.renderer.info.reset();if(this.shaderProfile.ready)this.post.render(this.renderer,this.scene,this.camera,this.quality==='high'&&this.overlay==='normal',this.environment.state.night); });
  }
  prepareShaders():Promise<void>{
    if(this.shaderPreparation)return this.shaderPreparation;
    const started=performance.now(),probes=new THREE.Group();
    const entries:Array<[Shape,THREE.Material]>=[['surface',this.informationMaterial],['surface',this.surfaceMaterial],['surface',this.overlayMaterial],['mass',this.material],['detail',this.detailMaterial],['roof',this.material],['foliage',this.material]];
    for(const [shape,material] of entries){const mesh=new THREE.InstancedMesh(this.geometries[shape],material,1);mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setColorAt(0,new THREE.Color('#ffffff'));mesh.castShadow=['mass','roof','foliage'].includes(shape);mesh.receiveShadow=shape==='surface'||shape==='mass';probes.add(mesh);}
    // Existing ground, vehicles and effects have their own material variants.
    this.shaderPreparation=(async()=>{try{await prepareShaderVariants(this.renderer,probes,this.camera,this.scene);await prepareShaderVariants(this.renderer,this.scene,this.camera,this.scene);await this.post.prepareShaders(this.renderer);this.shaderProfile.ready=true;}catch(e){this.shaderProfile.error=String(e);throw e;}finally{this.shaderProfile.elapsedMs=performance.now()-started;for(const mesh of probes.children)(mesh as THREE.InstancedMesh).dispose();probes.clear();}})();
    return this.shaderPreparation;
  }
  replaceCity(city:City,prepared?:Map<string,Part[]>){this.tracking.stop();this.preparedParts=prepared??new Map();this.preparedRevision=city.network.revision;this.updates.clear();const resized=city.size!==this.city.size;for(const group of this.batches.values())for(const mesh of group.values()){this.scene.remove(mesh);this.retired.push(mesh);}this.batches.clear();this.partIndexes.clear();this.windBatches.clear();this.construction.reset();this.city=city;if(resized){this.resizeMap();this.reset();}this.vehicles.reset();this.buses.reset();this.fleet.reset();this.vehicleClock.reset();this.busStopPreview=null;this.busPicking=false;this.busDraft=null;this.transitRevision="";this.trafficSignature="";this.trafficLines.visible=false;this.routeLines.geometry.dispose();this.routeLines.geometry=new THREE.BufferGeometry();this.hover.visible=false;this.outline.visible=false;for(let z=0;z<Math.ceil(city.size/16);z++)for(let x=0;x<Math.ceil(city.size/16);x++)city.dirty.add(x+','+z);}
  private resizeMap(){const n=this.city.size;this.terrain!.geometry.dispose();this.terrain!.geometry=new THREE.BoxGeometry(n,1.6,n);this.terrain!.position.set(n/2,-.81,n/2);const old=this.terrainGrid!;this.scene.remove(old);old.geometry.dispose();const next=new THREE.GridHelper(n,n,'#90b2a0','#83a692');(next.material as THREE.Material).dispose();next.material=old.material;next.position.set(n/2,.005,n/2);this.terrainGrid=next;this.scene.add(next);this.grass!.repeat.set(n/4,n/4);this.environment.resize(n);this.controls.maxDistance=145*n/64;this.camera.far=600*n/64;this.camera.updateProjectionMatrix();this.sun.target.position.set(n/2,0,n/2);const cam=this.sun.shadow.camera,extent=Math.max(48,n*.75);cam.left=-extent;cam.right=extent;cam.top=extent;cam.bottom=-extent;cam.far=150*n/64;cam.updateProjectionMatrix();this.renderer.shadowMap.needsUpdate=true;}
  private clampCamera(){const t=this.controls.target,n=this.city.size,x=Math.max(0,Math.min(n,t.x)),z=Math.max(0,Math.min(n,t.z));this.camera.position.x+=x-t.x;this.camera.position.z+=z-t.z;t.x=x;t.z=z;}
  async prepareCity(city:City,options:{signal?:AbortSignal;onProgress?:(phase:string,value:number)=>void;profile?:{generationMs:number;maxGenerationMs:number}}={}){options.onProgress?.('シェーダーを準備',.72);await this.prepareShaders();if(options.signal?.aborted)throw new DOMException('ロードをキャンセルしました','AbortError');const parts=new Map<string,Part[]>(),count=Math.ceil(city.size/16),keys:Array<{key:string;x:number;z:number}>=[];for(let z=0;z<count;z++)for(let x=0;x<count;x++)keys.push({key:x+','+z,x,z});const x=this.controls.target.x*city.size/this.city.size,z=this.controls.target.z*city.size/this.city.size;keys.sort((a,b)=>(a.x*16+8-x)**2+(a.z*16+8-z)**2-((b.x*16+8-x)**2+(b.z*16+8-z)**2));for(const [i,c] of keys.entries()){if(options.signal?.aborted)throw new DOMException('ロードをキャンセルしました','AbortError');const started=performance.now();parts.set(c.key,createChunk(city,c.x,c.z,this.overlay,this.quality));if(options.profile){const used=performance.now()-started;options.profile.generationMs+=used;options.profile.maxGenerationMs=Math.max(options.profile.maxGenerationMs,used);}options.onProgress?.('景観を準備',.75+.2*(i+1)/keys.length);await new Promise<void>(r=>setTimeout(r,0));}return parts;}
  private updateChunkVisibility(){
    const orbit=this.camera.position.distanceTo(this.controls.target);if(this.city.size>=256){this.camera.updateMatrixWorld();this.chunkFrustum.setFromProjectionMatrix(this.chunkProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));}
    for(const [key,group] of this.batches){const [cx,cz]=key.split(',').map(Number),x=cx*16+8,z=cz*16+8;
      let visible=true;if(this.city.size>=256){this.chunkBox.min.set(x-24,-2,z-24);this.chunkBox.max.set(x+24,32,z+24);visible=this.chunkFrustum.intersectsBox(this.chunkBox);}
      const lod=chunkLod(this.city.size,this.quality,this.environment.state.night,orbit,Math.hypot(x-this.camera.position.x,z-this.camera.position.z));
      for(const [shape,mesh] of group)mesh.visible=visible&&mesh.count>0&&(shape==='detail'?lod.detail:shape==='foliage'?lod.foliage:shape==='roof'?lod.roof:true);
    }
  }
  private retireMeshes(){const start=performance.now();let n=0;while(this.retired.length&&n<8&&performance.now()-start<2){const mesh=this.retired.pop()!;mesh.userData.parts=[];mesh.dispose();n++;}}
  setOverlay(mode:typeof this.overlay){this.overlay=mode;this.preparedParts.clear();for(const key of this.batches.keys())this.city.dirty.add(key);}
  setQuality(quality:'standard'|'high'){this.quality=quality;this.preparedParts.clear();for(const key of this.batches.keys())this.city.dirty.add(key);this.renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.75:1.25));if(this.sun.shadow.map){this.sun.shadow.map.dispose();this.sun.shadow.map=null;}this.sun.shadow.mapSize.set(quality==='high'?2048:1024,quality==='high'?2048:1024);this.renderer.shadowMap.needsUpdate=true;this.resize();}
  bufferBytes(){let bytes=0;const geometries=new Set<THREE.BufferGeometry>();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Line){geometries.add(o.geometry);if(o instanceof THREE.InstancedMesh)bytes+=o.instanceMatrix.array.byteLength+(o.instanceColor?.array.byteLength??0);}});for(const g of geometries){for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;if(g.index)bytes+=g.index.array.byteLength;}return bytes;}
  setTool(tool:string){(this.hover.material as THREE.MeshBasicMaterial).color.set(tool==='erase'?'#e78168':tool==='road'?'#e1c777':'#35a989');}
  reset() {
    // Flush pending orbit/pan inertia before restoring the canonical view.
    this.controls.enableDamping=false; this.controls.update();
    this.controls.target.set(this.city.size/2,0,this.city.size/2);
    this.camera.position.set(this.city.size/2+56*this.city.size/64,76*this.city.size/64,this.city.size/2+56*this.city.size/64);
    this.controls.update(); this.controls.enableDamping=true;
  }
  focus(cell:Cell){if(!this.city.contains(cell))return;const direction=this.camera.position.clone().sub(this.controls.target).normalize();this.controls.enableDamping=false;this.controls.update();this.controls.target.set(cell.x+.5,0,cell.z+.5);this.camera.position.copy(this.controls.target).addScaledVector(direction,34);this.controls.update();this.controls.enableDamping=true;}
  resize = () => { this.camera.aspect=innerWidth/innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth,innerHeight); };
  groundPoint(x:number,y:number){const rect=this.renderer.domElement.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return null;this.camera.updateMatrixWorld(true);this.ray.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera);const p=this.ray.ray.intersectPlane(this.plane,new THREE.Vector3());return p?{x:p.x,z:p.z}:null;}
  pick(x:number,y:number,clamp=false): Cell | null {const p=this.groundPoint(x,y);if(!p)return null;const c={x:Math.floor(p.x),z:Math.floor(p.z)};if(clamp){c.x=Math.max(0,Math.min(this.city.size-1,c.x));c.z=Math.max(0,Math.min(this.city.size-1,c.z));}return this.city.contains(c)?c:null;}
  highlight(cell:Cell|null,allowed?:boolean) { if(allowed!==undefined)(this.hover.material as THREE.MeshBasicMaterial).color.set(allowed?'#35a989':'#ee645e'); this.hover.visible=!!cell;this.outline.visible=!!cell;if(cell){this.hover.position.set(cell.x+.5,.12,cell.z+.5);this.outline.position.copy(this.hover.position);} }
  /** Read-only projection used for deterministic pointer interaction tests. */
  screen(cell:Cell) { this.camera.updateMatrixWorld(true);const p=new THREE.Vector3(cell.x+.5,0,cell.z+.5).project(this.camera),rect=this.renderer.domElement.getBoundingClientRect();return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2}; }
  private syncTrafficComparison(){
    this.trafficLines.visible=this.showTrafficComparison&&(this.overlay==='normal'||this.overlay==='traffic');if(!this.trafficLines.visible)return;
    const key=this.city.traffic.solveRevision+':'+this.city.network.revision+':'+this.trafficSelection;if(key===this.trafficSignature)return;this.trafficSignature=key;
    const r=this.city.traffic.comparison()[this.trafficSelection],positions:number[]=[],colors:number[]=[];const add=(path:number[],hex:string,y:number)=>{const color=new THREE.Color(hex);for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],dx=b%this.city.size-a%this.city.size,dz=Math.floor(b/this.city.size)-Math.floor(a/this.city.size),offset=hex==='#e7a044'?-.08:.08;positions.push(a%this.city.size+.5-dz*offset,y,Math.floor(a/this.city.size)+.5+dx*offset,b%this.city.size+.5-dz*offset,y,Math.floor(b/this.city.size)+.5+dx*offset);colors.push(color.r,color.g,color.b,color.r,color.g,color.b);}};
    if(r){add(r.shortest,'#e7a044',.17);for(const l of r.paths)add(l.path,'#e366c7',.19);}
    this.trafficLines.geometry.dispose();this.trafficLines.geometry=new THREE.BufferGeometry();this.trafficLines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.trafficLines.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));this.trafficLines.geometry.computeBoundingSphere();
  }
  private syncRoutes(){
    this.routeLines.visible=this.showBusRoutes&&(this.overlay==='normal'||this.overlay==='transit');const signature=this.city.network.revision+':'+this.city.transit.revision+':'+JSON.stringify(this.busDraft);if(signature===this.transitRevision)return;this.transitRevision=signature;
    const positions:number[]=[],colors:number[]=[],size=this.city.size;
    const line=(ax:number,az:number,bx:number,bz:number,color:string)=>{positions.push(ax,.15,az,bx,.15,bz);const c=new THREE.Color(color);for(let i=0;i<2;i++)colors.push(c.r,c.g,c.b);};
    const path=(ids:number[],color:string,arrows:boolean)=>{for(let i=1;i<ids.length;i++){const a=ids[i-1],b=ids[i],dx=b%size-a%size,dz=Math.floor(b/size)-Math.floor(a/size);if(Math.abs(dx)+Math.abs(dz)!==1)continue;const ax=a%size+.5+dz*.21,az=Math.floor(a/size)+.5-dx*.21,bx=ax+dx,bz=az+dz;line(ax,az,bx,bz,color);if(arrows&&i%2===1){const x=ax+dx*.6,z=az+dz*.6;for(const side of [-1,1])line(x,z,x-dx*.13+dz*side*.08,z-dz*.13-dx*side*.08,color);}}};
    const section=(s:{path:number[];valid:boolean;from?:number;to?:number},color:string)=>{if(s.valid)path(s.path,color,true);else for(const id of new Set([s.from,s.to].filter((id):id is number=>id!==undefined))){const x=id%size+.5,z=Math.floor(id/size)+.5;line(x-.32,z-.32,x+.32,z+.32,'#ff776a');line(x-.32,z+.32,x+.32,z-.32,'#ff776a');}};
    for(const s of this.city.transit.services.values()){const managed=this.city.transit.operations.routes.get(s.route.id);if(managed){const plan=this.city.transit.operations.plan(s.route,managed,1);for(const segment of plan.segments)section(segment,managed.color);}else if(s.active)path(s.path,'#47cbe6',false);}
    if(this.busDraft){const marker=this.busDraft.invalid?'#ff776a':this.busDraft.color;for(const s of this.busDraft.segments)section(s,this.busDraft.color);for(const id of this.busDraft.stops){const x=id%size+.5,z=Math.floor(id/size)+.5;line(x-.22,z-.22,x+.22,z-.22,marker);line(x+.22,z-.22,x+.22,z+.22,marker);line(x+.22,z+.22,x-.22,z+.22,marker);line(x-.22,z+.22,x-.22,z-.22,marker);}}
    this.routeLines.geometry.dispose();this.routeLines.geometry=new THREE.BufferGeometry();this.routeLines.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.routeLines.geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));if(positions.length)this.routeLines.geometry.computeBoundingSphere();
  }
  windDiagnostics(){let rotors=0;let first:number[]|null=null;for(const batch of this.windBatches.values())for(const {mesh,entries} of batch){if(!mesh.visible)continue;rotors+=entries.length;if(!first&&entries.length){const matrix=new THREE.Matrix4();mesh.getMatrixAt(entries[0].index,matrix);first=matrix.toArray();}}return {phase:this.windTime,rotors,first};}
  private animateWind(){const now=performance.now(),delta=Math.min(100,now-this.lastWind);this.lastWind=now;if(this.city.updating||this.vehicles.paused)return;this.windTime+=delta*.0014;for(const batch of this.windBatches.values())for(const {mesh,entries} of batch){if(!mesh.visible)continue;for(const {index,part:p} of entries){const q=rotorPose(p,this.windTime,this.windPose);this.position.set(q.x,p.y,q.z);this.scale.set(p.w,p.h,p.d);this.rotation.setFromAxisAngle(this.up,q.angle);mesh.setMatrixAt(index,this.matrix.compose(this.position,this.rotation,this.scale));}mesh.instanceMatrix.needsUpdate=true;}}
  private animateConstruction(){
    const now=performance.now(),factors=new Map(this.construction.owners.map(id=>[id,this.construction.factor(id,now)]));this.construction.update();
    if(!factors.size)return;
    const affected=new Set<string>();for(const id of factors.keys())affected.add(Math.floor(id%this.city.size/16)+','+Math.floor(id/this.city.size/16));
    for(const key of affected)for(const [shape,mesh] of this.batches.get(key)?.entries()??[]){let changed=false;const entries=mesh.userData.parts as Part[];
      for(let i=0;i<entries.length;i++){const p=entries[i],f=factors.get(p.owner);if(!f||((shape==='surface'||shape==='marking')&&!f.road))continue;
        const pose=p.rotor?rotorPose(p,this.windTime,this.windPose):p;this.position.set(pose.x,f.road?p.y:.08+(p.y-.08)*f.scale,pose.z);this.scale.set(p.w*(f.road?f.scale:1),p.h*(f.road?1:f.scale),p.d*(f.road?f.scale:1));this.rotation.setFromAxisAngle(this.up,pose.angle);mesh.setMatrixAt(i,this.matrix.compose(this.position,this.rotation,this.scale));changed=true;
      }if(changed)mesh.instanceMatrix.needsUpdate=true;
    }
    if(now-this.lastAnimationShadow>(this.quality==='high'?150:550)){this.lastAnimationShadow=now;this.renderer.shadowMap.needsUpdate=true;}
  }
  private sync() {
    if(this.city.updating||!this.shaderProfile.ready)return;
    if(this.preparedRevision!==this.city.network.revision){this.preparedParts.clear();this.preparedRevision=this.city.network.revision;}
    this.updates.enqueue(this.city.dirty);this.city.dirty.clear();if(!this.updates.size)return;
    const frameStart=performance.now();let processed=0;
    while(this.updates.size&&processed<this.updateBudget.maxChunks&&(processed===0||performance.now()-frameStart<this.updateBudget.maxMs)){
      const queued=this.profileEnabled?performance.now():0;const key=this.updates.take(this.controls.target.x,this.controls.target.z)!;processed++;if(this.profileEnabled)this.updateProfile.queueMs+=performance.now()-queued;
      const started=this.profileEnabled?performance.now():0;
      const [cx,cz]=key.split(',').map(Number),parts=this.preparedParts.get(key)??createChunk(this.city,cx,cz,this.overlay,this.quality,this.profileEnabled?this.updateProfile:undefined);this.preparedParts.delete(key);
      const generated=this.profileEnabled?performance.now():0;if(this.profileEnabled)this.updateProfile.generationMs+=generated-started;
      const old=this.partIndexes.get(key);
      for(let z=cz*16;z<Math.min(this.city.size,(cz+1)*16);z++)for(let x=cx*16;x<Math.min(this.city.size,(cx+1)*16);x++){const t=this.city.tile({x,z});this.construction.observe(z*this.city.size+x,[t.road?1:0,t.zone??t.facility??'',t.level].join(':'),t.level,t.road,old?.get(z*this.city.size+x)??[]);}
      const observed=this.profileEnabled?performance.now():0;if(this.profileEnabled)this.updateProfile.observeMs+=observed-generated;
      this.partIndexes.set(key,new PartIndex(parts));
      let group=this.batches.get(key);if(!group){group=new Map();this.batches.set(key,group);}
      const wind:{mesh:THREE.InstancedMesh;entries:{index:number;part:Part}[]}[]=[];this.windBatches.delete(key);
      for(const shape of ['surface','mass','detail','roof','foliage','marking','highlight'] as Batch[]){
        const entries=parts.filter(p=>shape==='highlight'?p.highlight:!p.highlight&&(shape==='marking'?p.unlit:p.shape===shape&&!p.unlit));let mesh=group.get(shape);
        if(mesh&&mesh.instanceMatrix.count<entries.length){this.scene.remove(mesh);mesh.dispose();group.delete(shape);mesh=undefined;}
        if(!mesh&&entries.length){mesh=new THREE.InstancedMesh(this.geometries[shape==='marking'||shape==='highlight'?'surface':shape],shape==='highlight'?this.informationMaterial:shape==='marking'?this.overlayMaterial:shape==='surface'?(this.overlay==='normal'?this.surfaceMaterial:this.overlayMaterial):shape==='detail'?this.detailMaterial:this.material,Math.max(32,Math.ceil(entries.length/32)*32));mesh.castShadow=['mass','roof','foliage'].includes(shape);mesh.receiveShadow=shape==='surface'||shape==='mass';group.set(shape,mesh);this.scene.add(mesh);}
        if(!mesh)continue;mesh.material=shape==='highlight'?this.informationMaterial:shape==='marking'?this.overlayMaterial:shape==='surface'?(this.overlay==='normal'?this.surfaceMaterial:this.overlayMaterial):shape==='detail'?this.detailMaterial:this.material;mesh.userData.parts=entries;const rotors:{part:Part;index:number}[]=[];for(let index=0;index<entries.length;index++)if(entries[index].rotor)rotors.push({part:entries[index],index});if(rotors.length)wind.push({mesh,entries:rotors});mesh.renderOrder=shape==='highlight'?3:0;mesh.count=entries.length;mesh.visible=entries.length>0;
        const matrices=this.profileEnabled?performance.now():0;for(let i=0;i<entries.length;i++){const p=entries[i];if(p.angle===0)this.matrix.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z);else{this.position.set(p.x,p.y,p.z);this.scale.set(p.w,p.h,p.d);this.rotation.setFromAxisAngle(this.up,p.angle);this.matrix.compose(this.position,this.rotation,this.scale);}mesh.setMatrixAt(i,this.matrix);let tint=this.palette.get(p.color);if(!tint){tint=new THREE.Color(p.color);this.palette.set(p.color,tint);}mesh.setColorAt(i,tint);}
        mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;if(this.profileEnabled)this.updateProfile.matrixMs+=performance.now()-matrices;const bound=this.profileEnabled?performance.now():0;mesh.computeBoundingSphere();if(rotors.length&&mesh.boundingSphere)mesh.boundingSphere.radius+=.5;if(this.profileEnabled)this.updateProfile.boundsMs+=performance.now()-bound;
      }
      if(wind.length)this.windBatches.set(key,wind);
      if(this.profileEnabled){const ended=performance.now(),elapsed=ended-started;this.updateProfile.instancesMs+=ended-observed;this.updateProfile.chunkMs+=elapsed;this.updateProfile.chunks++;this.updateProfile.maxChunkMs=Math.max(this.updateProfile.maxChunkMs,elapsed);}
    }
    this.renderer.shadowMap.needsUpdate=true;
  }
}