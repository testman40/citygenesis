import type {Part} from './CityModules';
const EMPTY:Part[]=[];
/** Only the first three mass parts are needed by demolition; no full-chunk lookup per tile. */
export class PartIndex {
 private owners=new Map<number,Part[]>();
 constructor(parts:readonly Part[]=[]){for(const p of parts)if(p.shape==='mass'){let list=this.owners.get(p.owner);if(!list){list=[];this.owners.set(p.owner,list);}if(list.length<3)list.push(p);}}
 get(id:number){return this.owners.get(id)??EMPTY;}
 get size(){return this.owners.size;}
 clear(){this.owners.clear();}
}
