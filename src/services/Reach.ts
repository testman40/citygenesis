import type {RoadNetwork} from '../simulation/RoadNetwork';
import type {Pathfinder} from '../traffic/Pathfinder';
/** Shared 6-B symmetric congestion cost, bounded P2 batches, no commuter mutation. */
export function* roadTimeField(network:RoadNetwork,weights:Float64Array,starts:number[],targets:number[],limit:number,pathfinder:Pathfinder,generation:number,profile:{expanded:number;maxBatchMs:number}):Generator<void,Float64Array>{
 const n=network.size*network.size,dist=new Float64Array(n);dist.fill(Infinity);
  if(targets.length<=32&&starts.length<=4){
   for(const target of targets){let best=Infinity;for(const source of starts){pathfinder.resetBudget();const path=pathfinder.timePath(source,target,weights,generation,.001,100000,4096);if(path){let cost=1;for(let i=1;i<path.length;i++)cost+=(weights[path[i-1]]+weights[path[i]])/2;best=Math.min(best,cost);}yield;}dist[target]=best<=limit?best:Infinity;}return dist;
  }
  const heap:{id:number;cost:number}[]=[];
  const push=(id:number,cost:number)=>{let i=heap.length;heap.push({id,cost});while(i){const p=(i-1)>>1;if(heap[p].cost<=cost)break;heap[i]=heap[p];i=p;}heap[i]={id,cost};};
  const pop=()=>{const first=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(last.cost<=heap[c].cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
  for(const road of starts)if(dist[road]>1){dist[road]=1;push(road,1);}
  let count=0,batch=performance.now();
  while(heap.length){const q=pop();if(q.cost!==dist[q.id])continue;profile.expanded++;
   for(const next of network.adjacent(q.id)){if(!network.isMain(next))continue;const cost=q.cost+(weights[q.id]+weights[next])/2;if(cost<dist[next]&&cost<=limit){dist[next]=cost;push(next,cost);}}
   if(++count%64===0){profile.maxBatchMs=Math.max(profile.maxBatchMs,performance.now()-batch);yield;batch=performance.now();}
  }return dist;
}
export function buildingTime(network:RoadNetwork,id:number,field:Float64Array){let best=Infinity;for(const road of network.adjacent(id))if(network.isMain(road))best=Math.min(best,field[road]+1);return best;}
