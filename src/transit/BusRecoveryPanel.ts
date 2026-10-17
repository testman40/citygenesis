import type {BusOperations} from './BusOperations';
import {BusRecoveryUI,type RecoveryExecutor} from './BusRecoveryUI';
import {recoveryGuidance} from './RecoveryDiagnostic';

export const RECOVERY_HTML=`<details id="bus-recovery-panel"><summary>運休・異常停止便の復旧</summary><p>位置・乗客・周回を保持できる便だけ復旧できます。</p><label for="bus-recovery-select">対象便</label><select id="bus-recovery-select" aria-describedby="bus-recovery-guidance"><option value="">便を選択してください</option></select><ul id="bus-recovery-list"></ul><p id="bus-recovery-guidance" aria-live="polite"></p><button id="bus-recovery-run" disabled hidden>再経路化してこの便だけ再開</button><p id="bus-recovery-result" role="status" aria-live="polite"></p></details>`;

/** Stable controls: periodic HUD refresh does not replace the focused button/select. */
export class BusRecoveryPanel {
  private model:BusRecoveryUI;
  private signature='';private owner:BusOperations|undefined;
  private select=document.getElementById('bus-recovery-select') as HTMLSelectElement;
  private button=document.getElementById('bus-recovery-run') as HTMLButtonElement;
  private result=document.getElementById('bus-recovery-result')!;
  private panel=document.getElementById('bus-recovery-panel') as HTMLDetailsElement;
  constructor(private operations:()=>BusOperations,execute:RecoveryExecutor,scope:()=>unknown){
    this.model=new BusRecoveryUI(operations,(action,done)=>execute(action,error=>{done(error);this.signature='';this.refresh(true);}),scope);
    this.select.onchange=()=>{this.model.select(this.select.value);this.refresh(true);};
    this.button.onclick=()=>{this.model.recoverAndResume();this.refresh(true);};
    this.panel.addEventListener('toggle',()=>{if(this.panel.open)this.refresh(true);});
  }
  refresh(force=false){
    const operations=this.operations();this.model.sync();
    const signature=[operations.transit.revision,operations.transit.graph.revision,...[...operations.buses.values()].filter(b=>b.state==='paused'||b.state==='error').map(b=>[b.id,b.state,b.phase,b.nextEvent,b.lap,b.onboard].join(':'))].join('|');
    if(!this.panel.open&&!force)return;
    if(!force&&this.owner===operations&&signature===this.signature)return;
    this.owner=operations;this.signature=signature;
    const rows=this.model.rows(),selected=this.model.selectedId;
    const options=[['便を選択してください',''],...rows.map(r=>[(r.possible?'復旧可能：':'復旧不可：')+r.label,r.id])];
    const optionSignature=JSON.stringify(options);
    if(this.select.dataset.options!==optionSignature){this.select.replaceChildren(...options.map(([text,value])=>new Option(text,value)));this.select.dataset.options=optionSignature;}
    this.select.value=selected??'';this.select.disabled=this.model.status==='pending';
    const list=document.getElementById('bus-recovery-list')!;list.replaceChildren();
    for(const row of rows){const li=document.createElement('li');li.textContent=(row.possible?'復旧可能：':'復旧不可：')+row.label+' — '+recoveryGuidance(row.reason,row.diagnostic);list.append(li);}
    if(!rows.length){const li=document.createElement('li');li.textContent='運休・異常停止中の便はありません。';list.append(li);}
    const row=rows.find(r=>r.id===selected);
    this.button.hidden=!row;this.button.disabled=!row?.possible||this.model.status==='pending';
    this.result.textContent=this.model.message;this.result.dataset.state=this.model.status;
    document.getElementById('bus-recovery-guidance')!.textContent=this.model.guidance;
  }
}
