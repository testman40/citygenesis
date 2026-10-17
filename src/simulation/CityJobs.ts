import {gridStroke} from './GridInput';
import {yieldInfrastructure} from '../transit/yieldTask';
import {roadState,type RoadRequest,roadCells} from '../roads/plan';
import {roadEdit,commitRoad} from '../roads/execute';
import type {Sector} from '../budget/Budget';
import {City,type Cell,type Tool} from './City';import type {CityState} from '../save/schema';
/** Serial monthly transaction; input is replayed after the accounting month commits. */
export class CityJobs {
 private lastEditKey:string|null=null;
 private commands:((city:City)=>void|Promise<void>)[]=[];private epoch=0;private abort:AbortController|null=null;private running:Promise<void>|null=null;private stable:CityState|null=null;private display:City|null=null;
 constructor(public city:City,private changed:(city:City)=>void=()=>{},private notify:(error?:unknown)=>void=()=>{}){}
 get busy(){return this.running!==null;}
 get queuedEdits(){return this.commands.length;}
 get displayCity(){return this.city.updating&&this.display?this.display:this.city;}
 snapshot(){return this.busy&&this.stable?structuredClone(this.stable):this.city.snapshot();}
 month(force=false,mode?:"distance"|"time"){if(this.busy)return;const city=this.city;if(!mode&&!force&&!city.needsSlicedStep()){city.step();this.changed(this.city);return;}
  this.lastEditKey=null;const epoch=this.epoch;this.stable=city.snapshot();this.display=Object.assign(Object.create(Object.getPrototypeOf(city)),city,{management:city.management?structuredClone(city.management):undefined,budget:Object.assign(Object.create(Object.getPrototypeOf(city.budget)),city.budget,{target:{...city.budget.target},funded:{...city.budget.funded},effective:{...city.budget.effective}}),demand:{...city.demand},waterUtility:city.waterUtility?.displaySnapshot(),sanitation:city.sanitation?.displaySnapshot(),energy:city.energy?.displaySnapshot(),hydrology:city.hydrology?.displaySnapshot(),wellness:city.wellness.displaySnapshot(),safety:Object.assign(Object.create(Object.getPrototypeOf(city.safety)),city.safety,{results:new Map(city.safety.results),stations:new Map(city.safety.stations)}),traffic:city.traffic.displaySnapshot(),transit:city.transit.displaySnapshot()});
  this.abort=new AbortController();this.notify();
  const job=async()=>{try{await city.stepAsync({signal:this.abort!.signal},mode);if(epoch!==this.epoch)return;this.changed(this.city);while(this.commands.length&&epoch===this.epoch){await this.commands.shift()!(city);this.changed(this.city);await new Promise<void>(resolve=>setTimeout(resolve,0));}}
   catch(error){if(epoch===this.epoch){const recovered=await City.fromStateAsync(this.stable!);if(epoch!==this.epoch)return;this.city=recovered;this.commands=[];this.lastEditKey=null;this.changed(this.city);this.notify(error);}}
   finally{if(epoch===this.epoch){this.running=null;this.lastEditKey=null;this.abort=null;this.stable=null;this.display=null;this.notify();}}};this.running=job();this.notify();
 }
 roads(request:RoadRequest){const r=structuredClone(request);const command=async(city:City)=>{const epoch=this.epoch;try{const next=await roadEdit(city,r,this.abort?.signal);if(epoch!==this.epoch)return;commitRoad(city,next);}catch(e){if(epoch===this.epoch)this.notify(e);}};
 if(this.busy){this.commands.push(command);this.notify();return;}
 const ids=[...roadCells(this.city.size,r)];if(ids.length===1){const c={x:ids[0]%this.city.size,z:Math.floor(ids[0]/this.city.size)};if(!r.remove||this.city.hasRoad(c))this.edit(c,c,r.remove?'erase':'road');return;}
 if(ids.length<=256&&this.city.roadCount<1024&&this.city.buildingCount<128){try{const state=roadState(this.city.snapshot(),r).state;commitRoad(this.city,City.fromState(state,{allowPopulationChange:true}));this.changed(this.city);}catch(e){this.notify(e);}return;}
 const epoch=this.epoch;this.stable=this.city.snapshot();this.abort=new AbortController();const job=async()=>{try{await command(this.city);if(epoch!==this.epoch)return;this.changed(this.city);while(this.commands.length&&epoch===this.epoch){await this.commands.shift()!(this.city);if(epoch!==this.epoch)return;this.changed(this.city);await new Promise<void>(r=>setTimeout(r,0));}}catch(e){if(epoch===this.epoch){this.commands=[];this.notify(e);}}finally{if(epoch===this.epoch){this.running=null;this.stable=null;this.abort=null;this.notify();}}};this.running=job();this.notify();
 }
 stroke(from:Cell,to:Cell,tool:Tool){const a={...from},b={...to};if(tool==='erase'&&(this.city.energy||this.city.sanitation||this.city.waterUtility)&&[...gridStroke(a,b)].some(c=>{const f=this.displayCity.tile(c).facility;return f==='externalWater'||f==='wind'||f==='solar'||f==='power'||f==='sewage'||f==='advancedSewage'||f==='outfall'||f==='water';})){this.infrastructure(city=>city.waterWorks(a,b,'erase'));return;}this.enqueue(city=>city.applyStroke(a,b,tool),['stroke',tool,a.x,a.z,b.x,b.z].join(':'));}
 edit(from:Cell,to:Cell,tool:Tool){const a={...from},b={...to};this.enqueue(city=>city.apply(a,b,tool),[tool,a.x,a.z,b.x,b.z].join(":"));}
 readonly infrastructureProfile={cpuMs:0,maxSliceMs:0,slices:0,elapsedMs:0};
 infrastructure(command:(city:City)=>void,result?:(error?:unknown)=>void){
  if(this.city.buildingCount<128&&this.city.roadCount<1024&&(this.city.hydrology?.pipes.size??0)<=1024){this.enqueue(city=>{try{city.editTransit(command);result?.();}catch(error){if(result)result(error);else this.notify(error);}});return;}
  const action=async(city:City)=>{const epoch=this.epoch,started=performance.now();try{
   const next=await City.fromStateAsync(city.snapshot(),{signal:this.abort?.signal,configure:command,profile:this.infrastructureProfile,yieldTask:yieldInfrastructure});
   if(epoch!==this.epoch)return;const changes=city.roadDirtySteps(next);let done=false;while(!done){const begin=performance.now();do{if(this.abort?.signal.aborted||epoch!==this.epoch)return;done=!!changes.next().done;}while(!done&&performance.now()-begin<4);if(!done)await yieldInfrastructure();}
   for(const t of [city.transit,next.transit])for(const id of [...t.operations.depots.keys(),...[...t.stops.values()].map(s=>s.road)])next.dirty.add(Math.floor(id%next.size/16)+','+Math.floor(id/next.size/16));
   if(epoch!==this.epoch)return;commitRoad(city,next);this.infrastructureProfile.elapsedMs=performance.now()-started;result?.();
  }catch(error){if(epoch===this.epoch){if(result)result(error);else this.notify(error);}}};
  if(this.busy){this.commands.push(action);this.notify();return;}
  const epoch=this.epoch;this.stable=this.city.snapshot();this.abort=new AbortController();const job=async()=>{try{await action(this.city);if(epoch!==this.epoch)return;this.changed(this.city);while(this.commands.length&&epoch===this.epoch){await this.commands.shift()!(this.city);if(epoch!==this.epoch)return;this.changed(this.city);await new Promise<void>(r=>setTimeout(r,0));}}finally{if(epoch===this.epoch){this.running=null;this.stable=null;this.abort=null;this.notify();}}};this.running=job();this.notify();
 }
 busRoute(name:string,stops:number[],fleet:number,id?:number,result?:(error?:unknown)=>void){const order=[...stops];this.enqueue(city=>{try{city.setBusRoute(name,order,fleet,id);result?.();}catch(error){if(result)result(error);else this.notify(error);}});}
 removeBusRoute(id:number){this.enqueue(city=>city.removeBusRoute(id));}
 routing(mode:"distance"|"time"){if(!this.busy){this.month(true,mode);return;}this.enqueue(async city=>{this.stable=city.snapshot();this.display=Object.assign(Object.create(Object.getPrototypeOf(city)),city,{management:city.management?structuredClone(city.management):undefined,budget:Object.assign(Object.create(Object.getPrototypeOf(city.budget)),city.budget,{target:{...city.budget.target},funded:{...city.budget.funded},effective:{...city.budget.effective}}),demand:{...city.demand},waterUtility:city.waterUtility?.displaySnapshot(),sanitation:city.sanitation?.displaySnapshot(),energy:city.energy?.displaySnapshot(),hydrology:city.hydrology?.displaySnapshot(),wellness:city.wellness.displaySnapshot(),safety:Object.assign(Object.create(Object.getPrototypeOf(city.safety)),city.safety,{results:new Map(city.safety.results),stations:new Map(city.safety.stations)}),traffic:city.traffic.displaySnapshot(),transit:city.transit.displaySnapshot()});await city.stepAsync({signal:this.abort!.signal},mode);});}
 loan(){this.enqueue(city=>{try{city.emergencyLoan();}catch(error){this.notify(error);}});}
 budget(k:Sector,value:number){this.enqueue(city=>city.setBudget(k,value));}
 tax(value:number){this.enqueue(city=>city.setTaxRate(value));}
 private enqueue(command:(city:City)=>void|Promise<void>,key?:string){if(this.busy){if(key&&key===this.lastEditKey)return;this.lastEditKey=key??null;this.commands.push(command);this.notify();}else{this.lastEditKey=null;command(this.city);this.changed(this.city);}}
 async idle(){while(this.running)await this.running;}
 /** A successful load replaces the entire generation; no old edits can leak through. */
 replace(city:City){this.epoch++;this.abort?.abort();this.commands=[];this.lastEditKey=null;this.running=null;this.abort=null;this.stable=null;this.display=null;this.city=city;this.notify();}
}
