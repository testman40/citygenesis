import {buildLaneJourney, laneVehicle, type LaneStyler} from '../traffic/LanePath';
import type {BusRun, RoutePlan} from './BusOperations';
import {recoveryError} from './RecoveryDiagnostic';

/** Prepare only. Never mutates the saved run or consumes stop/passenger events. */
export function prepareBusRecovery(bus:BusRun, plan:RoutePlan, size:number, minutes:number, dwell:number, junction:(road:number)=>boolean,styler?:LaneStyler):BusRun {
  if(bus.state!=='error'&&bus.state!=='paused')throw recoveryError('run-state','安全再経路化は異常停止・運休中の便だけに行えます');
  if(!plan.valid)throw recoveryError('route-path',plan.errors.join(' / ')||'復旧経路がありません');
  if(bus.stops.length!==plan.stops.length||bus.stops.some((s,i)=>s.id!==plan.stops[i].id||s.lap!==plan.stops[i].lap||!!s.first!==!!plan.stops[i].first))throw recoveryError('itinerary','停留所順序が変わっています。元の便を維持できないため復旧を保留します');
  if(!Number.isFinite(bus.phase)||bus.phase<0||bus.nextEvent<0||bus.nextEvent>bus.stops.length)throw recoveryError('progress','便の進捗が不正です');
  const journey=(path:number[],stops:BusRun['stops'])=>buildLaneJourney(path,size,minutes,new Map(stops.map(s=>[s.index,dwell])),junction,styler);
  const old=journey(bus.path,bus.stops),next=journey(plan.path,plan.stops);
  if(bus.phase>=old.loop.duration)throw recoveryError('progress','便の現在位置を確定できません');
  const pose=laneVehicle(old.loop,bus.phase,bus.id,'bus',bus.clock);
  const piece=old.loop.pieces[pose.piece!];
  const fraction=(bus.phase-piece.start)/(piece.end-piece.start);
  const lower=bus.nextEvent?next.arrivals.get(plan.stops[bus.nextEvent-1].index)!:0;
  const upper=bus.nextEvent<plan.stops.length?next.arrivals.get(plan.stops[bus.nextEvent].index)!:next.loop.duration;
  let phase:number|undefined;
  for(const candidate of next.loop.pieces){
    if(candidate.from!==piece.from||candidate.to!==piece.to||candidate.curve.road!==piece.curve.road||candidate.curve.next!==piece.curve.next||JSON.stringify(candidate.curve.p)!==JSON.stringify(piece.curve.p))continue;
    const time=candidate.start+fraction*(candidate.end-candidate.start);
    if(time<lower||time>=upper)continue;
    const location=laneVehicle(next.loop,time,bus.id,'bus',bus.clock);
    if(Math.hypot(location.x-pose.x,location.z-pose.z)>1e-8||Math.abs(Math.atan2(Math.sin(location.angle-pose.angle),Math.cos(location.angle-pose.angle)))>1e-8)continue;
    phase=time;break;
  }
  if(phase===undefined){
    const road=piece.curve.road;
    const locations=Number.isInteger(road)&&road>=0&&road<size*size?[{kind:'road' as const,label:'便の現在位置の道路',x:road%size,z:Math.floor(road/size)}]:[];
    throw recoveryError('position','現在位置と向きを保つ復旧経路がありません。道路を復旧してから再度判断してください',locations);
  }
  return {...structuredClone(bus),path:[...plan.path],stops:structuredClone(plan.stops),returnIndex:plan.returnIndex,phase,state:'paused',error:''};
}
