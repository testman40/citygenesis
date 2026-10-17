import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {Hydrology} from '../src/water/Hydrology';
import {quoteBridge} from '../src/roads/Bridge';
import {validateSave} from '../src/save/schema';
import {createChunk} from '../src/render/CityModules';
import {purchaseBus} from '../src/transit/BusEditor';
import {cityGoals} from '../src/ui/CityGoals';
import {trendPoint,explainChanges} from '../src/ui/CityTrends';
import {zoomAudibility,nearbyVehicles,audioVolumes} from '../src/audio/CityAudio';
const c=(x:number,z:number)=>({x,z});
function riverCity(){const city=City.create(64);city.hydrology=new Hydrology(64);for(let z=0;z<64;z++)city.hydrology.river.add(z*64+32);return city;}
function save(city:City){return validateSave({version:city.waterUtility?5:4,savedAt:'2026-10-18',city:city.snapshot(),clock:{speed:0,accumulated:0}});}

test('bridge connects banks, charges the whole quote, renders and roundtrips without a new save version',()=>{
 const city=riverCity();city.apply(c(26,30),c(31,30),'road');city.apply(c(33,30),c(38,30),'road');
 const before=city.funds,quote=quoteBridge(city,c(31,30),c(33,30));city.buildBridge(c(31,30),c(33,30));
 assert.equal(city.funds,before-quote.cost);assert.ok(city.network.canTravel(30*64+31,30*64+32));assert.ok(city.network.canTravel(30*64+32,30*64+33));
 const data=save(city),restored=City.fromState(data.city);assert.deepEqual(restored.snapshot(),city.snapshot());assert.equal(data.version,4);
 const parts=createChunk(restored,2,1,'normal');assert.ok(parts.some(p=>p.owner===30*64+32&&p.y>.1));
 city.apply(c(32,30),c(32,30),'erase');assert.equal(city.hasRoad(c(32,30)),false);assert.doesNotThrow(()=>save(city));
});

test('invalid and unaffordable bridges leave funds and all cells unchanged',()=>{
 const city=riverCity();for(const [from,to] of [[c(31,30),c(33,31)],[c(30,30),c(33,30)],[c(32,30),c(33,30)]]){const before=city.snapshot();assert.throws(()=>city.buildBridge(from,to));assert.deepEqual(city.snapshot(),before);}
 city.funds=1;const before=city.snapshot();assert.throws(()=>city.buildBridge(c(31,30),c(33,30)),/資金不足/);assert.deepEqual(city.snapshot(),before);
});

test('bus route traverses two bridges and returns to its original depot',()=>{
 const city=riverCity();for(const [x,z,X,Z] of [[26,28,31,28],[33,28,38,28],[26,35,31,35],[33,35,38,35],[26,28,26,35],[38,28,38,35]])city.apply(c(x,z),c(X,Z),'road');
 city.buildBridge(c(31,28),c(33,28));city.buildBridge(c(31,35),c(33,35));
 for(const [x,z,h] of [[26,33,0],[38,31,2]]){city.apply(c(x,z),c(x,z),'bus-stop');city.transit.stopAt(z*64+x)!.heading=h;}
 city.apply(c(25,30),c(25,30),'depot');const ops=city.transit.operations,depot=30*64+25;purchaseBus(city,depot);
 const route=ops.save('川を渡る路線',[...city.transit.stops.keys()],1,depot,1);assert.ok(ops.validate(route.id).path.some(id=>city.hydrology!.river.has(id)));ops.start(route.id);
 for(let i=0;i<10000&&[...ops.buses.values()][0].state!=='garage';i++)ops.advance(.1);
 assert.equal([...ops.buses.values()][0].state,'garage');assert.doesNotThrow(()=>save(city));
});

test('parks and plazas remain scenery, charge maintenance, render, save and demolish correctly',()=>{
 const city=City.create(64);city.apply(c(20,30),c(24,30),'road');const supply=city.waterSupply,before=city.funds,costs=city.financeCosts();
 city.apply(c(20,31),c(20,31),'park');city.apply(c(22,31),c(22,31),'plaza');
 assert.equal(city.funds,before-550);assert.equal(city.tile(c(20,31)).facility,'park');assert.equal(city.tile(c(22,31)).facility,'plaza');assert.equal(city.waterSupply,supply);assert.equal(city.waterPlants,0);assert.equal(city.financeCosts().buildings,costs.buildings+3);
 const restored=City.fromState(save(city).city);assert.equal(restored.tile(c(20,31)).facility,'park');assert.equal(restored.tile(c(22,31)).facility,'plaza');assert.ok(createChunk(restored,1,1,'normal').some(p=>p.owner===31*64+20&&p.shape==='foliage'));
 const same=city.funds;city.apply(c(20,31),c(20,31),'park');assert.equal(city.funds,same);city.apply(c(20,31),c(20,31),'erase');assert.equal(city.tile(c(20,31)).facility,null);
});

test('goals are measured from the city, and condition changes are reported without inventing causes',()=>{
 const city=City.create(64),before=city.snapshot();assert.ok(!cityGoals(city).some(g=>g.done));assert.deepEqual(city.snapshot(),before);
 const p=trendPoint(city),q={...p,month:1,population:4,water:.4,tax:10,balance:6};const report=explainChanges(p,q);assert.equal(report.population,4);assert.ok(report.conditions.some(s=>s.startsWith('給水充足')));assert.ok(report.shortages.includes('給水不足'));assert.equal(report.from,0);assert.equal(report.to,1);
});

test('audio zoom attenuation, source limits and saved volume validation are bounded',()=>{
 assert.equal(zoomAudibility(100),0);assert.equal(zoomAudibility(10),1);assert.ok(zoomAudibility(30)>zoomAudibility(60));
 const vehicles=Array.from({length:12},(_,x)=>({x,z:0,angle:0}));assert.deepEqual(nearbyVehicles(vehicles,{x:0,y:0,z:0}).map(v=>v.x),[0,1,2,3,4,5]);
 assert.deepEqual(audioVolumes({master:99,music:-1,effects:NaN,ambience:'bad'}),{master:1,music:0,effects:.5,ambience:.65});
});

test('bridges and scenery roundtrip with facility-based water saves, preserving version 5',()=>{
 const city=riverCity();city.buildBridge(c(31,30),c(33,30));city.apply(c(28,31),c(28,31),'park');city.apply(c(29,31),c(29,31),'plaza');city.editTransit(c=>c.enableWaterUtility());
 const data=save(city);assert.equal(data.version,5);const restored=City.fromState(data.city);assert.deepEqual(restored.snapshot(),city.snapshot());assert.equal(restored.tile(c(32,30)).road,true);assert.equal(restored.tile(c(29,31)).facility,'plaza');
});
