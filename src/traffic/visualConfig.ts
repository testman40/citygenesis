/** Visual dimensions in one-grid-cell units; no capacity, cost or saved-road data. */
const pavementWidth=.76;
export const ROAD_VISUAL={pavementWidth,laneOffset:.235,centerLineWidth:.025,centerLineColor:'#f3db8e',asphaltColor:'#465761',surfaceY:.08};
export const VEHICLE_VISUAL={carScale:.72,busScale:.60,minimumGap:.08,timeScale:.12,clockBlendSeconds:.05,maxAdvanceMinutes:.4,maxStepMinutes:.02,terminalTimeMultiplier:2.5};
export type VehicleKind='car'|'van'|'truck'|'bus'|'bike';
export function vehicleDimensions(kind:VehicleKind){if(kind==='bike')return {width:.055,length:.23};const s=kind==='bus'?VEHICLE_VISUAL.busScale:VEHICLE_VISUAL.carScale,body=kind==='car'?.40:kind==='van'?.49:kind==='truck'?.59:.76;return {width:(kind==='car'?.22:kind==='bus'?.30:.25)*s,length:Math.max(body,body*.96+(kind==='bus'?.055:.035))*s};}
