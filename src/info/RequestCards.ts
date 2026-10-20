import {warningPriority} from './RequestPriority';
import {publicRequestKind,type PublicKind,type PublicService} from '../services/PublicFacilities';
import type {City} from '../simulation/City';
import {citizenRequests,groupRequests,type CitizenRequest,type InfoMode} from './CityInformation';
export interface RequestCard {id:string;title:string;count:number;unit:string;description:string;severity:'red'|'blue';button:{label:string;facility?:PublicKind;kind?:'jobs'|'road';region?:string;mode?:InfoMode}}
/** One card for each problem; related road access warnings share one road card. */
export function requestCards(c:City,requests=citizenRequests(c)):RequestCard[]{
 const cards:RequestCard[]=[];
 for(const g of groupRequests(requests)){
  if(g.key==='employment'||g.key==='network'){const jobs=g.key==='employment';cards.push({id:g.key,title:jobs?'近くに仕事がない':'道路がつながっていない',count:g.count,unit:jobs?(c.residents?'世帯':'住宅区画'):'件',description:jobs?'商業・工業を、住宅から道路でつながった近くに建てましょう':'道路の切れ目をつなぎ、住宅や職場を同じ道路網につなぎましょう',severity:g.requests.some(r=>r.severity==='red')?'red':'blue',button:jobs?{label:'商業・工業を建てる場所を表示',kind:'jobs',region:'request-jobs'}:{label:'道路の切れ目を表示',kind:'road',region:'request-roads'}});
  }else for(const r of g.requests)cards.push({id:r.id,title:r.title,count:r.count??1,unit:r.unit??'件',description:r.action,severity:r.severity,button:['police','fire','medical','education'].includes(r.id)?{label:({police:'警察署',fire:'消防署',clinic:'診療所',elementary:'小学校',highSchool:'高校'} as Record<string,string>)[publicRequestKind(c,r.id as PublicService)]+'を建てる',facility:publicRequestKind(c,r.id as PublicService)}:{label:'その場所へ移動',mode:r.mode}});
 }
 return cards.sort((a,b)=>warningPriority(c,a)-warningPriority(c,b)||b.count-a.count||a.id.localeCompare(b.id));
}
