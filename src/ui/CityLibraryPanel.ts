import {CityLibrary,type LibraryEntry} from '../save/CityLibrary';
import type {CityStorage} from '../save/storage';
export class CityLibraryPanel {
 private root:HTMLElement;private generation=0;private pending=false;private drafts=new Map<string,string>();
 constructor(private library:CityLibrary,private storage:CityStorage,private locked:()=>boolean,private restore:(data:unknown,name:string)=>Promise<string>,private setBusy:(value:boolean)=>void){
  this.root=document.createElement('details');this.root.id='city-library';this.root.innerHTML='<summary>保存都市の名前・画像・バックアップ</summary><p>バックアップは手動保存前の3件を保持します。復元は別スロットに作成します。名前・画像はこのブラウザーに保存されます。</p><div id="city-library-list"></div><p id="city-library-status" role="status"></p>';
  document.querySelector('.save-panel')!.append(this.root);this.root.addEventListener('toggle',()=>{if((this.root as HTMLDetailsElement).open)void this.refresh();});
 }
 async refresh(){
  const generation=++this.generation;try{
   const slots=await this.storage.slots(),entries=await Promise.all(slots.map(slot=>this.library.get(slot)));
   if(generation!==this.generation)return;const list=document.getElementById('city-library-list')!;list.replaceChildren();
   slots.forEach((slot,index)=>{const entry=entries[index],article=document.createElement('article');article.className='library-city';
    if(entry.thumbnail){const image=document.createElement('img');image.src=entry.thumbnail;image.alt=(entry.name||'都市')+'の景観';image.loading='lazy';article.append(image);}
    const title=document.createElement('strong');title.textContent=(entry.name||'保存都市 '+(index+1))+(slot===this.storage.activeSlot?'（プレイ中）':'');article.append(title);
    const date=document.createElement('small');date.textContent=entry.updatedAt?'最終保存 '+new Date(entry.updatedAt).toLocaleString('ja-JP'):'保存日時は次回保存時に記録';article.append(date);
    const name=document.createElement('input');name.maxLength=40;name.value=this.drafts.get(slot)??entry.name;name.oninput=()=>this.drafts.set(slot,name.value);name.placeholder='都市名';name.setAttribute('aria-label','都市名');article.append(name);
    this.button(article,'名前を保存',async()=>{const value=(this.drafts.get(slot)??name.value).trim();await this.library.update(slot,e=>({...e,name:value}));this.drafts.delete(slot);});
    const deletion=this.button(article,'この都市を削除',async()=>{
     if(slot===this.storage.activeSlot)throw new Error('プレイ中の都市は削除できません。別の都市へ切り替えてください。');
     if(!confirm((entry.name||'この都市')+'とバックアップを削除しますか？ この操作は戻せません。'))return;
     await this.storage.remove(slot);await this.library.remove(slot);
    });deletion.disabled=slot===this.storage.activeSlot;
    for(const backup of entry.backups)this.button(article,new Date(backup.savedAt).toLocaleString('ja-JP')+'を別スロットへ復元',()=>this.restore(backup.data,entry.name||'都市'));
    list.append(article);
   });
   if(!slots.length)list.textContent='保存都市はまだありません。「保存」で最初の都市を残しましょう。';
  }catch(error){this.message(error);}
 }
 private button(parent:HTMLElement,label:string,action:()=>Promise<unknown>){const button=document.createElement('button');button.type='button';button.textContent=label;button.onclick=async()=>{if(this.pending||this.locked())return;this.pending=true;this.setBusy(true);button.disabled=true;try{const selectedSlot=await action();this.message('都市一覧を更新しました。');document.dispatchEvent(new CustomEvent('city-library-changed',{detail:{selectedSlot:typeof selectedSlot==='string'?selectedSlot:undefined}}));}catch(error){this.message(error);}finally{this.pending=false;await this.refresh();this.setBusy(false);}};parent.append(button);return button;}
 private message(value:unknown){document.getElementById('city-library-status')!.textContent=value instanceof Error?value.message:String(value);}
}
