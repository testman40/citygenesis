import {SEWAGE} from './Sanitation';
import {WATER} from './Hydrology';
import type {City,Cell} from '../simulation/City';
import {GENERATION} from '../energy/Energy';
export interface UtilityGraph {id:string;label:string;color:string;bars:{label:string;value:number}[];bad:boolean;note?:string}
export function utilityGraphModels(c:City,selected:Cell|null=null):UtilityGraph[]{
 const w=c.waterUtility,models:UtilityGraph[]=[
  {id:'power',label:'電力',color:'#BA7517',bad:c.powerSupply<=0||c.powerRatio<1,bars:[{label:'供給可能',value:c.powerSupply},{label:'必要量',value:c.powerDemand},{label:'使用量',value:Math.min(c.powerSupply,c.powerDemand)}],note:'外部電力契約の供給も含みます。'},
  {id:'water',label:'給水',color:'#378ADD',bad:!w||w.capacity<=0||w.waterRatio<1,bars:[{label:'給水能力',value:w?.capacity??c.waterSupply},{label:'必要量',value:w?.demand??c.waterDemand},{label:'供給実績',value:w?.supplied??0}]},
  {id:'drainage',label:'排水',color:'#0F6E56',bad:!w||w.drainageCapacity<=0||w.drainageRatio<1,bars:[{label:'排水能力',value:w?.drainageCapacity??c.hydrology?.sewerSupply??0},{label:'下水発生',value:w?.generated??0},{label:'排水実績',value:w?.collected??0}],note:'給水がない間は下水も発生しません。給水・排水の両方を接続してください。'},
 ];
 if(selected){const id=selected.z*c.size+selected.x,t=c.tile(selected),stat=w?.facilityStats.get(id);if(t.facility==='power'||t.facility==='wind'||t.facility==='solar'){
   const kind=t.facility,rated=kind==='power'?c.config.powerCapacity:GENERATION[kind].capacity,output=kind==='power'?(t.networkConnected?rated:0):c.energy?.output(id)??0;
   models.push({id:'selected',label:'選択した発電施設',color:'#BA7517',bad:output<=0,bars:[{label:'定格能力',value:rated},{label:'供給可能',value:output},{label:'使用配分',value:c.powerSupply?Math.min(c.powerSupply,c.powerDemand)*output/c.powerSupply:0}],note:'使用配分は都市の使用量を供給能力の比率で配分した目安です。'});
  }else if(stat){const sewage=c.sanitation?.plants.get(id),rated=stat.kind==='natural'?c.config.waterCapacity:stat.kind==='external'?w!.settings.externalCapacity:stat.kind==='outfall'?WATER.outfallCapacity:sewage?SEWAGE[sewage].capacity:stat.capacity;models.push({id:'selected',label:'選択した'+(stat.kind==='sewage'?'下水処理場':stat.kind==='outfall'?'排水口':'給水施設'),color:stat.kind==='sewage'||stat.kind==='outfall'?'#0F6E56':'#378ADD',bad:!stat.active,bars:[{label:'定格能力',value:rated},{label:'有効能力',value:stat.capacity},{label:'実績',value:stat.used}],note:stat.reason});}
 }
 return models;
}
/** Real-time, accessible DOM bars. Text remains available on touch devices without hovering. */
export class UtilityGraphs {
 private keys=new Map<HTMLElement,string>();
 constructor(){for(const id of ['energy-panel','water-utility-panel']){const parent=document.getElementById(id);if(parent){const root=document.createElement('div');root.dataset.utilityGraphRoot=id;parent.querySelector('summary')!.after(root);}}}
 update(c:City,selected:Cell|null){const models=utilityGraphModels(c,selected),roots=Array.from(document.querySelectorAll<HTMLElement>('[data-utility-graph-root],#hud-utility-graphs'));
  for(const root of roots){const wanted=models.filter(m=>m.id==='selected'||(root.dataset.utilityGraphRoot==='energy-panel'||root.dataset.group==='power'?m.id==='power':m.id!=='power')),key=JSON.stringify(wanted);if(this.keys.get(root)===key)continue;this.keys.set(root,key);root.replaceChildren();
   for(const m of wanted){const card=document.createElement('section');card.className='utility-graph';card.dataset.utilityGraph=m.id;const heading=document.createElement('h3');heading.textContent=m.label;card.append(heading);const max=Math.max(1,...m.bars.map(b=>b.value));
    for(const b of m.bars){const row=document.createElement('div');row.className='utility-bar-row';const label=document.createElement('span');label.textContent=b.label;const track=document.createElement('span');track.className='utility-bar-track';track.setAttribute('role','meter');track.setAttribute('aria-label',m.label+'：'+b.label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(max));track.setAttribute('aria-valuenow',String(b.value));const fill=document.createElement('i');fill.style.width=(Math.max(0,b.value)/max*100)+'%';fill.style.background=m.bad?'#A32D2D':m.color;track.append(fill);const value=document.createElement('b');value.textContent=b.value.toLocaleString('ja-JP',{maximumFractionDigits:1});row.title=b.label+' '+b.value;row.append(label,track,value);card.append(row);}
    if(m.note){const note=document.createElement('p');note.textContent=m.note;card.append(note);}root.append(card);
   }
  }
 }
}
