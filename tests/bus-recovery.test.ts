import {roadLanes} from '../src/traffic/RoadLanes';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {CityJobs} from '../src/simulation/CityJobs';
import {purchaseBus} from '../src/transit/BusEditor';
import {buildLaneJourney,laneVehicle} from '../src/traffic/LanePath';
import {validateSave} from '../src/save/schema';
import type {BusRun} from '../src/transit/BusOperations';

function fixture(size=64){
  const city=City.create(size),m=size/2,cell=(x:number,z:number)=>({x,z});
  for(const [x,z,X,Z] of [[m-6,m-4,m+6,m-4],[m-6,m+3,m+6,m+3],[m-6,m-4,m-6,m+3],[m+6,m-4,m+6,m+3]])city.apply(cell(x,z),cell(X,Z),'road');
  for(const [x,z,h] of [[m-6,m+1,0],[m+3,m+3,3],[m+6,m-1,2]]){city.apply(cell(x,z),cell(x,z),'bus-stop');city.transit.stopAt(z*size+x)!.heading=h;}
  city.apply(cell(m-7,m-2),cell(m-7,m-2),'depot');
  const ops=city.transit.operations,depot=(m-2)*size+m-7,stops=[...city.transit.stops.keys()];
  purchaseBus(city,depot);purchaseBus(city,depot);
  const route=ops.save('復旧テスト',stops,2,depot,3,'#58d9bc');ops.start(route.id);ops.stop(route.id);
  const bus=[...ops.buses.values()][0];
  return {city,ops,bus,route,m,cell};
}
function pose(city:City,b:BusRun){const j=buildLaneJourney(b.path,city.size,city.transit.operations.roadMinutes,new Map(b.stops.map(s=>[s.index,city.transit.config.dwellMinutes])),id=>city.network.adjacent(id).length>=3,roadLanes(city.network));return laneVehicle(j.loop,b.phase,b.id,'bus',b.clock);}
function assertUnchanged(f:ReturnType<typeof fixture>,action:()=>void){const before=f.city.snapshot();assert.throws(action);assert.deepEqual(f.city.snapshot(),before);}

for(const size of [64,128,256]){
  test(`recovery ${size}: preserves run identity passengers progress money and other bus`,()=>{
    const f=fixture(size),b=f.bus;b.phase=.1;b.clock=12;b.state='error';b.error='legacy wait';b.onboard=5;b.boarded=7;b.alighted=2;b.passengers=[[b.stops[1].id,5]];
    const old=structuredClone(b),before=f.city.snapshot(),other=structuredClone([...f.ops.buses.values()][1]),position=pose(f.city,b);
    f.ops.recoverBus(b.id);
    assert.equal(f.ops.buses.get(b.id),b);assert.equal(b.state,'paused');assert.equal(b.error,'');
    for(const k of ['id','route','depot','lap','tripLaps','clock','nextEvent','onboard','boarded','alighted','delay'] as const)assert.deepEqual(b[k],old[k]);
    assert.deepEqual(b.passengers,old.passengers);assert.deepEqual([...f.ops.buses.values()][1],other);
    assert.equal(f.city.funds,before.funds);assert.equal(f.city.month,before.month);
    const after=pose(f.city,b);assert.ok(Math.hypot(position.x-after.x,position.z-after.z)<1e-8);assert.equal(after.angle,position.angle);
  });

  test(`recovery ${size}: detours around a removed road without restarting the trip`,()=>{
    const f=fixture(size),{m,cell}=f;f.bus.phase=.1;const oldPath=[...f.bus.path],oldPose=pose(f.city,f.bus);
    f.city.apply(cell(m-1,m-5),cell(m+1,m-5),'road');
    f.city.apply(cell(m-1,m-5),cell(m-1,m-4),'road');f.city.apply(cell(m+1,m-5),cell(m+1,m-4),'road');
    f.city.apply(cell(m,m-4),cell(m,m-4),'erase');
    f.ops.recoverBus(f.bus.id);
    assert.notDeepEqual(f.bus.path,oldPath);assert.ok(!f.bus.path.includes((m-4)*size+m));
    assert.equal(f.bus.state,'paused');const now=pose(f.city,f.bus);assert.ok(Math.hypot(now.x-oldPose.x,now.z-oldPose.z)<1e-8);
    f.ops.resumeBus(f.bus.id);assert.equal(f.bus.state,'travel');
  });

  test(`recovery ${size}: v4/v5 save roundtrip and explicit resume complete three laps`,()=>{
    for(const version of [4,5] as const){const f=fixture(size);if(version===5)f.city.enableWaterUtility();
      f.bus.phase=.1;f.ops.recoverBus(f.bus.id);
      const data=validateSave({version,savedAt:'2026-10-17',city:f.city.snapshot(),clock:{speed:0,accumulated:0}});
      const loaded=City.fromState(data.city);assert.deepEqual(loaded.snapshot(),f.city.snapshot());
      const ops=loaded.transit.operations;ops.resumeBus(f.bus.id);
      for(let i=0;i<10000&&ops.buses.get(f.bus.id)!.state!=='garage';i++)ops.advance(.1);
      const bus=ops.buses.get(f.bus.id)!;assert.equal(bus.state,'garage');assert.equal(bus.lap,3);
    }
  });
}

test('missing run and missing route are no-op failures',()=>{
  const f=fixture();assertUnchanged(f,()=>f.ops.recoverBus('missing'));
  f.ops.routes.delete(f.route.id);assertUnchanged(f,()=>f.ops.recoverBus(f.bus.id));
});
test('active and parked runs cannot be rerouted',()=>{
  const f=fixture();for(const state of ['travel','garage'] as const){f.bus.state=state;assertUnchanged(f,()=>f.ops.recoverBus(f.bus.id));}
});
test('disconnected road and changed itinerary refuse recovery without mutation',()=>{
  const f=fixture();f.city.apply(f.cell(f.m-6,f.m-2),f.cell(f.m-6,f.m-2),'erase');assertUnchanged(f,()=>f.ops.recoverBus(f.bus.id));
  const g=fixture();g.city.transit.routes.get(g.route.id)!.stops.reverse();assertUnchanged(g,()=>g.ops.recoverBus(g.bus.id));
});
test('planning exception and late save validation failure do not commit partial changes',()=>{
  const f=fixture(),plan=f.ops.plan;f.ops.plan=()=>{throw Error('injected planning failure');};assertUnchanged(f,()=>f.ops.recoverBus(f.bus.id));f.ops.plan=plan;
  f.bus.passengers=[[f.bus.stops[0].id,0]];assertUnchanged(f,()=>f.ops.recoverBus(f.bus.id));
});
test('unmappable progress and missing or unsafe resume are no-op failures',()=>{
  const f=fixture();f.bus.phase=1e8;assertUnchanged(f,()=>f.ops.recoverBus(f.bus.id));
  assertUnchanged(f,()=>f.ops.resumeBus('missing'));f.bus.state='error';assertUnchanged(f,()=>f.ops.resumeBus(f.bus.id));
});
test('recovery commits through the existing CityJobs infrastructure transaction',async()=>{
  const f=fixture(),jobs=new CityJobs(f.city);f.bus.state='error';let error:unknown='not called';
  jobs.infrastructure(c=>c.transit.operations.recoverBus(f.bus.id),e=>{error=e;});await jobs.idle();
  assert.equal(error,undefined);assert.equal(jobs.city.transit.operations.buses.get(f.bus.id)!.state,'paused');
});

test('mid-trip recovery keeps already-served events lap and exact lane position',()=>{
  const f=fixture();f.ops.resumeBus(f.bus.id);
  for(let i=0;i<1000&&f.bus.nextEvent<3;i++)f.ops.advance(.1);
  f.ops.stop(f.route.id);assert.ok(f.bus.nextEvent>=3);
  const before=structuredClone(f.bus),position=pose(f.city,f.bus);
  f.ops.recoverBus(f.bus.id);
  assert.equal(f.bus.nextEvent,before.nextEvent);assert.equal(f.bus.lap,before.lap);
  const after=pose(f.city,f.bus);assert.ok(Math.hypot(after.x-position.x,after.z-position.z)<1e-8);
});

test('resume rejects invalid phase and passenger data without changing the run',()=>{
  const f=fixture();f.bus.phase=f.bus.path.length*2;assertUnchanged(f,()=>f.ops.resumeBus(f.bus.id));
  f.bus.phase=.1;f.bus.passengers=[[f.bus.stops[0].id,0]];assertUnchanged(f,()=>f.ops.resumeBus(f.bus.id));
});

for(const size of [64,128,256])test(`resumed service ${size}: independent progress arrival boarding laps and return`,()=>{
  const f=fixture(size),buses=[...f.ops.buses.values()],from=f.bus.stops[0].id,to=f.bus.stops[1].id;
  f.city.transit.passengerFlows.set('qa-demand',{route:f.route.id,from,to,count:48});
  for(const bus of buses)f.ops.recoverBus(bus.id);
  const waiting=structuredClone(buses[1]);f.ops.resumeBus(buses[0].id);
  for(let i=0;i<80;i++)f.ops.advance(.05);
  assert.ok(buses[0].phase>0);assert.equal(buses[1].phase,waiting.phase);
  assert.equal(buses[1].clock,waiting.clock);assert.equal(buses[1].nextEvent,waiting.nextEvent);
  assert.equal(buses[1].delay,waiting.delay);assert.equal(buses[1].state,'paused');
  f.ops.resumeBus(buses[1].id);
  const funds=f.city.funds,states=buses.map(b=>new Set<string>([b.state]));
  const progress=buses.map(b=>({phase:b.phase,event:b.nextEvent,lap:b.lap,clock:b.clock}));
  let ticks=0;
  for(;ticks<20000&&!buses.every(b=>b.state==='garage');ticks++){
    f.ops.advance(.05);
    buses.forEach((bus,i)=>{
      states[i].add(bus.state);const previous=progress[i];
      assert.ok(bus.phase>=previous.phase);assert.ok(bus.clock>=previous.clock);
      assert.ok(bus.nextEvent>=previous.event);assert.ok(bus.lap>=previous.lap);
      assert.equal(bus.boarded-bus.alighted,bus.onboard);
      assert.equal((bus.passengers??[]).reduce((n,[,count])=>n+count,0),bus.onboard);
      assert.ok(bus.onboard<=f.city.transit.config.seats);
      if(bus.nextEvent>previous.event){
        assert.equal(bus.lap,bus.stops[bus.nextEvent-1].lap);
        assert.ok(['stopped','boarding','travel','returning','garage'].includes(bus.state));
      }
      progress[i]={phase:bus.phase,event:bus.nextEvent,lap:bus.lap,clock:bus.clock};
    });
  }
  assert.ok(ticks<20000,'both resumed buses must return within the bounded run');
  for(let i=0;i<buses.length;i++){
    const bus=buses[i];for(const state of ['departing','travel','stopped','boarding','returning','garage'])assert.ok(states[i].has(state),`bus ${i} missing ${state}`);
    assert.equal(bus.nextEvent,bus.stops.length);assert.equal(bus.lap,3);assert.equal(bus.state,'garage');
    assert.equal(bus.boarded,18);assert.equal(bus.alighted,18);assert.equal(bus.onboard,0);assert.deepEqual(bus.passengers,[]);assert.equal(bus.error,'');
  }
  assert.equal(f.ops.routes.get(f.route.id)!.enabled,false);assert.equal(f.city.funds,funds);
});

test('diagnostics distinguish depot, stop and unknown route gaps without guessing repair cells',()=>{
  for(const issue of ['depot','stop','gap'] as const){
    const f=fixture(),road=issue==='depot'?f.ops.depots.get(f.bus.depot)!.road:issue==='stop'?f.city.transit.stops.get(f.route.stops[0])!.road:(f.m-4)*f.city.size+f.m;
    const cell={x:road%f.city.size,z:Math.floor(road/f.city.size)};
    f.city.apply(cell,cell,'erase');
    if(issue==='gap')f.city.apply({x:f.m,z:f.m+3},{x:f.m,z:f.m+3},'erase');
    const before=f.city.snapshot(),result=f.ops.previewBusRecovery(f.bus.id);
    assert.equal(result.possible,false);
    assert.equal(result.diagnostic.code,issue==='depot'?'depot-road':issue==='stop'?'stop-road':'route-path');
    if(issue==='gap')assert.deepEqual(result.diagnostic.locations,[]);
    else assert.deepEqual(result.diagnostic.locations,[{kind:'road',label:issue==='depot'?'車庫の接続道路':'停留所の道路',...cell}]);
    assert.deepEqual(f.city.snapshot(),before);
  }
});

test('an unmappable bus position identifies its original road and preserves the saved run',()=>{
  const f=fixture(),{m,cell}=f,road=(m-4)*f.city.size+m;
  const journey=buildLaneJourney(f.bus.path,f.city.size,f.ops.roadMinutes,new Map(f.bus.stops.map(s=>[s.index,f.city.transit.config.dwellMinutes])),id=>f.city.network.adjacent(id).length>=3,roadLanes(f.city.network));
  const piece=journey.loop.pieces.find(p=>p.curve.road===road)!;assert.ok(piece);
  f.bus.phase=(piece.start+piece.end)/2;
  f.bus.nextEvent=f.bus.stops.filter(s=>journey.arrivals.get(s.index)!<=f.bus.phase).length;
  f.bus.lap=f.bus.nextEvent?f.bus.stops[f.bus.nextEvent-1].lap:0;
  f.city.apply(cell(m-1,m-5),cell(m+1,m-5),'road');
  f.city.apply(cell(m-1,m-5),cell(m-1,m-4),'road');f.city.apply(cell(m+1,m-5),cell(m+1,m-4),'road');
  f.city.apply(cell(m,m-4),cell(m,m-4),'erase');
  const before=f.city.snapshot(),result=f.ops.previewBusRecovery(f.bus.id);
  assert.equal(result.possible,false);assert.equal(result.diagnostic.code,'position');
  assert.deepEqual(result.diagnostic.locations,[{kind:'road',label:'便の現在位置の道路',x:m,z:m-4}]);
  assert.deepEqual(f.city.snapshot(),before);
});
