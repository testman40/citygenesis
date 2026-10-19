import type {City} from '../simulation/City';
import {PUBLIC_FACILITIES,publicFacility,isPublicKind} from '../services/PublicFacilities';
import {wellnessGroup} from '../services/Wellness';
import {WATER} from '../water/Hydrology';

export const FACILITY_NAMES={...PUBLIC_FACILITIES,power:'発電所',water:'給水施設',wind:'風力発電',solar:'太陽光発電',externalWater:'外部水道接続',sewage:'基本下水処理場',advancedSewage:'高度下水処理場',outfall:'排水口'} as const;
export type FacilityKind=keyof typeof FACILITY_NAMES;
export const MAX_FACILITY_HISTORY=2048;
export interface FacilityRecord {id:number;kind:FacilityKind;cost:number;load:number|null}
export interface FacilityEconomics extends FacilityRecord {name:string;key:string;active:boolean;income:number;balance:number;construction:number;loadLabel:string;capacity:number|null;used:number|null;notes:string[];sector:'police'|'fire'|'education'|'medical'|null}
/** Read-only analysis. Public facilities have no direct income in the current simulation. */
export function facilityEconomics(c:City):FacilityEconomics[]{
 const sites=new Map<number,FacilityKind>();
 for(const f of c.facilitySites())if(Object.hasOwn(FACILITY_NAMES,f.kind))sites.set(f.id,f.kind as FacilityKind);
 for(const [id,k] of c.safety.stations)sites.set(id,k);
 for(const [id,k] of c.wellness.facilities)sites.set(id,k);
 for(const [id,k] of c.energy?.plants??[])sites.set(id,k);
 for(const [id,k] of c.sanitation?.plants??[])sites.set(id,k);
 for(const id of c.waterUtility?.externals??[])sites.set(id,'externalWater');
 for(const id of c.hydrology?.outfalls??[])sites.set(id,'outfall');
 const tax=c.finance().forecast.tax,rows:FacilityEconomics[]=[];
 for(const [id,kind] of sites){
  const cell={x:id%c.size,z:Math.floor(id/c.size)},connected=c.networkConnected(cell);
  let cost=0,construction=0,active=connected,load:number|null=null,capacity:number|null=null,used:number|null=null,loadLabel='利用率未集計',sector:FacilityEconomics['sector']=null;
  if(isPublicKind(kind)){
   const f=publicFacility(c,kind);cost=f.maintenance;construction=f.cost;
   if(kind==='police'||kind==='fire'){
    sector=kind;load=kind==='police'?c.safety.policeCoverage:c.safety.fireCoverage;loadLabel='市全体の'+(kind==='police'?'警察':'消防')+'充足率（参考）';
   }else if(kind!=='park'&&kind!=='plaza'){
    const stat=c.wellness.facilityStats.get(id);active=stat?.active??connected;load=stat?.utilization??0;capacity=stat?.capacity??c.wellness.capacity(kind);used=(capacity??0)*load;sector=wellnessGroup(kind)==='medical'?'medical':'education';loadLabel='同系統の定員利用率（按分目安）';
   }
  }else if(kind==='power'||kind==='wind'||kind==='solar'){
   cost=kind==='power'?c.config.powerMaintenance:c.energy!.upkeep(kind);construction=kind==='power'?c.config.powerCost:c.energy!.cost(kind);
   capacity=kind==='power'?(connected?c.config.powerCapacity:0):c.energy!.output(id);active=capacity>0;load=c.powerSupply?Math.min(1,c.powerDemand/c.powerSupply):0;used=capacity*load;loadLabel='電力使用率（外部電力を含む供給比の目安）';
  }else{
   cost=kind==='water'?c.config.waterMaintenance:kind==='outfall'?WATER.outfallMaintenance:kind==='externalWater'?c.waterUtility!.settings.externalMaintenance*c.waterUtility!.prices.maintenance:c.sanitation!.upkeep(kind);
   construction=kind==='water'?c.config.waterCost:kind==='outfall'?WATER.outfallCost:kind==='externalWater'?c.waterUtility!.cost:c.sanitation!.cost(kind);
   const stat=c.waterUtility?.facilityStats.get(id);active=stat?.active??connected;capacity=stat?.capacity??null;used=stat?.used??null;load=stat?.utilization??null;loadLabel='給排水の設備利用率';
   if(kind==='externalWater'){const total=[...c.waterUtility!.facilityStats.values()].filter(s=>s.kind==='external').reduce((sum,s)=>sum+s.used,0);cost+=total?c.waterUtility!.purchaseCost*(used??0)/total:0;}
  }
  if(!active&&(sector==='police'||sector==='fire'))load=null;
  const notes:string[]=[];
  if(!connected)notes.push('道路が幹線網につながっていません。増設する前に、この施設と幹線道路を接続しましょう。');
  else if(!active)notes.push('道路以外の稼働条件が不足しています。電力と上下水道管の接続・供給能力を確認しましょう。');
  if(!c.population)notes.push('人口が0です。給排水・住宅・マップ外への道路を確認し、入居を再開しましょう。');
  if(active&&load!==null&&sector!=='police'&&sector!=='fire'){
   if(load<.25)notes.push('利用に対して能力に余裕があります。増設を急がず、到達範囲と同系統施設の重複を確認しましょう。');
   if(load>=.85)notes.push('能力に余裕が少なくなっています。道路・予算・未充足地域を確認してから、増強を検討しましょう。');
  }
  if(sector&&(sector==='police'||sector==='fire'?load!==null&&load<.8:(sector==='medical'?c.wellness.medicalCoverage:Math.min(c.wellness.elementaryCoverage,c.wellness.highSchoolCoverage))<.8))notes.push('市全体に未充足地域があります。費用だけで撤去せず、道路・到達範囲・定員・公共予算を比較しましょう。');
  if(tax>0&&cost/tax>.2)notes.push('この施設の維持費は税収全体の'+Math.round(cost/tax*100)+'%です。都市全体の月次収支と公共予算を確認しましょう。');
  if(!notes.length)notes.push('稼働条件を満たしています。費用とサービス状況の推移を見ながら、増設を判断しましょう。');
  notes.push('公共サービスは税収で支えます。直接収支がマイナスでも、必要な施設を一律に撤去する必要はありません。');
  rows.push({id,kind,key:kind+':'+id,name:FACILITY_NAMES[kind],cost,construction,active,load,income:0,balance:-cost,capacity,used,loadLabel,notes,sector});
 }
 return rows.sort((a,b)=>b.cost-a.cost||a.id-b.id);
}
export function facilityRecords(c:City):FacilityRecord[]{return facilityEconomics(c).slice(0,MAX_FACILITY_HISTORY).map(({id,kind,cost,load})=>({id,kind,cost,load}));}
