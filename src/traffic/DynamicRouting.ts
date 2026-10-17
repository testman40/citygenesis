import {RoadNetwork} from '../simulation/RoadNetwork';import {Pathfinder} from './Pathfinder';import {apportion,type Commute} from './Traffic';import type {Balance} from '../simulation/config';import {ROUTING_CONFIG as P} from './routingConfig';
export interface CarLeg {path:number[];count:number}
export interface Flow {home:number;work:number;legs:CarLeg[]}
export interface RoutingState {mode:'time';lastMonth:number;epoch:number;cursor:number;flows:Flow[]}
export class DynamicRouting {
 enabled=false;lastMonth=-3;epoch=0;cursor=0;private flowGraphRevision=-1;private flows=new Map<string,Flow>();readonly finder:Pathfinder;
 profile={searches:0,expanded:0,moved:0,rounds:0,workMs:0,potentialBefore:0,potentialAfter:0,exhausted:false,uniqueNetwork:false};
 constructor(readonly graph:RoadNetwork,readonly config:Balance){this.finder=new Pathfinder(graph,config.maxPathCache);}
 due(month:number){return this.enabled&&month-this.lastMonth>=P.intervalMonths;}
 setMode(mode:'distance'|'time',month:number){if(this.enabled===(mode==='time'))return;this.enabled=mode==='time';this.lastMonth=month-P.intervalMonths;this.cursor=0;this.flows.clear();}
 private key(r:{home:number;work:number}){return r.home+':'+r.work;}
 multiplier(volume:number,capacity:number){return Math.min(this.config.maxCongestionMultiplier,1+this.config.congestionFactor*(volume/capacity)**this.config.congestionExponent);}
 private integral(volume:number,capacity:number){const {congestionFactor:f,congestionExponent:e,maxCongestionMultiplier:k,minutesPerRoad:m}=this.config;if(!f||k===1)return volume*m;if(!e)return volume*m*Math.min(k,1+f);const cutoff=capacity*((k-1)/f)**(1/e),a=Math.min(volume,cutoff);return m*(a+f*(a/capacity)**e*a/(e+1)+(volume-a)*k);}
 time(path:number[],volumes:Float64Array,capacity:(id:number)=>number){let minutes=this.config.accessMinutes*2;for(let i=1;i<path.length;i++)minutes+=this.config.minutesPerRoad*(this.multiplier(volumes[path[i-1]],capacity(path[i-1]))+this.multiplier(volumes[path[i]],capacity(path[i])))/2;return minutes;}
 reconcile(routes:Commute[],counts:number[]):CarLeg[][] {
  const checkPaths=this.flowGraphRevision!==this.graph.revision;const next=new Map<string,Flow>();const result=routes.map((r,i)=>{const count=counts[i];if(!count)return [];const old=this.flows.get(this.key(r));const valid=old?.legs.filter(l=>l.path[0]===r.path[0]&&l.path.at(-1)===r.path.at(-1)&&(!checkPaths||l.path.every((id,j)=>this.graph.has(id)&&(!j||this.graph.adjacent(l.path[j-1]).includes(id)))));
   const weights=valid?.length?valid.map(l=>l.count):[count],parts=apportion(count,weights),legs=(valid?.length?valid:[{path:r.path,count}]).map((l,j)=>({path:l.path,count:parts[j]})).filter(l=>l.count>0);next.set(this.key(r),{home:r.home,work:r.work,legs});return legs;});this.flows=next;this.flowGraphRevision=this.graph.revision;return result;
 }
 *rebalance(routes:Commute[],legs:CarLeg[][],volumes:Float64Array,capacity:(id:number)=>number,month:number):Generator<void>{
  if(!this.due(month))return;this.finder.resetBudget();this.profile={searches:0,expanded:0,moved:0,rounds:0,workMs:0,potentialBefore:0,potentialAfter:0,exhausted:false,uniqueNetwork:false};
  if(!routes.some((r,i)=>legs[i].length&&this.graph.componentHasCycle(r.path[0]))){this.lastMonth=month;this.profile.uniqueNetwork=true;return;}
  for(let id=0;id<volumes.length;id++)if(volumes[id])this.profile.potentialBefore+=this.integral(volumes[id],capacity(id));let potential=this.profile.potentialBefore;
  const weights=new Float64Array(volumes.length),limit=Math.min(P.maxOD,routes.length);const start=this.cursor;
  for(let round=0;round<P.rounds;round++){
   for(let id=0;id<weights.length;id++)weights[id]=this.graph.has(id)?this.config.minutesPerRoad*this.multiplier(volumes[id],capacity(id)):Infinity;
   const revision=++this.epoch;let moved=0;
   for(let n=0;n<limit;n++){
    yield;const began=performance.now(),index=(start+n)%routes.length,r=routes[index],paths=legs[index];if(!paths.length||!this.graph.componentHasCycle(r.path[0]))continue;
    let source=paths[0];for(const l of paths)if(this.time(l.path,volumes,capacity)>this.time(source.path,volumes,capacity))source=l;
    const candidate=this.finder.timePath(r.path[0],r.path.at(-1)!,weights,revision,this.config.minutesPerRoad,P.maxExpansions,P.queryExpansions);
    if(candidate){const oldTime=this.time(source.path,volumes,capacity),newTime=this.time(candidate,volumes,capacity),same=paths.find(l=>l.path.length===candidate.length&&l.path.every((id,j)=>id===candidate[j]));
     if(same!==source&&(same||paths.length<P.maxPaths)&&oldTime-newTime>=Math.max(P.minimumMinutes,oldTime*P.minimumRatio)){
      let amount=Math.floor(source.count*P.share);const deltas=new Map<number,number>();for(const id of source.path)deltas.set(id,(deltas.get(id)??0)-2);for(const id of candidate)deltas.set(id,(deltas.get(id)??0)+2);
      while(amount>0){let change=0,travelChange=0;for(const [id,delta] of deltas)if(delta){const old=volumes[id],next=Math.max(0,old+delta*amount),cap=capacity(id);change+=this.integral(next,cap)-this.integral(old,cap);travelChange+=next*this.multiplier(next,cap)-old*this.multiplier(old,cap);}
       if(change<-.000001&&travelChange<=.000001){for(const [id,delta] of deltas)volumes[id]=Math.max(0,volumes[id]+delta*amount);source.count-=amount;if(same)same.count+=amount;else paths.push({path:candidate,count:amount});for(let i=paths.length-1;i>=0;i--)if(!paths[i].count)paths.splice(i,1);potential+=change;moved+=amount;this.profile.moved+=amount;break;}amount=Math.floor(amount/2);
      }
     }
    }
    this.profile.workMs+=performance.now()-began;if(this.finder.expanded>=P.maxExpansions)break;
   }
   this.profile.rounds++;if(!moved||this.finder.expanded>=P.maxExpansions)break;
  }
  this.lastMonth=month;this.cursor=routes.length?(start+limit)%routes.length:0;Object.assign(this.profile,{searches:this.finder.searches,expanded:this.finder.expanded,potentialAfter:potential,exhausted:this.finder.exhausted});
 }
 clearUnique(){this.flows.clear();}
 skipUnique(month:number){if(!this.due(month))return;this.lastMonth=month;this.profile={searches:0,expanded:0,moved:0,rounds:0,workMs:0,potentialBefore:0,potentialAfter:0,exhausted:false,uniqueNetwork:true};}
 snapshot():RoutingState|undefined{return this.enabled?{mode:'time',lastMonth:this.lastMonth,epoch:this.epoch,cursor:this.cursor,flows:[...this.flows.values()].map(f=>({...f,legs:f.legs.map(l=>({count:l.count,path:[...l.path]}))}))}:undefined;}
 restore(s:RoutingState){this.enabled=true;this.lastMonth=s.lastMonth;this.epoch=s.epoch;this.cursor=s.cursor;this.flows=new Map(s.flows.map(f=>[this.key(f),{...f,legs:f.legs.map(l=>({count:l.count,path:[...l.path]}))}]));}
}
