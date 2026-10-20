import type {City} from '../simulation/City';
export interface LandValue {value:number;access:number;utilities:number;amenities:number;pollution:number;noise:number;traffic:number}
const cache=new WeakMap<City,{key:string;values:Map<number,LandValue>}>();
export function landRevision(c:City){return [c.network.revision,c.month,c.population,c.powerRatio,c.waterRatio,c.traffic.solveRevision,c.environment?.revision,c.safety.policeCoverage,c.wellness.medicalCoverage,c.wellness.elementaryCoverage,c.landValueRevision].join(':');}
export function landValueAt(c:City,id:number):LandValue{
 const key=landRevision(c);let memo=cache.get(c);if(memo?.key!==key){memo={key,values:new Map()};cache.set(c,memo);}const hit=memo.values.get(id);if(hit)return hit;
 const cell={x:id%c.size,z:Math.floor(id/c.size)};if(!Number.isInteger(id)||!c.contains(cell))return {value:0,access:0,utilities:0,amenities:0,pollution:0,noise:0,traffic:0};
 const tile=c.tile(cell),roads=c.network.has(id)?[id]:c.network.access(id),access=tile.networkConnected?15:0,w=c.waterUtility?.status(id),utilities=(c.powerSupply>0&&c.powerRatio>=.8?6:0)+(w?w.service>=.8?10:0:c.waterRatio>=.8?10:0);
 const wellness=c.wellness.results.get(id),safety=c.safety.results.get(id),coverage=(k:'medical'|'elementary'|'highSchool')=>wellness?.[k]??Math.max(0,...roads.map(r=>c.wellness.roadCoverage(r,k))),safe=(k:'police'|'fire')=>safety?.[k]??Math.max(0,...roads.map(r=>c.safety.coverageAt(r,k))),amenities=Math.min(24,c.parks.at(id)*4)+Math.min(12,coverage('medical')*5+coverage('elementary')*4+coverage('highSchool')*3)+Math.min(8,safe('police')*4+safe('fire')*4);
 const environment=c.environment?.at(id),pollution=(environment?.air??0)*.25,noise=(environment?.noise??0)*.15,traffic=Math.min(15,Math.max(0,...roads.map(r=>c.traffic.congestion(r)-.7))*10);
 const value=Math.round(Math.max(0,Math.min(100,25+access+utilities+amenities-pollution-noise-traffic))),result={value,access,utilities,amenities,pollution,noise,traffic};memo.values.set(id,result);return result;
}
export const PRODUCT_TIERS=['日用品','上質な商品','高付加価値品'] as const;
export function productTier(value:number){return value>=70?2:value>=45?1:0;}
const products=new WeakMap<City,{key:string;result:{demand:number[];bonus:number;commercialTier:number;industrialTier:number}}>();
export function productEconomy(c:City,preview=false){
 if(!c.districts&&!preview)return {demand:[0,0,0],bonus:0,commercialTier:0,industrialTier:0};
 const key=landRevision(c)+':'+c.commercialEmployed+':'+c.industrialEmployed+':'+c.taxRate+':'+!!c.districts+':'+preview,hit=products.get(c);if(hit?.key===key)return hit.result;
 let commercial=0,industrial=0,commercialWeight=0,industrialWeight=0;const demand=[0,0,0];
 for(const cell of c.zoneCells()){const t=c.tile(cell);if(!t.level||!t.networkConnected||(t.zone!=='commercial'&&t.zone!=='industrial'))continue;const tier=productTier(landValueAt(c,cell.z*c.size+cell.x).value),weight=t.level*(t.zone==='commercial'?c.config.commercialJobsPerLevel:c.config.industrialJobsPerLevel);demand[tier]+=weight;if(t.zone==='commercial'){commercial+=tier*weight;commercialWeight+=weight;}else{industrial+=tier*weight;industrialWeight+=weight;}}
 const premium=(commercialWeight?c.commercialEmployed*commercial/commercialWeight:0)+(industrialWeight?c.industrialEmployed*industrial/industrialWeight:0);
 const bonus=c.districts?Math.round(premium*c.config.jobTax*c.taxRate*.05*100)/100:0;
 const result={demand,bonus,commercialTier:commercialWeight?commercial/commercialWeight:0,industrialTier:industrialWeight?industrial/industrialWeight:0};products.set(c,{key,result});return result;
}
