/** Fades only edges with content still outside a horizontal viewport. */
export class OverflowHints {
 constructor(){
  const nodes=Array.from(document.querySelectorAll<HTMLElement>('#hud-tools,#hud-info-tabs,.information-shortcuts,.road-icon-options,.hud-road-profiles,.growth-tabs,.growth-categories'));
  const paint=(node:HTMLElement)=>{const overflow=node.scrollWidth-node.clientWidth;node.classList.toggle('hud-overflow-left',overflow>2&&node.scrollLeft>2);node.classList.toggle('hud-overflow-right',overflow>2&&node.scrollLeft<overflow-2);};
  for(const node of nodes){node.classList.add('hud-overflow');node.addEventListener('scroll',()=>paint(node),{passive:true});new ResizeObserver(()=>paint(node)).observe(node);new MutationObserver(()=>paint(node)).observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});paint(node);}
  window.addEventListener('resize',()=>nodes.forEach(paint));
 }
}
