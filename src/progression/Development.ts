import {STAGES} from '../economy/Lifecycle';
import type {City} from '../simulation/City';
import {DEVELOPMENT_FACILITIES,isDevelopmentKind,type DevelopmentKind} from '../services/DevelopmentFacilities';
/** Lifecycle cities retain earned stages. Legacy cities use recorded peak population. */
export function developmentStage(city:Pick<City,'management'|'population'|'environment'|'wellness'>){
 if(city.management?.lifecycle)return city.management.lifecycle.highest;
 const peak=Math.max(city.population,city.environment?.highestPopulation??0);
 let highest=0;for(let i=1;i<STAGES.length;i++)if(peak>=STAGES[i].population)highest=i;
 for(const k of city.wellness.facilities.values())if(isDevelopmentKind(k))highest=Math.max(highest,DEVELOPMENT_FACILITIES[k].stage);
 return highest;
}
export function developmentUnlocked(city:Pick<City,'management'|'population'|'environment'|'wellness'>,kind:DevelopmentKind){return developmentStage(city)>=DEVELOPMENT_FACILITIES[kind].stage;}
export function developmentRequirement(city:Pick<City,'management'>,kind:DevelopmentKind){const f=DEVELOPMENT_FACILITIES[kind],s=STAGES[f.stage];return 'Lv'+(f.stage+1)+'「'+s.name+'」：人口'+s.population.toLocaleString('ja-JP')+'人'+(city.management?.lifecycle?'・サービス'+Math.round(s.service*100)+'%・資金と月次収支0以上を3か月維持':'（既存都市は記録済み最高人口で解放）');}
