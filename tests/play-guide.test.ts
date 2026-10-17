import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {nextActions,tutorialSteps} from '../src/ui/PlayGuide';
const cell=(x:number,z:number)=>({x,z});
function town(){const c=City.create(64);c.apply(cell(20,30),cell(30,30),'road');c.applyStroke(cell(20,31),cell(25,31),'residential');c.applyStroke(cell(20,29),cell(25,29),'industrial');return c;}

test('guide leads an empty city through roads, homes and workplaces without changing saved data',()=>{
 const c=City.create(64);assert.equal(nextActions(c)[0].id,'first-road');
 c.apply(cell(20,30),cell(30,30),'road');assert.equal(nextActions(c)[0].id,'first-home');
 c.apply(cell(20,31),cell(20,31),'residential');assert.equal(nextActions(c)[0].id,'first-job');
 const before=c.snapshot();nextActions(c);tutorialSteps(c,false,false);assert.deepEqual(c.snapshot(),before);
});

test('isolation identifies an affected cell and the advice disappears after reconnecting',()=>{
 const c=town();c.apply(cell(40,40),cell(40,40),'residential');
 const action=nextActions(c).find(a=>a.id==='isolation')!;assert.deepEqual(action.location,cell(40,40));
 c.apply(cell(30,30),cell(40,30),'road');c.apply(cell(40,30),cell(40,39),'road');
 assert.ok(!nextActions(c).some(a=>a.id==='isolation'));
});

test('shortage and financial advice depend on real conditions and unknown causes have no invented locations',()=>{
 const c=town();for(let i=0;i<8;i++)c.step();c.setPowerImport(false);c.apply(cell(32,30),cell(32,30),'road');
 const actions=nextActions(c);assert.ok(actions.some(a=>a.id==='power'));const before=c.snapshot();nextActions(c);assert.deepEqual(c.snapshot(),before);
 const empty=City.create(64);empty.funds=-5;const financial=nextActions(empty).find(a=>a.id==='finance')!;assert.equal(financial.location,undefined);
 assert.equal(nextActions(City.create(64))[0].id,'first-road');
});

test('tutorial recognizes work done out of order but requires undo and actual growth before completion',()=>{
 const c=town();let steps=tutorialSteps(c,false,false);
 assert.equal(steps.find(s=>s.id==='road')!.done,true);assert.equal(steps.find(s=>s.id==='home')!.done,true);assert.equal(steps.find(s=>s.id==='work')!.done,true);
 assert.equal(steps.find(s=>s.id==='undo')!.done,false);assert.equal(steps.find(s=>s.id==='growth')!.done,false);
 for(let i=0;i<8;i++)c.step();steps=tutorialSteps(c,true,true);
 assert.ok(steps.every(s=>s.done));
});

test('facility-based water cannot pass the supply tutorial with no water facilities',()=>{
 const c=town();c.enableWaterUtility();assert.equal(tutorialSteps(c,false,false).find(s=>s.id==='utilities')!.done,false);
});

test('undeveloped dry zones receive an actionable water warning even before buildings exist',()=>{
 const c=town();c.editTransit(next=>next.enableWaterUtility());assert.equal(c.buildingCount,0);
 const action=nextActions(c).find(a=>a.id==='water')!;assert.ok(action);assert.equal(action.panel,'water-utility-panel');assert.ok(action.location);
 assert.equal(tutorialSteps(c,false,false).find(s=>s.id==='utilities')!.done,false);
 c.editTransit(next=>next.waterWorks(cell(26,29),cell(26,29),'externalWater'));
 assert.ok(!nextActions(c).some(a=>a.id==='water'));
 assert.equal(tutorialSteps(c,false,false).find(s=>s.id==='utilities')!.done,true);
});
