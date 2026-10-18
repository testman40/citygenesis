import type {Cell, City} from '../simulation/City';
import type {InfoMode} from './CityInformation';

export const LIVE_INFORMATION_INTERVAL = 250;
const num = (v:number) => v.toLocaleString('ja-JP', {maximumFractionDigits:1});
const percent = (v:number) => Math.round(v * 100) + '%';
export const LIVE_INFORMATION_HTML = `<section id="info-live" aria-label="現在の水質と交通" hidden>
<small id="info-live-status"></small><strong id="info-live-title"></strong>
<meter id="info-live-meter" min="0" max="1" low="0.2" high="0.6" optimum="0" aria-label="残留汚水の割合" hidden></meter>
<p id="info-live-values"></p><p id="info-live-selected"></p><details><summary>表示の意味</summary><small id="info-live-note"></small></details></section>`;

/** A load ratio from the existing water model, never a measured river concentration. */
export function waterInformation(c:City, selected:Cell|null) {
  const w=c.waterUtility, h=c.hydrology;
  const available=!!w || !!(h && c.sanitation);
  const total=w?.generated ?? h?.discharged ?? 0;
  const residual=w?.residual ?? h?.untreated ?? 0;
  const processed=w?.processed ?? h?.processed ?? 0;
  const ratio=available && total>0 ? Math.max(0,Math.min(1,residual/total)) : null;
  let selection='地点を選ぶと、その管網の状態を表示します。';
  if(selected) {
    const id=selected.z*c.size+selected.x;
    if(h?.river.has(id)) selection='選択中：河川の濃度・拡散は未計算です。';
    else if(!available) selection='選択中：水質管理が開始されていません。';
    else if(w) {
      const r=w.status(id);
      selection=!r.connected?'選択中：給排水網に未接続':r.generated>0?'選択管網：残留 '+num(r.residual)+' / 発生 '+num(r.generated)+'（'+percent(r.residual/r.generated)+'）':'選択管網：汚水発生なし';
    } else {
      const r=h!.treatmentAt(id);
      selection=!r.connected?'選択中：管網に未接続':r.discharged>0?'選択管網：残留 '+num(r.untreated)+' / 放流 '+num(r.discharged)+'（'+percent(r.untreated/r.discharged)+'）':'選択管網：放流なし';
    }
  }
  return {ratio, title:!available?'水質管理は未開始':ratio===null?'残留負荷率：対象の汚水なし':'残留負荷率 '+percent(ratio),
    values:!available?'下水・水質管理を開始すると表示します。':(w?'下水発生 ':'放流 ')+num(total)+' / 処理 '+num(processed)+' / 未処理 '+num(Math.max(0,total-processed))+' / 残留 '+num(residual), selection,
    note:'残留には処理後に残る汚れも含みます。数値は月換算の負荷で、水質濃度や河川への拡散ではありません。施設・配管・需要の計算確定後に反映します。'};
}

export interface ObservedVehicle {id?:string;x:number;z:number;kind?:string;roadA?:number}
/** Sample the bounded rendered fleet. Sampling never advances simulation time. */
export class TrafficObservation {
  private previous=new Map<string,{x:number;z:number}>();
  private owner:City|undefined;
  sample(c:City, poses:readonly ObservedVehicle[], selected:Cell|null, running:boolean) {
    if(this.owner!==c) {this.previous.clear();this.owner=c;}
    const current=new Map<string,{x:number;z:number}>();
    let cars=0,buses=0,bikes=0,moving=0,stopped=0,unknown=0,local=0;
    const selectedId=selected?selected.z*c.size+selected.x:undefined;
    for(const p of poses.slice(0,160)) {
      if(!p.id || current.has(p.id)) continue;
      current.set(p.id,{x:p.x,z:p.z});
      if(p.kind==='bus') buses++; else if(p.kind==='bike') bikes++; else cars++;
      const before=this.previous.get(p.id);
      if(!running || !before) unknown++;
      else if(Math.hypot(p.x-before.x,p.z-before.z)>.002) moving++; else stopped++;
      if(selectedId!==undefined && (p.roadA??Math.floor(p.z)*c.size+Math.floor(p.x))===selectedId) local++;
    }
    this.previous=running?current:new Map();
    return {total:current.size,cars,buses,bikes,moving,stopped,unknown,local};
  }
  reset(){this.previous.clear();this.owner=undefined;}
}

export function selectedTraffic(c:City, cell:Cell|null, count:number) {
  if(!cell || !c.hasRoad(cell)) return '道路を選ぶと、その道路の需要・容量・表示車両を確認できます。';
  const id=cell.z*c.size+cell.x, t=c.traffic;
  let signal='';
  if(c.network.adjacent(id).length>=3 || c.network.crossings.has(id)) {
    const phase=((c.network.signalTime%8)+8)%8;
    signal=' / 信号：'+(phase<2.8?'東西 青':phase<3.3?'全車 赤':phase<6.1?'南北 青':phase<6.6?'全車 赤':'歩行者 青');
  }
  return '選択道路：交通需要 '+num(t.volume(id))+' / 容量 '+num(t.capacity(id))+'（'+percent(t.congestion(id))+'） / 表示 '+count+'台'+signal;
}

/** Small live region; the expensive city-wide details are refreshed by existing HUD events. */
export class LiveInformation {
  private observation=new TrafficObservation();
  private stamp=-Infinity;
  private el(id:string){return document.getElementById(id)!;}
  update(c:City, mode:InfoMode, selected:Cell|null, state:{running:boolean;updating:boolean;hidden:boolean}, poses:()=>readonly ObservedVehicle[], now=performance.now(), force=false) {
    const root=this.el('info-live');
    const active=!state.hidden && ['traffic','water','sewage','environment'].includes(mode);
    root.hidden=!active;
    if(!active){this.observation.reset();this.stamp=-Infinity;return;}
    if(!force && now-this.stamp<LIVE_INFORMATION_INTERVAL)return;
    this.stamp=now;
    this.set('info-live-status',state.updating?'都市更新中 · 前回の確定値':state.running?'自動更新 · 約0.25秒ごと':'一時停止 · 現在値を表示');
    const meter=this.el('info-live-meter') as HTMLMeterElement;
    if(mode==='traffic') {
      meter.hidden=true;
      if(state.updating){this.observation.reset();this.set('info-live-title','交通情報を更新中');this.set('info-live-values','都市の計算が完了すると観測を再開します。');this.set('info-live-selected','');this.set('info-live-note','');return;}
      const r=this.observation.sample(c,poses(),selected,state.running);
      this.set('info-live-title','表示中の車両 '+r.total+'台');
      this.set('info-live-values','車 '+r.cars+' / バス '+r.buses+' / 自転車 '+r.bikes+(state.running?' · 走行 '+r.moving+' / 停止 '+r.stopped+(r.unknown?' / 観測中 '+r.unknown:''):' · 移動を一時停止'));
      this.set('info-live-selected',selectedTraffic(c,selected,r.local));
      this.set('info-live-note','台数は描画対象の代表車両です。停止には信号待ち・乗降なども含みます。交通需要と容量は都市の計算値で、表示台数とは異なります。');
    } else {
      this.observation.reset();
      const r=waterInformation(c,selected);
      meter.hidden=r.ratio===null;
      if(r.ratio!==null)meter.value=r.ratio;
      this.set('info-live-title',r.title);this.set('info-live-values',r.values);this.set('info-live-selected',r.selection);this.set('info-live-note',r.note);
    }
  }
  private set(id:string,text:string){const el=this.el(id);if(el.textContent!==text)el.textContent=text;}
}
