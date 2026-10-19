import {serviceHomes,publicEnabled,type PublicService} from '../services/PublicFacilities';
import {urbanDemand} from '../demand/Demand';
import {employmentInformation,workAccessAt,type WorkIssue} from './EmploymentInformation';
import type {City} from '../simulation/City';
export const INFO_MODES={workAccess:'仕事への近さ',air:'大気汚染',noise:'騒音',normal:'通常',happiness:'幸福度（都市値・区域条件）',demand:'開発需要',power:'電力',water:'水道',sewage:'下水・汚水',network:'道路接続',traffic:'交通・渋滞',transit:'公共交通',fire:'消防',police:'治安',medical:'医療',education:'教育',environment:'河川の水質'} as const;
export type InfoMode=keyof typeof INFO_MODES;
export const INFO_STYLE={green:{color:'#42bf89',symbol:'●',label:'良好・充足'},blue:{color:'#4e9ee9',symbol:'＝',label:'注意・改善余地'},red:{color:'#ef646b',symbol:'×',label:'問題・不足'},neutral:{color:'#9ba9ae',symbol:'—',label:'対象外・未開始'}} as const;
export type InfoState=keyof typeof INFO_STYLE;
export const INFO_THRESHOLDS={good:.8,caution:.4,trafficGood:.7,trafficLimit:1,demandGood:60,demandCaution:30};
export function fulfillment(v:number):InfoState{return v>=INFO_THRESHOLDS.good?'green':v>=INFO_THRESHOLDS.caution?'blue':'red';}
export function informationAt(c:City,id:number,mode:InfoMode):{state:InfoState;value:number|null;note:string}{
 const x=id%c.size,z=Math.floor(id/c.size);if(!Number.isInteger(id)||!c.contains({x,z}))return {state:'neutral',value:null,note:'マップ外'};
 const t=c.tile({x,z}),h=c.hydrology,w=c.waterUtility;if(mode==='air'||mode==='noise'||mode==='environment'&&h?.river.has(id)&&c.environment){if(!c.environment)return {state:'neutral',value:null,note:'環境計算の開始待ち'};const v=c.environment.at(id)[mode==='environment'?'water':mode];return {state:v<=20?'green':v<=60?'blue':'red',value:v/100,note:'ゲーム内指数 '+v.toFixed(1)+'/100（推計）'};}if(h?.river.has(id)&&['water','sewage','environment'].includes(mode))return {state:'neutral',value:null,note:'河川の水質濃度・拡散は未計算。施設・管網の汚水負荷を確認してください'};if(w&&['water','sewage','environment'].includes(mode)&&!t.road&&!t.zone&&!t.facility&&!h?.pipes.has(id))return {state:'neutral',value:null,note:'給排水の対象外'};let value:number|null=null,note='';let state:InfoState|undefined;
 switch(mode){
 case 'workAccess':value=workAccessAt(c,id);note='道路で徒歩10マス・車30マス、運行中のバスは停留所まで徒歩5マス。緑ほど職場に通いやすい場所です';break;
 case 'normal':return {state:'neutral',value:null,note:'用途色'};
 case 'happiness':value=c.satisfaction/100;note='都市全体の実測値。このマスの公園効果 +'+c.parks.at(id).toFixed(1)+'（都市値には住宅の平均効果を反映）';break;
 case 'demand':if(t.zone){value=(urbanDemand(c)[t.zone]+100)/200;state=value>=INFO_THRESHOLDS.demandGood/100?'green':value>=INFO_THRESHOLDS.demandCaution/100?'blue':'red';note='開発需要（低い値は成長余地が小さい）';}else note='区画が対象';break;
 case 'power':value=t.networkConnected?c.powerRatio:0;note=t.networkConnected?'都市の電力充足':'主道路網に未接続';break;
 case 'water':if(w){const r=w.status(id);value=r.water;note=r.connected?'施設式の給水能力・需要':'道路/管網に未接続';break;}value=h?h.at(id):t.networkConnected?c.waterRatio:0;note=h?'管網の有効給水（排水・水質を含む）':'外部給水＋給水施設の従来方式';break;
 case 'sewage':case 'environment':if(w){const r=w.status(id);if(!r.generated)return {state:'neutral',value:null,note:'下水発生なし（未給水・未開発を含む）'};value=r.connected?(r.generated?(mode==='sewage'?r.processed/r.generated:1-r.residual/r.generated):r.capacity?1:0):0;note=mode==='sewage'?'下水：発生 '+r.generated.toFixed(1)+' / 未処理 '+r.unprocessed.toFixed(1):'残留負荷 '+r.residual.toFixed(1)+'。管網の残留負荷。河川の汚染指数は環境ビューで確認';break;}if(h){if(c.sanitation){const r=h.treatmentAt(id);value=r.discharged?r.cleaned/r.discharged:r.connected?1:0;note='管網の残留負荷（処理後の残留分を含む）';}else if(mode==='sewage'){value=h.status(id).sewer;note='排水充足。水質管理は未開始・幸福度へ汚水効果なし';}else note='管網の水質管理は未開始。河川・大気・騒音は環境ビューで確認';}else note='従来方式では下水計算なし';break;
 case 'network':value=t.road?(c.network.isMain(id)?1:0):(t.networkConnected?1:0);note='最大の道路網への接続';break;
 case 'traffic':if(t.road){value=c.traffic.congestion(id);state=value<=INFO_THRESHOLDS.trafficGood?'green':value<=INFO_THRESHOLDS.trafficLimit?'blue':'red';note='交通量 ÷ 道路容量';}else note='道路を選択してください';break;
 case 'transit':value=c.transit.covered(id)?1:0;state=value?'green':'blue';note=value?'停留所の徒歩圏。運行能力は路線詳細で確認':'停留所の徒歩圏外（バス利用は任意）';break;
 case 'fire':case 'police':if(c.safety.enabled){value=c.safety.results.get(id)?.[mode]??(t.road?c.safety.coverageAt(id,mode):Math.max(0,...c.network.adjacent(id).map(r=>c.safety.coverageAt(r,mode))));note='道路・混雑・予算を反映したサービス充足';}else note='安全政策未開始・従来の外部サービス';break;
 case 'medical':case 'education':if(mode==='medical'?c.wellness.medicalEnabled:c.wellness.educationEnabled){const r=c.wellness.results.get(id);value=r?(mode==='medical'?r.medical:r.elementary*.6+r.highSchool*.4):Math.max(0,...(t.road?[id]:c.network.adjacent(id)).map(n=>mode==='medical'?c.wellness.roadCoverage(n,'medical'):c.wellness.roadCoverage(n,'elementary')*.6+c.wellness.roadCoverage(n,'highSchool')*.4));note='到達性と定員による充足。教育水準とは別';}else note='未開始・従来の外部サービス';break;
 }
 return {state:state??(value===null?'neutral':fulfillment(value)),value,note};
}
export interface CitizenRequest {count?:number;unit?:string;regions?:WorkIssue[];id:string;mode:InfoMode;severity:'red'|'blue';title:string;area:string;action:string}
export function citizenRequests(c:City):CitizenRequest[]{const r:CitizenRequest[]=[],add=(id:string,mode:InfoMode,v:number,title:string,area:string,action:string)=>{if(v<INFO_THRESHOLDS.good)r.push({id,mode,severity:v<INFO_THRESHOLDS.caution?'red':'blue',title,area,action});};
 if(c.buildingCount){add('water','water',c.waterRatio,'有効給水が不足','給水不足の建物・管網',c.waterUtility?'外部水道・自然取水の能力と道路/配管接続を確認':c.hydrology?'取水施設・排水口・管接続と処理を確認':'主道路網と給水施設を確認');add('power','power',c.powerRatio,'電力が不足','電力不足の建物','電源・主道路網・外部契約を確認');}
 if(!c.waterUtility&&c.hydrology&&c.hydrology.demand){add('drain','sewage',c.hydrology.sewerRatio,'排水能力が不足','排水不足の管網','排水口と管接続を確認');if(c.sanitation&&c.hydrology.untreated>.001)add('pollution','environment',1-c.hydrology.untreated/Math.max(1,c.hydrology.discharged),'残留汚水があります','放流している管網','同じ管網に下水処理場を接続・電力と道路を確保');}
 if(c.waterUtility){const w=c.waterUtility;if(w.generated){add('sewage-capacity','sewage',w.treatmentRatio,'下水処理施設を増やしてください','処理能力不足・未接続の給排水網','処理場の能力・電力・道路/配管接続を確認');add('hygiene','environment',1-w.residual/w.generated,'汚水による衛生環境の悪化','未浄化負荷が残る給排水網','処理場の増設・高度化と配水網の接続を確認');}if(w.purchaseCost>Math.max(20,c.tax*.2))r.push({id:'water-cost',mode:'water',severity:'blue',title:'外部水購入費が増加しています',area:'外部水道を利用する給配水網',action:'自然取水の併用・需要と購入量を確認'});}
 if(c.traffic.averageMinutes>c.config.comfortableCommuteMinutes)r.push({id:'commute',mode:'traffic',severity:c.traffic.averageMinutes>c.config.comfortableCommuteMinutes*2?'red':'blue',title:'通勤時間が長い',area:'通勤する住宅・職場',action:'渋滞・職場配置・バスの有効路線を確認'});
 if(c.disconnected>0)r.push({id:'isolation',mode:'network',severity:'red',title:'道路網から孤立しています',area:'未接続 '+c.disconnected+'区画・施設',action:'主道路網へ道路を接続する'});for(const reason of ['jobs','access'] as const){const regions=employmentInformation(c).issues.filter(r=>r.reason===reason),count=regions.reduce((n,r)=>n+r.count,0);if(count)r.push({id:'employment-'+reason,mode:'workAccess',severity:'blue',title:reason==='jobs'?'近くに仕事がない':'仕事へ行く手段がない',area:count+(c.residents?'世帯':'住宅区画'),count,unit:c.residents?'世帯':'住宅区画',regions,action:reason==='jobs'?'商業・工業を同じ道路網の近くに配置':'道路の切れ目・バス路線の接続を確認'});}
 if(c.population&&c.taxRate>1)r.push({id:'tax',mode:'happiness',severity:'blue',title:'税負担が高い',area:'全市',action:'収支を確認して税倍率を見直す'});
 if(c.wellness.medicalEnabled&&c.population)add('medical','medical',c.wellness.medicalCoverage,'医療が不足','医療未充足の住宅','医療施設・道路・定員・予算を確認');
 if(c.wellness.educationEnabled&&c.population)add('education','education',c.wellness.elementaryCoverage*.6+c.wellness.highSchoolCoverage*.4,'教育が不足','通学未充足の住宅','学校・道路・定員・予算を確認');
 if(c.safety.enabled&&c.buildingCount){add('fire','fire',c.safety.fireCoverage,'消防が不足','消防未充足の建物','消防署・道路・予算を確認');add('police','police',c.safety.policeCoverage,'警察が不足','警察未充足の建物','警察署・道路・予算を確認');}
 const active=[...c.transit.services.values()].filter(s=>s.active),capacity=active.reduce((n,s)=>n+s.capacity,0);if(capacity>0&&c.transit.riders>=capacity*.95&&c.transit.carUsers>0)r.push({id:'bus-capacity',mode:'transit',severity:'blue',title:'バス輸送枠に余裕が少ない',area:'運行中の路線',action:'路線別利用者・配備台数・公共交通予算を確認'});
 for(const request of r){if(['fire','police','medical','education'].includes(request.id)&&publicEnabled(c,request.id as PublicService)){const homes=serviceHomes(c,request.id as PublicService);if(homes.length){request.count=homes.reduce((n,h)=>n+(c.residents?.atHome(h.id).length||1),0);request.unit=c.residents?'世帯':'住宅区画';}}}
 return r.sort((a,b)=>(a.severity==='red'?0:1)-(b.severity==='red'?0:1)||a.id.localeCompare(b.id));
}

export const requestTotal=(requests:CitizenRequest[])=>requests.reduce((n,r)=>n+(r.count??1),0);
export function groupRequests(requests:CitizenRequest[]){
 const categories=[['道路','network'],['電気','power'],['水道','water'],['下水','sewage'],['環境','environment','air','noise'],['交通','traffic','transit'],['仕事','employment'],['公共サービス','medical','education','fire','police'],['その他','other']];
 const groups=categories.map(g=>({label:g[0],key:g[1],count:0,requests:[] as CitizenRequest[]}));for(const r of requests){const key=r.id==='employment-access'?'network':r.id.startsWith('employment')?'employment':r.mode;let index=categories.findIndex(g=>g.slice(1).includes(key));if(index<0)index=groups.length-1;groups[index].count+=r.count??1;groups[index].requests.push(r);}return groups.filter(g=>g.count>0).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'ja'));
}
