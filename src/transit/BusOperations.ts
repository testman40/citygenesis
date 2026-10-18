import {roadLanes} from '../traffic/RoadLanes';
import {Pathfinder} from '../traffic/Pathfinder';
import {buildLaneJourney,laneVehicle,type LaneLoop} from '../traffic/LanePath';
import {VehicleFleet} from '../traffic/VehicleMotion';
import type {VehiclePose} from '../traffic/Traffic';
import type {Transit,BusRoute} from './Transit';
import {prepareBusRecovery} from './BusRecovery';
import {validateInfrastructure} from './validateInfrastructure';
import {RecoveryError,recoveryError,recoveryDiagnostic,invalidPlanDiagnostic,type RecoveryDiagnostic} from './RecoveryDiagnostic';
export const BUS_INFRA={version:1,depotCost:1800,depotMaintenance:8,depotCapacity:8,maxDepots:16,busPurchase:120,busOwnership:2,defaultLaps:3,maxLaps:20,roadMinutes:.5,dwellMinutes:.35};
export type BusState='garage'|'departing'|'travel'|'stopped'|'boarding'|'returning'|'paused'|'error';
export interface Depot {id:number;road:number;capacity:number;owned:number;name:string}
export interface RouteSettings {id:number;depot:number;laps:number;mode:'circular';color:string;enabled:boolean}
export interface BusRun {id:string;route:number;depot:number;state:BusState;lap:number;tripLaps:number;phase:number;clock:number;path:number[];stops:{index:number;id:number;lap:number;first?:boolean}[];returnIndex:number;nextEvent:number;onboard:number;passengers?:[number,number][];boarded:number;alighted:number;error:string;delay:number}
export interface InfrastructureState {version:1;depots:Depot[];routes:RouteSettings[];buses:BusRun[];directions:[number,number][]}
export interface RoutePlan {valid:boolean;errors:string[];segments:{name:string;path:number[];valid:boolean;from?:number;to?:number}[];path:number[];stops:BusRun['stops'];returnIndex:number}
/** Pure operation state: no Three.js, per-resident objects or animation-frame clock. */
export class BusOperations {
 readonly depots=new Map<number,Depot>();readonly routes=new Map<number,RouteSettings>();readonly buses=new Map<string,BusRun>();
 private finder:Pathfinder|undefined;
 private plans=new Map<string,RoutePlan>();
 private sharedJourneys=new Map<string,{loop:LaneLoop;arrivals:Map<number,number>}>();
 private paths=new Map<string,{loop:LaneLoop;arrivals:Map<number,number>}>();private fleet=new VehicleFleet();private revision=-1;private presentationAt=0;roadMinutes=.5;multiplier:(id:number)=>number=()=>1;
 visible:{cars:VehiclePose[];buses:VehiclePose[]}={cars:[],buses:[]};
 constructor(readonly transit:Transit){}
 get active(){return !!(this.depots.size||this.routes.size||this.transit.graph.directions.size);}
 operating(id:number){return this.routes.get(id)?.enabled||[...this.buses.values()].some(b=>b.route===id&&b.state!=='garage'&&b.state!=='error'&&b.state!=='paused');}
 serviceLaps(id:number){return [...this.buses.values()].find(b=>b.route===id&&b.state!=='garage')?.tripLaps??this.routes.get(id)?.laps??3;}
 busyRoads(){return this.fleet.busyRoads();}
 presentation(){const poses=this.fleet.presentation((performance.now()-this.presentationAt)/50);poses.buses=poses.buses.filter(p=>this.buses.get(p.id!)?.state!=='garage');return poses;}
 get maintenance(){const t=this.transit;return [...this.depots.values()].reduce((n,d)=>n+d.owned*BUS_INFRA.busOwnership+BUS_INFRA.depotMaintenance,0)*t.funding;}
 stopInUse(id:number){return [...this.buses.values()].some(b=>b.state!=='garage'&&b.stops.some(s=>s.id===id));}
 invalidateStops(){this.revision=-1;}
 depotAt(id:number){return this.depots.get(id);}
 addDepot(id:number){const g=this.transit.graph;if(!Number.isInteger(id)||id<0||id>=g.size*g.size||g.has(id)||this.depots.has(id)||this.depots.size>=BUS_INFRA.maxDepots)throw Error('車庫の設置位置または上限を確認してください');const road=g.adjacent(id)[0];if(road===undefined)throw Error('車庫には上下左右の道路接続が必要です');const d={id,road,capacity:BUS_INFRA.depotCapacity,owned:0,name:'車庫 '+id};this.depots.set(id,d);this.changed();return d;}
 removeDepot(id:number){if([...this.buses.values()].some(b=>b.depot===id&&b.state!=='garage'))throw Error('運行中・異常停止中のバスを持つ車庫は撤去できません');this.depots.delete(id);for(const r of this.routes.values())if(r.depot===id)r.enabled=false;for(const [key,b] of this.buses)if(b.depot===id){this.paths.delete(key);this.buses.delete(key);}this.changed();}
 buy(id:number,count=1){const d=this.depots.get(id);if(!d||!Number.isInteger(count)||count<1||d.owned+count>d.capacity)throw Error('車庫容量を超えるバスは購入できません');d.owned+=count;this.changed();}
 allocated(depot:number,except?:number){let n=0;for(const [id,s] of this.routes)if(s.depot===depot&&id!==except)n+=this.transit.routes.get(id)?.fleet??0;return n;}
 save(name:string,stops:number[],fleet:number,depot:number,laps=3,color='#58d9bc',id?:number){
  if(!this.depots.has(depot))throw Error('所属車庫を選んでください');if(id!==undefined&&!this.transit.routes.has(id))throw Error('編集する路線がありません');if(!Number.isInteger(laps)||laps<1||laps>20)throw Error('周回数は1〜20周です');if(!/^#[0-9a-f]{6}$/i.test(color))throw Error('路線色が不正です');
  if(id!==undefined&&[...this.buses.values()].some(b=>b.route===id&&b.state!=='garage')){const old=this.routes.get(id),r=this.transit.routes.get(id);if(!old||old.depot!==depot||r?.fleet!==fleet||r.stops.join()!==stops.join())throw Error('運行中は名称・色・次便の周回数だけ変更できます');}
  if(!Number.isInteger(fleet)||fleet<1||fleet>20||this.allocated(depot,id)+fleet>this.depots.get(depot)!.owned)throw Error('車庫の未配備バスが不足しています');
  if(!name.trim()||name.length>40||stops.length<2||stops.length>16||new Set(stops).size!==stops.length||stops.some(s=>!this.transit.stops.has(s)))throw Error('路線名と異なる停留所2〜16か所を指定してください');
  const r:BusRoute={id:id??this.transit.nextRouteId,name:name.trim(),stops:[...stops],fleet},settings:RouteSettings={id:r.id,depot,laps,mode:'circular',color,enabled:this.routes.get(r.id)?.enabled??false};const p=this.plan(r,settings);if(!p.valid)throw Error(p.errors.join(' / '));
  const oldDepot=this.routes.get(r.id)?.depot,parked=[...this.buses.values()].filter(b=>b.route===r.id&&b.state==='garage');for(const b of parked.filter((_,i)=>oldDepot!==depot||i>=fleet)){this.paths.delete(b.id);this.buses.delete(b.id);}this.transit.storeManagedRoute(r);this.routes.set(r.id,settings);this.changed();return r;
 }
 plan(route:BusRoute,settings:RouteSettings,tripLaps=settings.laps):RoutePlan{
  const cacheKey=[this.transit.graph.revision,settings.depot,this.depots.get(settings.depot)?.road,tripLaps,...route.stops.flatMap(id=>{const s=this.transit.stops.get(id);return [id,s?.road,s?.heading];})].join(':');const cached=this.plans.get(cacheKey);if(cached)return cached;const g=this.transit.graph,find=this.finder??=new Pathfinder(g,256),depot=this.depots.get(settings.depot),errors:string[]=[],segments:RoutePlan['segments']=[],path:number[]=[],stops:BusRun['stops']=[];
  const invalid=(message:string)=>{errors.push(message);return {valid:false,errors,segments,path,stops,returnIndex:0};};if(!depot||!g.has(depot.road)||!g.adjacent(depot.id).includes(depot.road))return invalid('所属車庫の道路接続がありません');if(route.stops.length<2)return invalid('停留所が2か所以上必要です');
  find.resetBudget();
  const node=(id:number)=>this.transit.stops.get(id);
  const endpoint=(id:number,after:boolean)=>{const s=node(id);if(!s)return null;if(s.heading===undefined)return s.road;const delta=[-g.size,1,g.size,-1][s.heading],n=s.road+(after?delta:-delta);if(!g.adjacent(s.road).includes(n)||(after?!g.canTravel(s.road,n):!g.canTravel(n,s.road)))return null;return n;};
  const leg=(a:number|null,b:number|null,name:string,startStop?:number,endStop?:number)=>{const avoid=[...(startStop===undefined?[]:[node(startStop)?.road]),...(endStop===undefined?[]:[node(endStop)?.road])].filter((id):id is number=>id!==undefined&&id!==a&&id!==b);let p=a===null||b===null?null:(avoid.length?find.path(a,b,200000,avoid):null)??find.path(a,b);if(p){p=[...p];if(startStop!==undefined){const road=node(startStop)?.road;if(road===undefined)p=null;else if(p[0]!==road)p.unshift(road);}if(p&&endStop!==undefined){const road=node(endStop)?.road;if(road===undefined)p=null;else if(p.at(-1)!==road)p.push(road);}}const valid=!!p;segments.push({name,path:p??[],valid,...(!valid?{from:startStop!==undefined?node(startStop)?.road:a??depot.road,to:endStop!==undefined?node(endStop)?.road:b??depot.road}:{})});if(!valid){const message=name+'：道路切断・一方通行・停留所の向きを確認';if(!errors.includes(message))errors.push(message);return;}for(let i=path.length?1:0;i<p!.length;i++)path.push(p![i]);};
  path.push(depot.id,depot.road);const first=route.stops[0];leg(depot.road,endpoint(first,false),'出庫 → 停留所'+first,undefined,first);stops.push({index:path.length-1,id:first,lap:0,first:true});
  for(let lap=1;lap<=tripLaps;lap++)for(let i=0;i<route.stops.length;i++){const a=route.stops[i],b=route.stops[(i+1)%route.stops.length];leg(endpoint(a,true),endpoint(b,false),'停留所'+a+' → '+b,a,b);stops.push({index:path.length-1,id:b,lap:i===route.stops.length-1?lap:lap-1});}
  const returnIndex=path.length-1;leg(endpoint(first,true),depot.road,'帰庫',first);path.push(depot.id);
  const result={valid:errors.length===0,errors,segments,path,stops,returnIndex};if(this.plans.size>=64)this.plans.delete(this.plans.keys().next().value!);this.plans.set(cacheKey,result);return result;
 }
 validate(id:number){const r=this.transit.routes.get(id),s=this.routes.get(id);return r&&s?this.plan(r,s):{valid:false,errors:['車庫付き循環路線ではありません'],segments:[],path:[],stops:[],returnIndex:0};}
 private journey(b:BusRun){let hit=this.paths.get(b.id);if(!hit){const key=b.path.join(',')+':'+b.stops.map(s=>s.index).join(',')+':'+this.roadMinutes;hit=this.sharedJourneys.get(key);if(!hit){const waits=new Map(b.stops.map(s=>[s.index,this.transit.config.dwellMinutes]));hit=buildLaneJourney(b.path,this.transit.graph.size,this.roadMinutes,waits,id=>this.transit.graph.adjacent(id).length>=3,roadLanes(this.transit.graph,0,new Set([...this.transit.stops.values()].filter(s=>s.bay).map(s=>s.road))));if(this.sharedJourneys.size>=16)this.sharedJourneys.delete(this.sharedJourneys.keys().next().value!);this.sharedJourneys.set(key,hit);}this.paths.set(b.id,hit);}return hit;}
 start(id:number){const route=this.transit.routes.get(id),s=this.routes.get(id);if(!route||!s)throw Error('路線がありません');const d=this.depots.get(s.depot);if(!d||this.allocated(d.id,id)+route.fleet>d.owned)throw Error('車庫に利用可能なバスがありません');const plan=this.validate(id);if(!plan.valid)throw Error(plan.errors.join(' / '));const running=[...this.buses.values()].filter(b=>b.route===id&&b.state!=='garage');if(running.length){if(running.every(b=>(b.state==='error'||b.state==='paused')&&this.intact(b))){for(const b of running){b.state='travel';b.error='';}s.enabled=true;this.fleet.reset();this.changed();return;}throw Error('この路線には運行中・異常停止中のバスがあります。道路を復旧して再開してください');}
  for(let v=0;v<route.fleet;v++){const key='managed:'+id+':'+v;this.paths.delete(key);this.buses.set(key,{id:key,route:id,depot:d.id,state:'departing',lap:0,tripLaps:s.laps,phase:0,clock:0,path:[...plan.path],stops:structuredClone(plan.stops),returnIndex:plan.returnIndex,nextEvent:0,onboard:0,passengers:[],boarded:0,alighted:0,error:'',delay:v*1.5});}s.enabled=true;this.fleet.reset();this.changed();}
 stop(id:number){const s=this.routes.get(id);if(s){s.enabled=false;for(const b of this.buses.values())if(b.route===id&&b.state!=='garage'&&b.state!=='error')b.state='paused';this.changed();}}
 /** Explicit per-run recovery. All fallible planning/validation precedes commit. */
 private recoveryCandidate(id:string){
  const bus=this.buses.get(id);if(!bus)throw recoveryError('missing-run','復旧対象の便がありません');
  const route=this.transit.routes.get(bus.route),settings=this.routes.get(bus.route);
  if(!route||!settings||settings.depot!==bus.depot)throw recoveryError('missing-route','便の路線・所属車庫を確認できません');
  const graph=this.transit.graph,plan=this.plan(route,settings,bus.tripLaps);
  if(!plan.valid)throw new RecoveryError(plan.errors.join(' / ')||'復旧経路がありません',invalidPlanDiagnostic(this.transit,route,this.depots.get(settings.depot)));
  const candidate=prepareBusRecovery(bus,plan,graph.size,this.roadMinutes,this.transit.config.dwellMinutes,road=>graph.adjacent(road).length>=3,roadLanes(graph,0,new Set([...this.transit.stops.values()].filter(s=>s.bay).map(s=>s.road))));
  if(!this.intact(candidate))throw recoveryError('route-path','復旧経路の道路・停留所が無効です');
  const state=this.snapshot();state.buses=state.buses.map(b=>b.id===id?candidate:b);
  try{validateInfrastructure(state,graph.size,new Set(this.transit.routes.keys()),this.transit.config.seats);}
  catch(error){throw recoveryError('save-data',error instanceof Error?error.message:'保存データを検証できません');}
  return {bus,candidate,settings};
 }
 previewBusRecovery(id:string):{possible:boolean;reason:string;diagnostic:RecoveryDiagnostic}{
  try{this.recoveryCandidate(id);return {possible:true,reason:'位置・乗客・周回を保持して復旧できます',diagnostic:recoveryDiagnostic('ready')};}
  catch(error){return {possible:false,reason:error instanceof Error?error.message:'復旧可否を確認できませんでした',diagnostic:error instanceof RecoveryError?error.diagnostic:recoveryDiagnostic('unknown')};}
 }
 private commitRecovery(bus:BusRun,candidate:BusRun){
  Object.assign(bus,candidate);this.paths.delete(bus.id);this.fleet.reset();this.visible.buses=[];this.changed();
 }
 recoverBus(id:string){
  const {bus,candidate}=this.recoveryCandidate(id);this.commitRecovery(bus,candidate);
 }
 /** One candidate validation, then one commit: never leave a partially resumed run. */
 recoverAndResumeBus(id:string){
  const {bus,candidate,settings}=this.recoveryCandidate(id);
  candidate.state='travel';this.commitRecovery(bus,candidate);settings.enabled=true;
 }
 resumeBus(id:string){
  const bus=this.buses.get(id);if(!bus)throw Error('再開対象の便がありません');
  if(bus.state!=='paused'||!this.intact(bus))throw Error('運休中の便と道路接続を確認してください');
  const settings=this.routes.get(bus.route);if(!settings||!this.transit.routes.has(bus.route)||settings.depot!==bus.depot)throw Error('便の路線・所属車庫がありません');
  const graph=this.transit.graph;
  validateInfrastructure(this.snapshot(),graph.size,new Set(this.transit.routes.keys()),this.transit.config.seats);
  prepareBusRecovery(bus,{valid:true,errors:[],segments:[],path:bus.path,stops:bus.stops,returnIndex:bus.returnIndex},graph.size,this.roadMinutes,this.transit.config.dwellMinutes,road=>graph.adjacent(road).length>=3,roadLanes(graph,0,new Set([...this.transit.stops.values()].filter(s=>s.bay).map(s=>s.road))));
  bus.state='travel';bus.error='';settings.enabled=true;this.fleet.reset();this.changed();
 }
 removeRoute(id:number){if([...this.buses.values()].some(b=>b.route===id&&b.state!=='garage'))throw Error('帰庫が完了してから路線を削除してください');this.routes.delete(id);for(const [key,b] of this.buses)if(b.route===id){this.paths.delete(key);this.buses.delete(key);}this.changed();}
 private intact(b:BusRun){const g=this.transit.graph;for(let i=1;i<b.path.length-2;i++)if(!g.canTravel(b.path[i],b.path[i+1]))return false;return this.depots.has(b.depot)&&g.adjacent(b.depot).includes(b.path[1])&&g.adjacent(b.depot).includes(b.path[b.path.length-2])&&b.stops.every(s=>this.transit.stops.has(s.id));}
 /** Fixed simulation time, capped display fleet; managed trajectories share the existing collision controller with cars. */
 advance(minutes:number,cars:VehiclePose[]=[],legacy:VehiclePose[]=[]){if(!Number.isFinite(minutes)||minutes<0)throw Error('運行時間が不正です');if(!this.routes.size)return;const g=this.transit.graph;if(this.revision!==g.revision){this.revision=g.revision;this.paths.clear();this.sharedJourneys.clear();for(const b of this.buses.values())if(b.state!=='garage'&&!this.intact(b)){b.state='error';b.error='道路切断・規制変更・施設撤去：安全停止中';const s=this.routes.get(b.route);if(s)s.enabled=false;this.changed();}this.fleet.reset();}
  this.presentationAt=performance.now();const targets:VehiclePose[]=[];
  for(const b of this.buses.values()){if(b.state==='garage')continue;if(b.delay>0){if(b.state!=='paused')b.delay=Math.max(0,b.delay-minutes);continue;}const journey=this.journey(b);const location=laneVehicle(journey.loop,b.phase,b.id,'bus',b.clock),pose=journey.loop.pieces[location.piece??0],slow=pose.from===pose.to?1:Math.max(1,this.multiplier(pose.curve.road));b.clock+=b.state==='error'||b.state==='paused'?0:minutes/slow;targets.push(laneVehicle(journey.loop,b.phase,b.id,'bus',b.clock));}
  const shown=new Set(targets.slice(0,24).map(p=>p.id));const visible=this.fleet.update(cars,[...targets,...legacy].slice(0,24),this.transit.graph.signalTime,this.transit.graph.pedestrianBusy);this.visible=visible;
  for(const b of this.buses.values()){if(b.state==='garage'||b.state==='error'||b.state==='paused'||b.delay>0)continue;const j=this.journey(b),sample=this.fleet.progress(b.id);if(sample===undefined&&shown.has(b.id))continue;b.phase=sample??Math.min(j.loop.duration,b.phase+minutes);
   while(b.nextEvent<b.stops.length&&b.phase>=j.arrivals.get(b.stops[b.nextEvent].index)!){const event=b.stops[b.nextEvent++];b.lap=event.lap;const manifest=b.passengers??[];b.alighted+=manifest.filter(([stop])=>stop===event.id).reduce((n,[,count])=>n+count,0);b.passengers=manifest.filter(([stop])=>stop!==event.id);b.onboard=b.passengers.reduce((n,[,count])=>n+count,0);if(event.lap<b.tripLaps&&this.transit.stops.has(event.id)){for(const flow of this.transit.passengerFlows.values()){if(flow.route!==b.route||flow.from!==event.id||!b.stops.slice(b.nextEvent).some(s=>s.id===flow.to))continue;const count=Math.min(this.transit.config.seats-b.onboard,Math.floor(flow.count/Math.max(1,(this.transit.routes.get(b.route)?.fleet??1)*this.transit.config.tripsPerMonth)));if(count>0){const existing=b.passengers.find(([id])=>id===flow.to);if(existing)existing[1]+=count;else b.passengers.push([flow.to,count]);b.onboard+=count;b.boarded+=count;}}}}
   const event=b.stops[b.nextEvent-1],arrival=event?j.arrivals.get(event.index)!:-Infinity;
   b.state=b.phase>=j.arrivals.get(b.returnIndex)!+this.transit.config.dwellMinutes?'returning':b.phase<j.arrivals.get(b.stops[0].index)!?'departing':b.phase<arrival+this.transit.config.dwellMinutes/2?'stopped':b.phase<arrival+this.transit.config.dwellMinutes?'boarding':'travel';
   if(b.phase>=j.loop.duration-1e-6){b.state='garage';b.alighted+=b.onboard;b.onboard=0;b.passengers=[];}
  }
  this.visible.buses=this.visible.buses.filter(p=>this.buses.get(p.id!)?.state!=='garage');
  for(const s of this.routes.values())if(s.enabled&&[...this.buses.values()].filter(b=>b.route===s.id).every(b=>b.state==='garage')){s.enabled=false;this.changed();}
 }
 waiting(stop:number){if(!this.transit.stops.has(stop))return 0;const demand=[...this.transit.passengerFlows.values()].filter(f=>f.from===stop).reduce((n,f)=>n+f.count,0);return Math.max(0,Math.ceil(demand/this.transit.config.tripsPerMonth)-[...this.buses.values()].filter(b=>b.state==='boarding'&&b.stops[b.nextEvent-1]?.id===stop).reduce((n,b)=>n+b.onboard,0));}
 snapshot():InfrastructureState{return {version:1,depots:[...this.depots.values()].map(d=>({...d})),routes:[...this.routes.values()].map(r=>({...r})),buses:structuredClone([...this.buses.values()]),directions:[...this.transit.graph.directions]};}
 restore(s:InfrastructureState){this.depots.clear();this.routes.clear();this.buses.clear();this.paths.clear();this.sharedJourneys.clear();this.plans.clear();this.fleet.reset();for(const d of s.depots)this.depots.set(d.id,{...d});for(const r of s.routes)this.routes.set(r.id,{...r});for(const b of s.buses)this.buses.set(b.id,structuredClone(b));for(const [id,dir] of s.directions)if(this.transit.graph.has(id))this.transit.graph.setDirection(id,dir);this.revision=-1;this.advance(0);}
 private changed(){this.transit.invalidate();}
}
