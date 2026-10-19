import type {City} from '../simulation/City';
import type {FacilityEconomics} from '../economy/FacilityEconomics';
import type {ChartModel} from './ChartData';
export function facilityCharts(c:City,rows:FacilityEconomics[],selected?:FacilityEconomics):ChartModel[]{
 const charts:ChartModel[]=[{id:'facility-cost-comparison',title:'施設の月次費用を比較',kind:'bar',current:rows.reduce((n,r)=>n+r.cost,0),currentLabel:'表示対象の施設費用合計',unit:'資金',bad:rows.some(r=>r.cost>0),bars:rows.slice(0,12).map(r=>({label:r.name+' X'+r.id%c.size+'/Z'+Math.floor(r.id/c.size),value:r.cost,color:'#185FA5'})),note:'現在の月次費用が大きい順に最大12施設を表示。全施設は選択欄から確認できます。道路・配管・交通・利息などは都市全体の収支で確認してください。'}];
 if(!selected)return charts;
 const r=selected,history=(c.statistics?.months??[]).filter(p=>p.month>=c.month-11).map(p=>({month:p.month,row:p.facilities?.find(f=>f.id===r.id&&f.kind===r.kind)}));
 charts.push({id:'facility-cashflow',title:r.name+'の直接収支',kind:'bar',current:r.balance,currentLabel:'現在の月次直接収支',unit:'資金',bad:r.balance<0,bars:[{label:'直接収入',value:r.income,color:'#247442'},{label:'月次費用',value:r.cost,color:'#A32D2D',bad:true}],note:'直接収入 − 月次費用。公共施設の直接収入は現在0です。税収の貢献額や住民の便益を収入として加算しません。建設費は別の一時支出です。'});
 charts.push({id:'facility-cost-history',title:r.name+'の費用・直接収入の推移',kind:'line',current:r.cost,currentLabel:'現在の月次費用',unit:'資金',bad:r.cost>0,series:[{label:'月次費用',color:'#A32D2D',points:history.map(p=>({month:p.month,value:p.row?.cost??null}))},{label:'直接収入',color:'#247442',points:history.map(p=>({month:p.month,value:p.row?0:null}))}],note:'直近12か月の確定値。追加前や未設置の月は未記録です。同じ種類を同じ場所に建て直した場合は同じ施設履歴として表示します。'});
 if(r.load!==null)charts.push({id:'facility-load-history',title:r.loadLabel+'の推移',kind:'line',current:r.load*100,currentLabel:r.loadLabel,unit:'%',series:[{label:r.loadLabel,color:'#0F6E56',points:history.map(p=>({month:p.month,value:p.row?.load===null||p.row?.load===undefined?null:p.row.load*100}))}],note:'直近12か月の確定値。警察・消防は市全体の充足率、医療・教育は同系統施設の利用率を配分した目安です。個別の出動・入学実績ではありません。'});
 return charts;
}
