/** Presentation events are observed without changing history, saves or simulation. */
export class NoticeCenter {
 private feed:HTMLElement;private seen=new Map<string,string>();
 constructor(root:HTMLElement){
  this.feed=document.createElement('div');this.feed.id='hud-notice-feed';this.feed.setAttribute('role','log');this.feed.setAttribute('aria-live','polite');this.feed.setAttribute('aria-label','新しいお知らせ');root.append(this.feed);
  for(const id of ['undo-status','goal-toast','life-notice','sanitation-notice','save-status']){const source=document.getElementById(id);if(!source)continue;this.seen.set(id,source.textContent??'');new MutationObserver(()=>{const message=(source.textContent??'').trim();if(!message||this.seen.get(id)===message)return;this.seen.set(id,message);if(id==='goal-toast'&&source.hidden)return;this.push(message,id==='goal-toast'?'achievement':source.classList.contains('failure')?'error':'notice');}).observe(source,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});}
 }
 push(message:string,kind='notice'){
  if(Array.from(this.feed.children).some(n=>n.textContent===message))return;
  const node=document.createElement('div');node.className='hud-notice';node.dataset.kind=kind;node.textContent=message;this.feed.prepend(node);while(this.feed.children.length>3)this.feed.lastElementChild!.remove();setTimeout(()=>node.remove(),6000);
 }
}
