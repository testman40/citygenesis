import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {TrafficObservation,waterInformation,selectedTraffic} from '../src/info/LiveInformation';
import {Hydrology} from '../src/water/Hydrology';
import {informationAt} from '../src/info/CityInformation';
import {createChunk} from '../src/render/CityModules';
import {INFO_STYLE} from '../src/info/CityInformation';
const point=(x:number,z=30)=>({x,z});

test('live traffic distinguishes new, moving, stopped and paused vehicles without changing the city',()=>{
 const c=City.create(64);c.apply(point(10),point(20),'road');const before=c.snapshot(),s=new TrafficObservation(),road=30*64+12;
 const poses=[{id:'a',kind:'car',x:12.5,z:30.5,roadA:road},{id:'b',kind:'bus',x:13.5,z:30.5,roadA:road+1},{id:'c',kind:'bike',x:14.5,z:30.5}];
 const first=s.sample(c,poses,point(12),true);assert.equal(first.total,3);assert.equal(first.unknown,3);assert.equal(first.stopped,0);
 const next=s.sample(c,poses.map(p=>({...p,x:p.id==='a'?p.x+.1:p.x})),point(12),true);assert.equal(next.moving,1);assert.equal(next.stopped,2);assert.equal(next.local,1);assert.equal(next.bikes,1);assert.equal(next.buses,1);
 const paused=s.sample(c,poses,point(12),false);assert.equal(paused.moving,0);assert.equal(paused.stopped,0);assert.equal(s.sample(c,poses,null,true).unknown,3);
 assert.deepEqual(c.snapshot(),before);
});

test('traffic observation drops removed vehicles, deduplicates and resets across cities',()=>{
 const a=City.create(64),b=City.create(64),s=new TrafficObservation(),p={id:'a',x:1,z:1,kind:'car'};
 assert.equal(s.sample(a,[p,p],null,true).total,1);assert.equal(s.sample(a,[],null,true).total,0);
 s.sample(a,[p],null,true);assert.equal(s.sample(b,[p],null,true).unknown,1);s.reset();assert.equal(s.sample(b,[p],null,true).unknown,1);
});

test('water information distinguishes unstarted models, no discharge and actual residual load',()=>{
 const c=City.create(64);assert.equal(waterInformation(c,null).ratio,null);assert.match(waterInformation(c,null).title,/未開始/);
 c.apply(point(10),point(20),'road');c.enableWaterUtility();const w=c.waterUtility!;assert.equal(waterInformation(c,null).ratio,null);
 const evaluate=(efficiency:number)=>{for(const _ of w.evaluate(c.network,undefined,[{id:31*64+12,demand:100}],[{id:31*64+10,capacity:120}],[{id:31*64+18,capacity:100,efficiency}],[])){};};
 evaluate(.5);const polluted=waterInformation(c,point(12,31));assert.equal(polluted.ratio,.5);assert.match(polluted.selection,/50%/);
 evaluate(.95);const cleaner=waterInformation(c,point(12,31));assert.ok(cleaner.ratio!<polluted.ratio!);assert.match(cleaner.selection,/5%/);assert.match(cleaner.note,/濃度.*拡散/);
 assert.match(waterInformation(c,point(2,2)).selection,/未接続/);
});

test('river overlays never imply a measured concentration or global pollution spread',()=>{
 const c=City.create(64);c.hydrology=new Hydrology(64);const id=30*64+32;c.hydrology.river.add(id);c.enableSanitation();c.hydrology.untreated=100;
 for(const mode of ['water','sewage','environment'] as const){const value=informationAt(c,id,mode);assert.equal(value.state,'neutral');assert.equal(value.value,null);assert.match(value.note,/未計算/);}
 assert.match(waterInformation(c,point(32)).selection,/未計算/);
 const parts=createChunk(c,2,1,'environment');assert.ok(parts.some(p=>p.owner===id&&p.color===INFO_STYLE.neutral.color));
});

test('selected traffic uses current road demand, capacity and signal clock',()=>{
 const c=City.create(64);c.apply(point(10),point(20),'road');c.apply(point(15,29),point(15,31),'road');
 c.network.signalTime=0;assert.match(selectedTraffic(c,point(15),2),/東西 青/);c.network.signalTime=4;assert.match(selectedTraffic(c,point(15),2),/南北 青/);c.network.signalTime=7;assert.match(selectedTraffic(c,point(15),2),/歩行者 青/);assert.match(selectedTraffic(c,null,0),/道路を選ぶ/);
});
