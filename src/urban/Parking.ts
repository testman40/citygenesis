import type {RoadNetwork} from '../simulation/RoadNetwork';
import {PARKING} from './UrbanDevelopment';
export interface ParkingTrip {lot:number;count:number;drive:number[];walk:number[]}
/** Allocate finite spaces only where a legal walking suffix replaces driving. */
export function allocateParking(graph:RoadNetwork,lots:Iterable<number>,legs:{path:number[];count:number}[][]){
 const usage=new Map<number,number>(),access=new Map<number,number[]>();
 for(const lot of [...lots].sort((a,b)=>a-b)){usage.set(lot,0);for(const road of graph.access(lot)){if(!graph.isMain(road)||!graph.allows(road,'car')||!graph.allows(road,'walk'))continue;const ids=access.get(road)??[];ids.push(lot);access.set(road,ids);}}
 const trips:ParkingTrip[][]=[],driving:{path:number[];count:number}[][]=[];let saved=0;
 for(const group of legs){const planned:ParkingTrip[]=[],cars:{path:number[];count:number}[]=[];
  for(const leg of group){let remaining=leg.count;const p=leg.path;
   for(let i=Math.max(1,p.length-PARKING.walkRadius);i<p.length-1&&remaining;i++){
    const walk=p.slice(i);if(walk.length+1>PARKING.walkRadius||walk.some((id,j)=>!graph.allows(id,'walk')||(j>0&&!graph.canTravel(walk[j-1],id,'walk'))))continue;
    // A parking trip must also be able to return along its driving prefix.
    if(p.slice(0,i+1).some((id,j)=>j>0&&!graph.canTravel(id,p[j-1],'car')))continue;
    for(const lot of access.get(p[i])??[]){const count=Math.min(remaining,PARKING.spaces-usage.get(lot)!);if(!count)continue;const drive=p.slice(0,i+1);planned.push({lot,count,drive,walk});cars.push({path:drive,count});usage.set(lot,usage.get(lot)!+count);remaining-=count;saved+=count*(p.length-i-1);if(!remaining)break;}
   }
   if(remaining)cars.push({path:p,count:remaining});
  }
  trips.push(planned);driving.push(cars);
 }
 return {trips,driving,usage,saved};
}
