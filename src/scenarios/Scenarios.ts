import {City} from '../simulation/City';
import {Hydrology} from '../water/Hydrology';
import {purchaseBus} from '../transit/BusEditor';
import {validateSave,type SaveData} from '../save/schema';
export const SCENARIOS=[
 {id:'rebuild',name:'赤字都市の再建',description:'余分な発電所の維持費で赤字の街。資金0以上・人口12人以上で3か月連続黒字にしましょう。',hint:'経営分析で維持費を確認。東側の余分な発電所を撤去し、住宅と職場を維持します。'},
 {id:'river',name:'川の両岸を結ぶ',description:'3マス幅の川で分かれた道路を橋で結びましょう。',hint:'建設 → 橋。X30 / Z30の岸からX34 / Z30の対岸へドラッグします。'},
 {id:'bus',name:'循環バスの初運行',description:'用意された路線でバスを出庫させ、1周を終えて車庫に戻しましょう。',hint:'公共交通で「まち巡り線」を選び運行開始。時間を進め、全車の帰庫を確認します。'},
] as const;
export type ScenarioId=typeof SCENARIOS[number]['id'];
export interface ScenarioProgress {id:ScenarioId;startedMonth:number;lastMonth:number;streak:number;completed:boolean}
const cell=(x:number,z:number)=>({x,z});
export function createScenario(id:ScenarioId):SaveData{
 if(!SCENARIOS.some(s=>s.id===id))throw new Error('シナリオがありません');const city=City.create(64);city.funds=60000;
 if(id==='river'){
  city.hydrology=new Hydrology(64);for(let z=0;z<64;z++)for(let x=31;x<=33;x++)city.hydrology.river.add(z*64+x);
  city.apply(cell(24,30),cell(30,30),'road');city.apply(cell(34,30),cell(40,30),'road');
 }else{
  for(const [x,z,X,Z] of [[26,28,38,28],[26,35,38,35],[26,28,26,35],[38,28,38,35]])city.apply(cell(x,z),cell(X,Z),'road');
  city.applyStroke(cell(27,29),cell(30,29),'residential');city.applyStroke(cell(27,27),cell(30,27),'industrial');
  for(let month=0;month<8;month++)city.step();
  if(id==='rebuild'){for(let z=28;z<31;z++)for(let x=43;x<47;x++)city.apply(cell(x,z),cell(x,z),'power');city.step();}
  if(id==='bus'){
   for(let x=27;x<=30;x++){city.apply(cell(x,29),cell(x,29),'erase');city.apply(cell(x,27),cell(x,27),'erase');}
   city.applyStroke(cell(25,31),cell(25,34),'residential');city.applyStroke(cell(39,29),cell(39,33),'industrial');for(let i=0;i<24;i++)city.step();
   for(let x=26;x<=38;x++)city.traffic.setCapacity(35*64+x,3);
   for(const [x,z,h] of [[26,33,0],[35,35,3],[38,31,2]]){city.apply(cell(x,z),cell(x,z),'bus-stop');city.transit.stopAt(z*64+x)!.heading=h;}
   city.apply(cell(25,30),cell(25,30),'depot');purchaseBus(city,30*64+25);city.transit.operations.save('まち巡り線',[1,3,2],1,30*64+25,1);city.editTransit(()=>{});
  }
 }
 city.funds=id==='rebuild'?1500:8000;if(city.management?.ledger)city.management.ledger.funds=city.funds;
 return validateSave({version:4,savedAt:new Date().toISOString(),city:city.snapshot(),clock:{speed:0,accumulated:0}});
}
export function scenarioProgress(city:City,prior:ScenarioProgress):ScenarioProgress{
 if(prior.completed)return prior;const next={...prior};
 if(prior.id==='river')next.completed=city.network.sameComponent(30*64+30,30*64+34)&&[31,32,33].every(x=>city.hasRoad(cell(x,30)));
 if(prior.id==='bus'){const buses=[...city.transit.operations.buses.values()].filter(b=>b.route===1);next.completed=buses.length>0&&buses.every(b=>b.state==='garage'&&b.clock>0&&b.lap>=b.tripLaps);}
 if(prior.id==='rebuild'&&city.month>prior.lastMonth){const good=city.balance>0&&city.funds>=0&&city.population>=12;next.streak=good?(city.month===prior.lastMonth+1?prior.streak+1:1):0;next.completed=next.streak>=3;}
 next.lastMonth=city.month;return next;
}
