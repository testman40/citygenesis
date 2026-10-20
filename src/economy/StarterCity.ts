import {City} from '../simulation/City';
import {connectWaterInfrastructure} from '../water/ConnectedWater';
import type {Difficulty} from './config';
/** Small normal-rule start. Infrastructure is paid from the chosen difficulty's funds. */
export function createStarterCity(difficulty:Difficulty='normal'){
 const c=City.create(64,difficulty);connectWaterInfrastructure(c);c.enableLifecycle();c.enableResidents();
 c.apply({x:0,z:32},{x:24,z:32},'road');c.apply({x:10,z:33},{x:10,z:33},'water');c.apply({x:18,z:33},{x:18,z:33},'sewage');
 return c;
}
