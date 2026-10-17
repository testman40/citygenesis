export const SECTORS=['fire','police','medical','education','transit'] as const;
export type Sector=typeof SECTORS[number];
export type Rates=Record<Sector,number>;
export interface BudgetState {version:1;target:Rates;funded:Rates;effective:Rates}
export const BUDGET_CONFIG={monthlyStep:.1,maximumAbility:1.25};
export const defaults=():Rates=>({fire:1,police:1,medical:1,education:1,transit:1});
export class Budget {
 target=defaults();funded=defaults();effective=defaults();
 set(k:Sector,v:number){if(!SECTORS.includes(k)||!Number.isFinite(v)||v<.5||v>1.5)throw new Error('予算は50〜150%です');this.target={...this.target,[k]:v};}
 advance(){this.funded={...this.target};this.effective={...this.effective};for(const k of SECTORS){const goal=Math.min(BUDGET_CONFIG.maximumAbility,this.target[k]);this.effective[k]=Math.round((this.effective[k]+Math.max(-BUDGET_CONFIG.monthlyStep,Math.min(BUDGET_CONFIG.monthlyStep,goal-this.effective[k])))*1e10)/1e10;}}
 get changed(){return SECTORS.some(k=>this.target[k]!==1||this.funded[k]!==1||this.effective[k]!==1);}
 snapshot():BudgetState{return {version:1,target:{...this.target},funded:{...this.funded},effective:{...this.effective}};}
 restore(s:BudgetState){this.target={...s.target};this.funded={...s.funded};this.effective={...s.effective};}
}
export function validateBudget(v:any):BudgetState {if(!v||v.version!==1)throw new Error('予算データが不正です');const out=new Budget().snapshot();for(const key of ['target','funded','effective'] as const)for(const k of SECTORS){const n=v[key]?.[k];if(typeof n!=='number'||!Number.isFinite(n)||n<.5||n>(key==='effective'?BUDGET_CONFIG.maximumAbility:1.5))throw new Error('予算倍率が不正です');out[key][k]=n;}return out;}
