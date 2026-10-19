import type {City} from '../simulation/City';
import {facilityEconomics,type FacilityEconomics} from './FacilityEconomics';
export function expenseOverview(c:City,rows:FacilityEconomics[]=facilityEconomics(c)){
 const finance=c.finance(),f=finance.forecast,burden=f.tax>0?f.maintenance/f.tax:null;
 const status=f.balance<0?'赤字':f.balance===0?'収支均衡':burden!==null&&burden>=.9?'黒字・余裕少':'黒字';
 const advice=f.balance<0?'毎月'+Math.abs(f.balance).toLocaleString('ja-JP',{maximumFractionDigits:2})+'の改善で収支が均衡します。費用の大きい設置物と稼働状況を確認しましょう。':f.balance===0?'収入と維持費が同額です。維持費が増えると赤字になります。':burden!==null&&burden>=.9?'税収の90%以上を維持費に使っています。施設を増やす前に月次負担を確認しましょう。':'現在の黒字分が、追加の月次費用に使える余裕です。人口や税収が減ると余裕も小さくなります。';
 return {previousBalance:finance.previous?.balance??null,income:f.tax,expense:f.maintenance,balance:f.balance,burden,status,advice,facilityExpense:rows.reduce((sum,r)=>sum+r.cost,0),costs:f.costs};
}
/** Additional recurring burden only; never subtract the existing facility twice. */
export function additionalFacilityBalance(balance:number,facility:Pick<FacilityEconomics,'income'|'cost'>){return Math.round((balance+facility.income-facility.cost)*100)/100;}
