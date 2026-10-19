import {serviceRangeScale} from './ServiceRanges';
import {roadTimeField,buildingTime} from './Reach';
import {Pathfinder} from '../traffic/Pathfinder';
import type {City,Cell} from '../simulation/City';
import {DEVELOPMENT_FACILITIES,isDevelopmentKind} from './DevelopmentFacilities';
import {developmentUnlocked,developmentRequirement} from '../progression/Development';
import {wellnessGroup,type WellnessKind} from './Wellness';
import {PARK_EFFECTS} from '../scenery/ParkEffects';

export const PUBLIC_FACILITIES={police:'警察署',fire:'消防署',clinic:'診療所',hospital:'病院',elementary:'小学校',highSchool:'高校',library:'図書館',university:'大学',medicalCenter:'総合医療センター',researchCampus:'研究教育センター',park:'公園',plaza:'広場'} as const;
export type PublicKind=keyof typeof PUBLIC_FACILITIES;
export type PublicService='police'|'fire'|'medical'|'education';
export const isPublicKind=(kind:string):kind is PublicKind=>Object.hasOwn(PUBLIC_FACILITIES,kind);
export const publicService=(kind:PublicKind):PublicService|null=>kind==='police'||kind==='fire'?kind:kind==='park'||kind==='plaza'?null:wellnessGroup(kind)==='medical'?'medical':'education';
export function publicFacility(c:City,kind:PublicKind){
 const scenery=kind==='park'||kind==='plaza',safety=kind==='fire'||kind==='police';
 const cost=scenery?(kind==='park'?200:350)*(c.management?.parameters.construction??1):safety?c.safety.config[kind==='fire'?'fireCost':'policeCost']:c.wellness.cost(kind as WellnessKind);
 const maintenance=scenery?(kind==='park'?1:2)*(c.management?.parameters.maintenance??1):safety?c.safety.config[kind==='fire'?'fireMaintenance':'policeMaintenance']*c.budget.funded[kind]:c.wellness.upkeep(kind as WellnessKind);
 const locked=isDevelopmentKind(kind)&&!developmentUnlocked(c,kind)?'レベル'+(DEVELOPMENT_FACILITIES[kind].stage+1)+'で使えるようになります。'+developmentRequirement(c,kind):null;
 const radius=scenery?PARK_EFFECTS[kind as 'park'|'plaza'].radius:(safety?c.safety.config.maxResponseMinutes:publicService(kind)==='medical'?c.wellness.config.medicalMinutes:c.wellness.config.schoolMinutes)*serviceRangeScale(kind)/Math.max(.001,c.traffic.config.minutesPerRoad);
 return {kind,name:PUBLIC_FACILITIES[kind],cost,maintenance,locked,radius:Math.min(c.size,radius),goodRadius:scenery?radius:Math.max(1,radius*.2-2/Math.max(.001,c.traffic.config.minutesPerRoad))};
}
export function publicBuildReason(c:City,kind:PublicKind){const f=publicFacility(c,kind);return f.locked??(c.funds<f.cost?'資金が足りません（あと'+Math.ceil(f.cost-c.funds).toLocaleString('ja-JP')+'必要です）':null);}
export function publicCoverage(c:City,id:number,kind:PublicKind):number{
 if(kind==='park'||kind==='plaza')return c.parks.at(id)>0?1:0;
 if(kind==='fire'||kind==='police')return c.safety.results.get(id)?.[kind]??0;
 const r=c.wellness.results.get(id);return r?.[wellnessGroup(kind)]??0;
}
export const publicEnabled=(c:City,service:PublicService)=>service==='police'||service==='fire'?c.safety.enabled:service==='medical'?c.wellness.medicalEnabled:c.wellness.educationEnabled;
export function serviceHomes(c:City,service:PublicService){return c.residentHomes().filter(h=>{const r=c.wellness.results.get(h.id),value=service==='education'?(r?(r.elementary*.6+r.highSchool*.4):0):service==='medical'?r?.medical??0:c.safety.results.get(h.id)?.[service]??0;return value<.8;});}

export function serviceTargets(c:City,service:PublicService){
 const homes=serviceHomes(c,service);if(homes.length||service==='medical'||service==='education')return homes;
 return [...c.safety.results].filter(([,r])=>r[service]<.8).map(([id])=>({id,capacity:1}));
}
export const regionOf=(c:City,id:number)=>Math.floor(id%c.size/8)+','+Math.floor(Math.floor(id/c.size)/8);
export const regionName=(region:string)=>{const [x,z]=region.split(',').map(Number);return (x+1)+'-'+(z+1)+'地域';};
export function publicRequestKind(c:City,service:PublicService):PublicKind{return service==='medical'?'clinic':service==='education'?(c.wellness.elementaryCoverage<=c.wellness.highSchoolCoverage?'elementary':'highSchool'):service;}
export function publicSuggestions(c:City,kind:PublicKind,homes=serviceTargets(c,publicService(kind)??'medical')):Cell[]{
 const candidates=new Map<number,number>();
 for(const home of homes){const x=home.id%c.size,z=Math.floor(home.id/c.size);for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){const cell={x:x+dx,z:z+dz};if(!c.contains(cell))continue;const t=c.tile(cell);if(!t.networkConnected||t.road||t.zone||t.facility||!c.placement(cell,kind).ok)continue;const id=cell.z*c.size+cell.x;candidates.set(id,(candidates.get(id)??0)+1/(1+Math.abs(dx)+Math.abs(dz)));}}
 const shortlist=[...candidates].sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,24);
 if(kind!=='park'&&kind!=='plaza'){
  const limit=kind==='police'||kind==='fire'?c.safety.config.maxResponseMinutes:publicService(kind)==='medical'?c.wellness.config.medicalMinutes:c.wellness.config.schoolMinutes;
  const reach=limit*serviceRangeScale(kind);
  const weights=new Float64Array(c.size*c.size);for(const id of c.network.ids())weights[id]=c.traffic.config.minutesPerRoad*c.traffic.multiplier(id);
  const targets=[...new Set(homes.flatMap(h=>c.network.adjacent(h.id).filter(id=>c.network.isMain(id))))],finder=new Pathfinder(c.network);
  for(const row of shortlist){const starts=c.network.adjacent(row[0]).filter(id=>c.network.isMain(id)),job=roadTimeField(c.network,weights,starts,targets,reach,finder,0,{expanded:0,maxBatchMs:0});let next=job.next();while(!next.done)next=job.next();row[1]=homes.reduce((score,h)=>score+Math.max(0,1-buildingTime(c.network,h.id,next.value!)/reach),0);}
 }
 return shortlist.filter(([,score])=>score>0).sort((a,b)=>b[1]-a[1]||a[0]-b[0]).slice(0,12).map(([id])=>({x:id%c.size,z:Math.floor(id/c.size)}));
}
/** Transient feedback only: no new saved fields and no notification on loading another city. */
export class PublicResolutions {
 private owner:City|undefined;private previous=new Map<PublicService,number[]>();private stations=new Set<string>();
 observe(c:City){
  const services:PublicService[]=['police','fire','medical','education'],current=new Map(services.map(s=>[s,(publicEnabled(c,s)?serviceHomes(c,s):[]).map(h=>h.id)])),stations=new Set([...c.safety.stations,...c.wellness.facilities].map(([id,kind])=>id+':'+kind)),messages:string[]=[];
  if(this.owner===c)for(const service of services){if(![...stations].some(key=>!this.stations.has(key)&&publicService(key.split(':')[1] as PublicKind)===service))continue;const old=this.previous.get(service)??[],now=new Set(current.get(service));for(const region of new Set(old.map(id=>regionOf(c,id))))if(old.filter(id=>regionOf(c,id)===region).every(id=>!now.has(id))&&old.some(id=>regionOf(c,id)===region&&c.tile({x:id%c.size,z:Math.floor(id/c.size)}).zone==='residential'))messages.push(regionName(region)+'の'+({police:'治安',fire:'消防',medical:'医療',education:'教育'}[service])+'の要望に対応しました');}
  this.owner=c;this.previous=current;this.stations=stations;return messages;
 }
}
