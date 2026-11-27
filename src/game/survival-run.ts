import type {BubbleEngine,SurfaceHandle} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG,levelDefinition,type HazardId,type UpgradeId} from './game-config';
import {readGameHighScores,recordGameHighScore} from './game-high-scores';
import {applyAssistedPop,applyManualPop,beginLevel,clearLevelCombo,createLevelOne,createLevelState,noteSheetCleared,type LevelPlayState} from './level-one';
import {formatGameCurrency,formatGameNumber,rerollPrice,shopInterest} from './economy';
import {animatedNumber,updateAnimatedNumber} from './game-vendors';
import {bindVelocityPops,displayPopRate,mountVelocityChart,type VelocityChart} from './velocity-chart';
import type {GameHitDetail,GamePopDetail} from './bubble-game-adapter';
import {BubbleGameAdapter} from './bubble-game-adapter';
import {medalStripMarkup,roadmapMarkup,titleCase} from './dossier-ui';
import {readLevelRecords,recordLevelResult} from './level-records';
import {awardedMedal,formatDuration,nextMedal} from './level-presentation';
import {CalibrationCollector,calibratedDeadlineMs,resolveSecondWind,settleTimedLevel,softParMs,type CalibrationSummary,type TimeSettlement,withCalibration} from './timed-level';
import {reduceSession} from './game-reducer';
import type {LevelId} from './game-types';
import {saveCalibrationDiagnostics} from './calibration-diagnostics';
import {advanceGameClock,setClockHidden} from './game-clock';
import {HAZARD_COPY,UPGRADE_COPY} from './game-copy';
import {buyLiveShopUpgrade,createLiveShop,rerollLiveShop,skipLiveShop,upgradePrice,type LiveShopState} from './shops';
import {advanceRoughTable,resolveManualUpgradeProcs} from './upgrades';
import {deadlineScoreMultiplier} from './scoring';
import {advanceMemoryFoam,assignDoubleLayers,createMemoryFoamState,hazardDeadlineMultiplier,type MemoryFoamState} from './hazards';

export interface SurvivalRun {
 start():void;
 stop():void;
}

export function createSurvivalRun(engine:BubbleEngine,sheet:SurfaceHandle,onExit:()=>void):SurvivalRun {
 let state:LevelPlayState|null=null;
 let root:HTMLElement|null=null;
 let adapter:BubbleGameAdapter|null=null;
 let chart:VelocityChart|null=null;
 let unbindPops:()=>void=()=>{};
 let unbindUpgradePanel:()=>void=()=>{};
 let previousSize=engine.settings.bubbleSize;
 let levelElapsedMs=0;
 let levelClockStartMs=0;
 let timerTotalMs=0;
 let timerKind:'none'|'soft'|'hard'='none';
 let timerId=0;
 let lastTick=0;
 let bubbleWorkload=0;
 let calibrationCollector:CalibrationCollector|null=null;
 let calibrationSummary:CalibrationSummary|null=null;
 let timeSettlement:TimeSettlement|null=null;
 let lastBubbleProgressMs=0;
 let reminderBubbleIndex=-1;
 let reminderWaitingForSheet=false;
 let liveShop:LiveShopState|null=null;
 let roughTableElapsedMs=0;
 let roughTableLastTickMs=0;
 let memoryFoamState:MemoryFoamState=createMemoryFoamState();
 let hazardLastTickMs=0;
 let sheetClearedAtMs:number|null=null;
 const onVisibility=()=>{
  if(state)state={...state,session:{...state.session,clock:setClockHidden(state.session.clock,document.hidden)}};
  if(document.hidden&&state){
   state=clearLevelCombo(state);
   calibrationCollector?.endActivePeriod(levelElapsedMs);
   clearBubbleReminder();
  }
  lastTick=performance.now();
  refreshCombo();
 };
 const onHit=(event:Event)=>{
  const detail=(event as CustomEvent<GameHitDetail>).detail;
  const status=root?.querySelector<HTMLElement>('.game-hud-hazard');
  if(status&&detail.remainingLayers>0)status.innerHTML=`<span class="game-label">Hazard</span>Double Layer cracked · ${detail.remainingLayers} hit remaining`;
 };
 const onPop=(event:Event)=>{
  if(!state||state.cleared||state.session.run.phase!=='playing')return;
  advanceElapsedNow();
  if(timerKind==='hard'&&levelElapsedMs>=timerTotalMs&&!tryUseSecondWind()){showLoss();return;}
  const detail=(event as CustomEvent<GamePopDetail>).detail;
  lastBubbleProgressMs=levelElapsedMs;
  clearBubbleReminder();
  if(detail.source.type==='assisted'){
   const upgrade=detail.source.upgrade in UPGRADE_COPY?detail.source.upgrade as UpgradeId:undefined;
   const scoreKey=`${state.sheet}:${detail.key}`,firstScoredPop=!state.scoredBubbleKeys.has(scoreKey);
   const scored=applyAssistedPop(state,upgrade,firstScoredPop);
   state=scored.state;
   if(firstScoredPop)state.scoredBubbleKeys.add(scoreKey);
   refreshScore();
   refreshUpgradeValues();
   latchSheetCompletion();
   return;
  }
  if(detail.source.type!=='manual')return;
  const code=detail.source.input==='keyboard'?detail.source.gestureId.replace(/^key:/,''):null;
  const scoreKey=`${state.sheet}:${detail.key}`,firstScoredPop=!state.scoredBubbleKeys.has(scoreKey);
  const applied=applyManualPop(state,{
   now:levelElapsedMs,
   input:detail.source.input,
   gestureId:detail.source.gestureId,
   index:detail.index,
   neighbours:engine.getGameNeighbours(detail.index),
   keyCode:code,
   availableKeyCodes:engine.getKeyboardMap().filter(group=>group.remaining>0).map(group=>group.code),
   hardDeadline:timerKind==='hard'?{totalMs:timerTotalMs,elapsedMs:levelElapsedMs}:null,
   firstScoredPop
  });
  state=applied.state;
  if(firstScoredPop)state.scoredBubbleKeys.add(scoreKey);
  if(state.levelId===2)calibrationCollector?.recordManualPop(levelElapsedMs);
  refreshScore();
  refreshCombo();
  const prompt=root?.querySelector<HTMLElement>('.game-onboarding');
  if(!state.prompt)prompt?.remove();
  if(state.category==='keyboard-pointer')engine.setHotKeys(state.hotKeys);
  const resolvedProcs=resolveManualUpgradeProcs({
   owned:state.session.run.upgrades as UpgradeId[],
   neighbours:engine.getGameNeighbours(detail.index),
   bubbles:engine.getGameBubbles(),
   rng:state.rng,
   comboCount:state.combo.count,
   encounterManualPops:state.encounterManualPops,
   originIndex:detail.index
  });
  state={...state,rng:resolvedProcs.rng};
  refreshUpgradeValues();
  if(resolvedProcs.procs.length&&adapter)for(const proc of resolvedProcs.procs)adapter.pop(proc.index,{type:'assisted',upgrade:proc.upgrade});
  latchSheetCompletion();
 };
 const onCleared=()=>{
  if(!state||state.cleared)return;
  advanceElapsedNow();
  if(state.sheet===state.sheets&&sheetClearedAtMs!==null)levelElapsedMs=sheetClearedAtMs;
  expireComboIfNeeded();
  calibrationCollector?.endActivePeriod(levelElapsedMs);
  clearBubbleReminder();
  adapter?.warn(null);
  if(timerKind==='hard'&&levelElapsedMs>=timerTotalMs&&!tryUseSecondWind()){showLoss();return;}
  const step=noteSheetCleared(state);
  state=step.state;
  if(step.kind==='next-sheet'){sheetClearedAtMs=null;applySheet(state);refreshGoal();reminderWaitingForSheet=true;engine.forceReset();configureHazardSheet();return;}
  stopLevelTimer();
  if(state.levelId===2){
   const category=state.category??'touch';
   calibrationSummary=calibrationCollector?.summarize(category,levelElapsedMs)??null;
   if(calibrationSummary){
    state=withCalibration(state,calibrationSummary);
    saveCalibrationDiagnostics(calibrationSummary);
    window.dispatchEvent(new CustomEvent('bubble:calibration',{detail:calibrationSummary}));
   }
  }
  if(timerKind!=='none'){
   const settled=settleTimedLevel(state,timerTotalMs,levelElapsedMs);
   state=settled.state;
   timeSettlement=settled.settlement;
  }
  showCleared();
 };
 return {start,stop};

 function start(){
  stop();
  previousSize=engine.settings.bubbleSize;
  state=createLevelOne((Math.random()*0xffffffff)>>>0);
  liveShop=null;
  document.addEventListener('visibilitychange',onVisibility);
  prepareLevel();
  showIntro();
 }
 function stop(){
  stopLevelTimer();
  document.removeEventListener('visibilitychange',onVisibility);
  unbindPops();unbindPops=()=>{};
  unbindUpgradePanel();unbindUpgradePanel=()=>{};
  chart?.destroy();chart=null;
  adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);
  clearBubbleReminder();engine.setHazardWarning(null);
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
  const level=levelDefinition(state.levelId);
  const best=readLevelRecords()[state.levelId]?.bestTimeMs;
  const timerStat=timerKind==='none'?'':`<div><span>${timerKind==='soft'?'Time target':'Deadline'}</span><strong>${clockText(timerTotalMs)}</strong></div>`;
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
  const lede=state.levelId===1
   ?'Clear every bubble. Drag through adjacent bubbles for Clean Sweep, or hit highlighted Hot Keys.'
   :state.levelId===2
    ?'Set your pace across five sheets. The soft timer removes only the time bonus at zero—you can always finish.'
    :state.levelId===4&&hazardId
     ?`${HAZARD_COPY[hazardId].name}: ${HAZARD_COPY[hazardId].description} Clear all three sheets before the adjusted deadline.`
     :'Clear every sheet before your calibrated hard deadline. Timing out ends this run.';
  root!.innerHTML=`<div class="game-scrim"></div><section class="game-card game-intro-card game-dossier" aria-labelledby="level-heading"><p class="game-eyebrow">Level ${level.id} of ${GAME_CONFIG.run.levelCount}</p><h2 id="level-heading">${level.name}</h2><div class="game-brief-stats"><div><span>Best time</span><strong>${best===null||best===undefined?'—':formatDuration(best)}</strong></div><div><span>Sheets</span><strong>${state.sheets} × ${state.size}</strong></div><div><span>Bubbles</span><strong>${bubbleWorkload}</strong></div>${timerStat}</div><p class="game-lede">${lede}</p><h3 class="game-section-title">Medal targets · ${medalCaption(state.levelId)}</h3>${medalStripMarkup(state.levelId)}<div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button game-button-secondary" type="button" data-level-action="preview">Next levels</button><button class="game-button" type="button" data-level-action="play">Start</button></div></section>`;
  root!.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root!.querySelector<HTMLButtonElement>('[data-level-action=preview]')!.addEventListener('click',showRoadmap);
  root!.querySelector<HTMLButtonElement>('[data-level-action=play]')!.addEventListener('click',play);
  root!.querySelector<HTMLButtonElement>('[data-level-action=play]')!.focus();
 }
 function showRoadmap(){
  if(!root||!state)return;
  const current=state.levelId;
  root.dataset.screen='level-intro';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-dossier" aria-labelledby="roadmap-heading"><p class="game-eyebrow">Plan your build</p><h2 id="roadmap-heading">Upcoming levels</h2><p class="game-lede">Preview the stakes and hazards before spending score on upgrades.</p>${roadmapMarkup(current)}<div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="back">Back</button><button class="game-button" type="button" data-level-action="play">Start level ${current}</button></div></section>`;
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
  levelElapsedMs=0;
  levelClockStartMs=state.session.clock.gameTimeMs;
  lastBubbleProgressMs=0;
  sheetClearedAtMs=null;
  roughTableElapsedMs=0;
  roughTableLastTickMs=0;
  reminderWaitingForSheet=false;
  lastTick=performance.now();
  state=beginLevel(state,engine.getKeyboardMap().map(group=>group.code));
  adapter=new BubbleGameAdapter(engine);
  adapter.addEventListener('gamepop',onPop);
  adapter.addEventListener('gamehit',onHit);
  configureHazardSheet();
  showHud();
  startLevelTimer();
 }
 function showHud(){
  if(!state||!root)return;
  root.dataset.screen='hud';
  const timer=timerKind==='none'?'':`<div class="game-hud-timer" aria-label="${clockText(timerTotalMs)} remaining"><span class="game-label">${timerKind==='soft'?'Target':'Time left'}</span><strong><span data-live-minutes></span><span class="game-timer-colon">:</span><span data-live-seconds></span></strong></div>`;
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
  const prompt=state.levelId===1?`Pop all ${state.sheets} sheets. From the third bubble in one drag, each pop scores more.`:state.levelId===2?'The timer is a target, not a failure. Active manual-pop windows calibrate Level 3.':state.levelId===4&&hazardId?`${HAZARD_COPY[hazardId].name} is active. Clear every sheet before time reaches zero.`:'Hard deadline. Clear every sheet before time reaches zero.';
  const hazard=hazardId?`<p class="game-hud-hazard" role="status"><span class="game-label">Hazard</span>${HAZARD_COPY[hazardId].name} · ${HAZARD_COPY[hazardId].description}</p>`:'';
  const owned=state.session.run.upgrades.filter((id):id is UpgradeId=>id in UPGRADE_COPY);
  const build=owned.length?`<div class="game-hud-build"><button type="button" class="game-upgrade-panel" aria-expanded="false" aria-label="Owned upgrades"><span class="game-upgrade-icons">${owned.map(id=>{const copy=UPGRADE_COPY[id],value=upgradeValue(id);return `<span class="game-upgrade" data-upgrade="${id}" data-active="${Boolean(value)}"><span class="material-symbols-rounded" aria-hidden="true">${copy.icon}</span><b data-upgrade-value="${id}" ${value?'':'hidden'}>${value}</b></span>`;}).join('')}</span></button><div class="game-upgrade-popover" role="tooltip">${owned.map(id=>`<span class="game-upgrade-note"><strong>${UPGRADE_COPY[id].name}</strong><span>${UPGRADE_COPY[id].description}</span></span>`).join('')}</div></div>`:'';
  root.innerHTML=`<section class="game-hud" aria-label="Level ${state.session.run.level}" data-danger="false" data-soft-expired="false" data-paused="false" data-hidden="false"><div class="game-hud-score"><span class="game-label">Score</span><strong data-live-score></strong><small data-live-combo hidden></small></div><div class="game-hud-velocity"><div class="game-velocity-readout"><strong data-live-rate></strong><span class="game-label">Pop / s</span></div><div class="game-velocity-chart" role="img" aria-label="Pop velocity over the last 30 seconds"></div></div><div class="game-hud-goal"><span class="game-label">Level ${state.session.run.level}</span><strong><span data-live-sheet></span><span class="game-goal-sep">/</span><span data-live-sheets></span></strong><small>sheets</small></div>${timer}${build}${hazard}<p class="game-onboarding">${prompt}</p></section>`;
  mountNumber(root.querySelector('[data-live-score]'),state.session.run.score,true);
  mountNumber(root.querySelector('[data-live-rate]'),0,false,0);
  const sheetSlot=root.querySelector<HTMLElement>('[data-live-sheet]');
  const totalSlot=root.querySelector<HTMLElement>('[data-live-sheets]');
  if(sheetSlot)sheetSlot.replaceWith(animatedNumber(state.sheet));
  if(totalSlot)totalSlot.replaceWith(animatedNumber(state.sheets));
  if(timerKind!=='none'){
   const parts=timerParts(timerTotalMs);
   mountTimerNumber(root.querySelector('[data-live-minutes]'),parts.minutes);
   mountTimerNumber(root.querySelector('[data-live-seconds]'),parts.seconds);
  }
  const host=root.querySelector<HTMLElement>('.game-velocity-chart');
  if(host){
   chart=mountVelocityChart(host,[0],{rateWindowMs:GAME_CONFIG.scoring.velocity.windowMs,running:true,onRate:rate=>updateAnimatedNumber(root?.querySelector('[data-live=rate]')??null,displayPopRate(rate))});
   unbindPops=bindVelocityPops(chart,engine);
  }
  const buildNode=root.querySelector<HTMLElement>('.game-hud-build');
  const panel=buildNode?.querySelector<HTMLButtonElement>('.game-upgrade-panel');
  if(buildNode&&panel){
   const setOpen=(open:boolean)=>{buildNode.dataset.open=String(open);panel.setAttribute('aria-expanded',String(open));};
   const toggle=(event:Event)=>{event.stopPropagation();setOpen(buildNode.dataset.open!=='true');};
   const outside=(event:Event)=>{const target=event.target;if(buildNode.dataset.open==='true'&&target instanceof Node&&!buildNode.contains(target))setOpen(false);};
   panel.addEventListener('click',toggle);document.addEventListener('pointerdown',outside);
   unbindUpgradePanel=()=>{panel.removeEventListener('click',toggle);document.removeEventListener('pointerdown',outside);};
  }
 }
 function showCleared(){
  if(!state||!root)return;
  chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};
  unbindUpgradePanel();unbindUpgradePanel=()=>{};
  adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);clearBubbleReminder();engine.setHazardWarning(null);engine.setHotKeys(null);
  const scores=state.session.run.phase==='run-won'
   ?recordGameHighScore(state.category??'touch',state.session.run.score)
   :readGameHighScores();
  const best=state.category==='keyboard-pointer'?scores.keyboardPointer:scores.touch;
  const levelId=state.levelId;
  const level=levelDefinition(levelId);
  const levelScore=state.session.run.score-state.startScore;
  const records=recordLevelResult(levelId,{timeMs:levelElapsedMs,score:levelScore});
  const medalValue=level.medals.metric==='score'?levelScore:levelElapsedMs/1000;
  const medal=awardedMedal(levelId,medalValue);
  const next=nextMedal(levelId,medalValue);
  const owned=state.session.run.upgrades.filter((id):id is UpgradeId=>id in UPGRADE_COPY);
  const candidateRows:Array<readonly [string,number]>=[
   ['Manual pops',state.breakdown.base],
   ['Clean Sweep bonus',state.breakdown.cleanSweep],
   ['Hot Key bonus',state.breakdown.hotKey],
   ['Sure Hands bonus',state.breakdown.sureHands],
   ['Velocity Buff boost',state.breakdown.velocityBoost],
   ['Deadline Fighter boost',state.breakdown.deadlineBoost],
   ...Object.entries(state.breakdown.assistedByUpgrade).map(([id,value])=>[`${UPGRADE_COPY[id as UpgradeId].name} assists`,value??0] as const),
   ['Other assisted pops',state.breakdown.assisted-Object.values(state.breakdown.assistedByUpgrade).reduce((sum,value)=>sum+(value??0),0)],
   ['Remaining-time bonus',state.breakdown.remainingTime]
  ];
  const rows=candidateRows.filter(([label,value],index)=>value>0||index===0||(levelId===1&&index<3)||(timerKind!=='none'&&label==='Remaining-time bonus'));
  const calibrationNote=levelId===2&&calibrationSummary?`Calibrated pace: ${formatGameNumber(calibrationSummary.popsPerSecond)} pop/s from ${calibrationSummary.windows.length} active ${calibrationSummary.windows.length===1?'window':'windows'}.`:'';
  const timerNote=timeSettlement?`Time settlement: ${formatGameNumber(timeSettlement.multiplier)}×.`:'';
  const upgradeNote=owned.length?`Owned build: ${owned.map(id=>UPGRADE_COPY[id].name).join(', ')}.`:'No upgrades are active yet.';
  const nextAction=state.session.run.phase==='shop'
   ?`<button class="game-button" type="button" data-level-action="shop">Open shop</button>`
   :levelId<GAME_CONFIG.run.levelCount
    ?`<button class="game-button" type="button" data-level-action="continue">Continue</button>`
    :`<button class="game-button" type="button" data-level-action="retry">Retry run</button>`;
  root.dataset.screen='run-won';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="level-cleared-heading"><p class="game-eyebrow">Level ${levelId} cleared · ${level.name}</p><h2 id="level-cleared-heading">${medal?`${titleCase(medal)} medal`:'Clear complete'}</h2><div class="game-result-hero"><div><span>Clear time</span><strong>${formatDuration(levelElapsedMs)}</strong><small>Best ${formatDuration(records[levelId]?.bestTimeMs??levelElapsedMs)}</small></div><div><span>Level score</span><strong>${formatGameCurrency(levelScore)}</strong><small>Run balance ${formatGameCurrency(state.session.run.score)}</small></div></div>${medalStripMarkup(levelId,medal)}<p class="game-medal-gap">${next?`${titleCase(next.name)} needs ${next.gap}.`:'Titanium secured — all medal targets cleared.'}</p><h3 class="game-section-title">Score calculation</h3><div class="game-score-calculation">${rows.map(([label,value],index)=>`<div style="--result-delay:${index*90}ms"><span>${label}</span><strong>+${formatGameCurrency(value)}</strong></div>`).join('')}<div class="game-score-total" style="--result-delay:${rows.length*90}ms"><span>Level total</span><strong>${formatGameCurrency(levelScore)}</strong></div></div><p class="game-result-note">${upgradeNote} ${timerNote} ${calibrationNote}</p><p class="game-lede">Category best: ${formatGameCurrency(best??0)}.</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button>${nextAction}</div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')?.addEventListener('click',start);
  root.querySelector<HTMLButtonElement>('[data-level-action=continue]')?.addEventListener('click',advanceLevel);
  root.querySelector<HTMLButtonElement>('[data-level-action=shop]')?.addEventListener('click',showLiveShop);
 }
 function advanceLevel(){
  if(!state)return;
  const session={...state.session,rng:state.rng};
  if(session.run.phase!=='level-intro')return;
  state=createLevelState(session,session.run.level);
  prepareLevel();
  showIntro();
 }
 function showLiveShop(){
  if(!state||state.session.run.phase!=='shop')return;
  if(!liveShop)liveShop=createLiveShop({
   category:state.category??'touch',
   score:state.session.run.score,
   owned:state.session.run.upgrades as UpgradeId[],
   rng:state.rng
  });
  renderLiveShop();
 }
 function renderLiveShop(){
  if(!state||!root||!liveShop)return;
  const shop=liveShop;
  root.dataset.screen='shop';
  const rerollCost=rerollPrice(shop.category,shop.rerollsUsed,shop.owned);
  const rerollsLeft=Math.max(0,GAME_CONFIG.run.shopRerollLimit-shop.rerollsUsed);
  const interest=shopInterest(shop.score,shop.category,shop.owned);
  const interestRate=shop.owned.includes('rateHikeCycle')?GAME_CONFIG.upgrades.rateHikeCycle.interestRate:GAME_CONFIG.economy.shopInterestRate;
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-shop-card" aria-labelledby="live-shop-heading"><div class="game-screen-heading"><div><p class="game-eyebrow">After level ${state.levelId}</p><h2 id="live-shop-heading">Choose one edge</h2></div><div class="game-balance"><span>Available score</span><strong>${formatGameCurrency(shop.score)}</strong></div></div><p class="game-lede">Buy one upgrade, reroll both offers, or bank your score and earn interest.</p><div class="game-offers">${shop.offers.map(id=>{const copy=UPGRADE_COPY[id],price=upgradePrice(shop.category,id),affordable=shop.score>=price;return `<article class="game-offer" data-upgrade="${id}" data-affordable="${affordable}" data-owned="false"><div><span class="game-offer-icon material-symbols-rounded" aria-hidden="true">${copy.icon}</span><span class="game-offer-status">${affordable?'Affordable':`Need ${formatGameCurrency(price-shop.score)}`}</span><h3>${copy.name}</h3><p>${copy.description}</p></div><button type="button" data-shop-buy="${id}" ${affordable?'':'disabled'}>Buy <b>${formatGameCurrency(price)}</b></button></article>`;}).join('')}</div><div class="game-shop-actions"><div><button class="game-button game-button-secondary" type="button" data-shop-action="reroll" ${rerollsLeft===0||shop.score<rerollCost?'disabled':''}><span class="material-symbols-rounded" aria-hidden="true">refresh</span>Reroll · ${formatGameCurrency(rerollCost)}</button><small>${rerollsLeft} rerolls left</small></div><div><button class="game-button" type="button" data-shop-action="skip">Skip</button><small>Earn ${formatGameNumber(interestRate*100)}% interest · ${formatGameCurrency(interest)}</small></div></div><p class="game-result-note" role="status">Offers are seeded for this run. Buying closes the shop immediately.</p></section>`;
  for(const button of Array.from(root.querySelectorAll<HTMLButtonElement>('[data-shop-buy]')))button.addEventListener('click',()=>{
   if(!liveShop)return;
   const bought=buyLiveShopUpgrade(liveShop,button.dataset.shopBuy as UpgradeId);
   if(!bought.accepted)return;
   liveShop=bought.state;syncLiveShop();finishLiveShop();
  });
  root.querySelector<HTMLButtonElement>('[data-shop-action=reroll]')!.addEventListener('click',()=>{
   if(!liveShop)return;
   const rerolled=rerollLiveShop(liveShop);
   if(!rerolled.accepted)return;
   liveShop=rerolled.state;syncLiveShop();renderLiveShop();
  });
  root.querySelector<HTMLButtonElement>('[data-shop-action=skip]')!.addEventListener('click',()=>{
   if(!liveShop)return;
   liveShop=skipLiveShop(liveShop).state;syncLiveShop();finishLiveShop();
  });
 }
 function syncLiveShop(){
  if(!state||!liveShop)return;
  const run=state.session.run;
  const session={...state.session,rng:liveShop.rng,run:{...run,score:liveShop.score,upgrades:[...liveShop.owned],rerollUsed:liveShop.rerollsUsed>0}};
  state={...state,session,rng:liveShop.rng};
 }
 function finishLiveShop(){
  if(!state)return;
  if(state.levelId===4){liveShop=null;showCheckpointComplete();return;}
  const left=reduceSession(state.session,{type:'leave-shop'});
  if(!left.accepted)return;
  liveShop=null;
  state=createLevelState(left.state,left.state.run.level);
  prepareLevel();
  showIntro();
 }
 function showCheckpointComplete(){
  if(!state||!root)return;
  engine.setRefreshLocked(false);
  root.dataset.screen='run-won';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="checkpoint-heading"><p class="game-eyebrow">Level 4 checkpoint complete</p><h2 id="checkpoint-heading">Hazards survived</h2><div class="game-result-hero"><div><span>Run balance</span><strong>${formatGameCurrency(state.session.run.score)}</strong><small>After shop 3</small></div><div><span>Next build stage</span><strong>Level 5</strong><small>Conveyor miniboss</small></div></div><p class="game-lede">This test build stops here so the new upgrades and hazard pair can be checked before the conveyor is attached.</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button" type="button" data-level-action="retry">New run</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')!.addEventListener('click',start);
 }
 function prepareLevel(){
  if(!state)return;
  applySheet(state);
  engine.freshSheet();
  bubbleWorkload=engine.getStats().total*state.sheets;
  levelElapsedMs=0;
  roughTableElapsedMs=0;
  roughTableLastTickMs=0;
  memoryFoamState=createMemoryFoamState();
  hazardLastTickMs=0;
  calibrationSummary=null;
  timeSettlement=null;
  calibrationCollector=state.levelId===2?new CalibrationCollector():null;
  if(state.levelId===1){timerKind='none';timerTotalMs=0;return;}
  if(state.levelId===2){
   timerKind='soft';
   timerTotalMs=softParMs(state.category??'touch',bubbleWorkload,state.sheets);
   return;
  }
  timerKind='hard';
  const category=state.category??'touch';
  const categoryConfig=category==='touch'?GAME_CONFIG.categories.touch:GAME_CONFIG.categories.keyboardPointer;
  const calibration=state.session.run.calibration??{popsPerSecond:categoryConfig.calibrationMinPopsPerSecond,sampledWindowMs:0};
  timerTotalMs=calibratedDeadlineMs(
   bubbleWorkload,
   state.sheets,
   calibration,
   hazardDeadlineMultiplier(state.session.run.encounter?.hazardId as HazardId|null)
  );
 }
 function startLevelTimer(){
  stopLevelTimer();
  lastTick=performance.now();
  timerId=window.setInterval(tickLevelTimer,50);
 }
 function stopLevelTimer(){if(timerId){window.clearInterval(timerId);timerId=0;}}
 function tickLevelTimer(){
  if(!state||state.cleared||state.session.run.phase!=='playing')return;
  advanceElapsedNow();
  expireComboIfNeeded();
  tickRoughTable();
  tickHazard();
  const finalSheetSettling=sheetClearedAtMs!==null&&state.sheet===state.sheets;
  if(timerKind==='hard'&&levelElapsedMs>=timerTotalMs&&!finalSheetSettling&&!tryUseSecondWind()){showLoss();return;}
  refreshTimer();
  refreshBubbleReminder();
 }
 function advanceElapsedNow(){
  const now=performance.now();
  if(state){
   const clock=setClockHidden(state.session.clock,document.hidden);
   const advanced=advanceGameClock(clock,Math.max(0,now-lastTick));
   state={...state,session:{...state.session,clock:advanced}};
   levelElapsedMs=advanced.gameTimeMs-levelClockStartMs;
  }
  lastTick=now;
 }
 function refreshTimer(){
  if(!root||timerKind==='none')return;
  const remaining=Math.max(0,timerTotalMs-levelElapsedMs);
  const parts=timerParts(remaining);
  updateAnimatedNumber(root.querySelector('[data-live=minutes]'),parts.minutes);
  updateAnimatedNumber(root.querySelector('[data-live=seconds]'),parts.seconds);
  const hud=root.querySelector<HTMLElement>('.game-hud');
  if(!hud)return;
  const dangerMs=GAME_CONFIG.scoring.deadline.dangerZoneMaxSeconds*1000;
  hud.dataset.danger=String(timerKind==='hard'&&remaining<=dangerMs);
  hud.dataset.softExpired=String(timerKind==='soft'&&remaining<=0);
  root.querySelector<HTMLElement>('.game-hud-timer')?.setAttribute('aria-label',`${clockText(remaining)} remaining`);
  refreshUpgradeValues();
 }
 function clearBubbleReminder(){engine.setBubbleReminder(null);reminderBubbleIndex=-1;}
 function latchSheetCompletion(){
  if(sheetClearedAtMs!==null)return;
  const bubbles=engine.getGameBubbles().filter(bubble=>bubble.eligible);
  if(bubbles.length&&bubbles.every(bubble=>bubble.popped))sheetClearedAtMs=levelElapsedMs;
 }
 function tryUseSecondWind():boolean {
  if(!state)return false;
  const run=state.session.run;
  const resolved=resolveSecondWind({
   totalMs:timerTotalMs,
   elapsedMs:levelElapsedMs,
   owned:run.upgrades.includes('secondWind'),
   usesRemaining:run.secondWindUsesRemaining,
   hardTimer:timerKind==='hard'
  });
  if(!resolved.triggered)return false;
  timerTotalMs=resolved.totalMs;
  state={...state,session:{...state.session,run:{...run,secondWindUsesRemaining:resolved.usesRemaining}}};
  refreshUpgradeValues();
  return true;
 }
 function tickRoughTable(){
  if(!state||!adapter)return;
  const delta=Math.max(0,levelElapsedMs-roughTableLastTickMs);
  roughTableLastTickMs=levelElapsedMs;
  if(engine.refreshing||document.hidden)return;
  const resolution=advanceRoughTable({
   owned:state.session.run.upgrades as UpgradeId[],
   elapsedMs:roughTableElapsedMs,
   activeDeltaMs:delta,
   bubbles:engine.getGameBubbles(),
   rng:state.rng
  });
  roughTableElapsedMs=resolution.elapsedMs;
  state={...state,rng:resolution.rng};
  for(const proc of resolution.procs)adapter.pop(proc.index,{type:'assisted',upgrade:proc.upgrade});
  refreshUpgradeValues();
 }
 function configureHazardSheet(){
  if(!state||!adapter)return;
  memoryFoamState=createMemoryFoamState();
  hazardLastTickMs=levelElapsedMs;
  adapter.warn(null);
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
  if(hazardId!=='doubleLayer')return;
  const assignment=assignDoubleLayers(engine.getGameBubbles(),state.rng);
  state={...state,rng:assignment.rng};
  adapter.setLayers(assignment.indices,GAME_CONFIG.hazards.doubleLayer.layers);
 }
 function tickHazard(){
  if(!state||!adapter)return;
  const delta=Math.max(0,levelElapsedMs-hazardLastTickMs);
  hazardLastTickMs=levelElapsedMs;
  if(engine.refreshing||document.hidden||state.session.run.encounter?.hazardId!=='memoryFoam')return;
  const bubbles=engine.getGameBubbles();
  if(!bubbles.some(bubble=>bubble.eligible&&!bubble.popped)){
   adapter.warn(null);
   memoryFoamState=createMemoryFoamState();
   return;
  }
  const resolution=advanceMemoryFoam({state:memoryFoamState,activeDeltaMs:delta,bubbles,rng:state.rng});
  memoryFoamState=resolution.state;
  state={...state,rng:resolution.rng};
  const status=root?.querySelector<HTMLElement>('.game-hud-hazard');
  if(resolution.warnedIndex!==null){
   adapter.warn(resolution.warnedIndex);
   if(status)status.innerHTML='<span class="game-label">Hazard</span>Memory Foam · reinflation incoming';
  }
  if(resolution.reinflateIndex!==null&&adapter.reinflate(resolution.reinflateIndex)){
   if(status)status.innerHTML='<span class="game-label">Hazard</span>Memory Foam reinflated one bubble · repeat pops give no score';
  }
 }
 function refreshBubbleReminder(){
  if(!state||state.session.run.phase!=='playing'||document.hidden){clearBubbleReminder();return;}
  if(engine.refreshing){reminderWaitingForSheet=true;clearBubbleReminder();return;}
  if(reminderWaitingForSheet){reminderWaitingForSheet=false;lastBubbleProgressMs=levelElapsedMs;return;}
  const remaining=engine.getGameBubbles().filter(bubble=>bubble.eligible&&!bubble.popped);
  if(remaining.length<1||remaining.length>3||levelElapsedMs-lastBubbleProgressMs<3000){clearBubbleReminder();return;}
  if(remaining.some(bubble=>bubble.index===reminderBubbleIndex))return;
  reminderBubbleIndex=remaining[0].index;
  if(!engine.setBubbleReminder(reminderBubbleIndex))reminderBubbleIndex=-1;
 }
 function showLoss(){
  if(!state||!root)return;
  stopLevelTimer();
  calibrationCollector?.endActivePeriod(levelElapsedMs);
  const lost=reduceSession(state.session,{type:'declare-run-lost'});
  if(lost.accepted)state={...state,session:lost.state,cleared:true,combo:{count:0,expiresAt:0}};
  chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};
  unbindUpgradePanel();unbindUpgradePanel=()=>{};
  adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);clearBubbleReminder();engine.setHazardWarning(null);engine.setHotKeys(null);
  sheet.update({onAllPopped:()=>{}});
  root.dataset.screen='run-lost';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="run-lost-heading"><p class="game-eyebrow">Level ${state.levelId} · ${levelDefinition(state.levelId).name}</p><h2 id="run-lost-heading">Time’s up</h2><div class="game-result-hero"><div><span>Deadline</span><strong>${clockText(timerTotalMs)}</strong><small>Hard timer expired</small></div><div><span>Run score</span><strong>${formatGameCurrency(state.session.run.score)}</strong><small>${state.category==='keyboard-pointer'?'Keyboard & Pointer':'Touch'}</small></div></div><p class="game-lede">The run resets to Level 1. Your local records remain.</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button" type="button" data-level-action="retry">Retry run</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')!.addEventListener('click',start);
 }
 function refreshScore(){if(state)updateAnimatedNumber(root?.querySelector('[data-live=score]')??null,state.session.run.score);}
 function refreshCombo(){const slot=root?.querySelector<HTMLElement>('[data-live-combo]');if(!slot||!state)return;const visible=state.combo.count>1;slot.hidden=!visible;slot.textContent=visible?`${state.combo.count} combo`:'';}
 function expireComboIfNeeded(){
  if(!state||state.combo.expiresAt===0||levelElapsedMs<=state.combo.expiresAt)return;
  state=clearLevelCombo(state);
  refreshCombo();
  refreshUpgradeValues();
 }
 function refreshUpgradeValues(){
  if(!state||!root)return;
  for(const node of Array.from(root.querySelectorAll<HTMLElement>('[data-upgrade-value]'))){
   const id=node.dataset.upgradeValue as UpgradeId;
   const value=upgradeValue(id);
   node.hidden=!value;
   node.textContent=value;
   node.parentElement?.setAttribute('data-active',String(Boolean(value)));
  }
 }
 function upgradeValue(id:UpgradeId):string {
  if(!state)return '';
  if(id==='fatFinger')return `+${GAME_CONFIG.upgrades.fatFinger.neighbourCount}`;
  if(id==='knuckleCrack')return `${state.combo.count%GAME_CONFIG.upgrades.knuckleCrack.manualComboInterval}/${GAME_CONFIG.upgrades.knuckleCrack.manualComboInterval}`;
  if(id==='staticDischarge')return `${state.encounterManualPops%GAME_CONFIG.upgrades.staticDischarge.manualPopInterval}/${GAME_CONFIG.upgrades.staticDischarge.manualPopInterval}`;
  if(id==='roughTable')return `${Math.ceil((GAME_CONFIG.upgrades.roughTable.intervalMs-roughTableElapsedMs)/1000)}s`;
  if(id==='velocityBuff')return state.currentVelocityMultiplier>1?`${formatGameNumber(state.currentVelocityMultiplier)}×`:'';
  if(id==='deadlineFighter'&&timerKind==='hard'){
   const multiplier=deadlineScoreMultiplier(timerTotalMs,Math.max(0,timerTotalMs-levelElapsedMs),state.combo.expiresAt!==0&&levelElapsedMs<=state.combo.expiresAt);
   return multiplier>1?`${formatGameNumber(multiplier)}×`:'';
  }
  if(id==='secondWind')return state.session.run.secondWindUsesRemaining>0?`${state.session.run.secondWindUsesRemaining}×`:'used';
  return '';
 }
 function refreshGoal(){const slot=root?.querySelector('.game-hud-goal strong number-flow');if(state)updateAnimatedNumber(slot??null,state.sheet);}
 function applySheet(current:LevelPlayState){
  const plan=current.plans[current.sheet-1];
  const sizeName=plan?.bubbleSize??current.size;
  const size=GAME_CONFIG.sizes[sizeName as keyof typeof GAME_CONFIG.sizes];
  if(engine.settings.bubbleSize!==size)engine.setSettings({bubbleSize:size});
 }
 function ensureRoot(){if(!root){root=document.createElement('div');root.id='game-root';document.body.append(root);}}
 function mountNumber(slot:Element|null,value:number,currency:boolean,maximumFractionDigits=2){if(!slot)return;const node=animatedNumber(value,{currency,maximumFractionDigits});node.dataset.live=currency?'score':'rate';slot.replaceWith(node);}
 function mountTimerNumber(slot:Element|null,value:number){if(!slot)return;const node=animatedNumber(value,{maximumFractionDigits:0,minimumIntegerDigits:2});node.dataset.live=slot.hasAttribute('data-live-minutes')?'minutes':'seconds';slot.replaceWith(node);}
 function timerParts(milliseconds:number){const seconds=Math.max(0,Math.ceil(milliseconds/1000));return {minutes:Math.floor(seconds/60),seconds:seconds%60};}
 function clockText(milliseconds:number){const parts=timerParts(milliseconds);return `${parts.minutes}:${String(parts.seconds).padStart(2,'0')}`;}
 function medalCaption(levelId:LevelId){const metric=levelDefinition(levelId).medals.metric;return metric==='timeSeconds'?'clear in':metric==='clearancePercent'?'pop at least':'score at least';}
}
