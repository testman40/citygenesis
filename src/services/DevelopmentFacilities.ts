/** Additional facilities reuse the saved wellness layout and its three service networks. */
export const DEVELOPMENT_FACILITIES={
 library:{name:'図書館',stage:1,base:'elementary',group:'elementary',cost:900,maintenance:8,capacity:180,detail:'学習室と地域の読書活動で基礎教育の定員を補います。小学校と同じ通学ネットワークで届く住宅に効果があります。'},
 university:{name:'大学',stage:2,base:'highSchool',group:'highSchool',cost:6500,maintenance:60,capacity:800,detail:'高等教育の定員を増やします。基礎教育を修了した人口の高等修了が月ごとに進み、教育水準に反映されます。'},
 medicalCenter:{name:'総合医療センター',stage:3,base:'hospital',group:'medical',cost:8000,maintenance:90,capacity:6500,detail:'大きな医療定員で人口の多い地区を支えます。道路の到達時間と医療予算に応じて医療充足・健康度へ反映されます。'},
 researchCampus:{name:'研究教育センター',stage:4,base:'highSchool',group:'highSchool',cost:14000,maintenance:140,capacity:2400,detail:'大都市の高等教育需要を支える大規模な学習拠点です。高等教育の定員を増やします。研究ポイントや新しい産業は発生しません。'},
} as const;
export type DevelopmentKind=keyof typeof DEVELOPMENT_FACILITIES;
export function isDevelopmentKind(kind:string):kind is DevelopmentKind{return Object.hasOwn(DEVELOPMENT_FACILITIES,kind);}
