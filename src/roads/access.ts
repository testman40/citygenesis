import type {CityState} from '../save/schema';
export const BUS_ROAD_STAGE=1;
export function busRoadUnlocked(state:Pick<CityState,'management'|'population'>){return state.management?.lifecycle?(state.management.lifecycle.highest>=BUS_ROAD_STAGE):state.population>=100;}
export const BUS_ROAD_REQUIREMENT='レベル2「小さな町」で解放（人口100・サービス30%・資金と収支0以上を3か月維持）。発展モデルのない既存都市は人口100で利用できます。';
