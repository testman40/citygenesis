import {UPDATES_HTML} from './Updates';
import type {City,Tool} from '../simulation/City';
import {nextActions,tutorialSteps,type GuideAction} from './PlayGuide';
import {toolIcon} from '../Presentation';
type Category='build'|'info'|'transit'|'manage'|'save'|'help'|'updates'|'goals'|'audio';
const titles:Record<Category,string>={build:'建設',info:'都市情報',transit:'公共交通',manage:'経営・施設',save:'保存・都市切替',help:'遊び方',updates:'アップデート履歴',goals:'都市の成長',audio:'音の設定'};
const element=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id)! as T;
const tools:Array<[string,Array<[Tool,string]>]>=[
 ['街の基本',[['road','道路'],['bridge','橋'],['erase','撤去'],['residential','住宅'],['commercial','商業'],['industrial','工業']]],
 ['電力・給排水',[['power','発電所'],['wind','風力'],['solar','太陽光'],['externalWater','外部水道'],['water','給水施設'],['sewage','下水処理'],['advancedSewage','高度下水処理'],['pipe','上下水道管'],['pipe-remove','管撤去'],['outfall','排水口']]],
 ['公共サービス',[['clinic','診療所'],['hospital','病院'],['elementary','小学校'],['highSchool','高校'],['fire','消防署'],['police','警察署']]],
 ['レベル解放施設',[['library','図書館'],['university','大学'],['medicalCenter','総合医療センター'],['researchCampus','研究教育センター']]],
 ['公園・街の景観',[['park','公園'],['plaza','広場']]],
 ['バス',[['depot','車庫'],['bus-stop','停留所'],['bus-remove','停留所撤去']]],
];
/** Moves existing controls, never rebuilds them: drafts, focus and input values survive navigation. */
export class Workspace {
  category:Category|null=null;
  onNavigate:(category:Category|null)=>void=()=>{};
  onAction:(action:GuideAction)=>void=()=>{};
  onUndo:()=>void=()=>{};
  onRedo:()=>void=()=>{};
  onPlay:()=>void=()=>{};
  private owner:City|undefined;
  private tutorial=false;
  private signature='';
  private stamp=0;
  private financeViewed=false;
  private undoUsed=false;
  private dismissed=false;
  constructor(){
    const app=element('app');
    app.insertAdjacentHTML('beforeend',`<div id="workspace-menu" role="toolbar" aria-label="ゲームメニュー">${Object.entries(titles).filter(([id])=>id!=='updates').map(([id,title])=>`<button type="button" data-workspace="${id}" aria-controls="workspace-drawer" aria-expanded="false">${toolIcon(id==='build'?'road':id==='save'?'save':id==='help'?'help':id==='transit'?'transit':id==='goals'?'goals':id==='audio'?'audio':'manage')}<span>${title}</span></button>`).join('')}<button id="undo-build" type="button" disabled title="Ctrl / ⌘ + Z">↶ 取り消す</button><button id="redo-build" type="button" disabled title="Ctrl / ⌘ + Shift + Z">↷ やり直す</button></div>
    <section id="workspace-drawer" aria-labelledby="workspace-title" hidden><div class="workspace-heading"><h2 id="workspace-title"></h2><button id="workspace-close" aria-label="メニューを閉じる">閉じる ×</button></div>
      <div data-workspace-page="build"><p>ツールを選んで地図を操作します。</p>${tools.map(([label,items])=>`<details ${label==='街の基本'?'open':''}><summary>${label}</summary><div class="build-palette">${items.map(([tool,label])=>`<button data-tool="${tool}">${label}</button>`).join('')}</div></details>`).join('')}<p id="scenery-status" class="workspace-tip"></p><p class="workspace-tip">道路・区画・施設・地下管・橋は一時停止中に取り消し・やり直しできます。運行中の管理バスがある都市と、停留所の配置・撤去は対象外です。</p></div>
      ${['info','transit','manage','save','help','updates','goals','audio'].map(id=>`<div data-workspace-page="${id}" id="workspace-${id}"></div>`).join('')}
    </section>
    <section id="guide-panel" aria-label="都市づくりの案内"><div class="guide-heading"><b id="guide-kind">次にすること</b><button id="guide-dismiss" type="button" aria-label="案内を小さくする">−</button></div><div id="guide-content"></div><button id="guide-expand" type="button" hidden>案内を表示</button></section>
    <p id="undo-status" role="status">建設・撤去を取り消し・やり直しできます。</p>`);
    element('workspace-updates').innerHTML=UPDATES_HTML;
    const updates=document.createElement('button');updates.id='updates-open';updates.type='button';updates.textContent='更新履歴';updates.setAttribute('aria-label','アップデート履歴を開く');updates.setAttribute('aria-controls','workspace-drawer');updates.setAttribute('aria-expanded','false');
    document.querySelector('header .stats')!.append(updates);updates.onclick=()=>this.open(this.category==='updates'?null:'updates');
    const move=(selector:string,target:string)=>element(target).append(document.querySelector(selector)!);
    move('#information-toolbar','workspace-info');move('#information-panel','workspace-info');move('.note','workspace-info');
    move('.transit-panel','workspace-transit');move('.simulation-panel','workspace-manage');move('.save-panel','workspace-save');move('#help-panel','workspace-help');
    document.querySelector('.save-panel')!.append(element('new-city-panel'));
    const time=document.querySelector('.simulation-panel .time')!;time.id='playback';app.append(time);
    element<HTMLDetailsElement>('management-panel').open=true;
    const help=element('help-panel');help.hidden=false;help.insertAdjacentHTML('beforeend','<p>歩行者は近くの住宅・商業に対応する代表的な街路表現です。待ち客は月次の需要をもとに表示し、1人の表示が住民1人に対応するものではありません。遠景で非表示、近景で最大128人です。</p><p>建設のやり直し：Ctrl / ⌘ + Shift + Z、またはCtrl + Y。時間を進めると建設履歴を終了します。</p>');
    help.insertAdjacentHTML('beforebegin','<button id="tutorial-start" type="button">街づくりチュートリアルを開始・再表示</button><p>途中で閉じても、都市の状態はそのままです。</p>');
    element('workspace-menu').addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLElement>('[data-workspace]');if(button){const category=button.dataset.workspace as Category;this.open(this.category===category?null:category);}});
    element('workspace-close').onclick=()=>this.close(true);
    element('undo-build').onclick=()=>this.onUndo();element('redo-build').onclick=()=>this.onRedo();
    element('tutorial-start').onclick=()=>{this.tutorial=true;this.dismissed=false;this.close();this.invalidate();};
    element('guide-dismiss').onclick=()=>{this.dismissed=true;this.paintCollapsed();};
    element('guide-expand').onclick=()=>{this.dismissed=false;this.paintCollapsed();};
    element('guide-content').onclick=e=>{
      const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;
      if(button.dataset.guide==='skip'){this.tutorial=false;this.invalidate();return;}
      if(button.dataset.guide==='play'){this.onPlay();return;}
      if(button.dataset.guide==='undo'){this.onUndo();return;}
      if(button.dataset.guide==='action')this.onAction(JSON.parse(button.dataset.action!) as GuideAction);
    };
    element('finance-panel').addEventListener('toggle',()=>{if(element<HTMLDetailsElement>('finance-panel').open){this.financeViewed=true;this.invalidate();}});
    document.addEventListener('city-info-dismiss',()=>{if(this.category==='info')this.close(true);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.category){this.close(true);}});
    document.querySelector('nav[aria-label="建設ツール"]')!.addEventListener('click',()=>{if(this.category==='build')this.close();});
    element('workspace-drawer').addEventListener('click',e=>{if((e.target as HTMLElement).closest('[data-tool]'))this.close();});
  }
  open(category:Category|null){
    this.category=category;element('workspace-drawer').hidden=!category;element('workspace-drawer').scrollTop=0;
    document.body.dataset.workspace=category??'';
    document.querySelectorAll<HTMLElement>('[data-workspace-page]').forEach(page=>page.hidden=page.dataset.workspacePage!==category);
    document.querySelectorAll<HTMLElement>('[data-workspace]').forEach(button=>{const active=button.dataset.workspace===category;button.setAttribute('aria-expanded',String(active));button.classList.toggle('active',active);});
    element('workspace-title').textContent=category?titles[category]:'';element('updates-open').setAttribute('aria-expanded',String(category==='updates'));
    element<HTMLDetailsElement>('transit-panel').open=category==='transit';
    if(category==='manage'){element<HTMLDetailsElement>('management-panel').open=true;if(element<HTMLDetailsElement>('finance-panel').open){this.financeViewed=true;this.invalidate();}}
    this.onNavigate(category);
  }
  close(focus=false){const previous=this.category;this.open(null);if(focus&&previous){if(previous==='updates')element('updates-open').focus();else document.querySelector<HTMLElement>(`[data-workspace="${previous}"]`)?.focus();}}
  reveal(panel:string){
    this.open(panel.startsWith('bus-')?'transit':'manage');
    const target=document.getElementById(panel);if(!target)return;
    for(let parent:HTMLElement|null=target;parent&&parent.id!=='workspace-drawer';parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
    if(panel==='finance-panel'){this.financeViewed=true;this.invalidate();}
    target.scrollIntoView({block:'nearest'});
  }
  reset(city:City,fresh=false){
    this.owner=city;this.financeViewed=false;this.undoUsed=false;this.tutorial=fresh;this.dismissed=false;this.invalidate();
  }
  didUndo(city:City){this.owner=city;this.undoUsed=true;this.invalidate();}
  invalidate(){this.signature='';this.stamp=0;}
  refresh(city:City){
    if(city!==this.owner)this.reset(city);
    if(performance.now()-this.stamp<300)return;this.stamp=performance.now();
    element('scenery-status').textContent='公園は4マス、広場は3マスの範囲で住宅へ効果（道路接続が必要）。重複は最大値。現在の都市平均：満足度 +'+city.sceneryBonus.toFixed(1)+' / 住宅需要 +'+(city.sceneryBonus*1.5).toFixed(1)+'。';
    const steps=tutorialSteps(city,this.financeViewed,this.undoUsed),step=steps.find(s=>!s.done);
    const actions=nextActions(city),signature=JSON.stringify([this.tutorial,steps,actions]);
    if(signature===this.signature)return;this.signature=signature;
    element('guide-kind').textContent=this.tutorial?'街づくり '+steps.filter(s=>s.done).length+'/'+steps.length:'次にすること';
    const content=element('guide-content');content.replaceChildren();
    const text=(tag:string,value:string)=>{const el=document.createElement(tag);el.textContent=value;content.append(el);return el;};
    const button=(label:string,kind:string,action?:GuideAction)=>{const el=document.createElement('button');el.type='button';el.textContent=label;el.dataset.guide=kind;if(action)el.dataset.action=JSON.stringify(action);content.append(el);};
    if(this.tutorial){
      if(step){text('strong',step.title);text('p',step.description);
        if(step.tool||step.panel)button(step.panel?'関連パネルを開く':'ツールを選ぶ','action',{id:step.id,title:step.title,reason:'',action:'',tool:step.tool,panel:step.panel});
        else if(step.id==='undo')button('直前の操作を取り消す','undo');
        if(step.id==='growth')button('1×で時間を進める','play');
        if(steps.some(s=>s.done))text('small',steps.filter(s=>s.done).length+'項目を達成。操作は好きな順に試せます。');
      }else{text('strong','街づくりの基本を達成しました');text('p','ここからは街の需要や市民の要望を見ながら、自由に発展させましょう。');}
      button(step?'スキップして自由に遊ぶ':'自由に遊ぶ','skip');
    }else{
      const action=actions[0];text('strong',action.title);text('p',action.reason+' '+action.action);
      if(action.tool||action.panel||action.mode)button(action.panel?'関連パネルを開く':action.tool?'対処するツールを選ぶ':'関連する都市情報を見る','action',action);
      if(action.location)button('問題の区域へ移動','action',{...action,tool:undefined,mode:undefined,panel:undefined});
      if(actions.length>1){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='ほかの案内 '+(actions.length-1)+'件';details.append(summary);for(const extra of actions.slice(1)){const b=document.createElement('button');b.type='button';b.textContent=extra.title;b.dataset.guide='action';b.dataset.action=JSON.stringify(extra);details.append(b);}content.append(details);}
    }
    this.paintCollapsed();
  }
  private paintCollapsed(){element('guide-content').hidden=this.dismissed;element('guide-expand').hidden=!this.dismissed;element('guide-dismiss').hidden=this.dismissed;}
}
