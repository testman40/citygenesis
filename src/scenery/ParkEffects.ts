export const PARK_EFFECTS={park:{radius:4,bonus:8},plaza:{radius:3,bonus:5},demandPerPoint:1.5} as const;
export class ParkEffects {
 private signature='';private coverage=new Map<number,number>();
 configure(size:number,sources:{id:number;kind:'park'|'plaza'}[]){
  const signature=size+':'+sources.map(s=>s.id+':'+s.kind).join(',');if(signature===this.signature)return;this.signature=signature;this.coverage.clear();
  for(const {id,kind} of sources){const {radius,bonus}=PARK_EFFECTS[kind],x=id%size,z=Math.floor(id/size);for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++){const distance=Math.abs(dx)+Math.abs(dz);if(distance>radius||x+dx<0||x+dx>=size||z+dz<0||z+dz>=size)continue;const cell=(z+dz)*size+x+dx,value=bonus*(radius+1-distance)/(radius+1);this.coverage.set(cell,Math.max(this.coverage.get(cell)??0,value));}}
 }
 at(id:number){return this.coverage.get(id)??0;}
 average(homes:{id:number;capacity:number}[]){const total=homes.reduce((sum,h)=>sum+h.capacity,0);return total?homes.reduce((sum,h)=>sum+this.at(h.id)*h.capacity,0)/total:0;}
}
