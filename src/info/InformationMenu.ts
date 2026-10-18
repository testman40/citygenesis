import type {City} from '../simulation/City';import {INFO_MODES,citizenRequests,type InfoMode} from './CityInformation';
const icon=(path:string)=>'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
export const INFO_TABS=[
 {id:'residents',label:'住民・世帯',icon:icon('M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 21v-4c0-6 12-6 12 0v4m0-7c4-1 8 1 8 4v3')},
 {id:'happiness',label:'幸福度',icon:icon('M12 21S3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12Z')},
 {id:'water',label:'水道',icon:icon('M12 2 5 12a8 8 0 1 0 14 0L12 2ZM8 15c0 3 2 4 4 4')},
 {id:'sewage',label:'下水・汚水',icon:icon('M4 5h10v6h6M7 2v6m5 7 3 3 3-3M3 21c3-3 5 3 8 0s5 3 10 0')},
 {id:'traffic',label:'交通',icon:icon('M7 3 3 21m14-18 4 18M12 3v4m0 4v3m0 4v3')},
 {id:'transit',label:'バス・公共交通',icon:icon('M5 17V5c0-3 14-3 14 0v12H5Zm0-7h14M8 17v4m8-4v4M8 13h1m6 0h1')},
 {id:'power',label:'電力',icon:icon('m14 2-9 12h7l-2 8 9-12h-7l2-8Z')},
 {id:'demand',label:'都市需要',icon:icon('M3 21h18M5 17v-5h3v5m3 0V7h3v10m3 0V3h3v14')},
 {id:'requests',label:'市民要望',icon:icon('M4 3h16v13H9l-5 5V3Zm4 5h8m-8 4h5')},
] as const;
export type InfoTab=typeof INFO_TABS[number]['id'];
export interface MenuState {tab:InfoTab|'other'|null;mode:InfoMode}
export const closedMenu=():MenuState=>({tab:null,mode:'normal'});
export function modeMenu(mode:InfoMode):MenuState {if(mode==='normal')return closedMenu();return {tab:INFO_TABS.some(t=>t.id===mode)?mode as InfoTab:'other',mode};}
export function toggleMenu(state:MenuState,tab:InfoTab):MenuState {return state.tab===tab?closedMenu():{tab,mode:tab==='requests'||tab==='residents'?'normal':tab};}
export const INFO_BAR_HTML='<section id="information-toolbar" role="toolbar" aria-label="都市情報ビュー">'+INFO_TABS.map((t,i)=>'<button type="button" data-info-tab="'+t.id+'" aria-label="'+t.label+'" title="'+t.label+'" aria-controls="information-panel" aria-pressed="false" aria-expanded="false" tabindex="'+(i===0?0:-1)+'">'+t.icon+'<span class="info-icon-label">'+(t.id==='transit'?'公共交通':t.label)+'</span>'+(t.id==='requests'?'<span id="info-request-badge" class="info-count">0</span>':'')+'</button>').join('')+'<label class="info-other-label"><span>その他</span><select id="info-other" aria-label="その他の情報ビュー"><option value="">選択</option>'+Object.entries(INFO_MODES).filter(([k])=>k!=='normal'&&!INFO_TABS.some(t=>t.id===k)).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label></section>';
const num=(v:number)=>v.toLocaleString('ja-JP',{maximumFractionDigits:1}),pct=(v:number)=>Math.round(v*100)+'%';
/** Presentation of existing results only. No policy, save or simulation mutations. */
export function compactInformation(c:City,mode:InfoMode,requestsView=false){
 const requests=citizenRequests(c),relevant=requestsView?requests[0]:requests.find(r=>r.mode===mode),history=c.management?.lifecycle?.history??[],last=history.at(-1),prior=history.at(-2);let primary='',secondary='';
 if(requestsView){primary=requests.length+'件の要望';secondary='深刻な問題から表示。関連ビューで区域を確認';}
 else if(mode==='water'){primary='給水 '+pct(c.waterUtility?.waterRatio??c.waterRatio);secondary='需要 '+num(c.waterDemand)+' / 能力 '+num(c.waterSupply)+(c.waterUtility?' · 外部購入費 '+num(c.waterUtility.purchaseCost)+'/月':' · '+(c.hydrology?'河川・管網方式':'従来の外部給水'));}
 else if(mode==='sewage'){const w=c.waterUtility,h=c.hydrology;primary=w?'処理率 '+pct(w.treatmentRatio):h?(c.sanitation?'処理率 '+pct(h.treatmentRatio):'排水 '+pct(h.sewerRatio)):'下水計算なし';secondary=w?'未処理 '+num(w.unprocessed)+' · 発生 '+num(w.generated)+' / 能力 '+num(w.treatmentCapacity)+' · 衛生 '+num(w.hygiene):h?'放流 '+num(h.discharged)+' · 処理 '+num(h.processed)+' · 残留 '+num(h.untreated):'従来方式の都市です';}
 else if(mode==='happiness'){primary=c.satisfaction+'/100';secondary='都市全体の幸福度 · 区域別の独立した数値は未実装';}
 else if(mode==='traffic'){primary='平均通勤 '+num(c.traffic.averageMinutes)+'分';secondary='渋滞 '+pct(c.traffic.congestionRate)+' · 通勤不可 '+c.traffic.unassigned+'人';}
 else if(mode==='transit'){primary='バス利用 '+pct(c.transit.usage);secondary='利用 '+c.transit.riders+'人 · 運行状況は公共交通パネル';}
 else if(mode==='power'){primary='電力 '+pct(c.powerRatio);secondary='供給 '+num(c.powerSupply)+' / 需要 '+num(c.powerDemand);}
 else if(mode==='demand'){primary='住宅 '+c.demand.residential+' · 商業 '+c.demand.commercial+' · 工業 '+c.demand.industrial;secondary='開発需要。高需要は緑、低需要は赤（緊急度とは別）';}
 const good=[c.powerRatio>=.8?'電力充足':'',c.waterRatio>=.8?'給水充足':'',c.taxRate<=1?'基準以下の税率':''].filter(Boolean);
 return {title:requestsView?'市民要望':INFO_MODES[mode],primary,secondary,problem:relevant?.title??'優先的な不足なし',advice:relevant?.action??'詳細で接続・能力・現在条件を確認できます',factors:'良好な現在条件：'+(good.join('・')||'詳細を確認')+' / 不足：'+(requests.slice(0,3).map(r=>r.title).join('・')||'優先的な不足なし'),trend:last&&prior?'保存履歴の前月比 '+(last.satisfaction-prior.satisfaction>0?'+':'')+(last.satisfaction-prior.satisfaction):'幸福度の変化：保存履歴が不足（推測しません）'};
}
export class InformationMenu {
 state:MenuState=closedMenu();
 constructor(private changed:(mode:InfoMode)=>void){
  const bar=document.getElementById('information-toolbar')!,panel=document.getElementById('information-panel')!;
  bar.addEventListener('click',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-info-tab]');if(b)this.commit(toggleMenu(this.state,b.dataset.infoTab as InfoTab));});
  (document.getElementById('info-other') as HTMLSelectElement).onchange=e=>this.openMode((e.target as HTMLSelectElement).value as InfoMode||'normal');
  document.getElementById('info-close')!.onclick=()=>{this.close(true);document.dispatchEvent(new Event('city-info-dismiss'));};
  for(const area of [bar,panel])area.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.close(true);document.dispatchEvent(new Event('city-info-dismiss'));}});
  bar.addEventListener('keydown',e=>{const b=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-info-tab]');if(!b||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const buttons=Array.from(bar.querySelectorAll<HTMLButtonElement>('[data-info-tab]')),index=buttons.indexOf(b),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;buttons.forEach((v,i)=>v.tabIndex=i===next?0:-1);buttons[next].focus();});this.paint();
 }
 private commit(next:MenuState){this.state=next;this.paint();this.changed(next.mode);}
 openMode(mode:InfoMode){this.commit(modeMenu(mode));}
 synchronize(mode:InfoMode){if(mode!==this.state.mode){this.state=modeMenu(mode);this.paint();}}
 close(focus=false){const previous=this.state.tab;this.commit(closedMenu());if(focus&&previous){const b=previous==='other'?document.getElementById('info-other'):document.querySelector<HTMLElement>('[data-info-tab="'+previous+'"]');b?.focus();}}
 private paint(){const panel=document.getElementById('information-panel')!,isOpen=this.state.tab!==null,requests=this.state.tab==='requests',residents=this.state.tab==='residents';document.getElementById('resident-panel')!.hidden=!residents;panel.hidden=!isOpen;panel.dataset.view=this.state.tab??'closed';document.body.classList.toggle('info-open',isOpen);if(isOpen)(document.getElementById('management-panel') as HTMLDetailsElement).open=false;
  const selected=INFO_TABS.findIndex(t=>t.id===this.state.tab);document.querySelectorAll<HTMLButtonElement>('[data-info-tab]').forEach((b,i)=>{const active=b.dataset.infoTab===this.state.tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.setAttribute('aria-expanded',String(active));b.tabIndex=i===(selected<0?0:selected)?0:-1;});
  (document.getElementById('overlay') as HTMLSelectElement).value=this.state.mode;const other=document.getElementById('info-other') as HTMLSelectElement;other.value=this.state.tab==='other'?this.state.mode:'';other.classList.toggle('active',this.state.tab==='other');document.getElementById('info-core')!.hidden=requests||residents;document.getElementById('info-details')!.hidden=requests||residents;const list=document.getElementById('citizen-requests') as HTMLDetailsElement;list.hidden=!requests;if(requests)list.open=true;
 }
}
