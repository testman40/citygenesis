/** Balance multipliers also apply to saved/custom limits without changing the save schema. */
export const SERVICE_RANGE_SCALE:Readonly<Record<string,number>>={police:3,fire:3,elementary:2,highSchool:2.5,library:2,university:5};
export const serviceRangeScale=(kind:string)=>SERVICE_RANGE_SCALE[kind]??1;
