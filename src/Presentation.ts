import type {Tool} from './simulation/City';
// UI only: never mutates the city, save data, or input handling.
const paths:Record<string,string>={
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
  b.classList.add('ui-control');if(b.querySelector('svg'))return;
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
  this.hint.hidden=!(s.drawing&&s.tool!=='select')&&!s.routePicking;
  const message=s.routePicking?'停留所を順番にクリック · Esc／右クリックで終了':s.draft?'ドラッグで範囲指定 · 離すと確定 · Esc／右クリックで取消':s.facility?'離すと設置 · Esc／右クリックで取消':'ドラッグで連続指定 · Esc／右クリックで終了（適用済みのマスは残ります）';if(this.hint.textContent!==message)this.hint.textContent=message;
  document.getElementById('road-panel')!.hidden=s.tool!=='road'&&s.tool!=='erase';(document.getElementById('road-action')!.closest('label') as HTMLElement).hidden=s.tool==='erase';(document.getElementById('road-fill')!.closest('label') as HTMLElement).hidden=(document.getElementById('road-mode') as HTMLSelectElement).value==='line';document.getElementById('road-preview-status')!.hidden=!s.draft;
 }
}
