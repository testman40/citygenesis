/** Fictional combinations, written in katakana; no celebrity or historical name catalog. */
export const GIVEN_NAMES=['ノラ','エミリオ','リオナ','ティエノ','エルミナ','ソレオ','アリネ','マリオラ','ネリオ','カミレ','フィオナ','ルシエル','ミレノ','セリナ','アレノ','エヴェリア','サビオ','レノラ','ダリオ','イレナ','アメリア','ニコラ','リヴィオ','オレナ','エリナ','レオニ','モレア','ユリアナ','セリア','フェリオ','ノエリア','ヴィオラ','エリオ','ミレア','ルネオ','ナタリア','カルミナ','エステラ','ロミオナ','リセオ','レティナ','ティリア','オリノ','ベリナ','クラリオ','デルミナ','サレノ','アウレア','メリア','ファビエル','イザリア','トレオ','ネヴァ','ロゼリ','アルミオ','ダネリア','ソフィラ','オリヴェナ','ヴァレオ','テレナ','シレオ','エミレア','ノヴィオ','ラウレナ'] as const;
export const FAMILY_NAMES=['ヴァンデル','ハルシェル','レヴァント','オルヴィナ','デルネッサ','ブレンヴィオ','マルシェナ','フェルヴァル','ノルヴェラ','ラヴィント','ベルセナ','アヴェリス','ロゼンヴェル','カステリナ','モルヴェン','ソルネッサ','ヴェルダナ','トレヴィル','ラルシェル','カラヴェル','エルドリナ','モンテリオ','ノヴァリン','セルヴァナ','フィルデン','ヴァレシア','デルフィナール','リュネッサ','アルヴェロ','セラヴァル','ネヴァリス','ブリネラ','ルヴェンティ','コルシェナ','メルヴァン','アストリナ','サルヴェロ','トレスミナ','リヴァニス','ヴェルシェル','オルネリオ','マルヴェラ','ネリヴァル','ベルトリナ','サヴェリア','テラヴィン','ルセルナ','ロルヴァル','エヴァルナ','カリヴェン','フェルネリ','デラヴィオ','アルモレナ','ヴァルシェン','ミラヴェル','セルミナール','ノルディナ','ラヴェリア','オストレナ','メルシェロ','パルネヴィ','エルヴァナ','ソレヴェン','トルネッサ'] as const;
const EXTENSIONS=['ラ','ヴァ','デル','ノ','ベル','ミル','セル','テラ'];
function extension(n:number):string{let s='';while(n>0){n--;s=EXTENSIONS[n%EXTENSIONS.length]+s;n=Math.floor(n/EXTENSIONS.length);}return s;}
/** Odd affine permutation covers every first/last pair exactly once per cycle. */
export function fictionalName(id:number,seed=0,index=0){
 const n=id-1,pool=GIVEN_NAMES.length*FAMILY_NAMES.length,slot=((n%pool)*1597+(seed>>>0)%pool)%pool,cycle=Math.floor(n/pool),first=(Math.floor(slot/FAMILY_NAMES.length)+index*17)%GIVEN_NAMES.length;
 const surname=FAMILY_NAMES[slot%FAMILY_NAMES.length]+(cycle?'・'+extension(cycle):'');return GIVEN_NAMES[first]+'・'+surname;
}
export const householdName=(id:number,seed=0)=>fictionalName(id,seed)+'家';
