
import {SAFETY_CONFIG,type SafetyState} from './Safety';
import type {SavedCell} from '../save/schema';
export function validateSafety(raw:unknown,size:number,cells:SavedCell[]):SafetyState{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('安全サービスデータが不正です');
 const s=raw as SafetyState;
 if(s.version!==1||typeof s.enabled!=='boolean'||!s.config||!Array.isArray(s.stations))throw new Error('安全サービス形式が不正です');
 const config={...SAFETY_CONFIG};
 for(const key of Object.keys(config) as (keyof typeof config)[]){const v=s.config[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e6)throw new Error('安全サービス設定が不正です');config[key]=v;}
 if(!Number.isInteger(config.maxStations)||config.maxStations<1||config.maxStations>32||config.maxResponseMinutes<=0||config.riskReduction>1||config.fireRiskResidential>1||config.fireRiskCommercial>1||config.fireRiskIndustrial>1||s.stations.length>config.maxStations)throw new Error('安全サービス設定範囲が不正です');
 const occupied=new Set(cells.map(t=>t.z*size+t.x)),seen=new Set<number>();
 const stations=s.stations.map(t=>{if(!t||!Number.isInteger(t.id)||t.id<0||t.id>=size*size||(t.kind!=='fire'&&t.kind!=='police')||seen.has(t.id)||occupied.has(t.id))throw new Error('署の配置が不正です');seen.add(t.id);return {id:t.id,kind:t.kind};});
 if(stations.length&&!s.enabled)throw new Error('安全政策が無効です');
 return {version:1,enabled:s.enabled,config,stations};
}
