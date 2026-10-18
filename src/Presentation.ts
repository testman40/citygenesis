import type {Tool} from './simulation/City';
// UI only: never mutates the city, save data, or input handling.
const paths:Record<string,string>={close:'M5 5 19 19M19 5 5 19',settings:'M10 2h4l1 3 3-1 2 3-2 3 2 3-2 3-3-1-1 3h-4l-1-3-3 1-2-3 2-3-2-3 2-3 3 1 1-3ZM9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',undo:'M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12',redo:'m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12',library:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3V4Zm9 2v16M6 8h3m6 0h3M6 12h3m6 0h3',university:'M2 8 12 2l10 6H2Zm2 13h16M5 10v8m5-8v8m4-8v8m5-8v8',medicalCenter:'M3 21V7h6V2h6v5h6v14H3Zm9-15v8m-4-4h8M8 21v-4h8v4',researchCampus:'M9 2h6M10 2v7L3 21h18L14 9V2M7 16h10',bike:'M5 20a4 4 0 1 0 0-8 4 4 0 1 0 0 8ZM19 20a4 4 0 1 0 0-8 4 4 0 1 0 0 8ZM5 16l5-8 5 8H5Zm5-8h6l3 8M8 5h4m3-2h3v5',crossing:'M2 4h20M2 20h20M5 8v8m4-8v8m4-8v8m4-8v8m4-8v8',
'bus-road':'M5 2 2 22M19 2l3 20M8 7h8v10H8V7Zm0 5h8m-6 5v3m4-3v3',bus:'M5 4h14v14H5V4Zm0 7h14M8 18v3m8-3v3M8 15h1m6 0h1',train:'M6 2h12v16H6V2Zm0 9h12M8 18l-3 4m11-4 3 4M9 15h1m4 0h1',subway:'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0ZM7 16V8l5 6 5-6v8',ship:'M3 13l9-3 9 3-3 6H6l-3-6ZM8 11V5h8v6M12 5V2M2 22c3-3 6 3 10 0s6 3 10 0',transit:'M3 3h10v14H3V3Zm0 7h10M5 17v4m6-4v4M16 5h5v12h-5M16 12h5m-2 5v4',
'shape-line':'M3 19 21 5M3 15v4h4m10-14h4v4','shape-curve':'M3 20C3 4 21 20 21 4M17 4h4v4','shape-square':'M4 4h16v16H4V4Z','shape-rectangle':'M2 7h20v10H2V7Z',

bridge:'M2 17h20M4 17V6m16 11V6M4 9c5 6 11 6 16 0M8 12v5m8-5v5',park:'M12 2 5 11h3l-4 5h6v6h4v-6h6l-4-5h3L12 2Z',plaza:'M3 20h18M6 17h12l-1-5H7l-1 5ZM12 12V4m-4 4c0-5 8-5 8 0',goals:'M8 3h8v7a4 4 0 0 1-8 0V3ZM8 5H3v3c0 3 3 4 5 4m8-7h5v3c0 3-3 4-5 4M12 14v6m-4 1h8',audio:'M9 18V5l11-3v14M9 8l11-3M9 18c0 4-6 4-6 1s6-4 6-1Zm11-2c0 4-6 4-6 1s6-4 6-1Z',
select:'m5 3 14 10-7 1-3 7L5 3Z',road:'M5 2 2 22M19 2l3 20M12 3v4m0 4v3m0 4v3',erase:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
residential:'m3 11 9-8 9 8M5 10v11h14V10M10 21v-7h4v7',commercial:'M3 9h18l-2-6H5L3 9Zm1 0v12h16V9M9 21v-7h6v7M3 9c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0',industrial:'M3 21V10l6 4v-4l6 4V3h4l2 18H3Zm3-3h2m3 0h2m3 0h2',
power:'m14 2-10 12h8l-2 8 10-12h-8l2-8Z',water:'M12 2C10 6 4 11 4 15a8 8 0 0 0 16 0c0-4-6-9-8-13ZM8 15c0 3 2 4 4 4',depot:'M2 21V6l10-4 10 4v15M6 21V9h12v12M8 12h8v6H8v-6Zm0 3h8m-7 3v2m6-2v2','bus-stop':'M12 12v10M7 22h10M6 2h12v10H6V2Zm3 3h6v4H9V5Z',
route:'M4 4h6v6H4V4Zm10 10h6v6h-6v-6ZM10 7h7v7M7 10v7h7',pipe:'M3 8h9v8h9M3 12h5v8h13M3 6v8m18 0v8',sewage:'M4 3h16v8M7 7v4m5-4v4m5-4v4M3 17c3-4 6 4 9 0s6 4 9 0M3 22c3-4 6 4 9 0s6 4 9 0',
wind:'M12 10v12M12 10 9 2m3 8 9-3m-9 3-6 7M10 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0',solar:'M4 3h16l2 14H2L4 3Zm-1 7h18M9 3l-1 14m7-14 1 14M12 17v5M7 22h10',clinic:'M4 21V4h16v17H4Zm8-14v8m-4-4h8',school:'m2 7 10-5 10 5-10 5L2 7Zm3 3v9h14v-9M10 21v-6h4v6',fire:'M12 2c3 6-1 6 2 9l3-4c7 9 2 15-5 15S1 16 6 10c0 5 5 4 6-8Z',police:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6l9-4Zm-5 10 3 3 7-7',
save:'M3 3h15l3 3v15H3V3Zm4 0v6h10V3M7 21v-8h10v8',load:'M3 7h7l2 3h10l-3 11H3V7Zm9-5v5m-3-2 3 3 3-3',manage:'M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-6 1v6',focus:'M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M8 12h8m-4-4v8',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0'};
export function toolIcon(key:string):string {
 const aliases:Record<string,string>={'pipe-remove':'erase','bus-remove':'erase',externalWater:'water',advancedSewage:'sewage',outfall:'sewage',hospital:'clinic',elementary:'school',highSchool:'school'};
 return '<svg class="ui-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="'+(paths[aliases[key]??key]??paths.manage)+'"/></svg>';
}
export function decorateControls(root:ParentNode=document):void {
 root.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{
  b.classList.add('ui-control');if(b.querySelector('svg')||b.closest('#guide-panel')||b.id==='workspace-close'||b.id==='undo-build'||b.id==='redo-build'||b.id==='updates-open')return;
  if(b.dataset.tool){const label=(b.textContent??'').trim().replace(/^[＋+×┼↘▰⌖═▱⌂▤▥ϟ◉✚♨◆≈≋✣▦⇥]\s*/u,'');b.innerHTML=toolIcon(b.dataset.tool);const span=document.createElement('span');span.textContent=label;b.append(span);}
  else {
   const key=b.id.includes('delete')||b.id.includes('remove')?'erase':b.id.includes('save')||b.id==='export-city'?'save':b.id.includes('load')||b.id==='switch-city'?'load':b.id.includes('bus')?'route':b.id==='focus-city'||b.id==='reset'?'focus':b.id==='help'?'help':'manage';
   if(b.id==='help')b.textContent='ヘルプ';
   if(b.id==='info-close')b.setAttribute('aria-label','情報パネルを閉じる');
   if(b.closest('#bus-route-order'))b.textContent=b.textContent==='↑'?'上へ':b.textContent==='↓'?'下へ':'削除';
   if(!b.dataset.speed&&b.id!=='info-close')b.insertAdjacentHTML('afterbegin',toolIcon(key));
  }
  b.classList.add('ui-control');
 });
}
export function paintAmount(id:string,value:number):void {const el=document.getElementById(id);if(el)el.dataset.tone=value>0?'positive':value<0?'negative':'neutral';}
export class ToolFeedback {
 private chip=document.createElement('div');private hint=document.createElement('div');private inside=false;private x=0;private y=0;
 constructor(canvas:HTMLCanvasElement,private names:Record<Tool,string>,private state:()=>{tool:Tool;drawing:boolean;draft:boolean;facility:boolean;ready:boolean;busy:boolean;routePicking:boolean}) {
  this.chip.id='tool-cursor';this.chip.hidden=true;this.chip.setAttribute('aria-hidden','true');this.hint.id='operation-hint';this.hint.hidden=true;this.hint.setAttribute('role','status');document.getElementById('app')!.append(this.chip,this.hint);
  for(const event of ['pointermove','pointerdown','pointerup','pointercancel','lostpointercapture'] as const)canvas.addEventListener(event,e=>{this.x=e.clientX;this.y=e.clientY;this.inside=e.pointerType!=='touch'&&e.clientX>=0&&e.clientY>=0&&e.clientX<innerWidth&&e.clientY<innerHeight;this.refresh();});
  canvas.addEventListener('pointerleave',()=>{this.inside=false;this.refresh();});window.addEventListener('blur',()=>{this.inside=false;this.refresh();});window.addEventListener('resize',()=>this.refresh());
 }
 refresh():void {
  const s=this.state(),label=s.routePicking?'路線の停留所を選択中':this.names[s.tool]+(s.tool==='select'?'中':s.tool.includes('remove')||s.tool==='erase'?'中':'を設置中');
  if(this.chip.dataset.label!==label){this.chip.innerHTML=toolIcon(s.routePicking?'route':s.tool)+'<span>'+label+'</span>';this.chip.dataset.label=label;}
  this.chip.hidden=!this.inside||!s.ready||s.busy;this.chip.style.left=Math.max(8,Math.min(this.x+18,innerWidth-this.chip.offsetWidth-8))+'px';this.chip.style.top=Math.max(8,Math.min(this.y+18,innerHeight-this.chip.offsetHeight-8))+'px';
  if(!this.chip.hidden&&document.body.classList.contains('hud-layout')){const r=this.chip.getBoundingClientRect();this.chip.hidden=['hud-topbar','hud-tools','hud-context','workspace-drawer','hud-notices','hud-settings-menu'].some(id=>{const node=document.getElementById(id);if(!node||node.hidden||!node.getClientRects().length)return false;const b=node.getBoundingClientRect();return r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top;});}
  this.hint.hidden=!(s.drawing&&s.tool!=='select')&&!s.routePicking;
  const message=s.routePicking?'停留所を順番にクリック · Esc／右クリックで終了':s.draft?'ドラッグで範囲指定 · 離すと確定 · Esc／右クリックで取消':s.facility?'離すと設置 · Esc／右クリックで取消':'ドラッグで連続指定 · Esc／右クリックで終了（適用済みのマスは残ります）';if(this.hint.textContent!==message)this.hint.textContent=message;
  document.getElementById('road-panel')!.hidden=s.tool!=='road'&&s.tool!=='erase';const actionLabel=document.getElementById('road-action')!.closest('label');if(actionLabel)(actionLabel as HTMLElement).hidden=s.tool==='erase';(document.getElementById('road-fill')!.closest('label') as HTMLElement).hidden=(document.getElementById('road-mode') as HTMLSelectElement).value==='line'||(document.getElementById('road-mode') as HTMLSelectElement).value==='curve';document.getElementById('road-preview-status')!.hidden=!s.draft;
 }
}
