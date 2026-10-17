import type {City} from '../simulation/City';
import {STAGES} from '../economy/Lifecycle';
export interface CityGoal {id:string;title:string;detail:string;progress:number;done:boolean}
export function cityGoals(city:City):CityGoal[]{
 const m=city.lifeMetrics(),state=city.management?.lifecycle;
 const simple:CityGoal[]=[
  {id:'settlement',title:'暮らしの始まり',detail:'住民を迎える',progress:Math.min(1,city.population/1),done:city.population>0},
  {id:'employment',title:'仕事のある街',detail:'人口20人以上・就業率80%以上',progress:Math.min(1,city.population/20,m.employment/.8),done:city.population>=20&&m.employment>=.8},
  {id:'surplus',title:'黒字の第一歩',detail:'月次決算で黒字・資金0以上',progress:city.month>0&&city.balance>0&&city.funds>=0?1:0,done:city.month>0&&city.balance>0&&city.funds>=0},
 ];
 return [...simple,...STAGES.slice(1).map((stage,index)=>{
  const reached=(state?.highest??0)>=index+1;
  const progress=Math.max(0,Math.min(1,city.population/stage.population,m.service/stage.service,city.funds>=0?1:0,city.balance>=0?1:0));
  return {id:'stage-'+(index+1),title:stage.name+'への発展',detail:'人口'+stage.population.toLocaleString('ja-JP')+'人・サービス'+Math.round(stage.service*100)+'%・資金と収支0以上'+(state?'を3か月維持':''),progress:reached?1:progress,done:reached||(!state&&progress===1)};
 })];
}
export class CityGoalsPanel {
 private owner:City|undefined;private seen=new Set<string>();private signature='';private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private root:HTMLElement){
  const toast=document.createElement('div');toast.id='goal-toast';toast.hidden=true;toast.setAttribute('role','status');document.getElementById('app')!.append(toast);
 }
 refresh(city:City){
  const goals=cityGoals(city);
  if(this.owner!==city){clearTimeout(this.timer);document.getElementById('goal-toast')!.hidden=true;this.owner=city;this.seen=new Set(goals.filter(g=>g.done).map(g=>g.id));this.signature='';}
  const achieved=goals.filter(g=>g.done&&!this.seen.has(g.id));
  if(achieved.length){achieved.forEach(g=>this.seen.add(g.id));const toast=document.getElementById('goal-toast')!;toast.textContent='達成！ '+achieved.map(g=>g.title).join('・');toast.hidden=false;clearTimeout(this.timer);this.timer=setTimeout(()=>toast.hidden=true,5000);document.dispatchEvent(new Event('city-goal-achieved'));}
  const signature=JSON.stringify(goals);if(signature===this.signature)return;this.signature=signature;this.root.replaceChildren();
  const intro=document.createElement('p');intro.textContent='街の指標から次の目標を確認しましょう。達成すると通知が届きます。';this.root.append(intro);
  for(const goal of goals){const article=document.createElement('article');article.className='city-goal'+(goal.done?' achieved':'');const title=document.createElement('strong');title.textContent=(goal.done?'✓ ':'○ ')+goal.title;const detail=document.createElement('p');detail.textContent=goal.detail;const bar=document.createElement('progress');bar.max=1;bar.value=goal.progress;bar.setAttribute('aria-label',goal.title);const value=document.createElement('small');value.textContent=goal.done?'達成済み':Math.floor(goal.progress*100)+'%';article.append(title,detail,bar,value);this.root.append(article);}
 }
}
