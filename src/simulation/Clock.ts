export type Speed = 0 | 1 | 2 | 4;
/** Wall-clock accumulator, independent of requestAnimationFrame and Three.js. */
export class SimulationClock {
  speed: Speed = 1;
  private accumulated=0;
  constructor(private step:()=>void,readonly stepSeconds=1) {}
  snapshot() { return {speed:this.speed,accumulated:Math.max(0,this.accumulated)}; }
  restore(state:{speed:Speed;accumulated:number}) {
    if(![0,1,2,4].includes(state.speed)||!Number.isFinite(state.accumulated)||state.accumulated<0||state.accumulated>=this.stepSeconds)throw new Error('Invalid clock state');
    this.speed=state.speed;this.accumulated=state.accumulated;
  }
  advance(seconds:number) {
    if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid elapsed time');
    if(!this.speed)return;
    this.accumulated+=seconds*this.speed;
    while(this.accumulated+1e-9>=this.stepSeconds){this.accumulated-=this.stepSeconds;this.step();}
  }
}
