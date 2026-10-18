import type {City} from '../simulation/City';
import {stopPosition} from '../transit/BusEditor';
export const PEOPLE_LIMIT=128;
export interface StreetPerson {x:number;z:number;toX:number;toZ:number;seed:number;waiting:boolean}
/** Representative street activity and sampled waiting demand, never individual census records. */
export function streetPeople(city:City,focus:{x:number;z:number},radius=18):StreetPerson[]{
 const people:StreetPerson[]=[],n=city.size;
 for(const stop of city.transit.stops.values()){
  const p=stopPosition(stop.road,n,stop.heading??1);if(Math.hypot(p.x-focus.x,p.z-focus.z)>radius)continue;
  const count=Math.min(8,city.transit.operations.waiting(stop.id));
  for(let i=0;i<count&&people.length<PEOPLE_LIMIT;i++){const dx=[0,1,0,-1][p.heading],dz=[-1,0,1,0][p.heading],x=p.x-dx*(i%4)*.14+dz*Math.floor(i/4)*.12,z=p.z-dz*(i%4)*.14-dx*Math.floor(i/4)*.12;people.push({x,z,toX:x,toZ:z,seed:stop.id*11+i,waiting:true});}
 }
 if(!city.population)return people;
 const candidates:{id:number;distance:number}[]=[];
 for(let z=Math.max(0,Math.floor(focus.z-radius));z<=Math.min(n-1,Math.ceil(focus.z+radius));z++)for(let x=Math.max(0,Math.floor(focus.x-radius));x<=Math.min(n-1,Math.ceil(focus.x+radius));x++){
  const tile=city.tile({x,z});if(!tile.level||!tile.networkConnected||!['residential','commercial'].includes(tile.zone??''))continue;
  const road=city.network.adjacent(z*n+x).find(id=>city.network.isMain(id));if(road!==undefined)candidates.push({id:road,distance:Math.hypot(x-focus.x,z-focus.z)});
 }
 candidates.sort((a,b)=>a.distance-b.distance);const seen=new Set<number>();let walkers=0;
 for(const candidate of candidates){const id=candidate.id;if(seen.has(id))continue;seen.add(id);const next=city.network.adjacent(id).find(to=>!city.hydrology?.river.has(to));if(next===undefined||city.hydrology?.river.has(id))continue;
  const x=id%n+.5,z=Math.floor(id/n)+.5,dx=next%n-id%n,dz=Math.floor(next/n)-Math.floor(id/n),side=id%2?1:-1;
  for(let i=0;i<2&&walkers<64&&people.length<PEOPLE_LIMIT;i++,walkers++)people.push({x:x-dz*.39*side,z:z+dx*.39*side,toX:x+dx-dz*.39*side,toZ:z+dz+dx*.39*side,seed:id*3+i,waiting:false});
 }
 return people;
}
export function personPose(person:StreetPerson,time:number){
 const phase=(time*.23+person.seed*.371)%2,t=phase<1?phase:2-phase;
 return {x:person.x+(person.toX-person.x)*t,z:person.z+(person.toZ-person.z)*t,angle:Math.atan2(person.toX-person.x,person.toZ-person.z)+(phase<1?0:Math.PI),stride:person.waiting?0:Math.sin(time*9+person.seed)*.45};
}
