import type {City,Cell} from '../simulation/City';
import {citizenRequests,informationAt,type CitizenRequest} from './CityInformation';
import {warningPriority} from './RequestPriority';
export interface MapWarning {id:string;title:string;detail:string;card:string}
/** Red map alerts are local instances of active, urgent citizen requests, never raw overlay samples. */
export function mapWarningAt(c:City,cell:Cell,requests=citizenRequests(c)):MapWarning|null{
 const t=c.tile(cell),id=cell.z*c.size+cell.x;
 const active=requests.filter(r=>r.severity==='red'&&warningPriority(c,r)<2);
 const match=(ids:string[],affected:()=>boolean):MapWarning|null=>{const r=active.find(r=>ids.includes(r.id));return r&&affected()?{id:r.id,title:r.title,detail:r.action,card:r.id==='isolation'?'network':r.id}:null;};
 if((t.zone||t.facility)&&!t.networkConnected||t.road&&!c.network.isMain(id))return match(['isolation'],()=>true);
 if(t.road)return match(['commute'],()=>informationAt(c,id,'traffic').state==='red');
 if(!t.zone||t.level===0)return null;
 const utility=match(['power'],()=>informationAt(c,id,'power').state==='red')??match(['water'],()=>informationAt(c,id,'water').state==='red')??match(['drain','drainage','sewage-capacity'],()=>informationAt(c,id,'sewage').state==='red')??match(['hygiene','pollution'],()=>informationAt(c,id,'environment').state==='red');
 if(utility)return utility;
 const occupied=t.zone==='residential'&&(!c.residents||c.residents.atHome(id).length>0);
 for(const mode of ['medical','education','fire','police'] as const){if((mode==='medical'||mode==='education')&&!occupied)continue;const warning=match([mode],()=>informationAt(c,id,mode).state==='red');if(warning)return warning;}
 return null;
}
export interface MapWarningGroup {key:string;warning:MapWarning;cell:Cell;count:number;label:string}
/** Stable request IDs group varying percentages/loads into one alert per reason and 8×8 region. */
export function mapWarningGroups(c:City,cells:Cell[],target:Cell,requests:CitizenRequest[]=citizenRequests(c)):MapWarningGroup[]{
 const groups=new Map<string,{warning:MapWarning;cells:Cell[]}>();
 for(const cell of cells){const warning=mapWarningAt(c,cell,requests);if(!warning)continue;const key=Math.floor(cell.x/8)+','+Math.floor(cell.z/8)+':'+warning.id;let group=groups.get(key);if(!group){group={warning,cells:[]};groups.set(key,group);}group.cells.push(cell);}
 return [...groups].map(([key,g])=>{const sorted=g.cells.slice().sort((a,b)=>(a.x-target.x)**2+(a.z-target.z)**2-((b.x-target.x)**2+(b.z-target.z)**2)),count=sorted.length,label='この地域の'+count+'か所：'+g.warning.title+'。'+g.warning.detail+'（押すと市民要望を確認）';return {key,warning:g.warning,cell:sorted[0],count,label};});
}
