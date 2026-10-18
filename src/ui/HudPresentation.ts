import type {Tool} from '../simulation/City';
export const TOOL_COLORS={road:'#5F5E5A',residential:'#3B6D11',commercial:'#185FA5',industrial:'#D85A30',power:'#BA7517',water:'#378ADD',transit:'#534AB7',erase:'#A32D2D',info:'#36434D'} as const;
export type HudGroup=keyof typeof TOOL_COLORS;
export function toolGroup(tool:Tool):HudGroup|null{
 if(tool==='select')return null;
 if(['road','bridge','crossing'].includes(tool))return 'road';
 if(['residential','commercial','industrial'].includes(tool))return tool as HudGroup;
 if(['power','wind','solar'].includes(tool))return 'power';
 if(['water','externalWater','pipe','pipe-remove','outfall','sewage','advancedSewage'].includes(tool))return 'water';
 if(['depot','bus-stop','bus-remove'].includes(tool))return 'transit';
 if(tool==='erase')return 'erase';
 return 'info';
}
/** Display only; exact monetary values remain in the city and detailed finance views. */
export function compactMoney(value:number){const n=Math.abs(value),unit=n>=1e8?1e8:n>=1e4?1e4:1,whole=Math.floor(n/unit);return (value<0&&whole?'-':'')+whole.toLocaleString('ja-JP')+(unit===1e8?'億':unit===1e4?'万':'');}
/** Month zero is the first month of the first game year. */
export function gameDate(month:number){const n=Math.max(0,Math.floor(month));return (Math.floor(n/12)+1)+'年'+(n%12+1)+'月';}
