/** Keys are coalesced; parts are generated only when taken from the current city. */
export class ChunkQueue {
 private keys=new Set<string>();
 enqueue(keys:Iterable<string>){for(const key of keys)this.keys.add(key);}
 get size(){return this.keys.size;}
 clear(){this.keys.clear();}
 take(x:number,z:number){let selected:string|undefined,best=Infinity;for(const key of this.keys){const [cx,cz]=key.split(',').map(Number),distance=(cx*16+8-x)**2+(cz*16+8-z)**2;if(distance<best){best=distance;selected=key;}}if(selected!==undefined)this.keys.delete(selected);return selected;}
}
