import {City,type Tool} from './City';
import type {CityState} from '../save/schema';
const tools=new Set<Tool>(['parking','library','university','medicalCenter','researchCampus','crossing','road','residential','commercial','industrial','erase','bridge','park','plaza','pipe','pipe-remove','power','water','externalWater','wind','solar','outfall','sewage','advancedSewage','clinic','hospital','elementary','highSchool','fire','police','depot']);
const encoded=(state:CityState)=>JSON.stringify(state);
interface Entry {before:CityState;after:CityState;label:string;bytes:number}
const running=(state:CityState)=>state.transit?.infrastructure?.buses.some(bus=>bus.state!=='garage')??false;
/** Whole-city build transactions, bounded to 20 operations / 16 MiB. Never crosses time or policy changes. */
export class BuildHistory {
 private entries:Entry[]=[];private redoEntries:Entry[]=[];private owner:City|undefined;private expected='';private bytes=0;
 reason='一時停止中の建設・撤去を取り消し・やり直しできます。';
 clear(reason='これより前の操作は取り消せなくなりました'){this.entries=[];this.redoEntries=[];this.bytes=0;this.owner=undefined;this.expected='';this.reason=reason;}
 supports(city:City,tool:Tool){return tools.has(tool)&&![...city.transit.operations.buses.values()].some(bus=>bus.state!=='garage');}
 record(city:City,before:CityState,label:string){
  const after=city.snapshot(),a=encoded(before),b=encoded(after);if(a===b)return false;
  if(before.month!==after.month||running(before)||running(after)){this.clear('月次進行・運行中の便を含む操作は取り消せません。');return false;}
  if(this.owner!==city||(this.expected&&this.expected!==a))this.clear();this.owner=city;
  const bytes=(a.length+b.length)*2;if(bytes>16*1024*1024){this.clear('取り消し用メモリーの上限を超えました。');return false;}
  this.bytes-=this.redoEntries.reduce((n,e)=>n+e.bytes,0);this.redoEntries=[];
  while(this.entries.length&&(this.entries.length>=20||this.bytes+bytes>16*1024*1024))this.bytes-=this.entries.shift()!.bytes;
  this.entries.push({before:structuredClone(before),after:structuredClone(after),label,bytes});this.bytes+=bytes;this.expected=b;this.reason='再生・設定変更・読込で履歴を終了します。';return true;
 }
 private check(city:City){if(!this.owner)return false;if(this.owner!==city||city.updating||encoded(city.snapshot())!==this.expected){this.clear();return false;}return true;}
 available(city:City){return this.check(city)&&this.entries.length>0;}
 redoAvailable(city:City){return this.check(city)&&this.redoEntries.length>0;}
 get label(){return this.entries.at(-1)?.label??'';}
 get redoLabel(){return this.redoEntries.at(-1)?.label??'';}
 private restore(city:City,redo:boolean){
  if(!(redo?this.redoAvailable(city):this.available(city)))return;
  const source=redo?this.redoEntries:this.entries,target=redo?this.entries:this.redoEntries,entry=source.at(-1)!;
  const next=City.fromState(redo?entry.after:entry.before);source.pop();target.push(entry);this.owner=next;this.expected=encoded(next.snapshot());this.reason=redo?'操作をやり直しました。':'操作を取り消しました。';return next;
 }
 undo(city:City){return this.restore(city,false);}
 redo(city:City){return this.restore(city,true);}
}
