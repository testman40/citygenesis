/** Monthly aggregate demand; display fleet is independent of simulated riders. */
export const TRANSIT_BALANCE={stopCost:100,stopMaintenance:1,busMaintenance:12,seats:30,tripsPerMonth:4,walkRadius:4,walkMinutesPerCell:1.5,maxWalkCommute:6,waitMinutes:2,dwellMinutes:.35,maxStops:64,maxRoutes:16,maxRouteStops:16,maxFleet:20,maxDisplayBuses:24};
export type TransitBalance=typeof TRANSIT_BALANCE;
