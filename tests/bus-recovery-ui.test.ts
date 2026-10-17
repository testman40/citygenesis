import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {CityJobs} from '../src/simulation/CityJobs';
import {purchaseBus} from '../src/transit/BusEditor';
import {BusRecoveryUI,type RecoveryExecutor} from '../src/transit/BusRecoveryUI';
import {RECOVERY_HTML} from '../src/transit/BusRecoveryPanel';
import type {BusOperations} from '../src/transit/BusOperations';

function fixture(){
  const city=City.create(64),cell=(x:number,z:number)=>({x,z});
  for(const [x,z,X,Z] of [[26,28,38,28],[26,35,38,35],[26,28,26,35],[38,28,38,35]])city.apply(cell(x,z),cell(X,Z),'road');
  for(const [x,z,h] of [[26,33,0],[35,35,3],[38,31,2]]){city.apply(cell(x,z),cell(x,z),'bus-stop');city.transit.stopAt(z*64+x)!.heading=h;}
  city.apply(cell(25,30),cell(25,30),'depot');const ops=city.transit.operations,depot=30*64+25;
  purchaseBus(city,depot);purchaseBus(city,depot);
  const route=ops.save('復旧対象路線',[...city.transit.stops.keys()],2,depot,3,'#58d9bc');ops.start(route.id);ops.stop(route.id);
  const buses=[...ops.buses.values()];
  const execute:RecoveryExecutor=(action,done)=>{try{action(ops);done();}catch(error){done(error);}};
  return {city,ops,buses,route,model:new BusRecoveryUI(()=>ops,execute)};
}

test('recovery UI lists only paused/error runs and requires explicit selection',()=>{
  const f=fixture();f.buses[1].state='error';const before=f.city.snapshot(),rows=f.model.rows();
  assert.equal(rows.length,2);assert.ok(rows.every(row=>row.possible));assert.match(rows[0].label,/復旧対象路線/);
  assert.equal(f.model.selectedId,undefined);f.model.recoverAndResume();assert.equal(f.model.status,'error');assert.match(f.model.message,/選択/);
  assert.deepEqual(f.city.snapshot(),before);
});

test('recovery UI displays unavailable reasons without changing save data',()=>{
  const f=fixture();f.city.apply({x:26,z:30},{x:26,z:30},'erase');const before=f.city.snapshot();
  const rows=f.model.rows();assert.ok(rows.every(row=>!row.possible&&row.reason.length>0));
  f.model.select(f.buses[0].id);f.model.recoverAndResume();assert.equal(f.model.status,'error');assert.match(f.model.message,/道路|接続/);
  assert.deepEqual(f.city.snapshot(),before);
});

test('recovery UI resumes only selected run and removes its recovery controls',()=>{
  const f=fixture(),target=f.buses[1],other=structuredClone(f.buses[0]);f.model.select(target.id);
  f.model.recoverAndResume();assert.equal(f.model.status,'success');assert.match(f.model.message,/この便だけ運行を再開/);assert.ok(f.model.message.includes(target.id));
  assert.equal(target.state,'travel');assert.deepEqual(f.buses[0],other);
  assert.deepEqual(f.model.rows().map(row=>row.id),[other.id]);assert.equal(f.model.selectedId,undefined);
});

test('normally running and parked runs cannot be selected for recovery',()=>{
  const f=fixture();for(const state of ['departing','travel','stopped','boarding','returning','garage'] as const){
    f.buses[0].state=state;assert.ok(!f.model.rows().some(row=>row.id===f.buses[0].id));
    f.model.select(f.buses[0].id);assert.equal(f.model.selectedId,undefined);assert.equal(f.model.status,'error');
  }
});

test('missing selected run gives Japanese failure and no change to another run',()=>{
  const f=fixture();f.model.select(f.buses[0].id);f.ops.buses.delete(f.buses[0].id);const before=f.city.snapshot();
  f.model.recoverAndResume();assert.equal(f.model.status,'error');assert.match(f.model.message,/選択/);assert.deepEqual(f.city.snapshot(),before);
});

test('queued UI action captures its target and blocks duplicate clicks/selection changes',()=>{
  const f=fixture();let action:((ops:BusOperations)=>void)|undefined,finish:((error?:unknown)=>void)|undefined,calls=0;
  const model=new BusRecoveryUI(()=>f.ops,(a,d)=>{calls++;action=a;finish=d;});
  model.select(f.buses[0].id);model.recoverAndResume();assert.equal(model.status,'pending');
  model.select(f.buses[1].id);model.recoverAndResume();assert.equal(calls,1);assert.equal(model.selectedId,f.buses[0].id);
  action!(f.ops);finish!();assert.equal(model.status,'success');assert.equal(f.buses[0].state,'travel');assert.equal(f.buses[1].state,'paused');
});

test('queued UI action rejects a changed run without partial recovery',()=>{
  const f=fixture();let action:((ops:BusOperations)=>void)|undefined,finish:((error?:unknown)=>void)|undefined;
  const model=new BusRecoveryUI(()=>f.ops,(a,d)=>{action=a;finish=d;});model.select(f.buses[0].id);model.recoverAndResume();
  f.buses[0].clock=1;const before=f.city.snapshot();let failure:unknown;
  try{action!(f.ops);}catch(error){failure=error;}finish!(failure);
  assert.equal(model.status,'error');assert.match(model.message,/状態が変わった/);assert.deepEqual(f.city.snapshot(),before);
});

test('changing cities cancels queued recovery even if the new city has the same bus ID',()=>{
  const f=fixture(),other=fixture();let current=f.ops,action:((ops:BusOperations)=>void)|undefined,finish:((error?:unknown)=>void)|undefined;
  const model=new BusRecoveryUI(()=>current,(a,d)=>{action=a;finish=d;});model.select(f.buses[0].id);model.recoverAndResume();
  current=other.ops;model.sync();const before=current.snapshot();let failure:unknown;
  try{action!(current);}catch(error){failure=error;}finish!(failure);
  assert.ok(failure);assert.equal(model.status,'idle');assert.equal(model.selectedId,undefined);assert.deepEqual(current.snapshot(),before);
});

test('candidate operations may replace the live operations within the same city scope',()=>{
  const f=fixture();const scope={};let current=f.ops;
  const model=new BusRecoveryUI(()=>current,(action,done)=>{
    const next=City.fromState(f.city.snapshot());action(next.transit.operations);current=next.transit.operations;done();
  },()=>scope);
  model.select(f.buses[0].id);model.recoverAndResume();assert.equal(model.status,'success');assert.equal(current.buses.get(f.buses[0].id)!.state,'travel');
});

test('executor failures show Japanese feedback and preserve data',()=>{
  const f=fixture(),before=f.city.snapshot();const model=new BusRecoveryUI(()=>f.ops,()=>{throw Error('復旧処理を中止しました');});
  model.select(f.buses[0].id);model.recoverAndResume();assert.equal(model.status,'error');assert.match(model.message,/中止/);assert.deepEqual(f.city.snapshot(),before);
});

test('preview and combined operation share validation; invalid candidates never commit',()=>{
  const f=fixture();f.buses[0].passengers=[[f.buses[0].stops[0].id,0]];const before=f.city.snapshot();
  const result=f.ops.previewBusRecovery(f.buses[0].id);assert.equal(result.possible,false);assert.match(result.reason,/保存データ/);
  assert.throws(()=>f.ops.recoverAndResumeBus(f.buses[0].id));assert.deepEqual(f.city.snapshot(),before);
});

test('UI command works through actual CityJobs and reports completion',async()=>{
  const f=fixture(),jobs=new CityJobs(f.city);const model=new BusRecoveryUI(()=>jobs.city.transit.operations,(action,done)=>jobs.infrastructure(city=>action(city.transit.operations),done),()=>jobs.city);
  model.select(f.buses[0].id);model.recoverAndResume();await jobs.idle();assert.equal(model.status,'success');assert.equal(jobs.city.transit.operations.buses.get(f.buses[0].id)!.state,'travel');
});

test('recovery markup exposes labelled selection and live feedback with controls initially hidden',()=>{
  assert.match(RECOVERY_HTML,/label for="bus-recovery-select"/);assert.match(RECOVERY_HTML,/id="bus-recovery-run" disabled hidden/);
  assert.match(RECOVERY_HTML,/role="status" aria-live="polite"/);assert.match(RECOVERY_HTML,/再経路化してこの便だけ再開/);
});

test('selected run availability feedback follows road changes without stale success text',()=>{
  const f=fixture();f.model.select(f.buses[0].id);assert.equal(f.model.status,'idle');assert.match(f.model.message,/復旧できます/);
  f.city.apply({x:26,z:30},{x:26,z:30},'erase');f.model.rows();
  assert.equal(f.model.status,'error');assert.match(f.model.message,/道路|接続/);
  f.city.apply({x:26,z:30},{x:26,z:30},'road');f.model.rows();
  assert.equal(f.model.status,'idle');assert.match(f.model.message,/復旧できます/);
});

test('selection becoming active clears both target and outdated availability message',()=>{
  const f=fixture();f.model.select(f.buses[0].id);f.ops.resumeBus(f.buses[0].id);f.model.rows();
  assert.equal(f.model.selectedId,undefined);assert.equal(f.model.status,'error');assert.match(f.model.message,/状態が変わった/);
});

test('late duplicate completion cannot overwrite a newer pending request',()=>{
  const f=fixture(),pending:{action:(ops:BusOperations)=>void;done:(error?:unknown)=>void}[]=[];
  const model=new BusRecoveryUI(()=>f.ops,(action,done)=>pending.push({action,done}));
  model.select(f.buses[0].id);model.recoverAndResume();pending[0].done(Error('最初の処理を中止'));
  model.select(f.buses[1].id);model.recoverAndResume();assert.equal(model.status,'pending');
  pending[0].done();assert.equal(model.status,'pending');assert.equal(model.selectedId,f.buses[1].id);
  pending[1].action(f.ops);pending[1].done();assert.equal(model.status,'success');assert.ok(model.message.includes(f.buses[1].id));
});

test('queued road failure preserves passengers accounts and all runs then permits retry after repair',()=>{
  const f=fixture(),bus=f.buses[0];bus.passengers=[[bus.stops[1].id,5]];bus.onboard=5;bus.boarded=7;bus.alighted=2;
  let action:((ops:BusOperations)=>void)|undefined,done:((error?:unknown)=>void)|undefined;
  const model=new BusRecoveryUI(()=>f.ops,(a,d)=>{action=a;done=d;});
  model.select(bus.id);model.recoverAndResume();f.city.apply({x:26,z:30},{x:26,z:30},'erase');
  const before=f.city.snapshot();let error:unknown;try{action!(f.ops);}catch(e){error=e;}done!(error);
  assert.ok(error);assert.equal(model.status,'error');assert.deepEqual(f.city.snapshot(),before);
  f.city.apply({x:26,z:30},{x:26,z:30},'road');model.select(bus.id);model.recoverAndResume();action!(f.ops);done!();
  assert.equal(model.status,'success');assert.equal(bus.onboard,5);assert.equal(bus.boarded,7);assert.equal(bus.alighted,2);
});

test('success feedback survives city refresh but never leaks to a different city',()=>{
  const f=fixture(),other=fixture();let current=f.ops;
  const model=new BusRecoveryUI(()=>current,(action,done)=>{try{action(current);done();}catch(error){done(error);}});
  model.select(f.buses[0].id);model.recoverAndResume();const success=model.message;model.rows();assert.equal(model.message,success);
  current=other.ops;model.rows();assert.equal(model.status,'idle');assert.equal(model.selectedId,undefined);assert.match(model.message,/選択/);
});

test('preview and execution agree after repeated road edits and all failure snapshots are unchanged',()=>{
  const f=fixture(),bus=f.buses[0];bus.passengers=[[bus.stops[1].id,4]];bus.onboard=4;bus.boarded=6;bus.alighted=2;
  for(const connected of [false,true,false,true]){
    f.city.apply({x:26,z:30},{x:26,z:30},connected?'road':'erase');
    const before=f.city.snapshot(),preview=f.ops.previewBusRecovery(bus.id);assert.deepEqual(f.city.snapshot(),before);assert.equal(preview.possible,connected);
    if(!connected){assert.throws(()=>f.ops.recoverAndResumeBus(bus.id));assert.deepEqual(f.city.snapshot(),before);}
  }
  f.ops.recoverAndResumeBus(bus.id);assert.equal(bus.state,'travel');assert.equal(bus.onboard,4);
});

test('completed or already executed queued actions cannot modify a run twice',()=>{
  const f=fixture();let action:((ops:BusOperations)=>void)|undefined,done:((error?:unknown)=>void)|undefined;
  const model=new BusRecoveryUI(()=>f.ops,(a,d)=>{action=a;done=d;});model.select(f.buses[0].id);model.recoverAndResume();
  action!(f.ops);const before=f.city.snapshot();assert.throws(()=>action!(f.ops),/実行済み/);assert.deepEqual(f.city.snapshot(),before);
  done!();assert.throws(()=>action!(f.ops),/完了済み/);assert.deepEqual(f.city.snapshot(),before);
});

test('road edits then state change then city switch invalidate a queued command without touching either city',()=>{
  const f=fixture(),other=fixture();let current=f.ops,action:((ops:BusOperations)=>void)|undefined,done:((error?:unknown)=>void)|undefined;
  const model=new BusRecoveryUI(()=>current,(a,d)=>{action=a;done=d;});model.select(f.buses[0].id);model.recoverAndResume();
  f.city.apply({x:26,z:30},{x:26,z:30},'erase');model.rows();f.city.apply({x:26,z:30},{x:26,z:30},'road');
  f.ops.resumeBus(f.buses[0].id);model.rows();current=other.ops;model.rows();
  const beforeOld=f.city.snapshot(),beforeNew=other.city.snapshot();let error:unknown;
  try{action!(current);}catch(e){error=e;}done!(error);
  assert.ok(error);assert.equal(model.status,'idle');assert.equal(model.selectedId,undefined);
  assert.deepEqual(f.city.snapshot(),beforeOld);assert.deepEqual(other.city.snapshot(),beforeNew);
});

test('diagnosed road can be located without mutating city and disappears after repair',()=>{
  const f=fixture(),bus=f.buses[0],depot=f.ops.depots.get(bus.depot)!,road=depot.road;
  const cell={x:road%f.city.size,z:Math.floor(road/f.city.size)};
  f.city.apply(cell,cell,'erase');f.model.select(bus.id);
  const before=f.city.snapshot();
  assert.deepEqual(f.model.location(0),{kind:'road',label:'車庫の接続道路',...cell});
  assert.deepEqual(f.city.snapshot(),before);
  for(const index of [-1,0.5,999,NaN])assert.equal(f.model.location(index),undefined);
  f.city.apply(cell,cell,'road');
  assert.equal(f.model.location(0),undefined);
});

test('location controls cannot follow an old target after a city switch or during recovery',()=>{
  const f=fixture(),g=fixture();let current=f.ops;
  const model=new BusRecoveryUI(()=>current,()=>{},()=>current);
  const road=f.ops.depots.get(f.buses[0].depot)!.road,cell={x:road%f.city.size,z:Math.floor(road/f.city.size)};
  f.city.apply(cell,cell,'erase');model.select(f.buses[0].id);assert.ok(model.location(0));
  current=g.ops;assert.equal(model.location(0),undefined);assert.equal(model.selectedId,undefined);
  current=f.ops;f.city.apply(cell,cell,'road');model.select(f.buses[0].id);model.recoverAndResume();
  assert.equal(model.status,'pending');f.city.apply(cell,cell,'erase');assert.equal(model.location(0),undefined);
});
