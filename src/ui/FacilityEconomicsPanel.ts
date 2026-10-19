import type {City} from '../simulation/City';
import {facilityEconomics,FACILITY_NAMES} from '../economy/FacilityEconomics';
import {facilityCharts} from '../info/FacilityCharts';
import type {ChartModel} from '../info/ChartData';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const fmt=(n:number)=>n.toLocaleString('ja-JP',{maximumFractionDigits:2});
export class FacilityEconomicsPanel {
 readonly root=el('section');private filter=el('select');private pick=el('select');private content=el('div');private city:City|undefined;private owner:City['network']|undefined;private signature='';
 constructor(private figure:(m:ChartModel,width:number)=>HTMLElement){
  this.root.id='facility-economics';this.root.className='facility-economics';this.root.append(el('h3','施設ごとの費用と改善'));
  this.root.append(el('p','公共施設は税収で支えるサービスです。直接収入がないため、費用に加えて稼働・充足・利用状況で判断しましょう。'));
  const filterLabel=el('label','施設の種類'),pickLabel=el('label','設置場所で施設を選択');filterLabel.append(this.filter);pickLabel.append(this.pick);this.filter.setAttribute('aria-label','施設の種類で絞り込む');this.pick.setAttribute('aria-label','費用を確認する施設');
  this.root.append(filterLabel,pickLabel,this.content);document.getElementById('city-manage-charts')!.before(this.root);
  for(const control of [this.filter,this.pick])control.onchange=()=>{this.signature='';if(this.city)this.refresh(this.city);};
 }
 refresh(c:City){
  this.root.hidden=document.body.dataset.workspace!=='manage';if(this.root.hidden||!this.root.clientWidth)return;this.city=c;
  if(this.owner!==c.network){this.filter.value='';this.pick.value='';this.signature='';this.owner=c.network;}
  const all=facilityEconomics(c),filter=this.filter.value,rows=all.filter(r=>!filter||r.kind===filter),selected=rows.find(r=>r.key===this.pick.value)??rows[0];
  const width=Math.max(180,Math.floor(this.root.clientWidth)-24),models=facilityCharts(c,rows,selected),signature=JSON.stringify([filter,selected?.key,all,models,width]);if(signature===this.signature)return;this.signature=signature;
  this.filter.replaceChildren(new Option('すべての施設',''),...[...new Set(all.map(r=>r.kind))].map(k=>new Option(FACILITY_NAMES[k],k)));this.filter.value=filter;
  this.pick.replaceChildren(...rows.map(r=>new Option(r.name+' · X'+r.id%c.size+'/Z'+Math.floor(r.id/c.size)+' · 月'+fmt(r.cost),r.key)));this.pick.value=selected?.key??'';
  this.content.replaceChildren();
  if(!selected){this.content.append(el('p','対象の施設がありません。設置すると費用と改善メモが表示されます。'));return;}
  const r=selected,detail=el('article');detail.className='facility-detail';detail.append(el('h4',r.name+' · X'+r.id%c.size+' / Z'+Math.floor(r.id/c.size)));
  detail.append(el('p',(r.active?'稼働中':'稼働条件を確認')+' · 建設費の現在の目安 '+fmt(r.construction)+'（一時支出）'));
  if(r.capacity!==null)detail.append(el('p','能力 '+fmt(r.capacity)+' / 使用 '+(r.used===null?'未集計':fmt(r.used))+'（'+r.loadLabel+'）'));
  const focus=el('button','この施設へ移動');focus.type='button';focus.onclick=()=>document.dispatchEvent(new CustomEvent('city-facility-focus',{detail:r.id}));detail.append(focus);
  this.content.append(detail,...models.map(m=>this.figure(m,width)));
  const notes=el('article');notes.className='facility-advice';notes.append(el('h4','この施設の改善メモ'));const list=el('ul');for(const note of r.notes)list.append(el('li',note));notes.append(list);
  if(r.sector){const budget=el('button','公共予算を確認');budget.type='button';budget.onclick=()=>{const panel=document.getElementById('budget-panel') as HTMLDetailsElement;panel.open=true;for(let parent=panel.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;panel.scrollIntoView({block:'start'});document.getElementById('budget-'+r.sector)?.focus({preventScroll:true});};notes.append(budget);}
  this.content.append(notes);
 }
}
