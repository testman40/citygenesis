import {urbanDemand,type DemandValues} from '../demand/Demand';
import {appendMonthly,monthlyPoint,type StatisticsState} from '../statistics/CityStatistics';
import {developmentUnlocked,developmentRequirement} from '../progression/Development';
import {isDevelopmentKind,type DevelopmentKind} from '../services/DevelopmentFacilities';
import {CityEnvironment,type EnvironmentInputs} from '../environment/Environment';
import {environmentInputs} from '../environment/CityInputs';
import {bayCells} from '../transit/BusBays';
import {Residents,type Place} from '../residents/Residents';
import {ParkEffects,PARK_EFFECTS} from '../scenery/ParkEffects';
import {quoteBridge} from '../roads/Bridge';
import {WaterUtility} from '../water/WaterUtility';
import {Sanitation,SEWAGE,SANITATION,type SewageKind} from '../water/Sanitation';
import {Energy,GENERATION,MAX_GENERATORS,type GenerationKind} from '../energy/Energy';
import {Hydrology,WATER} from '../water/Hydrology';
import {BUS_INFRA} from '../transit/BusOperations';
import {gridStroke} from './GridInput';
import {createLifecycle,eligibleStage,advanceLifecycle,populationDelta,vacancy,crisis,LIFE_BALANCE,STAGES,type LifecycleState} from '../economy/Lifecycle';
import {DIFFICULTIES,balanceFor,scaleServicePrices,type Difficulty} from '../economy/config';
import {createManagement,smoothDemand,money,type ManagementState,type Ledger,type Costs} from '../economy/Management';
import {Budget,type Sector} from '../budget/Budget';
import {Wellness,wellnessGroup,type WellnessKind} from '../services/Wellness';
import {Safety} from '../safety/Safety';
import {Transit} from '../transit/Transit';
import type {TransitBalance} from '../transit/config';
import { BALANCE, type Balance } from './config';
import type { CityState } from '../save/schema';
import { RoadNetwork } from './RoadNetwork';
import {Traffic,apportion,type Home,type Workplace} from '../traffic/Traffic';
export interface Cell { x: number; z: number }
export type Zone = 'residential' | 'commercial' | 'industrial';
export type Facility = DevelopmentKind | 'park'|'plaza'|'externalWater'|'sewage'|'advancedSewage'|'wind' | 'solar' | 'outfall' | 'depot' | 'power' | 'water' | 'fire' | 'police' | 'clinic' | 'hospital' | 'elementary' | 'highSchool';
export type Tool = 'crossing' | 'select' | 'road' | 'erase' | Zone | Facility | 'bus-stop' | 'bus-remove' | 'pipe' | 'pipe-remove' | 'bridge';
export const CHUNK_SIZE = 16;
export const ZONES: Zone[] = ['residential', 'commercial', 'industrial'];
interface Chunk { roads: Uint8Array; zones: Uint8Array; levels: Uint8Array; ages: Uint16Array; facilities:Uint8Array; decline:Uint16Array }
export interface Tile { road: boolean; zone: Zone | null; level: number; connected: boolean; networkConnected:boolean; facility:Facility|null }
export class City {
  /** A prepared road transaction changes its publication generation, not its graph content. */
  adoptNetworkRevision(revision:number){if(!Number.isSafeInteger(revision)||revision<0)throw new Error('道路更新番号が不正です');const from=this.network.revision;this.network.revision=revision;this.traffic.adoptGraphRevision(from,revision);this.transit.adoptGraphRevision(from,revision);}
  static workerExecutor:((state:CityState,signal?:AbortSignal)=>Promise<{state:CityState;cpuMs:number}>)|undefined;
  private bulkDue(){let count=0;for(const {t,chunk,i} of this.censusRows())if((t.level>0&&chunk.decline[i]>=this.config.declineMonths-1)||(t.level<this.config.maxLevel&&chunk.ages[i]>=this.config.growthMonths-1))if(++count>=128)return true;return false;}
  private async stepInWorker(options:{budgetMs?:number;yieldTask?:()=>Promise<void>;signal?:AbortSignal}){const state=this.snapshot(),started=performance.now(),revision=this.traffic.solveRevision,lastMessage=this.lastMessage;this.updating=true;const profile={cpuMs:0,maxSliceMs:0,slices:0,elapsedMs:0};try{const result=await City.workerExecutor!(state,options.signal),restored=await City.fromStateAsync(result.state,{...options,profile});if(options.signal?.aborted)throw new DOMException('都市更新を取り消しました','AbortError');if(restored.size!==this.size)throw new Error('都市更新のサイズが不正です');Object.assign(this,restored);this.updating=true;this.lastMessage=lastMessage;this.traffic.solveRevision=revision+1;Object.assign(this.stepProfile,{workMs:profile.cpuMs,maxSliceMs:profile.maxSliceMs,slices:profile.slices,workerCpuMs:result.cpuMs,elapsedMs:performance.now()-started});}catch(error){this.abandoned=true;throw error;}finally{this.updating=false;}}

  statistics?:StatisticsState;
  environment?:CityEnvironment;private environmentInputRevision=0;private environmentCache:EnvironmentInputs|undefined;
  environmentInputs(){const key=[this.environmentInputRevision,this.network.revision,this.traffic.solveRevision,this.month,this.population,Math.floor(this.residents?.state.time??12)].join(':');if(this.environmentCache?.key!==key)this.environmentCache=environmentInputs(this,key,this.censusRows().map(r=>({id:r.c.z*this.size+r.c.x,zone:r.t.zone,level:r.t.level,connected:r.t.networkConnected})),[...this.facilities.values()].map(c=>({id:c.z*this.size+c.x,kind:this.tile(c).facility!})).concat([...(this.energy?.plants??[])].map(([id,kind])=>({id,kind}))));return this.environmentCache;}
  enableEnvironment(){if(!this.environment)this.environment=new CityEnvironment(this.size,this.month);this.environment.sync(this.environmentInputs());}
  advanceEnvironment(seconds:number){if(this.updating||this.abandoned||seconds<=0)return;this.enableEnvironment();this.environment!.advance(seconds,this.environmentInputs());}
  private environmentMonth(){if(!this.environment)return;this.environment.sync(this.environmentInputs());this.environment.observeMonth(this.month,{population:this.population,water:this.waterRatio,employment:this.workforce?this.employed/this.workforce:1,balance:this.balance,walkers:this.transit.walkers,cyclists:this.transit.cyclists,riders:this.transit.riders,congestion:this.traffic.congestionRate,minutes:this.traffic.averageMinutes,generated:this.waterUtility?.generated??this.hydrology?.discharged??0,residual:this.waterUtility?.residual??this.hydrology?.untreated??0});}
  residents?:Residents;
  get workforce(){return this.residents?.workforce??Math.floor(this.population*this.config.workforceRatio);}
  residentHomes(){return this.censusRows().filter(r=>r.t.zone==='residential'&&r.t.level>0).map(r=>({id:r.c.z*this.size+r.c.x,capacity:r.t.level*this.config.residentsPerLevel}));}
  enableResidents(){if(this.residents)return;this.residents=new Residents();this.residents.seed(this.residentHomes().sort((a,b)=>Number(this.network.isMain(this.network.adjacent(b.id)[0]))-Number(this.network.isMain(this.network.adjacent(a.id)[0]))),this.population);this.recount();}
  advanceResidents(seconds:number){if(this.updating||this.abandoned)return false;const changed=this.residents?.advance(this,seconds)??false;if(changed){this.population=this.residents!.population;this.recount();}return changed;}
  streetVehicles(time=this.traffic.displayTime,budget=Infinity){this.network.signalTime=this.traffic.displayTime*.12;return this.residents?this.residents.vehicles(this):this.traffic.vehicles(time,budget);}
  management?:ManagementState;private lastLedger?:Ledger;private levelTotal=0;private residentialStock=0;private workStock=0;private projectedDemand:Record<Zone,number>={residential:0,commercial:0,industrial:0};
  get difficulty():Difficulty{return this.management?.difficulty??'normal';}
  static create(size:number,difficulty:Difficulty='normal'){return new City(size,balanceFor(difficulty),undefined,createManagement(difficulty));}
  enableLifecycle(mode:LifecycleState['mode']='evolve'){if(this.updating||this.abandoned)throw new Error('都市更新中は変更できません');if(this.management?.lifecycle){if(this.management.lifecycle.mode==='observe'&&mode==='evolve'){this.management.lifecycle.mode='evolve';return;}throw new Error('都市再生モデルは設定済みです');}this.management??=createManagement('normal');this.management.lifecycle=createLifecycle(this.month,mode);}
  lifeMetrics(){const active:number[]=[this.powerRatio,this.waterRatio];if(this.safety.enabled)active.push(this.safety.fireCoverage,this.safety.policeCoverage);if(this.wellness.medicalEnabled)active.push(this.wellness.medicalCoverage);if(this.wellness.educationEnabled)active.push(this.wellness.elementaryCoverage,this.wellness.highSchoolCoverage);const workers=this.workforce;return {month:this.month,population:this.population,funds:this.funds,balance:this.balance,satisfaction:this.satisfaction,employment:workers?Math.min(1,this.employed/workers):1,debt:this.management?.debt??0,service:active.reduce((a,b)=>a+b,0)/active.length,vacancy:vacancy(this.population,this.residentialStock),operation:this.workStock?Math.min(1,this.employed/this.workStock):0};}
  lifecycle(){const state=this.management?.lifecycle,metrics=this.lifeMetrics();return {state,metrics,stage:STAGES[state?.stage??eligibleStage(metrics)].name,unlocks:STAGES.slice(0,(state?.highest??0)+1).flatMap(s=>[...s.unlocks]),warning:crisis(state,metrics,this.financeCosts().interest,this.tax)};}
  private recordHistory(){const s=this.management?.lifecycle;if(s)advanceLifecycle(s,this.lifeMetrics());if(this.sanitation)this.sanitation.advance(s?.highest??eligibleStage(this.lifeMetrics()));}
  emergencyLoan(){if(this.updating||this.abandoned)throw new Error('都市更新中は融資を予約してください');if(this.funds>=0||(this.management?.debt??0)>0)throw new Error('緊急融資は赤字資金・借入なしの都市だけ利用できます');const p=this.management?.parameters??DIFFICULTIES.normal,amount=Math.max(p.loanAmount,Math.ceil(-this.funds+p.loanReserve));if(amount>p.loanLimit)throw new Error('融資枠を超えています。維持費を削減してください');this.management??=createManagement('normal');this.management.debt=amount;this.funds=money(this.funds+amount);return amount;}
  financeCosts():Costs{const costs=this.budgetCosts();return {roads:[...this.network.ids()].reduce((sum,id)=>sum+this.network.profile(id).upkeep,0)*this.config.roadMaintenance,buildings:this.levelTotal*this.config.buildingMaintenancePerLevel+this.sceneryMaintenance,power:this.powerPlants*this.config.powerMaintenance+(this.energy?.maintenance??0),water:this.waterPlants*this.config.waterMaintenance+(this.hydrology?.maintenance??0)+(this.sanitation?.maintenance??0)+(this.waterUtility?.maintenance??0)+(this.waterUtility?.purchaseCost??0),fire:costs.fire*this.budget.funded.fire,police:costs.police*this.budget.funded.police,medical:costs.medical*this.budget.funded.medical,education:costs.education*this.budget.funded.education,transit:this.transit.maintenance,interest:(this.management?.debt??0)*(this.management?.parameters.loanInterest??0)};}
  finance(){const costs=this.financeCosts(),tax=money((this.population*this.config.residentTax*this.powerRatio+this.employed*this.config.jobTax)*this.taxRate),maintenance=money(Object.values(costs).reduce((a,b)=>a+b,0));const growthBlocked:string[]=[];if(this.funds<0)growthBlocked.push('資金不足');if(this.powerRatio<this.config.growthSupplyThreshold)growthBlocked.push('電力不足');if(this.waterRatio<this.config.growthSupplyThreshold)growthBlocked.push('水道不足');if(this.satisfaction<this.config.growthSatisfaction)growthBlocked.push('満足度'+this.satisfaction+'（必要'+this.config.growthSatisfaction+'）');return {growthDemand:{...this.projectedDemand},growthBlocked,difficulty:this.difficulty,legacy:!this.management,previous:this.lastLedger??this.management?.ledger??null,forecast:{tax,costs,maintenance,balance:money(tax-maintenance)},debt:this.management?.debt??0,canBorrow:this.funds<0&&!(this.management?.debt),parameters:this.management?.parameters??DIFFICULTIES.normal};}
  zoneCells(){return this.zoned.values();}
  private chunks = new Map<string, Chunk>();
  private zoned = new Map<string, Cell>();
  waterUtility?:WaterUtility;sanitation?:Sanitation;energy?:Energy;hydrology?:Hydrology;
  readonly network:RoadNetwork;
  readonly traffic:Traffic;
  readonly budget=new Budget();
  budgetCosts(){const base={fire:0,police:0,medical:0,education:0,transit:this.transit.maintenance/this.budget.funded.transit};for(const k of this.safety.stations.values())base[k]+=k==='fire'?this.safety.config.fireMaintenance:this.safety.config.policeMaintenance;for(const k of this.wellness.facilities.values())base[wellnessGroup(k)==='medical'?'medical':'education']+=this.wellness.baseUpkeep(k);return base;}
  setBudget(k:Sector,v:number){if(this.updating||this.abandoned)throw new Error('都市更新中はキューを使用してください');this.budget.set(k,v);}
  private applyBudget(){this.safety.budget={fire:this.budget.effective.fire,police:this.budget.effective.police};this.safety.funding={fire:this.budget.funded.fire,police:this.budget.funded.police};this.wellness.budget={medical:this.budget.effective.medical,education:this.budget.effective.education};this.wellness.funding={medical:this.budget.funded.medical,education:this.budget.funded.education};this.transit.setBudget(this.budget.effective.transit,this.budget.funded.transit);}
  readonly transit:Transit;
  readonly safety:Safety;
  readonly wellness:Wellness;
  private levelsCurrent=false;private zoneChunks=new Set<string>();private homeBuffer:Home[]=[];private workBuffer:Workplace[]=[];private commercialBuffer:Workplace[]=[];private industrialBuffer:Workplace[]=[];private weightBuffer:number[]=[];
  private censusDirty=true;private censusVersion=-1;
  private census:{c:Cell;t:Tile;chunk:Chunk;i:number;home?:Home;workplace?:Workplace}[]=[];
  private facilities=new Map<string,Cell>();
  powerSupply=0;waterSupply=0;powerDemand=0;waterDemand=0;powerRatio=1;waterRatio=1;
  private sceneryMaintenance=0;readonly parks=new ParkEffects();sceneryBonus=0;
  powerPlants=0;waterPlants=0;satisfaction=100;taxRate=1;infrastructureMaintenance=0;
  setTaxRate(value:number){if(this.updating||this.abandoned)throw new Error("都市更新中の税変更はキューを使用してください");if(!Number.isFinite(value)||value<.5||value>2)throw new Error('税率が不正です');this.taxRate=value;this.recount();}
  readonly dirty = new Set<string>();
  roadCount = 0;
  funds: number;
  month = 0;
  population = 0;
  jobs = 0;
  employed = 0;
  commercialEmployed = 0;
  industrialEmployed = 0;
  housing = 0;
  commercialJobs = 0;
  industrialJobs = 0;
  buildingCount = 0;
  disconnected = 0;
  tax = 0;
  maintenance = 0;
  balance = 0;
  constructionSpending = 0;
  demand: Record<Zone, number> = { residential: 0, commercial: 0, industrial: 0 };
  private safetyDeferred=false;
  private abandoned=false;
  updating=false;readonly stepProfile={slices:0,maxSliceMs:0,elapsedMs:0,workMs:0,workerCpuMs:0};
  lastMessage = '';
  constructor(readonly size = 64, readonly config: Balance = { ...BALANCE },transitConfig?:TransitBalance,management?:ManagementState) {
    if (!Number.isInteger(size) || size < 1) throw new Error('Invalid map size');
    this.network=new RoadNetwork(size);this.safety=new Safety(this.network);this.wellness=new Wellness(this.network);this.transit=new Transit(this.network,transitConfig);this.traffic=new Traffic(this.network,config,this.transit);this.management=management?structuredClone(management):undefined;if(this.management){scaleServicePrices(this.safety.config,this.management.parameters);scaleServicePrices(this.wellness.config,this.management.parameters);if(!transitConfig)scaleServicePrices(this.transit.config,this.management.parameters);this.lastLedger=this.management.ledger;}this.funds = config.initialFunds; this.recount();
  }
  snapshot():CityState {
    if(this.updating||this.abandoned)throw new Error("都市更新の途中状態は保存できません");
    const cells:CityState['cells']=[];
    for(const [key,chunk] of this.chunks){const [cx,cz]=key.split(',').map(Number);for(let i=0;i<256;i++){
      if(chunk.roads[i]||chunk.zones[i]||chunk.facilities[i])cells.push({x:cx*16+i%16,z:cz*16+Math.floor(i/16),road:chunk.roads[i]===1,zone:chunk.zones[i],level:chunk.levels[i],age:chunk.ages[i],facility:chunk.facilities[i],decline:chunk.decline[i]});
    }}
    return {...(this.statistics?{statistics:structuredClone(this.statistics)}:{}),...(this.environment?{environment:this.environment.snapshot()}:{}),...(this.residents?{residents:this.residents.snapshot()}:{}),...(this.waterUtility?{waterUtility:this.waterUtility.snapshot()}:{}),...(this.sanitation?{sanitation:this.sanitation.snapshot()}:{}),...(this.energy?{energy:this.energy.snapshot()}:{}),...(this.hydrology?{hydrology:this.hydrology.snapshot()}:{}),...(this.management?{management:structuredClone(this.management)}:{}),...(this.budget.changed?{budget:this.budget.snapshot()}:{}),...(this.wellness.active?{wellness:this.wellness.snapshot()}:{}),...(this.safety.enabled?{safety:this.safety.snapshot()}:{}),...(this.transit.hasState?{transit:this.transit.snapshot()}:{}),traffic:this.traffic.snapshot(),developmentOrder:[...this.zoned.values()].map(c=>c.z*this.size+c.x),taxRate:this.taxRate,size:this.size,config:{...this.config},cells,month:this.month,population:this.population,funds:this.funds,tax:this.tax,maintenance:this.maintenance,balance:this.balance,constructionSpending:this.constructionSpending};
  }
  /** Compare committed states without involving rendering. Yield per chunk for large edits. */
  *roadDirtySteps(next:City):Generator<void> {
    next.dirty.clear();
    if(this.waterUtility||next.waterUtility){for(const id of new Set([...(this.waterUtility?.externals??[]),...(next.waterUtility?.externals??[])]))next.mark({x:id%next.size,z:Math.floor(id/next.size)});}
    if(this.sanitation||next.sanitation)for(const id of new Set([...(this.sanitation?.plants.keys()??[]),...(next.sanitation?.plants.keys()??[])])){if(this.sanitation?.plants.get(id)!==next.sanitation?.plants.get(id)||this.networkConnected({x:id%this.size,z:Math.floor(id/this.size)})!==next.networkConnected({x:id%this.size,z:Math.floor(id/this.size)}))next.mark({x:id%this.size,z:Math.floor(id/this.size)});}
    if(this.energy||next.energy)for(const id of new Set([...(this.energy?.plants.keys()??[]),...(next.energy?.plants.keys()??[])])){if(this.energy?.plants.get(id)!==next.energy?.plants.get(id)||this.networkConnected({x:id%this.size,z:Math.floor(id/this.size)})!==next.networkConnected({x:id%this.size,z:Math.floor(id/this.size)}))next.mark({x:id%this.size,z:Math.floor(id/this.size)});}
    if(this.hydrology||next.hydrology){const a=this.hydrology,b=next.hydrology;let work=0;
      for(const id of new Set([...(a?.pipes??[]),...(b?.pipes??[]),...(a?.outfalls??[]),...(b?.outfalls??[])])){
        if(a?.pipes.has(id)!==b?.pipes.has(id)||a?.outfalls.has(id)!==b?.outfalls.has(id)||a?.at(id)!==b?.at(id))for(const n of [id,...(b??a)!.neighbors(id)])next.mark({x:n%next.size,z:Math.floor(n/next.size)});
        if(++work%128===0)yield;
      }
    }
    const mark=(x:number,z:number)=>{if(x>=0&&z>=0&&x<this.size&&z<this.size)next.dirty.add(this.key({x,z}));};
    const adjacent=(x:number,z:number)=>{mark(x,z);mark(x-1,z);mark(x+1,z);mark(x,z-1);mark(x,z+1);};
    const services=this.safety.enabled||next.safety.enabled||this.wellness.active||next.wellness.active;
    const utility=this.powerRatio!==next.powerRatio||this.waterRatio!==next.waterRatio;
    for(const key of new Set([...this.chunks.keys(),...next.chunks.keys()])){
      const a=this.chunks.get(key),b=next.chunks.get(key),[cx,cz]=key.split(',').map(Number);
      for(let i=0;i<256;i++){
        const x=cx*16+i%16,z=cz*16+Math.floor(i/16),id=z*this.size+x,ar=a?.roads[i]??0,br=b?.roads[i]??0;
        if(this.waterUtility||next.waterUtility){const a=this.waterUtility?.status(id),b=next.waterUtility?.status(id);if(a?.water!==b?.water||a?.processed!==b?.processed||a?.residual!==b?.residual)mark(x,z);}
        if(ar!==br){adjacent(x,z);continue;}
        if(ar){
          if(this.network.kinds.get(id)!==next.network.kinds.get(id)||this.network.crossings.has(id)!==next.network.crossings.has(id)||this.network.busOnly.has(id)!==next.network.busOnly.has(id)||this.network.directions.get(id)!==next.network.directions.get(id))mark(x,z);
          if(this.network.isMain(id)!==next.network.isMain(id)||this.traffic.congestion(id)!==next.traffic.congestion(id))mark(x,z);
          // A service field change also changes the neighboring vacant-tile overlay.
          if(services&&(this.safety.coverageAt(id,'fire')!==next.safety.coverageAt(id,'fire')||this.safety.coverageAt(id,'police')!==next.safety.coverageAt(id,'police')||(['medical','elementary','highSchool'] as const).some(k=>this.wellness.roadCoverage(id,k)!==next.wellness.roadCoverage(id,k))))adjacent(x,z);
        }else if(a?.zones[i]||b?.zones[i]||a?.facilities[i]||b?.facilities[i]||this.safety.stations.has(id)||this.wellness.facilities.has(id)){
          if(utility||(this.hydrology?.at(id)??this.waterRatio)!==(next.hydrology?.at(id)??next.waterRatio)||this.networkConnected({x,z})!==next.networkConnected({x,z})||a?.levels[i]!==b?.levels[i])mark(x,z);
          if(services){const sa=this.safety.results.get(id),sb=next.safety.results.get(id),wa=this.wellness.results.get(id),wb=next.wellness.results.get(id);
            if(sa?.fire!==sb?.fire||sa?.crimeRisk!==sb?.crimeRisk||wa?.medical!==wb?.medical||wa?.elementary!==wb?.elementary||wa?.highSchool!==wb?.highSchool)mark(x,z);}
        }
      }
      yield;
    }
    for(const stop of this.transit.stops.values())if(this.network.has(stop.road)!==next.network.has(stop.road)){
      const x=stop.road%this.size,z=Math.floor(stop.road/this.size),r=this.transit.config.walkRadius;
      for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)mark(x+dx,z+dz);
      yield;
    }
  }
  static fromState(state:CityState,options:{allowPopulationChange?:boolean}={}):City {const it=City.restoreSteps(state,()=>{},options.allowPopulationChange);let next=it.next();while(!next.done)next=it.next();return next.value;}
  static async fromStateAsync(state:CityState,options:{allowPopulationChange?:boolean;signal?:AbortSignal;budgetMs?:number;yieldTask?:()=>Promise<void>;onProgress?:(phase:string,value:number)=>void;profile?:{cpuMs:number;maxSliceMs:number;slices:number;elapsedMs:number};configure?:(city:City)=>void}={}):Promise<City>{
    const budget=options.budgetMs??4;if(!Number.isFinite(budget)||budget<=0)throw new Error('復元予算が不正です');const task=options.yieldTask??(()=>new Promise<void>(r=>setTimeout(r,0))),start=performance.now(),it=City.restoreSteps(state,options.onProgress??(()=>{}),options.allowPopulationChange,options.configure);let cpu=0,max=0,slices=0;
    try{await task();while(true){if(options.signal?.aborted)throw new DOMException('ロードをキャンセルしました','AbortError');const begin=performance.now();let next;do{next=it.next();}while(!next.done&&performance.now()-begin<budget);const used=performance.now()-begin;cpu+=used;max=Math.max(max,used);slices++;if(next.done){options.onProgress?.('都市復元完了',.7);return next.value;}await task();}}finally{it.return(undefined as any);if(options.profile)Object.assign(options.profile,{cpuMs:cpu,maxSliceMs:max,slices,elapsedMs:performance.now()-start});}
  }
  private static *restoreSteps(state:CityState,progress:(phase:string,value:number)=>void,allowPopulationChange=false,configure?:(city:City)=>void):Generator<void,City> {
    progress('都市データ',.1);let restoredCells=0;
    const city=new City(state.size,{...state.config},state.transit?.config,state.management);
    for(const t of state.cells){const c=city.chunk(t,true)!,i=city.index(t);c.roads[i]=t.road?1:0;c.zones[i]=t.zone;c.levels[i]=t.level;c.ages[i]=t.age;c.facilities[i]=t.facility;c.decline[i]=t.decline;if(t.facility)city.facilities.set(`${t.x},${t.z}`,{x:t.x,z:t.z});if(t.road){city.roadCount++;}if(t.zone)city.zoned.set(`${t.x},${t.z}`,{x:t.x,z:t.z});city.mark(t);if(++restoredCells%256===0){progress('都市データ',.1+.25*restoredCells/state.cells.length);yield;}}
    progress('道路ネットワーク',.4);yield;const roads=state.cells.filter(t=>t.road).map(t=>t.z*city.size+t.x);if(city.size>=256)yield*city.network.loadSteps(roads);else city.network.load(roads);
    yield;progress('施設と集計',.45);city.zoned.clear();for(const id of state.developmentOrder)city.zoned.set(`${id%city.size},${Math.floor(id/city.size)}`,{x:id%city.size,z:Math.floor(id/city.size)});
    for(const key of ['month','population','funds','tax','maintenance','balance','constructionSpending'] as const)city[key]=state[key];
    if(state.statistics)city.statistics=structuredClone(state.statistics);
    if(state.environment)city.environment=CityEnvironment.restore(city.size,state.environment);
    if(state.residents)city.residents=new Residents(state.residents);
    if(state.waterUtility)city.waterUtility=WaterUtility.restore(state.waterUtility);if(state.sanitation)city.sanitation=Sanitation.restore(state.sanitation);if(state.energy)city.energy=Energy.restore(state.energy);if(state.hydrology)city.hydrology=Hydrology.restore(city.size,state.hydrology);if(state.budget)city.budget.restore(state.budget);city.applyBudget();if(state.wellness)city.wellness.restore(state.wellness);if(state.safety)city.safety.restore(state.safety);if(state.transit)city.transit.restore(state.transit,false);if(configure){configure(city);city.transit.invalidate();}yield* city.transit.refreshSteps();city.taxRate=state.taxRate;if(state.traffic)city.traffic.restore(state.traffic);const population=city.population;progress('交通・公共サービス',.55);yield;yield* city.recountSteps();if(!allowPopulationChange&&city.population!==population)throw new Error('人口が住宅容量を超えています');
    return city;
  }
  private censusRows(){
    if(this.censusDirty||this.censusVersion!==this.network.revision){
      this.census=[...this.zoned.values()].map(c=>{const t=this.tile(c),id=c.z*this.size+c.x,access=this.network.access(id).filter(n=>this.network.isMain(n));
        return {c,t,chunk:this.chunk(c)!,i:this.index(c),home:t.zone==='residential'?{id,capacity:0,access}:undefined,workplace:t.zone&&t.zone!=='residential'?{id,kind:t.zone,capacity:0,access}:undefined};
      });this.zoneChunks.clear();for(const r of this.census)this.zoneChunks.add(this.key(r.c));this.censusDirty=false;this.censusVersion=this.network.revision;
    }
    if(!this.levelsCurrent)for(const row of this.census)row.t.level=row.chunk.levels[row.i];return this.census;
  }
  contains(c: Cell) { return Number.isInteger(c.x) && Number.isInteger(c.z) && c.x >= 0 && c.z >= 0 && c.x < this.size && c.z < this.size; }
  key(c: Cell) { return `${Math.floor(c.x / CHUNK_SIZE)},${Math.floor(c.z / CHUNK_SIZE)}`; }
  private index(c: Cell) { return (c.z % CHUNK_SIZE) * CHUNK_SIZE + c.x % CHUNK_SIZE; }
  private chunk(c: Cell, create = false) {
    const key = this.key(c); let chunk = this.chunks.get(key);
    if (!chunk && create) { chunk = {roads:new Uint8Array(256), zones:new Uint8Array(256), levels:new Uint8Array(256), ages:new Uint16Array(256),facilities:new Uint8Array(256),decline:new Uint16Array(256)}; this.chunks.set(key,chunk); }
    return chunk;
  }
  hasRoad(c: Cell) { return this.contains(c) && this.chunk(c)?.roads[this.index(c)] === 1; }
  connected(c: Cell) { return this.contains(c) && [{x:c.x-1,z:c.z},{x:c.x+1,z:c.z},{x:c.x,z:c.z-1},{x:c.x,z:c.z+1}].some(p=>this.hasRoad(p)); }
  networkConnected(c:Cell){return this.contains(c)&&[{x:c.x-1,z:c.z},{x:c.x+1,z:c.z},{x:c.x,z:c.z-1},{x:c.x,z:c.z+1}].some(p=>this.contains(p)&&this.network.isMain(p.z*this.size+p.x)&&this.network.profile(p.z*this.size+p.x).access);}
  tile(c: Cell): Tile {
    if (!this.contains(c)) return {road:false,zone:null,level:0,connected:false,networkConnected:false,facility:null};
    const chunk=this.chunk(c), i=this.index(c);
    return {road:chunk?.roads[i]===1,zone:ZONES[(chunk?.zones[i]??0)-1]??null,level:chunk?.levels[i]??0,connected:this.connected(c),networkConnected:this.networkConnected(c),facility:this.waterUtility?.externals.has(c.z*this.size+c.x)?'externalWater':this.sanitation?.plants.get(c.z*this.size+c.x)??this.energy?.plants.get(c.z*this.size+c.x)??(this.hydrology?.outfalls.has(c.z*this.size+c.x)?'outfall':this.transit.operations.depotAt(c.z*this.size+c.x)?'depot':this.wellness.facilities.get(c.z*this.size+c.x)??this.safety.stations.get(c.z*this.size+c.x)??(chunk?.facilities[i]===1?'power':chunk?.facilities[i]===2?'water':chunk?.facilities[i]===3?'park':chunk?.facilities[i]===4?'plaza':null))};
  }
  private pay(cost: number) { if(cost>0&&this.funds < cost) {this.lastMessage='資金不足：税収を待つか、建設範囲を縮小してください。';return false;} this.funds-=cost; return true; }
  private markTransit(c:Cell){const radius=this.transit.config.walkRadius;for(let z=Math.max(0,c.z-radius);z<=Math.min(this.size-1,c.z+radius);z+=1)for(let x=Math.max(0,c.x-radius);x<=Math.min(this.size-1,c.x+radius);x+=1)this.mark({x,z});}
  private mark(c:Cell) { if(this.contains(c))this.dirty.add(this.key(c)); }
  roadPlacement(id:number):'road'|'blocked'|'free'{const c={x:id%this.size,z:Math.floor(id/this.size)},chunk=this.chunk(c),i=this.index(c);return chunk?.roads[i]?'road':this.network.bayCells.has(id)||this.waterUtility?.externals.has(id)||this.sanitation?.plants.has(id)||this.energy?.plants.has(id)||this.hydrology?.river.has(id)||this.hydrology?.outfalls.has(id)||chunk?.zones[i]||chunk?.facilities[i]||this.safety.stations.has(id)||this.wellness.facilities.has(id)||this.transit.operations.depotAt(id)?'blocked':'free';}
  setRoad(c: Cell, value: boolean,bridge=false) {
    if(this.updating||this.abandoned)throw new Error("都市更新中の道路編集はキューを使用してください");
    if (!this.contains(c) || this.hasRoad(c) === value) return false;
    if(!value&&this.transit.stopAt(c.z*this.size+c.x)?.bay){this.lastMessage='待避スペースを解除してから道路を撤去してください';return false;}
    if(value && ((this.hydrology?.river.has(c.z*this.size+c.x)&&!bridge)||this.tile(c).zone||this.tile(c).facility)) {this.lastMessage='区画を撤去してから道路を敷設してください。';return false;}
    if(value&&(this.network.bayCells.has(c.z*this.size+c.x)||this.network.adjacent(c.z*this.size+c.x).some(id=>this.network.kinds.get(id)==='highway'&&this.network.adjacent(id).length>=2))){this.lastMessage='待避スペース・高速道路の途中へ道路は接続できません';return false;}
    if(value && !this.pay(this.config.roadCost*(bridge?12:1)))return false;
    this.chunk(c,true)!.roads[this.index(c)]=value?1:0;
    this.roadCount += value?1:-1;if(this.transit.stopAt(c.z*this.size+c.x))this.markTransit(c);
    for(const id of this.network.edit(c.z*this.size+c.x,value)){const q={x:id%this.size,z:Math.floor(id/this.size)};for(const p of [q,{x:q.x-1,z:q.z},{x:q.x+1,z:q.z},{x:q.x,z:q.z-1},{x:q.x,z:q.z+1}])this.mark(p);}
    for(const p of [c,{x:c.x-1,z:c.z},{x:c.x+1,z:c.z},{x:c.x,z:c.z-1},{x:c.x,z:c.z+1}]) this.mark(p);
    return true;
  }
  buildBridge(from:Cell,to:Cell){if(this.updating||this.abandoned)throw new Error('都市更新中は橋を建設できません');const quote=quoteBridge(this,from,to);if(!quote.affordable)throw new Error('資金不足：橋全体に必要な費用 '+quote.cost);for(const c of quote.cells)this.setRoad(c,true,!!this.hydrology?.river.has(c.z*this.size+c.x));this.recount();this.lastMessage='橋を建設しました（費用 '+quote.cost+'）';}
  private edit(c:Cell,tool:Tool) {
    this.censusDirty=true;
    if(tool==='bridge'){this.lastMessage='両岸を直線で指定してください';return;}
    if(tool==='select')return;
    if(isDevelopmentKind(tool)&&!developmentUnlocked(this,tool)){this.lastMessage=developmentRequirement(this,tool);return;}
    if(tool==='crossing'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}const id=c.z*this.size+c.x;if(!this.pay(p.cost))return;if(this.network.crossings.has(id))this.network.crossings.delete(id);else this.network.crossings.add(id);this.network.revision++;this.mark(c);return;}if(this.network.bayCells.has(c.z*this.size+c.x)){this.lastMessage='停留所の待避スペースです';return;}
    if(tool==='externalWater'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}if(this.waterUtility!.externals.has(c.z*this.size+c.x))return;if(!this.pay(p.cost))return;this.waterUtility!.add(c.z*this.size+c.x);this.mark(c);return;}
    if(tool==='sewage'||tool==='advancedSewage'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}if(this.sanitation!.plants.has(c.z*this.size+c.x))return;if(!this.pay(p.cost))return;this.sanitation!.add(c.z*this.size+c.x,tool);this.mark(c);return;}
    if(tool==='wind'||tool==='solar'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}if(this.tile(c).facility===tool)return;if(!this.pay(p.cost))return;this.ensureEnergy().add(c.z*this.size+c.x,tool);this.mark(c);return;}
    if(tool==='pipe'||tool==='pipe-remove'||tool==='outfall'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}const h=this.hydrology!,id=c.z*this.size+c.x;if(tool==='outfall'){if(h.outfalls.has(id))return;if(!this.pay(p.cost))return;h.outfalls.add(id);h.revision++;}else {if(!this.pay(p.cost))return;h.setPipe(id,tool==='pipe');}for(const q of [id,...h.neighbors(id)])this.mark({x:q%this.size,z:Math.floor(q/this.size)});for(const key of this.zoneChunks)this.dirty.add(key);return;}
    if(this.hydrology?.river.has(c.z*this.size+c.x)&&!(tool==='erase'&&this.hasRoad(c))){this.lastMessage='河川上の道路は橋ツールで建設してください';return;}
    if(tool==='water'&&this.hydrology){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}}
    if(tool==='bus-stop'){const id=c.z*this.size+c.x;if(this.transit.stopAt(id))return;if(!this.hasRoad(c)){this.lastMessage='バス停は道路上に設置してください。';return;}if(this.transit.stops.size>=this.transit.config.maxStops){this.lastMessage='バス停数の上限です';return;}if(!this.pay(this.transit.config.stopCost))return;this.transit.addStop(id);this.markTransit(c);return;}
    if(tool==='bus-remove'){const s=this.transit.stopAt(c.z*this.size+c.x);if(s){try{this.transit.removeStop(s.id);this.markTransit(c);}catch(e){this.lastMessage=(e as Error).message;}}return;}
    if(tool==='depot'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}if(!this.pay(BUS_INFRA.depotCost))return;this.transit.operations.addDepot(c.z*this.size+c.x);this.mark(c);return;}
    if(tool==='road') {this.setRoad(c,true);return;}
    if(tool==='erase') {
      this.waterUtility?.externals.delete(c.z*this.size+c.x);this.sanitation?.plants.delete(c.z*this.size+c.x);this.energy?.plants.delete(c.z*this.size+c.x);
      if(this.hydrology?.outfalls.delete(c.z*this.size+c.x))this.hydrology.revision++;
      if(this.transit.operations.depotAt(c.z*this.size+c.x)){try{this.transit.operations.removeDepot(c.z*this.size+c.x);}catch(e){this.lastMessage=(e as Error).message;return;}}
      this.setRoad(c,false);
      const chunk=this.chunk(c); if(chunk) {const i=this.index(c);chunk.zones[i]=0;chunk.levels[i]=0;chunk.ages[i]=0;chunk.facilities[i]=0;chunk.decline[i]=0;}
      this.wellness.remove(c.z*this.size+c.x);this.safety.remove(c.z*this.size+c.x);this.facilities.delete(`${c.x},${c.z}`);this.zoned.delete(`${c.x},${c.z}`);this.mark(c);return;
    }
    const tile=this.tile(c);
    if(tile.road) {this.lastMessage='道路上には区画を指定できません。';return;}
    if(tool==='clinic'||tool==='hospital'||tool==='elementary'||tool==='highSchool'||isDevelopmentKind(tool)){
      const kind=tool as WellnessKind;
      if(tile.zone||tile.facility){this.lastMessage='既存の用途を撤去してから施設を建設してください。';return;}
      if(this.wellness.facilities.size>=this.wellness.config.maxFacilities){this.lastMessage='医療・教育施設数の上限です。';return;}
      if(!this.pay(this.wellness.cost(kind)))return;
      this.wellness.add(c.z*this.size+c.x,kind,this.month);this.mark(c);return;
    }
    if(tool==='fire'||tool==='police'){
      if(tile.zone||tile.facility){this.lastMessage='既存の用途を撤去してから署を建設してください。';return;}
      if(this.safety.stations.size>=this.safety.config.maxStations){this.lastMessage='署の上限です。';return;}
      if(!this.pay(tool==='fire'?this.safety.config.fireCost:this.safety.config.policeCost))return;
      this.safety.add(c.z*this.size+c.x,tool);this.mark(c);return;
    }
    if(tool==='park'||tool==='plaza'){const p=this.placement(c,tool);if(!p.ok){this.lastMessage=p.reason;return;}if(this.tile(c).facility===tool)return;if(!this.pay(p.cost))return;this.chunk(c,true)!.facilities[this.index(c)]=tool==='park'?3:4;this.facilities.set(`${c.x},${c.z}`,{...c});this.mark(c);return;}
    if(tool==='power'||tool==='water'){
      if(tile.facility===tool)return;
      if(tile.zone||tile.facility){this.lastMessage='既存の用途を撤去してから施設を建設してください。';return;}
      if(!this.pay(tool==='power'?this.config.powerCost:this.config.waterCost))return;
      this.chunk(c,true)!.facilities[this.index(c)]=tool==='power'?1:2;this.facilities.set(`${c.x},${c.z}`,{...c});this.mark(c);return;
    }
    if(tile.facility){this.lastMessage='施設を撤去してから区画を指定してください。';return;}
    if(tile.zone===tool)return;
    if(tile.zone) {this.lastMessage='区画を撤去してから用途を変更してください。';return;}
    if(!this.pay(this.config.zoneCost))return;
    this.chunk(c,true)!.zones[this.index(c)]=ZONES.indexOf(tool)+1;
    this.zoned.set(`${c.x},${c.z}`,{...c});this.mark(c);
  }
  apply(from: Cell, to: Cell, tool: Tool) {
    this.lastMessage='';
    if(this.updating||this.abandoned)throw new Error("都市更新中の編集はキューを使用してください");
    this.lastMessage='';
    if (tool === 'select' || !this.contains(from) || !this.contains(to)) return;
    const c = { ...from }; this.edit(c,tool);
    while (c.x !== to.x) { c.x += Math.sign(to.x - c.x); this.edit(c,tool); }
    while (c.z !== to.z) { c.z += Math.sign(to.z - c.z); this.edit(c,tool); }
    this.recount();
  }
  sanitationStage(){return this.management?.lifecycle?.highest??eligibleStage(this.lifeMetrics());}
  enableSanitation(initialStage=this.sanitationStage()){if(!Number.isInteger(initialStage)||initialStage<0||initialStage>=STAGES.length)throw Error('インフラ解放段階が不正です');if(this.updating||this.abandoned)throw Error('都市更新中は開始を予約してください');if(!this.hydrology&&!this.waterUtility)throw Error('水質管理は河川・上下水道都市で利用できます');this.lastMessage='';this.sanitation??=new Sanitation(initialStage,{construction:this.management?.parameters.construction??1,maintenance:this.management?.parameters.maintenance??1});}
  enableWaterUtility(){if(this.updating||this.abandoned)throw Error('都市更新中は開始を予約してください');if(this.waterUtility)return;this.waterUtility=new WaterUtility(undefined,{construction:this.management?.parameters.construction??1,maintenance:this.management?.parameters.maintenance??1});this.enableSanitation();}
  private ensureEnergy(){return this.energy??=new Energy({construction:this.management?.parameters.construction??1,maintenance:this.management?.parameters.maintenance??1});}
  setPowerImport(value:boolean){if(this.updating||this.abandoned)throw Error('都市更新中は変更を予約してください');if(typeof value!=='boolean')throw Error('外部契約の設定が不正です');this.lastMessage='';this.ensureEnergy().importEnabled=value;}
  waterWorks(from:Cell,to:Cell,tool:'pipe'|'pipe-remove'|'outfall'|'water'|'erase'|'wind'|'solar'|'sewage'|'advancedSewage'|'externalWater'){if(this.updating||this.abandoned)throw Error('都市更新中は工事を予約してください');if(!this.contains(from)||!this.contains(to))throw Error('管の範囲が不正です');this.lastMessage='';const cells=[...gridStroke(from,to)],quote=cells.map(c=>this.placement(c,tool));if(quote.some(p=>!p.ok))throw Error(quote.find(p=>!p.ok)!.reason);const cost=quote.reduce((n,p)=>n+p.cost,0);if(cost>0&&cost>this.funds)throw Error('管工事全体の資金が不足しています');for(const c of cells)this.edit(c,tool);}
  applyStroke(from:Cell,to:Cell,tool:Tool){if(tool==='select')return;if(this.updating||this.abandoned)throw new Error('都市更新中はキューを使用してください');this.lastMessage='';if(!this.contains(from)||!this.contains(to)){this.lastMessage='マップの外側には配置できません。';return;}for(const c of gridStroke(from,to))this.edit(c,tool);this.recount();}
  placement(c:Cell,tool:Tool){const result=(ok:boolean,reason:string,cost=0)=>({ok,reason,cost});if(!this.contains(c))return result(false,'マップの外側');if(isDevelopmentKind(tool)&&!developmentUnlocked(this,tool))return result(false,developmentRequirement(this,tool));const t=this.tile(c);if(this.network.bayCells.has(c.z*this.size+c.x))return result(false,'停留所の待避スペースです');if(tool==='crossing')return result(t.road&&this.network.profile(c.z*this.size+c.x).walk,'一般道路をクリックして横断歩道を追加・撤去',this.network.crossings.has(c.z*this.size+c.x)?0:20);if(tool==='park'||tool==='plaza'){const t=this.tile(c),cost=(tool==='park'?200:350)*(this.management?.parameters.construction??1);if(t.facility===tool)return result(true,'設置済み');if(this.hydrology?.river.has(c.z*this.size+c.x)||t.road||t.zone||t.facility)return result(false,'陸地の空きセルに配置してください');return result(this.funds>=cost,(this.funds<cost?'資金不足 / ':'景観施設 / ')+'月次維持費 '+(tool==='park'?1:2)*(this.management?.parameters.maintenance??1),cost);}if(tool==='bridge')return result(!!this.hydrology,'岸から対岸へ直線でドラッグして橋を建設');if(tool==='select'||tool==='erase')return result(true,tool==='erase'?'撤去は無料':'選択');const id=c.z*this.size+c.x,h=this.hydrology;if(tool==='externalWater'){const w=this.waterUtility;if(!w)return result(false,'施設式上下水道を開始してください');if(t.facility==='externalWater')return result(true,'設置済み');if(h?.river.has(id)||t.road||t.zone||t.facility)return result(false,'陸地の空きセルが必要です');if(!t.connected)return result(false,'外部水道接続には道路が必要です');if(w.externals.size>=w.settings.maxExternalFacilities)return result(false,'外部水道施設数の上限です');return result(this.funds>=w.cost,this.funds<w.cost?'資金不足':'設置可能・購入量に応じて月次課金',w.cost);}if(tool==='water'&&this.waterUtility&&!h)return result(false,'自然水源がありません。外部水道接続を利用してください');if(tool==='sewage'||tool==='advancedSewage'){const s=this.sanitation;if((!h&&!this.waterUtility)||!s)return result(false,'河川都市で水質管理を開始してください');if(t.facility===tool)return result(true,'同じ用途を設置済み');if(!s.unlocked(tool))return result(false,SEWAGE[tool].name+'は最高到達「'+STAGES[SEWAGE[tool].stage].name+'」で解放されます');if(h?.river.has(id)||t.road||t.zone||t.facility)return result(false,'陸地の空きセルが必要です');if(!t.connected)return result(false,'下水処理場には道路接続が必要です');if(s.plants.size>=SANITATION.maxPlants)return result(false,'下水処理場数の上限');const cost=s.cost(tool);return result(this.funds>=cost,this.funds<cost?'資金不足：必要 '+cost:'配置可能・稼働には同じ管網の排水口・主道路網・電力が必要',cost);}if(tool==='wind'||tool==='solar'){if(t.facility===tool)return result(true,'同じ用途を設置済み');const cost=this.energy?this.energy.cost(tool):GENERATION[tool].cost*(this.management?.parameters.construction??1);if(h?.river.has(id))return result(false,'河川上には配置できません');if(t.road||t.zone||t.facility)return result(false,'既存の用途を撤去してください');if(!t.connected)return result(false,'発電施設には上下左右の道路接続が必要です');if((this.energy?.plants.size??0)>=MAX_GENERATORS)return result(false,'再生可能発電施設数の上限');return result(this.funds>=cost,this.funds<cost?'資金不足：必要 '+cost:t.networkConnected?'発電施設を設置可能':'設置可能・孤立道路のため発電不可',cost);}if(tool==='pipe'||tool==='pipe-remove'||tool==='outfall'){if(!h)return result(false,'新規都市作成時に「河川・上下水道」を選択してください');if(h.river.has(id))return result(false,'河川上には設置できません');if(tool==='outfall'){if(h.outfalls.has(id))return result(true,'設置済み');if(t.road||t.zone||t.facility)return result(false,'空き地が必要です');if(!h.riverside(id)||!t.connected)return result(false,'排水口には河川への隣接と道路接続が必要です');return result(this.funds>=WATER.outfallCost,this.funds>=WATER.outfallCost?'排水口設置可能':'資金不足',WATER.outfallCost);}const cost=tool==='pipe'&&!h.pipes.has(id)?WATER.pipeCost:0;return result(cost===0||this.funds>=cost,tool==='pipe-remove'?'地下管だけを撤去（地上は維持）':cost?'上下水道管を敷設':'管敷設済み',cost);}if(h?.river.has(id))return result(false,'河川上の道路は橋ツールで建設してください');if(tool==='water'&&h&&(!h.riverside(id)||!t.connected))return result(false,'給水施設には河川への隣接と道路接続が必要です');if(tool==='bus-remove'){const stop=this.transit.stopAt(c.z*this.size+c.x),inUse=stop&&this.transit.operations.stopInUse(stop.id);return result(!inUse,inUse?'運行中の停留所は帰庫後に撤去してください':'バス停撤去');}if(tool==='bus-stop'){if(!t.road)return result(false,'バス停は道路上に設置してください。');if(this.transit.stopAt(c.z*this.size+c.x))return result(true,'設置済み');if(this.transit.stops.size>=this.transit.config.maxStops)return result(false,'バス停数の上限');return result(this.funds>=this.transit.config.stopCost,this.funds>=this.transit.config.stopCost?'設置可能':'資金不足',this.transit.config.stopCost);}
    if(tool==='depot')return result(!t.road&&!t.zone&&!t.facility&&t.connected&&this.funds>=BUS_INFRA.depotCost&&!this.transit.operations.depotAt(c.z*this.size+c.x),t.road||t.zone||t.facility?'既存の用途を撤去してください':!t.connected?'車庫には上下左右の道路接続が必要です':this.funds<BUS_INFRA.depotCost?'資金不足':'車庫設置可能',BUS_INFRA.depotCost);
    if(tool==='road'){if(t.road)return result(true,'道路設置済み');if(t.zone||t.facility)return result(false,'既存の区画・施設を撤去してください。');return result(this.funds>=this.config.roadCost,this.funds>=this.config.roadCost?'道路設置可能':'資金不足',this.config.roadCost);}
    const zone=ZONES.includes(tool as Zone);if(t.road)return result(false,'道路上には配置できません。');if((zone&&t.zone===tool)||((tool==='power'||tool==='water')&&t.facility===tool))return result(true,'同じ用途を設置済み');if(t.zone||t.facility)return result(false,'既存の用途を撤去してから配置してください。');let cost=this.config.zoneCost;
    if(tool==='power')cost=this.config.powerCost;else if(tool==='water')cost=this.config.waterCost;else if(tool==='fire'||tool==='police'){if(this.safety.stations.size>=this.safety.config.maxStations)return result(false,'署の上限');cost=tool==='fire'?this.safety.config.fireCost:this.safety.config.policeCost;}else if(!zone){const kind=tool as WellnessKind;if(this.wellness.facilities.size>=this.wellness.config.maxFacilities)return result(false,'医療・教育施設数の上限');cost=this.wellness.cost(kind);}
    if(this.funds<cost)return result(false,'資金不足：必要 '+cost,cost);return result(true,t.networkConnected?'配置可能':t.connected?'配置可能・孤立道路に隣接（幹線へ接続が必要）':'配置可能・上下左右の道路接続が必要',cost);
  }
  buildingStatus(c:Cell){const t=this.tile(c),chunk=this.chunk(c),i=this.index(c),reasons:string[]=[];if((this.waterUtility?this.waterUtility.status(c.z*this.size+c.x).water:this.hydrology?.at(c.z*this.size+c.x)??1)<this.config.growthSupplyThreshold)reasons.push('上下水道管の接続・給水施設・排水口の能力を確認してください');if(!t.zone)return {level:t.level,reasons:['区画ではありません'],age:0,months:this.config.growthMonths,cost:0};if(!t.networkConnected)reasons.push(t.connected?'孤立道路に隣接：幹線網に接続してください':'上下左右の道路に未接続（斜め接続は不可）');if(this.powerRatio<this.config.growthSupplyThreshold)reasons.push('電力不足 '+Math.round(this.powerRatio*100)+'%');if(this.waterRatio<this.config.growthSupplyThreshold)reasons.push('水道不足 '+Math.round(this.waterRatio*100)+'%');if(this.satisfaction<this.config.growthSatisfaction)reasons.push('満足度不足 '+this.satisfaction+'/'+this.config.growthSatisfaction);if(this.management?.lifecycle?.mode==='evolve'&&t.zone==='residential'&&t.level>0&&this.housing>0&&vacancy(this.population,this.housing)>LIFE_BALANCE.vacancyGrowth)reasons.push('空き家率 '+Math.round(vacancy(this.population,this.housing)*100)+'%：入居を待ってから増築');if(this.demand[t.zone]<this.config.minimumDemand)reasons.push('需要不足 '+this.demand[t.zone]+'/'+this.config.minimumDemand);else if((this.management?.parameters.housingVacancyWeight??0)>0&&this.projectedDemand[t.zone]<this.config.minimumDemand)reasons.push('現在の供給が需要を上回っています');const cost=t.level?this.config.upgradeCost:this.config.buildingCost;if(t.zone==='residential'&&this.management?.lifecycle?.mode==='evolve'&&!this.management.lifecycle.settlementPending&&this.workforce>0&&this.employed/this.workforce<LIFE_BALANCE.employmentFloor)reasons.push('通勤可能な雇用が不足しています');if(this.funds<cost)reasons.push('建設資金不足：必要 '+cost);if(t.level>=this.config.maxLevel)reasons.push('最高成長段階');return {level:t.level,reasons,age:chunk?.ages[i]??0,months:this.config.growthMonths,cost};}
  editTransit(command:(city:City)=>void){if(this.updating||this.abandoned)throw Error('都市更新の完了後に再試行してください');command(this);this.transit.invalidate();for(const d of this.transit.operations.depots.values())this.mark({x:d.id%this.size,z:Math.floor(d.id/this.size)});for(const stop of this.transit.stops.values())this.mark({x:stop.road%this.size,z:Math.floor(stop.road/this.size)});this.recount();}
  setBusRoute(name:string,stops:number[],fleet:number,id?:number){if(this.updating||this.abandoned)throw new Error('都市更新中の編集はキューを使用してください');this.transit.setRoute(name,stops,fleet,id);this.recount();}
  removeBusRoute(id:number){if(this.updating||this.abandoned)throw new Error('都市更新中の編集はキューを使用してください');this.transit.removeRoute(id);this.recount();}
  private recount(){const iterator=this.recountSteps(false);while(!iterator.next().done){}}
  private *recountSteps(sliced=true):Generator<void> {
    this.environmentInputRevision++;
    const rows=this.censusRows();
    const oldPower=this.powerRatio,oldWater=this.waterRatio;
    this.sceneryMaintenance=0;this.powerPlants=0;this.waterPlants=0;this.powerSupply=this.roadCount&&(this.energy?.importEnabled??true)?this.config.starterPower:0;this.waterSupply=this.roadCount?this.config.starterWater:0;
    for(const c of this.facilities.values()){const t=this.tile(c);if(t.facility==='power'){this.powerPlants++;if(t.networkConnected)this.powerSupply+=this.config.powerCapacity;}else if(t.facility==='water'){this.waterPlants++;if(t.networkConnected)this.waterSupply+=this.config.waterCapacity;}else if(t.facility==='park'||t.facility==='plaza')this.sceneryMaintenance+=(t.facility==='park'?1:2)*(this.management?.parameters.maintenance??1);}
    this.parks.configure(this.size,[...this.facilities.values()].flatMap(c=>{const t=this.tile(c);return t.networkConnected&&(t.facility==='park'||t.facility==='plaza')?[{id:c.z*this.size+c.x,kind:t.facility}]:[];}));
    if(this.energy){this.energy.evaluate(this.month,this.network);this.powerSupply+=this.energy.supply;}
    this.infrastructureMaintenance=this.sceneryMaintenance+this.powerPlants*this.config.powerMaintenance+this.waterPlants*this.config.waterMaintenance+this.transit.maintenance+this.safety.maintenance+this.wellness.maintenance+(this.hydrology?.maintenance??0)+(this.energy?.maintenance??0)+(this.sanitation?.maintenance??0)+(this.waterUtility?.maintenance??0);
    this.powerDemand=0;this.waterDemand=0;
    for(const {t} of rows){if(t.networkConnected){this.powerDemand+=t.level*this.config.powerPerLevel;this.waterDemand+=t.level*this.config.waterPerLevel;}}
    this.powerRatio=this.powerDemand?Math.min(1,this.powerSupply/this.powerDemand):this.energy&&!this.energy.importEnabled&&this.powerSupply<=0?0:1;
    this.waterRatio=this.waterDemand?Math.min(1,this.waterSupply/this.waterDemand):1;
    if(this.hydrology&&!this.waterUtility){const h=this.hydrology,visual=h.visualRevision,sources=[...this.facilities.values()].filter(c=>this.tile(c).facility==='water'&&this.networkConnected(c)&&h.riverside(c.z*this.size+c.x)).map(c=>({id:c.z*this.size+c.x,capacity:this.config.waterCapacity})),outlets=[...h.outfalls].filter(id=>this.networkConnected({x:id%this.size,z:Math.floor(id/this.size)})&&h.riverside(id)),evaluation=h.evaluate(sources,outlets,rows.filter(r=>r.t.networkConnected).map(r=>({id:r.c.z*this.size+r.c.x,demand:r.t.level*this.config.waterPerLevel})),this.sanitation?.inputs(this.network,this.powerRatio));for(const _ of evaluation)if(sliced)yield;this.waterSupply=h.waterSupply;this.waterRatio=h.ratio;if(visual!==h.visualRevision){for(const key of h.chunkKeys)this.dirty.add(key);for(const key of this.zoneChunks)this.dirty.add(key);}}

    if(this.waterUtility){
      const w=this.waterUtility,loads=rows.map(r=>({id:r.c.z*this.size+r.c.x,demand:r.t.level*this.config.waterPerLevel*(r.t.zone==='residential'?w.settings.residentialFactor:r.t.zone==='commercial'?w.settings.commercialFactor:w.settings.industrialFactor)}));
      const publicIds=new Set([...this.facilities.values()].map(c=>c.z*this.size+c.x));for(const collection of [this.safety.stations,this.wellness.facilities,this.transit.operations.depots,this.energy?.plants,this.sanitation?.plants])if(collection)for(const id of collection.keys())publicIds.add(id);for(const id of publicIds)loads.push({id,demand:w.settings.publicDemand});
      const sources=[...this.facilities.values()].filter(c=>this.tile(c).facility==='water'&&(!this.hydrology||this.hydrology.riverside(c.z*this.size+c.x))).map(c=>({id:c.z*this.size+c.x,capacity:this.config.waterCapacity}));
      const plants=[...(this.sanitation?.plants??[])].map(([id,k])=>({id,capacity:SEWAGE[k].capacity*this.powerRatio,efficiency:SEWAGE[k].efficiency}));
      const work=w.evaluate(this.network,this.hydrology,loads,sources,plants,this.hydrology?.outfalls??[]);for(const _ of work)if(sliced)yield;this.waterSupply=w.capacity;this.waterDemand=w.demand;this.waterRatio=w.waterRatio;
      this.infrastructureMaintenance+=w.purchaseCost;for(const r of rows)if(w.affected(r.c.z*this.size+r.c.x))this.mark(r.c);let inspected=0;for(const id of this.network.ids()){if(w.affected(id))this.mark({x:id%this.size,z:Math.floor(id/this.size)});if(sliced&&++inspected%256===0)yield;}if(this.hydrology)for(const id of this.hydrology.pipes){if(w.affected(id))this.mark({x:id%this.size,z:Math.floor(id/this.size)});if(sliced&&++inspected%256===0)yield;}for(const id of [...w.externals,...(this.sanitation?.plants.keys()??[])])this.mark({x:id%this.size,z:Math.floor(id/this.size)});
    }
    if(oldPower!==this.powerRatio||oldWater!==this.waterRatio)for(const key of this.zoneChunks)this.dirty.add(key);
    this.levelTotal=0;this.residentialStock=0;this.workStock=0;this.housing=0;this.commercialJobs=0;this.industrialJobs=0;this.buildingCount=0;this.disconnected=0;
    for(const {t} of rows) {
      this.levelTotal+=t.level;if(t.zone==='residential')this.residentialStock+=t.level*this.config.residentsPerLevel;else this.workStock+=t.level*(t.zone==='commercial'?this.config.commercialJobsPerLevel:this.config.industrialJobsPerLevel);if(t.level)this.buildingCount++;
      if(!t.networkConnected){this.disconnected++;continue;}
      if(t.zone==='residential')this.housing+=t.level*this.config.residentsPerLevel;
      if(t.zone==='commercial')this.commercialJobs+=t.level*this.config.commercialJobsPerLevel;
      if(t.zone==='industrial')this.industrialJobs+=t.level*this.config.industrialJobsPerLevel;
    }
    if(this.residents){const places:Place[]=[...this.facilities.values()].flatMap(c=>{const t=this.tile(c);return t.networkConnected&&(t.facility==='park'||t.facility==='plaza')?[{id:c.z*this.size+c.x,kind:'park' as const}]:[];});for(const [id,kind] of this.wellness.facilities)if((wellnessGroup(kind)!=='medical')&&this.networkConnected({x:id%this.size,z:Math.floor(id/this.size)}))places.push({id,kind:'school'});for(const r of rows)if(r.t.zone==='commercial'&&r.t.level&&r.t.networkConnected)places.push({id:r.c.z*this.size+r.c.x,kind:'shop'});this.residents.reconcile(this.residentHomes(),places,this);this.population=this.residents.population;}else this.population=Math.min(this.population,this.housing);
    this.commercialJobs=Math.floor(this.commercialJobs*this.powerRatio);this.industrialJobs=Math.floor(this.industrialJobs*this.powerRatio);
    this.network.bayCells.clear();this.network.bayWalk.clear();for(const stop of this.transit.stops.values())if(stop.bay){const heading=stop.heading??1,step=[-this.size,1,this.size,-1][heading];for(const p of bayCells(stop.road,this.size,heading))if(this.contains(p))this.network.bayCells.set(p.z*this.size+p.x,stop.road);for(const road of [stop.road-step,stop.road,stop.road+step])this.network.bayWalk.set(road,heading);}
    this.jobs=this.commercialJobs+this.industrialJobs;
    const homes=this.homeBuffer,workplaces=this.workBuffer;homes.length=0;workplaces.length=0;this.commercialBuffer.length=0;this.industrialBuffer.length=0;
    for(const row of rows){const {t,home,workplace}=row;if(!t.level||!t.networkConnected)continue;
      if(home){home.capacity=this.residents?this.residents.occupancy(home.id):t.level*this.config.residentsPerLevel;home.workers=this.residents?this.residents.workers(home.id):undefined;homes.push(home);}
      else if(workplace){workplace.capacity=t.level*(workplace.kind==='commercial'?this.config.commercialJobsPerLevel:this.config.industrialJobsPerLevel);workplaces.push(workplace);(workplace.kind==='commercial'?this.commercialBuffer:this.industrialBuffer).push(workplace);}
    }
    for(const kind of ['commercial','industrial'] as const){const entries=kind==='commercial'?this.commercialBuffer:this.industrialBuffer;this.weightBuffer.length=entries.length;for(let i=0;i<entries.length;i++)this.weightBuffer[i]=entries[i].capacity;const parts=apportion(kind==='commercial'?this.commercialJobs:this.industrialJobs,this.weightBuffer);entries.forEach((w,i)=>w.capacity=parts[i]);}
    this.traffic.residentPopulation=this.residents?homes.reduce((n,h)=>n+h.capacity,0):this.population;this.traffic.residentMode=!!this.residents;this.traffic.routingMonth=this.month;
    let affected:Set<number>;
    if(sliced)affected=yield* this.traffic.solveSteps(homes,workplaces,this.workforce);
    else affected=this.traffic.solve(homes,workplaces,this.workforce);
    for(const id of affected)this.mark({x:id%this.size,z:Math.floor(id/this.size)});
    this.employed=this.traffic.employed;
    this.industrialEmployed=this.traffic.industrialEmployed;
    this.commercialEmployed=this.traffic.commercialEmployed;
    const workforce=this.workforce,employment=workforce?this.employed/workforce:1;
    const taxApproval=Math.max(0,1-Math.max(0,this.taxRate-1)*this.config.taxDissatisfaction);
    this.satisfaction=Math.round(100*(this.powerRatio*this.config.powerSatisfactionWeight+this.waterRatio*this.config.waterSatisfactionWeight+employment*this.config.employmentSatisfactionWeight+taxApproval*this.config.taxSatisfactionWeight));
    this.satisfaction=Math.max(0,this.satisfaction-Math.round(Math.max(0,this.traffic.averageMinutes-this.config.comfortableCommuteMinutes)*this.config.commuteSatisfactionPenalty));
    if(this.safety.enabled&&!this.safetyDeferred){
      const previous=new Map(this.safety.results),rebuilds=this.safety.profile.rebuilds;
      const work=this.safety.update(rows.filter(r=>r.t.zone).map(r=>({id:r.c.z*this.size+r.c.x,zone:r.t.zone!,level:r.t.level})),this.traffic,this.population,this.housing);
      if(sliced)yield* work;else while(!work.next().done){}
      for(const [id,r] of this.safety.results){const old=previous.get(id);if(!old||old.fire!==r.fire||old.police!==r.police||old.crimeRisk!==r.crimeRisk)this.mark({x:id%this.size,z:Math.floor(id/this.size)});}
      if(this.safety.profile.rebuilds!==rebuilds)for(let id=0;id<this.size*this.size;id++)if(this.network.has(id))this.mark({x:id%this.size,z:Math.floor(id/this.size)});
      }
    this.satisfaction=Math.max(0,this.satisfaction-Math.round(this.safety.penalty));
    if(this.wellness.active&&!this.safetyDeferred){
      const previous=new Map(this.wellness.results),rebuilds=this.wellness.profile.rebuilds;
      const work=this.wellness.update(rows.filter(r=>r.t.zone==='residential').map(r=>({id:r.c.z*this.size+r.c.x,level:r.t.level})),this.traffic,this.population,this.housing);
      if(sliced)yield* work;else while(!work.next().done){}
      for(const [id,r] of this.wellness.results){const old=previous.get(id);if(!old||old.medical!==r.medical||old.elementary!==r.elementary||old.highSchool!==r.highSchool)this.mark({x:id%this.size,z:Math.floor(id/this.size)});}
      if(rebuilds!==this.wellness.profile.rebuilds)for(let id=0;id<this.size*this.size;id++)if(this.network.has(id))this.mark({x:id%this.size,z:Math.floor(id/this.size)});
    }
    this.satisfaction=Math.max(0,this.satisfaction-Math.round(this.wellness.penalty));
    if(this.waterUtility)this.satisfaction=Math.max(0,this.satisfaction-Math.round(this.waterUtility.penalty));
    if(this.environment)this.satisfaction=Math.max(0,this.satisfaction-Math.round(this.environment.penalty));
    this.sceneryBonus=this.parks.average(homes);this.satisfaction=Math.min(100,Math.round(this.satisfaction+this.sceneryBonus));
    const clamp=(n:number)=>Math.round(Math.max(0,Math.min(100,n)));
    this.demand.residential=clamp(this.config.housingBaseDemand+this.sceneryBonus*PARK_EFFECTS.demandPerPoint+this.jobs*this.config.housingJobWeight-this.population*this.config.housingPopulationWeight+(this.wellness.educationEnabled?this.wellness.education*this.wellness.config.housingEducationDemand:0));
    // Only the opt-in regeneration model changes demand; legacy and observer cities retain their formulas.
    if(this.management?.lifecycle?.mode==='evolve'&&!this.management.lifecycle.settlementPending&&workforce>0&&employment<LIFE_BALANCE.employmentFloor)this.demand.residential=Math.min(this.demand.residential,Math.max(0,this.config.minimumDemand-1));
    const workers=this.workforce;
    this.demand.commercial=clamp(this.config.commercialBaseDemand+workers*this.config.businessWorkerWeight-this.commercialJobs*this.config.businessCapacityWeight+(this.wellness.educationEnabled?this.wellness.advancedLevel*this.wellness.config.commercialEducationDemand:0));
    this.demand.industrial=clamp(this.config.industrialBaseDemand+workers*this.config.businessWorkerWeight-this.industrialJobs*this.config.businessCapacityWeight+(this.wellness.educationEnabled?this.wellness.basicLevel*this.wellness.config.industrialEducationDemand:0));
    this.projectedDemand={...this.demand};
    const m=this.management;if(m&&m.difficulty!=='normal'){
      const p=m.parameters,coverage:number[]=[];if(this.safety.enabled)coverage.push((this.safety.fireCoverage+this.safety.policeCoverage)/2);if(this.wellness.medicalEnabled)coverage.push(this.wellness.medicalCoverage);if(this.wellness.educationEnabled)coverage.push((this.wellness.elementaryCoverage+this.wellness.highSchoolCoverage)/2);const service=coverage.length?coverage.reduce((a,b)=>a+b,0)/coverage.length:1,penalty=(1-service)*p.serviceDemandWeight+Math.max(0,this.traffic.averageMinutes-this.config.comfortableCommuteMinutes)*p.commuteDemandWeight+Math.max(0,this.taxRate-1)*p.taxDemandWeight;
      for(const k of ZONES)this.projectedDemand[k]=clamp(this.demand[k]*p.populationDemand-penalty+(k==='residential'?(employment-1)*p.employmentDemandWeight-Math.max(0,this.housing-this.population)*(p.housingVacancyWeight??0):0));
      if(this.month>m.lastDemandMonth){for(const k of ZONES)m.demand[k]=smoothDemand(m.demand[k],this.projectedDemand[k],p);m.lastDemandMonth=this.month;}
      for(const k of ZONES)this.demand[k]=Math.round(m.demand[k]);
    }
    if(this.environment)this.environment.sync(this.environmentInputs());
  }
  /** Fixed, deterministic monthly update. Never called by the render adapter. */
  setRouting(mode:"distance"|"time"){if(this.updating||this.abandoned)throw new Error("都市更新中はキューを使用してください");this.traffic.routing.setMode(mode,this.month);this.recount();}
  private beginMonth(){
    this.traffic.allowRebalance=true;
    this.month++;this.budget.advance();this.applyBudget();this.recount();this.safetyDeferred=true;this.levelsCurrent=true;this.constructionSpending=0;
  }
  private updateBuilding({c,t,chunk,i}:{c:Cell;t:Tile;chunk:Chunk;i:number}):boolean{
      const life=this.management?.lifecycle,evolve=life?.mode==='evolve',empty=evolve&&t.zone==='residential'&&t.level>1&&vacancy(this.population,this.housing)>LIFE_BALANCE.vacancyDecline;
      const localWater=this.waterUtility?this.waterUtility.status(c.z*this.size+c.x).water:this.hydrology?this.hydrology.at(c.z*this.size+c.x):this.waterRatio;
      const bad=localWater<this.config.declineSupplyThreshold||empty||!t.networkConnected||this.powerRatio<this.config.declineSupplyThreshold||this.waterRatio<this.config.declineSupplyThreshold||this.satisfaction<this.config.declineSatisfaction||this.funds<0;
      chunk.decline[i]=bad?Math.min(this.config.declineMonths,chunk.decline[i]+1):0;
      if(t.level>0&&chunk.decline[i]>=this.config.declineMonths){chunk.levels[i]--;t.level=chunk.levels[i];chunk.decline[i]=0;chunk.ages[i]=0;this.mark(c);return true;}
      if((evolve&&t.zone==='residential'&&t.level>0&&this.housing>0&&vacancy(this.population,this.housing)>LIFE_BALANCE.vacancyGrowth)||bad || localWater<this.config.growthSupplyThreshold||this.powerRatio<this.config.growthSupplyThreshold||this.waterRatio<this.config.growthSupplyThreshold||this.satisfaction<this.config.growthSatisfaction || this.demand[t.zone!]<this.config.minimumDemand || ((this.management?.parameters.housingVacancyWeight??0)>0&&this.projectedDemand[t.zone!]<this.config.minimumDemand) || t.level>=this.config.maxLevel) {chunk.ages[i]=0;return false;}
      chunk.ages[i]=Math.min(this.config.growthMonths,chunk.ages[i]+1);
      const cost=t.level?this.config.upgradeCost:this.config.buildingCost;
      if(chunk.ages[i]>=this.config.growthMonths && this.funds>=cost) {
        this.funds-=cost;this.constructionSpending+=cost;chunk.levels[i]++;t.level=chunk.levels[i];chunk.ages[i]=0;this.mark(c);return true;
      }
      return false;
  }
  private migrate(){
    // Aggregated households: no individual citizen objects.
    const baseInflow=this.satisfaction>=this.config.growthSatisfaction?Math.floor(this.config.migrationPerMonth*this.waterRatio*this.wellness.migrationFactor*(this.waterUtility?.migrationFactor??1)):0,inflow=Math.round(baseInflow*(1-(this.environment?.penalty??0)*.01)),life=this.management?.lifecycle,workers=this.workforce;
    if(life?.mode==='evolve'&&life.settlementPending===undefined&&this.population===0&&life.highest===0&&life.history.length===this.month-1&&(this.month===1||life.history[0]?.month===1)&&life.history.every(p=>p.population===0))life.settlementPending=true;
    if(life?.settlementPending&&this.jobs>0)life.settlementPending=false;
    const delta=life?.settlementPending?Math.max(0,Math.min(inflow,this.config.residentsPerLevel-this.population)):life?.mode==='evolve'?populationDelta(life,this.population,workers?Math.min(1,this.employed/workers):1,this.satisfaction,this.config.growthSatisfaction,this.jobs>0?inflow:0):inflow;
    if(this.residents){if(delta<0)this.residents.leave(-delta);else this.residents.plan(this,delta);this.population=this.residents.population;}else this.population=Math.max(0,Math.min(this.housing,this.population+delta));
  }
  private account(){
    this.tax=Math.round((this.population*this.config.residentTax*this.powerRatio+this.employed*this.config.jobTax)*this.taxRate*100)/100;
    let levels=0;for(const {t} of this.censusRows())levels+=t.level;
    this.maintenance=Math.round(([...this.network.ids()].reduce((sum,id)=>sum+this.network.profile(id).upkeep,0)*this.config.roadMaintenance+levels*this.config.buildingMaintenancePerLevel+this.infrastructureMaintenance+(this.management?.debt??0)*(this.management?.parameters.loanInterest??0))*100)/100;
    this.balance=Math.round((this.tax-this.maintenance)*100)/100;
    const costs=this.financeCosts(),repayment=this.management?money(Math.min(this.management.debt,Math.max(0,this.balance)*this.management.parameters.repaymentRate,Math.max(0,this.funds+this.balance))):0;
    if(this.management)this.management.debt=money(this.management.debt-repayment);
    this.funds=Math.round((this.funds+this.balance-repayment)*100)/100;
    const residentTax=money(this.population*this.config.residentTax*this.powerRatio*this.taxRate);this.lastLedger={month:this.month,residentTax,jobTax:money(this.tax-residentTax),tax:this.tax,costs,maintenance:this.maintenance,construction:this.constructionSpending,repayment,balance:this.balance,cashDelta:money(this.balance-this.constructionSpending-repayment),funds:this.funds,debt:this.management?.debt??0};if(this.management)this.management.ledger=this.lastLedger;
  }
  private finishMonth(closingDemand:DemandValues){this.safetyDeferred=false;this.levelsCurrent=false;this.recount();if(this.wellness.active){this.wellness.advance(this.month,this.population);this.recount();}this.migrate();this.recount();this.account();this.recordHistory();this.environmentMonth();this.statistics=appendMonthly(this.statistics,monthlyPoint(this,closingDemand));}
  private *monthlyUpdate():Generator<void>{
    const closingDemand=urbanDemand(this);
    this.traffic.allowRebalance=true;this.month++;this.budget.advance();this.applyBudget();yield* this.recountSteps();this.safetyDeferred=true;this.levelsCurrent=true;this.constructionSpending=0;
    for(const row of this.censusRows()){if(this.updateBuilding(row))yield* this.recountSteps();yield;}
    this.safetyDeferred=false;this.levelsCurrent=false;yield* this.recountSteps();if(this.wellness.active){this.wellness.advance(this.month,this.population);yield* this.recountSteps();}this.migrate();yield* this.recountSteps();this.account();this.recordHistory();this.environmentMonth();this.statistics=appendMonthly(this.statistics,monthlyPoint(this,closingDemand));
  }
  private *routingUpdate(mode:'distance'|'time'):Generator<void>{this.traffic.routing.setMode(mode,this.month);yield* this.recountSteps();}
  /** Conservative forecast: the normal fast path stays synchronous. */
  needsSlicedStep(limit=16){if(this.waterUtility&&this.buildingCount>=128)return true;if(this.sanitation&&this.buildingCount>=128)return true;if((this.energy?.plants.size??0)>0&&this.buildingCount>=128)return true;if((this.hydrology?.pipes.size??0)>1024)return true;if(this.transit.operations.active&&this.buildingCount>=128)return true;if(this.budget.changed||this.wellness.active||this.safety.enabled||this.traffic.routing.due(this.month+1))return true;let count=0;for(const {t,chunk,i} of this.censusRows())if((t.level>0&&chunk.decline[i]>=this.config.declineMonths-1)||(t.level<this.config.maxLevel&&chunk.ages[i]>=this.config.growthMonths-1)){if(++count>=limit)return true;}return false;}
  step(){if(this.updating||this.abandoned)throw new Error('月次処理が進行中です');try{const closingDemand=urbanDemand(this);this.beginMonth();for(const row of this.censusRows())if(this.updateBuilding(row))this.recount();this.finishMonth(closingDemand);}finally{this.safetyDeferred=false;this.levelsCurrent=false;this.traffic.allowRebalance=false;}}
  async stepAsync(options:{budgetMs?:number;yieldTask?:()=>Promise<void>;signal?:AbortSignal;useWorker?:boolean}={},mode?:'distance'|'time'){
    if(this.updating||this.abandoned)throw new Error('月次処理が進行中です');if(!Number.isFinite(options.budgetMs??4)||(options.budgetMs??4)<=0)throw new Error('Invalid update budget');if(!mode&&options.useWorker!==false&&City.workerExecutor&&this.size>=128&&this.bulkDue())return this.stepInWorker(options);this.updating=true;
    const budget=options.budgetMs??4;if(!Number.isFinite(budget)||budget<=0){this.updating=false;throw new Error('Invalid update budget');}
    const yieldTask=options.yieldTask??(()=>new Promise<void>(resolve=>setTimeout(resolve,0))),started=performance.now(),iterator=mode?this.routingUpdate(mode):this.monthlyUpdate();
    Object.assign(this.stepProfile,{slices:0,maxSliceMs:0,elapsedMs:0,workMs:0,workerCpuMs:0});
    try{await yieldTask();let done=false;while(!done){if(options.signal?.aborted)throw new DOMException('都市更新を取り消しました','AbortError');const slice=performance.now();do{done=!!iterator.next().done;}while(!done&&performance.now()-slice<budget);const elapsed=performance.now()-slice;this.stepProfile.slices++;this.stepProfile.workMs+=elapsed;this.stepProfile.maxSliceMs=Math.max(this.stepProfile.maxSliceMs,elapsed);if(!done)await yieldTask();}}
    catch(error){this.abandoned=true;throw error;}
    finally{this.safetyDeferred=false;this.levelsCurrent=false;this.traffic.allowRebalance=false;iterator.return(undefined);this.updating=false;this.stepProfile.elapsedMs=performance.now()-started;}
  }

}
