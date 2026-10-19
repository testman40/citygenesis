import {test} from 'node:test';import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {streetResidents,PEOPLE_LIMIT} from '../src/people/StreetPeople';

function town(){
 const city=City.create(64),p=(x:number,z=30)=>({x,z});city.funds=1e6;
 city.apply(p(0),p(45),'road');city.apply(p(10,31),p(14,31),'residential');city.apply(p(29,29),p(33,29),'industrial');city.apply(p(40,31),p(44,31),'commercial');
 for(let i=0;i<14;i++)city.step();city.enableResidents();return city;
}
test('real shopping journeys continue after work, use roads, and are included in visible traffic',()=>{
 const city=town(),r=city.residents!,adults=r.households.flatMap(h=>r.members(h)).filter(p=>p.group==='大人');
 const person=adults.find(p=>r.job(city,p)?.employed&&p.household%3!==0)!;assert.ok(person);
 const before=city.snapshot();let time=0,found=false;
 for(time=19;time<23;time+=.05){const a=r.activity(city,person,time);if(a.vehicle&&a.label==='買い物へ移動'){assert.equal(a.mode,'車');assert.ok(a.path.every(id=>city.network.allows(id,'car')));found=true;break;}}
 assert.ok(found,'an employed adult can drive to a real shop after work');r.state.time=time;assert.ok(city.streetVehicles().some(v=>v.id==='resident:'+person.id));
 r.state.time=before.residents!.time;assert.deepEqual(city.snapshot(),before,'presentation must not modify population, finance, demand or the save schema');
 city.apply({x:35,z:30},{x:35,z:30},'erase');assert.equal(r.activity(city,person,time).vehicle,undefined,'no traffic through a disconnected road');
});
test('resident street samples contain real families and stay bounded; no population invents no people',()=>{
 const city=town(),r=city.residents!,people=streetResidents(city,{x:12,z:31});assert.ok(people.length>0);assert.ok(people.length<=PEOPLE_LIMIT);assert.equal(new Set(people.map(p=>p.id)).size,people.length);assert.ok(people.every(p=>r.person(p.id)));
 const empty=City.create(64);empty.enableResidents();assert.deepEqual(streetResidents(empty,{x:32,z:32}),[]);
});
test('nonworking residents leave at different times and make actual sidewalk journeys',()=>{
 const city=town(),r=city.residents!;city.apply({x:29,z:29},{x:33,z:29},'erase');
 const adults=r.households.flatMap(h=>r.members(h)).filter(p=>p.group==='大人'&&!r.job(city,p)?.employed);assert.ok(adults.length>1);
 const starts=new Set<number>();for(const person of adults){for(let t=8;t<22;t+=.1){if(r.activity(city,person,t).moving){starts.add(Math.round(t*10));break;}}}assert.ok(starts.size>1,'household schedules should not all start together');
});
