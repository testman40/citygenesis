import {fictionalName,householdName} from './Names';
import {roadLanes} from '../traffic/RoadLanes';
import {sidewalkPath,footPose,FootWalker,type FootPoint} from '../people/Sidewalks';
import type {City} from '../simulation/City';
import type {Commute,VehiclePose} from '../traffic/Traffic';
import {Pathfinder} from '../traffic/Pathfinder';
import {buildLaneJourney,laneVehicle,type LaneLoop} from '../traffic/LanePath';
export type Household=[id:number,home:number,size:number,kind:number];
export interface Arrival {household:Household;path:number[];progress:number;blocked:boolean}
export interface ResidentState {version:1;nameSeed?:number;nextId:number;time:number;households:Household[];arrivals:Arrival[]}
export interface Person {id:string;household:number;home:number;name:string;group:'子供'|'大人'|'高齢者';index:number;moving:boolean}
export interface Activity {crossing?:number;label:string;mode:string;x:number;z:number;path:number[];progress:number;moving:boolean;work?:number;vehicle?:VehiclePose}
export type Place={id:number;kind:'school'|'shop'|'park'};
const groups=(h:Household):Person['group'][]=>Array.from({length:h[2]},(_,i)=>h[3]===3?'高齢者':h[3]===0?(['大人','大人','子供','高齢者'] as const)[i]:h[3]===1?(i<2?'大人':'子供'):'大人');
export class Residents {
 readonly state:ResidentState;tracked:string|undefined;
 private counts=new Map<number,number>();private adults=new Map<number,number>();private families=new Map<number,Household>();private offsets=new Map<number,number>();private gatewayRevision=-1;private gatewayCache:number[]=[];
 private walkers=new Map<string,FootWalker>();private footPaths=new Map<string,FootPoint[]>();private finder:Pathfinder|undefined;private paths=new Map<string,number[]>();private lanes=new Map<string,LaneLoop>();private pathRevision=-1;private jobsRevision=-1;private jobs=new Map<number,Commute[]>();private places:Place[]=[];private homeFamilies=new Map<number,Household[]>();readonly ageCounts={'子供':0,'大人':0,'高齢者':0};private populationValue=0;private adultValue=0;private retry=0;
 constructor(state?:ResidentState){this.state=state?structuredClone(state):{version:1,nameSeed:Math.floor(Math.random()*0x100000000),nextId:1,time:6,households:[],arrivals:[]};this.reindex();}
 snapshot():ResidentState{return structuredClone(this.state);}
 get population(){return this.populationValue;}
 get workforce(){return this.adultValue;}
 get households(){return this.state.households;}
 atHome(id:number){return this.homeFamilies.get(id)??[];}
 occupancy(id:number){return this.counts.get(id)??0;}
 workers(id:number){return this.adults.get(id)??0;}
 private reindex(){this.counts.clear();this.adults.clear();this.homeFamilies.clear();this.ageCounts.子供=this.ageCounts.大人=this.ageCounts.高齢者=0;this.families.clear();this.offsets.clear();this.populationValue=this.adultValue=0;for(const h of this.state.households){this.families.set(h[0],h);const familyList=this.homeFamilies.get(h[1])??[];familyList.push(h);this.homeFamilies.set(h[1],familyList);for(const group of groups(h))this.ageCounts[group]++;this.offsets.set(h[0],this.adults.get(h[1])??0);this.counts.set(h[1],(this.counts.get(h[1])??0)+h[2]);const adults=groups(h).filter(g=>g==='大人').length;this.adults.set(h[1],(this.adults.get(h[1])??0)+adults);this.populationValue+=h[2];this.adultValue+=adults;}this.jobsRevision=-1;}
 seed(homes:{id:number;capacity:number}[],population:number){let left=population;for(const home of homes){let count=Math.min(home.capacity,left);while(count>0){const size=Math.min(4,count);this.state.households.push([this.state.nextId++,home.id,size,0]);left-=size;count-=size;}}if(left)throw new Error('既存住民を収容できる住宅がありません');this.reindex();}
 reconcile(homes:{id:number;capacity:number}[],places:Place[],city?:City){
  this.places=places;if(city)for(const a of this.state.arrivals)if(a.path.some((id,i)=>!city.network.allows(id,'car')||(i>0&&!city.network.canTravel(a.path[i-1],id,'car'))))a.blocked=true;const capacity=new Map(homes.map(h=>[h.id,h.capacity])),used=new Map<number,number>();let changed=false;
  this.state.households=this.state.households.filter(h=>{const room=(capacity.get(h[1])??0)-(used.get(h[1])??0);if(room<=0){changed=true;return false;}if(h[2]>room){h[2]=room;changed=true;}used.set(h[1],(used.get(h[1])??0)+h[2]);return true;});
  this.state.arrivals=this.state.arrivals.filter(a=>{const h=a.household,room=(capacity.get(h[1])??0)-(used.get(h[1])??0);if(room<h[2])return false;used.set(h[1],(used.get(h[1])??0)+h[2]);return true;});if(changed)this.reindex();
 }
 gateways(city:City){if(this.gatewayRevision!==city.network.revision){const n=city.size;this.gatewayCache=[...city.network.ids()].filter(id=>city.network.isMain(id)&&city.network.allows(id,'car')&&(id<n||id>=n*(n-1)||id%n===0||id%n===n-1)).sort((a,b)=>a-b);this.gatewayRevision=city.network.revision;}return this.gatewayCache;}
 private route(city:City,from:number,to:number,mode:'car'|'walk'|'bike'='car'){
  if(this.pathRevision!==city.network.revision){this.paths.clear();this.footPaths.clear();this.lanes.clear();this.finder=new Pathfinder(city.network,256,'car');this.pathRevision=city.network.revision;}
  const key=mode+':'+from+':'+to;if(this.paths.has(key))return this.paths.get(key)!;this.finder!.resetBudget();const path=(mode==='car'?this.finder!:new Pathfinder(city.network,256,mode)).path(from,to)??[];if(this.paths.size>=256)this.paths.delete(this.paths.keys().next().value!);this.paths.set(key,path);return path;
 }
 private access(city:City,id:number){return city.network.access(id).filter(r=>city.network.isMain(r));}
 private entryPath(city:City,road:number){
  if(!city.network.allows(road,'car'))return [];this.route(city,road,road);const key='entry:'+road,cached=this.paths.get(key);if(cached)return cached;const n=city.size,queue=[road],parent=new Map<number,number>();parent.set(road,road);let path:number[]=[];
  for(let i=0;i<queue.length;i++){const id=queue[i];if(id<n||id>=n*(n-1)||id%n===0||id%n===n-1){path=[id];let cursor=id;while(cursor!==road){cursor=parent.get(cursor)!;path.push(cursor);}break;}for(const previous of city.network.adjacent(id))if(!parent.has(previous)&&city.network.canTravel(previous,id,'car')){parent.set(previous,id);queue.push(previous);}}
  if(this.paths.size>=256)this.paths.delete(this.paths.keys().next().value!);this.paths.set(key,path);return path;
 }
 plan(city:City,limit:number){
  if(limit<=0||this.state.arrivals.length>=16||!this.gateways(city).length)return;
  const reserved=new Map<number,number>();for(const a of this.state.arrivals)reserved.set(a.household[1],(reserved.get(a.household[1])??0)+a.household[2]);
  const kind=this.state.nextId%5===0?3:this.state.nextId%3===0?2:1,size=Math.min(Math.floor(limit),kind===1?4:2);if(size<1)return;
  const candidates=city.residentHomes().filter(home=>home.capacity-this.occupancy(home.id)-(reserved.get(home.id)??0)>=size&&(city.waterUtility?.status(home.id).service??city.hydrology?.at(home.id)??city.waterRatio)>=city.config.growthSupplyThreshold);
  for(const home of candidates.slice(0,128))for(const road of this.access(city,home.id)){const path=this.entryPath(city,road);if(path.length){this.state.arrivals.push({household:[this.state.nextId++,home.id,size,kind],path:[...path],progress:0,blocked:false});return;}}
 }
 leave(count:number){let remaining=count;while(remaining>0&&this.state.households.length){const h=this.state.households.at(-1)!,n=Math.min(h[2],remaining);h[2]-=n;remaining-=n;if(!h[2])this.state.households.pop();}this.reindex();}
 advance(city:City,seconds:number){
  if(!Number.isFinite(seconds)||seconds<0)throw new Error('住民の経過時間が不正です');if(!seconds)return false;this.state.time+=seconds/city.config.stepSeconds;let changed=false;
  const retry=this.state.time>=this.retry;if(retry)this.retry=this.state.time+1;
  for(const a of this.state.arrivals){const intact=a.path.every((id,i)=>city.network.allows(id,'car')&&(!i||city.network.canTravel(a.path[i-1],id,'car')));if(!intact||a.blocked){a.blocked=true;if(retry){const current=a.path[Math.min(a.path.length-1,Math.floor(a.progress))];if(city.network.allows(current,'car'))for(const road of this.access(city,a.household[1])){const path=this.route(city,current,road);if(path.length){a.path=[...path];a.progress=0;a.blocked=false;break;}}}if(a.blocked)continue;}
   a.progress+=seconds*2.5;if(a.progress>=Math.max(1,a.path.length-1)){const service=city.waterUtility?.status(a.household[1]).service??city.hydrology?.at(a.household[1])??city.waterRatio;if(service>=city.config.growthSupplyThreshold&&city.powerRatio>=city.config.growthSupplyThreshold){this.state.households.push(a.household);changed=true;}else a.progress=Math.max(1,a.path.length-1)-.0001;}
  }
  if(changed){const arrived=new Set(this.state.households.map(h=>h[0]));this.state.arrivals=this.state.arrivals.filter(a=>!arrived.has(a.household[0]));this.reindex();}return changed;
 }
 householdName(h:Household){return householdName(h[0],this.state.nameSeed??0);}
 members(h:Household,moving=false):Person[]{return groups(h).map((group,index)=>({id:h[0]+':'+index,household:h[0],home:h[1],name:fictionalName(h[0],this.state.nameSeed??0,index),group,index,moving}));}
 person(id:string){const match=/^(\d+):([0-3])$/.exec(id);if(!match)return;const family=Number(match[1]),index=Number(match[2]),h=this.families.get(family)??this.state.arrivals.find(a=>a.household[0]===family)?.household;return h?this.members(h,!this.families.has(family))[index]:undefined;}
 job(city:City,person:Person){if(person.group!=='大人'||person.moving)return;if(this.jobsRevision!==city.traffic.solveRevision){this.jobs.clear();for(const r of city.traffic.routes){const list=this.jobs.get(r.home)??[];list.push(r);this.jobs.set(r.home,list);}this.jobsRevision=city.traffic.solveRevision;}
  const h=this.families.get(person.household)!;let ordinal=(this.offsets.get(h[0])??0)+groups(h).slice(0,person.index).filter(g=>g==='大人').length;
  for(const route of this.jobs.get(person.home)??[]){if(ordinal<route.count){const m=route.movement;return {route,employed:ordinal<route.served,mode:!m?'車':ordinal<m.walk?'徒歩':ordinal<m.walk+m.bus?'バス':ordinal<m.walk+m.bus+(m.bike??0)?'自転車':'車',path:m&&ordinal>=m.walk&&ordinal<m.walk+m.bus?(m.busPath??route.path):m&&ordinal>=m.walk+m.bus&&ordinal<m.walk+m.bus+(m.bike??0)?(m.bikePath??route.path):route.path};}ordinal-=route.count;}
 }
 private pose(city:City,path:number[],fraction:number){const phase=Math.max(0,Math.min(.999999,fraction))*Math.max(0,path.length-1),index=Math.floor(phase),a=path[index],b=path[Math.min(index+1,path.length-1)]??a,t=phase-index;return {x:(a%city.size+.5)*(1-t)+(b%city.size+.5)*t,z:(Math.floor(a/city.size)+.5)*(1-t)+(Math.floor(b/city.size)+.5)*t};}
 private car(city:City,path:number[],fraction:number,id:string,bike=false):VehiclePose|undefined{
  if(path.length<2)return;const key=city.network.revision+':'+bike+':'+path.join(',');let lane=this.lanes.get(key);if(!lane){lane=buildLaneJourney(path,city.size,.1,new Map(),road=>city.network.adjacent(road).length>=3,bike?((road,previous,next,after)=>({...roadLanes(city.network)(road,previous,next,after),offset:city.network.profile(road).lanes<=1?.12:.35,fromOffset:city.network.profile(previous).lanes<=1?.12:.35,scale:1,speed:2})):roadLanes(city.network,path[0]%2)).loop;if(this.lanes.size>=128)this.lanes.delete(this.lanes.keys().next().value!);this.lanes.set(key,lane);}const phase=Math.min(lane.duration-1e-5,Math.max(0,fraction)*lane.duration);return laneVehicle(lane,phase,id,bike?'bike':'car',phase);
 }
 activity(city:City,person:Person,time=this.state.time):Activity{
  const home={x:person.home%city.size+.5,z:Math.floor(person.home/city.size)+.5},arrival=this.state.arrivals.find(a=>a.household[0]===person.household);
  if(arrival){const fraction=arrival.progress/Math.max(1,arrival.path.length-1),vehicle=this.car(city,arrival.path,fraction,'arrival:'+arrival.household[0]);return {label:arrival.blocked?'転入道路の復旧待ち':'マップ外から転入中',mode:'転入車',...(vehicle??this.pose(city,arrival.path,fraction)),path:arrival.path,progress:fraction,moving:!arrival.blocked,vehicle};}
  const hour=time%24,offset=(person.household*17+person.index*13)%60/60,job=this.job(city,person);let target:number|undefined,mode='徒歩',start=10+offset,end=13+offset,label='外出';
  if(job?.employed){target=job.route.work;mode=job.mode;start=7+offset*2;end=18+offset;label='勤務';}
  if(!job?.employed||hour>=19+offset){
   target=undefined;
   const kind=person.group==='子供'?'school':person.group==='高齢者'?'park':job?.employed&&person.household%3===0?'park':'shop';
   let best=Infinity;
   for(const place of this.places.filter(p=>p.kind===kind)){
    const distance=Math.abs(place.id%city.size-person.home%city.size)+Math.abs(Math.floor(place.id/city.size)-Math.floor(person.home/city.size));
    if(distance<best){best=distance;target=place.id;}
   }
   label=kind==='school'?'通学':kind==='park'?'公園で過ごす':'買い物';
   start=job?.employed?19+offset:8+offset*10;end=start+3;
   if(kind==='school'){start=8+offset;end=15+offset;}
   mode='徒歩';
   if(target!==undefined&&person.group==='大人'){
    const from=this.access(city,person.home),to=this.access(city,target);
    const drive=from.length&&to.length?this.route(city,from[0],to[0],'car'):[];
    if(drive.length>10&&drive.length<=31)mode='車';
   }
  }
  const base:Activity={label:person.group==='大人'&&!job?.employed?'在宅・求職':'在宅',mode:'滞在',...home,path:[],progress:0,moving:false,work:job?.route.work};
  if(target===undefined||hour<start)return base;
  const from=this.access(city,person.home)[0],to=this.access(city,target)[0];if(from===undefined||to===undefined)return {...base,label:'外出先への道路待ち'};
  const commuting=label==='勤務',outward=commuting?job!.path:this.route(city,from,to,mode==='車'?'car':'walk');if(!outward.length||outward.some((id,i)=>i>0&&!city.network.canTravel(outward[i-1],id)))return {...base,label:'通行経路なし'};
  const travel=Math.min(2,(end-start)/3,Math.max(.4,.07*(mode==='車'?outward.reduce((sum,id)=>sum+40/city.network.profile(id).speed,0):mode==='自転車'?outward.length*2:outward.length))),footKey=city.network.revision+':'+person.home+':'+target+':'+person.id,day=Math.floor(time/24),pendingOut=arguments.length<3&&mode==='徒歩'&&this.walkers.get(footKey+':false:'+day),pendingReturn=arguments.length<3&&mode==='徒歩'&&this.walkers.get(footKey+':true:'+day),finishing=!!pendingOut&&pendingOut.progress<1;if(hour>=end&&(!pendingReturn||pendingReturn.progress>=1)&&!finishing)return base;if(hour>=start+travel&&hour<end-travel&&!finishing)return {...base,label,mode:'滞在',x:target%city.size+.5,z:Math.floor(target/city.size)+.5,path:outward,progress:1};
  const returning=hour>=end-travel&&!finishing,path=returning?this.route(city,outward.at(-1)!,outward[0],mode==='車'?'car':mode==='自転車'?'bike':'walk'):outward;if(!path.length)return {...base,label:'帰宅経路なし'};
  const fraction=(hour-(returning?end-travel:start))/travel;if(mode==='徒歩'){const key=city.network.revision+':'+person.home+':'+target;let foot=this.footPaths.get(key);if(!foot){foot=sidewalkPath(city.network,person.home,target);if(this.footPaths.size>=256)this.footPaths.clear();this.footPaths.set(key,foot);}const journey=returning?foot.slice().reverse().map((p,i,a)=>({...p,crossing:a[i-1]?.crossing})):foot,walkerKey=key+':'+person.id+':'+returning+':'+Math.floor(time/24);let walker=this.walkers.get(walkerKey);if(!walker){if(this.walkers.size>=256)this.walkers.clear();walker=new FootWalker();this.walkers.set(walkerKey,walker);}const pose=arguments.length>2?footPose(journey,fraction,()=>true):walker.step(journey,fraction,walkerKey,id=>city.network.pedestrianGreen(id));if(!pose)return {...base,label:'歩道・横断歩道の接続待ち'};return {...base,...pose,label:pose.waiting?'横断待ち':returning?'帰宅中':label==='勤務'?'通勤中':label==='通学'?'通学中':label+'へ移動',mode,path,progress:arguments.length>2?Math.max(0,Math.min(1,fraction)):walker.progress,moving:!pose.waiting};}const displayPath=mode==='徒歩'?(returning?[target,...path,person.home]:[person.home,...path,target]):path,vehicle=(mode==='車'||mode==='自転車')?this.car(city,path,fraction,'resident:'+person.id,mode==='自転車'):undefined;
  return {...base,label:returning?'帰宅中':label==='勤務'?'通勤中':label==='通学'?'通学中':label+'へ移動',mode,...(vehicle??this.pose(city,displayPath,fraction)),path:displayPath,progress:fraction,moving:true,vehicle};
 }
 vehicles(city:City){const result:VehiclePose[]=[];for(const a of this.state.arrivals){const p=this.members(a.household,true)[0],v=this.activity(city,p).vehicle;if(v)result.push(v);}const stride=Math.max(1,Math.ceil(this.state.households.length/64));for(let i=0;i<this.state.households.length&&result.length<95;i+=stride)for(const person of this.members(this.state.households[i])){if(person.group!=='大人')continue;const v=this.activity(city,person).vehicle;if(v)result.push(v);if(result.length>=95)break;}if(this.tracked){const p=this.person(this.tracked),v=p&&this.activity(city,p).vehicle;if(v&&!result.some(r=>r.id===v.id))result.unshift(v);}return result.slice(0,96);}
}
