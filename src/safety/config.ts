export const SAFETY_CONFIG={
 fireCost:1400,policeCost:1200,fireMaintenance:18,policeMaintenance:16,
 fireCapacity:1800,policeCapacity:1800,maxResponseMinutes:20,
 fireRiskResidential:.12,fireRiskCommercial:.18,fireRiskIndustrial:.32,
 crimeBase:.08,crimeDensityWeight:.12,crimeCommercialWeight:.12,
 riskReduction:.8,satisfactionPenalty:20,maxStations:32
};
export type SafetyConfig=typeof SAFETY_CONFIG;
