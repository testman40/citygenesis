import {constructionForecast} from '../economy/ConstructionForecast';
import type {City,Cell,Tool} from '../simulation/City';import type {RoadKind} from '../roads/profiles';
const fmt=(v:number)=>v.toLocaleString('ja-JP',{maximumFractionDigits:2});
export class ConstructionBudgetPanel {
 private root=document.createElement('section');private signature='';private stamp=0;
 constructor(){this.root.id='construction-budget';this.root.className='beginner-card';this.root.hidden=true;document.getElementById('hud-context-options')!.after(this.root);}
 refresh(c:City,tool:Tool,cell:Cell|null){
  if(document.getElementById('hud-context')!.hidden||performance.now()-this.stamp<200)return;this.stamp=performance.now();
  const quote=constructionForecast(c,tool,cell,(document.getElementById('road-kind') as HTMLSelectElement).value as RoadKind);this.root.hidden=!quote;if(!quote){this.signature='';return;}
  const key=JSON.stringify(quote);if(key===this.signature)return;this.signature=key;this.root.replaceChildren();const title=document.createElement('h3');title.textContent='建設前の収支確認（'+quote.unit+'）';this.root.append(title);
  const metrics=document.createElement('div');metrics.className='construction-budget-metrics';this.root.append(metrics);
  for(const [name,value] of [['建設費（1回）',quote.cost],['増える維持費 / 月',quote.upkeep],['設置後の月次収支見込',quote.balance],['建設後の手元資金',quote.cash]] as const){const p=document.createElement('p');p.textContent=name+'：'+(name.includes('収支')&&value>0?'+':'')+fmt(value);if(name.includes('収支')||name.includes('資金'))p.className=value<0?'chart-bad':'chart-good';metrics.append(p);}
  if(!quote.ok){const p=document.createElement('p');p.textContent=quote.reason||'資金が足りません';p.className='chart-bad';this.root.append(p);}
  const note=document.createElement('small');note.textContent='人口・税収を現在の値に固定した概算です。建設費は月次収支と別。購入水量・公共予算・サービス改善や人口増による変化は含みません。道路は1マス分です。';this.root.append(note);
 }
}
