/** External video is opened only by the player; no iframe or YouTube request on boot. */
export const BEGINNER_VIDEO_URL='https://youtu.be/NI6JLgtEA1E';
const PREFERENCE='citygenesis.hideBeginnerVideo.v1';
export class BeginnerVideo {
 private welcome:HTMLElement;
 constructor(help:HTMLElement,notices:HTMLElement,pause:()=>void){
  const section=document.createElement('section');section.className='beginner-video';section.setAttribute('aria-label','初心者向け解説動画');
  section.innerHTML='<h3>はじめての街づくり</h3><p>道路・給排水・住宅・職場の準備から、入居と黒字化までを音声付きの動画で紹介します。</p><p class="beginner-video-note">ノーマル・河川なしのマップでの一例です。成長や収支は配置・難易度によって変わります。</p>';
  const link=()=>{const a=document.createElement('a');a.href=BEGINNER_VIDEO_URL;a.target='_blank';a.rel='noopener noreferrer';a.className='beginner-video-link';a.textContent='初心者向け解説を見る（YouTube・別タブ）';a.addEventListener('click',pause);a.addEventListener('auxclick',e=>{if(e.button===1)pause();});return a;};
  section.append(link());const note=document.createElement('p');note.className='beginner-video-note';note.textContent='開くとゲームを一時停止します。戻ったら速度ボタンで再開できます。';section.append(note);help.prepend(section);
  this.welcome=document.createElement('section');this.welcome.className='beginner-video';this.welcome.id='beginner-video-welcome';this.welcome.hidden=true;this.welcome.setAttribute('aria-label','最初の街づくりの案内');
  this.welcome.innerHTML='<h3>最初に何をすればいい？</h3><p>まずはこちらの動画で、小さな街を作る手順を確認できます。</p>';
  this.welcome.append(link());const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.id='beginner-video-hide';label.append(check,'次回から表示しない');this.welcome.append(label);
  check.onchange=()=>{try{if(check.checked)localStorage.setItem(PREFERENCE,'1');else localStorage.removeItem(PREFERENCE);}catch{/* Optional preference must not prevent play. */}};
  const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.onclick=()=>{this.welcome.hidden=true;};this.welcome.append(close);notices.prepend(this.welcome);
 }
 reset(fresh:boolean){let hidden=false;try{hidden=localStorage.getItem(PREFERENCE)==='1';}catch{}this.welcome.hidden=!fresh||hidden;}
}
