import {City,type Tool} from './City';
import type {CityState} from '../save/schema';

const tools=new Set<Tool>(['road','residential','commercial','industrial','erase']);
const encoded=(state:CityState)=>JSON.stringify(state);
interface Entry {before:CityState;after:string;label:string;bytes:number}
/** Session-only, whole-operation history. Never crosses a simulation or policy change. */
export class BuildHistory {
  private entries:Entry[]=[];
  private owner:City|undefined;
  private bytes=0;
  reason='道路・区画の建設と撤去を戻せます。';
  clear(reason='時間の進行・別の操作・都市切替で履歴を終了しました。'){
    this.entries=[];this.bytes=0;this.owner=undefined;this.reason=reason;
  }
  supports(city:City,tool:Tool){
    return tools.has(tool)&&![...city.transit.operations.buses.values()].some(bus=>bus.state!=='garage');
  }
  record(city:City,before:CityState,label:string){
    if([...city.transit.operations.buses.values()].some(bus=>bus.state!=='garage')){this.clear('運行中の便がある都市は取り消し対象外です。');return false;}
    const after=city.snapshot(),a=encoded(before),b=encoded(after);
    if(a===b)return false;
    // Facilities/stops must not be silently resurrected, even within a mixed drag.
    const facilities=(s:CityState)=>JSON.stringify([s.cells.filter(c=>c.facility),s.transit,s.safety,s.wellness,s.energy,s.sanitation,s.waterUtility,s.hydrology,s.budget,s.taxRate,s.management]);
    if(before.month!==after.month||facilities(before)!==facilities(after)){
      this.clear('施設・停留所の変更や月次更新を含む操作は取り消せません。');return false;
    }
    if(this.owner!==city){this.clear();this.owner=city;}
    if(this.entries.length&&this.entries.at(-1)!.after!==a)this.clear();
    this.owner=city;
    const bytes=(a.length+b.length)*2;
    if(bytes>16*1024*1024){this.clear('この都市の操作は取り消し用メモリーの上限を超えました。');return false;}
    while(this.entries.length&&(this.entries.length>=20||this.bytes+bytes>16*1024*1024))this.bytes-=this.entries.shift()!.bytes;
    this.entries.push({before:structuredClone(before),after:b,label,bytes});this.bytes+=bytes;this.reason='時間を進めるか別の設定を変更するまで取り消せます。';return true;
  }
  available(city:City){
    if(this.owner&&this.owner!==city){this.clear();return false;}
    const last=this.entries.at(-1);if(!last)return false;
    if(city.updating||encoded(city.snapshot())!==last.after){this.clear();return false;}
    return true;
  }
  get label(){return this.entries.at(-1)?.label??'';}
  undo(city:City):City|undefined {
    if(!this.available(city))return;
    const entry=this.entries.at(-1)!;
    // Construct first: a validation failure leaves the live city and the history intact.
    const next=City.fromState(entry.before);
    this.entries.pop();this.bytes-=entry.bytes;this.owner=next;
    // Restore can normalize ordering without changing gameplay; use its actual representation.
    if(this.entries.length)this.entries.at(-1)!.after=encoded(next.snapshot());
    this.reason='操作を取り消しました。';return next;
  }
}
