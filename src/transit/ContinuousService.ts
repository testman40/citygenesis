import type {City} from '../simulation/City';
import type {BusOperations} from './BusOperations';
import {CityLibrary} from '../save/CityLibrary';
type Setting={enabled:boolean;interval:number};
export type ServiceExecutor=(action:(operations:BusOperations)=>void,done:(error?:unknown)=>void)=>void;
/** Dispatch preferences live in the local city catalogue; bus runs retain their existing save format. */
export class ContinuousService {
 private slot='';private epoch=0;private settings:Record<string,Setting>={};private waits=new Map<number,number>();private pending=new Set<number>();private loading=false;private saving=false;private owner:City|undefined;
 private enabled:HTMLInputElement;private interval:HTMLInputElement;private message:HTMLElement;
 constructor(private library:CityLibrary,private getSlot:()=>string,private city:()=>City,private execute:ServiceExecutor){
  const panel=document.createElement('details');panel.id='bus-continuous';panel.innerHTML='<summary>次便の自動運行</summary><label><input id="bus-auto-enabled" type="checkbox">選択した路線を繰り返し運行</label><label>帰庫後の待ち時間（ゲーム内の分）<input id="bus-auto-interval" type="number" min="0" max="1440" value="5"></label><p>全車帰庫後に次便を開始します。運休・異常停止時は自動運行も停止します。設定はこのブラウザー・都市ごとに保存し、都市ファイルには含めません。</p><p id="bus-auto-status" role="status"></p>';
  document.getElementById('bus-runtime')!.after(panel);this.enabled=panel.querySelector('#bus-auto-enabled')!;this.interval=panel.querySelector('#bus-auto-interval')!;this.message=panel.querySelector('#bus-auto-status')!;
  const update=()=>void this.change();this.enabled.onchange=update;this.interval.onchange=update;
  document.getElementById('bus-route-select')!.addEventListener('change',()=>this.paint());
  for(const id of ['bus-stop','bus-route-delete'])document.getElementById(id)!.addEventListener('click',()=>{const route=this.selected();if(route!==undefined)this.disable(route,'手動操作により自動運行を停止しました。');});
 }
 private selected(){const value=(document.getElementById('bus-route-select') as HTMLSelectElement).value;return value!==''&&this.city().transit.operations.routes.has(Number(value))?Number(value):undefined;}
 refresh(){
  const slot=this.getSlot();if(slot!==this.slot){this.slot=slot;this.epoch++;const epoch=this.epoch;this.settings={};this.waits.clear();this.pending.clear();this.loading=true;void this.library.get(slot).then(entry=>{if(epoch===this.epoch)this.settings=entry.busService??{};}).catch(()=>{if(epoch===this.epoch)this.message.textContent='自動運行設定を読み込めませんでした。';}).finally(()=>{if(epoch===this.epoch){this.loading=false;this.paint();}});}
  if(this.owner!==this.city()){this.owner=this.city();this.waits.clear();this.pending.clear();}
  this.paint();
 }
 private paint(){const id=this.selected(),setting=id===undefined?undefined:this.settings[id];this.enabled.disabled=this.loading||this.saving||id===undefined;this.interval.disabled=this.loading||this.saving||id===undefined;if(!this.saving)this.enabled.checked=setting?.enabled??false;if(!this.saving&&document.activeElement!==this.interval)this.interval.value=String(setting?.interval??5);}
 private async change(){const id=this.selected();if(id===undefined||this.loading||this.saving)return;const interval=Number(this.interval.value);if(!Number.isFinite(interval)||interval<0||interval>1440){this.message.textContent='待ち時間は0〜1440分で指定してください。';this.paint();return;}
  const slot=this.slot,epoch=this.epoch,setting={enabled:this.enabled.checked,interval};
  this.saving=true;this.paint();try{await this.library.update(slot,entry=>({...entry,busService:{...entry.busService,[id]:setting}}));if(epoch!==this.epoch){this.saving=false;return;}this.settings[id]=setting;this.waits.delete(id);this.message.textContent=setting.enabled?'自動運行を予約しました。ゲームの時間を進めてください。':'自動運行を停止しました。現在の便は帰庫まで運行します。';}catch{if(epoch===this.epoch)this.message.textContent='自動運行設定を保存できませんでした。';}this.saving=false;this.paint();
 }
 private disable(id:number,message:string){const setting=this.settings[id];if(!setting?.enabled)return;this.settings[id]={...setting,enabled:false};this.waits.delete(id);this.message.textContent=message;const slot=this.slot;void this.library.update(slot,entry=>({...entry,busService:{...entry.busService,[id]:{...setting,enabled:false}}})).catch(()=>{});this.paint();}
 advance(minutes:number){
  this.refresh();if(this.loading||minutes<=0)return;const ops=this.city().transit.operations;
  for(const [key,setting] of Object.entries(this.settings)){
   const id=Number(key);if(!setting.enabled||!ops.routes.has(id)||this.pending.has(id))continue;
   const buses=[...ops.buses.values()].filter(bus=>bus.route===id);
   if(buses.some(bus=>bus.state==='error'||bus.state==='paused')){this.disable(id,'運休・異常停止のため自動運行を停止しました。診断と復旧を確認してください。');continue;}
   if(buses.some(bus=>bus.state!=='garage')){this.waits.delete(id);continue;}
   const remaining=(this.waits.get(id)??setting.interval)-minutes;this.waits.set(id,remaining);if(remaining>0)continue;
   const epoch=this.epoch,slot=this.slot;this.pending.add(id);
   this.execute(candidate=>{if(epoch!==this.epoch||slot!==this.getSlot()||!this.settings[id]?.enabled)throw new Error('都市・運行設定が変わったため次便を中止しました');candidate.start(id);},error=>{if(epoch!==this.epoch)return;this.pending.delete(id);this.waits.delete(id);if(error)this.disable(id,'次便を開始できません：'+(error instanceof Error?error.message:'路線と車庫を確認してください'));else this.message.textContent='次便の運行を開始しました。';});
  }
 }
}
