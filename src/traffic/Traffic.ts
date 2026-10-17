import {buildDirectedLaneLoop,buildLaneLoop,laneVehicle,type LaneLoop} from './LanePath';
import {VEHICLE_VISUAL,type VehicleKind} from './visualConfig';
import {DynamicRouting,type RoutingState,type CarLeg} from './DynamicRouting';
import {RoadNetwork} from '../simulation/RoadNetwork';
import type {Balance} from '../simulation/config';
import type {Transit,ModalChoice} from '../transit/Transit';
import {Pathfinder} from './Pathfinder';
export interface Home {id:number;capacity:number;access:number[]}
export interface Workplace {id:number;capacity:number;kind:'commercial'|'industrial';access:number[]}
export interface Commute {home:number;work:number;kind:Workplace['kind'];count:number;path:number[];distance:number;minutes:number;served:number}
export interface TrafficState {ticks:number;remainder:number;capacities:[number,number][];routing?:RoutingState}
export interface VehiclePose {x:number;z:number;angle:number;roadA?:number;roadB?:number;mapSize?:number;laneAligned?:boolean;trajectory?:LaneLoop;journeyTime?:number;clockTime?:number;id?:string;kind?:VehicleKind;junction?:boolean;piece?:number}
let fractionScratch=new Float64Array(),orderScratch=new Uint32Array();
export function apportion(total:number,weights:number[]):number[]{
 const sum=weights.reduce((a,b)=>a+b,0);if(!sum||!total)return weights.map(()=>0);if(total===sum)return weights.slice();const n=weights.length,result=new Array<number>(n);if(fractionScratch.length<n){fractionScratch=new Float64Array(n);orderScratch=new Uint32Array(n);}let assigned=0;
 for(let i=0;i<n;i++){const raw=weights[i]*total/sum,value=Math.floor(raw);result[i]=value;assigned+=value;fractionScratch[i]=raw-value;orderScratch[i]=i;}
 const left=total-assigned;if(left>0){const order=orderScratch.subarray(0,n);order.sort((a,b)=>fractionScratch[b]-fractionScratch[a]||a-b);for(let i=0;i<left;i++)result[order[i]]++;}return result;
}
export class Traffic {
 solveRevision=0;readonly routing:DynamicRouting;routingMonth=0;allowRebalance=false;private pathsDynamic=false;private carCounts:number[]=[];private carLegs:CarLeg[][]=[];analysis={baselineMinutes:0,actualCarMinutes:0,avoidedMinutes:0,splitOD:0,carDemand:0,busRoadDemand:0};
 residentPopulation:number|undefined;readonly pathfinder:Pathfinder;
 routes:Commute[]=[];volumes=new Map<number,number>();private capacities=new Map<number,number>();
 employed=0;commercialEmployed=0;industrialEmployed=0;averageMinutes=0;averageDistance=0;congestionRate=0;unassigned=0;pending=0;
 private laneCache=new Map<string,LaneLoop>();
 private samples:{path:number[];segments:number[];trip:number;count:number;trajectory?:LaneLoop}[]=[];private sampleRevision=-1;
 private rankSignature='';private ranks=new Map<number,Uint32Array>();private rankEntries=0;
 private previousCapacities=new Map<number,number>();
 private idOrder=new Uint32Array();private rankBuckets=new Uint32Array();private rankDistances=new Uint32Array();private rankScratch=new Uint32Array();
 private candidateOrder(home:Home,workplaces:Workplace[]){
  const hit=this.ranks.get(home.id);if(hit)return hit;const span=this.graph.size*2-1,hx=home.id%this.graph.size,hz=Math.floor(home.id/this.graph.size),length=workplaces.length;
  if(this.rankBuckets.length!==span*2)this.rankBuckets=new Uint32Array(span*2);if(this.rankDistances.length!==length){this.rankDistances=new Uint32Array(length);this.rankScratch=new Uint32Array(length);}this.rankBuckets.fill(0);
  for(let i=0;i<length;i++){const w=workplaces[i],bucket=(w.kind==='industrial'?0:span)+Math.abs(w.id%this.graph.size-hx)+Math.abs(Math.floor(w.id/this.graph.size)-hz);this.rankDistances[i]=bucket;this.rankBuckets[bucket]++;}
  let sum=0;for(let i=0;i<this.rankBuckets.length;i++){const n=this.rankBuckets[i];this.rankBuckets[i]=sum;sum+=n;}
  const retain=this.rankEntries+length<=4*1024*1024,order=retain?new Uint32Array(length):this.rankScratch;
  for(const i of this.idOrder)order[this.rankBuckets[this.rankDistances[i]]++]=i;
  if(retain){this.ranks.set(home.id,order);this.rankEntries+=length;}return order;
 }
 private volumeBuffer:Float64Array;private multiplierBuffer:Float64Array;
 private inputValues=new Float64Array();private inputLength=-1;private rankValues=new Float64Array();private rankLength=-1;
 private inputsMatch(homes:Home[],workplaces:Workplace[],workers:number){let length=8+this.capacities.size*2;for(const h of homes)length+=3+h.access.length;for(const w of workplaces)length+=4+w.access.length;if(this.inputValues.length<length){const next=new Float64Array(Math.max(length,this.inputValues.length*2));next.set(this.inputValues);this.inputValues=next;}let same=this.signature!==''&&this.inputLength===length,index=0;const put=(v:number)=>{if(!Object.is(this.inputValues[index],v))same=false;this.inputValues[index++]=v;};put(this.graph.revision);put(this.routing.enabled?1:0);put(this.transit?.revision??0);put(this.transit?.stops.size?(this.residentPopulation??NaN):0);put(workers);put(homes.length);put(workplaces.length);put(this.capacities.size);for(const h of homes){put(h.id);put(h.capacity);put(h.access.length);for(const id of h.access)put(id);}for(const w of workplaces){put(w.id);put(w.kind==='industrial'?1:0);put(w.capacity);put(w.access.length);for(const id of w.access)put(id);}for(const [id,v] of this.capacities){put(id);put(v);}this.inputLength=length;this.signature='valid';return same;}
 private ranksMatch(workplaces:Workplace[]){const length=workplaces.length*2;if(this.rankValues.length<length){const next=new Float64Array(length);next.set(this.rankValues);this.rankValues=next;}let same=this.rankLength===length;for(let i=0;i<workplaces.length;i++){const w=workplaces[i],kind=w.kind==='industrial'?1:0;if(this.rankValues[i*2]!==w.id||this.rankValues[i*2+1]!==kind)same=false;this.rankValues[i*2]=w.id;this.rankValues[i*2+1]=kind;}this.rankLength=length;return same;}
 private signature='';private ticks=0;private remainder=0;
 constructor(readonly graph:RoadNetwork,readonly config:Balance,readonly transit?:Transit){this.routing=new DynamicRouting(graph,config);this.pathfinder=new Pathfinder(graph,config.maxPathCache);this.volumeBuffer=new Float64Array(graph.size*graph.size);this.multiplierBuffer=new Float64Array(graph.size*graph.size);}
 capacity(id:number){return this.capacities.get(id)??this.config.roadCapacity;}
 volume(id:number){return this.volumes.get(id)??0;}
 congestion(id:number){return this.volume(id)/this.capacity(id);}
 multiplier(id:number){return Math.min(this.config.maxCongestionMultiplier,1+this.config.congestionFactor*this.congestion(id)**this.config.congestionExponent);}
 setCapacity(id:number,capacity:number){if(!this.graph.has(id)||!Number.isFinite(capacity)||capacity<=0||capacity>1e6)throw new Error('道路容量が不正です');this.capacities.set(id,capacity);this.signature='';}
 adoptGraphRevision(from:number,to:number){if(this.sampleRevision===from)this.sampleRevision=to;}
 get displayTime(){return this.ticks*.05*this.config.displayMinutesPerSecond;}
 snapshot():TrafficState {return {...(this.routing.enabled?{routing:this.routing.snapshot()}:{}),ticks:this.ticks,remainder:this.remainder,capacities:[...this.capacities].filter(([id])=>this.graph.has(id)).sort((a,b)=>a[0]-b[0])};}
 restore(s:TrafficState){if(s.routing)this.routing.restore(s.routing);this.ticks=s.ticks;this.remainder=s.remainder;this.capacities=new Map(s.capacities);this.signature='';}
 advance(seconds:number){if(!Number.isFinite(seconds)||seconds<0)throw new Error('交通時間が不正です');this.remainder+=seconds;const ticks=Math.floor((this.remainder+1e-9)/.05);this.ticks+=ticks;this.remainder=Math.max(0,this.remainder-ticks*.05);}
 solve(homes:Home[],workplaces:Workplace[],workers:number):Set<number>{const iterator=this.solveSteps(homes,workplaces,workers);for(let next=iterator.next();;next=iterator.next())if(next.done)return next.value;}
 *solveSteps(homes:Home[],workplaces:Workplace[],workers:number):Generator<void,Set<number>>{
  const same=this.inputsMatch(homes,workplaces,workers);
  if(same&&!(this.allowRebalance&&this.routing.due(this.routingMonth)))return new Set();
  const previous=this.volumes,changed=new Set<number>();if(!this.ranksMatch(workplaces)){this.ranks.clear();this.rankEntries=0;this.idOrder=Uint32Array.from(workplaces.map((_,i)=>i).sort((a,b)=>workplaces[a].id-workplaces[b].id));}this.routes=[];this.volumes=new Map();this.pathfinder.resetBudget();
  const available=workplaces.map(w=>w.capacity),people=apportion(workers,homes.map(h=>h.capacity));this.pending=0;this.volumeBuffer.fill(0);const touched:number[]=[];
  let attempts=0,logicalSearches=0;const dynamic=this.routing.enabled;
  for(let hi=0;hi<homes.length;hi++){
   if(this.graph.size>=256||hi%8===0)yield;
   const home=homes[hi];let remaining=people[hi];
   if(attempts>=this.config.maxRouteSearches){this.pending+=remaining;continue;}
   if(!remaining)continue;
   const candidates=this.candidateOrder(home,workplaces);
   for(const i of candidates){const w=workplaces[i];if(!available[i])continue;
    if(!remaining)break;
    if(attempts>=this.config.maxRouteSearches||(dynamic?logicalSearches>=this.config.maxRouteSearches:this.pathfinder.expanded>=this.config.maxPathExpansions)){this.pending+=remaining;break;}
    if(this.graph.size>=256&&attempts%4===0)yield;attempts++;let path:number[]|null=null;
    accessLoop:for(const start of home.access)for(const goal of w.access){if(dynamic?logicalSearches>=this.config.maxRouteSearches:this.pathfinder.searches>=this.config.maxRouteSearches||this.pathfinder.expanded>=this.config.maxPathExpansions)break accessLoop;logicalSearches++;if((this.graph.size>=256&&logicalSearches%4===0)||(dynamic&&logicalSearches%8===0))yield;const p=this.pathfinder.path(start,goal,dynamic?this.pathfinder.expanded+this.graph.size*this.graph.size+1:this.config.maxPathExpansions);if(p&&(!path||p.length<path.length))path=p;}
    if(!path)continue;
    const distance=path.length-1,minutes=this.config.accessMinutes*2+distance*this.config.minutesPerRoad;
    if(minutes>this.config.maxCommuteMinutes)continue;
    const count=Math.min(remaining,available[i]);remaining-=count;available[i]-=count;
    this.routes.push({home:home.id,work:w.id,kind:w.kind,count,path,distance,minutes,served:0});
    for(const id of path){if(!this.volumeBuffer[id])touched.push(id);this.volumeBuffer[id]+=count*2;}
   }
  }
  let fixedBusVolume=0;const modal:ModalChoice[]=[];const carServed:number[]=[];const transit=this.transit;const useTransit=!!transit?.stops.size;
  if(useTransit){
   transit!.begin(homes,workers,this.config.workforceRatio,this.residentPopulation);
   const predicted=(id:number)=>Math.min(this.config.maxCongestionMultiplier,1+this.config.congestionFactor*(this.volumeBuffer[id]/this.capacity(id))**this.config.congestionExponent);
   for(let ri=0;ri<this.routes.length;ri++){if(ri%8===0)yield;const r=this.routes[ri];let carMinutes=this.config.accessMinutes*2;for(let i=1;i<r.path.length;i++)carMinutes+=this.config.minutesPerRoad*(predicted(r.path[i-1])+predicted(r.path[i]))/2;modal.push(transit!.choose(r.home,r.work,r.count,carMinutes,this.config.minutesPerRoad,id=>1));}
   this.volumeBuffer.fill(0);touched.length=0;
   const add=(id:number,n:number)=>{if(!this.volumeBuffer[id])touched.push(id);this.volumeBuffer[id]+=n;};
   for(let i=0;i<this.routes.length;i++)if(modal[i].car)for(const id of this.routes[i].path)add(id,modal[i].car*2);
   for(const service of transit!.services.values())if(service.active){const demand=transit!.roadDemand(service);for(const id of demand.path){add(id,demand.amount);fixedBusVolume+=demand.amount;}}
  }
  else if(transit){transit.begin([],workers,this.config.workforceRatio);transit.carUsers=0;}
  const carCounts=this.routes.map((r,i)=>useTransit?modal[i].car:r.count);
  const useRouting=this.routing.enabled&&this.routes.some(r=>this.graph.componentHasCycle(r.path[0]));this.pathsDynamic=useRouting;this.carCounts=carCounts;if(this.routing.enabled&&!useRouting)this.routing.clearUnique();this.carLegs=useRouting?this.routing.reconcile(this.routes,carCounts):[];
  const baselineVolumes=useRouting?new Float64Array(this.volumeBuffer):this.volumeBuffer;let baselineTime=0,carDemand=0;for(let i=0;i<this.routes.length;i++){if(useRouting&&carCounts[i])baselineTime+=carCounts[i]*this.routing.time(this.routes[i].path,baselineVolumes,id=>this.capacity(id));carDemand+=carCounts[i];}
  let busRoadDemand=fixedBusVolume;if(useRouting){
   for(let i=0;i<this.routes.length;i++)for(const id of this.routes[i].path)this.volumeBuffer[id]-=carCounts[i]*2;
   
   for(const legs of this.carLegs)for(const l of legs)for(const id of l.path)this.volumeBuffer[id]+=l.count*2;
   if(this.allowRebalance)yield* this.routing.rebalance(this.routes,this.carLegs,this.volumeBuffer,id=>this.capacity(id),this.routingMonth);
   touched.length=0;for(let id=0;id<this.volumeBuffer.length;id++)if(this.volumeBuffer[id]>0)touched.push(id);
  }
  if(this.routing.enabled&&!useRouting&&this.allowRebalance)this.routing.skipUnique(this.routingMonth);
  for(const id of touched)this.volumes.set(id,this.volumeBuffer[id]);
  for(const id of touched)this.multiplierBuffer[id]=this.multiplier(id);
  let actualCarTime=0;this.employed=0;this.commercialEmployed=0;this.industrialEmployed=0;let time=0,distance=0,commuters=0;
  for(let ri=0;ri<this.routes.length;ri++){
   if(this.graph.size>=256&&ri%16===0)yield;const route=this.routes[ri];
   route.minutes=this.config.accessMinutes*2;
   // Half of each endpoint's cost is included for every road edge.
   if(!useRouting&&carCounts[ri])for(let i=1;i<route.path.length;i++)route.minutes+=this.config.minutesPerRoad*(this.multiplierBuffer[route.path[i-1]]+this.multiplierBuffer[route.path[i]])/2;
   let dynamicCarServed=0,dynamicCarTime=0;if(useRouting)for(const l of this.carLegs[ri]){const minutes=this.routing.time(l.path,this.volumeBuffer,id=>this.capacity(id));dynamicCarTime+=minutes*l.count;if(minutes<=this.config.maxCommuteMinutes)dynamicCarServed+=l.count;}
   else{dynamicCarTime=route.minutes*carCounts[ri];dynamicCarServed=route.minutes<=this.config.maxCommuteMinutes?carCounts[ri]:0;}actualCarTime+=dynamicCarTime;if(useRouting&&carCounts[ri])route.minutes=dynamicCarTime/carCounts[ri];
   route.served=this.routing.enabled?dynamicCarServed:route.minutes<=this.config.maxCommuteMinutes?route.count:0;
   if(useTransit){const m=modal[ri],carMinutes=route.minutes;let busMinutes=0;if(m.busChoice){busMinutes=m.busChoice.walk+transit!.config.waitMinutes+m.busChoice.stops*transit!.config.dwellMinutes;for(let i=1;i<m.busChoice.path.length;i++)busMinutes+=this.config.minutesPerRoad*(this.multiplier(m.busChoice.path[i-1])+this.multiplier(m.busChoice.path[i]))/2;}
    const walk=m.walkMinutes<=this.config.maxCommuteMinutes?m.walk:0,bus=busMinutes<=this.config.maxCommuteMinutes?m.bus:0,car=this.routing.enabled?dynamicCarServed:carMinutes<=this.config.maxCommuteMinutes?m.car:0;
    carServed[ri]=car;route.served=walk+bus+car;route.minutes=route.count?(m.walk*m.walkMinutes+m.bus*busMinutes+m.car*carMinutes)/route.count:0;transit!.record(m,walk,bus,car,busMinutes);
   }else if(transit)transit.carUsers+=route.served;
   this.employed+=route.served;if(route.kind==='commercial')this.commercialEmployed+=route.served;else this.industrialEmployed+=route.served;
   commuters+=route.count;time+=route.minutes*route.count;distance+=route.distance*route.count;if(useRouting)distance+=this.carLegs[ri].reduce((n,l)=>n+l.count*(l.path.length-1),0)-carCounts[ri]*route.distance;
  }
  this.averageMinutes=commuters?time/commuters:0;this.averageDistance=commuters?distance/commuters:0;
  this.congestionRate=this.volumes.size?[...this.volumes.keys()].filter(id=>this.congestion(id)>1).length/this.volumes.size:0;
  this.unassigned=workers-this.employed;
  for(const id of new Set([...previous.keys(),...this.volumes.keys(),...this.previousCapacities.keys(),...this.capacities.keys()])){
    if((previous.get(id)??0)!==this.volume(id)||(this.previousCapacities.get(id)??this.config.roadCapacity)!==this.capacity(id))changed.add(id);
  }
  this.previousCapacities=new Map(this.capacities);
  for(const id of this.capacities.keys())if(!this.graph.has(id))this.capacities.delete(id);
  this.analysis={baselineMinutes:carDemand?(useRouting?baselineTime:actualCarTime)/carDemand:0,actualCarMinutes:carDemand?actualCarTime/carDemand:0,avoidedMinutes:useRouting&&carDemand?(baselineTime-actualCarTime)/carDemand:0,splitOD:this.carLegs.filter(l=>l.length>1).length,carDemand,busRoadDemand};
  if(transit)transit.finish(this.config.minutesPerRoad,id=>this.multiplier(id));
  this.samples=[];const usable=(useRouting?this.carLegs.flatMap((legs,ri)=>legs.map(l=>({...this.routes[ri],path:l.path,served:this.routing.time(l.path,this.volumeBuffer,id=>this.capacity(id))<=this.config.maxCommuteMinutes?l.count:0}))):this.routes.map((r,i)=>useTransit?{...r,served:carServed[i]}:r)).filter(r=>r.served>0&&r.path.length>1),total=usable.reduce((a,r)=>a+r.served,0);
  const distribution=apportion(Math.min(this.config.maxDisplayVehicles,total),usable.map(r=>r.served));
  for(let i=0;i<usable.length;i++){if(!distribution[i])continue;const path=usable[i].path,segments:number[]=[];let trip=0;
    for(let n=1;n<path.length;n++){trip+=this.config.minutesPerRoad*(this.multiplierBuffer[path[n-1]]+this.multiplierBuffer[path[n]])/2;segments.push(trip);}
    this.samples.push({path,segments,trip,count:distribution[i],trajectory:undefined});
  }
  this.solveRevision++;this.sampleRevision=this.graph.revision;
  return changed;
 }
 displaySnapshot():Traffic{return Object.assign(Object.create(Object.getPrototypeOf(this)),this,{volumeBuffer:this.volumeBuffer.slice(),multiplierBuffer:this.multiplierBuffer.slice(),routing:Object.assign(Object.create(Object.getPrototypeOf(this.routing)),this.routing,{profile:{...this.routing.profile}})});}
 comparison(){return this.routes.map((r,i)=>({home:r.home,work:r.work,count:r.count,shortest:r.path,paths:(this.pathsDynamic?this.carLegs[i]:this.carCounts[i]?[{path:r.path,count:this.carCounts[i]}]:[]).map(l=>({count:l.count,path:l.path,minutes:this.routing.time(l.path,this.volumeBuffer,id=>this.capacity(id))})),distanceMinutes:this.routing.time(r.path,this.volumeBuffer,id=>this.capacity(id))}));}
 vehicles(minutes=this.displayTime,budgetMs=Infinity):VehiclePose[]{if(this.sampleRevision!==this.graph.revision)return [];const poses:VehiclePose[]=[],started=performance.now();for(const [i,sample] of this.samples.entries()){if(!sample.trajectory){if(performance.now()-started>=budgetMs)continue;const key=this.graph.revision+':'+this.graph.size+':'+sample.path.join(',')+':'+sample.segments.join(',');let route=this.laneCache.get(key);if(!route){if(sample.path.some((id,j)=>j>0&&!this.graph.canTravel(id,sample.path[j-1]))){const back=new Pathfinder(this.graph,64).path(sample.path.at(-1)!,sample.path[0]);if(!back)continue;route=buildDirectedLaneLoop([...sample.path,...back.slice(1)],this.graph.size,id=>this.config.minutesPerRoad*this.multiplier(id),id=>this.graph.adjacent(id).length>=3);}else route=buildLaneLoop(sample.path,this.graph.size,sample.segments.map((end,j)=>end-(j?sample.segments[j-1]:0)),[],id=>this.graph.adjacent(id).length>=3);if(this.laneCache.size>=128)this.laneCache.delete(this.laneCache.keys().next().value!);this.laneCache.set(key,route);}sample.trajectory=route;}for(let v=0;v<sample.count;v++){const time=minutes*VEHICLE_VISUAL.timeScale+(v+.5)*sample.trajectory.duration/sample.count;poses.push(laneVehicle(sample.trajectory,time,'car:'+sample.path[0]+':'+sample.path[sample.path.length-1]+':'+i+':'+v,(['car','van','truck'] as const)[v%3],minutes*VEHICLE_VISUAL.timeScale));}}return poses;}

}
