import type {Transit} from './Transit';
import {BUS_INFRA} from './BusOperations';
/** Operating costs reconcile to the existing transit budget; fares are explicitly a planning estimate. */
export function routeEconomics(t:Transit,fare:number){
 fare=Number.isFinite(fare)?Math.max(0,Math.min(100,fare)):0;
 const routes=[...t.routes.values()],references=new Map<number,number>();for(const route of routes)for(const stop of route.stops)references.set(stop,(references.get(stop)??0)+1);
 const rows=routes.map(route=>{
  const service=t.services.get(route.id),settings=t.operations.routes.get(route.id),depot=settings?t.operations.depots.get(settings.depot):undefined,allocated=depot?t.operations.allocated(depot.id):0;
  const running=!!service?.active,operating=(settings&&!t.operations.operating(route.id)?0:route.fleet*t.config.busMaintenance)*t.funding;
  const stops=route.stops.reduce((sum,id)=>sum+(t.stops.has(id)?t.config.stopMaintenance/(references.get(id)??1):0),0)*t.funding;
  const ownership=depot?route.fleet*BUS_INFRA.busOwnership*t.funding:0,depotCost=depot&&allocated?BUS_INFRA.depotMaintenance*route.fleet/allocated*t.funding:0;
  const cost=operating+stops+ownership+depotCost,riders=service?.riders??0,capacity=service?.capacity??0;
  const buses=[...t.operations.buses.values()].filter(b=>b.route===route.id),onboard=buses.reduce((n,b)=>n+b.onboard,0),waiting=[...t.passengerFlows.values()].filter(f=>f.route===route.id).reduce((n,f)=>n+f.count,0)/t.config.tripsPerMonth;
  return {id:route.id,name:route.name,running,fleet:route.fleet,riders,capacity,utilization:capacity?riders/capacity:0,onboard,waiting:Math.ceil(waiting),boarded:buses.reduce((n,b)=>n+b.boarded,0),cost,operating,stops,ownership,depotCost,revenue:riders*fare,balance:riders*fare-cost};
 });
 return {rows,otherCost:Math.max(0,t.maintenance-rows.reduce((n,r)=>n+r.cost,0)),totalCost:t.maintenance,fare};
}
