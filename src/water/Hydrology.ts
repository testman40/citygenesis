/** Independent terrain/underground network. No Three.js or resident objects. */
export const WATER = {pipeCost:2,pipeMaintenance:.01,outfallCost:700,outfallMaintenance:5,outfallCapacity:300,version:1} as const;
export interface HydrologyState {version:1; river:number[]; pipes:number[]; outfalls:number[]}
export class Hydrology {
 readonly river=new Set<number>(); readonly pipes=new Set<number>(); readonly outfalls=new Set<number>();
 private groups=new Map<number,number>(); private components=new Map<number,{water:number;sewer:number;demand:number;treatment:number;cleanCapacity:number;quality:number}>();
 readonly chunkKeys=new Set<string>(); visualRevision=0;private signature='';
 private topology=-1; revision=0; waterSupply=0; sewerSupply=0; demand=0; ratio=1; sewerRatio=1;
 discharged=0;processed=0;cleaned=0;untreated=0;treatmentRatio=1;
 readonly profile={topologyMs:0,evaluationMs:0};
 constructor(readonly size:number){}
 static riverCity(size:number){const h=new Hydrology(size);for(let z=0;z<size;z++){const centre=Math.floor(size*.7+Math.sin(z/size*Math.PI*4)*size*.025);for(let dx=-1;dx<=1;dx++)h.river.add(z*size+centre+dx);}return h;}
 neighbors(id:number){const x=id%this.size,z=Math.floor(id/this.size),a:number[]=[];if(z>0)a.push(id-this.size);if(x<this.size-1)a.push(id+1);if(z<this.size-1)a.push(id+this.size);if(x>0)a.push(id-1);return a;}
 riverside(id:number){return !this.river.has(id)&&this.neighbors(id).some(n=>this.river.has(n));}
 setPipe(id:number,value:boolean){if(!Number.isInteger(id)||id<0||id>=this.size*this.size||this.river.has(id))throw Error('管は陸地の地下に敷設してください');if(this.pipes.has(id)===value)return;value?this.pipes.add(id):this.pipes.delete(id);this.revision++;}
 private *topologySteps(){if(this.topology===this.revision)return;const start=performance.now();this.groups=new Map();this.chunkKeys.clear();let count=0;for(const id of this.pipes){if(this.groups.has(id))continue;const queue=[id];this.groups.set(id,id);for(let i=0;i<queue.length;i++){this.chunkKeys.add(Math.floor(queue[i]%this.size/16)+','+Math.floor(queue[i]/this.size/16));for(const n of this.neighbors(queue[i]))if(this.pipes.has(n)&&!this.groups.has(n)){this.groups.set(n,id);queue.push(n);}if(++count%128===0)yield;}}this.topology=this.revision;this.profile.topologyMs=performance.now()-start;}
 *distributionSteps(){yield* this.topologySteps();}
 distributionGroup(id:number){for(const n of [id,...this.neighbors(id)]){const g=this.groups.get(n);if(g!==undefined)return g;}return undefined;}
 private attachment(id:number){let selected:number|undefined,score=-1;for(const n of [id,...this.neighbors(id)]){const group=this.groups.get(n);if(group===undefined)continue;const c=this.components.get(group),s=c?Math.min(c.water,c.sewer):0;if(s>score){selected=group;score=s;}}return selected;}
 *evaluate(sources:Iterable<{id:number;capacity:number}>,outlets:Iterable<number>,buildings:Iterable<{id:number;demand:number}>,treatment?:{minimumQuality:number;plants:Iterable<{id:number;capacity:number;efficiency:number}>}){
  yield* this.topologySteps();const start=performance.now();this.components=new Map();for(const g of this.groups.values())if(!this.components.has(g))this.components.set(g,{water:0,sewer:0,demand:0,treatment:0,cleanCapacity:0,quality:1});
  // A facility touches one component: it cannot bridge disconnected networks or duplicate capacity.
  const facilityGroup=(id:number)=>{for(const n of [id,...this.neighbors(id)]){const g=this.groups.get(n);if(g!==undefined)return this.components.get(g);}return undefined;};
  this.waterSupply=0;this.sewerSupply=0;this.demand=0;let count=0;
  for(const s of sources){const g=facilityGroup(s.id);if(g){g.water+=s.capacity;this.waterSupply+=s.capacity;}}
  for(const id of outlets){const g=facilityGroup(id);if(g){g.sewer+=WATER.outfallCapacity;this.sewerSupply+=WATER.outfallCapacity;}}
  if(treatment)for(const p of treatment.plants){const g=facilityGroup(p.id);if(g){g.treatment+=p.capacity;g.cleanCapacity+=p.capacity*p.efficiency;}}
  for(const b of buildings){this.demand+=b.demand;const g=this.attachment(b.id);if(g!==undefined)this.components.get(g)!.demand+=b.demand;if(++count%128===0)yield;}
  let served=0,drained=0;this.discharged=0;this.processed=0;this.cleaned=0;for(const c of this.components.values()){const discharge=Math.min(c.demand,c.sewer),processed=Math.min(discharge,c.treatment),cleaned=c.treatment?processed*c.cleanCapacity/c.treatment:0;c.quality=treatment&&discharge?treatment.minimumQuality+(1-treatment.minimumQuality)*cleaned/discharge:1;served+=Math.min(c.demand,c.water,c.sewer)*c.quality;drained+=discharge;this.discharged+=discharge;this.processed+=processed;this.cleaned+=cleaned;}this.untreated=Math.max(0,this.discharged-this.cleaned);this.treatmentRatio=this.discharged?this.processed/this.discharged:1;
  const signature=this.revision+':'+[...this.components].map(([id,c])=>id+','+c.water+','+c.sewer+','+c.demand+','+c.treatment+','+c.cleanCapacity+','+c.quality).join(';');if(signature!==this.signature){this.signature=signature;this.visualRevision++;}
  this.ratio=this.demand?served/this.demand:1;this.sewerRatio=this.demand?drained/this.demand:1;this.profile.evaluationMs=performance.now()-start;
 }
 at(id:number){const g=this.attachment(id),c=g===undefined?undefined:this.components.get(g);return c?Math.min(1,c.water/Math.max(1,c.demand),c.sewer/Math.max(1,c.demand))*c.quality:0;}
 status(id:number){const g=this.attachment(id),c=g===undefined?undefined:this.components.get(g);return {connected:!!c,water:c?Math.min(1,c.water/Math.max(1,c.demand)):0,sewer:c?Math.min(1,c.sewer/Math.max(1,c.demand)):0};}
 treatmentAt(id:number){const g=this.attachment(id),c=g===undefined?undefined:this.components.get(g),discharged=c?Math.min(c.demand,c.sewer):0,processed=c?Math.min(discharged,c.treatment):0,cleaned=c?.treatment?processed*c.cleanCapacity/c.treatment:0;return {connected:!!c,discharged,processed,cleaned,untreated:Math.max(0,discharged-cleaned),ratio:discharged?processed/discharged:c?.treatment?1:0,quality:c?.quality??0};}
 displaySnapshot():Hydrology{return Object.assign(Object.create(Object.getPrototypeOf(this)),this);}
 get maintenance(){return this.pipes.size*WATER.pipeMaintenance+this.outfalls.size*WATER.outfallMaintenance;}
 snapshot():HydrologyState{return {version:1,river:[...this.river],pipes:[...this.pipes],outfalls:[...this.outfalls]};}
 static restore(size:number,state:HydrologyState){const h=new Hydrology(size);for(const id of state.river)h.river.add(id);for(const id of state.pipes)h.pipes.add(id);for(const id of state.outfalls)h.outfalls.add(id);h.revision++;return h;}
}
export function validateHydrology(raw:unknown,size:number,occupied:Iterable<number>):HydrologyState {
 const v=raw as HydrologyState;if(!v||v.version!==1)throw Error('未対応の上下水道バージョンです');
 const read=(a:unknown)=>{if(!Array.isArray(a)||a.length>size*size||a.some(n=>!Number.isInteger(n)||n<0||n>=size*size)||new Set(a).size!==a.length)throw Error('上下水道の座標が不正です');return [...a] as number[];};
 const state:HydrologyState={version:1,river:read(v.river),pipes:read(v.pipes),outfalls:read(v.outfalls)},river=new Set(state.river),used=new Set(occupied);const h=Hydrology.restore(size,state);
 if([...used,...state.pipes,...state.outfalls].some(id=>river.has(id))||state.outfalls.some(id=>used.has(id)||!h.riverside(id)))throw Error('河川・施設の配置が矛盾しています');
 return state;
}
