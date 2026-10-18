import type {RoadNetwork} from '../simulation/RoadNetwork';
export interface FootPoint {x:number;z:number;crossing?:number}
const corners=[[-.455,-.455],[.455,-.455],[.455,.455],[-.455,.455]];
/** Four curb corners per road cell. Cross an arm only at a designated crossing. */
export function sidewalkPath(g:RoadNetwork,home:number,target:number):FootPoint[]{
 const n=g.size,point=(node:number):FootPoint=>{const id=Math.floor(node/4),c=[...corners[node%4]],bay=g.bayWalk.get(id);if(bay!==undefined){if(bay===1&&c[1]<0)c[1]=-.86;if(bay===3&&c[1]>0)c[1]=.86;if(bay===0&&c[0]<0)c[0]=-.86;if(bay===2&&c[0]>0)c[0]=.86;}return {x:id%n+.5+c[0],z:Math.floor(id/n)+.5+c[1]};};
 const access=(id:number)=>g.adjacent(id).filter(r=>g.allows(r,'walk')).flatMap(r=>{const dx=id%n-r%n,dz=Math.floor(id/n)-Math.floor(r/n);return (dx>0?[1,2]:dx<0?[0,3]:dz>0?[2,3]:[0,1]).map(c=>r*4+c);});
 const starts=access(home),goals=new Set(access(target));if(!starts.length||!goals.size)return [];const queue=[...starts],parent=new Map<number,number>(),cross=new Map<number,number>();for(const s of starts)parent.set(s,s);
 for(let i=0;i<queue.length&&i<20000;i++){const node=queue[i],id=Math.floor(node/4),c=node%4;if(goals.has(node)){const result:FootPoint[]=[];let cursor=node;while(true){const p=point(cursor),edge=cross.get(cursor);if(edge!==undefined)p.crossing=edge;result.push(p);const next=parent.get(cursor)!;if(next===cursor)break;cursor=next;}return result.reverse();}
  const add=(to:number,crossing?:number)=>{if(parent.has(to))return;parent.set(to,node);if(crossing!==undefined)cross.set(to,crossing);queue.push(to);};
  for(const d of [-1,1]){const to=(c+d+4)%4,edge=Math.min(c,to)===0&&Math.max(c,to)===3?3:Math.min(c,to),arm=[id-n,id+1,id+n,id-1][edge],across=g.adjacent(id).includes(arm);if(!across||g.crossingAllowed(id))add(id*4+to,across?id:undefined);}
  const links=c===0?[[id-1,1],[id-n,3]]:c===1?[[id+1,0],[id-n,2]]:c===2?[[id+1,3],[id+n,1]]:[[id-1,2],[id+n,0]];
  for(const [next,corner] of links)if(g.adjacent(id).includes(next)&&g.allows(next,'walk'))add(next*4+corner);
 }return [];
}
export function pedestrianGreen(time:number){const phase=((time%8)+8)%8;return phase>=6.6;}
export function footPose(path:FootPoint[],fraction:number,green:(road:number)=>boolean=()=>true){if(!path.length)return;const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z));const distance=Math.max(0,Math.min(1,fraction))*lengths.at(-1)!;let i=1;while(i<path.length-1&&lengths[i]<distance)i++;if(path.length===1)return {...path[0],waiting:false};const a=path[i-1],b=path[i],wait=b.crossing!==undefined&&!green(b.crossing),t=wait?0:Math.max(0,Math.min(1,(distance-lengths[i-1])/(lengths[i]-lengths[i-1]||1)));return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,waiting:wait};}
/** Advance with the game clock; once a crossing is entered it is completed even after green ends. */
export class FootWalker {
 private key='';private fraction=0;private desired=0;
 get progress(){return this.fraction;}
 step(path:FootPoint[],desired:number,key:string,green:(road:number)=>boolean){if(this.key!==key){this.key=key;this.fraction=0;this.desired=0;}let next=Math.min(1,this.fraction+Math.max(0,desired-this.desired));this.desired=desired;const lengths=[0];for(let i=1;i<path.length;i++)lengths.push(lengths[i-1]+Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z));const total=lengths.at(-1)??0;let waiting=false;for(let i=1;i<path.length;i++)if(path[i].crossing!==undefined&&this.fraction*total<=lengths[i-1]+1e-9&&next*total>=lengths[i-1]-1e-9&&desired>0&&!green(path[i].crossing!)){next=total?lengths[i-1]/total:0;waiting=true;break;}this.fraction=next;const pose=footPose(path,next,()=>true);let crossing:number|undefined;for(let i=1;i<path.length;i++)if(next*total>lengths[i-1]+1e-9&&next*total<lengths[i]-1e-9&&path[i].crossing!==undefined)crossing=path[i].crossing;return pose?{...pose,waiting,crossing}:undefined;}
}
