import {ROAD_VISUAL,VEHICLE_VISUAL} from './visualConfig';
import type {VehiclePose} from './Traffic';
type Point={x:number;z:number};
export interface LaneCurve {road:number;next:number;size:number;p:Point[];lengths:number[];length:number;junction:boolean;uTurn?:{x:number;z:number;dx:number;dz:number}}
interface Piece {curve:LaneCurve;start:number;end:number;from:number;to:number}
export interface LaneLoop {key:string;curves:LaneCurve[];pieces:Piece[];duration:number;length:number;offset:number;finite?:boolean}
const point=(p:Point[],u:number)=>{const v=1-u;return {x:v*v*v*p[0].x+3*v*v*u*p[1].x+3*v*u*u*p[2].x+u*u*u*p[3].x,z:v*v*v*p[0].z+3*v*v*u*p[1].z+3*v*u*u*p[2].z+u*u*u*p[3].z};};
function curve(previous:number,road:number,next:number,size:number,junction:boolean):LaneCurve{const c={x:road%size+.5,z:Math.floor(road/size)+.5},ix=c.x-(previous%size+.5),iz=c.z-(Math.floor(previous/size)+.5),ox=next%size+.5-c.x,oz=Math.floor(next/size)+.5-c.z,o=ROAD_VISUAL.laneOffset;
 const a={x:c.x-ix*.5+iz*o,z:c.z-iz*.5-ix*o},b={x:c.x+ox*.5+oz*o,z:c.z+oz*.5-ox*o};let p:Point[];
 if(ix===-ox&&iz===-oz){p=[a,{x:c.x+ix*.28+iz*o,z:c.z+iz*.28-ix*o},{x:c.x+ix*.28-iz*o,z:c.z+iz*.28+ix*o},b];}
 else if(ix===ox&&iz===oz)p=[a,{x:a.x+(b.x-a.x)/3,z:a.z+(b.z-a.z)/3},{x:a.x+(b.x-a.x)*2/3,z:a.z+(b.z-a.z)*2/3},b];
 else{const q={x:c.x+(iz+oz)*o,z:c.z-(ix+ox)*o};p=[a,{x:a.x+(q.x-a.x)*2/3,z:a.z+(q.z-a.z)*2/3},{x:b.x+(q.x-b.x)*2/3,z:b.z+(q.z-b.z)*2/3},b];}
 const lengths=[0];let last=a,total=0;for(let i=1;i<=24;i++){const n=point(p,i/24);total+=Math.hypot(n.x-last.x,n.z-last.z);lengths.push(total);last=n;}return {road,next,size,p,lengths,length:ix===-ox&&iz===-oz?1+Math.PI*o:total,junction,...(ix===-ox&&iz===-oz?{uTurn:{x:c.x,z:c.z,dx:ix,dz:iz}}:{})};}
/** A closed out-and-back lane journey, including finite-radius terminal turns. */
export function buildLaneLoop(path:number[],size:number,edgeMinutes:number[],dwell:number[]=[],junction:(road:number)=>boolean=()=>false):LaneLoop{if(path.length<2||edgeMinutes.length!==path.length-1)throw Error('Invalid lane path');for(let i=1;i<path.length;i++)if(Math.abs(path[i]%size-path[i-1]%size)+Math.abs(Math.floor(path[i]/size)-Math.floor(path[i-1]/size))!==1)throw Error('Disconnected lane path');
 const order=[...path.map((_,i)=>i),...path.slice(1,-1).map((_,i)=>path.length-2-i)],curves:LaneCurve[]=[],pieces:Piece[]=[];let duration=0,length=0;
 for(let j=0;j<order.length;j++){const i=order[j],previous=order[(j+order.length-1)%order.length],next=order[(j+1)%order.length],c=curve(path[previous],path[i],path[next],size,junction(path[i]));curves.push(c);length+=c.length;const travel=(edgeMinutes[Math.min(i,previous)]+edgeMinutes[Math.min(i,next)])/2*(c.uTurn?VEHICLE_VISUAL.terminalTimeMultiplier:1),wait=(dwell[i]??0)*(i===0?2:1),turn=previous===next||((path[i]%size-path[previous]%size)!==(path[next]%size-path[i]%size)),stop=turn?.88:.5;
 const add=(time:number,from:number,to:number)=>{if(time>0){pieces.push({curve:c,start:duration,end:duration+time,from,to});duration+=time;}};
 if(wait){add(travel*stop,0,stop);add(wait,stop,stop);add(travel*(1-stop),stop,1);}else add(travel,0,1);
 }return {key:size+':'+path.join(','),curves,pieces,duration,length,offset:(dwell[0]??0)>0?pieces[1].start:0};}
export function sampleLaneLoop(loop:LaneLoop,time:number):VehiclePose{let phase=loop.finite?Math.max(0,Math.min(loop.duration-1e-9,time+loop.offset)):(time+loop.offset)%loop.duration;if(phase<0)phase+=loop.duration;let lo=0,hi=loop.pieces.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(loop.pieces[mid].end>phase)hi=mid;else lo=mid+1;}const piece=loop.pieces[lo],c=piece.curve,f=(phase-piece.start)/(piece.end-piece.start),arc=piece.from+(piece.to-piece.from)*f,distance=arc*c.length;let j=1;while(j<24&&c.lengths[j]<distance)j++;const span=c.lengths[j]-c.lengths[j-1],u=(j-1+(span?(distance-c.lengths[j-1])/span:0))/24,p=point(c.p,u),v=1-u,dx=3*v*v*(c.p[1].x-c.p[0].x)+6*v*u*(c.p[2].x-c.p[1].x)+3*u*u*(c.p[3].x-c.p[2].x),dz=3*v*v*(c.p[1].z-c.p[0].z)+6*v*u*(c.p[2].z-c.p[1].z)+3*u*u*(c.p[3].z-c.p[2].z);
 let position=p,angle=Math.atan2(dx,dz);if(c.uTurn){const t=c.uTurn,o=ROAD_VISUAL.laneOffset;let forward:number,left:number,vx:number,vz:number;if(distance<=.5){forward=distance-.5;left=o;vx=t.dx;vz=t.dz;}else if(distance<=.5+Math.PI*o){const a=(distance-.5)/o;forward=o*Math.sin(a);left=o*Math.cos(a);vx=t.dx*Math.cos(a)-t.dz*Math.sin(a);vz=t.dz*Math.cos(a)+t.dx*Math.sin(a);}else{forward=-(distance-.5-Math.PI*o);left=-o;vx=-t.dx;vz=-t.dz;}position={x:t.x+t.dx*forward+t.dz*left,z:t.z+t.dz*forward-t.dx*left};angle=Math.atan2(vx,vz);}
 const pose:VehiclePose={...position,angle,roadA:c.road,roadB:c.next,mapSize:c.size,laneAligned:true,junction:c.junction,piece:lo};Object.defineProperties(pose,{trajectory:{value:loop,enumerable:false},journeyTime:{value:time,enumerable:false}});return pose;}
export function laneVehicle(loop:LaneLoop,time:number,id:string,kind:NonNullable<VehiclePose['kind']>,clockTime=time){const pose=sampleLaneLoop(loop,time);pose.id=id;pose.kind=kind;Object.defineProperty(pose,'clockTime',{value:clockTime,enumerable:false});return pose;}


/** Finite directed itinerary, with private driveway endpoints; never reverses an A* path. */
export function buildLaneJourney(path:number[],size:number,minutes:number,dwell:Map<number,number>,junction:(road:number)=>boolean=()=>false){
 const reused=new Map<string,LaneCurve>(),curves:LaneCurve[]=[],pieces:Piece[]=[],arrivals=new Map<number,number>();let duration=0,length=0;
 for(let i=0;i<path.length;i++){const previous=path[i?i-1:1],next=path[i+1<path.length?i+1:i-1],key=previous+':'+path[i]+':'+next;let c=reused.get(key);if(!c){c=curve(previous,path[i],next,size,junction(path[i]));reused.set(key,c);}curves.push(c);length+=c.length;const from=i===0?.5:0,to=i===path.length-1?.5:1,stop=.5;
 const add=(time:number,a:number,b:number)=>{if(time>0){pieces.push({curve:c,start:duration,end:duration+time,from:a,to:b});duration+=time;}};
 const travel=minutes*(c.uTurn?VEHICLE_VISUAL.terminalTimeMultiplier:1);add(travel*(stop-from),from,stop);arrivals.set(i,duration);add(dwell.get(i)??0,stop,stop);add(travel*(to-stop),stop,to);
 }return {loop:{key:'finite:'+size+':'+path.join(','),curves,pieces,duration,length,offset:0,finite:true} satisfies LaneLoop,arrivals};
}

/** Directed circuit used when a legal return road differs from the outbound road. */
export function buildDirectedLaneLoop(path:number[],size:number,minutes:(road:number)=>number,junction:(road:number)=>boolean=()=>false):LaneLoop{
 const order=path[0]===path.at(-1)?path.slice(0,-1):path,curves:LaneCurve[]=[],pieces:Piece[]=[];let duration=0,length=0;
 for(let i=0;i<order.length;i++){const previous=order[(i+order.length-1)%order.length],road=order[i],next=order[(i+1)%order.length],c=curve(previous,road,next,size,junction(road)),time=minutes(road)*(c.uTurn?VEHICLE_VISUAL.terminalTimeMultiplier:1);curves.push(c);pieces.push({curve:c,start:duration,end:duration+time,from:0,to:1});duration+=time;length+=c.length;}
 return {key:'directed:'+size+':'+order.join(','),curves,pieces,duration,length,offset:0};
}
