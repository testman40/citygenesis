import type {ScenarioProgress} from '../scenarios/Scenarios';
import {validateSave,type SaveData} from './schema';
export interface LibraryBackup {id:string;savedAt:string;data:SaveData}
export interface LibraryEntry {scenario?:ScenarioProgress;name:string;thumbnail?:string;updatedAt?:string;backups:LibraryBackup[];automaticBackups?:LibraryBackup[];busService?:Record<string,{enabled:boolean;interval:number}>}
export const emptyEntry=():LibraryEntry=>({name:'',backups:[]});
/** Keep independent automatic recovery points, skipping unchanged paused-city saves. */
export function automaticBackupEntry(entry:LibraryEntry,data:SaveData):LibraryEntry{
 const existing=entry.automaticBackups??[],last=existing[0];
 if(last&&JSON.stringify([last.data.city,last.data.clock])===JSON.stringify([data.city,data.clock]))return entry;
 return {...entry,automaticBackups:[{id:crypto.randomUUID(),savedAt:data.savedAt,data},...existing].slice(0,3)};
}
/** Browser-local catalogue, separate from the unchanged city-file format and original save DB. */
export class CityLibrary {
 private async open(){return await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('city-genesis-library',1);request.onupgradeneeded=()=>request.result.createObjectStore('cities');request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('都市一覧が別タブで使用されています'));request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};});}
 async get(slot:string){const db=await this.open();try{return await new Promise<LibraryEntry>((resolve,reject)=>{const r=db.transaction('cities','readonly').objectStore('cities').get(slot);r.onsuccess=()=>resolve(r.result??emptyEntry());r.onerror=()=>reject(r.error);});}finally{db.close();}}
 async update(slot:string,mutate:(entry:LibraryEntry)=>LibraryEntry){const db=await this.open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('cities','readwrite'),store=tx.objectStore('cities'),r=store.get(slot);r.onsuccess=()=>{try{store.put(mutate(r.result??emptyEntry()),slot);}catch(error){tx.abort();reject(error);}};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('都市一覧を保存できませんでした'));});}finally{db.close();}}
 async backup(slot:string,data:SaveData){const checked=validateSave(data);await this.update(slot,entry=>({...entry,backups:[{id:crypto.randomUUID(),savedAt:new Date().toISOString(),data:checked},...entry.backups].slice(0,3)}));}
 async automaticBackup(slot:string,data:SaveData){const checked=validateSave(data);await this.update(slot,entry=>automaticBackupEntry(entry,checked));}
 async remove(slot:string){const db=await this.open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('cities','readwrite');tx.objectStore('cities').delete(slot);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
}
