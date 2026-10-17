import type {BusOperations} from './BusOperations';
import {RecoveryError,recoveryGuidance,type RecoveryDiagnostic} from './RecoveryDiagnostic';

export interface RecoveryRow {id:string;label:string;possible:boolean;reason:string;diagnostic:RecoveryDiagnostic}
export type RecoveryExecutor=(action:(operations:BusOperations)=>void,done:(error?:unknown)=>void)=>void;

/** UI-only selection and feedback. No saved fields and no implicit target selection. */
export class BusRecoveryUI {
  selectedId:string|undefined;
  status:'idle'|'pending'|'success'|'error'='idle';
  message='復旧する便を選択してください。';
  guidance='';
  private owner:unknown;
  private generation=0;
  private selectionFeedback=true;
  constructor(private operations:()=>BusOperations,private execute:RecoveryExecutor,private scope:()=>unknown=operations){}

  sync(){
    const operations=this.operations();
    if(this.owner!==this.scope()){
      this.owner=this.scope();this.generation++;this.selectedId=undefined;this.guidance='';this.status='idle';this.selectionFeedback=true;this.message='復旧する便を選択してください。';
    }
    if(this.selectedId&&!['paused','error'].includes(operations.buses.get(this.selectedId)?.state??'')){
      this.selectedId=undefined;
      this.guidance='';
      if(this.selectionFeedback&&this.status!=='pending'){this.status='error';this.message='選択した便の状態が変わったため、対象選択を解除しました。';}
    }
    return operations;
  }
  rows():RecoveryRow[]{
    const operations=this.sync();
    const rows=[...operations.buses.values()].filter(b=>b.state==='paused'||b.state==='error').map(bus=>{
      const result=operations.previewBusRecovery(bus.id);
      const route=operations.transit.routes.get(bus.route)?.name??'不明な路線';
      return {id:bus.id,label:route+' / '+bus.id+' / '+(bus.state==='error'?'異常停止':'運休')+' / '+bus.lap+'/'+bus.tripLaps+'周 / 乗客'+bus.onboard+'人',...result};
    });
    const selected=rows.find(row=>row.id===this.selectedId);
    this.guidance=selected&&this.status!=='pending'?recoveryGuidance(selected.reason,selected.diagnostic):'';
    if(selected&&this.selectionFeedback&&this.status!=='pending'){this.status=selected.possible?'idle':'error';this.message=selected.reason;}
    return rows;
  }
  select(id:string){
    this.sync();if(this.status==='pending')return;
    this.selectedId=id||undefined;this.guidance='';this.status='idle';this.selectionFeedback=true;
    if(!id){this.message='復旧する便を選択してください。';return;}
    const row=this.rows().find(r=>r.id===id);
    if(!row){this.selectedId=undefined;this.status='error';this.message='選択した便は運休・異常停止中ではありません。';return;}
    this.status=row.possible?'idle':'error';this.message=row.reason;
  }
  recoverAndResume(){
    const owner=this.sync();if(this.status==='pending')return;
    const id=this.selectedId,generation=this.generation,scope=this.scope();
    if(!id){this.status='error';this.message='復旧する便を選択してください。';return;}
    const result=owner.previewBusRecovery(id);
    if(!result.possible){this.status='error';this.message=id+'：'+result.reason;this.guidance=recoveryGuidance(result.reason,result.diagnostic);return;}
    const fingerprint=JSON.stringify(owner.buses.get(id));
    this.selectionFeedback=false;this.guidance='';this.status='pending';this.message=id+'：復旧処理中です。';
    let settled=false,executed=false;
    const done=(error?:unknown)=>{
      if(settled)return;settled=true;
      this.sync();if(generation!==this.generation)return;
      this.status=error?'error':'success';
      this.message=error?id+'：'+(error instanceof Error?error.message:'復旧処理に失敗しました。'):id+'：再経路化し、この便だけ運行を再開しました。';
      if(error instanceof RecoveryError)this.guidance=recoveryGuidance(error.message,error.diagnostic);
    };
    try{this.execute(operations=>{
      if(settled||executed)throw Error('この復旧操作は完了済み、または実行済みです。');
      executed=true;
      if(this.scope()!==scope||this.generation!==generation)throw Error('都市が切り替わったため復旧を中止しました。');
      if(JSON.stringify(operations.buses.get(id))!==fingerprint)throw Error('便の状態が変わったため復旧を中止しました。対象便を確認してください。');
      operations.recoverAndResumeBus(id);
    },done);}catch(error){done(error);}
  }
}
