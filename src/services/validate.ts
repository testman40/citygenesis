
import {WELLNESS_CONFIG} from './config';import {WELLNESS_KINDS,wellnessGroup,type WellnessState} from './Wellness';import type {SavedCell} from '../save/schema';import type {SafetyState} from '../safety/Safety';
export function validateWellness(raw:unknown,size:number,cells:SavedCell[],safety:SafetyState|undefined,population:number,month:number):WellnessState{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('医療・教育データが不正です');const s=raw as WellnessState;
 if(s.version!==1||typeof s.medicalEnabled!=='boolean'||typeof s.educationEnabled!=='boolean'||!s.config||!Array.isArray(s.facilities))throw new Error('医療・教育形式が不正です');
 const config={...WELLNESS_CONFIG};for(const key of Object.keys(config) as (keyof typeof config)[]){const v=s.config[key];if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e6)throw new Error('医療・教育設定が不正です');config[key]=v;}
 for(const k of ['healthFloor','healthMonthlyRate','basicMonthlyRate','advancedMonthlyRate','elementaryDemandRatio','highSchoolDemandRatio','minimumMigrationFactor'] as const)if(config[k]>1)throw new Error('医療・教育比率が不正です');
 if(config.medicalMinutes<=0||config.schoolMinutes<=0||!Number.isInteger(config.maxFacilities)||config.maxFacilities<1||config.maxFacilities>32||s.facilities.length>config.maxFacilities)throw new Error('医療・教育設定範囲が不正です');
 for(const k of ['health','basicGraduates','advancedGraduates','populationReference','lastMonth'] as const)if(typeof s[k]!=='number'||!Number.isFinite(s[k])||s[k]<0)throw new Error('住民集計が不正です');
 if(s.health>1||s.populationReference!==population||s.basicGraduates>population||s.advancedGraduates>s.basicGraduates||!Number.isInteger(s.lastMonth)||s.lastMonth>month||(!s.educationEnabled&&(s.basicGraduates||s.advancedGraduates)))throw new Error('住民集計範囲が不正です');
 const occupied=new Set(cells.map(t=>t.z*size+t.x));for(const t of safety?.stations??[])occupied.add(t.id);
 const facilities=s.facilities.map(f=>{if(!f||!Number.isInteger(f.id)||f.id<0||f.id>=size*size||!WELLNESS_KINDS.includes(f.kind)||occupied.has(f.id))throw new Error('医療・教育施設の配置が不正です');occupied.add(f.id);if(wellnessGroup(f.kind)==='medical'?!s.medicalEnabled:!s.educationEnabled)throw new Error('サービス政策が無効です');return {id:f.id,kind:f.kind};});
 return {version:1,medicalEnabled:s.medicalEnabled,educationEnabled:s.educationEnabled,config,facilities,health:s.health,basicGraduates:s.basicGraduates,advancedGraduates:s.advancedGraduates,populationReference:s.populationReference,lastMonth:s.lastMonth};
}
