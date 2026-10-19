import * as THREE from 'three';
import {PublicFacilityView} from '../src/render/PublicFacilityView';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {City} from '../src/simulation/City';
import {publicFacility,publicCoverage} from '../src/services/PublicFacilities';
import {ParkEffects} from '../src/scenery/ParkEffects';
import {validateSave} from '../src/save/schema';
const p=(x:number,z=30)=>({x,z}),id=(x:number,z=31)=>z*64+x;
function town(){const c=City.create(64);c.funds=1e6;c.apply(p(5),p(57),'road');c.apply(p(30,31),p(30,31),'residential');c.apply(p(50,31),p(50,31),'residential');c.apply(p(31,29),p(35,29),'industrial');for(let n=0;n<12;n++)c.step();c.funds=1e6;c.enableLifecycle('observe');c.management!.lifecycle!.highest=2;assert.ok(c.tile(p(30,31)).level>0);return c;}
function saved(c:City){return validateSave({version:4,savedAt:'2026-10-19',city:c.snapshot(),clock:{speed:0,accumulated:0}});}

test('police and fire provide good service across twenty road tiles and still reach beyond the old response limit',()=>{for(const kind of ['police','fire'] as const){const c=town();c.apply(p(10,29),p(10,29),kind);assert.ok(publicCoverage(c,id(30),kind)>=.79);assert.ok(publicCoverage(c,id(50),kind)>0);assert.ok(c.safety.results.get(id(50))![kind+'Minutes' as 'fireMinutes'|'policeMinutes']!>20);assert.equal(c.safety.config.maxResponseMinutes,20);assert.equal(publicFacility(c,kind).goodRadius,20);}});

test('university covers a wider area than high school while actual journey minutes remain truthful',()=>{const high=town(),uni=City.fromState(high.snapshot());high.apply(p(10,29),p(10,29),'highSchool');uni.apply(p(10,29),p(10,29),'university');const a=high.wellness.results.get(id(30))!,b=uni.wellness.results.get(id(30))!;assert.ok(b.highSchool>=.8);assert.ok(b.highSchool>a.highSchool);assert.equal(b.schoolMinutes,a.schoolMinutes);assert.ok(b.schoolMinutes!>=12);assert.ok(publicFacility(uni,'university').goodRadius>publicFacility(high,'highSchool').goodRadius);assert.equal(uni.wellness.config.schoolMinutes,16);});

test('schools and library reach districts beyond their former school limit',()=>{for(const kind of ['elementary','highSchool','library'] as const){const c=town();c.apply(p(10,29),p(10,29),kind);assert.ok(publicCoverage(c,id(50),kind)>0);assert.ok(publicFacility(c,kind).goodRadius>2.4);}});

test('a remote university does not globally extend an unrelated high school',()=>{const c=town();c.apply(p(10,29),p(10,29),'highSchool');const before=publicCoverage(c,id(30),'highSchool');c.apply(p(55,50),p(55,50),'university');assert.equal(publicCoverage(c,id(30),'highSchool'),before);assert.equal(c.wellness.facilityStats.get(id(55,50))?.active,false);});

test('existing saved limits remain unchanged while restored facilities gain the expanded reach',async()=>{const c=town();c.apply(p(10,29),p(10,29),'police');c.apply(p(11,29),p(11,29),'university');const state=saved(c),copy=City.fromState(state.city),sliced=await City.fromStateAsync(state.city);for(const next of [copy,sliced]){assert.equal(next.safety.config.maxResponseMinutes,20);assert.equal(next.wellness.config.schoolMinutes,16);assert.equal(publicCoverage(next,id(30),'police'),publicCoverage(c,id(30),'police'));assert.equal(publicCoverage(next,id(30),'university'),publicCoverage(c,id(30),'university'));assert.equal(next.wellness.maintenance,c.wellness.maintenance);assert.equal(saved(next).version,4);}});

test('parks now benefit homes up to eight tiles away without changing their central bonus',()=>{const parks=new ParkEffects();parks.configure(64,[{id:id(20),kind:'park'}]);assert.equal(parks.at(id(20)),8);assert.ok(parks.at(id(28))>0);assert.equal(parks.at(id(29)),0);const c=City.create(64);assert.equal(publicFacility(c,'park').radius,8);assert.equal(publicFacility(c,'plaza').radius,3);});

test('one enlarged ring per source matches the placement circle, with no extra city-sized outer rings',()=>{const c=town();c.apply(p(10,29),p(10,29),'police');const scene=new THREE.Scene(),view=new PublicFacilityView(scene);view.select('police');view.point(p(20,29));view.update(c);const group=scene.getObjectByName('public-facility-coverage')!,rings=group.children.filter(n=>n.userData.publicRange) as THREE.Mesh<THREE.RingGeometry>[];assert.equal(rings.length,2);for(const ring of rings)assert.equal(ring.geometry.parameters.outerRadius,publicFacility(c,'police').goodRadius);assert.ok((rings.find(r=>r.userData.publicRange==='existing')!.material as THREE.MeshBasicMaterial).opacity<(rings.find(r=>r.userData.publicRange==='preview')!.material as THREE.MeshBasicMaterial).opacity);});
