import {test} from 'node:test';import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {facilityEconomics} from '../src/economy/FacilityEconomics';
import {facilityCharts} from '../src/info/FacilityCharts';
import {validateSave} from '../src/save/schema';
import {CityJobs} from '../src/simulation/CityJobs';
const p=(x:number,z=30)=>({x,z});
function town(){const c=City.create(64);c.funds=1e6;c.apply(p(0),p(45),'road');c.apply(p(10,31),p(13,31),'residential');c.apply(p(28,29),p(32,29),'industrial');for(let i=0;i<12;i++)c.step();c.apply(p(15,29),p(15,29),'police');c.apply(p(17,29),p(17,29),'fire');c.apply(p(19,29),p(19,29),'elementary');c.apply(p(21,29),p(21,29),'highSchool');return c;}
const save=(c:City)=>validateSave({version:4,savedAt:new Date().toISOString(),city:c.snapshot(),clock:{speed:0,accumulated:0}});
test('placed services show real funded costs and locations without inventing income or changing the city',()=>{
 const c=town(),before=c.snapshot(),rows=facilityEconomics(c);assert.deepEqual(c.snapshot(),before);assert.equal(rows.length,4);
 assert.equal(rows.find(r=>r.kind==='police')!.cost,c.safety.config.policeMaintenance);assert.equal(rows.find(r=>r.kind==='elementary')!.cost,c.wellness.upkeep('elementary'));
 for(const r of rows){assert.equal(r.income,0);assert.equal(r.balance,-r.cost);assert.ok(r.id>=0&&r.id<64*64);assert.ok(r.notes.length);}
 const selected=rows.find(r=>r.kind==='police')!,charts=facilityCharts(c,rows,selected);assert.ok(charts.find(m=>m.id==='facility-cost-comparison')!.bars!.every(b=>b.label.includes('X')&&b.label.includes('/Z')));assert.equal(charts.find(m=>m.id==='facility-cashflow')!.current,-selected.cost);
 c.setBudget('police',1.5);c.step();assert.equal(facilityEconomics(c).find(r=>r.kind==='police')!.cost,c.safety.config.policeMaintenance*c.budget.funded.police);
});
test('disconnected and spare-capacity facilities get cautious, actionable notes',()=>{
 const c=town();c.apply(p(50,50),p(50,50),'police');const isolated=facilityEconomics(c).find(r=>r.id===50*64+50)!;assert.equal(isolated.active,false);assert.ok(isolated.cost>0);assert.match(isolated.notes.join(' '),/幹線/);
 const school=facilityEconomics(c).find(r=>r.kind==='elementary')!;assert.match(school.loadLabel,/按分/);assert.match(school.notes.join(' '),/増設|未充足/);
});
test('12 month facility history survives save/load; legacy data stays readable and is not backfilled',()=>{
 const c=town();c.statistics=undefined;for(let n=0;n<15;n++)c.step();assert.equal(c.statistics!.months.length,12);assert.ok(c.statistics!.months.every(m=>m.facilities!.some(f=>f.kind==='police')));
 const data=save(c),restored=City.fromState(data.city);assert.deepEqual(restored.statistics,c.statistics);
 const rows=facilityEconomics(restored),charts=facilityCharts(restored,rows,rows[0]);assert.equal(charts.find(m=>m.id==='facility-cost-history')!.series![0].points.length,12);
 const legacy=structuredClone(data);for(const m of legacy.city.statistics!.months)delete m.facilities;assert.doesNotThrow(()=>validateSave(legacy));const old=City.fromState(legacy.city),oldRows=facilityEconomics(old);assert.ok(facilityCharts(old,oldRows,oldRows[0]).find(m=>m.id==='facility-cost-history')!.series![0].points.every(p=>p.value===null));
 for(const change of ['negative','duplicate','position','load','kind']){const bad=structuredClone(data),fs=bad.city.statistics!.months[0].facilities!;if(change==='negative')fs[0].cost=-1;if(change==='duplicate')fs.push({...fs[0]});if(change==='position')fs[0].id=64*64;if(change==='load')fs[0].load=2;if(change==='kind')(fs[0] as any).kind='fake';assert.throws(()=>validateSave(bad),/施設費用|月次統計/);}
});
test('split monthly jobs record the same facility costs and report removed facilities only in past months',async()=>{
 const c=town(),sliced=City.fromState(c.snapshot());c.step();const jobs=new CityJobs(sliced);jobs.month();await jobs.idle();assert.deepEqual(sliced.statistics,c.statistics);
 const id=29*64+15;c.apply(p(15,29),p(15,29),'erase');c.step();assert.ok(!facilityEconomics(c).some(r=>r.id===id));assert.ok(!c.statistics!.months.at(-1)!.facilities!.some(f=>f.id===id));assert.ok(c.statistics!.months.slice(0,-1).some(m=>m.facilities!.some(f=>f.id===id)));
});
test('power and water facility costs reconcile with actual categories, excluding shared pipe upkeep',()=>{
 const c=town();c.enableWaterUtility();c.funds=1e6;
 for(const [x,k] of [[2,'power'],[4,'water'],[6,'wind'],[8,'solar'],[35,'externalWater'],[37,'sewage'],[39,'park']] as const)c.apply(p(x,31),p(x,31),k);
 const rows=facilityEconomics(c),power=new Set(['power','wind','solar']),water=new Set(['water','externalWater','sewage','advancedSewage','outfall']),costs=c.financeCosts();
 assert.ok(rows.some(r=>r.kind==='power')&&rows.some(r=>r.kind==='water')&&rows.some(r=>r.kind==='sewage'));
 assert.ok(Math.abs(rows.filter(r=>power.has(r.kind)).reduce((sum,r)=>sum+r.cost,0)-costs.power)<.00001);
 assert.ok(Math.abs(rows.filter(r=>water.has(r.kind)).reduce((sum,r)=>sum+r.cost,0)-(costs.water-c.hydrology!.pipes.size*.01))<.00001);
});
