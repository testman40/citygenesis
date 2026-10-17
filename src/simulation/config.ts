/** Credits; one simulation step represents one accounting month. */
export const BALANCE = {
  stepSeconds: 1, initialFunds: 20000, roadCost: 10, zoneCost: 5,
  buildingCost: 60, upgradeCost: 90, growthMonths: 4, maxLevel: 3,
  residentsPerLevel: 12, commercialJobsPerLevel: 6, industrialJobsPerLevel: 10,
  migrationPerMonth: 4, workforceRatio: 0.5, residentTax: 2, jobTax: 3,
  roadMaintenance: 0.15, buildingMaintenancePerLevel: 1, minimumDemand: 10,
  housingBaseDemand: 55, commercialBaseDemand: 30, industrialBaseDemand: 45,
  housingJobWeight: 3, housingPopulationWeight: 1, businessWorkerWeight: 4, businessCapacityWeight: 3,
  starterPower:200, starterWater:200, powerCapacity:300, waterCapacity:300,
  powerCost:1200, waterCost:900, powerMaintenance:8, waterMaintenance:6,
  powerPerLevel:4, waterPerLevel:3, growthSupplyThreshold:0.5,
  growthSatisfaction:40, declineSatisfaction:25, declineSupplyThreshold:0.3, declineMonths:6,
  powerSatisfactionWeight:0.3, waterSatisfactionWeight:0.3, employmentSatisfactionWeight:0.25, taxSatisfactionWeight:0.15,
  taxDissatisfaction:0.7, autosaveSeconds:15,
  roadCapacity:40, minutesPerRoad:0.5, accessMinutes:1, maxCommuteMinutes:60,
  congestionFactor:0.5, congestionExponent:2, maxCongestionMultiplier:10,
  comfortableCommuteMinutes:15, commuteSatisfactionPenalty:0.5,
  maxDisplayVehicles:96, displayMinutesPerSecond:8,
  maxRouteSearches:2048, maxPathExpansions:200000, maxPathCache:4096,
};
export type Balance = typeof BALANCE;
