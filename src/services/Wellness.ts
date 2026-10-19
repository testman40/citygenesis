import {serviceRangeScale} from './ServiceRanges';

import {DEVELOPMENT_FACILITIES,isDevelopmentKind,type DevelopmentKind} from './DevelopmentFacilities';
import {Pathfinder} from '../traffic/Pathfinder';
import type {RoadNetwork} from '../simulation/RoadNetwork';
import type {Traffic} from '../traffic/Traffic';
import {roadTimeField} from './Reach';
import {WELLNESS_CONFIG,type WellnessConfig} from './config';
export type WellnessKind='clinic'|'hospital'|'elementary'|'highSchool'|DevelopmentKind;
export type ServiceGroup='medical'|'elementary'|'highSchool';
export const WELLNESS_KINDS:WellnessKind[]=['clinic','hospital','elementary','highSchool',...Object.keys(DEVELOPMENT_FACILITIES) as DevelopmentKind[]];
export interface WellnessState {version:1;medicalEnabled:boolean;educationEnabled:boolean;config:WellnessConfig;facilities:{id:number;kind:WellnessKind}[];health:number;basicGraduates:number;advancedGraduates:number;populationReference:number;lastMonth:number}
export interface ResidentBuilding {id:number;level:number}
export interface WellnessResult {medical:number;elementary:number;highSchool:number;medicalMinutes:number|null;schoolMinutes:number|null}
export const wellnessGroup=(k:WellnessKind):ServiceGroup=>isDevelopmentKind(k)?DEVELOPMENT_FACILITIES[k].group:k==='clinic'||k==='hospital'?'medical':k;
const group=wellnessGroup;
export class Wellness {
 budget={medical:1,education:1};funding={medical:1,education:1};
 readonly facilities=new Map<number,WellnessKind>();readonly results=new Map<number,WellnessResult>();readonly facilityStats=new Map<number,{active:boolean;capacity:number;utilization:number;maintenance:number}>();
 readonly config:WellnessConfig;medicalEnabled=false;educationEnabled=false;health=1;basicGraduates=0;advancedGraduates=0;populationReference=0;lastMonth=0;
 medicalCoverage=0;elementaryCoverage=0;highSchoolCoverage=0;medicalMinutes:number|null=null;schoolMinutes:number|null=null;
 readonly profile={expanded:0,maxBatchMs:0,rebuilds:0};
 private fields:Record<ServiceGroup,Float64Array>={medical:new Float64Array(),elementary:new Float64Array(),highSchool:new Float64Array()};
 private arrivals:Record<ServiceGroup,Float64Array>={medical:new Float64Array(),elementary:new Float64Array(),highSchool:new Float64Array()};
 private arrivalTimes:Record<ServiceGroup,Float64Array>={medical:new Float64Array(),elementary:new Float64Array(),highSchool:new Float64Array()};
 private ratios:Record<ServiceGroup,number>={medical:0,elementary:0,highSchool:0};private signature='';private evaluation='';private pathfinder:Pathfinder;private generation=0;
 constructor(readonly network:RoadNetwork,config:WellnessConfig={...WELLNESS_CONFIG}){this.config={...config};this.pathfinder=new Pathfinder(network);}
 get active(){return this.medicalEnabled||this.educationEnabled;}
 get education(){return this.populationReference?(this.basicGraduates*.6+this.advancedGraduates*.4)/this.populationReference:0;}
 get basicLevel(){return this.populationReference?this.basicGraduates/this.populationReference:0;}
 get advancedLevel(){return this.populationReference?this.advancedGraduates/this.populationReference:0;}
 get penalty(){return (this.medicalEnabled?(1-this.health)*this.config.healthSatisfactionPenalty:0)+(this.educationEnabled?(1-(this.elementaryCoverage*.6+this.highSchoolCoverage*.4))*this.config.educationSatisfactionPenalty:0);}
 get migrationFactor(){return this.medicalEnabled?this.config.minimumMigrationFactor+(1-this.config.minimumMigrationFactor)*this.health:1;}
 cost(kind:WellnessKind){if(isDevelopmentKind(kind)){const f=DEVELOPMENT_FACILITIES[kind];return f.cost*this.config[(f.base+'Cost') as keyof WellnessConfig]/WELLNESS_CONFIG[(f.base+'Cost') as keyof WellnessConfig];}return this.config[(kind+'Cost') as keyof WellnessConfig];}
 capacity(kind:WellnessKind){const f=isDevelopmentKind(kind)?DEVELOPMENT_FACILITIES[kind]:null;return (f?f.capacity*this.config[(f.base+'Capacity') as keyof WellnessConfig]/WELLNESS_CONFIG[(f.base+'Capacity') as keyof WellnessConfig]:this.config[(kind+'Capacity') as keyof WellnessConfig])*this.budget[group(kind)==='medical'?'medical':'education'];}
 baseUpkeep(kind:WellnessKind){const f=isDevelopmentKind(kind)?DEVELOPMENT_FACILITIES[kind]:null;return f?f.maintenance*this.config[(f.base+'Maintenance') as keyof WellnessConfig]/WELLNESS_CONFIG[(f.base+'Maintenance') as keyof WellnessConfig]:this.config[(kind+'Maintenance') as keyof WellnessConfig];}
 upkeep(kind:WellnessKind){return this.baseUpkeep(kind)*this.funding[group(kind)==='medical'?'medical':'education'];}
 get maintenance(){let sum=0;for(const k of this.facilities.values())sum+=this.upkeep(k);return sum;}
 add(id:number,kind:WellnessKind,month:number){if(this.facilities.has(id)||this.facilities.size>=this.config.maxFacilities)return false;this.facilities.set(id,kind);if(group(kind)==='medical')this.medicalEnabled=true;else this.educationEnabled=true;this.lastMonth=month;this.signature='';return true;}
 remove(id:number){if(this.facilities.delete(id))this.signature='';}
 snapshot():WellnessState{return {version:1,medicalEnabled:this.medicalEnabled,educationEnabled:this.educationEnabled,config:{...this.config},facilities:[...this.facilities].map(([id,kind])=>({id,kind})),health:this.health,basicGraduates:this.basicGraduates,advancedGraduates:this.advancedGraduates,populationReference:this.populationReference,lastMonth:this.lastMonth};}
 restore(s:WellnessState){Object.assign(this.config,s.config);for(const key of ['medicalEnabled','educationEnabled','health','basicGraduates','advancedGraduates','populationReference','lastMonth'] as const)(this as any)[key]=s[key];this.facilities.clear();for(const f of s.facilities)this.facilities.set(f.id,f.kind);this.signature='';this.evaluation='';}
 displaySnapshot(){return Object.assign(Object.create(Object.getPrototypeOf(this)),this,{facilities:new Map(this.facilities),results:new Map(this.results),facilityStats:new Map(this.facilityStats),ratios:{...this.ratios},fields:{...this.fields},arrivals:{...this.arrivals},arrivalTimes:{...this.arrivalTimes}}) as Wellness;}
 /** Newcomers have no inherited qualification; emigrants remove proportional stocks. No time passes here. */
 reconcilePopulation(population:number){if(population<this.populationReference&&this.populationReference){const ratio=population/this.populationReference;this.basicGraduates*=ratio;this.advancedGraduates*=ratio;}this.populationReference=population;this.basicGraduates=Math.min(population,this.basicGraduates);this.advancedGraduates=Math.min(this.basicGraduates,this.advancedGraduates);}
 /** Exactly one gradual update per accounting month, independent of rendering and recounts. */
 advance(month:number,population:number){this.reconcilePopulation(population);if(month<=this.lastMonth)return;this.lastMonth=month;if(this.medicalEnabled){const target=this.config.healthFloor+(1-this.config.healthFloor)*this.medicalCoverage;this.health+=this.config.healthMonthlyRate*(target-this.health);}
  if(this.educationEnabled){const basicTarget=population*this.elementaryCoverage;this.basicGraduates+=this.config.basicMonthlyRate*Math.max(0,basicTarget-this.basicGraduates);const highTarget=this.basicGraduates*this.highSchoolCoverage;this.advancedGraduates+=this.config.advancedMonthlyRate*Math.max(0,highTarget-this.advancedGraduates);this.advancedGraduates=Math.min(this.basicGraduates,this.advancedGraduates);}
 }
 private limit(k:ServiceGroup){return k==='medical'?this.config.medicalMinutes:this.config.schoolMinutes;}
 roadCoverage(id:number,k:ServiceGroup){const t=this.fields[k][id];return Number.isFinite(t)?this.ratios[k]*Math.max(0,1-t/this.limit(k)):0;}
 *update(homes:ResidentBuilding[],traffic:Traffic,population:number,housing:number):Generator<void>{
  if(!this.active)return;this.reconcilePopulation(population);
  // Exact signature preserves fractional road capacities and invalidates only changed cost inputs.
  const costs=[...traffic.volumes].map(([id,v])=>id+':'+v+':'+traffic.capacity(id)).join(';');
  const sig=this.network.revision+':'+costs+':'+JSON.stringify([...this.facilities])+':'+[traffic.config.minutesPerRoad,traffic.config.roadCapacity,traffic.config.congestionFactor,traffic.config.congestionExponent,traffic.config.maxCongestionMultiplier,this.config.medicalMinutes,this.config.schoolMinutes].join(',');
  if(sig!==this.signature){const n=this.network.size*this.network.size,weights=new Float64Array(n),targets:number[]=[];for(let id=0;id<n;id++){weights[id]=traffic.config.minutesPerRoad*traffic.multiplier(id);if(this.network.isMain(id))targets.push(id);if(id%256===255)yield;}
   // Compare reach in base-limit units per facility type; retain real minutes for travel statistics.
   for(const k of ['medical','elementary','highSchool'] as const){
    const field=new Float64Array(n).fill(Infinity),arrival=new Float64Array(n).fill(Infinity),actual=new Float64Array(n).fill(Infinity);
    const kinds=[...new Set([...this.facilities.values()].filter(kind=>group(kind)===k))];
    for(const kind of kinds){const scale=serviceRangeScale(kind),starts=new Set<number>();for(const [id,sourceKind] of this.facilities)if(sourceKind===kind)for(const road of this.network.adjacent(id))if(this.network.isMain(road))starts.add(road);
     const source=yield* roadTimeField(this.network,weights,[...starts],targets,this.limit(k)*scale,this.pathfinder,++this.generation,this.profile);
     for(const id of targets){field[id]=Math.min(field[id],source[id]/scale);const normalized=(source[id]+1)/scale;if(normalized<arrival[id]){arrival[id]=normalized;actual[id]=source[id]+1;}if(id%256===0)yield;}
    }
    this.fields[k]=field;this.arrivals[k]=arrival;this.arrivalTimes[k]=actual;
   }
   this.signature=sig;this.profile.rebuilds++;
  }
  const evaluated=sig+':'+population+':'+housing+':'+homes.map(h=>h.id+':'+h.level).join(';')+':'+JSON.stringify(this.config)+JSON.stringify(this.budget)+JSON.stringify(this.funding);if(evaluated===this.evaluation)return;
  const capacities={medical:0,elementary:0,highSchool:0};this.facilityStats.clear();
  for(const [id,kind] of this.facilities){const active=this.network.adjacent(id).some(r=>this.network.isMain(r)),capacity=this.capacity(kind);if(active)capacities[group(kind)]+=capacity;this.facilityStats.set(id,{active,capacity,utilization:0,maintenance:this.upkeep(kind)});}
  const demands={medical:population,elementary:population*this.config.elementaryDemandRatio,highSchool:population*this.config.highSchoolDemandRatio};
  for(const k of ['medical','elementary','highSchool'] as const)this.ratios[k]=Math.min(1,capacities[k]/(demands[k]||1));
  const results=new Map<number,WellnessResult>();const served={medical:0,elementary:0,highSchool:0};let medicalTime=0,medicalPeople=0,schoolTime=0,schoolPeople=0;
  for(const h of homes){if(!h.level)continue;const connected=this.network.adjacent(h.id).some(r=>this.network.isMain(r)),people=connected&&housing?h.level*traffic.config.residentsPerLevel*population/housing:0;
   const times={medical:Infinity,elementary:Infinity,highSchool:Infinity},actual={...times};
   for(const k of ['medical','elementary','highSchool'] as const)for(const road of this.network.adjacent(h.id))if(this.network.isMain(road)&&this.arrivals[k][road]<times[k]){times[k]=this.arrivals[k][road];actual[k]=this.arrivalTimes[k][road];}
   const coverage={medical:0,elementary:0,highSchool:0};for(const k of ['medical','elementary','highSchool'] as const){coverage[k]=Math.max(0,1-times[k]/this.limit(k))*this.ratios[k];served[k]+=coverage[k]*people*(k==='medical'?1:k==='elementary'?this.config.elementaryDemandRatio:this.config.highSchoolDemandRatio);}
   if(Number.isFinite(times.medical)&&people){medicalTime+=actual.medical*people;medicalPeople+=people;}const school=Math.min(actual.elementary,actual.highSchool);if(Number.isFinite(school)&&people){schoolTime+=school*people;schoolPeople+=people;}
   results.set(h.id,{...coverage,medicalMinutes:Number.isFinite(actual.medical)?actual.medical:null,schoolMinutes:Number.isFinite(school)?school:null});if(results.size%64===0)yield;
  }
  this.results.clear();for(const [id,r] of results)this.results.set(id,r);
  for(const [id,stat] of this.facilityStats){const k=group(this.facilities.get(id)!);stat.utilization=stat.active&&capacities[k]?Math.min(1,served[k]/capacities[k]):0;}
  this.medicalCoverage=demands.medical?served.medical/demands.medical:1;this.elementaryCoverage=demands.elementary?served.elementary/demands.elementary:1;this.highSchoolCoverage=demands.highSchool?served.highSchool/demands.highSchool:1;
  this.medicalMinutes=medicalPeople?medicalTime/medicalPeople:null;this.schoolMinutes=schoolPeople?schoolTime/schoolPeople:null;this.evaluation=evaluated;
 }
}
