import {DEMAND_ZONES,type DemandValues} from '../demand/Demand';
const names={residential:'住',commercial:'商',industrial:'工'};
/** Stable DOM nodes let CSS interpolate live values without restarting the meter. */
export class DemandMeter {
 readonly root:HTMLElement;private limit:HTMLElement|undefined;private previous:DemandValues|undefined;private timers=new Map<string,ReturnType<typeof setTimeout>>();
 constructor(large=false,root:HTMLElement=document.createElement('div')){
  this.root=root;root.classList.add('demand-meter');if(large)root.classList.add('demand-meter-large');if(root.tagName!=='BUTTON')root.setAttribute('role','img');
  if(!large){this.limit=document.createElement('span');this.limit.className='demand-meter-limit';this.limit.textContent='とても高い';this.limit.hidden=true;root.append(this.limit);}
  for(const z of DEMAND_ZONES){const column=document.createElement('span');column.className='demand-column';column.dataset.demandZone=z;column.innerHTML='<span class="demand-track" aria-hidden="true"><i class="demand-up"></i><i class="demand-down"></i></span><span class="demand-label">'+names[z]+'</span><span class="demand-trend" aria-hidden="true"></span>';if(large){const limit=document.createElement('span');limit.className='demand-limit';limit.textContent='とても高い';limit.hidden=true;column.append(limit);}root.append(column);}
 }
 update(values:DemandValues,reset=false){
  this.root.setAttribute('aria-label','需要：'+DEMAND_ZONES.map(z=>names[z]+' '+values[z]).join('、'));if(this.root.tagName==='BUTTON')this.root.title='需要タブを開く';
  if(this.limit)this.limit.hidden=!DEMAND_ZONES.some(z=>values[z]>=100);
  for(const z of DEMAND_ZONES){const column=this.root.querySelector<HTMLElement>('[data-demand-zone='+z+']')!,v=values[z];column.dataset.value=String(v);const limit=column.querySelector<HTMLElement>('.demand-limit');if(limit)limit.hidden=v<100;column.querySelector<HTMLElement>('.demand-up')!.style.transform='scaleY('+Math.max(0,v)/100+')';column.querySelector<HTMLElement>('.demand-down')!.style.transform='scaleY('+Math.max(0,-v)/100+')';
   const trend=column.querySelector<HTMLElement>('.demand-trend')!;if(reset){clearTimeout(this.timers.get(z));trend.textContent='';}else if(this.previous&&v!==this.previous[z]){clearTimeout(this.timers.get(z));trend.textContent=v>this.previous[z]?'▲':'▼';this.timers.set(z,setTimeout(()=>{trend.textContent='';this.timers.delete(z);},900));}
  }this.previous={...values};
 }
}
