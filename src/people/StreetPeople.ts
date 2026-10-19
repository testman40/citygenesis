import type {City} from '../simulation/City';
import {stopPosition} from '../transit/BusEditor';
export const PEOPLE_LIMIT=128;
export interface StreetPerson {x:number;z:number;toX:number;toZ:number;seed:number;waiting:boolean}
/** Representative street activity and sampled waiting demand, never individual census records. */
export function streetPeople(city:City,focus:{x:number;z:number},radius=18):StreetPerson[]{
 const people:StreetPerson[]=[],n=city.size;
 for(const stop of city.transit.stops.values()){
  if(!city.network.allows(stop.road,'walk'))continue;const p=stopPosition(stop.road,n,stop.heading??1,stop.bay);if(Math.hypot(p.x-focus.x,p.z-focus.z)>radius)continue;
  const count=Math.min(8,city.transit.operations.waiting(stop.id));
  for(let i=0;i<count&&people.length<PEOPLE_LIMIT;i++){const dx=[0,1,0,-1][p.heading],dz=[-1,0,1,0][p.heading],x=p.x-dx*i*.065,z=p.z-dz*i*.065;people.push({x,z,toX:x,toZ:z,seed:stop.id*11+i,waiting:true});}
 }
 if(!city.population)return people;
 const candidates:{id:number;distance:number}[]=[];
 for(let z=Math.max(0,Math.floor(focus.z-radius));z<=Math.min(n-1,Math.ceil(focus.z+radius));z++)for(let x=Math.max(0,Math.floor(focus.x-radius));x<=Math.min(n-1,Math.ceil(focus.x+radius));x++){
  const tile=city.tile({x,z});if(!tile.level||!tile.networkConnected||!['residential','commercial'].includes(tile.zone??''))continue;
  const road=city.network.adjacent(z*n+x).find(id=>city.network.isMain(id)&&city.network.allows(id,'walk')&&city.network.adjacent(id).length<3);if(road!==undefined)candidates.push({id:road,distance:Math.hypot(x-focus.x,z-focus.z)});
 }
 candidates.sort((a,b)=>a.distance-b.distance);const seen=new Set<number>();let walkers=0;
 for(const candidate of candidates){const id=candidate.id;if(seen.has(id))continue;seen.add(id);const next=city.network.adjacent(id).find(to=>!city.hydrology?.river.has(to)&&city.network.allows(to,'walk')&&city.network.adjacent(to).length<3);if(next===undefined||city.hydrology?.river.has(id))continue;
  const x=id%n+.5,z=Math.floor(id/n)+.5,dx=next%n-id%n,dz=Math.floor(next/n)-Math.floor(id/n),side=id%2?1:-1;
  const curb=(road:number)=>{const bay=city.network.bayWalk.get(road);return bay!==undefined&&((bay===1&&dx*side<0)||(bay===3&&dx*side>0)||(bay===0&&-dz*side<0)||(bay===2&&-dz*side>0))?.86:.455;};const a=curb(id),b=curb(next);for(let i=0;i<2&&walkers<64&&people.length<PEOPLE_LIMIT;i++,walkers++)people.push({x:x-dz*a*side,z:z+dx*a*side,toX:x+dx-dz*b*side,toZ:z+dz+dx*b*side,seed:id*3+i,waiting:false});
 }
 return people;
}
export function personPose(person:StreetPerson,time:number){
 const phase=(time*.23+person.seed*.371)%2,t=phase<1?phase:2-phase;
 return {x:person.x+(person.toX-person.x)*t,z:person.z+(person.toZ-person.z)*t,angle:Math.atan2(person.toX-person.x,person.toZ-person.z)+(phase<1?0:Math.PI),stride:person.waiting?0:Math.sin(time*9+person.seed)*.45};
}

/** Nearby real residents plus a bounded citywide sample for incoming commuters. */
export function streetResidents(city:City,focus:{x:number;z:number},radius=18){
 const r=city.residents;if(!r)return [];
 const homes:{id:number;distance:number}[]=[];
 for(let z=Math.max(0,Math.floor(focus.z-radius));z<=Math.min(city.size-1,Math.ceil(focus.z+radius));z++)for(let x=Math.max(0,Math.floor(focus.x-radius));x<=Math.min(city.size-1,Math.ceil(focus.x+radius));x++){
  const id=z*city.size+x;if(r.occupancy(id))homes.push({id,distance:Math.hypot(x-focus.x,z-focus.z)});
 }
 homes.sort((a,b)=>a.distance-b.distance);
 const people=new Map<string,ReturnType<typeof r.members>[number]>();
 for(const home of homes)for(const h of r.atHome(home.id))for(const p of r.members(h))if(people.size<96)people.set(p.id,p);
 const stride=Math.max(1,Math.ceil(r.households.length/32));
 for(let i=0;i<r.households.length&&people.size<PEOPLE_LIMIT;i+=stride)for(const p of r.members(r.households[i]))if(people.size<PEOPLE_LIMIT)people.set(p.id,p);
 return [...people.values()];
}
