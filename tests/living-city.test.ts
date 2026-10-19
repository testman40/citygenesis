import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {BuildHistory} from '../src/simulation/BuildHistory';
import {ParkEffects} from '../src/scenery/ParkEffects';
import {streetPeople,personPose,PEOPLE_LIMIT} from '../src/people/StreetPeople';
import {routeEconomics} from '../src/transit/RouteEconomics';
import {createScenario,scenarioProgress,SCENARIOS,type ScenarioProgress} from '../src/scenarios/Scenarios';
import {validateSave} from '../src/save/schema';
const c=(x:number,z:number)=>({x,z});
const progress=(id:ScenarioProgress['id'],month:number):ScenarioProgress=>({id,startedMonth:month,lastMonth:month,streak:0,completed:false});

test('representative pedestrians stay on local roads, are bounded, and sample actual waiting demand',()=>{
 const city=City.fromState(createScenario('bus').city),before=city.snapshot(),people=streetPeople(city,{x:30,z:31});assert.ok(people.some(p=>!p.waiting));assert.ok(people.length<=PEOPLE_LIMIT);
 const stop=[...city.transit.stops.values()][0];city.transit.passengerFlows.set('sample',{route:1,from:stop.id,to:2,count:200});
 const withQueue=streetPeople(city,{x:30,z:31});assert.equal(withQueue.filter(p=>p.waiting).length,8);const pose=personPose(people[0],4),other=personPose(people[0],5);assert.notDeepEqual(pose,other);assert.deepEqual(city.snapshot(),before);
 assert.equal(streetPeople(city,{x:0,z:0},2).length,0);city.apply(c(26,32),c(26,34),'erase');for(const person of streetPeople(city,{x:30,z:31}).filter(p=>!p.waiting)){assert.ok(city.hasRoad(c(Math.floor(person.x),Math.floor(person.z))));assert.ok(city.hasRoad(c(Math.floor(person.toX),Math.floor(person.toZ))));}
});

test('park benefits fall with distance, do not stack, and affect connected homes and housing demand',()=>{
 const parks=new ParkEffects();parks.configure(64,[{id:30*64+30,kind:'park'}]);assert.equal(parks.at(30*64+30),8);assert.ok(parks.at(30*64+34)>0);assert.ok(parks.at(30*64+38)>0);assert.equal(parks.at(30*64+39),0);const value=parks.at(30*64+31);parks.configure(64,[{id:30*64+30,kind:'park'},{id:30*64+30,kind:'plaza'}]);assert.equal(parks.at(30*64+31),value);
 const city=City.create(64);city.apply(c(26,30),c(35,30),'road');city.apply(c(29,31),c(29,31),'residential');city.apply(c(29,29),c(29,29),'industrial');for(let i=0;i<5;i++)city.step();city.setTaxRate(1.5);const base=city.satisfaction,demand=city.demand.residential;
 city.apply(c(30,31),c(30,31),'park');assert.ok(city.sceneryBonus>0);assert.ok(city.satisfaction>base);assert.ok(city.demand.residential>demand);const snapshot=city.snapshot();assert.deepEqual(City.fromState(snapshot).snapshot(),snapshot);city.apply(c(30,31),c(30,31),'erase');assert.equal(city.satisfaction,base);assert.equal(city.demand.residential,demand);
 city.apply(c(50,50),c(50,50),'park');assert.equal(city.sceneryBonus,0);
});

test('facility, pipe and bridge transactions undo and redo exactly; a new edit or time invalidates redo',()=>{
 let city=City.fromState(createScenario('river').city);const h=new BuildHistory(),before=city.snapshot();city.buildBridge(c(30,30),c(34,30));city.waterWorks(c(29,30),c(29,33),'pipe');city.apply(c(29,31),c(29,31),'park');const after=city.snapshot();assert.ok(h.record(city,before,'橋・地下管・公園'));
 city=h.undo(city)!;assert.deepEqual(city.snapshot(),before);assert.equal(h.available(city),false);assert.ok(h.redoAvailable(city));city=h.redo(city)!;assert.deepEqual(city.snapshot(),after);
 city=h.undo(city)!;const start=city.snapshot();city.apply(c(28,31),c(28,31),'clinic');h.record(city,start,'診療所');assert.equal(h.redo(city),undefined);city=h.undo(city)!;city.step();assert.equal(h.redo(city),undefined);
});

test('undo refuses transactions involving active bus runs and keeps current state intact',()=>{
 const city=City.fromState(createScenario('bus').city);city.transit.operations.start(1);const h=new BuildHistory(),before=city.snapshot();assert.equal(h.supports(city,'park'),false);city.apply(c(30,36),c(30,36),'park');assert.equal(h.record(city,before,'公園'),false);const current=city.snapshot();assert.equal(h.undo(city),undefined);assert.deepEqual(city.snapshot(),current);
});

test('route cost allocations reconcile to the transit budget, with fares confined to estimates',()=>{
 const city=City.fromState(createScenario('bus').city),t=city.transit;t.operations.start(1);city.editTransit(()=>{});let report=routeEconomics(t,2);assert.equal(report.rows.length,1);assert.ok(report.rows[0].cost>0);assert.ok(Math.abs(report.totalCost-report.rows.reduce((s,r)=>s+r.cost,0)-report.otherCost)<1e-8);
 const before=city.snapshot(),r=t.services.get(1)!;r.riders=20;report=routeEconomics(t,2);assert.equal(report.rows[0].revenue,40);assert.deepEqual(city.snapshot(),before);assert.equal(routeEconomics(t,NaN).fare,0);
 t.operations.stop(1);city.editTransit(()=>{});report=routeEconomics(t,2);assert.equal(report.rows[0].operating,0);assert.ok(report.rows[0].ownership>0);
});

test('all challenge cities validate; bridge and bus goals require actual successful operations',()=>{
 for(const definition of SCENARIOS){const save=createScenario(definition.id);assert.equal(validateSave(save).version,4);assert.deepEqual(City.fromState(save.city).snapshot(),save.city);}
 const bridge=City.fromState(createScenario('river').city),p=progress('river',bridge.month);assert.equal(scenarioProgress(bridge,p).completed,false);bridge.buildBridge(c(30,30),c(34,30));assert.equal(scenarioProgress(bridge,p).completed,true);
 const bus=City.fromState(createScenario('bus').city),q=progress('bus',bus.month);assert.equal(scenarioProgress(bus,q).completed,false);bus.transit.operations.start(1);for(let i=0;i<10000&&[...bus.transit.operations.buses.values()][0].state!=='garage';i++)bus.transit.operations.advance(.1);assert.equal(scenarioProgress(bus,q).completed,true);
});

test('rebuild challenge begins in deficit and counts three consecutive solvent accounting months',()=>{
 const city=City.fromState(createScenario('rebuild').city);assert.ok(city.balance<0);let p=progress('rebuild',city.month);assert.equal(scenarioProgress(city,p).completed,false);for(let z=28;z<31;z++)for(let x=43;x<47;x++)city.apply(c(x,z),c(x,z),'erase');
 for(let i=1;i<=3;i++){city.step();p=scenarioProgress(city,p);assert.equal(p.streak,i);assert.equal(p.completed,i===3);}
});

test('a prepared bus challenge produces real transit demand and visible waiting passengers after dispatch',()=>{
 const city=City.fromState(createScenario('bus').city);assert.equal(city.transit.riders,0);city.transit.operations.start(1);city.editTransit(()=>{});assert.ok(city.transit.riders>0);const people=streetPeople(city,{x:30,z:31});assert.ok(people.some(p=>p.waiting));assert.ok(people.length<=PEOPLE_LIMIT);
 const save=validateSave({version:4,savedAt:new Date().toISOString(),city:city.snapshot(),clock:{speed:0,accumulated:0}});const restored=City.fromState(save.city);assert.ok(restored.transit.riders>0);assert.ok(streetPeople(restored,{x:30,z:31}).some(p=>p.waiting));
});

test('shared stops, shared depot and unused vehicles reconcile under transit funding changes',()=>{
 const city=City.fromState(createScenario('bus').city),t=city.transit,ops=t.operations,depot=30*64+25;ops.buy(depot,2);ops.save('同じ停留所の路線',[1,3,2],1,depot,1);ops.start(1);ops.start(2);t.addStop(28*64+32);t.setBudget(.8,.6);t.refresh();const report=routeEconomics(t,1);assert.equal(report.rows.length,2);assert.equal(report.rows[0].stops,report.rows[1].stops);assert.ok(report.otherCost>0);assert.ok(Math.abs(report.rows.reduce((sum,r)=>sum+r.cost,0)+report.otherCost-t.maintenance)<1e-8);
});
