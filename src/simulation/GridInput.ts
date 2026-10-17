import type {Cell} from './City';
/** Matches a straight pointer stroke without painting an invisible L-shaped corner. */
export function gridStroke(from:Cell,to:Cell):Cell[]{if(![from.x,from.z,to.x,to.z].every(Number.isInteger))throw new Error('グリッド座標が不正です');const cells:Cell[]=[],dx=Math.abs(to.x-from.x),dz=Math.abs(to.z-from.z),sx=Math.sign(to.x-from.x),sz=Math.sign(to.z-from.z);let x=from.x,z=from.z,error=dx-dz;while(true){cells.push({x,z});if(x===to.x&&z===to.z)return cells;const e=error*2;if(e>-dz){error-=dz;x+=sx;}if(e<dx){error+=dx;z+=sz;}}}
