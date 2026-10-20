import {City,type Cell,type Tool} from '../simulation/City';
import {gridStroke} from '../simulation/GridInput';
import {commitRoad} from '../roads/execute';
import {urbanDemand} from '../demand/Demand';
import {createSupport,validateSupport,type SupportSettings} from './SupportState';
const money=(n:number)=>Math.round(n*100)/100;
type SupportTool=Extract<Tool,'road'|'pipe'|'water'|'externalWater'|'sewage'|'power'|'residential'|'commercial'|'industrial'|'elementary'>;
export interface SupportOperation {tool:SupportTool;from:Cell;to:Cell}
export interface SupportProposal {id:string;title:string;reason:string;operations:SupportOperation[];cells:Cell[];cost:number;reserved:number;upkeep:number;balance:number;cash:number;blocked:string[];requiresApproval:boolean}
export interface SupportAdvice {proposal:SupportProposal|null;message:string}
const cache=new WeakMap<City,{key:string;advice:SupportAdvice}>();
const op=(tool:SupportTool,from:Cell,to=from):SupportOperation=>({tool,from:{...from},to:{...to}});
const position=(c:City,id:number):Cell=>({x:id%c.size,z:Math.floor(id/c.size)});
const empty=(c:City,p:Cell)=>c.contains(p)&&c.roadPlacement(p.z*c.size+p.x)==='free';
const roadUsable=(c:City,id:number)=>c.network.isMain(id)&&c.network.profile(id).access&&c.network.allows(id,'car');
function site(c:City,tool:SupportTool,roads:number[]){for(const road of roads)for(const id of c.hydrology!.neighbors(road)){const p=position(c,id);if(!empty(c,p))continue;const q=c.placement(p,tool);if(q.ok||q.reason.startsWith('資金'))return p;}return null;}
function pendingConstruction(c:City){let sum=0;for(const p of c.zoneCells())if(!c.tile(p).level)sum+=c.config.buildingCost;return sum;}
function apply(c:City,operations:SupportOperation[]){for(const a of operations){for(const p of gridStroke(a.from,a.to)){if(a.tool==='road'){const state=c.roadPlacement(p.z*c.size+p.x);if(state==='blocked'||state==='road'&&(!c.network.profile(p.z*c.size+p.x).access||!c.network.allows(p.z*c.size+p.x,'car')))throw Error('提案の道路に障害物があります');}else if(a.tool==='pipe'){if(!c.hasRoad(p))throw Error('道路の下だけに管を敷設できます');}else if(!empty(c,p))throw Error('提案の場所がすでに使われています');}
 if(a.tool==='pipe')c.editTransit(next=>next.waterWorks(a.from,a.to,'pipe'));else if(a.tool==='residential')c.zoneHousingStroke(a.from,a.to,'low');else c.applyStroke(a.from,a.to,a.tool);if(c.lastMessage)throw Error(c.lastMessage);
}}
function proposal(c:City,title:string,reason:string,operations:SupportOperation[],requiresApproval=false):SupportAdvice{
 const next=City.fromState(c.snapshot()),funds=Math.max(c.funds,1e9);next.funds=funds;
 try{apply(next,operations);}catch{return {proposal:null,message:'安全に建設できる候補がありません。道路・河川・既存の建物を手動で確認してください。'};}
 const cost=money(funds-next.funds);next.funds=money(c.funds-cost);const reserved=money(Math.max(0,pendingConstruction(next)-pendingConstruction(c))),upkeep=money(Math.max(0,next.finance().forecast.maintenance-c.finance().forecast.maintenance)),balance=next.finance().forecast.balance,s=c.support??createSupport(),spent=s.budgetMonth===c.month?s.spent:0,added=s.budgetMonth===c.month?s.upkeepAdded:0,cash=next.funds,blocked:string[]=[];
 if(cost+reserved+spent>s.monthlyBudget+.001)blocked.push('今月の支援予算が足りません（初回の建設費予約も含みます）');
 if(added+upkeep>s.monthlyUpkeepLimit+.001)blocked.push('今月増やせる維持費の上限を超えます');
 if(cash-pendingConstruction(next)-Math.max(0,-balance)*6<s.minimumCash-.001)blocked.push('残す資金と、初回建設費・赤字6か月分の余裕を確保できません');
 const cells=[...new Map(operations.flatMap(a=>gridStroke(a.from,a.to)).map(p=>[p.z*c.size+p.x,p])).values()],id=JSON.stringify(operations);
 return {proposal:{id,title,reason,operations,cells,cost,reserved,upkeep,balance,cash,blocked,requiresApproval},message:blocked[0]??reason};
}
function plan(c:City):SupportAdvice{
 if(c.roadCount>1024||c.buildingCount>256)return {proposal:null,message:'小規模な街の基礎整備向けです。大きな都市は都市情報と施設の収支を確認しましょう。'};
 if(!c.waterUtility||!c.hydrology)return {proposal:null,message:'施設式上下水道を有効にしてから支援を開始してください。'};
 if(c.funds<0)return {proposal:null,message:'資金がマイナスです。維持費を見直してください。自動で借金はしません。'};
 const roads=[...c.network.ids()].filter(id=>roadUsable(c,id)).sort((a,b)=>a-b);
 const safe=(cells:Cell[])=>cells.every(p=>c.contains(p)&&(empty(c,p)||c.hasRoad(p)&&roadUsable(c,p.z*c.size+p.x)));
 if(!c.roadCount){const z=Math.floor(c.size/2),from={x:0,z},to={x:Math.min(24,c.size-1),z};if(safe(gridStroke(from,to)))return proposal(c,'街の入口と生活道路を整える','マップ外から入居できる道路を先に用意します。上下水道管も同時に敷設します。',[op('road',from,to)]);return {proposal:null,message:'河川や建物を避け、マップ端から一般道路を引いてください。'};}
 if(c.residents&&!c.residents.gateways(c).length){const edge=(id:number)=>Math.min(id%c.size,c.size-1-id%c.size,Math.floor(id/c.size),c.size-1-Math.floor(id/c.size));for(const id of roads.slice().sort((a,b)=>edge(a)-edge(b)).slice(0,32)){const from=position(c,id),ends=[{x:0,z:from.z},{x:c.size-1,z:from.z},{x:from.x,z:0},{x:from.x,z:c.size-1}].sort((a,b)=>Math.abs(a.x-from.x)+Math.abs(a.z-from.z)-Math.abs(b.x-from.x)-Math.abs(b.z-from.z));for(const to of ends){const path=gridStroke(from,to);if(path.length>1&&path.length<=64&&safe(path)&&path.some(p=>!c.hasRoad(p)))return proposal(c,'道路をマップの端につなぐ','住民の転入には、主道路網からマップ外へ通じる一般道路が必要です。',[op('road',from,to)]);}}return {proposal:null,message:'建物を壊さずに街の入口へつなぐ道が見つかりません。道路を手動で接続してください。'};}
 const missing=roads.filter(id=>!c.hydrology!.pipes.has(id));if(missing.length)return proposal(c,'道路下の上下水道管を補う','不足する管だけを敷設します。',missing.slice(0,32).map(id=>op('pipe',position(c,id))));
 if(c.powerSupply<=0||c.powerRatio<.8){const p=site(c,'power',roads);return p?proposal(c,'電力の不足を補う','発電所の費用と維持費を確認します。',[op('power',p)]):{proposal:null,message:'発電所の空き地・道路接続を確認してください。'};}
 if(c.waterSupply<=0||c.waterUtility.waterRatio<.8){const natural=site(c,'water',roads),p=natural??site(c,'externalWater',roads);return p?proposal(c,'給水施設を整備する','道路下の管を通して水を届けます。外部水道は購入費も発生します。',[op(natural?'water':'externalWater',p)]):{proposal:null,message:'給水施設の空き地・道路接続を確認してください。'};}
 if(c.waterUtility.drainageCapacity<=0||c.waterUtility.drainageRatio<.8){const p=site(c,'sewage',roads);return p?proposal(c,'下水処理場を整備する','給水だけでなく排水先も同じ管網につなげます。',[op('sewage',p)]):{proposal:null,message:'下水処理場の空き地・道路接続を確認してください。'};}
 const homes=[...c.zoneCells()].filter(p=>c.tile(p).zone==='residential'),work=[...c.zoneCells()].filter(p=>c.tile(p).zone!=='residential'),unbuilt=[...homes,...work].some(p=>!c.tile(p).level);
 if(homes.some(p=>!c.tile(p).networkConnected))return {proposal:null,message:'道路から孤立した住宅があります。接続は道路ツールで確認してください。'};
 const demand=urbanDemand(c),needHome=!homes.length||!unbuilt&&c.population<300&&demand.residential>10&&c.housing-c.population<4,needWork=!work.length||!unbuilt&&c.workforce>c.employed&&(demand.commercial>0||demand.industrial>0);
 if(needHome||needWork){const spots:Cell[]=[],used=new Set<number>();outer:for(const id of roads)for(const near of c.hydrology.neighbors(id)){const p=position(c,near);if(!empty(c,p)||used.has(near)||c.waterUtility.status(near).service<c.config.growthSupplyThreshold)continue;used.add(near);spots.push(p);if(spots.length>=8)break outer;}const operations:SupportOperation[]=[];
 if(needHome)for(const p of spots.splice(0,3))operations.push(op('residential',p));if(needWork)for(const [i,p] of spots.splice(0,3).entries())operations.push(op(i===0?'commercial':'industrial',p));
 if(operations.length&&(!needHome||operations.some(a=>a.tool==='residential'))&&(!needWork||operations.some(a=>a.tool==='commercial'||a.tool==='industrial')))return proposal(c,needHome?'住宅と働き口を小さく整える':'働き口を少し追加する','道路と管網に沿って住宅・職場を増やします。初回の建設費も予算に含めます。',operations);
 return {proposal:null,message:'給排水が届く空き地が足りません。住宅の近くへ生活道路を延ばしてください。'};}
 if(unbuilt)return {proposal:null,message:'指定済み区画の建設を待ちましょう。時間を進めると通常の速度で建物が育ちます。'};
 if(c.population>=100&&![...c.wellness.facilities.values()].includes('elementary')&&c.finance().forecast.balance>0){const p=site(c,'elementary',roads);if(p)return proposal(c,'小学校の整備を検討する','学校には維持費がかかります。自動モードでも承認後にだけ建てます。',[op('elementary',p)],true);}
 return {proposal:null,message:c.population>=300?'初期の住宅拡張支援は人口300人までです。都市情報を見ながら整備しましょう。':'入居と毎月の収支を見守りましょう。空き家や施設を先に使い、建てすぎを避けます。'};
}
export function supportAdvice(c:City):SupportAdvice{const key=JSON.stringify([c.month,c.funds,c.landValueRevision,c.network.revision,c.traffic.solveRevision,c.population,c.support]);const hit=cache.get(c);if(hit?.key===key)return hit.advice;const advice=plan(c);cache.set(c,{key,advice});return advice;}
export function configureSupport(c:City,settings:SupportSettings){if(c.updating)throw Error('都市更新中です');c.support=validateSupport({...c.support??createSupport(),...settings},c.month,c.size);}
export function executeSupport(c:City,expectedId:string,automatic=false){
 if(c.updating)throw Error('都市更新中です');const s=c.support;if(!s||s.mode==='off'||s.mode==='advice')throw Error('「承認して実行」を選んでください');if(automatic&&s.mode!=='auto')throw Error('自動サポートは停止しています');if(automatic&&s.lastAutoMonth===c.month)throw Error('自動サポートは1か月に1提案までです');
 const p=supportAdvice(c).proposal;if(!p||p.id!==expectedId)throw Error('都市の状態が変わりました。新しい提案を確認してください');if(automatic&&p.requiresApproval)throw Error('この施設は承認が必要です');if(p.blocked.length)throw Error(p.blocked[0]);
 const next=City.fromState(c.snapshot()),before=next.funds;apply(next,p.operations);const cost=money(before-next.funds);if(Math.abs(cost-p.cost)>.01)throw Error('建設費が変わりました');const prior=next.support!,newMonth=prior.budgetMonth!==next.month;prior.budgetMonth=next.month;prior.spent=money((newMonth?0:prior.spent)+cost+p.reserved);prior.upkeepAdded=money((newMonth?0:prior.upkeepAdded)+p.upkeep);if(automatic||prior.mode==='auto')prior.lastAutoMonth=next.month;prior.history.unshift({month:next.month,title:p.title,cost,reserved:p.reserved,upkeep:p.upkeep,x:p.cells[0].x,z:p.cells[0].z,automatic});prior.history=prior.history.slice(0,20);commitRoad(c,next);return p;
}
