export type Weather='clear'|'cloudy'|'rain';
export type TimePreview='auto'|'morning'|'day'|'evening'|'night';
type RGB=[number,number,number];
export interface Atmosphere {hour:number;sun:number;ambient:number;night:number;wet:number;fogFar:number;sky:RGB;sunColor:RGB;ambientColor:RGB}
const rgb=(hex:string):RGB=>[parseInt(hex.slice(0,2),16)/255,parseInt(hex.slice(2,4),16)/255,parseInt(hex.slice(4,6),16)/255];
const keys=[
 {h:0,s:.18,a:1.12,n:1,sky:rgb('25394f'),light:rgb('91aacb'),ambient:rgb('a8bdcf')},
 {h:6,s:.65,a:1.05,n:.35,sky:rgb('d9c6b7'),light:rgb('ffc99c'),ambient:rgb('d7ddec')},
 {h:12,s:2.5,a:1.55,n:0,sky:rgb('dfeceb'),light:rgb('fff0da'),ambient:rgb('e6f1fb')},
 {h:18,s:.8,a:.93,n:.35,sky:rgb('c8b0ac'),light:rgb('ffb884'),ambient:rgb('c6c7df')},
 {h:21,s:.18,a:1.12,n:1,sky:rgb('25394f'),light:rgb('91aacb'),ambient:rgb('a8bdcf')},
 {h:24,s:.18,a:1.12,n:1,sky:rgb('25394f'),light:rgb('91aacb'),ambient:rgb('a8bdcf')},
];
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const mix=(a:RGB,b:RGB,t:number):RGB=>a.map((n,i)=>lerp(n,b[i],t)) as RGB;
export function atmosphere(gameTime:number,dayNight=true,weather:Weather='clear',weatherEnabled=true,preview:TimePreview='auto'):Atmosphere {
 const hour=!dayNight?12:preview==='auto'?((gameTime%24)+24)%24:({morning:6,day:12,evening:18,night:0} as const)[preview];
 let i=0;while(i<keys.length-2&&hour>keys[i+1].h)i++;const a=keys[i],b=keys[i+1],p=(hour-a.h)/(b.h-a.h),t=p*p*(3-2*p);
 const actual=weatherEnabled?weather:'clear',cloud=actual==='clear'?0:actual==='cloudy'?.55:.85,wet=actual==='rain'?1:0;
 return {hour,sun:lerp(a.s,b.s,t)*(1-cloud*.65),ambient:lerp(a.a,b.a,t)*(1-cloud*.12),night:lerp(a.n,b.n,t),wet,fogFar:245-cloud*100,sky:mix(mix(a.sky,b.sky,t),mix(rgb('b5c5c8'),rgb('344651'),lerp(a.n,b.n,t)),cloud*.55),sunColor:mix(a.light,b.light,t),ambientColor:mix(a.ambient,b.ambient,t)};
}
export function blendAtmosphere(current:Atmosphere,target:Atmosphere,seconds:number):Atmosphere {
 const t=1-Math.exp(-Math.max(0,seconds)/.45);
 return {hour:target.hour,sun:lerp(current.sun,target.sun,t),ambient:lerp(current.ambient,target.ambient,t),night:lerp(current.night,target.night,t),wet:lerp(current.wet,target.wet,t),fogFar:lerp(current.fogFar,target.fogFar,t),sky:mix(current.sky,target.sky,t),sunColor:mix(current.sunColor,target.sunColor,t),ambientColor:mix(current.ambientColor,target.ambientColor,t)};
}
export function easeConstruction(progress:number,from=0){const p=Math.max(0,Math.min(1,progress));return from+(1-from)*(1-(1-p)**3);}
