import type {SavedCell} from '../save/schema';
import type {City} from '../simulation/City';
import {eligibleStage} from '../economy/Lifecycle';
export const HOUSING_DENSITIES={low:{name:'低密度',units:4,levels:1,stage:0},medium:{name:'中密度',units:8,levels:2,stage:1},high:{name:'高密度',units:12,levels:3,stage:2}} as const;
export type HousingDensity=keyof typeof HOUSING_DENSITIES;
export const PARKING={cost:800,maintenance:4,spaces:24,walkRadius:5} as const;
export interface DistrictState {version:1;housing:[number,HousingDensity][];parking:number[]}
export function densityUnlocked(c:City,density:HousingDensity){return (c.management?.lifecycle?.highest??eligibleStage(c.lifeMetrics()))>=HOUSING_DENSITIES[density].stage;}
export class UrbanDevelopment {
 readonly housing=new Map<number,HousingDensity>();readonly parking=new Set<number>();
 constructor(state?:DistrictState){for(const [id,d] of state?.housing??[])this.housing.set(id,d);for(const id of state?.parking??[])this.parking.add(id);}
 snapshot():DistrictState{return {version:1,housing:[...this.housing].sort((a,b)=>a[0]-b[0]),parking:[...this.parking].sort((a,b)=>a-b)};}
}
export function validateDistricts(raw:unknown,size:number,cells:SavedCell[]):DistrictState{
 const s=raw as DistrictState;if(!s||s.version!==1||!Array.isArray(s.housing)||!Array.isArray(s.parking)||s.housing.length>size*size||s.parking.length>256)throw Error('住宅密度・駐車場データが不正です');
 const cellMap=new Map(cells.map(c=>[c.z*size+c.x,c])),seen=new Set<number>();
 const housing=s.housing.map(row=>{if(!Array.isArray(row)||row.length!==2)throw Error('住宅密度が不正です');const [id,d]=row;if(!Number.isInteger(id)||id<0||id>=size*size||seen.has(id)||!Object.hasOwn(HOUSING_DENSITIES,d)||cellMap.get(id)?.zone!==1||cellMap.get(id)!.level>HOUSING_DENSITIES[d].levels)throw Error('住宅密度の参照が不正です');seen.add(id);return [id,d] as [number,HousingDensity];});
 seen.clear();const parking=s.parking.map(id=>{if(!Number.isInteger(id)||id<0||id>=size*size||seen.has(id)||cellMap.has(id))throw Error('駐車場の位置が不正です');seen.add(id);return id;});return {version:1,housing,parking};
}
