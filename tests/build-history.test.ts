import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {BuildHistory} from '../src/simulation/BuildHistory';
import {validateSave} from '../src/save/schema';
import {CityJobs} from '../src/simulation/CityJobs';
const c=(x:number,z=30)=>({x,z});

test('one road drag and zoning drag can be undone in order with their exact costs',()=>{
  let city=City.create(64);const history=new BuildHistory(),initial=city.snapshot();
  city.apply(c(20),c(25),'road');assert.ok(history.record(city,initial,'道路'));
  const roadState=city.snapshot();city.applyStroke(c(20,31),c(25,31),'residential');assert.ok(history.record(city,roadState,'住宅'));
  city=history.undo(city)!;assert.deepEqual(city.snapshot(),roadState);
  city=history.undo(city)!;assert.deepEqual(city.snapshot(),initial);
  assert.equal(history.undo(city),undefined);assert.equal(city.funds,initial.funds);
});

test('demolishing developed zones restores population, development order, road connections and saved format',()=>{
  let city=City.create(64);city.apply(c(20),c(25),'road');city.applyStroke(c(20,31),c(25,31),'residential');city.applyStroke(c(20,29),c(25,29),'industrial');
  for(let i=0;i<8;i++)city.step();
  const before=city.snapshot(),history=new BuildHistory();assert.ok(city.population>0);
  city.applyStroke(c(20,31),c(25,31),'erase');assert.ok(history.record(city,before,'撤去'));
  city=history.undo(city)!;assert.deepEqual(city.snapshot(),before);
  assert.deepEqual(validateSave({version:4,savedAt:'2026-10-18',city:city.snapshot(),clock:{speed:0,accumulated:0}}).city,before);
});

test('month, policy, city switch, and untracked edits each invalidate undo without mutating the city',()=>{
  for(const type of ['month','tax','switch','edit'] as const){
    let city=City.create(64);const history=new BuildHistory(),before=city.snapshot();city.apply(c(20),c(25),'road');history.record(city,before,'道路');
    if(type==='month')city.step();if(type==='tax')city.setTaxRate(1.5);if(type==='switch')city=City.fromState(city.snapshot());if(type==='edit')city.apply(c(24,31),c(24,31),'commercial');
    const current=city.snapshot();assert.equal(history.undo(city),undefined);assert.deepEqual(city.snapshot(),current);
  }
});

test('mixed demolition of facilities is never recorded and cannot resurrect facilities',()=>{
  const city=City.create(64),history=new BuildHistory();city.apply(c(20),c(25),'road');city.apply(c(22,31),c(22,31),'clinic');
  const before=city.snapshot();city.applyStroke(c(20,31),c(25,31),'erase');
  assert.equal(history.record(city,before,'撤去'),false);assert.equal(history.undo(city),undefined);assert.equal(city.wellness.facilities.size,0);
});

test('no-op does not consume previous history and asynchronous road batches undo as a single transaction',async()=>{
  let city=City.create(64);const jobs=new CityJobs(city),history=new BuildHistory(),before=city.snapshot();
  jobs.roads({from:c(10,10),to:c(35,35),mode:'rectangle',fill:'filled',remove:false});await jobs.idle();
  assert.equal(city.roadCount,26*26);assert.ok(history.record(city,before,'範囲道路'));
  const same=city.snapshot();city.apply(c(10,10),c(10,10),'road');assert.equal(history.record(city,same,'既存道路'),false);
  city=history.undo(city)!;assert.deepEqual(city.snapshot(),before);
});
