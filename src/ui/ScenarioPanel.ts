import {SCENARIOS,scenarioProgress,type ScenarioId,type ScenarioProgress} from '../scenarios/Scenarios';
import type {City} from '../simulation/City';
import type {CityLibrary} from '../save/CityLibrary';
export class ScenarioPanel {
 private slot='';private epoch=0;private progress:ScenarioProgress|undefined;private loading=false;private loadError='';private saveError=false;private output:HTMLElement;private chip:HTMLButtonElement;
 constructor(private library:CityLibrary,start:(id:ScenarioId)=>Promise<void>,open:()=>void){
  const root=document.createElement('details');root.id='scenario-panel';const summary=document.createElement('summary');summary.textContent='シナリオ・課題都市';root.append(summary);const intro=document.createElement('p');intro.textContent='現在の都市を保存してから、課題都市を別スロットに作成します。進捗はこのブラウザーに保存され、都市ファイルには含めません。';root.append(intro);
  for(const scenario of SCENARIOS){const article=document.createElement('article');article.className='city-goal';const title=document.createElement('strong');title.textContent=scenario.name;const description=document.createElement('p');description.textContent=scenario.description;const button=document.createElement('button');button.type='button';button.dataset.scenario=scenario.id;button.textContent='別スロットで開始';button.onclick=async()=>{button.disabled=true;try{await start(scenario.id);}catch(error){this.output.textContent=error instanceof Error?error.message:'開始できませんでした';}finally{button.disabled=false;}};article.append(title,description,button);root.append(article);}
  this.output=document.createElement('p');this.output.id='scenario-progress';this.output.setAttribute('role','status');intro.after(this.output);document.getElementById('workspace-goals')!.before(root);root.dataset.workspacePage='goals';root.hidden=true;
  this.chip=document.createElement('button');this.chip.id='scenario-current';this.chip.type='button';this.chip.hidden=true;this.chip.onclick=open;document.getElementById('app')!.append(this.chip);
 }
 refresh(city:City,slot:string){
  if(slot!==this.slot){this.slot=slot;const epoch=++this.epoch;this.progress=undefined;this.loading=true;this.loadError='';this.saveError=false;void this.library.get(slot).then(entry=>{if(epoch===this.epoch)this.progress=entry.scenario;}).catch(()=>{if(epoch===this.epoch)this.loadError='課題の進捗を読み込めませんでした。';}).finally(()=>{if(epoch===this.epoch){this.loading=false;this.paint();}});}
  if(this.loading||!this.progress)return;
  const next=scenarioProgress(city,this.progress);if(JSON.stringify(next)!==JSON.stringify(this.progress)){this.progress=next;void this.library.update(slot,e=>({...e,scenario:next})).then(()=>{if(slot===this.slot)this.saveError=false;}).catch(()=>{if(slot===this.slot)this.saveError=true;});}
  this.paint();
 }
 private paint(){if(this.loadError){this.chip.hidden=true;this.output.textContent=this.loadError;return;}const p=this.progress,definition=SCENARIOS.find(s=>s.id===p?.id);this.chip.hidden=!definition;if(!p||!definition){this.output.textContent='通常の都市では自由に遊べます。';return;}
  const status=p.completed?'達成しました！ 自由に遊び続けられます。':p.id==='rebuild'?'連続黒字 '+p.streak+'/3か月':'進行中';this.output.textContent=definition.name+'：'+status+' '+definition.hint+(this.saveError?' 進捗を保存できませんでした。':'');this.chip.textContent=(p.completed?'✓ ':'課題：')+definition.name+(p.completed?' 達成':p.id==='rebuild'?' '+p.streak+'/3':'');
 }
}
