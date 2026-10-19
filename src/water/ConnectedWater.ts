import type {City,Cell} from '../simulation/City';
import {Hydrology,WATER} from './Hydrology';
/** Upgrade the playable city using existing v5 fields. Existing roads/buildings/population are retained. */
export function connectWaterInfrastructure(c:City){
 const changed=!c.hydrology||!c.waterUtility;
 if(changed)c.editTransit(city=>{city.hydrology??=new Hydrology(city.size);city.enableWaterUtility();});
 return changed;
}
/** Water does not obey one-way traffic: trace connected roads, including bends and junctions. */
export function roadPipePath(c:City,from:Cell,to:Cell,remove=false){
 if(!c.contains(from)||!c.contains(to))return [];
 const a=from.z*c.size+from.x,b=to.z*c.size+to.x;
 const allowed=(id:number)=>c.network.has(id)||(remove&&!!c.hydrology?.pipes.has(id));
 if(!allowed(a)||!allowed(b))return [];
 const previous=new Map<number,number>([[a,-1]]),queue=[a];
 for(let i=0;i<queue.length;i++){const id=queue[i];if(id===b){const path:number[]=[];for(let n=b;n!==-1;n=previous.get(n)!)path.push(n);return path.reverse();}for(const n of c.hydrology?.neighbors(id)??[])if(allowed(n)&&!previous.has(n)){previous.set(n,id);queue.push(n);}}
 return [];
}
export function quotePipes(c:City,from:Cell,to:Cell,remove=false){
 const path=roadPipePath(c,from,to,remove),ids=path.filter(id=>remove?c.hydrology!.pipes.has(id):!c.hydrology!.pipes.has(id)),changed=new Set(ids),unchanged=path.filter(id=>!changed.has(id));
 const xs=path.map(id=>id%c.size),zs=path.map(id=>Math.floor(id/c.size)),bounds={x0:Math.min(from.x,...xs),x1:Math.max(from.x,...xs),z0:Math.min(from.z,...zs),z1:Math.max(from.z,...zs)},cost=remove?0:ids.length*WATER.pipeCost;
 return {path,bounds,ids,unchanged,blocked:path.length?[]:[from.z*c.size+from.x],cost,affordable:!!path.length&&(cost===0||c.funds>=cost),width:bounds.x1-bounds.x0+1,height:bounds.z1-bounds.z0+1};
}
