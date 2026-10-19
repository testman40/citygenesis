import type {RoadNetwork} from '../simulation/RoadNetwork';
export const COMMUTE_REACH={walk:10,car:30,stop:5} as const;
type Mode='walk'|'car';
const cache=new WeakMap<RoadNetwork,{revision:number;values:Map<string,Map<number,number>>}>();
/** Distance follows usable road edges; entering/leaving a building costs one tile each. */
export function roadDistances(g:RoadNetwork,from:number,mode:Mode,limit:number):Map<number,number>{
 let memo=cache.get(g);if(!memo||memo.revision!==g.revision){memo={revision:g.revision,values:new Map()};cache.set(g,memo);}const key=from+':'+mode+':'+limit,hit=memo.values.get(key);if(hit)return hit;
 const result=new Map<number,number>(),queue:number[]=[];for(const id of g.has(from)?[from]:g.access(from)){if(g.allows(id,mode)){result.set(id,g.has(from)?0:1);queue.push(id);}}
 for(let i=0;i<queue.length;i++){const id=queue[i],d=result.get(id)!;if(d>=limit)continue;for(const n of g.successors(id,mode))if(!result.has(n)){result.set(n,d+1);queue.push(n);}}
 if(memo.values.size>=512)memo.values.delete(memo.values.keys().next().value!);memo.values.set(key,result);return result;
}
export function roadDistance(g:RoadNetwork,from:number,to:number,mode:Mode,limit:number){if(from===to)return 0;const d=roadDistances(g,from,mode,limit),ends=g.has(to)?[to]:g.access(to);return Math.min(Infinity,...ends.map(id=>(d.get(id)??Infinity)+(g.has(to)?0:1)));}
