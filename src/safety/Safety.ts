import {roadTimeField} from '../services/Reach';
import {Pathfinder} from '../traffic/Pathfinder';

import type {RoadNetwork} from '../simulation/RoadNetwork';
import type {Traffic} from '../traffic/Traffic';
import type {Zone} from '../simulation/City';
export type ServiceKind='fire'|'police';
import {SAFETY_CONFIG,type SafetyConfig} from './config';
export {SAFETY_CONFIG,type SafetyConfig} from './config';
export interface SafetyState {version:1;enabled:boolean;config:SafetyConfig;stations:{id:number;kind:ServiceKind}[]}
export interface SafetyBuilding {id:number;zone:Zone;level:number}
export interface ServiceResult {fire:number;police:number;fireMinutes:number|null;policeMinutes:number|null;fireRisk:number;crimeRisk:number}
export class Safety {
 budget={fire:1,police:1};funding={fire:1,police:1};
 readonly stations=new Map<number,ServiceKind>();enabled=false;readonly config:SafetyConfig;
 readonly results=new Map<number,ServiceResult>();
 private fireCapacityRatio=0;private policeCapacityRatio=0;
 fireCoverage=0;policeCoverage=0;fireRisk=0;crimeRisk=0;fireMinutes:number|null=null;policeMinutes:number|null=null;
 readonly profile={workMs:0,expanded:0,rebuilds:0,maxBatchMs:0};
 private pathfinder:Pathfinder;private generation=0;private targets:number[]=[];private evaluated='';private signature='';private fields:{fire:Float64Array;police:Float64Array}={fire:new Float64Array(),police:new Float64Array()};
 constructor(readonly network:RoadNetwork,config:SafetyConfig={...SAFETY_CONFIG}){this.config={...config};this.pathfinder=new Pathfinder(network);}
 get maintenance(){let n=0;for(const k of this.stations.values())n+=(k==='fire'?this.config.fireMaintenance:this.config.policeMaintenance)*this.funding[k];return n;}
 coverageAt(id:number,kind:ServiceKind){const time=this.responseAt(id,kind);return time===null?0:(kind==='fire'?this.fireCapacityRatio:this.policeCapacityRatio)*Math.max(0,1-time/this.config.maxResponseMinutes);}
 responseAt(id:number,kind:ServiceKind){const value=this.fields[kind][id];return Number.isFinite(value)?value:null;}
 get penalty(){return this.enabled?(this.fireRisk+this.crimeRisk)*this.config.satisfactionPenalty:0;}
 snapshot():SafetyState{return {version:1,enabled:this.enabled,config:{...this.config},stations:[...this.stations].map(([id,kind])=>({id,kind}))};}
 restore(s:SafetyState){this.enabled=s.enabled;Object.assign(this.config,s.config);this.stations.clear();for(const t of s.stations)this.stations.set(t.id,t.kind);this.signature='';}
 add(id:number,kind:ServiceKind){if(this.stations.has(id))return false;if(this.stations.size>=this.config.maxStations)return false;this.stations.set(id,kind);this.enabled=true;this.signature='';return true;}
 remove(id:number){if(this.stations.delete(id))this.signature='';}
 // Same symmetric edge cost as 6-B weighted A*. Two shared shortest-time fields avoid station×building queries.
 private *field(kind:ServiceKind,weights:Float64Array):Generator<void,Float64Array>{
  const starts:number[]=[];for(const [id,k] of this.stations)if(k===kind)for(const road of this.network.adjacent(id))if(this.network.isMain(road)&&!starts.includes(road))starts.push(road);
  return yield* roadTimeField(this.network,weights,starts,this.targets,this.config.maxResponseMinutes,this.pathfinder,this.generation,this.profile);
 }
 *update(buildings:SafetyBuilding[],traffic:Traffic,population:number,housing:number):Generator<void>{
  if(!this.enabled&&!this.stations.size)return;
  const start=performance.now(),n=this.network.size*this.network.size,weights=new Float64Array(n);let hash=2166136261;
  for(const [id,volume] of traffic.volumes){hash=Math.imul(hash^id,16777619);hash=Math.imul(hash^volume,16777619);hash=Math.imul(hash^Math.round(traffic.capacity(id)*1000),16777619);}
  const sig=this.network.revision+':'+hash+':'+[...this.stations].join(';')+':'+traffic.config.minutesPerRoad+':'+traffic.config.roadCapacity+':'+traffic.config.congestionFactor+':'+traffic.config.congestionExponent+':'+traffic.config.maxCongestionMultiplier+':'+this.config.maxResponseMinutes;
  if(sig!==this.signature){
   this.generation++;this.targets=[...new Set(buildings.filter(b=>b.level).flatMap(b=>this.network.adjacent(b.id).filter(id=>this.network.isMain(id))))];
   // Small cities reuse 6-B weighted A*; large batches share a multi-source field.
   if(this.targets.length<=32)this.targets=Array.from({length:n},(_,id)=>id).filter(id=>this.network.isMain(id)); // Include every road so cached fields remain valid when a new building appears.
   for(let id=0;id<n;id++)weights[id]=traffic.config.minutesPerRoad*traffic.multiplier(id);
   this.fields.fire=yield* this.field('fire',weights);this.fields.police=yield* this.field('police',weights);this.signature=sig;this.profile.rebuilds++;
  }
  let levels=2166136261;for(const b of buildings){levels=Math.imul(levels^b.id,16777619);levels=Math.imul(levels^b.level,16777619);levels=Math.imul(levels^(b.zone==='residential'?1:b.zone==='commercial'?2:3),16777619);}
  const evaluated=sig+':'+levels+':'+population+':'+housing+':'+JSON.stringify(this.config)+':'+JSON.stringify(this.budget);
  if(evaluated===this.evaluated)return;this.evaluated=evaluated;
  const rows:{b:SafetyBuilding;f:number;p:number;fd:number;pd:number;fr:number;cr:number}[]=[];let fireDemand=0,policeDemand=0;
  for(const b of buildings){if(!b.level)continue;const access=this.network.adjacent(b.id).filter(id=>this.network.isMain(id));
   let f=Infinity,p=Infinity;for(const id of access){f=Math.min(f,this.fields.fire[id]+1);p=Math.min(p,this.fields.police[id]+1);}
   const fd=b.level*(b.zone==='industrial'?3:b.zone==='commercial'?2:1)*12;
   const pd=b.level*12*(1+(b.zone==='commercial'?1:0))+(b.zone==='residential'?b.level*traffic.config.residentsPerLevel*(housing?population/housing:0):0);
   const fr=this.config[b.zone==='residential'?'fireRiskResidential':b.zone==='commercial'?'fireRiskCommercial':'fireRiskIndustrial'];
   const cr=Math.min(1,this.config.crimeBase+this.config.crimeDensityWeight*b.level/traffic.config.maxLevel*(housing?population/housing:0)+(b.zone==='commercial'?this.config.crimeCommercialWeight:0));
   rows.push({b,f,p,fd,pd,fr,cr});fireDemand+=fd;policeDemand+=pd;
   if(rows.length%64===0)yield;
  }
  // Only road-connected stations contribute capacity.
  let nf=0,np=0;for(const [id,k] of this.stations)if(this.network.adjacent(id).some(r=>this.network.isMain(r)))k==='fire'?nf++:np++;
  const fc=Math.min(1,nf*this.config.fireCapacity*this.budget.fire/(fireDemand||1)),pc=Math.min(1,np*this.config.policeCapacity*this.budget.police/(policeDemand||1));
  this.fireCapacityRatio=fc;this.policeCapacityRatio=pc;
  const previous=this.results;const results=new Map<number,ServiceResult>();let fs=0,ps=0,frs=0,crs=0,ft=0,pt=0,fw=0,pw=0;
  for(const r of rows){const fire=Number.isFinite(r.f)?fc*Math.max(0,1-r.f/this.config.maxResponseMinutes):0,police=Number.isFinite(r.p)?pc*Math.max(0,1-r.p/this.config.maxResponseMinutes):0;
   const result={fire,police,fireMinutes:Number.isFinite(r.f)?r.f:null,policeMinutes:Number.isFinite(r.p)?r.p:null,fireRisk:r.fr*(1-fire*this.config.riskReduction),crimeRisk:r.cr*(1-police*this.config.riskReduction)};results.set(r.b.id,result);
   fs+=fire*r.fd;ps+=police*r.pd;frs+=result.fireRisk*r.fd;crs+=result.crimeRisk*r.pd;
   if(result.fireMinutes!==null){ft+=r.f*r.fd;fw+=r.fd;}if(result.policeMinutes!==null){pt+=r.p*r.pd;pw+=r.pd;}
   if(results.size%64===0)yield;
  }
  previous.clear();for(const [id,r] of results)previous.set(id,r);
  this.fireCoverage=fireDemand?fs/fireDemand:1;this.policeCoverage=policeDemand?ps/policeDemand:1;this.fireRisk=fireDemand?frs/fireDemand:0;this.crimeRisk=policeDemand?crs/policeDemand:0;this.fireMinutes=fw?ft/fw:null;this.policeMinutes=pw?pt/pw:null;this.profile.workMs=performance.now()-start;
 }
}
