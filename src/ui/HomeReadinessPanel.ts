import {homeReadiness} from '../economy/HomeReadiness';
import type {City,Cell,Tool} from '../simulation/City';
export class HomeReadinessPanel {
 private root=document.createElement('section');private signature='';private stamp=0;
 constructor(){this.root.id='home-readiness';this.root.className='beginner-card';this.root.hidden=true;document.getElementById('hud-notices')!.prepend(this.root);}
 refresh(c:City,cell:Cell|null,tool:Tool){
  const visible=cell&&tool==='select'&&c.contains(cell)&&c.tile(cell).zone==='residential';this.root.hidden=!visible;if(!visible){this.signature='';return;}
  if(performance.now()-this.stamp<300)return;this.stamp=performance.now();const checks=homeReadiness(c,cell),status=c.buildingStatus(cell),key=JSON.stringify([cell,checks,status,c.population]);if(key===this.signature)return;this.signature=key;this.root.replaceChildren();
  const title=document.createElement('h3');title.textContent='住宅の入居条件 · X'+cell.x+' / Z'+cell.z;this.root.append(title);
  for(const check of checks){const row=document.createElement('div');row.className='home-check';const label=document.createElement('strong');label.textContent=(check.ok?'✓ ':'要確認：')+check.label;label.className=check.ok?'chart-good':'chart-bad';row.append(label);if(!check.ok){const b=document.createElement('button');b.type='button';b.textContent='整える';b.setAttribute('aria-label',check.label+'を整える');b.onclick=()=>document.dispatchEvent(new CustomEvent('city-home-help',{detail:{tool:check.tool,location:{...cell}}}));row.append(b);}this.root.append(row);}
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=(status.reasons.length?'成長の確認事項 '+status.reasons.length+'件：':'')+'詳しい条件を表示';details.append(summary);for(const check of checks){const p=document.createElement('p');p.textContent=check.label+'：'+check.detail;details.append(p);}
  const note=document.createElement('p');note.textContent='初期入居は職場より先に始まる場合があります。定住・成長には雇用も大切です。'+(status.reasons.length?'成長の確認事項：'+status.reasons.join('／'):'準備済みです。時間を進めて建設・入居を待ちましょう。');details.append(note);this.root.append(details);
  const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.onclick=()=>document.dispatchEvent(new Event('city-home-dismiss'));this.root.append(close);
 }
}
