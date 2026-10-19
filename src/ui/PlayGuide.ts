import type {City,Cell,Tool} from '../simulation/City';
import {citizenRequests,informationAt,type InfoMode} from '../info/CityInformation';
export interface GuideAction {id:string;title:string;reason:string;action:string;mode?:InfoMode;tool?:Tool;panel?:string;location?:Cell}
export interface CityFacts {roads:number;residential:number;workplaces:number;connectedHomes:number;connectedWorkplaces:number}
/** Only occupied cells are visited; render frames do not scan the entire map. */
export function cityFacts(city:City,cells=city.snapshot().cells):CityFacts {
  const connected=(zone:number)=>cells.filter(c=>c.zone===zone&&city.networkConnected(c)).length;
  return {roads:city.roadCount,residential:cells.filter(c=>c.zone===1).length,workplaces:cells.filter(c=>c.zone===2||c.zone===3).length,connectedHomes:connected(1),connectedWorkplaces:connected(2)+connected(3)};
}
export function nextActions(city:City):GuideAction[]{
  const result:GuideAction[]=[];
  if(city.residents&&!city.residents.gateways(city).length)return [{id:'outside-road',title:'マップの端から街へ道路をつなぐ',reason:'新しい住民はマップ外から車で転入します。',action:'地図の端の道路を住宅までつなぎ、住宅の完成後に時間を進めましょう。',tool:'road'}];
  const failed=[...city.transit.operations.buses.values()].find(b=>b.state==='error');
  if(failed)result.push({id:'bus-recovery',title:'異常停止したバスを確認',reason:'道路や施設の変更で停止した便があります。',action:'便を選び、診断と復旧案内を確認します。',panel:'bus-recovery-panel'});
  const requests=citizenRequests(city);
  const cells=city.snapshot().cells;
  for(const r of requests){
    // Affected cells are evidence of a problem area, never a guessed road gap.
    const target=r.id==='isolation'?cells.find(c=>(c.zone||c.facility)&&!city.networkConnected(c)):
      ['power','water','medical','education','fire','police'].includes(r.mode)?cells.find(c=>c.zone&&c.level>0&&['red','blue'].includes(informationAt(city,c.z*city.size+c.x,r.mode).state)):undefined;
    const panel=r.id==='water'?(city.waterUtility?'water-utility-panel':city.hydrology?'water-panel':'management-panel'):r.id==='power'?'energy-panel':undefined;
    result.push({id:r.id,title:r.title,reason:r.area,action:r.action,mode:panel?undefined:r.mode,panel,...(target?{location:{x:target.x,z:target.z}}:{}),...(r.id==='isolation'?{tool:'road' as const}:{}),...(r.id==='employment'?{tool:'commercial' as const}:{})});
  }
  // Undeveloped zones also need water; lack of buildings must not hide a blocked start.
  const dry=cells.find(c=>c.zone&&city.networkConnected(c)&&(city.waterUtility?.status(c.z*city.size+c.x).service??city.hydrology?.at(c.z*city.size+c.x)??city.waterRatio)<.8);
  if(dry&&!result.some(a=>a.id==='water'))result.push({id:'water',title:'給水・排水と上下水道管をつなぎましょう',reason:'給水または排水が足りず、住宅・職場の建設と入居が進みません。',action:city.waterUtility?'給水施設と基本下水処理場（河川では排水口も可）を置きます。新しい道路には上下水道管も付きます。既存道路は道路ツールでなぞり、管を補完して住宅までつなぎます。':'取水施設・排水口・上下水道管の接続を確認します。',panel:city.waterUtility?'water-utility-panel':'water-panel',location:{x:dry.x,z:dry.z}});
  const finance=city.finance();
  if(city.funds<0||((city.population>0||city.funds<500)&&finance.forecast.balance<0))result.push({id:'finance',title:city.funds<0?'建設資金が不足':'支出が税収を上回っています',reason:'現在配置の月次収支見込 '+finance.forecast.balance.toLocaleString('ja-JP'),action:'維持費・雇用・税率を確認し、必要な支出から見直します。',panel:'finance-panel'});
  result.sort((a,b)=>{const rank=(x:GuideAction)=>x.id==='bus-recovery'?0:x.id==='isolation'?1:x.id==='water'||x.id==='power'?2:x.id==='finance'&&city.funds<0?3:4;return rank(a)-rank(b);});
  if(result.length)return result.slice(0,3);
  const facts=cityFacts(city,cells);
  if(!facts.roads)return [{id:'first-road',title:'最初の道路を敷きましょう',reason:'道路は住宅・職場・施設をつなぐ街の骨格です。',action:'道路を選び、地図上でドラッグします。',tool:'road'}];
  if(!facts.connectedHomes)return [{id:'first-home',title:'道路の隣に住宅を指定',reason:'住宅区画から暮らしが始まります。',action:'住宅を選び、道路の上下左右に区画を置きます。',tool:'residential'}];
  if(!facts.connectedWorkplaces)return [{id:'first-job',title:'商業・工業で職場を用意',reason:'住民が通える職場を同じ道路網に配置しましょう。',action:'商業や工業の区画を置き、時間を進めて建設を待ちます。',tool:'commercial'}];
  return [{id:'healthy',title:'優先して対処する不足はありません',reason:'現在の指標では街の基本条件は整っています。',action:'需要を見て少しずつ拡張し、収支とサービスの変化を観察しましょう。',mode:'demand'}];
}
export interface TutorialStep {id:string;title:string;description:string;done:boolean;tool?:Tool;panel?:string}
export function tutorialSteps(city:City,financeViewed:boolean,undoUsed:boolean):TutorialStep[]{
  const cells=city.snapshot().cells,facts=cityFacts(city,cells);
  const watered=(kind:'home'|'work')=>cells.some(c=>(kind==='home'?c.zone===1:c.zone===2||c.zone===3)&&city.networkConnected(c)&&(city.waterUtility?.status(c.z*city.size+c.x).service??city.hydrology?.at(c.z*city.size+c.x)??city.waterRatio)>=.8);
  return [
    {id:'road',title:'1. 道路を敷く',description:city.residents?'地図の端から住宅予定地まで道路をつなぎます。建設時は一時停止します。':'地図上でドラッグして道を作ります。建設時は一時停止します。',done:city.residents?city.residents.gateways(city).length>0:facts.roads>0,tool:'road'},
    {id:'undo',title:'2. 操作を取り消してみる',description:'道路を試しに1マス伸ばして「取り消す」。1回のドラッグをまとめて戻せます。時間を進めると履歴は終了します。',done:undoUsed},
    {id:'home',title:'3. 道路沿いに住宅を指定',description:'道路の上下左右に住宅を指定します。斜めだけでは接続できません。',done:facts.connectedHomes>0,tool:'residential'},
    {id:'work',title:'4. 商業・工業で職場を作る',description:'同じ道路網に職場区画を指定します。住民が通える配置にしましょう。',done:facts.connectedWorkplaces>0,tool:'commercial'},
    {id:'utilities',title:'5. 電力と水道を確保',description:city.waterUtility?'給水・下水施設管理を開き、道路沿いの外部水道接続を配置します。河川都市は管と取水・排水の接続も必要です。':city.hydrology?'河川に隣接した取水施設・排水口を管で住宅へ接続します。':'最初は外部契約から供給されます。電力・水道の能力を確認し、不足時に施設を追加します。',done:facts.connectedHomes>0&&facts.connectedWorkplaces>0&&watered('home')&&watered('work')&&city.powerRatio>=.8&&(city.waterUtility?.waterRatio??city.waterRatio)>=.8&&(city.waterUtility?.capacity??city.waterSupply)>0&&city.powerSupply>0,panel:city.waterUtility?'water-utility-panel':'management-panel'},
    {id:'growth',title:'6. 時間を進めて暮らしを始める',description:'1×で進めて建設と入居を待ちます。成長しないときは「次にすること」で接続・供給・需要を確認してください。',done:city.population>0&&city.jobs>0&&city.employed>0},
    {id:'finance',title:'7. 最初の収支を確認',description:'経営から収支・経営分析を開き、税収と維持費を確認します。赤字の場合は案内を使って改善しましょう。',done:city.month>0&&financeViewed,panel:'finance-panel'},
  ];
}
