export type SupportMode='off'|'advice'|'approve'|'auto';
export interface SupportSettings {mode:SupportMode;minimumCash:number;monthlyBudget:number;monthlyUpkeepLimit:number}
export interface SupportRecord {month:number;title:string;cost:number;reserved:number;upkeep:number;x:number;z:number;automatic:boolean}
export interface SupportState extends SupportSettings {version:1;budgetMonth:number;spent:number;upkeepAdded:number;lastAutoMonth:number;history:SupportRecord[]}
export const SUPPORT_DEFAULTS:SupportSettings={mode:'off',minimumCash:5000,monthlyBudget:4000,monthlyUpkeepLimit:30};
export function createSupport():SupportState{return {...SUPPORT_DEFAULTS,version:1,budgetMonth:0,spent:0,upkeepAdded:0,lastAutoMonth:-1,history:[]};}
export function validateSupport(raw:unknown,month:number,size:number):SupportState{
 const s=raw as SupportState,n=(v:unknown,max=1e9,min=0)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('初心者サポートの数値が不正です');return v;};
 if(!s||s.version!==1||!['off','advice','approve','auto'].includes(s.mode)||!Array.isArray(s.history)||s.history.length>20)throw Error('初心者サポートの形式が不正です');
 const integer=(v:unknown,max:number,min=0)=>{const value=n(v,max,min);if(!Number.isSafeInteger(value))throw Error('初心者サポートの月・場所が不正です');return value;};
 const history=s.history.map(r=>{if(!r||typeof r.title!=='string'||r.title.length>100||!r.title.length||typeof r.automatic!=='boolean')throw Error('サポート履歴が不正です');return {month:integer(r.month,month),title:r.title,cost:n(r.cost),reserved:n(r.reserved),upkeep:n(r.upkeep,1e6),x:integer(r.x,size-1),z:integer(r.z,size-1),automatic:r.automatic};});
 for(let i=1;i<history.length;i++)if(history[i].month>history[i-1].month)throw Error('サポート履歴の順序が不正です');
 return {version:1,mode:s.mode,minimumCash:n(s.minimumCash),monthlyBudget:n(s.monthlyBudget,1e6),monthlyUpkeepLimit:n(s.monthlyUpkeepLimit,1e6),budgetMonth:integer(s.budgetMonth,month),spent:n(s.spent),upkeepAdded:n(s.upkeepAdded,1e6),lastAutoMonth:integer(s.lastAutoMonth,month,-1),history};
}
