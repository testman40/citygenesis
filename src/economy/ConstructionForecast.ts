import {PARKING} from '../urban/UrbanDevelopment';
import type {City,Cell,Tool} from '../simulation/City';
import {publicFacility,isPublicKind} from '../services/PublicFacilities';
import {GENERATION} from '../energy/Energy';
import {SEWAGE} from '../water/Sanitation';
import {WATER} from '../water/Hydrology';
import {WATER_MANAGEMENT} from '../water/WaterUtility';
import {BUS_INFRA} from '../transit/BusOperations';
import {ROAD_KINDS,type RoadKind} from '../roads/profiles';
const money=(v:number)=>Math.round(v*100)/100;
export function constructionForecast(c:City,tool:Tool,cell?:Cell|null,roadKind:RoadKind='general'){
 let cost:number,upkeep:number,locked:string|null=null;
 if(isPublicKind(tool)){const f=publicFacility(c,tool);cost=f.cost;upkeep=f.maintenance;locked=f.locked;}
 else switch(tool){
 case 'parking':cost=PARKING.cost*(c.management?.parameters.construction??1);upkeep=PARKING.maintenance*(c.management?.parameters.maintenance??1);break;
 case 'power':cost=c.config.powerCost;upkeep=c.config.powerMaintenance;break;
 case 'water':cost=c.config.waterCost;upkeep=c.config.waterMaintenance;break;
 case 'wind':case 'solar':cost=c.energy?.cost(tool)??GENERATION[tool].cost*(c.management?.parameters.construction??1);upkeep=c.energy?.upkeep(tool)??GENERATION[tool].maintenance*(c.management?.parameters.maintenance??1);break;
 case 'sewage':case 'advancedSewage':cost=c.sanitation?.cost(tool)??SEWAGE[tool].cost*(c.management?.parameters.construction??1);upkeep=c.sanitation?.upkeep(tool)??SEWAGE[tool].maintenance*(c.management?.parameters.maintenance??1);break;
 case 'externalWater':cost=c.waterUtility?.cost??WATER_MANAGEMENT.externalCost;upkeep=(c.waterUtility?.settings.externalMaintenance??WATER_MANAGEMENT.externalMaintenance)*(c.waterUtility?.prices.maintenance??1);break;
 case 'outfall':cost=WATER.outfallCost;upkeep=WATER.outfallMaintenance;break;
 case 'depot':cost=BUS_INFRA.depotCost;upkeep=BUS_INFRA.depotMaintenance*c.transit.funding;break;
 case 'road':cost=c.config.roadCost*ROAD_KINDS[roadKind].cost+(c.hydrology?WATER.pipeCost:0);upkeep=c.config.roadMaintenance*ROAD_KINDS[roadKind].upkeep+(c.hydrology?WATER.pipeMaintenance:0);break;
 default:return null;
 }
 const p=cell&&c.contains(cell)?c.placement(cell,tool):null,tile=cell&&c.contains(cell)?c.tile(cell):null;
 if(tile&&tool==='road'){
  const id=cell!.z*c.size+cell!.x,pipeMissing=!!c.hydrology&&!c.hydrology.pipes.has(id);
  cost=(tile.road?0:c.config.roadCost*ROAD_KINDS[roadKind].cost)+(pipeMissing?WATER.pipeCost:0);
  upkeep=(tile.road?c.config.roadMaintenance*(ROAD_KINDS[roadKind].upkeep-c.network.profile(id).upkeep):c.config.roadMaintenance*ROAD_KINDS[roadKind].upkeep)+(pipeMissing?WATER.pipeMaintenance:0);
 }else if(tile?.facility===tool){cost=0;upkeep=0;}
 const current=c.finance().forecast.balance;
 return {cost:money(cost),upkeep:money(upkeep),current,balance:money(current-upkeep),cash:money(c.funds-cost),ok:!locked&&(p?.ok??true)&&c.funds>=cost,reason:locked??(c.funds<cost?'資金が足りません':p?.reason??''),unit:tool==='road'?'1マス':'1施設'};
}
