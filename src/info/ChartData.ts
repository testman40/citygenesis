import {urbanDemand,DEMAND_ZONES} from '../demand/Demand';
import type {City} from '../simulation/City';
import {happinessFactors,meanPollution,pollutionRegions,type MonthlyPoint} from '../statistics/CityStatistics';
import {citizenRequests,groupRequests} from './CityInformation';
import {COST_KEYS} from '../economy/Management';
export interface ChartPoint {live?:boolean;month:number;value:number|null}
export interface ChartSeries {label:string;color:string;points:ChartPoint[];badAbove?:number}
export interface ChartAction {label:string;kind?:'jobs'|'road'|'bus';region?:string;mode?:string}
export interface ChartBar {actions?:ChartAction[];label:string;value:number|null;color:string;bad?:boolean}
export interface ChartModel {id:string;title:string;kind:'line'|'bar';current:number|null;currentLabel:string;unit:string;bad?:boolean;bars?:ChartBar[];series?:ChartSeries[];note?:string;hideCurrent?:boolean;axis?:{min:number;max:number;ticks:number[]};liveMonth?:number}
export const CHART_COLORS={home:'#3B6D11',work:'#185FA5',industry:'#D85A30',power:'#BA7517',water:'#378ADD',traffic:'#534AB7',good:'#247442',bad:'#A32D2D'};
export function monthlyValues(c:City,key:keyof MonthlyPoint,scale=1):ChartPoint[]{
 const values=new Map<number,number|null>();
 // Only these old records hold the same quantities. Never infer household/pollution history.
 if(['population','funds','satisfaction'].includes(key))for(const p of c.management?.lifecycle?.history??[])values.set(p.month,p[key as 'population'|'funds'|'satisfaction']);
 for(const p of c.statistics?.months??[]){const v=p[key];values.set(p.month,typeof v==='number'?v:null);}
 return [...values].filter(([month])=>month>=Math.max(0,c.month-11)&&month<=c.month).sort((a,b)=>a[0]-b[0]).slice(-12).map(([month,value])=>({month,value:value===null?null:value*scale}));
}
const series=(c:City,key:keyof MonthlyPoint,label:string,color:string,scale=1,badAbove?:number):ChartSeries=>({label,color,points:monthlyValues(c,key,scale),badAbove});
const line=(id:string,title:string,current:number|null,currentLabel:string,unit:string,lines:ChartSeries[],bad=false,note='直近12か月の月次確定値。記録のない月は補完しません。'):ChartModel=>({id,title,current,currentLabel,unit,kind:'line',series:lines,bad,note});
const bars=(id:string,title:string,current:number|null,currentLabel:string,unit:string,data:ChartBar[],bad=false,note?:string):ChartModel=>({id,title,current,currentLabel,unit,kind:'bar',bars:data,bad,note});
export function chartModels(c:City,section:string):ChartModel[]{
 const C=CHART_COLORS;
 if(section==='demand'){const labels={residential:'住',commercial:'商',industrial:'工'},colors={residential:C.home,commercial:C.work,industrial:C.industry},now=urbanDemand(c);return [{...line('demand-history','需要の推移',null,'','',DEMAND_ZONES.map(z=>{const points=new Map<number,number|null>();for(const p of c.statistics?.months??[]){const month=p.demandMonth??p.month;if(month>=Math.max(0,c.month-11)&&month<c.month)points.set(month,p.demand?.[z]??null);}points.set(c.month,now[z]);return {label:labels[z],color:colors[z],points:[...points].sort((a,b)=>a[0]-b[0]).map(([month,value])=>({month,value,live:month===c.month}))};}),false,'右端の「今」はメーターと同じリアルタイム値。月が変わる直前の値を履歴に残します。'),hideCurrent:true,axis:{min:-100,max:100,ticks:[100,50,0,-50,-100]},liveMonth:c.month}];}
 if(section==='living')return [line('population','人口の推移',c.population,'現在の人口','人',[series(c,'population','人口',C.home)]),bars('employment','仕事のある人・ない人',c.employed,'仕事のある人','人',[{label:'仕事あり',value:c.employed,color:C.good},{label:'仕事なし',value:Math.max(0,c.workforce-c.employed),color:C.bad,bad:c.workforce>c.employed}],false,'就業対象の大人を比較。子供・高齢者は求職者に含めません。')];
 if(section==='infrastructure'){
  const water=c.waterUtility?.waterRatio??c.waterRatio,power=c.powerRatio,shortage=Math.max(0,1-water,1-power)*100;
  return [bars('electricity','電気：供給量と必要量',c.powerSupply,'現在の供給量','電力単位',[{label:'供給量',value:c.powerSupply,color:C.power,bad:power<.8},{label:'必要量',value:c.powerDemand,color:C.power}],power<.8),bars('water','水道：供給量と必要量',c.waterSupply,'現在の供給量','水量単位',[{label:'供給量',value:c.waterSupply,color:C.water,bad:water<.8},{label:'必要量',value:c.waterDemand,color:C.water}],water<.8),line('shortages','電気・水道の不足率',shortage,'現在の最大不足率','%',[series(c,'powerShortage','電気',C.power,100,0),series(c,'waterShortage','水道',C.water,100,0)],shortage>0,'供給・接続を含む充足率から算出。不足がある月は赤い点で表示します。')];
 }
 if(section==='environment'){
  const regions=pollutionRegions(c),mean=meanPollution(c);return [bars('regions','地域ごとの汚染度',mean,'現在の平均汚染指数','/100',regions.map((value,i)=>({label:['北西','北東','南西','南東'][i],value,color:C.home,bad:value!==null&&value>20})),mean!==null&&mean>20,'地域の大気平均と、河川がある地域の水質平均から計算。河川のない地域は大気のみ。'),line('pollution','平均汚染度の推移',mean,'現在の平均汚染指数','/100',[series(c,'pollution','平均汚染指数',C.home,1,20)],mean!==null&&mean>20,'地域平均の大気・水質指数（0〜100）。騒音と現地の詳細は地図ビューで確認できます。')];
 }
 if(section==='traffic')return [line('congestion','道路の混雑率',c.traffic.congestionRate*100,'現在の混雑道路率','%',[series(c,'congestion','混雑道路率',C.traffic,100,20)],c.traffic.congestionRate>.2,'全道路のうち容量超過した道路の割合。'),bars('bus-routes','バス路線ごとの利用者数',c.transit.riders,'現在のバス利用者','人',[...c.transit.services.values()].map(s=>({label:s.route.name+'（路線'+s.route.id+'）',value:s.riders,color:C.traffic})),false,'集計された利用需要です。描画中のバス乗客数とは異なります。')];
 if(section==='residents'){
  const sizes=[0,0,0,0];for(const h of c.residents?.households??[])sizes[Math.min(3,h[2]-1)]++;
  return [bars('household-sizes','世帯の人数ごとの数',c.residents?.households.length??null,'現在の世帯数','世帯',sizes.map((n,i)=>({label:['1人','2人','3人','4人以上'][i],value:c.residents?n:null,color:C.home})),false,'入居済みの世帯。転入中の世帯は含めません。'),line('households','世帯数の推移',c.residents?.households.length??null,'現在の世帯数','世帯',[series(c,'households','世帯数',C.home)])];
 }
 if(section==='happiness')return [line('happiness','幸福度の推移',c.satisfaction,'現在の幸福度','/100',[series(c,'satisfaction','幸福度',C.home)],c.satisfaction<60),bars('happiness-factors','幸福度に影響する点数',c.satisfaction,'現在の幸福度','点',happinessFactors(c).map(p=>({...p,bad:p.value<0})),c.satisfaction<60,'既存計算の加点・減点。最後の丸めと0〜100の制限前の値です。')];
 if(section==='requests'){
  const groups=groupRequests(citizenRequests(c));return [bars('requests','市民要望',groups.reduce((n,g)=>n+g.count,0),'要望の合計','件',groups.map(g=>({label:g.label,value:g.count,color:C.bad,bad:true,})),groups.length>0)];
 }
 if(section==='manage'){
  const last=c.statistics?.months.at(-1),ledger=c.finance().previous,costs=last?.costs??ledger?.costs??c.finance().forecast.costs,construction=last?.construction??ledger?.construction??0,repayment=last?.repayment??ledger?.repayment??0,expense=last?.expenses??(ledger?ledger.maintenance+construction+repayment:null),names:Record<string,string>={roads:'道路',buildings:'建物・景観',power:'電力',water:'水道',fire:'消防',police:'警察',medical:'医療',education:'教育',transit:'公共交通',interest:'利息'};
  return [line('income-expenses','毎月の収入と支出',last?.income??ledger?.tax??null,'最新決算の収入','資金',[series(c,'income','収入',C.good),series(c,'expenses','支出',C.bad)],false,'税収と、維持費＋自動建設費＋元金返済。手動の建設費は月次台帳に含まれません。'),bars('expenses','支出の内訳',expense??c.finance().forecast.maintenance,expense===null?'現在配置の支出見込':'最新決算の支出','資金',[...COST_KEYS.map(k=>({label:names[k],value:costs[k],color:k==='power'?C.power:k==='water'?C.water:k==='transit'?C.traffic:k==='buildings'?C.industry:C.work})),{label:'自動建設',value:construction,color:C.home},{label:'元金返済',value:repayment,color:C.bad}],false,expense===null?'決算前の維持費見込。決算後は最新月の実績を表示します。':'最新の月次決算の内訳。')];
 }
 if(section==='goals')return [line('growth-population','人口の推移',c.population,'現在の人口','人',[series(c,'population','人口',C.home)]),line('funds','資金の推移',c.funds,'現在の資金','資金',[series(c,'funds','資金',C.work)],c.funds<0)];
 return [];
}
