import type {City} from '../simulation/City';
export const DEMAND_ZONES=['residential','commercial','industrial'] as const;
export type DemandValues=Record<typeof DEMAND_ZONES[number],number>;
const signed=(n:number)=>Math.round(Math.max(-100,Math.min(100,n)));
/** Planning pressure, distinct from the existing growth eligibility score. No building-rule changes. */
export function urbanDemand(c:City):DemandValues{
 const seekers=Math.max(0,c.workforce-c.employed),pressure=seekers?Math.max(1,Math.ceil(100*seekers/Math.max(1,c.workforce))):0,commercialPressure=seekers?Math.max(1,signed(100*seekers/(seekers+12))):0,vacantHomes=Math.max(0,c.housing-c.population),vacantJobs=Math.max(0,c.jobs-c.employed);
 return {residential:signed(100*(c.jobs-c.population-vacantHomes)/Math.max(10,c.population,c.jobs,c.housing)),commercial:Math.max(commercialPressure||-100,signed(100*(c.population/4-c.commercialJobs)/(c.population/4+c.commercialJobs+8))),industrial:pressure||signed(-100*vacantJobs/Math.max(4,c.workforce,c.jobs))};
}
export function demandAdvice(c:City){const d=urbanDemand(c);if(c.workforce>c.employed)return '働き口を探している住民がいます。商業・工業を住宅から通える場所に建てましょう。';const z=DEMAND_ZONES.reduce((a,b)=>d[b]>d[a]?b:a);return d[z]<=0?'建物に余裕があります。新しい区画を増やす前に入居と利用を待ちましょう。':z==='residential'?'住宅の需要が高いです。職場に通いやすい場所に住宅を建てましょう。':z==='commercial'?'商業の需要が高いです。お店を建てましょう。':'工業の需要が高いです。住宅から通える場所に工業を建てましょう。';}
