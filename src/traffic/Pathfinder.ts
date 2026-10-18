import {RoadNetwork} from '../simulation/RoadNetwork';
class Heap {
 private a:{id:number;f:number;g:number}[]=[];
 push(n:{id:number;f:number;g:number}){let i=this.a.push(n)-1;while(i){const p=(i-1)>>1;if(this.a[p].f<=n.f)break;this.a[i]=this.a[p];i=p;}this.a[i]=n;}
 pop(){if(!this.a.length)return undefined;const top=this.a[0],n=this.a.pop()!;if(this.a.length){let i=0;while(i*2+1<this.a.length){let c=i*2+1;if(c+1<this.a.length&&this.a[c+1].f<this.a[c].f)c++;if(this.a[c].f>=n.f)break;this.a[i]=this.a[c];i=c;}this.a[i]=n;}return top;}
}
export class Pathfinder {
 private timedCache=new Map<string,number[]|null>();private costRevision=-1;private timedGraphRevision=-1;
 private cache=new Map<string,number[]|null>();private revision=-1;
 searches=0;expanded=0;exhausted=false;
 constructor(private graph:RoadNetwork,private cacheLimit=4096,private mode:'car'|'bus'|'walk'|'bike'='bus'){}
 resetBudget(){this.searches=0;this.expanded=0;this.exhausted=false;}
 path(start:number,goal:number,maxExpansions=200000,avoid:readonly number[]=[]):number[]|null {
  if(this.revision!==this.graph.revision){this.cache.clear();this.revision=this.graph.revision;}
  if(!this.graph.allows(start,this.mode)||!this.graph.allows(goal,this.mode)||!this.graph.sameComponent(start,goal)||avoid.includes(start)||avoid.includes(goal))return null;
  const key=start+':'+goal+(avoid.length?':avoid:'+avoid.join(','):'');const cached=this.cache.get(key);if(cached!==undefined)return cached;
  this.searches++;
  const h=(id:number)=>Math.abs(id%this.graph.size-goal%this.graph.size)+Math.abs(Math.floor(id/this.graph.size)-Math.floor(goal/this.graph.size));
  const heap=new Heap(),cost=new Map<number,number>([[start,0]]),parent=new Map<number,number>();heap.push({id:start,g:0,f:h(start)});
  for(let n=heap.pop();n;n=heap.pop()){
   if(n.g!==cost.get(n.id))continue;
   if(this.expanded>=maxExpansions){this.exhausted=true;return null;}this.expanded++;
   if(n.id===goal){const route=[goal];while(route[route.length-1]!==start)route.push(parent.get(route[route.length-1])!);route.reverse();this.remember(key,route);return route;}
   for(const id of this.graph.successors(n.id,this.mode)){if(avoid.length&&avoid.includes(id))continue;const g=n.g+1;if(g<(cost.get(id)??Infinity)){cost.set(id,g);parent.set(id,n.id);heap.push({id,g,f:g+h(id)});}}
  }
  this.remember(key,null);return null;
 }
 timePath(start:number,goal:number,weights:Float64Array,costRevision:number,minCost:number,maxExpansions=50000,queryLimit=2500):number[]|null {
  if(this.timedGraphRevision!==this.graph.revision||this.costRevision!==costRevision){this.timedCache.clear();this.timedGraphRevision=this.graph.revision;this.costRevision=costRevision;}
  if(!this.graph.allows(start,this.mode)||!this.graph.allows(goal,this.mode)||!this.graph.sameComponent(start,goal)||!Number.isFinite(weights[start])||!Number.isFinite(weights[goal]))return null;
  if(!Number.isFinite(minCost)||minCost<=0)throw new Error('Invalid minimum path cost');
  const key=start+':'+goal;const hit=this.timedCache.get(key);if(hit!==undefined)return hit;
  this.searches++;const began=this.expanded;
  const h=(id:number)=>(Math.abs(id%this.graph.size-goal%this.graph.size)+Math.abs(Math.floor(id/this.graph.size)-Math.floor(goal/this.graph.size)))*minCost;
  const heap=new Heap(),cost=new Map<number,number>([[start,0]]),parent=new Map<number,number>();heap.push({id:start,g:0,f:h(start)});
  for(let n=heap.pop();n;n=heap.pop()){
   if(n.g!==cost.get(n.id))continue;
   if(this.expanded>=maxExpansions||this.expanded-began>=queryLimit){this.exhausted=true;return null;}this.expanded++;
   if(n.id===goal){const path=[goal];while(path.at(-1)!==start)path.push(parent.get(path.at(-1)!)!);path.reverse();if(this.timedCache.size>=this.cacheLimit)this.timedCache.delete(this.timedCache.keys().next().value!);this.timedCache.set(key,path);return path;}
   for(const id of this.graph.successors(n.id,this.mode)){if(!Number.isFinite(weights[id]))continue;const edge=(weights[n.id]+weights[id])/2;if(edge<minCost)throw new Error('Path costs violate heuristic lower bound');const g=n.g+edge;if(g<(cost.get(id)??Infinity)){cost.set(id,g);parent.set(id,n.id);heap.push({id,g,f:g+h(id)});}}
  }
  return null;
 }
 private remember(key:string,path:number[]|null){if(this.cache.size>=this.cacheLimit)this.cache.delete(this.cache.keys().next().value!);this.cache.set(key,path);}
}
