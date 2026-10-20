import type {City} from '../simulation/City';
/** Presentation priority only. Service effects, request counts and simulation remain unchanged. */
export function warningPriority(c:City,r:{id:string;mode?:string;severity?:string}):0|1|2{
 if(r.id==='water-cost')return 2;
 if(r.id==='network'||r.id==='isolation'||r.id==='request-roads'||['power','water','drain','drainage'].includes(r.id))return 0;
 if(r.id==='education'&&c.population<100)return 2;
 if(r.id==='request-jobs'||r.id.startsWith('employment')||r.mode==='workAccess')return 1;
 return r.severity==='red'?1:2;
}
export const PRIORITY_LABELS=['先に整える：道路・生活基盤','優先して改善','余裕ができたら改善'] as const;
