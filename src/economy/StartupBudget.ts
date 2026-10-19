import type {City,Tool} from '../simulation/City';
export interface StartupBlock {id:string;reason:string;action:string;tool?:Tool;panel?:string}
/** Only diagnose an empty, losing city whose next residents cannot make progress. */
export function startupBlock(c:City):StartupBlock|null{
 if(c.population>0)return null;
 if(c.funds<0)return {id:'funds',reason:'資金不足で入居・成長が止まっています。',action:'経営画面で緊急融資と維持費を確認',panel:'finance-panel'};
 if(c.residents&&!c.residents.gateways(c).length)return {id:'gateway',reason:'マップ外から住宅へ入る道路がありません。',action:'一般道路をマップの端から住宅へ接続',tool:'road'};
 if(c.management?.lifecycle?.mode==='evolve'&&!c.management.lifecycle.settlementPending&&c.jobs<=0)return {id:'jobs',reason:'入居先から通える働き口がありません。',action:'住宅と同じ道路網に商業・工業を用意',tool:'commercial'};
 if(c.powerRatio<c.config.growthSupplyThreshold)return {id:'power',reason:'電力不足で住宅が成長できません。',action:'電力の供給・道路接続を確認',tool:'power'};
 let housing=false,waterBlocked=false;
 for(const cell of c.zoneCells()){
  const t=c.tile(cell);if(t.zone!=='residential'||!t.networkConnected)continue;housing=true;
  const service=c.waterUtility?.status(cell.z*c.size+cell.x).service??c.hydrology?.at(cell.z*c.size+cell.x)??c.waterRatio;
  if(service<c.config.growthSupplyThreshold||c.waterRatio<c.config.growthSupplyThreshold){waterBlocked=true;continue;}
  if(c.satisfaction>=c.config.growthSatisfaction&&(t.level>0||c.funds>=c.config.buildingCost))return null;
 }
 if(waterBlocked)return {id:'water',reason:'住宅に給水・排水が届かず入居できません。',action:'給水施設・排水施設を住宅の管網へ接続',tool:'water'};
 if(!housing)return {id:'housing',reason:'道路につながった住宅区画がありません。',action:'一般道路に隣接して住宅区画を指定',tool:'residential'};
 return {id:'growth',reason:'住宅の成長条件を満たせず入居が止まっています。',action:'経営画面で資金・供給・満足度を確認',panel:'management-panel'};
}
/** UI safety stop only. No subsidies, debt forgiveness or simulation/save changes. */
export class StartupBudgetGuard {
 private owner:City|undefined;private since:number|undefined;private kind='';
 observe(c:City,running:boolean){
  if(this.owner!==c){this.owner=c;this.since=undefined;this.kind='';}
  const block=startupBlock(c);
  if(!running||!block||c.finance().forecast.balance>=0){this.since=undefined;this.kind='';return null;}
  if(this.kind!==block.id||this.since===undefined||c.month<this.since){this.kind=block.id;this.since=c.month;}
  if(block.id!=='funds'&&c.month-this.since<6)return null;
  this.since=c.month;return block;
 }
}
