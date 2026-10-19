import {urbanDemand,type DemandValues} from '../demand/Demand';
import type {City} from '../simulation/City';
import {COST_KEYS,type Costs} from '../economy/Management';
export interface MonthlyPoint {demandMonth?:number;demand?:DemandValues;month:number;population:number;funds:number;employed:number;workforce:number;households:number|null;powerSupply:number;powerDemand:number;waterSupply:number;waterDemand:number;powerShortage:number;waterShortage:number;pollution:number|null;congestion:number;satisfaction:number;income:number;expenses:number;costs:Costs;construction:number;repayment:number}
export interface StatisticsState {version:1;months:MonthlyPoint[]}
/** Equal-area quadrants: mean air index and mean river-water index where a river exists. */
export function pollutionRegions(c:City):Array<number|null>{
 const e=c.environment;if(!e)return [null,null,null,null];
 const air=[0,0,0,0],count=[0,0,0,0],water=[0,0,0,0],river=[0,0,0,0],region=(x:number,z:number)=>(z<c.size/2?0:2)+(x<c.size/2?0:1);
 for(let z=0;z<e.width;z++)for(let x=0;x<e.width;x++){const r=region(x*e.stride,z*e.stride);air[r]+=e.air[z*e.width+x];count[r]++;}
 for(const id of c.hydrology?.river??[]){const r=region(id%c.size,Math.floor(id/c.size));water[r]+=e.at(id).water;river[r]++;}
 return air.map((v,i)=>((count[i]?v/count[i]:0)+(river[i]?water[i]/river[i]:0))/(river[i]?2:1));
}
export function meanPollution(c:City){const regions=pollutionRegions(c);return regions[0]===null?null:(regions as number[]).reduce((a,b)=>a+b,0)/4;}
export function monthlyPoint(c:City,closingDemand?:DemandValues):MonthlyPoint{
 const ledger=c.finance().previous,costs=ledger?.costs??c.financeCosts(),construction=ledger?.construction??c.constructionSpending,repayment=ledger?.repayment??0;
 return {...(closingDemand?{demandMonth:c.month-1}:{}),demand:closingDemand??urbanDemand(c),month:c.month,population:c.population,funds:c.funds,employed:c.employed,workforce:c.workforce,households:c.residents?.households.length??null,powerSupply:c.powerSupply,powerDemand:c.powerDemand,waterSupply:c.waterSupply,waterDemand:c.waterDemand,powerShortage:Math.max(0,1-c.powerRatio),waterShortage:Math.max(0,1-(c.waterUtility?.serviceRatio??c.waterRatio)),pollution:meanPollution(c),congestion:c.traffic.congestionRate,satisfaction:c.satisfaction,income:c.tax,expenses:c.maintenance+construction+repayment,costs:{...costs},construction,repayment};
}
/** Immutable append keeps a displayed pre-transaction city isolated from a worker update. */
export function appendMonthly(previous:StatisticsState|undefined,point:MonthlyPoint):StatisticsState{
 const months=(previous?.months??[]).filter(p=>p.month<point.month);return {version:1,months:[...months,structuredClone(point)].slice(-12)};
}
export function validateStatistics(raw:unknown,month:number):StatisticsState{
 const s=raw as StatisticsState;if(!s||s.version!==1||!Array.isArray(s.months)||s.months.length>12)throw new Error('月次統計の形式が不正です');
 const num=(value:unknown,min=0,max=1e15,integer=false)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isSafeInteger(value)))throw new Error('月次統計の数値が不正です');return value;};let last=-1;
 const months=s.months.map(p=>{if(!p||typeof p!=='object')throw new Error('月次統計が不正です');const m=num(p.month,0,month,true);if(m<=last)throw new Error('月次統計の月が重複・逆転しています');last=m;
  const result:MonthlyPoint={month:m,population:num(p.population,0,1e12,true),funds:num(p.funds,-1e12,1e12),employed:num(p.employed,0,1e12,true),workforce:num(p.workforce,0,1e12,true),households:p.households===null?null:num(p.households,0,1e12,true),powerSupply:num(p.powerSupply),powerDemand:num(p.powerDemand),waterSupply:num(p.waterSupply),waterDemand:num(p.waterDemand),powerShortage:num(p.powerShortage,0,1),waterShortage:num(p.waterShortage,0,1),pollution:p.pollution===null?null:num(p.pollution,0,100),congestion:num(p.congestion,0,1),satisfaction:num(p.satisfaction,0,100),income:num(p.income),expenses:num(p.expenses),costs:{} as Costs,construction:num(p.construction),repayment:num(p.repayment)};
  if(p.demand!==undefined){if(!p.demand||typeof p.demand!=='object')throw new Error('需要履歴が不正です');result.demand={residential:num(p.demand.residential,-100,100,true),commercial:num(p.demand.commercial,-100,100,true),industrial:num(p.demand.industrial,-100,100,true)};}
  if(p.demandMonth!==undefined){if(!result.demand||m<1||p.demandMonth!==m-1)throw new Error('需要の確定月が不正です');result.demandMonth=num(p.demandMonth,0,m-1,true);}
  if(!p.costs||typeof p.costs!=='object')throw new Error('月次統計の支出内訳が不正です');for(const k of COST_KEYS)result.costs[k]=num(p.costs[k]);if(result.employed>result.workforce)throw new Error('月次統計の就業人数が不正です');return result;
 });return {version:1,months};
}
/** These are the game's actual inputs, before its existing rounding/clamping stages. */
export function happinessFactors(c:City){const employment=c.workforce?c.employed/c.workforce:1,taxApproval=Math.max(0,1-Math.max(0,c.taxRate-1)*c.config.taxDissatisfaction);return [
 {label:'住まい（公園・広場）',value:c.sceneryBonus,color:'#3B6D11'},
 {label:'仕事',value:100*employment*c.config.employmentSatisfactionWeight,color:'#185FA5'},
 {label:'電気',value:100*c.powerRatio*c.config.powerSatisfactionWeight,color:'#BA7517'},
 {label:'水道',value:100*c.waterRatio*c.config.waterSatisfactionWeight,color:'#378ADD'},
 {label:'税率への納得',value:100*taxApproval*c.config.taxSatisfactionWeight,color:'#3B6D11'},
 {label:'交通',value:-Math.round(Math.max(0,c.traffic.averageMinutes-c.config.comfortableCommuteMinutes)*c.config.commuteSatisfactionPenalty),color:'#534AB7'},
 {label:'安全',value:-Math.round(c.safety.penalty),color:'#534AB7'},
 {label:'医療・教育',value:-Math.round(c.wellness.penalty),color:'#185FA5'},
 {label:'下水・衛生',value:-Math.round(c.waterUtility?.penalty??0),color:'#378ADD'},
 {label:'環境',value:-Math.round(c.environment?.penalty??0),color:'#3B6D11'}];}
