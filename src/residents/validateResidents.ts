import type {ResidentState,Household,Arrival} from './Residents';
import type {SavedCell} from '../save/schema';
export function validateResidents(raw:unknown,size:number,cells:SavedCell[],population:number,perLevel:number):ResidentState{
 const s=raw as ResidentState,n=(v:unknown,max:number)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)throw new Error('住民データの数値が不正です');return v;};
 if(!s||s.version!==1||!Array.isArray(s.households)||s.households.length>1000000||!Array.isArray(s.arrivals)||s.arrivals.length>16||typeof s.time!=='number'||!Number.isFinite(s.time)||s.time<0||s.time>1e12)throw new Error('住民データの形式が不正です');n(s.nextId,1e12);
 if(s.nameSeed!==undefined)n(s.nameSeed,0xffffffff);
 const homes=new Map(cells.filter(c=>c.zone===1&&c.level>0).map(c=>[c.z*size+c.x,c.level*perLevel])),ids=new Set<number>(),used=new Map<number,number>();
 const household=(h:Household)=>{if(!Array.isArray(h)||h.length!==4)throw new Error('世帯データが不正です');n(h[0],s.nextId-1);n(h[1],size*size-1);n(h[2],4);n(h[3],4);if(!h[0]||!h[2]||ids.has(h[0])||!homes.has(h[1]))throw new Error('世帯の識別番号・住宅が不正です');ids.add(h[0]);used.set(h[1],(used.get(h[1])??0)+h[2]);if(used.get(h[1])!>homes.get(h[1])!)throw new Error('世帯が住宅容量を超えています');return [...h] as Household;};
 const households=s.households.map(household);if(households.reduce((sum,h)=>sum+h[2],0)!==population)throw new Error('住民数と都市人口が一致しません');
 const arrivals=s.arrivals.map(a=>{if(!a||!Array.isArray(a.path)||!a.path.length||a.path.length>size*size||a.path.some(id=>!Number.isInteger(id)||id<0||id>=size*size)||typeof a.progress!=='number'||!Number.isFinite(a.progress)||a.progress<0||a.progress>=Math.max(1,a.path.length-1)||typeof a.blocked!=='boolean')throw new Error('転入車の経路・進捗が不正です');if(a.path.some((id,i)=>i>0&&Math.abs(id%size-a.path[i-1]%size)+Math.abs(Math.floor(id/size)-Math.floor(a.path[i-1]/size))!==1))throw new Error('転入経路が飛び飛びになっています');return {household:household(a.household),path:[...a.path],progress:a.progress,blocked:a.blocked} satisfies Arrival;});
 return {version:1,...(s.nameSeed!==undefined?{nameSeed:s.nameSeed}:{}),nextId:s.nextId,time:s.time,households,arrivals};
}
