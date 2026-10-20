import type {City,Cell,Tool} from '../simulation/City';
import {roadDistance} from '../traffic/CommuteAccess';
import {employmentInformation,workAccessAt} from '../info/EmploymentInformation';
export interface HomeCheck {id:string;label:string;ok:boolean;detail:string;tool:Tool}
/** Read-only explanation of existing growth/settlement conditions, not a new rule. */
export function homeReadiness(c:City,cell:Cell):HomeCheck[]{
 if(!c.contains(cell)||c.tile(cell).zone!=='residential')return [];
 const tile=c.tile(cell),id=cell.z*c.size+cell.x,w=c.waterUtility?.status(id),h=c.hydrology?.status(id),limit=c.config.growthSupplyThreshold;
 const water=w?.water??h?.water??c.waterRatio,sewer=w?.sewer??h?.sewer??1;
 const work=employmentInformation(c),reachable=workAccessAt(c,id)>0,hasVacancy=work.workplaces.some(p=>p.free>0&&(roadDistance(c.network,id,p.id,'car',30)<=30||roadDistance(c.network,id,p.id,'walk',10)<=10||!!c.transit.connection(id,p.id,c.config.minutesPerRoad))),ownIssue=work.issues.find(p=>p.homes.includes(id));
 return [
 {id:'road',label:'道路・街の入口',ok:tile.networkConnected&&(!c.residents||c.residents.gateways(c).length>0),detail:!tile.networkConnected?'住宅から主道路網へ接続してください':c.residents&&!c.residents.gateways(c).length?'一般道路をマップの端につないでください':'主道路網とマップ外への入口を確認済み',tool:'road'},
 {id:'power',label:'電気',ok:tile.networkConnected&&c.powerSupply>0&&c.powerRatio>=limit,detail:'供給 '+c.powerSupply+' / 必要 '+c.powerDemand+'。充足 '+Math.round(c.powerRatio*100)+'%（成長条件 '+Math.round(limit*100)+'%以上）',tool:'power'},
 {id:'water',label:'給水',ok:water>=limit,detail:'この管網の給水 '+Math.round(water*100)+'% / 都市全体の有効給排水 '+Math.round(c.waterRatio*100)+'%。不足時は施設と道路下の管網を確認',tool:'water'},
 {id:'sewer',label:'排水',ok:sewer>=limit,detail:'排水充足 '+Math.round(sewer*100)+'%。不足時は下水処理場・排水口と管網を確認',tool:'water'},
 {id:'jobs',label:'通勤できる職場',ok:reachable&&!ownIssue&&(hasVacancy||c.traffic.routes.some(r=>r.home===id&&r.served>0)),detail:!reachable?'道路で通える商業・工業の建物が必要です':ownIssue||!hasVacancy?'職場の空き・通勤経路を確認してください':'通勤圏に職場があります',tool:'commercial'},
 ];
}
