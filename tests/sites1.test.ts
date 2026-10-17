import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {CityStorage} from '../src/save/storage';
import {encodeTransfer,decodeTransfer,MAX_TRANSFER_BYTES} from '../src/save/transfer';
import {validateSave,type SaveData} from '../src/save/schema';
const save=(size:number):SaveData=>({version:4,savedAt:new Date().toISOString(),city:new City(size).snapshot(),clock:{speed:0,accumulated:0}});
function factory(fail=false){const added=new Map<string,unknown>();let closed=0;const factory={open(){const request:any={};queueMicrotask(()=>{request.result={close(){closed++;},transaction(){const tx:any={error:fail?{message:'quota'}:null,objectStore(){return {add(data:unknown,key:string){added.set(key,data);}}}};setTimeout(()=>{if(fail){added.clear();tx.onabort?.();}else tx.oncomplete?.();},0);return tx;}};request.onsuccess();});return request;}} as unknown as IDBFactory;return {factory,added,closed:()=>closed};}
for(const size of [64,128,256])test('portable v4 roundtrip '+size,()=>{const data=save(size);assert.deepEqual(validateSave(decodeTransfer(encodeTransfer(data))),data);});
test('portable JSON rejects invalid syntax and oversized input',()=>{assert.throws(()=>decodeTransfer('{broken'),/JSON/);assert.throws(()=>decodeTransfer(' '.repeat(MAX_TRANSFER_BYTES+1)),/20MB/);});
test('import creates a separate slot without activation or current writes',async()=>{const db=factory(),storage=new CityStorage(db.factory);storage.activeSlot='retained-city';const slot=await storage.importData(save(64));assert.match(slot,/^city-/);assert.equal(storage.activeSlot,'retained-city');assert.deepEqual([...db.added.keys()],[slot]);assert.equal(db.closed(),1);});
test('invalid imported data never opens storage',async()=>{let opened=false;const storage=new CityStorage({open(){opened=true;throw Error('unexpected');}} as unknown as IDBFactory);await assert.rejects(storage.importData({...save(64),version:999}));assert.equal(opened,false);});
test('failed import preserves active slot and closes database',async()=>{const db=factory(true),storage=new CityStorage(db.factory);storage.activeSlot='retained-city';await assert.rejects(storage.importData(save(64)),/quota/);assert.equal(storage.activeSlot,'retained-city');assert.equal(db.added.size,0);assert.equal(db.closed(),1);});
test('legacy v2 imported through existing migration',async()=>{const db=factory(),storage=new CityStorage(db.factory),data={...save(64),version:2};const slot=await storage.importData(data);assert.equal((db.added.get(slot) as SaveData).city.size,64);assert.equal(storage.activeSlot,'current');});
