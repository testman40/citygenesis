import type {City,Cell} from '../simulation/City';
import {gridStroke} from '../simulation/GridInput';
export function quoteBridge(city:City,from:Cell,to:Cell){
 if(!city.hydrology)throw new Error('橋は河川のある都市で建設できます。');
 if(!city.contains(from)||!city.contains(to)||from.x!==to.x&&from.z!==to.z)throw new Error('両岸を結ぶ直線を指定してください。');
 const cells=[...gridStroke(from,to)],river=city.hydrology.river;
 if(cells.length<3||cells.length>34||river.has(from.z*city.size+from.x)||river.has(to.z*city.size+to.x)||cells.slice(1,-1).some(c=>!river.has(c.z*city.size+c.x)))throw new Error('川のすぐ手前の岸から、対岸の岸までドラッグしてください（川幅32マスまで）。');
 if(cells.some(c=>{const t=city.tile(c);return !!(t.zone||t.facility);}))throw new Error('橋の両端に区画や施設が重ならないようにしてください。');
 const cost=cells.reduce((n,c)=>n+(city.hasRoad(c)?0:city.config.roadCost*(river.has(c.z*city.size+c.x)?12:1)),0);
 return {cells,cost,affordable:cost===0||city.funds>=cost};
}
