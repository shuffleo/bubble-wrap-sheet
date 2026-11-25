import {GAME_CONFIG} from './game-config';
import {UPGRADE_COPY} from './game-copy';
import {GAME_FIXTURES,type HudFixture} from './game-fixtures';
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

function time(milliseconds:number):string {
 const seconds=Math.max(0,Math.ceil(milliseconds/1000));
 return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}

export function createGameUi(route:GameRoute,onFreePop:()=>void):GameUiHandle {
 let root:HTMLElement|null=null;
 const live=document.createElement('p');
 live.id='game-live';live.className='sr-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');

 function ensureRoot(){
  if(root)return root;
  root=document.createElement('div');root.id='game-root';root.dataset.screen='mode-select';
  document.body.dataset.gameMode='survival';
  document.body.append(root,live);
  return root;
 }

 function close(){
  root?.remove();live.remove();root=null;delete document.body.dataset.gameMode;onFreePop();
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

 function hudFixture():HudFixture {
  const base=GAME_FIXTURES.hud;
  if(route.hudState==='danger')return {...base,dangerZone:true};
  if(route.hudState==='soft-expired')return {...base,timerKind:'soft',timerRemainingMs:0,dangerZone:false,softTimerExpired:true};
  if(route.hudState==='paused')return {...base,dangerZone:false,paused:true};
  if(route.hudState==='hidden')return {...base,dangerZone:false,hidden:true};
  return {...base,dangerZone:false,timerRemainingMs:Math.round(base.timerTotalMs/2)};
 }

 function renderHud(){
  const fixture=hudFixture(),node=ensureRoot();node.dataset.screen='hud';
  node.innerHTML=`<section class="game-hud" aria-label="Survival Run status" data-danger="${fixture.dangerZone}" data-paused="${fixture.paused}" data-hidden="${fixture.hidden}">
   <div class="game-hud-primary">
    <div><span class="game-label">Level ${fixture.level}</span><strong>${fixture.levelName}</strong><small>Sheet ${fixture.sheet} / ${fixture.sheets}</small></div>
    <div class="game-hud-score"><span class="game-label">Score</span><strong>${score(fixture.score)}</strong><small>${fixture.combo} combo</small></div>
    <div class="game-hud-timer"><span class="game-label">${fixture.timerKind==='soft'?'Target':'Deadline'}</span><strong>${time(fixture.timerRemainingMs)}</strong><small>${fixture.softTimerExpired?'Par spent — keep popping':fixture.dangerZone?'Danger zone':'Active time'}</small></div>
   </div>
   <div class="game-hud-secondary">
    <span><b>${fixture.popsPerSecond.toFixed(1)}</b> pops/s</span><span><b>${fixture.velocityMultiplier.toFixed(1)}×</b> velocity</span><span><b>${fixture.deadlineMultiplier.toFixed(1)}×</b> deadline</span>
   </div>
   <div class="game-hud-build" aria-label="Current upgrades">${fixture.upgrades.map(id=>`<span>${UPGRADE_COPY[id].name}</span>`).join('')}</div>
   ${fixture.hazard?`<p class="game-hud-hazard"><span class="game-label">Hazard</span>${fixture.hazard}</p>`:''}
   ${fixture.paused?'<div class="game-state-banner">Paused</div>':''}
   ${fixture.hidden?'<button class="game-hud-reveal" type="button" data-game-action="reveal-hud">Show HUD</button>':''}
   <div class="game-hud-actions"><button type="button" data-game-action="mode">Modes</button></div>
  </section>`;
  node.querySelector<HTMLButtonElement>('[data-game-action=mode]')!.addEventListener('click',renderModeSelect);
  node.querySelector<HTMLButtonElement>('[data-game-action=reveal-hud]')?.addEventListener('click',()=>{route.hudState='normal';renderHud();});
  live.textContent=`Level ${fixture.level}, ${fixture.levelName}. ${time(fixture.timerRemainingMs)} remaining.`;
 }

 function showScreen(screen:GameScreen){
  if(screen==='level-intro'){renderLevelIntro();return;}
  if(screen==='hud'){renderHud();return;}
  renderModeSelect();
 }

 const handle:GameUiHandle={get root(){return root;},openModeSelect:renderModeSelect,showScreen,close};
 if(route.enabled)showScreen(route.screen);
 return handle;
}
