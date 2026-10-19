/** Touch/keyboard resizing changes only the HUD, never simulation or saved city state. */
export class MobilePanels {
 private media=matchMedia('(max-width:700px)');
 private height:number|null=null;private open=false;private hintSeen=false;private hintReady=false;private hintPanel:HTMLElement|null=null;
 private drag:{pointer:number;y:number;height:number}|null=null;
 private panels:HTMLElement[];
 constructor(){
  try{this.hintSeen=localStorage.getItem('citygenesis-panel-resize-hint')==='seen';}catch{}
  for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>this.hintReady=true,{capture:true,once:true});
  this.panels=['hud-context','workspace-drawer'].map(id=>document.getElementById(id)!);
  for(const panel of this.panels){
   const grip=document.createElement('div');grip.className='hud-sheet-grip';grip.tabIndex=0;grip.setAttribute('role','separator');grip.setAttribute('aria-orientation','horizontal');grip.setAttribute('aria-label','パネルの高さを変更');grip.innerHTML='<span aria-hidden="true"></span><small>上下にドラッグして高さを変更</small>';panel.prepend(grip);
   grip.addEventListener('pointerdown',e=>{if(!this.media.matches||e.button!==0)return;e.preventDefault();e.stopPropagation();this.drag={pointer:e.pointerId,y:e.clientY,height:panel.getBoundingClientRect().height};grip.setPointerCapture(e.pointerId);});
   grip.addEventListener('pointermove',e=>{if(!this.drag||e.pointerId!==this.drag.pointer)return;e.preventDefault();this.height=this.drag.height+this.drag.y-e.clientY;this.layout();});
   const finish=(e:PointerEvent)=>{if(e.pointerId!==this.drag?.pointer)return;this.drag=null;if(grip.hasPointerCapture(e.pointerId))grip.releasePointerCapture(e.pointerId);};
   grip.addEventListener('pointerup',finish);grip.addEventListener('pointercancel',finish);grip.addEventListener('lostpointercapture',()=>this.drag=null);
   grip.addEventListener('keydown',e=>{if(!this.media.matches||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();this.height=e.key==='Home'?0:e.key==='End'?innerHeight:panel.getBoundingClientRect().height+(e.key==='ArrowUp'?40:-40);this.layout();});
   new MutationObserver(()=>this.layout()).observe(panel,{attributes:true,attributeFilter:['hidden']});
  }
  document.addEventListener('city-public-build',()=>{if(this.media.matches){this.height=0;this.layout();}});
  window.addEventListener('resize',()=>this.layout());this.media.addEventListener('change',()=>{this.height=null;this.layout();});this.layout();
 }
 private layout(){
  if(!this.media.matches){delete document.body.dataset.mobilePanelOpen;return;}
  const bar=document.getElementById('hud-tools')!.getBoundingClientRect(),top=document.getElementById('hud-topbar')!.getBoundingClientRect().bottom+10;
  const max=Math.max(80,bar.top-top-90),min=Math.min(160,max),height=Math.round(Math.max(min,Math.min(max,this.height??innerHeight/3)));
  if(this.height!==null)this.height=height;
  document.body.style.setProperty('--hud-sheet-height',height+'px');
  const current=this.panels.find(p=>!p.hidden)??null;if(current&&!this.hintSeen&&this.hintReady){this.hintPanel=current;this.hintSeen=true;try{localStorage.setItem('citygenesis-panel-resize-hint','seen');}catch{}}if(!current)this.hintPanel=null;this.open=!!current;document.body.dataset.mobilePanelOpen=String(this.open);for(const p of this.panels)p.querySelector<HTMLElement>('.hud-sheet-grip small')!.hidden=p!==this.hintPanel;
  for(const panel of this.panels){const grip=panel.querySelector<HTMLElement>('.hud-sheet-grip')!;grip.setAttribute('aria-valuemin',String(Math.round(min)));grip.setAttribute('aria-valuemax',String(Math.round(max)));grip.setAttribute('aria-valuenow',String(height));}
 }
}
