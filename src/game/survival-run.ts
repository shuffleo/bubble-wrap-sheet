import type {BubbleEngine,SurfaceHandle} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG} from './game-config';
import {recordGameHighScore} from './game-high-scores';
import {applyAssistedPop,applyManualPop,beginLevelOne,clearLevelCombo,createLevelOne,noteSheetCleared,type LevelOneState} from './level-one';
import {formatGameCurrency} from './economy';
import {animatedNumber,updateAnimatedNumber} from './game-vendors';
import {bindVelocityPops,mountVelocityChart,type VelocityChart} from './velocity-chart';
import type {GamePopDetail} from './bubble-game-adapter';
import {BubbleGameAdapter} from './bubble-game-adapter';

export interface SurvivalRun {
 start():void;
 stop():void;
}

export function createSurvivalRun(engine:BubbleEngine,sheet:SurfaceHandle,onExit:()=>void):SurvivalRun {
 let state:LevelOneState|null=null;
 let root:HTMLElement|null=null;
 let adapter:BubbleGameAdapter|null=null;
 let chart:VelocityChart|null=null;
 let unbindPops:()=>void=()=>{};
 let previousSize=engine.settings.bubbleSize;
 const onVisibility=()=>{if(document.hidden&&state)state=clearLevelCombo(state);refreshCombo();};
 const onPop=(event:Event)=>{
  if(!state||state.cleared||state.session.run.phase!=='playing')return;
  const detail=(event as CustomEvent<GamePopDetail>).detail;
  if(detail.source.type==='assisted'){const scored=applyAssistedPop(state);state=scored.state;refreshScore();return;}
  if(detail.source.type!=='manual')return;
  const code=detail.source.input==='keyboard'?detail.source.gestureId.replace(/^key:/,''):null;
  const applied=applyManualPop(state,{
   now:performance.now(),
   input:detail.source.input,
   gestureId:detail.source.gestureId,
   index:detail.index,
   neighbours:engine.getGameNeighbours(detail.index),
   keyCode:code,
   availableKeyCodes:engine.getKeyboardMap().filter(group=>group.remaining>0).map(group=>group.code)
  });
  state=applied.state;
  refreshScore();
  refreshCombo();
  const prompt=root?.querySelector<HTMLElement>('.game-onboarding');
  if(!state.prompt)prompt?.remove();
  if(state.category==='keyboard-pointer')engine.setHotKeys(state.hotKeys);
 };
 const onCleared=()=>{
  if(!state||state.cleared)return;
  const step=noteSheetCleared(state);
  state=step.state;
  if(step.kind==='next-sheet'){refreshGoal();engine.forceReset();return;}
  const category=state.category??'touch';
  recordGameHighScore(category,state.session.run.score);
  showCleared();
 };
 return {start,stop};

 function start(){
  stop();
  previousSize=engine.settings.bubbleSize;
  state=createLevelOne((Math.random()*0xffffffff)>>>0);
  document.addEventListener('visibilitychange',onVisibility);
  showIntro();
 }
 function stop(){
  document.removeEventListener('visibilitychange',onVisibility);
  unbindPops();unbindPops=()=>{};
  chart?.destroy();chart=null;
  adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);
  engine.setHotKeys(null);
  if(engine.settings.bubbleSize!==previousSize)engine.setSettings({bubbleSize:previousSize});
  sheet.update({onAllPopped:()=>{}});
  root?.remove();root=null;state=null;
  delete document.body.dataset.gameMode;
 }
 function showIntro(){
  if(!state)return;
  ensureRoot();
  document.body.dataset.gameMode='survival';
  root!.dataset.screen='level-intro';
  root!.innerHTML=`<div class="game-scrim"></div><section class="game-card game-intro-card" aria-labelledby="level-one-heading"><p class="game-eyebrow">Level 1 of ${GAME_CONFIG.run.levelCount}</p><h2 id="level-one-heading">Orientation</h2><p class="game-lede">Clear ${state.sheets} ${state.size}-size sheets. No timer, no shop, no upgrades. A drag scores more from the third bubble, and the keyboard can light Hot Keys.</p><div class="game-inline-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Free Pop</button><button class="game-button" type="button" data-level-action="play">Play</button></div></section>`;
  root!.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root!.querySelector<HTMLButtonElement>('[data-level-action=play]')!.addEventListener('click',play);
  root!.querySelector<HTMLButtonElement>('[data-level-action=play]')!.focus();
 }
 function play(){
  if(!state)return;
  const size=GAME_CONFIG.sizes[state.size as keyof typeof GAME_CONFIG.sizes];
  engine.setSettings({bubbleSize:size});
  engine.setRefreshLocked(true);
  sheet.update({onAllPopped:onCleared});
  state=beginLevelOne(state,engine.getKeyboardMap().map(group=>group.code));
  adapter=new BubbleGameAdapter(engine);
  adapter.addEventListener('gamepop',onPop);
  showHud();
 }
 function showHud(){
  if(!state||!root)return;
  root.dataset.screen='hud';
  root.innerHTML=`<section class="game-hud" aria-label="Level 1" data-danger="false" data-paused="false" data-hidden="false"><div class="game-hud-score"><span class="game-label">Score</span><strong data-live-score></strong><small data-live-combo hidden></small></div><div class="game-hud-velocity"><div class="game-velocity-readout"><strong data-live-rate></strong><span class="game-label">Pop / s</span></div><div class="game-velocity-chart" role="img" aria-label="Pop velocity over the last 30 seconds"></div></div><div class="game-hud-goal"><span class="game-label">Level 1</span><strong><span data-live-sheet></span><span class="game-goal-sep">/</span><span data-live-sheets></span></strong><small>sheets</small></div><p class="game-onboarding">Pop both sheets. From the third bubble in one drag, each pop scores more.</p></section>`;
  mountNumber(root.querySelector('[data-live-score]'),state.session.run.score,true);
  mountNumber(root.querySelector('[data-live-rate]'),0,false);
  const sheetSlot=root.querySelector<HTMLElement>('[data-live-sheet]');
  const totalSlot=root.querySelector<HTMLElement>('[data-live-sheets]');
  if(sheetSlot)sheetSlot.replaceWith(animatedNumber(state.sheet));
  if(totalSlot)totalSlot.replaceWith(animatedNumber(state.sheets));
  const host=root.querySelector<HTMLElement>('.game-velocity-chart');
  if(host){
   chart=mountVelocityChart(host,[0],{rateWindowMs:GAME_CONFIG.scoring.velocity.windowMs,running:true});
   unbindPops=bindVelocityPops(chart,engine);
  }
 }
 function showCleared(){
  if(!state||!root)return;
  chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};
  engine.setRefreshLocked(false);engine.setHotKeys(null);
  const scores=recordGameHighScore(state.category??'touch',state.session.run.score);
  const best=state.category==='keyboard-pointer'?scores.keyboardPointer:scores.touch;
  root.dataset.screen='run-won';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card" aria-labelledby="level-cleared-heading"><p class="game-eyebrow">Level 1 cleared</p><h2 id="level-cleared-heading">Two sheets down</h2><div class="game-result-score"><span>Score</span><strong>${formatGameCurrency(state.session.run.score)}</strong><small>${state.category==='keyboard-pointer'?'Keyboard & Pointer':'Touch'}</small></div><p class="game-lede">Best in this category: ${formatGameCurrency(best??0)}. Level 2 waits until the timer slice.</p><div class="game-inline-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Free Pop</button><button class="game-button" type="button" data-level-action="retry">Retry</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')!.addEventListener('click',start);
 }
 function refreshScore(){if(state)updateAnimatedNumber(root?.querySelector('[data-live=score]')??null,state.session.run.score);}
 function refreshCombo(){const slot=root?.querySelector<HTMLElement>('[data-live-combo]');if(!slot||!state)return;const visible=state.combo.count>1;slot.hidden=!visible;slot.textContent=visible?`${state.combo.count} combo`:'';}
 function refreshGoal(){const slot=root?.querySelector('.game-hud-goal strong number-flow');if(state)updateAnimatedNumber(slot??null,state.sheet);}
 function ensureRoot(){if(!root){root=document.createElement('div');root.id='game-root';document.body.append(root);}}
 function mountNumber(slot:Element|null,value:number,currency:boolean){if(!slot)return;const node=animatedNumber(value,{currency});node.dataset.live=currency?'score':'rate';slot.replaceWith(node);}
}
