import {validateResidents} from '../residents/validateResidents';
import type {ResidentState} from '../residents/Residents';
import {validateWaterUtility,type WaterUtilityState} from '../water/WaterUtility';
import {validateSanitation,type SanitationState} from '../water/Sanitation';
import {validateEnergy,type EnergyState} from '../energy/Energy';
import {Hydrology,validateHydrology,type HydrologyState} from '../water/Hydrology';
import {validateManagement,type ManagementState} from '../economy/Management';
import {validateBudget,type BudgetState} from '../budget/Budget';
import {validateWellness} from '../services/validate';
import type {WellnessState} from '../services/Wellness';
import {validateSafety} from '../safety/validate';
import type {SafetyState} from '../safety/Safety';
import {validateRouting} from '../traffic/validateRouting';
import {validateTransit} from '../transit/validate';
import type {TransitState} from '../transit/Transit';
import { BALANCE, type Balance } from '../simulation/config';
import type { TrafficState } from '../traffic/Traffic';
import type { Speed } from '../simulation/Clock';
export interface SavedCell {x:number;z:number;road:boolean;zone:number;level:number;age:number;facility:number;decline:number}
export interface CityState {residents?:ResidentState;waterUtility?:WaterUtilityState;sanitation?:SanitationState;energy?:EnergyState;hydrology?:HydrologyState;management?:ManagementState;budget?:BudgetState;size:number;wellness?:WellnessState;safety?:SafetyState;transit?:TransitState;traffic?:TrafficState;developmentOrder:number[];taxRate:number;config:Balance;cells:SavedCell[];month:number;population:number;funds:number;tax:number;maintenance:number;balance:number;constructionSpending:number}
export interface SaveData {version:2|3|4|5;savedAt:string;city:CityState;clock:{speed:Speed;accumulated:number}}
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('保存データの形式が不正です');return v as Record<string,unknown>;};
const number=(v:unknown,min:number,max:number,integer=false):number=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))throw new Error('保存データの数値が不正です');return v;};
export function validateSave(input:unknown):SaveData {
 const s=obj(input);if(s.version!==1&&s.version!==2&&s.version!==3&&s.version!==4&&s.version!==5)throw new Error('未対応のセーブバージョンです');
 if(typeof s.savedAt!=='string'||!Number.isFinite(Date.parse(s.savedAt)))throw new Error('保存日時が不正です');
 const c=obj(s.city);if((s.version===5)!==(c.waterUtility!==undefined))throw Error('施設式上下水道には保存バージョン5が必要です');const rawConfig=obj(c.config);const config={...BALANCE};
 for(const key of Object.keys(BALANCE) as (keyof Balance)[])config[key]=number((s.version===1||s.version===2)?(rawConfig[key]??BALANCE[key]):rawConfig[key],0,1e9);
 for(const key of ['stepSeconds','growthMonths','residentsPerLevel','commercialJobsPerLevel','industrialJobsPerLevel'] as const)if(config[key]<=0)throw new Error('設定値が不正です');
 number(config.declineMonths,1,65535,true);number(config.autosaveSeconds,1,86400);
 for(const key of ['growthSupplyThreshold','declineSupplyThreshold','powerSatisfactionWeight','waterSatisfactionWeight','employmentSatisfactionWeight','taxSatisfactionWeight'] as const)number(config[key],0,1);
 for(const key of ['residentsPerLevel','commercialJobsPerLevel','industrialJobsPerLevel','migrationPerMonth'] as const)number(config[key],0,1e6,true);
 number(config.maxLevel,1,20,true);number(config.growthMonths,1,65535,true);number(config.workforceRatio,0,1);
 const size=number(c.size===undefined?64:c.size,1,256,true);
 if(size>64&&size!==128&&size!==256)throw new Error('都市サイズが不正です');
 if(!Array.isArray(c.cells)||c.cells.length>size*size)throw new Error('セル数が不正です');
 const seen=new Set<number>();const cells=c.cells.map(v=>{
  const t=obj(v),x=number(t.x,0,size-1,true),z=number(t.z,0,size-1,true),id=z*size+x;
  if(seen.has(id))throw new Error('セルが重複しています');seen.add(id);
  if(typeof t.road!=='boolean')throw new Error('道路データが不正です');
  const zone=number(t.zone,0,3,true),level=number(t.level,0,config.maxLevel,true),age=number(t.age,0,config.growthMonths,true);
  const facility=number(s.version===1?0:t.facility,0,4,true),decline=number(s.version===1?0:t.decline,0,config.declineMonths,true);
  if(Number(t.road)+Number(zone>0)+Number(facility>0)!==1||(!zone&&(level!==0||age!==0||decline!==0)))throw new Error('セルの用途が矛盾しています');
  return {x,z,road:t.road,zone,level,age,facility,decline};
 });
 const zoneIds=cells.filter(t=>t.zone>0).map(t=>t.z*size+t.x),zoneSet=new Set(zoneIds);
 const order=s.version===1?zoneIds:(c.developmentOrder??zoneIds);
 if(!Array.isArray(order)||order.length!==zoneIds.length||new Set(order).size!==order.length||order.some(n=>typeof n!=='number'||!zoneSet.has(n)))throw new Error('区画の更新順序が不正です');
 const weights=config.powerSatisfactionWeight+config.waterSatisfactionWeight+config.employmentSatisfactionWeight+config.taxSatisfactionWeight;
 if(Math.abs(weights-1)>1e-8)throw new Error('満足度の重みが不正です');
 number(config.stepSeconds,.01,3600);
 const residents=c.residents!==undefined?validateResidents(c.residents,size,cells,number(c.population,0,size*size*config.maxLevel*config.residentsPerLevel,true),config.residentsPerLevel):undefined;
 const residentWorkers=residents?new Map<number,number>():undefined;for(const h of residents?.households??[])residentWorkers!.set(h[1],(residentWorkers!.get(h[1])??0)+(h[3]===3?0:h[3]===0||h[3]===1?Math.min(2,h[2]):h[2]));
 let traffic:TrafficState={ticks:0,remainder:0,capacities:[]};
 if((s.version===3||s.version===4||s.version===5)&&!c.traffic)throw new Error('交通データがありません');
 if(c.traffic){
  const t=obj(c.traffic);const ticks=number(t.ticks,0,1e12,true),remainder=number(t.remainder,0,.05);
  if(remainder>=.05||!Array.isArray(t.capacities)||t.capacities.length>cells.length)throw new Error('交通データが不正です');
  const roadIds=new Set(cells.filter(c=>c.road).map(c=>c.z*size+c.x)),seenCapacity=new Set<number>();
  const capacities:[number,number][]=t.capacities.map(v=>{if(!Array.isArray(v)||v.length!==2)throw new Error('道路容量が不正です');const id=number(v[0],0,size*size-1,true),capacity=number(v[1],.01,1e6);if(!roadIds.has(id)||seenCapacity.has(id))throw new Error('道路容量の参照が不正です');seenCapacity.add(id);return [id,capacity];});
  const busOnly:number[]=[];if(t.busOnly!==undefined){if(!Array.isArray(t.busOnly)||t.busOnly.length>roadIds.size)throw new Error('バス専用道路が不正です');const seen=new Set<number>();for(const raw of t.busOnly){const id=number(raw,0,size*size-1,true);if(!roadIds.has(id)||seen.has(id))throw new Error('バス専用道路の参照が不正です');seen.add(id);busOnly.push(id);}}
  traffic={ticks,remainder,capacities,...(busOnly.length?{busOnly}:{}),...(t.routing!==undefined?{routing:validateRouting(t.routing,size,cells,number(c.month,0,1e9,true),number(c.population,0,size*size*config.maxLevel*config.residentsPerLevel,true),config,residentWorkers)}:{})};
 }
 for(const key of ['roadCapacity','minutesPerRoad','maxCommuteMinutes','displayMinutesPerSecond'] as const)number(config[key],.01,1e6);
 for(const key of ['maxDisplayVehicles','maxRouteSearches','maxPathExpansions','maxPathCache'] as const)number(config[key],1,key==='maxDisplayVehicles'?512:1e6,true);
 number(config.maxCongestionMultiplier,1,100);
 if(traffic.routing&&traffic.busOnly?.length){const bus=new Set(traffic.busOnly);if(traffic.routing.flows.some(f=>f.legs.some(l=>l.path.some(id=>bus.has(id)))))throw new Error('一般車の経路がバス専用道路を通っています');}
 const city:CityState={...(residents?{residents}:{}),...(c.safety!==undefined?{safety:validateSafety(c.safety,size,cells)}:{}),...(c.transit?{transit:validateTransit(c.transit,size)}:{}),traffic,developmentOrder:[...order],taxRate:number(s.version===1?1:c.taxRate,.5,2),size,config,cells,month:number(c.month,0,1e9,true),population:number(c.population,0,size*size*config.maxLevel*config.residentsPerLevel,true),funds:number(c.funds,-1e12,1e12),tax:number(c.tax,0,1e12),maintenance:number(c.maintenance,0,1e12),balance:number(c.balance,-1e12,1e12),constructionSpending:number(c.constructionSpending,0,1e12)};
 if(c.wellness!==undefined)city.wellness=validateWellness(c.wellness,size,cells,city.safety,city.population,city.month);
 if(city.transit?.infrastructure){const occupied=new Set([...cells.map(t=>t.z*size+t.x),...(city.safety?.stations??[]).map(s=>s.id),...(city.wellness?.facilities??[]).map(f=>f.id)]),roads=new Set(cells.filter(t=>t.road).map(t=>t.z*size+t.x));for(const d of city.transit.infrastructure.depots)if(occupied.has(d.id)||Math.abs(d.id%size-d.road%size)+Math.abs(Math.floor(d.id/size)-Math.floor(d.road/size))!==1)throw Error('車庫の位置が不正です');for(const [id] of city.transit.infrastructure.directions)if(!roads.has(id))throw Error('道路規制の参照が不正です');}
 if(c.hydrology!==undefined)city.hydrology=validateHydrology(c.hydrology,size,[...cells.filter(t=>!t.road).map(t=>t.z*size+t.x),...(city.safety?.stations??[]).map(s=>s.id),...(city.wellness?.facilities??[]).map(f=>f.id),...(city.transit?.infrastructure?.depots??[]).map(d=>d.id)]);
 if(city.hydrology){const terrain=Hydrology.restore(size,city.hydrology);for(const t of cells)if(t.facility===2&&!terrain.riverside(t.z*size+t.x))throw Error('給水施設が河川に隣接していません');}
 if(c.energy!==undefined)city.energy=validateEnergy(c.energy,size,[...cells.map(t=>t.z*size+t.x),...(city.safety?.stations??[]).map(s=>s.id),...(city.wellness?.facilities??[]).map(f=>f.id),...(city.transit?.infrastructure?.depots??[]).map(d=>d.id),...(city.hydrology?.outfalls??[])],city.hydrology?.river);
 if(c.sanitation!==undefined){if(!city.hydrology&&c.waterUtility===undefined)throw Error('下水管理には河川都市データが必要です');city.sanitation=validateSanitation(c.sanitation,size,[...cells.map(t=>t.z*size+t.x),...(city.safety?.stations??[]).map(s=>s.id),...(city.wellness?.facilities??[]).map(f=>f.id),...(city.transit?.infrastructure?.depots??[]).map(d=>d.id),...(city.hydrology?.outfalls??[]),...(city.energy?.plants??[]).map(p=>p.id)],city.hydrology?.river??[]);}
 if(c.waterUtility!==undefined){if(!city.sanitation)throw Error('施設式上下水道には下水管理が必要です');city.waterUtility=validateWaterUtility(c.waterUtility,size,[...cells.map(t=>t.z*size+t.x),...(city.safety?.stations??[]).map(p=>p.id),...(city.wellness?.facilities??[]).map(p=>p.id),...(city.transit?.infrastructure?.depots??[]).map(p=>p.id),...(city.energy?.plants??[]).map(p=>p.id),...city.sanitation.plants.map(p=>p.id),...(city.hydrology?.river??[]),...(city.hydrology?.outfalls??[])]);}
 if(c.management!==undefined)city.management=validateManagement(c.management,city.month);
 if(c.budget!==undefined)city.budget=validateBudget(c.budget);
 const k=obj(s.clock);if(![0,1,2,4].includes(k.speed as number))throw new Error('時間速度が不正です');
 const clock={speed:k.speed as Speed,accumulated:number(k.accumulated,0,config.stepSeconds)};
 if(clock.accumulated>=config.stepSeconds)throw new Error('時間の端数が不正です');
 return {version:s.version===5?5:s.version===4?4:s.version===3?3:2,savedAt:s.savedAt,city,clock};
}
