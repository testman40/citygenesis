import type {RoadNetwork} from '../simulation/RoadNetwork';
/** Monthly rules: intentionally independent of visual weather, daylight and frame rate. */
export const GENERATION = {
 wind:{name:'風力発電',cost:650,maintenance:4,capacity:120,minimum:.55},
 solar:{name:'太陽光発電',cost:750,maintenance:3,capacity:90,minimum:.65},
};
export const MAX_GENERATORS=256;
export type GenerationKind=keyof typeof GENERATION;
export interface EnergyState {version:1;importEnabled:boolean;prices:{construction:number;maintenance:number};plants:{id:number;kind:GenerationKind}[]}
export function generationFactor(kind:GenerationKind,id:number,month:number){const min=GENERATION[kind].minimum;const wave=kind==='wind'?Math.sin(month*.71+(Math.imul(id,2654435761)>>>0)/4294967296*Math.PI*2):Math.cos((month%12)/12*Math.PI*2);return min+(1-min)*(.5+.5*wave);}
export class Energy {
 readonly plants=new Map<number,GenerationKind>();importEnabled=true;
 private outputs=new Map<number,number>();windSupply=0;solarSupply=0;
 constructor(readonly prices={construction:1,maintenance:1}){}
 cost(kind:GenerationKind){return GENERATION[kind].cost*this.prices.construction;}
 upkeep(kind:GenerationKind){return GENERATION[kind].maintenance*this.prices.maintenance;}
 get maintenance(){let sum=0;for(const kind of this.plants.values())sum+=this.upkeep(kind);return sum;}
 add(id:number,kind:GenerationKind){if(!['wind','solar'].includes(kind)||!Number.isSafeInteger(id)||id<0)throw Error('発電方式・座標が不正です');if(this.plants.has(id))throw Error('発電施設は設置済みです');if(this.plants.size>=MAX_GENERATORS)throw Error('再生可能発電施設数の上限です');this.plants.set(id,kind);}
 evaluate(month:number,network:RoadNetwork){this.outputs=new Map();this.windSupply=0;this.solarSupply=0;for(const [id,kind] of this.plants){const active=network.adjacent(id).some(r=>network.isMain(r)),output=active?GENERATION[kind].capacity*generationFactor(kind,id,month):0;this.outputs.set(id,output);if(kind==='wind')this.windSupply+=output;else this.solarSupply+=output;}}
 output(id:number){return this.outputs.get(id)??0;}
 get supply(){return this.windSupply+this.solarSupply;}
 displaySnapshot():Energy{return Object.assign(Object.create(Object.getPrototypeOf(this)),this);}
 snapshot():EnergyState{return {version:1,importEnabled:this.importEnabled,prices:{...this.prices},plants:[...this.plants].map(([id,kind])=>({id,kind}))};}
 static restore(state:EnergyState){const e=new Energy({...state.prices});e.importEnabled=state.importEnabled;for(const p of state.plants)e.add(p.id,p.kind);return e;}
}
export function validateEnergy(raw:unknown,size:number,occupied:Iterable<number>,river:Iterable<number>=[]):EnergyState{
 const v=raw as EnergyState;if(!v||v.version!==1||typeof v.importEnabled!=='boolean'||!v.prices||!['construction','maintenance'].every(k=>{const n=v.prices[k as keyof typeof v.prices];return typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=10;})||!Array.isArray(v.plants)||v.plants.length>MAX_GENERATORS)throw Error('電力データが不正です');
 const used=new Set([...occupied,...river]),seen=new Set<number>();const plants=v.plants.map(p=>{if(!p||!Number.isSafeInteger(p.id)||p.id<0||p.id>=size*size||!['wind','solar'].includes(p.kind)||used.has(p.id)||seen.has(p.id))throw Error('発電施設の位置・方式が不正です');seen.add(p.id);return {id:p.id,kind:p.kind};});
 return {version:1,importEnabled:v.importEnabled,prices:{construction:v.prices.construction,maintenance:v.prices.maintenance},plants};
}
