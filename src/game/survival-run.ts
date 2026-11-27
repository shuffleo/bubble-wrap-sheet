import type {BubbleEngine,SurfaceHandle} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG} from './game-config';
import {recordGameHighScore} from './game-high-scores';
import {applyAssistedPop,applyManualPop,beginLevelOne,clearLevelCombo,createLevelOne,noteSheetCleared,type LevelOneState} from './level-one';
import {formatGameCurrency} from './economy';
import {animatedNumber,updateAnimatedNumber} from './game-vendors';
import {bindVelocityPops,displayPopRate,mountVelocityChart,type VelocityChart} from './velocity-chart';
import type {GamePopDetail} from './bubble-game-adapter';
import {BubbleGameAdapter} from './bubble-game-adapter';
import {medalStripMarkup,roadmapMarkup,titleCase} from './dossier-ui';
import {readLevelRecords,recordLevelResult} from './level-records';
import {awardedMedal,formatDuration,nextMedal} from './level-presentation';

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
 let levelStartedAt=0;
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
  if(step.kind==='next-sheet'){applySheet(state);refreshGoal();engine.forceReset();return;}
  showCleared();
 };
 return {start,stop};

 function start(){
  stop();
  previousSize=engine.settings.bubbleSize;
  state=createLevelOne((Math.random()*0xffffffff)>>>0);
  applySheet(state);
  engine.freshSheet();
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
  const level=GAME_CONFIG.run.levels[0];
  const best=readLevelRecords()[1]?.bestTimeMs;
  const bubbles=engine.getStats().total*state.sheets;
  root!.innerHTML=`<div class="game-scrim"></div><section class="game-card game-intro-card game-dossier" aria-labelledby="level-one-heading"><p class="game-eyebrow">Level ${level.id} of ${GAME_CONFIG.run.levelCount}</p><h2 id="level-one-heading">${level.name}</h2><div class="game-brief-stats"><div><span>Best time</span><strong>${best===null||best===undefined?'—':formatDuration(best)}</strong></div><div><span>Sheets</span><strong>${state.sheets} × ${state.size}</strong></div><div><span>Bubbles</span><strong>${bubbles}</strong></div></div><p class="game-lede">Clear every bubble. Drag through adjacent bubbles for Clean Sweep, or hit highlighted Hot Keys.</p><h3 class="game-section-title">Medal targets · score at least</h3>${medalStripMarkup(1)}<div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button game-button-secondary" type="button" data-level-action="preview">Next 3 levels</button><button class="game-button" type="button" data-level-action="play">Start</button></div></section>`;
  root!.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root!.querySelector<HTMLButtonElement>('[data-level-action=preview]')!.addEventListener('click',showRoadmap);
  root!.querySelector<HTMLButtonElement>('[data-level-action=play]')!.addEventListener('click',play);
  root!.querySelector<HTMLButtonElement>('[data-level-action=play]')!.focus();
 }
 function showRoadmap(){
  if(!root)return;
  root.dataset.screen='level-intro';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-dossier" aria-labelledby="roadmap-heading"><p class="game-eyebrow">Plan your build</p><h2 id="roadmap-heading">Next 3 levels</h2><p class="game-lede">Preview the stakes and hazards before spending score on upgrades.</p>${roadmapMarkup(1)}<div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="back">Back</button><button class="game-button" type="button" data-level-action="play">Start level 1</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=back]')!.addEventListener('click',showIntro);
  root.querySelector<HTMLButtonElement>('[data-level-action=play]')!.addEventListener('click',play);
  root.querySelector<HTMLButtonElement>('[data-level-action=back]')!.focus();
 }
 function play(){
  if(!state)return;
  applySheet(state);
  engine.freshSheet();
  engine.setRefreshLocked(true);
  sheet.update({onAllPopped:onCleared});
  levelStartedAt=performance.now();
  state=beginLevelOne(state,engine.getKeyboardMap().map(group=>group.code));
  adapter=new BubbleGameAdapter(engine);
  adapter.addEventListener('gamepop',onPop);
  showHud();
 }
 function showHud(){
  if(!state||!root)return;
  root.dataset.screen='hud';
  root.innerHTML=`<section class="game-hud" aria-label="Level ${state.session.run.level}" data-danger="false" data-paused="false" data-hidden="false"><div class="game-hud-score"><span class="game-label">Score</span><strong data-live-score></strong><small data-live-combo hidden></small></div><div class="game-hud-velocity"><div class="game-velocity-readout"><strong data-live-rate></strong><span class="game-label">Pop / s</span></div><div class="game-velocity-chart" role="img" aria-label="Pop velocity over the last 30 seconds"></div></div><div class="game-hud-goal"><span class="game-label">Level ${state.session.run.level}</span><strong><span data-live-sheet></span><span class="game-goal-sep">/</span><span data-live-sheets></span></strong><small>sheets</small></div><p class="game-onboarding">Pop all ${state.sheets} sheets. From the third bubble in one drag, each pop scores more.</p></section>`;
  mountNumber(root.querySelector('[data-live-score]'),state.session.run.score,true);
  mountNumber(root.querySelector('[data-live-rate]'),0,false,0);
  const sheetSlot=root.querySelector<HTMLElement>('[data-live-sheet]');
  const totalSlot=root.querySelector<HTMLElement>('[data-live-sheets]');
  if(sheetSlot)sheetSlot.replaceWith(animatedNumber(state.sheet));
  if(totalSlot)totalSlot.replaceWith(animatedNumber(state.sheets));
  const host=root.querySelector<HTMLElement>('.game-velocity-chart');
  if(host){
   chart=mountVelocityChart(host,[0],{rateWindowMs:GAME_CONFIG.scoring.velocity.windowMs,running:true,onRate:rate=>updateAnimatedNumber(root?.querySelector('[data-live=rate]')??null,displayPopRate(rate))});
   unbindPops=bindVelocityPops(chart,engine);
  }
 }
 function showCleared(){
  if(!state||!root)return;
  chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};
  engine.setRefreshLocked(false);engine.setHotKeys(null);
  const scores=recordGameHighScore(state.category??'touch',state.session.run.score);
  const best=state.category==='keyboard-pointer'?scores.keyboardPointer:scores.touch;
  const timeMs=Math.max(0,performance.now()-levelStartedAt);
  const records=recordLevelResult(1,{timeMs,score:state.session.run.score});
  const medal=awardedMedal(1,state.session.run.score);
  const next=nextMedal(1,state.session.run.score);
  const rows=[
   ['Manual pops',state.breakdown.base],
   ['Clean Sweep bonus',state.breakdown.cleanSweep],
   ['Hot Key bonus',state.breakdown.hotKey],
   ['Assisted pops',state.breakdown.assisted]
  ] as const;
  root.dataset.screen='run-won';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="level-cleared-heading"><p class="game-eyebrow">Level 1 cleared</p><h2 id="level-cleared-heading">${medal?`${titleCase(medal)} medal`:'Clear complete'}</h2><div class="game-result-hero"><div><span>Clear time</span><strong>${formatDuration(timeMs)}</strong><small>Best ${formatDuration(records[1]?.bestTimeMs??timeMs)}</small></div><div><span>Final score</span><strong>${formatGameCurrency(state.session.run.score)}</strong><small>${state.category==='keyboard-pointer'?'Keyboard & Pointer':'Touch'}</small></div></div>${medalStripMarkup(1,medal)}<p class="game-medal-gap">${next?`${titleCase(next.name)} needs ${next.gap}.`:'Titanium secured — all medal targets cleared.'}</p><h3 class="game-section-title">Score calculation</h3><div class="game-score-calculation">${rows.map(([label,value],index)=>`<div style="--result-delay:${index*90}ms"><span>${label}</span><strong>+${formatGameCurrency(value)}</strong></div>`).join('')}<div class="game-score-total" style="--result-delay:${rows.length*90}ms"><span>Level total</span><strong>${formatGameCurrency(state.session.run.score)}</strong></div></div><p class="game-result-note">No upgrades were active in Orientation. Upgrade and boost contributions will appear as their own rows.</p><p class="game-lede">Category best: ${formatGameCurrency(best??0)}.</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button" type="button" data-level-action="retry">Retry</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')!.addEventListener('click',start);
 }
 function refreshScore(){if(state)updateAnimatedNumber(root?.querySelector('[data-live=score]')??null,state.session.run.score);}
 function refreshCombo(){const slot=root?.querySelector<HTMLElement>('[data-live-combo]');if(!slot||!state)return;const visible=state.combo.count>1;slot.hidden=!visible;slot.textContent=visible?`${state.combo.count} combo`:'';}
 function refreshGoal(){const slot=root?.querySelector('.game-hud-goal strong number-flow');if(state)updateAnimatedNumber(slot??null,state.sheet);}
 function applySheet(current:LevelOneState){
  const plan=current.plans[current.sheet-1];
  const sizeName=plan?.bubbleSize??current.size;
  const size=GAME_CONFIG.sizes[sizeName as keyof typeof GAME_CONFIG.sizes];
  if(engine.settings.bubbleSize!==size)engine.setSettings({bubbleSize:size});
 }
 function ensureRoot(){if(!root){root=document.createElement('div');root.id='game-root';document.body.append(root);}}
 function mountNumber(slot:Element|null,value:number,currency:boolean,maximumFractionDigits=2){if(!slot)return;const node=animatedNumber(value,{currency,maximumFractionDigits});node.dataset.live=currency?'score':'rate';slot.replaceWith(node);}
}
