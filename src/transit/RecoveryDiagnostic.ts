import type {Transit,BusRoute} from './Transit';
import type {Depot} from './BusOperations';

export type RecoveryCode='ready'|'missing-run'|'missing-route'|'missing-depot'|'depot-road'|'missing-stop'|'stop-road'|'stop-connection'|'route-path'|'run-state'|'itinerary'|'progress'|'position'|'save-data'|'unknown';
export interface RecoveryLocation {kind:'road'|'stop';label:string;x:number;z:number}
export interface RecoveryDiagnostic {code:RecoveryCode;advice:string;locations:RecoveryLocation[]}
const advice:Record<RecoveryCode,string>={
  ready:'対象便を選び「再経路化してこの便だけ再開」を押してください。',
  'missing-run':'便一覧を更新して、運休・異常停止中の便を選び直してください。',
  'missing-route':'元の路線と所属車庫を確認してください。便を別路線へ付け替えず、現在の都市を保持してください。',
  'missing-depot':'元の所属車庫が必要です。別の車庫への自動付け替えは行いません。',
  'depot-road':'所属車庫に隣接する接続道路を復旧してください。復旧後に便を選び直してください。',
  'missing-stop':'元の便が利用する停留所を確認してください。停留所IDを推測して別の停留所へ置き換えないでください。',
  'stop-road':'停留所の道路を復旧してください。元の停留所と便のデータは削除しないでください。',
  'stop-connection':'停留所の進入・退出道路と一方通行規制を確認してください。走行方向に沿って出入りできる接続が必要です。',
  'route-path':'車庫と各停留所の間を往復できる道路・一方通行規制を確認してください。原因地点は特定できていません。',
  'run-state':'通常運行中や帰庫済みの便は対象外です。運休・異常停止中の便を選んでください。',
  itinerary:'元の停留所順序と周回設定を確認してください。乗客と処理済み停留所を保護するため、自動変更は行いません。',
  progress:'便の進捗を確認できません。都市ファイルを保全し、便を初期化せず調査してください。',
  position:'元の道路と走行方向を復旧してください。現在位置と向きを保てない間は、強制移動せず運休を維持してください。',
  'save-data':'便・乗客の整合性を確認できません。都市ファイルを保全し、乗客数や会計を手動で書き換えないでください。',
  unknown:'復旧判定に失敗しました。現在の都市を保持し、表示された理由を記録してください。',
};
export function recoveryDiagnostic(code:RecoveryCode,locations:RecoveryLocation[]=[]):RecoveryDiagnostic{return {code,advice:advice[code],locations};}
export class RecoveryError extends Error {
  constructor(message:string,readonly diagnostic:RecoveryDiagnostic){super(message);this.name='RecoveryError';}
}
export function recoveryError(code:RecoveryCode,message:string,locations:RecoveryLocation[]=[]){return new RecoveryError(message,recoveryDiagnostic(code,locations));}

/** Called only for a plan already rejected by the real planner. No guessed gap cells. */
export function invalidPlanDiagnostic(transit:Transit,route:BusRoute,depot:Depot|undefined):RecoveryDiagnostic {
  const g=transit.graph;
  const location=(id:number,kind:RecoveryLocation['kind'],label:string):RecoveryLocation[]=>Number.isInteger(id)&&id>=0&&id<g.size*g.size?[{kind,label,x:id%g.size,z:Math.floor(id/g.size)}]:[];
  const neighbors=(a:number,b:number)=>Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<g.size*g.size&&b<g.size*g.size&&Math.abs(a%g.size-b%g.size)+Math.abs(Math.floor(a/g.size)-Math.floor(b/g.size))===1;
  if(!depot)return recoveryDiagnostic('missing-depot');
  if(!g.has(depot.road)||!neighbors(depot.id,depot.road))return recoveryDiagnostic('depot-road',neighbors(depot.id,depot.road)?location(depot.road,'road','車庫の接続道路'):[]);
  for(const id of route.stops){
    const stop=transit.stops.get(id);
    if(!stop)return recoveryDiagnostic('missing-stop');
    if(!g.has(stop.road))return recoveryDiagnostic('stop-road',location(stop.road,'road','停留所の道路'));
    if(stop.heading===undefined)continue;
    if(!Number.isInteger(stop.heading)||stop.heading<0||stop.heading>3)return recoveryDiagnostic('stop-connection',location(stop.road,'stop','方向設定を確認する停留所'));
    const delta=[-g.size,1,g.size,-1][stop.heading];
    for(const [from,to,label] of [[stop.road-delta,stop.road,'停留所への進入道路'],[stop.road,stop.road+delta,'停留所からの退出道路']] as const){
      if(!neighbors(from,to))return recoveryDiagnostic('stop-connection',location(stop.road,'stop','地図端の停留所接続'));
      if(!g.canTravel(from,to)){
        const missing=!g.has(from)?from:!g.has(to)?to:undefined;
        return recoveryDiagnostic('stop-connection',missing===undefined?location(stop.road,'stop','通行規制を確認する停留所'):location(missing,'road',label));
      }
    }
  }
  return recoveryDiagnostic('route-path');
}

export function recoveryGuidance(reason:string,diagnostic:RecoveryDiagnostic):string {
  const places=diagnostic.locations.map(p=>p.label+'（X '+p.x+' / Z '+p.z+'）').join('、');
  return reason+' 対処：'+diagnostic.advice+(places?' 確認地点：'+places:'');
}
