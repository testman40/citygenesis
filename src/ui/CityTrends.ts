import type {City} from '../simulation/City';
export interface TrendPoint {scenery:number;month:number;population:number;satisfaction:number;balance:number;tax:number;maintenance:number;power:number;water:number;employment:number;taxRate:number;commute:number;safety:number;wellness:number}
export function trendPoint(city:City):TrendPoint{const workers=city.workforce;return {scenery:city.sceneryBonus,month:city.month,population:city.population,satisfaction:city.satisfaction,balance:city.balance,tax:city.tax,maintenance:city.maintenance,power:city.powerRatio,water:city.waterRatio,employment:workers?city.employed/workers:1,taxRate:city.taxRate,commute:city.traffic.averageMinutes,safety:city.safety.penalty,wellness:city.wellness.penalty};}
const number=(n:number)=>Math.round(n*10)/10;
export function explainChanges(before:TrendPoint,after:TrendPoint){
 const conditions:string[]=[];
 for(const [key,label,scale] of [['scenery','公園・広場の住宅平均効果',1],['power','電力充足',100],['water','給水充足',100],['employment','就業率',100],['taxRate','税倍率',1],['commute','平均通勤（分）',1],['safety','安全サービスの満足度影響',1],['wellness','医療・教育の満足度影響',1]] as const){if(Math.abs(after[key]-before[key])>.0001)conditions.push(label+' '+number(before[key]*scale)+' → '+number(after[key]*scale)+(scale===100?'%':''));}
 if(after.tax!==before.tax)conditions.push('税収 '+number(before.tax)+' → '+number(after.tax));
 if(after.maintenance!==before.maintenance)conditions.push('維持費 '+number(before.maintenance)+' → '+number(after.maintenance));
 const shortages=[after.power<.5?'電力不足':'',after.water<.5?'給水不足':'',after.employment<.65?'就業不足':''].filter(Boolean);
 return {from:before.month,to:after.month,population:after.population-before.population,satisfaction:after.satisfaction-before.satisfaction,balance:number(after.balance-before.balance),conditions,shortages};
}
export class CityTrendsPanel {
 private owner:City|undefined;private point:TrendPoint|undefined;private rows:ReturnType<typeof explainChanges>[]=[];private root:HTMLElement;
 constructor(){this.root=document.createElement('details');this.root.id='city-trends';this.root.innerHTML='<summary>都市の変化と確認したい要因</summary><p>前回観測した決算との差と、その間に変わった条件を表示します。各条件の寄与額や因果関係を断定するものではありません。</p><div id="city-trends-list"></div>';document.getElementById('management-panel')!.prepend(this.root);}
 observe(city:City){
  if(this.owner!==city){this.owner=city;this.point=trendPoint(city);this.rows=[];this.paint();return;}
  if(this.point&&city.month>this.point.month){const point=trendPoint(city);this.rows.unshift(explainChanges(this.point,point));this.rows=this.rows.slice(0,12);this.point=point;this.paint();}
 }
 private paint(){const list=document.getElementById('city-trends-list')!;list.replaceChildren();if(!this.rows.length){list.textContent='次の月次決算から変化を記録します。都市を読み直すと記録を開始し直します。';return;}
  const delta=(n:number)=>(n>0?'+':'')+n;
  for(const row of this.rows){const item=document.createElement('article');item.className='city-goal';const title=document.createElement('strong');title.textContent='第'+row.from+'月 → 第'+row.to+'月';const changes=document.createElement('p');changes.textContent='人口 '+delta(row.population)+' / 満足度 '+delta(row.satisfaction)+' / 月次収支 '+delta(row.balance);item.append(title,changes);const factors=document.createElement('ul');for(const condition of row.conditions){const li=document.createElement('li');li.textContent=condition;factors.append(li);}if(!row.conditions.length){const li=document.createElement('li');li.textContent='追跡中の条件に大きな変化はありません。区画の建設・成長や都市情報も確認してください。';factors.append(li);}item.append(factors);if(row.shortages.length){const hint=document.createElement('small');hint.textContent='現在の不足：'+row.shortages.join('・');item.append(hint);}list.append(item);}
 }
}
