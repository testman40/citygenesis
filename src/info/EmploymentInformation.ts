import {apportion} from '../traffic/Traffic';
import type {City,Cell,Tool} from '../simulation/City';
import {roadDistance,COMMUTE_REACH} from '../traffic/CommuteAccess';
export interface WorkIssue {id:string;reason:'jobs'|'access';title:string;count:number;unit:string;homes:number[];cell:Cell}
interface WorkData {issues:WorkIssue[];scores:Map<number,number>;workplaces:Array<{id:number;capacity:number;free:number}>}
const cache=new WeakMap<City,{key:string;value:WorkData}>();
export function employmentInformation(c:City):WorkData{
 const key=[c.month,c.residents?.state.nextId,c.network.revision,c.traffic.solveRevision,c.transit.revision,c.population,c.residents?.households.length,c.powerRatio].join(':');const hit=cache.get(c);if(hit?.key===key)return hit.value;
 const assigned=new Map<number,number>();for(const r of c.traffic.routes)assigned.set(r.work,(assigned.get(r.work)??0)+r.count);
 const workplaces:Array<{id:number;capacity:number;free:number}>=[],kinds=new Map<number,string>();for(const cell of c.zoneCells()){const t=c.tile(cell);if((t.zone==='commercial'||t.zone==='industrial')&&t.level&&t.networkConnected){const id=cell.z*c.size+cell.x,capacity=t.level*(t.zone==='commercial'?c.config.commercialJobsPerLevel:c.config.industrialJobsPerLevel);kinds.set(id,t.zone);if(capacity)workplaces.push({id,capacity,free:0});}}
 for(const kind of ['commercial','industrial']){const entries=workplaces.filter(w=>kinds.get(w.id)===kind),capacities=apportion(kind==='commercial'?c.commercialJobs:c.industrialJobs,entries.map(w=>w.capacity));entries.forEach((w,i)=>{w.capacity=capacities[i];w.free=Math.max(0,w.capacity-(assigned.get(w.id)??0));});}for(let i=workplaces.length-1;i>=0;i--)if(!workplaces[i].capacity)workplaces.splice(i,1);
 // Multi-source reverse road distances: nearest workplace, respecting one-way roads and mode restrictions.
 const nearest=(mode:'car'|'walk',limit:number)=>{const d=new Map<number,number>(),q:number[]=[];for(const w of workplaces)for(const road of c.network.access(w.id))if(c.network.allows(road,mode)&&!d.has(road)){d.set(road,1);q.push(road);}for(let i=0;i<q.length;i++){const id=q[i],n=d.get(id)!;if(n>=limit)continue;for(const p of c.network.adjacent(id))if(c.network.canTravel(p,id,mode)&&!d.has(p)){d.set(p,n+1);q.push(p);}}return d;};
 const car=nearest('car',COMMUTE_REACH.car),walk=nearest('walk',COMMUTE_REACH.walk),scores=new Map<number,number>();
 const busRoads=new Set<number>();for(const service of c.transit.services.values())if(service.active&&service.capacity>0){const stops=service.route.stops.map(id=>c.transit.stops.get(id)!).filter(Boolean);const hasWork=stops.some(s=>workplaces.some(w=>roadDistance(c.network,w.id,s.road,'walk',COMMUTE_REACH.stop)<=COMMUTE_REACH.stop));if(hasWork)for(const s of stops)busRoads.add(s.road);}
 const busDistance=new Map<number,number>(),queue=[...busRoads];for(const id of queue)busDistance.set(id,0);for(let i=0;i<queue.length;i++){const id=queue[i],n=busDistance.get(id)!;if(n>=COMMUTE_REACH.stop)continue;for(const p of c.network.adjacent(id))if(c.network.canTravel(p,id,'walk')&&!busDistance.has(p)){busDistance.set(p,n+1);queue.push(p);}}
 for(const id of c.network.ids()){const a=car.get(id)??Infinity,b=walk.get(id)??Infinity;const score=Math.max(a+1<=30?1-(a+1)/40:0,b+1<=10?1-(b+1)/20:0,(busDistance.get(id)??Infinity)+1<=5?.85:0);scores.set(id,score);}
 const groups=new Map<string,WorkIssue>();const add=(id:number,count:number)=>{const roads=c.network.access(id);const connected=workplaces.some(w=>roads.some(a=>c.network.access(w.id).some(b=>c.network.sameComponent(a,b))));const reachable=(scores.get(id)??Math.max(0,...roads.map(r=>scores.get(r)??0)))>0;const free=workplaces.some(w=>w.free>0&&(roadDistance(c.network,id,w.id,'car',30)<=30||roadDistance(c.network,id,w.id,'walk',10)<=10||!!c.transit.connection(id,w.id,c.config.minutesPerRoad)));
  // No transport warning for a connected road network, even beyond the car distance limit.
  const reason:WorkIssue['reason']=!connected&&workplaces.length>0&&!reachable?'access':'jobs',x=id%c.size,z=Math.floor(id/c.size),region=Math.floor(x/8)+','+Math.floor(z/8),key=reason+':'+region,group=groups.get(key)??{id:'work-'+key,reason,title:reason==='jobs'?(reachable&&!free?'近くの働き口が満員です':'近くに仕事がありません'):'仕事へ行く手段がありません',count:0,unit:c.residents?'世帯':'住宅区画',homes:[],cell:{x,z}};group.count+=count;if(!group.homes.includes(id))group.homes.push(id);groups.set(key,group);
 };
 if(!c.traffic.pending){if(c.residents){for(const h of c.residents.households)if(c.residents.members(h).some(p=>p.group==='大人'&&!c.residents!.job(c,p)?.employed))add(h[1],1);}else{const served=new Map<number,number>();for(const r of c.traffic.routes)served.set(r.home,(served.get(r.home)??0)+r.served);const homes=[...c.zoneCells()].filter(cell=>{const t=c.tile(cell);return t.zone==='residential'&&t.level&&t.networkConnected;}),workers=apportion(c.workforce,homes.map(cell=>c.tile(cell).level*c.config.residentsPerLevel));homes.forEach((cell,i)=>{if(workers[i]>(served.get(cell.z*c.size+cell.x)??0))add(cell.z*c.size+cell.x,1);});}}
 const value={issues:[...groups.values()],scores,workplaces};cache.set(c,{key,value});return value;
}
export function workAccessAt(c:City,id:number){const d=employmentInformation(c);return d.scores.get(id)??Math.max(0,...c.network.access(id).map(r=>d.scores.get(r)??0));}
/** Suggestions are previews only. Existing placement checks remain authoritative on click. */
export function workSuggestions(c:City,issue:WorkIssue,kind:'jobs'|'road'|'bus'):Array<{cell:Cell;tool:Tool}>{
 if(kind==='road')return roadRepair(c,issue);
 const results:Array<{cell:Cell;tool:Tool;rank:number}>=[],origins=issue.homes.map(id=>({x:id%c.size,z:Math.floor(id/c.size)}));if(kind==='bus')origins.push(...[...employmentInformation(c).workplaces].sort((a,b)=>Math.abs(a.id%c.size-issue.cell.x)+Math.abs(Math.floor(a.id/c.size)-issue.cell.z)-Math.abs(b.id%c.size-issue.cell.x)-Math.abs(Math.floor(b.id/c.size)-issue.cell.z)).slice(0,3).map(w=>({x:w.id%c.size,z:Math.floor(w.id/c.size)})));const checked=new Set<number>();
 for(const home of origins)for(let z=Math.max(0,home.z-10);z<=Math.min(c.size-1,home.z+10);z++)for(let x=Math.max(0,home.x-10);x<=Math.min(c.size-1,home.x+10);x++){const id=z*c.size+x;if(checked.has(id))continue;const cell={x,z},tool:Tool=kind==='jobs'?'commercial':'bus-stop',t=c.tile(cell);if(kind==='jobs'&&(t.road||t.zone||t.facility||!t.networkConnected||!c.network.access(id).length))continue;if(!c.placement(cell,tool).ok)continue;if(kind==='bus'&&(!t.road||roadDistance(c.network,home.z*c.size+home.x,id,'walk',5)>5))continue;checked.add(id);results.push({cell,tool,rank:Math.abs(x-home.x)+Math.abs(z-home.z)});}
 return results.sort((a,b)=>a.rank-b.rank).slice(0,24).map(({cell,tool})=>({cell,tool}));
}

/** Find an actual repair corridor across free land, preferring existing roads over new construction. */
function roadRepair(c:City,issue:WorkIssue):Array<{cell:Cell;tool:Tool}>{
 const targets=new Set(employmentInformation(c).workplaces.flatMap(w=>c.network.access(w.id)));if(!targets.size)for(const road of c.network.ids())if(c.network.isMain(road))targets.add(road);const starts=[...new Set(issue.homes.flatMap(id=>c.network.has(id)?[id]:c.network.access(id)))];if(!targets.size||!starts.length)return [];
 const cost=new Map<number,number>(),parent=new Map<number,number>(),buckets=new Map<number,number[]>();for(const id of starts){cost.set(id,0);buckets.set(0,[...(buckets.get(0)??[]),id]);}let expanded=0;
 for(let distance=0;distance<=240&&expanded<8192;distance++){const q=buckets.get(distance)??[];for(let i=0;i<q.length&&expanded<8192;i++){const id=q[i];if(cost.get(id)!==distance)continue;expanded++;if(targets.has(id)){const path:number[]=[];let cursor=id;while(parent.has(cursor)){if(!c.network.has(cursor))path.push(cursor);cursor=parent.get(cursor)!;}return path.reverse().filter(id=>c.placement({x:id%c.size,z:Math.floor(id/c.size)},'road').ok).map(id=>({cell:{x:id%c.size,z:Math.floor(id/c.size)},tool:'road'}));}
 const x=id%c.size,z=Math.floor(id/c.size);for(const next of [x>0?id-1:-1,x<c.size-1?id+1:-1,z>0?id-c.size:-1,z<c.size-1?id+c.size:-1]){if(next<0)continue;const road=c.network.has(next);if(road&&!c.network.allows(next,'car'))continue;if(!road&&c.roadPlacement(next)!=='free')continue;const n=distance+(road?1:3);if(n<(cost.get(next)??Infinity)){cost.set(next,n);parent.set(next,id);const bucket=buckets.get(n)??[];bucket.push(next);buckets.set(n,bucket);}}}}
 return [];
}

export function resolveWorkIssue(c:City,id:string):WorkIssue|undefined{
 const issues=employmentInformation(c).issues;if(id!=='request-jobs'&&id!=='request-roads')return issues.find(r=>r.id===id);
 const chosen=issues.filter(r=>r.reason===(id==='request-jobs'?'jobs':'access'));
 if(chosen.length)return {...chosen[0],id,homes:[...new Set(chosen.flatMap(r=>r.homes))],count:chosen.reduce((n,r)=>n+r.count,0)};
 if(id==='request-roads'){const ids=[...c.zoneCells()].filter(cell=>!c.tile(cell).networkConnected).map(cell=>cell.z*c.size+cell.x);if(!ids.length)for(const road of c.network.ids())if(!c.network.isMain(road))ids.push(road);if(ids.length){const first=ids[0];return {id,reason:'access',title:'道路網がつながっていません',count:ids.length,unit:'か所',homes:ids,cell:{x:first%c.size,z:Math.floor(first/c.size)}};}}
}
