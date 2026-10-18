import {ROAD_KINDS,type RoadKind} from '../roads/profiles';
import {pedestrianGreen} from '../people/Sidewalks';
/** Sparse grid graph. Additions merge smaller components into the largest. */
export class RoadNetwork {
 private membership=new Map<number,number>();private components=new Map<number,Set<number>>();private minima=new Map<number,number>();private nextId=1;private main:number|null=null;
 private cycleRevision=-1;private cycleCache=new Map<number,boolean>();
 readonly bayCells=new Map<number,number>();readonly bayWalk=new Map<number,number>();
 readonly kinds=new Map<number,RoadKind>();readonly crossings=new Set<number>();signalTime=0;pedestrianBusy=new Set<number>();busyCrossings=new Set<number>();
 profile(id:number){return ROAD_KINDS[this.busOnly.has(id)?'bus':this.kinds.get(id)??'general'];}
 crossingAllowed(id:number){return this.profile(id).lanes===1||this.crossings.has(id)||this.adjacent(id).length>=3;}
 pedestrianGreen(id:number){return !this.busyCrossings.has(id)&&(this.profile(id).lanes===1||pedestrianGreen(this.signalTime));}
 access(id:number){return this.adjacent(id).filter(r=>this.profile(r).access);}
 readonly busOnly=new Set<number>();
 allows(id:number,mode:'car'|'bus'|'walk'|'bike'='bus'){const p=this.profile(id);return this.has(id)&&(mode==='walk'?p.walk:mode==='bike'?p.bike:mode==='car'?p.lanes>0&&!this.busOnly.has(id):p.lanes>0);}
 readonly directions=new Map<number,number>();
 /** 0 north, 1 east, 2 south, 3 west; absent means two way. Physical components remain undirected. */
 setDirection(id:number,direction:number|null){if(!this.has(id)||direction!==null&&(!Number.isInteger(direction)||direction<0||direction>3))throw Error('道路と進行方向を確認してください');if(direction===null)this.directions.delete(id);else this.directions.set(id,direction);this.revision++;}
 canTravel(a:number,b:number,mode:'car'|'bus'|'walk'|'bike'='bus'){if(!this.allows(a,mode)||!this.allows(b,mode))return false;if(!this.adjacent(a).includes(b))return false;const direction=(b===a-this.size?0:b===a+1?1:b===a+this.size?2:3);return (!this.directions.has(a)||this.directions.get(a)===direction)&&(!this.directions.has(b)||this.directions.get(b)!==(direction+2)%4);}
 successors(id:number,mode:'car'|'bus'|'walk'|'bike'='bus'){return this.adjacent(id).filter(n=>this.canTravel(id,n,mode));}
 inspected=0;revision=0;
 constructor(readonly size:number){}
 private neighbors(id:number){const x=id%this.size,z=Math.floor(id/this.size);return [x>0?id-1:-1,x+1<this.size?id+1:-1,z>0?id-this.size:-1,z+1<this.size?id+this.size:-1].filter(n=>n>=0);}
 ids(){return this.membership.keys();}
 componentKey(id:number){return this.membership.get(id);}
 has(id:number){return this.membership.has(id);}
 adjacent(id:number){return this.neighbors(id).filter(n=>this.has(n));}
 sameComponent(a:number,b:number){return this.has(a)&&this.membership.get(a)===this.membership.get(b);}
 isMain(id:number){return this.membership.has(id)&&this.membership.get(id)===this.main;}
 componentHasCycle(id:number){if(this.cycleRevision!==this.revision){this.cycleCache.clear();this.cycleRevision=this.revision;}const key=this.membership.get(id);if(key===undefined)return false;const hit=this.cycleCache.get(key);if(hit!==undefined)return hit;const nodes=this.components.get(key)!;let degree=0;for(const node of nodes)degree+=this.adjacent(node).length;const cycle=degree/2>=nodes.size;this.cycleCache.set(key,cycle);return cycle;}
 get count(){return this.membership.size;}
 get isolated(){return this.count-(this.main===null?0:this.components.get(this.main)!.size);}
 private chooseMain(){let chosen:number|null=null,max=-1,min=Infinity;for(const [key,set] of this.components){const first=this.minima.get(key)!;if(set.size>max||(set.size===max&&first<min)){chosen=key;max=set.size;min=first;}}this.main=chosen;}
 /** Whole-save reconstruction visits each road once, then invalidates route caches. */
 load(ids:Iterable<number>){const iterator=this.loadSteps(ids);while(!iterator.next().done){}}
 *loadSteps(ids:Iterable<number>):Generator<void>{
  const remaining=new Set(ids);for(const id of remaining)if(!Number.isInteger(id)||id<0||id>=this.size*this.size)throw new Error('Invalid road id');
  this.kinds.clear();this.crossings.clear();this.busOnly.clear();this.directions.clear();this.membership.clear();this.components.clear();this.minima.clear();this.main=null;this.inspected=0;this.revision++;
  while(remaining.size){const first=remaining.values().next().value!,key=this.nextId++,group=new Set<number>([first]),queue=[first];let min=first;remaining.delete(first);
   for(let i=0;i<queue.length;i++){const n=queue[i];this.inspected++;if(this.inspected%256===0)yield;this.membership.set(n,key);min=Math.min(min,n);for(const neighbor of this.neighbors(n))if(remaining.delete(neighbor)){group.add(neighbor);queue.push(neighbor);}}
   this.components.set(key,group);this.minima.set(key,min);
  }this.chooseMain();
 }
 edit(id:number,add:boolean):Set<number>{
  if(this.has(id)===add)return new Set();this.revision++;this.inspected=0;
  const oldKey=this.main,oldMain=oldKey===null?new Set<number>():this.components.get(oldKey)!,affected=new Set<number>([id]);
  if(add){
   const adjacent=new Set(this.neighbors(id).map(n=>this.membership.get(n)).filter((n):n is number=>n!==undefined));const joinsMain=oldKey!==null&&adjacent.has(oldKey);
   // Only formerly isolated roads change their main-network status in this merge.
   if(joinsMain)for(const key of adjacent)if(key!==oldKey)for(const n of this.components.get(key)!)affected.add(n);
   let key:number|undefined;for(const candidate of adjacent)if(key===undefined||this.components.get(candidate)!.size>this.components.get(key)!.size)key=candidate;
   if(key===undefined){key=this.nextId++;this.components.set(key,new Set());this.minima.set(key,id);}
   const group=this.components.get(key)!;group.add(id);this.membership.set(id,key);this.inspected=1;let min=Math.min(id,this.minima.get(key)!);
   for(const other of adjacent){if(other===key)continue;min=Math.min(min,this.minima.get(other)!);for(const n of this.components.get(other)!){group.add(n);this.membership.set(n,key);this.inspected++;}this.components.delete(other);this.minima.delete(other);}
   this.minima.set(key,min);this.chooseMain();if(!joinsMain&&oldKey!==this.main){for(const n of oldMain)affected.add(n);for(const n of this.components.get(this.main!)!)affected.add(n);}
  }else{
   this.kinds.delete(id);this.crossings.delete(id);this.busOnly.delete(id);this.directions.delete(id);const key=this.membership.get(id)!,old=this.components.get(key)!;this.components.delete(key);this.minima.delete(key);this.membership.delete(id);const remaining=new Set(old);remaining.delete(id);
   while(remaining.size){const first=remaining.values().next().value!;remaining.delete(first);const group=new Set<number>([first]),queue=[first],newKey=this.nextId++;let min=first;
    for(let i=0;i<queue.length;i++){const n=queue[i];this.inspected++;affected.add(n);this.membership.set(n,newKey);min=Math.min(min,n);for(const neighbor of this.neighbors(n))if(remaining.delete(neighbor)){group.add(neighbor);queue.push(neighbor);}}
    this.components.set(newKey,group);this.minima.set(newKey,min);
   }this.chooseMain();const current=this.main===null?new Set<number>():this.components.get(this.main)!;for(const n of oldMain)if(!current.has(n))affected.add(n);for(const n of current)if(!oldMain.has(n))affected.add(n);
  }return affected;
 }
}
