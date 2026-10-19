import {expenseOverview,additionalFacilityBalance} from '../economy/ExpenseOverview';
import type {City} from '../simulation/City';
import {facilityEconomics,FACILITY_NAMES} from '../economy/FacilityEconomics';
import {facilityCharts} from '../info/FacilityCharts';
import type {ChartModel} from '../info/ChartData';
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
const fmt=(n:number)=>n.toLocaleString('ja-JP',{maximumFractionDigits:2});
export class FacilityEconomicsPanel {
 readonly root=el('section');private overview=el('section');private filter=el('select');private pick=el('select');private content=el('div');private city:City|undefined;private owner:City['network']|undefined;private signature='';
 constructor(private figure:(m:ChartModel,width:number)=>HTMLElement){
  this.root.id='facility-economics';this.root.className='facility-economics';this.root.append(el('h3','設置物と都市の月次収支'));this.overview.className='expense-overview';this.root.append(this.overview);
  this.root.append(el('p','公共施設は税収で支えるサービスです。直接収入がないため、費用に加えて稼働・充足・利用状況で判断しましょう。'));
  const filterLabel=el('label','施設の種類'),pickLabel=el('label','設置場所で施設を選択');filterLabel.append(this.filter);pickLabel.append(this.pick);this.filter.setAttribute('aria-label','施設の種類で絞り込む');this.pick.setAttribute('aria-label','費用を確認する施設');
  this.root.append(filterLabel,pickLabel,this.content);document.getElementById('city-manage-charts')!.before(this.root);
  for(const control of [this.filter,this.pick])control.onchange=()=>{this.signature='';if(this.city)this.refresh(this.city);};
 }
 refresh(c:City){
  this.root.hidden=document.body.dataset.workspace!=='manage';if(this.root.hidden||!this.root.clientWidth)return;this.city=c;
  if(this.owner!==c.network){this.filter.value='';this.pick.value='';this.signature='';this.owner=c.network;}
  const all=facilityEconomics(c),filter=this.filter.value,rows=all.filter(r=>!filter||r.kind===filter),selected=rows.find(r=>r.key===this.pick.value)??rows[0];
  const overview=expenseOverview(c,all);
  const width=Math.max(180,Math.floor(this.root.clientWidth)-24),models=facilityCharts(c,rows,selected),signature=JSON.stringify([filter,selected?.key,all,models,width,overview]);if(signature===this.signature)return;this.signature=signature;
  this.paintOverview(overview);
  this.filter.replaceChildren(new Option('すべての施設',''),...[...new Set(all.map(r=>r.kind))].map(k=>new Option(FACILITY_NAMES[k],k)));this.filter.value=filter;
  this.pick.replaceChildren(...rows.map(r=>new Option(r.name+' · X'+r.id%c.size+'/Z'+Math.floor(r.id/c.size)+' · 月'+fmt(r.cost),r.key)));this.pick.value=selected?.key??'';
  this.content.replaceChildren();
  if(!selected){this.content.append(el('p','対象の施設がありません。設置すると費用と改善メモが表示されます。'));return;}
  const r=selected,detail=el('article');detail.className='facility-detail';detail.append(el('h4',r.name+' · X'+r.id%c.size+' / Z'+Math.floor(r.id/c.size)));
  const burden=el('p','この施設の月次負担 '+fmt(r.cost)+' / 直接収入 '+fmt(r.income)+' / 直接収支 '+(r.balance>0?'+':'')+fmt(r.balance));burden.className='facility-monthly-burden';detail.append(burden);
  detail.append(el('p',(r.active?'稼働中':'稼働条件を確認')+' · 建設費の現在の目安 '+fmt(r.construction)+'（一時支出）'));
  if(r.capacity!==null)detail.append(el('p','能力 '+fmt(r.capacity)+' / 使用 '+(r.used===null?'未集計':fmt(r.used))+'（'+r.loadLabel+'）'));
  const projected=additionalFacilityBalance(overview.balance,r),estimate=el('p','同じ月次負担の施設をもう1つ追加した場合：'+(projected>=0?'黒字・均衡 ':'赤字 ')+(projected>0?'+':'')+fmt(projected)+' / 月（概算）');estimate.className=projected<0?'chart-bad':'chart-good';detail.append(estimate,el('small','現在の収支には選択中の施設の費用も含まれています。この試算はさらに1施設を追加する場合で、建設費・人口・税収・サービス改善の変化は含みません。'));
  const focus=el('button','この施設へ移動');focus.type='button';focus.onclick=()=>document.dispatchEvent(new CustomEvent('city-facility-focus',{detail:r.id}));detail.append(focus);
  this.content.append(detail,this.burdenTable(rows,c.size),...models.map(m=>this.figure(m,width)));
  const notes=el('article');notes.className='facility-advice';notes.append(el('h4','この施設の改善メモ'));const list=el('ul');for(const note of r.notes)list.append(el('li',note));notes.append(list);
  if(r.sector){const budget=el('button','公共予算を確認');budget.type='button';budget.onclick=()=>{const panel=document.getElementById('budget-panel') as HTMLDetailsElement;panel.open=true;for(let parent=panel.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;panel.scrollIntoView({block:'start'});document.getElementById('budget-'+r.sector)?.focus({preventScroll:true});};notes.append(budget);}
  this.content.append(notes);
 }
 private paintOverview(o:ReturnType<typeof expenseOverview>){
  this.overview.replaceChildren(el('h4','都市全体の月次見込（現在の人口・配置）'));
  const status=el('strong',o.status+' '+(o.balance>0?'+':'')+fmt(o.balance)+' / 月');status.className=o.balance<0?'chart-bad':'chart-good';this.overview.append(status);
  const metrics=el('div');metrics.className='expense-metrics';
  for(const [label,value] of [['月次収入（税収）',o.income],['維持費合計',o.expense],['うち施設の月次費用',o.facilityExpense]] as const){const card=el('div');card.append(el('span',label),el('b',fmt(value)));metrics.append(card);}
  const settled=el('div');settled.append(el('span','直近決算の月次収支'),el('b',o.previousBalance===null?'未決算':(o.previousBalance>0?'+':'')+fmt(o.previousBalance)));metrics.append(settled);
  this.overview.append(metrics,el('p',o.advice),el('small','上部の月次収支は決算値、こちらは現在の配置・人口からの見込です。道路・建物・公共交通・配管・利息も含みます。手動・自動の建設費と借入元金返済は別です。'));
 }
 private burdenTable(rows:ReturnType<typeof facilityEconomics>,size:number){
  const section=el('section');section.className='facility-burden-table';section.append(el('h4','場所別の施設負担（費用上位12件）'));
  const table=el('table'),head=el('thead'),tr=el('tr');for(const label of ['施設・場所','直接収入/月','費用/月','直接収支/月'])tr.append(el('th',label));head.append(tr);table.append(head);const body=el('tbody');
  for(const r of rows.slice(0,12)){
   const row=el('tr'),place=el('td'),button=el('button',r.name+' X'+r.id%size+'/Z'+Math.floor(r.id/size));button.type='button';button.onclick=()=>{this.pick.value=r.key;this.signature='';if(this.city)this.refresh(this.city);};place.append(button);row.append(place);
   for(const [index,value] of [r.income,r.cost,r.balance].entries()){const cell=el('td',fmt(value));cell.dataset.label=['直接収入/月','費用/月','直接収支/月'][index];if(index===2)cell.className=value<0?'chart-bad':'chart-good';row.append(cell);}body.append(row);
  }
  table.append(body);section.append(table,el('small','公共施設の直接収入は現在0です。直接収支のマイナスは公費負担を表します。必要性はサービス状況と合わせて判断してください。'));return section;
 }

}
