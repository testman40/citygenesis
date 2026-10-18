/** Presentation events are observed without changing history, saves or simulation. */
export class NoticeCenter {
 private feed:HTMLElement;private seen=new Map<string,string>();private queue:Array<{message:string;kind:string}>=[];private active:string|null=null;
 constructor(root:HTMLElement){
  this.feed=document.createElement('div');this.feed.id='hud-notice-feed';this.feed.setAttribute('role','log');this.feed.setAttribute('aria-live','polite');this.feed.setAttribute('aria-label','新しいお知らせ');root.append(this.feed);
  for(const id of ['undo-status','goal-toast','life-notice','sanitation-notice','save-status']){const source=document.getElementById(id);if(!source)continue;this.seen.set(id,source.textContent??'');new MutationObserver(()=>{const message=(source.textContent??'').trim();if(!message||this.seen.get(id)===message)return;this.seen.set(id,message);if(id==='goal-toast'&&source.hidden)return;this.push(message,id==='goal-toast'?'achievement':source.classList.contains('failure')?'error':'notice');}).observe(source,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});}
 }
 push(message:string,kind='notice'){
  if(message.includes('時間の進行・別の操作・都市切替で履歴を終了しました'))message='これより前の操作は取り消せなくなりました';
  if(this.active===message||this.queue.some(n=>n.message===message))return;this.queue.push({message,kind});this.showNext();
 }
 private showNext(){
  if(this.active!==null)return;const next=this.queue.shift();if(!next)return;this.active=next.message;
  const node=document.createElement('div');node.className='hud-notice';node.dataset.kind=next.kind;node.textContent=next.message;this.feed.replaceChildren(node);setTimeout(()=>{node.remove();this.active=null;this.showNext();},3000);
 }
}
