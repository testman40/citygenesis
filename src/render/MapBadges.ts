import {mapWarningAt,mapWarningGroups} from '../info/MapWarnings';
import * as THREE from 'three';
import type {City,Tool} from '../simulation/City';
import {toolIcon} from '../Presentation';
import {toolGroup,TOOL_COLORS,type HudGroup} from '../ui/HudPresentation';
export function mapBadgeWarning(city:City,cell:{x:number;z:number}):string|null {return mapWarningAt(city,cell)?.title??null;}
interface Badge {x:number;z:number;height:number;group:HudGroup;icon:string;warning:string|null;request?:string}
/** Bounded, decorative view of nearby tiles; never writes to the city. */
export class MapBadges {
 private root=document.createElement('div');private nodes:HTMLElement[]=[];private candidates:Badge[]=[];private scan=0;private revision='';private owner:City|undefined;private vector=new THREE.Vector3();
 constructor(){this.root.id='city-map-badges';this.root.setAttribute('aria-label','地域の状態を示す地図の札');document.getElementById('app')!.append(this.root);}
 update(city:City,camera:THREE.Camera,rect:DOMRect,target:THREE.Vector3,distance:number,visible:boolean){
  this.root.hidden=!visible||distance>110||city.updating;if(this.root.hidden)return;const now=performance.now(),revision=[city.network.revision,city.traffic.solveRevision,city.population,city.transit.revision,city.safety.stations.size,city.wellness.facilities.size,city.safety.fireCoverage,city.safety.policeCoverage,city.wellness.medicalCoverage,city.wellness.elementaryCoverage,city.wellness.highSchoolCoverage].join(':');
  if(this.owner!==city||revision!==this.revision||now-this.scan>350){this.owner=city;this.scan=now;this.revision=revision;const list:Badge[]=[];for(let z=Math.max(0,Math.floor(target.z)-14);z<Math.min(city.size,Math.floor(target.z)+15);z++)for(let x=Math.max(0,Math.floor(target.x)-14);x<Math.min(city.size,Math.floor(target.x)+15);x++){const t=city.tile({x,z}),kind=t.facility??t.zone;if(kind){const group=kind==='park'||kind==='plaza'?'residential':toolGroup(kind as Tool)??'info';list.push({x,z,height:Math.max(.5,t.level*.5+.5),group,icon:kind,warning:null});}else if(t.road&&((z*city.size+x)%16===0||!city.network.isMain(z*city.size+x)))list.push({x,z,height:.18,group:'road',icon:'road',warning:null});}
   for(const group of mapWarningGroups(city,list,target)){const badge=list.find(b=>b.x===group.cell.x&&b.z===group.cell.z)!;badge.warning=group.label;badge.request=group.warning.card;}
   list.sort((a,b)=>(Number(!a.warning)-Number(!b.warning))*10+Number(a.group==='road')-Number(b.group==='road')+((a.x-target.x)**2+(a.z-target.z)**2-((b.x-target.x)**2+(b.z-target.z)**2))*.001);this.candidates=list.slice(0,120);
  }
  const obstacles=['hud-topbar','hud-tools','hud-context','workspace-drawer','hud-notices','hud-settings-menu','hud-camera-controls'].map(id=>document.getElementById(id)).filter((n):n is HTMLElement=>!!n&&!n.hidden&&n.getClientRects().length>0).map(n=>n.getBoundingClientRect());for(const n of Array.from(document.querySelectorAll<HTMLElement>('.bus-map-stop:not([hidden])')))obstacles.push(n.getBoundingClientRect());const placed:Array<{x:number;y:number}>=[];let count=0;
  for(const b of this.candidates){this.vector.set(b.x+.5,b.height,b.z+.5).project(camera);if(this.vector.z<-1||this.vector.z>1)continue;const x=rect.left+(this.vector.x+1)*rect.width/2,y=rect.top+(1-this.vector.y)*rect.height/2;
   if(x<16||y<80||x>innerWidth-16||y>innerHeight-16||obstacles.some(r=>x+16>r.left&&x-16<r.right&&y+16>r.top&&y-16<r.bottom)||placed.some(p=>Math.abs(p.x-x)<34&&Math.abs(p.y-y)<34))continue;
   let node=this.nodes[count];if(!node){node=document.createElement('span');node.className='city-map-badge';this.nodes.push(node);this.root.append(node);node.onclick=e=>{if(node!.dataset.warning!=='true')return;e.stopPropagation();const [x,z]=node!.dataset.cell!.split(',').map(Number);document.dispatchEvent(new CustomEvent('city-map-warning',{detail:{cell:{x,z},request:node!.dataset.request}}));};node.onkeydown=e=>{if(node!.dataset.warning==='true'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();node!.click();}};}
   const key=b.icon+':'+(b.warning??'');if(node.dataset.kind!==key){node.dataset.kind=key;node.dataset.warning=String(!!b.warning);node.innerHTML=b.warning?'<b class="map-badge-alert">!</b>':toolIcon(b.icon);node.style.background=b.warning?'#A32D2D':TOOL_COLORS[b.group];node.title=b.warning??'';if(b.warning){node.setAttribute('role','button');node.tabIndex=0;node.setAttribute('aria-label',b.warning);}else{node.removeAttribute('role');node.removeAttribute('tabindex');node.removeAttribute('aria-label');}}node.dataset.request=b.request??'';node.dataset.cell=b.x+','+b.z;node.style.transform=`translate(${x-15}px,${y-15}px)`;node.hidden=false;placed.push({x,y});if(++count>=48)break;
  }
  for(let i=count;i<this.nodes.length;i++)this.nodes[i].hidden=true;
 }
}
