export const WELLNESS_CONFIG={
 clinicCost:1000,hospitalCost:3600,elementaryCost:1400,highSchoolCost:2200,
 clinicMaintenance:12,hospitalMaintenance:40,elementaryMaintenance:16,highSchoolMaintenance:24,
 clinicCapacity:700,hospitalCapacity:2600,elementaryCapacity:400,highSchoolCapacity:240,
 medicalMinutes:24,schoolMinutes:16,elementaryDemandRatio:.12,highSchoolDemandRatio:.08,
 healthFloor:.45,healthMonthlyRate:.05,basicMonthlyRate:.02,advancedMonthlyRate:.01,
 healthSatisfactionPenalty:12,educationSatisfactionPenalty:6,minimumMigrationFactor:.25,
 commercialEducationDemand:20,industrialEducationDemand:10,housingEducationDemand:8,maxFacilities:32
};
export type WellnessConfig=typeof WELLNESS_CONFIG;
