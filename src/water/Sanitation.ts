import type {RoadNetwork} from '../simulation/RoadNetwork';import {STAGES} from '../economy/Lifecycle';
export const SEWAGE = {
 sewage:{name:'基本下水処理場',cost:1800,maintenance:10,capacity:150,efficiency:.8,stage:0},
 advancedSewage:{name:'高度下水処理場',cost:4500,maintenance:24,capacity:600,efficiency:.95,stage:1},
};
export const SANITATION={minimumQuality:.85,maxPlants:128};
export type SewageKind=keyof typeof SEWAGE;
export interface SanitationState {version:1;highestStage:number;prices:{construction:number;maintenance:number};plants:{id:number;kind:SewageKind}[]}
export class Sanitation {
 readonly plants=new Map<number,SewageKind>();
 constructor(public highestStage=0,readonly prices={construction:1,maintenance:1}){}
 unlocked(kind:SewageKind){return this.highestStage>=SEWAGE[kind].stage;}
 advance(stage:number){this.highestStage=Math.max(this.highestStage,stage);}
 cost(kind:SewageKind){return SEWAGE[kind].cost*this.prices.construction;}
 upkeep(kind:SewageKind){return SEWAGE[kind].maintenance*this.prices.maintenance;}
 get maintenance(){let v=0;for(const k of this.plants.values())v+=this.upkeep(k);return v;}
 add(id:number,kind:SewageKind){if(!['sewage','advancedSewage'].includes(kind)||!Number.isSafeInteger(id)||id<0)throw Error('下水処理場の情報が不正です');if(!this.unlocked(kind))throw Error(SEWAGE[kind].name+'は最高到達「'+STAGES[SEWAGE[kind].stage].name+'」で解放されます');if(this.plants.has(id))throw Error('下水処理場は設置済みです');if(this.plants.size>=SANITATION.maxPlants)throw Error('下水処理場数の上限です');this.plants.set(id,kind);}
 inputs(network:RoadNetwork,power:number){return {minimumQuality:SANITATION.minimumQuality,plants:[...this.plants].map(([id,k])=>({id,capacity:network.adjacent(id).some(r=>network.isMain(r))?SEWAGE[k].capacity*Math.max(0,Math.min(1,power)):0,efficiency:SEWAGE[k].efficiency}))};}
 snapshot():SanitationState{return {version:1,highestStage:this.highestStage,prices:{...this.prices},plants:[...this.plants].map(([id,kind])=>({id,kind}))};}
 displaySnapshot():Sanitation{return Object.assign(Object.create(Object.getPrototypeOf(this)),this);}
 static restore(state:SanitationState){const s=new Sanitation(state.highestStage,{...state.prices});for(const p of state.plants)s.add(p.id,p.kind);return s;}
}
export function validateSanitation(raw:unknown,size:number,occupied:Iterable<number>,river:Iterable<number>):SanitationState {
 const s=raw as SanitationState;if(!s||s.version!==1||!Number.isInteger(s.highestStage)||s.highestStage<0||s.highestStage>=STAGES.length||!s.prices||!['construction','maintenance'].every(k=>{const n=s.prices[k as keyof typeof s.prices];return typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=10;})||!Array.isArray(s.plants)||s.plants.length>SANITATION.maxPlants)throw Error('下水管理データが不正です');
 const used=new Set([...occupied,...river]),seen=new Set<number>();const plants=s.plants.map(p=>{if(!p||!Number.isSafeInteger(p.id)||p.id<0||p.id>=size*size||!['sewage','advancedSewage'].includes(p.kind)||used.has(p.id)||seen.has(p.id)||s.highestStage<SEWAGE[p.kind].stage)throw Error('下水処理場の配置・解放情報が不正です');seen.add(p.id);return {id:p.id,kind:p.kind};});
 return {version:1,highestStage:s.highestStage,prices:{...s.prices},plants};
}
