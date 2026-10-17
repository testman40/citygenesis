import {validateAsync} from './validateAsync';
import { validateSave, type SaveData } from './schema';
const DATABASE='city-genesis', STORE='saves', KEY='current';
export class CityStorage {
 activeSlot='current';
 constructor(private factory?:IDBFactory){}
 private open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
   const factory=this.factory??globalThis.indexedDB;if(!factory){reject(new Error('このブラウザーでは保存領域を利用できません'));return;}
   let blocked=false;const request=factory.open(DATABASE,1);
   request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};
   request.onerror=()=>reject(new Error('保存領域を開けません：'+request.error?.message));
   request.onblocked=()=>{blocked=true;reject(new Error('保存領域が別タブで使用されています'));};
   request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  });
 }
 async save(data:SaveData):Promise<void> {
  const checked=validateSave(data),db=await this.open();
  try {await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(checked,this.activeSlot);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('保存に失敗しました：'+(tx.error?.message??'書き込み中断')));tx.onerror=()=>{};});}
  finally{db.close();}
 }
 async create(data:SaveData){const checked=validateSave(data),slot='city-'+crypto.randomUUID(),db=await this.open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).add(checked,slot);tx.objectStore(STORE).put(slot,'active-slot');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('新規都市の保存に失敗しました'));});this.activeSlot=slot;return slot;}finally{db.close();}}
 // Import is additive: neither the selected slot nor its persisted pointer changes.
 async importData(raw:unknown):Promise<string>{
  const checked=await validateAsync(raw),slot='city-'+crypto.randomUUID(),db=await this.open();
  try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).add(checked,slot);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('都市ファイルの取り込みに失敗しました：'+(tx.error?.message??'書き込み中断')));tx.onerror=()=>{};});return slot;}finally{db.close();}
 }
 async activate(slot:string){const db=await this.open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(slot,'active-slot');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('都市切替に失敗しました'));});this.activeSlot=slot;}finally{db.close();}}
 async remove(slot:string){if(slot===this.activeSlot)throw new Error('プレイ中の都市は削除できません');const db=await this.open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(slot);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error('都市を削除できませんでした'));});}finally{db.close();}}
 async slots():Promise<string[]>{const db=await this.open();try{return await new Promise((resolve,reject)=>{const r=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();r.onsuccess=()=>resolve(r.result.filter(k=>typeof k==='string'&&k!=='active-slot') as string[]);r.onerror=()=>reject(r.error);});}finally{db.close();}}
 async readRaw(slot?:string,signal?:AbortSignal):Promise<{slot:string;data:unknown}>{if(signal?.aborted)throw new DOMException('ロードをキャンセルしました','AbortError');const db=await this.open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');let data:unknown,key=slot??KEY;const abort=()=>{try{tx.abort();}catch{};reject(new DOMException('ロードをキャンセルしました','AbortError'));};signal?.addEventListener('abort',abort,{once:true});const active=tx.objectStore(STORE).get('active-slot');active.onsuccess=()=>{key=slot??(typeof active.result==='string'?active.result:KEY);const request=tx.objectStore(STORE).get(key);request.onsuccess=()=>data=request.result;};tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);if(signal?.aborted)abort();else resolve({slot:key,data});};tx.onabort=()=>{signal?.removeEventListener('abort',abort);reject(signal?.aborted?new DOMException('ロードをキャンセルしました','AbortError'):new Error('読み込みに失敗しました'));};});}finally{db.close();}}
 async loadAsync(slot?:string,options:{signal?:AbortSignal;onProgress?:(phase:string,value:number)=>void;profile?:{dbMs:number;workerMs:number;validationMs:number}}={}):Promise<{slot:string;data:SaveData|null}>{options.onProgress?.('保存データを取得',0);const start=performance.now(),raw=await this.readRaw(slot,options.signal);if(options.profile)options.profile.dbMs=performance.now()-start;if(raw.data===undefined){if(slot)throw new Error('選択した都市がありません');return {slot:raw.slot,data:null};}options.onProgress?.('保存データを検証',.05);return {slot:raw.slot,data:await validateAsync(raw.data,options.signal,options.profile)};}
 async load(slot?:string):Promise<SaveData|null> {
  const db=await this.open();
  const previous=this.activeSlot;try{const data=await new Promise<SaveData|null>((resolve,reject)=>{
   const tx=db.transaction(STORE,'readonly');let value:unknown;const active=tx.objectStore(STORE).get('active-slot');active.onsuccess=()=>{this.activeSlot=slot??(typeof active.result==='string'?active.result:KEY);const request=tx.objectStore(STORE).get(this.activeSlot);request.onsuccess=()=>{value=request.result;};};

   tx.oncomplete=()=>{try{resolve(value===undefined?null:validateSave(value));}catch(e){reject(e);}};
   tx.onabort=()=>reject(new Error('読み込みに失敗しました：'+(tx.error?.message??'中断')));tx.onerror=()=>{};
  });if(slot&&!data)throw new Error('選択した都市がありません');return data;}catch(e){this.activeSlot=previous;throw e;}finally{db.close();}
 }
}
