export const ROAD_KINDS={
 general:{name:'2車線',lanes:2,median:false,speed:40,capacity:1,cost:1,upkeep:1,width:.76,walk:true,bike:true,access:true},
 local:{name:'生活道路・共有1車線',lanes:1,median:false,speed:20,capacity:.55,cost:.7,upkeep:.7,width:.44,walk:true,bike:true,access:true},
 twoMedian:{name:'2車線・中央分離帯',lanes:2,median:true,speed:40,capacity:1.1,cost:1.5,upkeep:1.2,width:.76,walk:true,bike:true,access:true},
 four:{name:'4車線',lanes:4,median:false,speed:50,capacity:2,cost:2.5,upkeep:2,width:.8,walk:true,bike:false,access:true},
 fourMedian:{name:'4車線・中央分離帯',lanes:4,median:true,speed:50,capacity:2.2,cost:3,upkeep:2.2,width:.8,walk:true,bike:false,access:true},
 highway:{name:'高速道路',lanes:4,median:true,speed:80,capacity:3,cost:4,upkeep:3,width:.8,walk:false,bike:false,access:false},
 cycleway:{name:'自転車道・歩行者道',lanes:0,median:false,speed:15,capacity:0,cost:.5,upkeep:.4,width:.42,walk:true,bike:true,access:false},
 bus:{name:'バス専用道路',lanes:2,median:false,speed:40,capacity:1,cost:2,upkeep:1,width:.76,walk:true,bike:false,access:true},
} as const;
export type RoadKind=keyof typeof ROAD_KINDS;
export function isRoadKind(v:unknown):v is RoadKind{return typeof v==='string'&&Object.hasOwn(ROAD_KINDS,v);}
