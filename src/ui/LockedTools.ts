/** Unavailable choices stay focusable so touch and keyboard users can ask why. */
export function unavailable(button:HTMLButtonElement,reason:string|null){
 button.disabled=false;button.setAttribute('aria-disabled',String(!!reason));if(reason)button.dataset.lockedReason=reason;else delete button.dataset.lockedReason;
}
export class LockedTools {
 constructor(){
  const note=document.createElement('p');note.id='tool-locked-reason';note.hidden=true;note.setAttribute('role','status');document.getElementById('road-panel')!.append(note);
  document.addEventListener('click',e=>{const b=(e.target as Element).closest<HTMLButtonElement>('button');if(!b)return;if(b.getAttribute('aria-disabled')!=='true'){note.hidden=true;return;}const reason=b.dataset.lockedReason;if(!reason)return;e.preventDefault();e.stopImmediatePropagation();note.textContent=reason;note.hidden=false;document.dispatchEvent(new CustomEvent('city-ui-notice',{detail:reason}));},true);
 }
}
