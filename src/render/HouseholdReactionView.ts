import * as THREE from 'three';
import type {City} from '../simulation/City';
import {householdMoods,moodIcon,type MoodDirection} from '../residents/HouseholdHappiness';
interface Reaction {offset?:number;home:number;direction:MoodDirection;count:number;score:number;from:number;changedAt:number;expires:number;height:number}
/** Short-lived reactions sit above homes; warning markers keep their own space. */
export class HouseholdReactionView {
 private root=document.createElement('div');private nodes:HTMLElement[]=[];private candidates:Reaction[]=[];private stamp=-Infinity;private owner:City|undefined;private revision=-1;private target='';private played=new Map<string,number>();private vector=new THREE.Vector3();
 constructor(){this.root.id='household-reactions';this.root.setAttribute('aria-label','世帯の幸福度の変化');document.getElementById('app')!.append(this.root);}
 update(c:City,camera:THREE.Camera,rect:DOMRect,target:THREE.Vector3,distance:number,visible:boolean){
  const now=performance.now();this.root.hidden=!visible||distance>110||c.updating||document.hidden;if(this.owner!==c){this.owner=c;this.played.clear();this.revision=-1;this.stamp=-Infinity;}
  if(this.root.hidden)return;
  const targetKey=Math.floor(target.x)+','+Math.floor(target.z);
  if(now-this.stamp>=200&&(this.revision!==householdMoods.revision||targetKey!==this.target||this.candidates.some(r=>now>=r.expires))){
   this.stamp=now;this.revision=householdMoods.revision;this.target=targetKey;const reactions:Reaction[]=[];
   for(let z=Math.max(0,Math.floor(target.z)-18);z<Math.min(c.size,Math.floor(target.z)+19);z++)for(let x=Math.max(0,Math.floor(target.x)-18);x<Math.min(c.size,Math.floor(target.x)+19);x++){
    const home=z*c.size+x,groups=new Map<MoodDirection,Reaction>();for(const h of c.residents?.atHome(home)??[]){const m=householdMoods.reaction(c,h,now);if(!m?.direction)continue;const old=groups.get(m.direction);if(old){old.count++;old.score+=m.score;old.from+=m.from;old.expires=Math.min(old.expires,m.expires);old.changedAt=Math.max(old.changedAt,m.changedAt);}else groups.set(m.direction,{home,direction:m.direction,count:1,score:m.score,from:m.from,changedAt:m.changedAt,expires:m.expires,height:Math.max(.5,c.tile({x,z}).level*.5+.5)+1.5});}
    for(const reaction of groups.values()){reaction.offset=groups.size>1?(reaction.direction==='up'?-24:24):0;reactions.push(reaction);}
   }
   this.candidates=reactions.sort((a,b)=>(a.home%c.size-target.x)**2+(Math.floor(a.home/c.size)-target.z)**2-((b.home%c.size-target.x)**2+(Math.floor(b.home/c.size)-target.z)**2)).slice(0,120);
  }
  const obstacles=['hud-topbar','hud-tools','hud-context','workspace-drawer','hud-notices','hud-settings-menu','hud-camera-controls'].map(id=>document.getElementById(id)).filter((e):e is HTMLElement=>!!e&&!e.hidden&&!!e.getClientRects().length).map(e=>e.getBoundingClientRect());
  for(const e of Array.from(document.querySelectorAll<HTMLElement>('.city-map-badge:not([hidden]),.bus-map-stop:not([hidden])')))obstacles.push(e.getBoundingClientRect());
  const placed:{x:number;y:number}[]=[];let count=0;
  for(const r of this.candidates){if(now>=r.expires)continue;const x=r.home%c.size,z=Math.floor(r.home/c.size);this.vector.set(x+.5,r.height,z+.5).project(camera);if(this.vector.z<-1||this.vector.z>1)continue;const px=rect.left+(this.vector.x+1)*rect.width/2+(r.offset??0),py=rect.top+(1-this.vector.y)*rect.height/2;
   if(px<24||py<80||px>innerWidth-24||py>innerHeight-24||obstacles.some(b=>px+21>b.left&&px-21<b.right&&py+21>b.top&&py-21<b.bottom)||placed.some(b=>Math.abs(b.x-px)<44&&Math.abs(b.y-py)<44))continue;
   let node=this.nodes[count];if(!node){node=document.createElement('span');node.className='household-reaction';node.setAttribute('role','img');this.nodes.push(node);this.root.append(node);}const token=r.home+':'+r.direction+':'+r.changedAt;
   if(node.dataset.token!==token){node.dataset.token=token;node.replaceChildren();const face=document.createElement('b');face.textContent=moodIcon(r.direction);node.append(face);if(r.count>1){const badge=document.createElement('small');badge.textContent=String(r.count);node.append(badge);}node.dataset.direction=r.direction;node.dataset.home=String(r.home);node.setAttribute('aria-label',r.count+'世帯の幸福度が'+(r.direction==='up'?'上昇':'低下')+'：'+Math.round(r.from/r.count)+'→'+Math.round(r.score/r.count));node.title=node.getAttribute('aria-label')!;}
   node.hidden=false;node.style.transform=`translate(${px-19}px,${py-19}px)`;placed.push({x:px,y:py});
   if(!this.played.has(token)){this.played.set(token,r.expires);document.dispatchEvent(new CustomEvent('city-household-reaction',{detail:{direction:r.direction,x:x+.5,z:z+.5,distance}}));}
   if(++count>=12)break;
  }
  for(let i=count;i<this.nodes.length;i++)this.nodes[i].hidden=true;for(const [key,expiry] of this.played)if(now>=expiry)this.played.delete(key);
 }
}
