import {informationAt,INFO_STYLE,type InfoMode} from '../info/CityInformation';
import {ROAD_VISUAL} from '../traffic/visualConfig';
import type {City,Cell,Zone} from '../simulation/City';
export type Shape='surface'|'mass'|'detail'|'roof'|'foliage';
export interface Part {shape:Shape;x:number;y:number;z:number;w:number;h:number;d:number;color:string;angle:number;owner:number;unlit?:boolean;highlight?:boolean;rotor?:{x:number;z:number}}
export type Overlay=InfoMode;
const ROAD_TILE={road:true,zone:null,level:0,connected:true,networkConnected:true,facility:null};
export function hash(x:number,z:number){return ((x*73856093)^(z*19349663))>>>0;}
/** Rotate view parts, never simulation cells, toward the first orthogonal road. */
export function orientFront(parts:Part[],start:number,px:number,pz:number,front:number){const angle=front===0?Math.PI:front===1?Math.PI/2:front===3?-Math.PI/2:0,cos=Math.cos(angle),sin=Math.sin(angle);for(let i=start;i<parts.length;i++){const p=parts[i],dx=p.x-px,dz=p.z-pz;p.x=px+dx*cos+dz*sin;p.z=pz-dx*sin+dz*cos;p.angle+=angle;}return angle;}
export function createChunk(city:City,cx:number,cz:number,overlay:Overlay,quality:'standard'|'high'='standard',profile?:{roadMs:number;decorMs:number;otherMs:number;parts:number}):Part[]{
 const parts:Part[]=[];let owner=0;
 const add=(shape:Shape,x:number,y:number,z:number,w:number,h:number,d:number,color:string,angle=0)=>parts.push({shape,x,y,z,w,h,d,color,angle,owner});
 const mark=(...args:Parameters<typeof add>)=>{add(...args);parts[parts.length-1].unlit=true;};
 const tree=(x:number,z:number,seed:number)=>{const height=.65+(seed%4)*.08;add('mass',x,.23,z,.07,.46,.07,'#92775d');add('foliage',x,height,z,.43,height*.7,.43,seed%2?'#61977a':'#7dac83');if(quality==='high'){add('foliage',x-.13,height-.08,z+.07,.29,height*.52,.3,'#87b186');add('foliage',x+.12,height+.04,z-.06,.3,height*.5,.28,'#6c9f7b');}};
 for(let z=cz*16;z<Math.min(city.size,(cz+1)*16);z++)for(let x=cx*16;x<Math.min(city.size,(cx+1)*16);x++){
  const tileStart=parts.length;const begin=profile?performance.now():0;owner=z*city.size+x;const c={x,z},t=city.hasRoad(c)?ROAD_TILE:city.tile(c),seed=hash(x,z),px=x+.5,pz=z+.5;
  const hydro=city.hydrology;
  if(hydro?.river.has(owner)&&!t.road){add('surface',px,.035,pz,1,.06,1,overlay==='sewage'||overlay==='environment'?INFO_STYLE.neutral.color:overlay==='normal'?'#4b9fb8':'#639cb0');if(quality==='high'&&seed%3===0)mark('detail',px,.07,pz,.46,.008,.035,'#9bced6');continue;}
  if((overlay==='water'||overlay==='sewage')&&hydro?.pipes.has(owner)){const a=hydro.neighbors(owner).filter(id=>hydro.pipes.has(id)),v=overlay==='sewage'?(city.sanitation?hydro.treatmentAt(owner).ratio:0):hydro.at(owner),col=INFO_STYLE[informationAt(city,owner,overlay).state].color;for(const side of [-1,1]){const color=side<0?'#378ADD':'#0F6E56';mark('surface',px+side*.10,.13,pz+side*.10,.10,.018,.10,color);for(const id of a){const dx=id%city.size-x,dz=Math.floor(id/city.size)-z;mark('surface',px+dx*.25+(dz?side*.10:0),.13,pz+dz*.25+(dx?side*.10:0),dx?.5:.065,.018,dz?.5:.065,color);}}}
  const access=[city.hasRoad({x,z:z-1}),city.hasRoad({x:x+1,z}),city.hasRoad({x,z:z+1}),city.hasRoad({x:x-1,z})];
  const degree=access.filter(Boolean).length;
  if(t.road&&hydro?.river.has(owner)){
   add('surface',px,-.015,pz,1,.025,1,'#4b9fb8');
   const horizontal=access[1]||access[3];
   for(const side of [-.44,.44]){add('mass',px+(horizontal?0:side),.20,pz+(horizontal?side:0),horizontal?1:.045,.075,horizontal?.045:1,'#a7b9b8');add('detail',px+(horizontal?0:side),.10,pz+(horizontal?side:0),.04,.2,.04,'#81989a');}
  }
  if(t.road){
   const id=z*city.size+x,roadProfile=city.network.profile(id),load=city.traffic.congestion(id);
   const response=overlay==='fire'||overlay==='police'?city.safety.responseAt(id,overlay):null;
   const civic=overlay==='medical'?city.wellness.roadCoverage(id,'medical'):overlay==='education'?city.wellness.roadCoverage(id,'elementary')*.6+city.wellness.roadCoverage(id,'highSchool')*.4:0;
   const sewer=overlay==='sewage'&&city.sanitation?(hydro?.treatmentAt(id).ratio??0):0;const color=(overlay==='air'||overlay==='noise'||overlay==='environment')?INFO_STYLE.neutral.color:overlay==='normal'?(city.network.busOnly.has(id)?'#386f72':ROAD_VISUAL.asphaltColor):INFO_STYLE[informationAt(city,owner,overlay).state].color;
   add('surface',px,.025,pz,1,.045,1,'#d5d5c5');add('surface',px,.054,pz,access[1]||access[3]?1:roadProfile.width,.04,access[0]||access[2]?1:roadProfile.width,color);
   const direction=city.network.directions.get(id);if(direction!==undefined){const angle=[Math.PI,Math.PI/2,0,-Math.PI/2][direction];for(const side of [-1,1])mark('detail',px+Math.sin(angle)*.06+Math.cos(angle)*side*.06,.09,pz+Math.cos(angle)*.06-Math.sin(angle)*side*.06,.025,.012,.16,'#dce9cf',angle+side*.6);}
   for(let n=0;n<4;n++){if(!access[n])continue;
    if((degree>=3||city.network.crossings.has(id))&&roadProfile.walk){for(let stripe=-1;stripe<=1;stripe++)mark('detail',px+(n%2?(n===1?.37:-.37):stripe*.13),.079,pz+(n%2?stripe*.13:(n===0?-.37:.37)),n%2?.09:.065,.009,n%2?.065:.09,'#e9eadf');}
    else if(degree===2&&((access[0]&&access[2])||(access[1]&&access[3])))mark('detail',px+(n%2?(n===1?.28:-.28):0),.079,pz+(n%2?0:(n===0?-.28:.28)),n%2?.16:ROAD_VISUAL.centerLineWidth,.009,n%2?ROAD_VISUAL.centerLineWidth:.16,ROAD_VISUAL.centerLineColor);
   }
   for(let n=0;n<4;n++)if(!access[n])add('surface',px+(n%2?(n===1?.47:-.47):0),.09,pz+(n%2?0:(n===0?-.47:.47)),n%2?.045:1,.07,n%2?1:.045,'#d9dcce');
   const decorStarted=profile?performance.now():0;
   if(roadProfile.median&&degree<3&&!city.network.crossings.has(id)){const horizontal=access[1]||access[3];add('mass',px,.12,pz,horizontal?1:.055,.09,horizontal?.055:1,'#d5d3b3');}if(roadProfile.lanes===4&&degree<3){const horizontal=access[1]||access[3];for(const side of [-.205,.205])mark('detail',px+(horizontal?0:side),.079,pz+(horizontal?side:0),horizontal?.35:.012,.008,horizontal?.012:.35,'#e1e1cf');}if(roadProfile.lanes===0)add('surface',px,.078,pz,.4,.008,.4,'#658e73');for(const [cell,owner] of city.network.bayCells)if(owner===id){add('surface',cell%city.size+.5,.05,Math.floor(cell/city.size)+.5,.9,.04,.9,'#6f9290');}if(degree>=3){add('detail',x+.075,.36,z+.075,.025,.64,.025,'#55676b');add('detail',x+.10,.65,z+.075,.08,.17,.05,'#3f5155');add('detail',x+.105,.695,z+.105,.04,.035,.012,'#3f5155');add('detail',x+.105,.61,z+.105,.04,.035,.012,'#3f5155');}
   if(quality==='high'&&degree<3&&seed%11===0){add('detail',x+.08,.27,z+.92,.02,.47,.02,'#7c8e89');add('detail',x+.08,.52,z+.92,.18,.09,.025,'#85b5b8');}
   if(degree<3&&seed%7===0){add('detail',x+.12,.3,z+.12,.024,.52,.024,'#596b69');add('detail',x+.14,.57,z+.12,.12,.04,.07,'#f1e9c9');}
   if(profile){profile.roadMs+=decorStarted-begin;profile.decorMs+=performance.now()-decorStarted;}
  }else if(t.zone||t.facility){
   const palette={residential:'#63a985',commercial:'#4e99bf',industrial:'#d2aa56'};
   const ratio=overlay==='power'?city.powerRatio:hydro?hydro.at(owner):city.waterRatio;
   const safe=city.safety.results.get(owner),service=overlay==='fire'?(safe?.fire??0):Math.max(0,1-(safe?.crimeRisk??1)/.4);
   const welfare=city.wellness.results.get(owner);
   const medical=overlay==='medical'?(welfare?.medical??Math.max(0,...city.network.adjacent(owner).map(r=>city.wellness.roadCoverage(r,'medical')))):0;
   const education=overlay==='education'?(welfare?(welfare.elementary*.6+welfare.highSchool*.4):Math.max(0,...city.network.adjacent(owner).map(r=>city.wellness.roadCoverage(r,'elementary')*.6+city.wellness.roadCoverage(r,'highSchool')*.4))):0;
   const cover=overlay==='medical'?medical:education;
   const sewer=overlay==='sewage'&&city.sanitation?(hydro?.treatmentAt(owner).ratio??0):0;const tint=(overlay==='air'||overlay==='noise'||overlay==='environment')?INFO_STYLE.neutral.color:overlay==='normal'?(!t.networkConnected?'#c08b7c':t.zone?palette[t.zone]:'#bac8bd'):INFO_STYLE[informationAt(city,owner,overlay).state].color;
   if(t.level||t.facility)add('surface',px,.037,pz,.96,.065,.96,'#d6d9cc');else mark('surface',px,.037,pz,.96,.065,.96,tint);
   // Keep category borders even when disconnected; the fill still indicates isolation.
   const border=overlay==='normal'&&t.zone?palette[t.zone]:tint;
   for(const dx of [-.445,.445])mark('surface',px+dx,.075,pz,.035,.012,.93,border);
   for(const dz of [-.445,.445])mark('surface',px,.075,pz+dz,.93,.012,.035,border);
   if(t.facility){
    const facilityStart=parts.length;
    const body=t.networkConnected?'#ede5d3':'#a2aaa4';
    if(t.facility==='externalWater'){add('mass',px-.20,.30,pz,.33,.42,.65,body);add('roof',px-.20,.55,pz,.40,.08,.71,'#5a93a7');add('mass',px+.20,.31,pz,.35,.44,.55,'#94c5cf');for(const dz of [-.18,.18])mark('detail',px+.20,.55,pz+dz,.34,.03,.035,'#d9edf0');mark('detail',px-.20,.61,pz+.18,.20,.05,.09,'#69d4d0');}
    else if(t.facility==='sewage'||t.facility==='advancedSewage'){const advanced=t.facility==='advancedSewage';add('mass',px-.22,.29,pz,.30,.38,.68,body);add('mass',px-.22,.51,pz,.34,.07,.72,advanced?'#5f899b':'#718e88');for(const dz of [-.20,.20]){add('mass',px+.20,.20,pz+dz,.40,.20,.32,'#9bb1a9');add('surface',px+.20,.32,pz+dz,.31,.02,.24,advanced?'#76b4bc':'#7aab9e');add('detail',px+.20,.35,pz+dz,.025,.025,.28,'#d2ddd3');}mark('detail',px-.22,.56,pz+.22,.20,.04,.08,'#84d2bd');if(advanced)add('detail',px-.2,.64,pz-.18,.18,.18,.25,'#bdcfc8');}
    else if(t.facility==='wind'){add('surface',px,.10,pz,.76,.08,.76,'#c5d1c9');add('mass',px,.66,pz,.09,1.12,.09,body);add('mass',px,1.22,pz,.17,.12,.17,'#4e7f86');for(let blade=0;blade<3;blade++){const a=blade*Math.PI*2/3;add('detail',px+Math.sin(a)*.23,1.0,pz+Math.cos(a)*.23,.07,.62,.25,'#e1e9df',a);if(t.networkConnected)parts[parts.length-1].rotor={x:px,z:pz};}mark('detail',px,1.33,pz,.10,.04,.10,'#e8bb78');}
    else if(t.facility==='solar'){add('surface',px,.10,pz,.86,.08,.84,'#c5d1c9');for(const dx of [-.23,.23]){add('mass',px+dx,.22,pz,.025,.24,.55,'#869d99');add('mass',px+dx,.36,pz,.39,.055,.72,'#365e85');for(const dz of [-.23,0,.23])add('detail',px+dx,.395,pz+dz,.34,.009,.012,'#89bac9');}if(quality==='high')add('detail',px+.39,.23,pz+.31,.10,.24,.14,'#d6ded2');}
    else if(t.facility==='outfall'){add('mass',px,.20,pz,.72,.25,.64,'#94adb0');add('mass',px,.38,pz,.52,.12,.46,'#6f919b');for(const dx of [-.20,0,.20])add('detail',px+dx,.17,pz+.34,.12,.13,.09,'#435f6a');mark('detail',px,.48,pz,.35,.035,.10,'#68c6d0');}
    else if(t.facility==='depot'){add('mass',px,.31,pz-.10,.84,.48,.54,'#e9dfc7');add('roof',px,.59,pz-.10,.92,.09,.62,'#608b89');for(const dx of [-.23,.23]){add('detail',px+dx,.27,pz+.18,.30,.33,.025,'#536d71');mark('detail',px+dx,.49,pz+.20,.27,.055,.02,'#f1d49c');}add('surface',px,.085,pz+.32,.86,.02,.34,'#b5c1b8');mark('detail',px,.63,pz+.19,.44,.09,.035,'#72d8bc');}
    else if(t.facility==='clinic'||t.facility==='hospital'||t.facility==='elementary'||t.facility==='highSchool'||t.facility==='library'||t.facility==='university'||t.facility==='medicalCenter'||t.facility==='researchCampus'){
      const medical=t.facility==='clinic'||t.facility==='hospital'||t.facility==='medicalCenter',large=t.facility!=='clinic'&&t.facility!=='elementary'&&t.facility!=='library',h=t.facility==='medicalCenter'?1.85:t.facility==='researchCampus'?1.5:large?1.18:.54,accent=medical?'#62a7a3':t.facility==='library'?'#b98f62':t.facility==='university'?'#7193bb':t.facility==='researchCampus'?'#9d8fc5':t.facility==='elementary'?'#cd9e62':'#899f79';
      add('mass',px,h/2+.09,pz,.76,h,.68,body);add('mass',px,h+.13,pz,.82,.08,.74,accent);
      for(let floor=0;floor<(t.facility==='medicalCenter'?5:large?3:1);floor++)for(const dx of [-.24,0,.24])add('detail',px+dx,.3+floor*.34,pz+.35,.14,.16,.018,'#7aaeb5');
      add('detail',px,.2,pz+.37,.16,.24,.03,accent);add('surface',px,.08,pz+.4,.33,.02,.18,'#d3d9cc');
      if(medical){add('detail',px+.22,h+.23,pz+.18,.22,.05,.065,'#f6f2dc');add('detail',px+.22,h+.235,pz+.18,.065,.05,.22,'#f6f2dc');if(large)add('mass',px-.26,h+.28,pz-.1,.2,.26,.38,'#e1e8db');}
      else{add('mass',px-.28,.13,pz+.28,.15,.08,.13,'#dbc480');add('detail',px-.29,h+.24,pz-.20,.025,.30,.025,'#687e78');add('detail',px-.22,h+.3,pz-.2,.15,.07,.025,accent);}
      if(t.facility==='library')for(const dx of [-.23,0,.23])add('detail',px+dx,.47,pz+.37,.12,.05,.04,'#e5c68d');
      if(t.facility==='researchCampus'){add('mass',px,h+.28,pz,.35,.23,.35,'#c6c1dd');add('detail',px,h+.5,pz,.025,.3,.025,accent);}
      if(quality==='high'){add('detail',px-.18,h+.23,pz-.16,.18,.13,.19,'#a5b4aa');add('detail',px+.26,.16,pz+.4,.24,.05,.07,'#b5a27d');}
    }else if(t.facility==='fire'||t.facility==='police'){
      const accent=t.facility==='fire'?'#c96f56':'#658caf';
      add('mass',px,.36,pz,.76,.55,.70,body);add('mass',px,.68,pz,.8,.09,.74,accent);
      add('detail',px,.49,pz+.36,.72,.08,.025,accent);
      for(const dx of [-.22,0,.22])add('detail',px+dx,.26,pz+.36,.17,.25,.018,t.facility==='fire'?'#a69480':'#86b9c7');
      add('mass',px-.25,.95,pz-.18,.15,.65,.18,accent);
      if(quality==='high'){add('detail',px+.18,.79,pz-.15,.22,.14,.22,'#a7b2ac');add('detail',px-.25,1.3,pz-.18,.19,.07,.22,'#f0e5c8');}
    }else if(t.facility==='park'){
     add('surface',px,.08,pz,.96,.08,.96,'#81ae78');add('surface',px,.13,pz,.18,.025,.96,'#d8ceb0');tree(x+.20,z+.25,seed);tree(x+.80,z+.73,seed+1);add('mass',px+.21,.23,pz-.21,.30,.05,.11,'#aa8058');for(const dx of [.10,.32])add('detail',px+dx,.15,pz-.21,.035,.14,.10,'#617263');
    }else if(t.facility==='plaza'){
     add('surface',px,.09,pz,.95,.10,.95,'#d6c7b2');for(const dx of [-.31,0,.31])mark('detail',px+dx,.15,pz,.012,.012,.93,'#b7b6a4');add('mass',px,.20,pz,.43,.16,.43,'#bac7c5');mark('surface',px,.30,pz,.34,.025,.34,'#7eb9c8');add('mass',px,.41,pz,.075,.23,.075,'#91b4bd');tree(x+.16,z+.16,seed);
    }else if(t.facility==='power'){add('mass',px,.36,pz,.72,.55,.66,body);for(const dx of [-.18,.18]){add('mass',px+dx,.8,pz,.14,1.05,.16,'#87949b');add('detail',px+dx,1.1,pz,.15,.07,.17,'#e6b190');}add('detail',px,.12,pz+.36,.58,.09,.05,'#e6aa73');}
    else{add('mass',px,.28,pz,.72,.4,.65,'#cad9db');add('mass',px,.66,pz,.55,.37,.52,'#79b7c7');add('roof',px,.91,pz,.43,.18,.43,'#dfe9e1',Math.PI/4);add('detail',px,.48,pz+.34,.4,.08,.035,'#568d9c');}
    const front=access.findIndex(Boolean);orientFront(parts,facilityStart,px,pz,front);if(front>=0)add('surface',px+(front===1?.39:front===3?-.39:0),.09,pz+(front===0?-.39:front===2?.39:0),front%2?.18:.42,.02,front%2?.42:.18,'#d5d2bc');
   }else if(t.level&&t.zone){
    const zone=t.zone,level=t.level,muted=!t.networkConnected,variant=(seed>>>3)%4;const buildingStart=parts.length;
    if(zone==='residential'){
     const walls=muted?'#a0a8a2':['#f1e6cf','#dae4d5','#e7d5bc'][seed%3],roof=['#b97e63','#68888b','#7b8b70'][seed%3];
     const h=level===3?1.18+variant*.16:.42+level*.22+variant*.045;
     add('mass',px+(variant===1?-.07:0),h/2+.09,pz,variant===1?.49:variant===2?.72:.65,h,variant===3?.58:.68,walls);
     if(level<3)add('roof',px,h+.24,pz,.55,.34,.59,roof,Math.PI/4);
     else{add('mass',px,h+.105,pz,.73,.07,.74,'#e1e2d2');add('detail',px,h+.17,pz,.38,.04,.25,'#627f89');}
     for(let floor=0;floor<level;floor++)for(const dx of [-.19,.19]){add('detail',px+dx,.28+floor*.36,pz+.345,.14,.17,.015,'#789ca2');add('detail',px+.335,.28+floor*.36,pz+dx,.015,.17,.14,'#789ca2');}
     add('detail',px,.18,pz+.345,.13,.2,.018,'#9b846b');
     if(seed%3===1&&level>=2)add('detail',px,.62,pz+.38,.6,.05,.1,'#fbf0d8');
     tree(x+.12,z+.13,seed);
    }else if(zone==='commercial'){
     const h=.48+level*(.49+variant*.085);
     add('mass',px+(variant===1?-.10:0),h/2+.09,pz,variant===1?.50:variant===3?.65:.73,h,variant===2?.57:.72,muted?'#9baaaa':['#76a9b5','#7194ae','#89b4b5'][seed%3]);
     for(let floor=0;floor<=level;floor++)add('detail',px,.12+floor*.55,pz,.77,.04,.76,'#e9e8d9');
     for(const dx of [-.26,0,.26]){add('detail',px+dx,h/2+.1,pz+.365,.025,h,.02,'#d8e2dc');add('detail',px+.37,h/2+.1,pz+dx,.02,h,.025,'#d8e2dc');}
     add('mass',px,h+.12,pz,.79,.08,.79,'#d9e0d5');add('detail',px-.14,h+.22,pz-.1,.25,.14,.2,'#9faeac');
     add('detail',px,.23,pz+.4,.73,.08,.12,seed%2?'#d9996c':'#80b297');
    }else{
     const h=.32+level*(.16+variant*.03);
     add('mass',px,h/2+.09,pz,.84,h,.74,muted?'#a0a49d':['#e4d8b9','#d5d8cb','#dcc7ac'][seed%3]);
     add('mass',px,h+.11,pz,.9,.1,.79,'#849495');
     for(let bay=0;bay<level;bay++)add('detail',px-.25+bay*.24,.28,pz+.385,.18,.28,.02,'#7f9699');
     add('mass',px+.28,h+.36,pz-.23,.1,.65,.12,'#978f82');add('detail',px+.28,h+.57,pz-.23,.12,.055,.14,'#e4be87');
     for(let vent=0;vent<level;vent++)add('detail',px-.24+vent*.2,h+.2,pz-.1,.1,.1,.16,'#bec7bf');
     add('detail',px,.13,pz+.41,.83,.035,.04,'#ddb56b');
    }
    // Silhouette variations stay in the existing batches, even at standard quality.
    if(zone==='residential'&&level>=2){if(variant===1)add('mass',px+.22,.4,pz,.26,.64,.60,'#e6dfcc');if(variant===2)add('roof',px+.20,.58+level*.27,pz-.12,.28,.25,.33,'#78968b',Math.PI/4);if(variant===3)add('mass',px-.16,.24,pz+.29,.38,.31,.28,'#f0e6cd');}
    if(zone==='commercial'&&variant===1)add('mass',px+.24,.33+level*.20,pz-.08,.27,.45+level*.4,.58,'#8cb7bc');
    if(zone==='industrial'&&variant===2)add('mass',px-.29,.44+level*.19,pz-.23,.12,.85+level*.25,.12,'#c7bfae');
    if(zone==='industrial'&&variant===3)for(const dx of [-.23,.05,.27])add('roof',px+dx,.46+level*.20,pz,.17,.16,.39,'#90a4a0',Math.PI/4);
    if(quality==='high'){
      if(zone==='residential'){for(let floor=0;floor<level;floor++){add('detail',px,.3+floor*.37,pz+.37,.6,.035,.11,'#ebead9');add('detail',px,.4+floor*.37,pz+.40,.58,.07,.018,'#b3c3b7');}add('detail',px-.18,.23,pz+.38,.13,.06,.06,'#bba883');}
      if(zone==='commercial'){add('detail',px+.17,.35+level*.6,pz-.13,.27,.13,.24,'#9faeaa');add('detail',px,.44,pz+.40,.40,.12,.025,variant%2?'#e2b789':'#c2d9c9');for(const dx of [-.25,.25])add('detail',px+dx,.45,pz+.42,.035,.04,.025,'#f5ecd0');}
      if(zone==='industrial'){for(const dx of [-.25,0,.25])add('detail',px+dx,.47+level*.20,pz+.12,.17,.07,.25,'#d1dcce');add('detail',px+.33,.16,pz+.40,.18,.1,.12,'#c4a375');}
    }
    // Existing front faces point south; rotate toward the first adjacent road.
    const front=access.findIndex(Boolean),angle=orientFront(parts,buildingStart,px,pz,front);
    if(front>=0)add('surface',px+Math.sin(angle)*.39,.09,pz+Math.cos(angle)*.39,front%2?.27:.16,.025,front%2?.16:.27,'#e3dfca');
   }
  }else{
   if(overlay==='medical'||overlay==='education'){const cover=Math.max(0,...city.network.adjacent(owner).map(r=>overlay==='medical'?city.wellness.roadCoverage(r,'medical'):city.wellness.roadCoverage(r,'elementary')*.6+city.wellness.roadCoverage(r,'highSchool')*.4));if(cover>0)add('surface',px,.026,pz,.96,.04,.96,INFO_STYLE[informationAt(city,owner,overlay).state].color);}
   if(overlay==='workAccess'&&city.network.access(owner).length)add('surface',px,.028,pz,.96,.045,.96,INFO_STYLE[informationAt(city,owner,overlay).state].color);
   if(overlay==='transit'&&city.transit.covered(owner))add('surface',px,.026,pz,.96,.04,.96,INFO_STYLE.green.color);
   const nearRoad=access.some(Boolean);
   if((nearRoad&&seed%5===0)||(!nearRoad&&seed%113===0)){add('surface',px,.017,pz,.9,.025,.9,seed%2?'#b4c5a3':'#a7c4a2');tree(px,pz,seed);if(nearRoad){add('surface',px,.04,pz,.15,.022,.87,'#d9d7be');add('surface',px,.041,pz,.87,.022,.13,'#d9d7be');if(quality==='high'){add('detail',px+.25,.16,pz+.27,.31,.055,.12,'#bfa77f');add('detail',px+.25,.23,pz+.31,.31,.12,.03,'#bfa77f');}}}
   if(nearRoad&&seed%17===0){add('detail',px,.17,pz,.38,.06,.13,'#b7a382');add('detail',px-.13,.09,pz,.04,.14,.07,'#7a8779');add('detail',px+.13,.09,pz,.04,.14,.07,'#7a8779');}
  }
  const busStop=city.transit.stopAt(owner);if(busStop){const stopStart=parts.length;const active=city.network.has(owner);add('surface',x+.10,.10,pz,.16,.08,.70,active?'#72c4c7':'#bf8070');add('mass',x+.09,.34,z+.72,.025,.50,.025,'#657d7b');add('detail',x+.09,.57,z+.72,.15,.14,.035,active?'#86d5dc':'#d18770');if(quality==='high'){add('mass',x+.12,.31,z+.38,.03,.45,.36,'#9fb5ad');add('mass',x+.16,.56,z+.38,.30,.05,.44,'#e8d7b3');}if(busStop.heading!==undefined){const angle=busStop.heading===2?Math.PI:busStop.heading===1?-Math.PI/2:busStop.heading===3?Math.PI/2:0,co=Math.cos(angle),si=Math.sin(angle);for(let i=stopStart;i<parts.length;i++){const p=parts[i],dx=p.x-px,dz=p.z-pz;p.x=px+dx*co+dz*si;p.z=pz-dx*si+dz*co;p.angle+=angle;}}}
  if(overlay!=='normal'&&(t.road||t.zone||t.facility)){
   const info=informationAt(city,owner,overlay);if(info.state!=='neutral'){
    let top=.08;for(let i=tileStart;!t.road&&i<parts.length;i++)if(parts[i].shape==='mass'||parts[i].shape==='roof')top=Math.max(top,parts[i].y+parts[i].h*.5);
    const tint=INFO_STYLE[info.state].color;add('surface',px,top+.025,pz,.94,.012,.94,tint);parts[parts.length-1].highlight=true;
    const stripe=(dx:number,dz:number,w:number,d:number,angle=0)=>{add('surface',px+dx,top+.035,pz+dz,w,.008,d,'#ffffff',angle);parts[parts.length-1].highlight=true;};
    if(info.state==='red'){stripe(0,0,.44,.055,.785);stripe(0,0,.44,.055,-.785);}else if(info.state==='blue'){stripe(0,-.07,.32,.045);stripe(0,.07,.32,.045);}else stripe(0,0,.10,.10);
   }
  }
  if(profile&&!t.road)profile.otherMs+=performance.now()-begin;
 }
 if(profile)profile.parts+=parts.length;return parts;
}
