import type {City} from '../simulation/City';
import type {Household} from './Residents';

export type MoodDirection='up'|'down';
export interface HouseholdMood {home:number;score:number;anchor:number;direction?:MoodDirection;changedAt:number;expires:number;from:number}
export const MOOD_THRESHOLD=3,MOOD_DURATION=6000;
export const moodIcon=(direction:MoodDirection)=>direction==='up'?'☻':'😢';
/** Local living indicator only; never changes migration, the city score or saved households. */
export function householdHappiness(c:City,h:Household):number{
 const r=c.residents;if(!r)return c.satisfaction;
 const home=h[1],tile=c.tile({x:home%c.size,z:Math.floor(home/c.size)}),adults=r.members(h).filter(p=>p.group==='大人'),jobs=adults.map(p=>r.job(c,p)),working=jobs.filter(j=>j?.employed);
 const employment=adults.length?working.length/adults.length:1,water=c.waterUtility?.status(home).service??c.hydrology?.at(home)??(tile.networkConnected?c.waterRatio:0),power=tile.networkConnected?c.powerRatio:0;
 const tax=Math.max(0,1-Math.max(0,c.taxRate-1)*c.config.taxDissatisfaction),minutes=working.length?working.reduce((sum,j)=>sum+j!.route.minutes,0)/working.length:0;
 let score=100*(power*c.config.powerSatisfactionWeight+water*c.config.waterSatisfactionWeight+employment*c.config.employmentSatisfactionWeight+tax*c.config.taxSatisfactionWeight)-Math.max(0,minutes-c.config.comfortableCommuteMinutes)*c.config.commuteSatisfactionPenalty+c.parks.at(home);
 if(c.safety.enabled){const s=c.safety.results.get(home);score-=(s?s.fireRisk+s.crimeRisk:c.safety.fireRisk+c.safety.crimeRisk)*c.safety.config.satisfactionPenalty;}
 const w=c.wellness.results.get(home);if(c.wellness.medicalEnabled)score-=(1-(w?.medical??0))*c.wellness.config.healthSatisfactionPenalty;
 if(c.wellness.educationEnabled)score-=(1-((w?.elementary??0)*.6+(w?.highSchool??0)*.4))*c.wellness.config.educationSatisfactionPenalty;
 score-=c.waterUtility?.penalty??0;
 const e=c.environment;if(e&&c.month-e.startMonth>=3){const p=e.at(home);score-=Math.min(4,Math.max(0,p.air-25)/75*2.5+Math.max(0,p.noise-30)/70*1.5+Math.max(0,p.water-25)/75*2);}
 return Math.round(Math.max(0,Math.min(100,score)));
}

/** Batches large towns; new households and city loads establish a silent baseline. */
export class HouseholdMoods {
 private owner:City|undefined;private states=new Map<number,HouseholdMood>();private cursor=0;private next=0;private seen=new Set<number>();private households:Household[]|undefined;
 revision=0;
 update(c:City,now:number,visible=true){
  if(c.updating)return;
  const families=c.residents?.households??[];
  if(this.owner!==c){this.owner=c;this.states.clear();this.cursor=0;this.next=0;this.seen.clear();this.households=undefined;this.revision++;}
  if(!visible){this.states.clear();this.cursor=0;this.next=0;this.seen.clear();this.households=undefined;this.revision++;return;}
  if(this.households!==families){this.households=families;this.cursor=0;this.next=0;this.seen.clear();}
  if(now<this.next)return;
  for(let count=0;this.cursor<families.length&&count<256;count++,this.cursor++){
   const h=families[this.cursor],score=householdHappiness(c,h),old=this.states.get(h[0]);this.seen.add(h[0]);
   if(!old||old.home!==h[1]){this.states.set(h[0],{home:h[1],score,anchor:score,changedAt:0,expires:0,from:score});this.revision++;continue;}
   if(score!==old.score)this.revision++;old.score=score;
   if(Math.abs(score-old.anchor)>=MOOD_THRESHOLD){old.from=old.anchor;old.direction=score>old.anchor?'up':'down';old.anchor=score;old.changedAt=now;old.expires=now+MOOD_DURATION;this.revision++;}
  }
  if(this.cursor>=families.length){for(const id of this.states.keys())if(!this.seen.has(id))this.states.delete(id);this.cursor=0;this.seen.clear();this.next=now+500;}
 }
 reaction(c:City,h:Household,now=performance.now()){const state=this.owner===c?this.states.get(h[0]):undefined;return state&&state.home===h[1]&&state.direction&&now<state.expires?{...state}:undefined;}
 get(c:City,h:Household,now=performance.now()):HouseholdMood{
  const state=this.owner===c?this.states.get(h[0]):undefined;
  if(!state||state.home!==h[1]){const score=householdHappiness(c,h);return {home:h[1],score,anchor:score,from:score,changedAt:0,expires:0};}
  return {...state,direction:now<state.expires?state.direction:undefined};
 }
}
export const householdMoods=new HouseholdMoods();
export function moodLabel(m:HouseholdMood){return '世帯幸福度 '+m.score+'/100'+(m.direction?' '+moodIcon(m.direction)+(m.direction==='up'?' 上昇':' 低下'):'');}
