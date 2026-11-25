import {GAME_CONFIG} from './game-config';
import {readGameHighScores} from './game-high-scores';
import type {GameRoute,GameScreen} from './game-route';

export interface GameUiHandle {
 readonly root:HTMLElement|null;
 openModeSelect():void;
 showScreen(screen:GameScreen):void;
 close():void;
}

function noIndex(){
 const meta=document.querySelector<HTMLMetaElement>('meta[name=robots]');
 if(meta)meta.content='noindex,follow';
}

function score(value:number|null):string {
 return value===null?'—':value.toLocaleString();
}

export function createGameUi(route:GameRoute,onFreePop:()=>void):GameUiHandle {
 let root:HTMLElement|null=null;
 const live=document.createElement('p');
 live.id='game-live';live.className='sr-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');

 function ensureRoot(){
  if(root)return root;
  root=document.createElement('div');root.id='game-root';root.dataset.screen='mode-select';
  document.body.append(root,live);
  return root;
 }

 function close(){
  root?.remove();live.remove();root=null;onFreePop();
 }

 function renderModeSelect(){
  noIndex();
  const scores=readGameHighScores();
  const node=ensureRoot();node.dataset.screen='mode-select';
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-mode-card" aria-labelledby="game-mode-heading">
   <p class="game-eyebrow">Bubble Wrap</p>
   <h2 id="game-mode-heading">Choose how to pop</h2>
   <p class="game-lede">Keep it meditative, or turn five sheets into a survival run.</p>
   <div class="game-mode-options">
    <button class="game-mode-option" type="button" data-game-action="free"><strong>Free Pop</strong><span>The original endless sheet, with all material controls.</span></button>
    <button class="game-mode-option game-mode-option-primary" type="button" data-game-action="survival"><strong>Survival Run</strong><span>Five levels, tactical upgrades, hazards, and a conveyor finale.</span></button>
   </div>
   <div class="game-high-scores" aria-label="Local high scores"><span>Touch best <strong>${score(scores.touch)}</strong></span><span>Keyboard &amp; Pointer best <strong>${score(scores.keyboardPointer)}</strong></span></div>
  </section>`;
  node.querySelector<HTMLButtonElement>('[data-game-action=free]')!.addEventListener('click',close);
  node.querySelector<HTMLButtonElement>('[data-game-action=survival]')!.addEventListener('click',()=>renderLevelIntro());
  live.textContent='Game mode selection opened.';
  node.querySelector<HTMLButtonElement>('[data-game-action=survival]')!.focus();
 }

 function renderLevelIntro(){
  const level=GAME_CONFIG.run.levels[0],node=ensureRoot();node.dataset.screen='level-intro';
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-intro-card" aria-labelledby="game-intro-heading">
   <p class="game-eyebrow">Level ${level.id} of ${GAME_CONFIG.run.levelCount}</p>
   <h2 id="game-intro-heading">${level.name}</h2>
   <p class="game-lede">Clear ${level.sheetCount} M-size sheets. No timer, no shop, no upgrades—learn the rhythm.</p>
   <div class="game-inline-actions"><button class="game-button game-button-secondary" type="button" data-game-action="back">Back</button><button class="game-button" type="button" data-game-action="continue">Continue</button></div>
  </section>`;
  node.querySelector<HTMLButtonElement>('[data-game-action=back]')!.addEventListener('click',renderModeSelect);
  node.querySelector<HTMLButtonElement>('[data-game-action=continue]')!.addEventListener('click',()=>showScreen('hud'));
  live.textContent=`Level ${level.id}: ${level.name}.`;
  node.querySelector<HTMLButtonElement>('[data-game-action=continue]')!.focus();
 }

 function showScreen(screen:GameScreen){
  if(screen==='level-intro'){renderLevelIntro();return;}
  renderModeSelect();
 }

 const handle:GameUiHandle={get root(){return root;},openModeSelect:renderModeSelect,showScreen,close};
 if(route.enabled)showScreen(route.screen);
 return handle;
}
