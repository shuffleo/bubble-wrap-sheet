import type {BubbleEngine,SurfaceHandle} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG,levelDefinition,type HazardId,type UpgradeId} from './game-config';
import {readGameHighScores,recordGameHighScore} from './game-high-scores';
import {applyAssistedPop,applyManualPop,beginLevel,clearLevelCombo,createLevelOne,createLevelState,noteSheetCleared,type LevelPlayState} from './level-one';
import {formatGameCurrency,formatGameNumber,rerollPrice,roundGameValue,shopInterest} from './economy';
import {animatedNumber,updateAnimatedNumber} from './game-vendors';
import {bindVelocityPops,displayPopRate,mountVelocityChart,type VelocityChart} from './velocity-chart';
import type {GameHitDetail,GamePopDetail} from './bubble-game-adapter';
import type {ConveyorMissDetail} from '../components/bubble-ui/core/bubble-engine';
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
import {deadlineScoreMultiplier,manualPopRate} from './scoring';
import {nextClusterArm,type ClusterArm} from './cluster-bomb';
import {classifySheetPattern} from './sheet-pattern';
import {advanceMemoryFoam,assignDoubleLayers,assignHardenedBubbles,createDrunkenBobState,createMemoryFoamState,hazardDeadlineMultiplier,resolveDrunkenBobInput,type DrunkenBobState,type MemoryFoamState} from './hazards';
import {advanceConveyor,conveyorClearance,createConveyorState,recordConveyorMiss,recordConveyorPop,type ConveyorState} from './conveyor';
import {createTuningDrawer} from './tuning/tuning-drawer';

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
 let timerKind:'none'|'soft'|'hard'|'conveyor'='none';
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
 let drunkenBobState:DrunkenBobState=createDrunkenBobState();
 let hazardLastTickMs=0;
 let sheetClearedAtMs:number|null=null;
 let conveyorState:ConveyorState=createConveyorState();
 let conveyorLastTickMs=0;
 let retainedHazardId:HazardId|null=null;
 let clusterTier=0;
 let clusterArm:ClusterArm|null=null;
 let clusterBurst=false;
 let sheetPatternPoints:{x:number;y:number}[]=[];
 let sheetManualPoints=0;
 let sheetBubbleCount=0;
 let levelVelocityRates:number[]=[];
 let patternLabels:string[]=[];
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
 const onConveyorMiss=(event:Event)=>{
  if(!state||state.levelId!==5||state.cleared)return;
  const detail=(event as CustomEvent<ConveyorMissDetail>).detail;
  const resolved=recordConveyorMiss(conveyorState,state.session.run.upgrades as UpgradeId[]);
  conveyorState=resolved.state;
  const run=state.session.run,penalty=Math.min(run.score,GAME_CONFIG.conveyor.missScorePenalty);
  state={...state,session:{...state.session,run:{...run,score:run.score-penalty,stats:{...run.stats,misses:run.stats.misses+1,insuredMisses:run.stats.insuredMisses+(resolved.insured?1:0)}}},breakdown:{...state.breakdown,penalty:state.breakdown.penalty+penalty}};
  const status=root?.querySelector<HTMLElement>('.game-hud-hazard');
  if(status)status.innerHTML=`<span class="game-label">${resolved.insured?'Insured miss':'Miss'}</span>${resolved.insured?'Counts toward clearance · ':''}-${formatGameCurrency(GAME_CONFIG.conveyor.missScorePenalty)} · ${detail.key}`;
  refreshScore();refreshConveyorGoal();
 };
 const onPop=(event:Event)=>{
  if(!state||state.cleared||state.session.run.phase!=='playing')return;
  advanceElapsedNow();
  if(timerKind==='hard'&&levelElapsedMs>=timerTotalMs&&!tryUseSecondWind()){showLoss();return;}
  const detail=(event as CustomEvent<GamePopDetail>).detail;
  const bubble=engine.getGameBubbles().find(item=>item.index===detail.index);
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
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
   if(state.levelId===5)noteConveyorPop();
   else latchSheetCompletion();
   if(!clusterBurst)syncClusterBomb();
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
   firstScoredPop,
   skillEligible:!bubble?.hardened&&hazardId!=='drunkenBob',
   baseScore:bubble?.hardened?GAME_CONFIG.scoring.hardenedBase:GAME_CONFIG.scoring.normalBase
  });
  state=applied.state;
  if(firstScoredPop)state.scoredBubbleKeys.add(scoreKey);
  if(state.levelId===2)calibrationCollector?.recordManualPop(levelElapsedMs);
  refreshScore();
  refreshCombo();
  const prompt=root?.querySelector<HTMLElement>('.game-onboarding');
  if(!state.prompt)prompt?.remove();
  if(detail.source.input==='keyboard')releaseCluster(code);
  recordSheetPath(bubble?.x,bubble?.y,applied.notice.points);
  levelVelocityRates.push(manualPopRate(state.manualPopTimes));
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
  if(state.levelId===5)noteConveyorPop();
  else latchSheetCompletion();
  if(!clusterBurst)syncClusterBomb();
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
  awardSheetPattern();
  const step=noteSheetCleared(state);
  state=step.state;
  if(step.kind==='next-sheet'){sheetClearedAtMs=null;applySheet(state);refreshGoal();reminderWaitingForSheet=true;resetSheetTracking();engine.forceReset();configureHazardSheet();sheetBubbleCount=engine.getStats().total;applyKeyLabels();return;}
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
  engine.setSavedKeyLabelsSuspended(true);
  previousSize=engine.settings.bubbleSize;
  state=createLevelOne((Math.random()*0xffffffff)>>>0);
  liveShop=null;
  retainedHazardId=null;
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
  adapter?.endConveyor(false);adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);
  clearBubbleReminder();engine.setHazardWarning(null);
  engine.setHotKeys(null);
  engine.setForcedKeyLabels(null);
  engine.setHighlightedKey(null);
  engine.setSavedKeyLabelsSuspended(false);
  if(engine.settings.bubbleSize!==previousSize)engine.setSettings({bubbleSize:previousSize});
  sheet.update({onAllPopped:()=>{}});
  root?.remove();root=null;state=null;
  delete document.body.dataset.gameMode;
 }
 function showIntro(){
  if(!state)return;
  chart?.destroy();chart=null;
  ensureRoot();
  document.body.dataset.gameMode='survival';
  engine.setSavedKeyLabelsSuspended(true);
  root!.dataset.screen='level-intro';
  const level=levelDefinition(state.levelId);
  const best=readLevelRecords()[state.levelId]?.bestTimeMs;
  const timerStat=timerKind==='none'?'':`<div><span>${timerKind==='soft'?'Time target':timerKind==='conveyor'?'Duration':'Deadline'}</span><strong>${clockText(timerTotalMs)}</strong></div>`;
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
  const lede=state.levelId===1
   ?'Clear every bubble. Drag through adjacent bubbles for Clean Sweep. Key labels stay hidden unless an upgrade reveals them.'
   :state.levelId===2
    ?'Set your pace across five sheets. The soft timer removes only the time bonus at zero—you can always finish.'
    :state.levelId===4&&hazardId
     ?`${HAZARD_COPY[hazardId].name}: ${HAZARD_COPY[hazardId].description} Clear all three sheets before the adjusted deadline.`
     :state.levelId===5
      ?`One full sheet slides left to right and speeds up twice. Its left edge stays hidden until the roll ends. Pop at least ${formatGameNumber(GAME_CONFIG.conveyor.clearanceTarget*100)}%; each escape costs ${formatGameCurrency(GAME_CONFIG.conveyor.missScorePenalty)}.`
     :'Clear every sheet before your calibrated hard deadline. Timing out ends this run.';
  const encounterStat=state.levelId===5?`<div><span>Encounter</span><strong>Moving ${state.size} belt</strong></div>`:`<div><span>Sheets</span><strong>${state.sheets} × ${state.size}</strong></div>`;
  root!.innerHTML=`<div class="game-scrim"></div><section class="game-card game-intro-card game-dossier" aria-labelledby="level-heading"><p class="game-eyebrow">Level ${level.id} of ${GAME_CONFIG.run.levelCount}</p><h2 id="level-heading">${level.name}</h2><div class="game-brief-stats"><div><span>Best time</span><strong>${best===null||best===undefined?'—':formatDuration(best)}</strong></div>${encounterStat}<div><span>Bubbles</span><strong>${bubbleWorkload}</strong></div>${timerStat}</div><p class="game-lede">${lede}</p><h3 class="game-section-title">Medal targets · ${medalCaption(state.levelId)}</h3>${medalStripMarkup(state.levelId)}<div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button game-button-secondary" type="button" data-level-action="preview">Next levels</button><button class="game-button" type="button" data-level-action="play">Start</button></div></section>`;
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
  if(state.levelId===5){playConveyor();return;}
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
  resetSheetTracking();
  sheetBubbleCount=engine.getStats().total;
  lastTick=performance.now();
  state=beginLevel(state,engine.getKeyboardMap().map(group=>group.code));
  adapter=new BubbleGameAdapter(engine);
  adapter.addEventListener('gamepop',onPop);
  adapter.addEventListener('gamehit',onHit);
  configureHazardSheet();
  applyKeyLabels();
  showHud();
  startLevelTimer();
 }
 function playConveyor(){
  if(!state)return;
  applySheet(state);engine.freshSheet();engine.setRefreshLocked(true);
  sheet.update({onAllPopped:()=>{}});
  levelElapsedMs=0;levelClockStartMs=state.session.clock.gameTimeMs;lastBubbleProgressMs=0;sheetClearedAtMs=null;roughTableElapsedMs=0;roughTableLastTickMs=0;conveyorLastTickMs=0;lastTick=performance.now();
  conveyorState=createConveyorState();
  state=beginLevel(state,[]);
  adapter=new BubbleGameAdapter(engine);
  adapter.addEventListener('gamepop',onPop);
  adapter.addEventListener('gamehit',onHit);
  adapter.addEventListener('conveyormiss',onConveyorMiss);
  adapter.startConveyor(GAME_CONFIG.conveyor.baseTravelMs);
  conveyorState={...conveyorState,totalSpawned:adapter.conveyorIntroduced()};
  applyKeyLabels();
  showHud();startLevelTimer();
 }
 function hudOverflowMarkup(){
  return `<details class="game-overflow"><summary class="game-icon-button" aria-label="More game options"><span class="material-symbols-rounded" aria-hidden="true">more_horiz</span></summary><div class="game-overflow-menu"><button type="button" data-game-action="refresh"><span class="material-symbols-rounded" aria-hidden="true">refresh</span>Refresh sheet</button><button type="button" data-game-action="mute" aria-pressed="true"><span class="material-symbols-rounded" aria-hidden="true">volume_up</span><span data-mute-label>Mute</span></button><button type="button" data-game-action="tuning"><span class="material-symbols-rounded" aria-hidden="true">tune</span>Tuning panel</button><button type="button" class="game-overflow-playtest" data-game-action="retry-level"><span class="material-symbols-rounded" aria-hidden="true">replay</span>Retry level</button><button type="button" class="game-overflow-playtest" data-game-action="win"><span class="material-symbols-rounded" aria-hidden="true">emoji_events</span>Mark level won</button></div></details>`;
 }
 function bindHudMenu(){
  if(!root)return;
  const menu=root.querySelector<HTMLDetailsElement>('.game-overflow');
  const sync=()=>{
   const mute=root?.querySelector<HTMLButtonElement>('[data-game-action=mute]');
   const refresh=root?.querySelector<HTMLButtonElement>('[data-game-action=refresh]');
   const sound=document.getElementById('sound');
   if(refresh)refresh.disabled=engine.refreshing;
   if(mute&&sound){
    const muted=sound.dataset.muted==='true';
    const label=mute.querySelector<HTMLElement>('[data-mute-label]');
    const icon=mute.querySelector<HTMLElement>('.material-symbols-rounded');
    if(label)label.textContent=muted?'Unmute':'Mute';
    if(icon)icon.textContent=muted?'volume_off':'volume_up';
    mute.setAttribute('aria-pressed',String(!muted));
   }
  };
  menu?.addEventListener('toggle',sync);
  sync();
  root.querySelector<HTMLButtonElement>('[data-game-action=refresh]')?.addEventListener('click',()=>{refreshCurrentSheet();if(menu)menu.open=false;});
  root.querySelector<HTMLButtonElement>('[data-game-action=mute]')?.addEventListener('click',()=>{document.getElementById('sound')?.click();sync();if(menu)menu.open=false;});
  root.querySelector<HTMLButtonElement>('[data-game-action=tuning]')?.addEventListener('click',()=>{if(menu)menu.open=false;if(!document.getElementById('tuning-drawer'))createTuningDrawer();});
  root.querySelector<HTMLButtonElement>('[data-game-action=retry-level]')?.addEventListener('click',retryCurrentLevel);
  root.querySelector<HTMLButtonElement>('[data-game-action=win]')?.addEventListener('click',markLevelWon);
 }
 function showHud(){
  if(!state||!root)return;
  unbindUpgradePanel();unbindUpgradePanel=()=>{};
  chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};
  root.dataset.screen='hud';
  const timer=timerKind==='none'?'':`<div class="game-hud-timer" aria-label="${clockText(timerTotalMs)} remaining"><span class="game-label">${timerKind==='soft'?'Target':'Time left'}</span><strong><span data-live-minutes></span><span class="game-timer-colon">:</span><span data-live-seconds></span></strong></div>`;
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
  const prompt=state.levelId===1?`Pop all ${state.sheets} sheets. From the third bubble in one drag, each pop scores more.`:state.levelId===2?'The timer is a target, not a failure. Active manual-pop windows calibrate Level 3.':state.levelId===4&&hazardId?`${HAZARD_COPY[hazardId].name} is active. Clear every sheet before time reaches zero.`:state.levelId===5?`Pop at least ${formatGameNumber(GAME_CONFIG.conveyor.clearanceTarget*100)}%. Escaped bubbles cost ${formatGameCurrency(GAME_CONFIG.conveyor.missScorePenalty)}.`:'Hard deadline. Clear every sheet before time reaches zero.';
  const hazard=hazardId?`<p class="game-hud-hazard" role="status"><span class="game-label">Hazard</span>${HAZARD_COPY[hazardId].name} · ${HAZARD_COPY[hazardId].description}</p>`:state.levelId===5?'<p class="game-hud-hazard" role="status"><span class="game-label">Conveyor</span>Speed stage 1 · no misses</p>':'';
  const owned=state.session.run.upgrades.filter((id):id is UpgradeId=>id in UPGRADE_COPY);
  const build=owned.length?`<div class="game-hud-build"><button type="button" class="game-upgrade-panel" aria-expanded="false" aria-label="Owned upgrades"><span class="game-upgrade-icons">${owned.map(id=>{const copy=UPGRADE_COPY[id],value=upgradeValue(id);return `<span class="game-upgrade" data-upgrade="${id}" data-active="${Boolean(value)}"><span class="material-symbols-rounded" aria-hidden="true">${copy.icon}</span><b data-upgrade-value="${id}" ${value?'':'hidden'}>${value}</b></span>`;}).join('')}</span></button><div class="game-upgrade-popover" role="tooltip">${owned.map(id=>`<span class="game-upgrade-note"><strong>${UPGRADE_COPY[id].name}</strong><span>${UPGRADE_COPY[id].description}</span></span>`).join('')}</div></div>`:'';
  root.innerHTML=`<section class="game-hud" aria-label="Level ${state.session.run.level}" data-danger="false" data-soft-expired="false" data-paused="false" data-hidden="false"><div class="game-hud-score"><span class="game-label">Score</span><strong data-live-score></strong><small data-live-combo hidden></small></div><div class="game-hud-velocity"><div class="game-velocity-readout"><strong data-live-rate></strong><span class="game-label">Pop / s</span></div><div class="game-velocity-chart" role="img" aria-label="Pop velocity over the last 30 seconds"></div></div><div class="game-hud-goal"><span class="game-label">Level ${state.session.run.level}</span><strong><span data-live-sheet></span><span class="game-goal-sep">/</span><span data-live-sheets></span></strong><small>${state.levelId===5?'bubbles popped':'sheets'}</small></div>${timer}${build}${hazard}<p class="game-onboarding">${prompt}</p>${hudOverflowMarkup()}</section>`;
  mountNumber(root.querySelector('[data-live-score]'),state.session.run.score,true);
  mountNumber(root.querySelector('[data-live-rate]'),0,false,0);
  const sheetSlot=root.querySelector<HTMLElement>('[data-live-sheet]');
  const totalSlot=root.querySelector<HTMLElement>('[data-live-sheets]');
  if(sheetSlot)sheetSlot.replaceWith(animatedNumber(state.levelId===5?conveyorState.popped:state.sheet));
  if(totalSlot)totalSlot.replaceWith(animatedNumber(state.levelId===5?conveyorState.totalSpawned:state.sheets));
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
  bindHudMenu();
 }
 function showCleared(recordResult=true){
  if(!state||!root)return;
  chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};
  unbindUpgradePanel();unbindUpgradePanel=()=>{};
  adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);clearBubbleReminder();engine.setHazardWarning(null);engine.setHotKeys(null);
  const scores=recordResult&&state.session.run.phase==='run-won'
   ?recordGameHighScore(state.category??'touch',state.session.run.score)
   :readGameHighScores();
  const best=state.category==='keyboard-pointer'?scores.keyboardPointer:scores.touch;
  const levelId=state.levelId;
  const level=levelDefinition(levelId);
  const levelScore=state.session.run.score-state.startScore;
  state={...state,session:{...state.session,run:{...state.session.run,levelScores:{...state.session.run.levelScores,[levelId]:levelScore}}}};
  const records=recordResult?recordLevelResult(levelId,{timeMs:levelElapsedMs,score:levelScore}):readLevelRecords();
  const medalValue=level.medals.metric==='score'?levelScore:levelElapsedMs/1000;
  const medal=recordResult?awardedMedal(levelId,medalValue):null;
  const next=recordResult?nextMedal(levelId,medalValue):null;
  const savedBest=records[levelId]?.bestTimeMs;
  const bestText=savedBest===null||savedBest===undefined?'—':formatDuration(savedBest);
  const heading=recordResult?(medal?`${titleCase(medal)} medal`:'Clear complete'):'Playtest clear';
  const gapText=recordResult?(next?`${titleCase(next.name)} needs ${next.gap}.`:'Titanium secured — all medal targets cleared.'):'Playtest skip does not award a medal.';
  const recordNote=recordResult?'':' Playtest skip. Local records were not updated.';
  const owned=state.session.run.upgrades.filter((id):id is UpgradeId=>id in UPGRADE_COPY);
  const candidateRows:Array<readonly [string,number]>=[
   ['Manual pops',state.breakdown.base],
   ['Clean Sweep bonus',state.breakdown.cleanSweep],
   ['Sure Hands bonus',state.breakdown.sureHands],
   ['Velocity Buff boost',state.breakdown.velocityBoost],
   ['Deadline Fighter boost',state.breakdown.deadlineBoost],
   ...Object.entries(state.breakdown.assistedByUpgrade).map(([id,value])=>[`${UPGRADE_COPY[id as UpgradeId].name} assists`,value??0] as const),
   ['Other assisted pops',state.breakdown.assisted-Object.values(state.breakdown.assistedByUpgrade).reduce((sum,value)=>sum+(value??0),0)],
   ['Remaining-time bonus',state.breakdown.remainingTime],
   ['Sheet pattern',state.breakdown.pattern]
  ];
  const rows=candidateRows.filter(([label,value],index)=>value>0||index===0||(levelId===1&&index<2)||(timerKind!=='none'&&label==='Remaining-time bonus'));
  const patternNote=patternLabels.length?`Patterns: ${[...new Set(patternLabels)].join(', ')}.`:'';
  const calibrationNote=levelId===2&&calibrationSummary?`Calibrated pace: ${formatGameNumber(calibrationSummary.popsPerSecond)} pop/s from ${calibrationSummary.windows.length} active ${calibrationSummary.windows.length===1?'window':'windows'}.`:'';
  const timerNote=timeSettlement?`Time settlement: ${formatGameNumber(timeSettlement.multiplier)}×.`:'';
  const upgradeNote=owned.length?`Owned build: ${owned.map(id=>UPGRADE_COPY[id].name).join(', ')}.`:'No upgrades are active yet.';
  const nextAction=state.session.run.phase==='shop'
   ?`<button class="game-button" type="button" data-level-action="shop">Open shop</button>`
   :levelId<GAME_CONFIG.run.levelCount
    ?`<button class="game-button" type="button" data-level-action="continue">Continue</button>`
    :`<button class="game-button" type="button" data-level-action="retry">Retry run</button>`;
  root.dataset.screen='run-won';
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="level-cleared-heading"><p class="game-eyebrow">Level ${levelId} cleared · ${level.name}</p><h2 id="level-cleared-heading">${heading}</h2><div class="game-result-hero"><div><span>Clear time</span><strong>${formatDuration(levelElapsedMs)}</strong><small>Best ${bestText}</small></div><div><span>Level score</span><strong>${formatGameCurrency(levelScore)}</strong><small>Run balance ${formatGameCurrency(state.session.run.score)}</small></div></div>${medalStripMarkup(levelId,medal)}<p class="game-medal-gap">${gapText}</p><h3 class="game-section-title">Score calculation</h3><div class="game-score-calculation">${rows.map(([label,value],index)=>`<div style="--result-delay:${index*90}ms"><span>${label}</span><strong>+${formatGameCurrency(value)}</strong></div>`).join('')}<div class="game-score-total" style="--result-delay:${rows.length*90}ms"><span>Level total</span><strong>${formatGameCurrency(levelScore)}</strong></div></div>${velocityDecoration()}<p class="game-result-note">${upgradeNote} ${timerNote} ${patternNote} ${calibrationNote}${recordNote}</p><p class="game-lede">Category best: ${formatGameCurrency(best??0)}.</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button>${nextAction}</div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')?.addEventListener('click',start);
  root.querySelector<HTMLButtonElement>('[data-level-action=continue]')?.addEventListener('click',advanceLevel);
  root.querySelector<HTMLButtonElement>('[data-level-action=shop]')?.addEventListener('click',showLiveShop);
  mountResultVelocity();
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
   liveShop=rerolled.state;syncLiveShop(1);renderLiveShop();
  });
  root.querySelector<HTMLButtonElement>('[data-shop-action=skip]')!.addEventListener('click',()=>{
   if(!liveShop)return;
   liveShop=skipLiveShop(liveShop).state;syncLiveShop();finishLiveShop();
  });
 }
 function syncLiveShop(rerollsAdded=0){
  if(!state||!liveShop)return;
  const run=state.session.run;
  const session={...state.session,rng:liveShop.rng,run:{...run,score:liveShop.score,upgrades:[...liveShop.owned],rerollUsed:liveShop.rerollsUsed>0,stats:{...run.stats,rerolls:run.stats.rerolls+rerollsAdded}}};
  state={...state,session,rng:liveShop.rng};
 }
 function finishLiveShop(){
  if(!state)return;
  const left=reduceSession(state.session,{type:'leave-shop'});
  if(!left.accepted)return;
  liveShop=null;
  state=createLevelState(left.state,left.state.run.level);
  prepareLevel();
  showIntro();
 }
 function prepareLevel(){
  if(!state)return;
  levelVelocityRates=[];
  patternLabels=[];
  const activeHazard=state.session.run.encounter?.hazardId as HazardId|null;
  if(activeHazard)retainedHazardId=activeHazard;
  applySheet(state);
  engine.freshSheet();
  bubbleWorkload=engine.getStats().total*state.sheets;
  levelElapsedMs=0;
  roughTableElapsedMs=0;
  roughTableLastTickMs=0;
  memoryFoamState=createMemoryFoamState();
  drunkenBobState=createDrunkenBobState();
  hazardLastTickMs=0;
  calibrationSummary=null;
  timeSettlement=null;
  calibrationCollector=state.levelId===2?new CalibrationCollector():null;
  if(state.levelId===5){
   timerKind='conveyor';
   timerTotalMs=GAME_CONFIG.conveyor.durationMs;
   const pitch=GAME_CONFIG.sizes.M+6,feedMs=GAME_CONFIG.conveyor.durationMs-GAME_CONFIG.conveyor.cleanupWindowMs;
   const averageSpeed=GAME_CONFIG.conveyor.speedStages.reduce((sum,stage)=>sum+stage.multiplier,0)/GAME_CONFIG.conveyor.speedStages.length;
   const columnsOnScreen=Math.max(1,Math.ceil(innerWidth/pitch));
   const rows=Math.max(1,Math.round(engine.getStats().total/columnsOnScreen));
   bubbleWorkload=rows*(columnsOnScreen+Math.ceil((innerWidth+GAME_CONFIG.sizes.M)/GAME_CONFIG.conveyor.baseTravelMs*averageSpeed*feedMs/pitch));
   conveyorState=createConveyorState();
   return;
  }
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
  )+levelDefinition(state.levelId).deadlineBonusSeconds*1000;
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
  if(state.levelId===5){tickConveyor();if(state.cleared)return;}
  const held=adapter?.holdState().active??false;
  if(held&&state.combo.expiresAt!==0)state={...state,combo:{...state.combo,expiresAt:state.combo.expiresAt+Math.max(0,levelElapsedMs-hazardLastTickMs)}};
  expireComboIfNeeded();
  tickRoughTable();
  tickHazard();
  const finalSheetSettling=sheetClearedAtMs!==null&&state.sheet===state.sheets;
  if(timerKind==='hard'&&levelElapsedMs>=timerTotalMs&&!finalSheetSettling&&!tryUseSecondWind()){showLoss();return;}
  refreshTimer();
  refreshBubbleReminder();
 }
 function noteConveyorPop(){
  if(!adapter)return;
  conveyorState={...conveyorState,totalSpawned:Math.max(conveyorState.totalSpawned,adapter.conveyorIntroduced())};
  conveyorState=recordConveyorPop(conveyorState);
  refreshConveyorGoal();
 }
 function tickConveyor(){
  if(!state||!adapter)return;
  const delta=Math.max(0,levelElapsedMs-conveyorLastTickMs);conveyorLastTickMs=levelElapsedMs;
  const advanced=advanceConveyor({state:conveyorState,activeDeltaMs:delta,rng:state.rng});
  conveyorState={...advanced.state,totalSpawned:adapter.conveyorIntroduced()};state={...state,rng:advanced.rng};
  adapter.setConveyorSpeed(advanced.speedMultiplier);
  adapter.setConveyorFeeding(levelElapsedMs<GAME_CONFIG.conveyor.durationMs-GAME_CONFIG.conveyor.cleanupWindowMs);
  const status=root?.querySelector<HTMLElement>('.game-hud-hazard');
  const stage=GAME_CONFIG.conveyor.speedStages.reduce((current,item,index)=>levelElapsedMs>=item.atMs?index+1:current,1);
  if(status)status.innerHTML=`<span class="game-label">Conveyor</span>Speed stage ${stage} · ${conveyorState.missed} missed`;
  refreshConveyorGoal();
  if(conveyorState.finished)finishConveyor();
 }
 function finishConveyor(){
  if(!state||!adapter||state.cleared)return;
  adapter.endConveyor(true);
  const clearance=conveyorClearance(conveyorState),won=clearance>=GAME_CONFIG.conveyor.clearanceTarget;
  const outcome=reduceSession(state.session,{type:won?'complete-level':'declare-run-lost'});
  if(outcome.accepted)state={...state,session:outcome.state,cleared:true,combo:{count:0,expiresAt:0}};
  showConveyorResult(won,clearance);
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
   rng:state.rng,
   layout:state.levelId===5?'conveyor':'static'
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
  adapter.setTargetResolver(null);
  const hazardId=state.session.run.encounter?.hazardId as HazardId|null;
  if(hazardId==='doubleLayer'){
   const assignment=assignDoubleLayers(engine.getGameBubbles(),state.rng);
   state={...state,rng:assignment.rng};
   adapter.setLayers(assignment.indices,GAME_CONFIG.hazards.doubleLayer.layers);
  }else if(hazardId==='hardenedBubbles'){
   const assignment=assignHardenedBubbles(engine.getGameBubbles(),state.rng);
   state={...state,rng:assignment.rng};
   adapter.setHolds(assignment.indices,GAME_CONFIG.hazards.hardenedBubbles.holdMs,GAME_CONFIG.hazards.hardenedBubbles.releaseDecayMs);
  }else if(hazardId==='drunkenBob'){
   adapter.setTargetResolver((_sourceIndex,_source,bubbles)=>{
    if(!state)return -1;
    const resolution=resolveDrunkenBobInput({state:drunkenBobState,bubbles,rng:state.rng});
    drunkenBobState=resolution.state;
    state={...state,rng:resolution.rng};
    const status=root?.querySelector<HTMLElement>('.game-hud-hazard');
    if(status)status.innerHTML=resolution.madeProgress
     ?`<span class="game-label">Hazard</span>Drunken Bob · ${resolution.pity?'pity target':'target scrambled'}`
     :`<span class="game-label">Hazard</span>Drunken Bob lurched into an empty cell · ${resolution.state.failedRolls}/${GAME_CONFIG.hazards.drunkenBob.maximumFailedRolls}`;
    return resolution.targetIndex??-1;
   });
  }
 }
 function tickHazard(){
  if(!state||!adapter)return;
  const delta=Math.max(0,levelElapsedMs-hazardLastTickMs);
  hazardLastTickMs=levelElapsedMs;
  if(engine.refreshing||document.hidden)return;
  if(state.session.run.encounter?.hazardId==='hardenedBubbles'){
   const hold=adapter.holdState(),status=root?.querySelector<HTMLElement>('.game-hud-hazard');
   if(status&&hold.active){
    const progress=Math.max(...hold.indices.map(index=>hold.progress[index]??0),0);
    status.innerHTML=`<span class="game-label">Hazard</span>Hardened Bubbles · hold ${Math.round(progress/Math.max(1,hold.requiredMs)*100)}%`;
   }
   return;
  }
  if(state.session.run.encounter?.hazardId!=='memoryFoam')return;
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
  if(!state||state.levelId===5||state.session.run.phase!=='playing'||document.hidden){clearBubbleReminder();return;}
  if(engine.refreshing){reminderWaitingForSheet=true;clearBubbleReminder();return;}
  if(reminderWaitingForSheet){reminderWaitingForSheet=false;lastBubbleProgressMs=levelElapsedMs;return;}
  const remaining=engine.getGameBubbles().filter(bubble=>bubble.eligible&&!bubble.popped);
  if(remaining.length<1||remaining.length>3||levelElapsedMs-lastBubbleProgressMs<3000){clearBubbleReminder();return;}
  if(remaining.some(bubble=>bubble.index===reminderBubbleIndex))return;
  reminderBubbleIndex=remaining[0].index;
  if(!engine.setBubbleReminder(reminderBubbleIndex))reminderBubbleIndex=-1;
 }
 function showConveyorResult(won:boolean,clearance:number,recordResult=true){
  if(!state||!root)return;
  stopLevelTimer();chart?.destroy();chart=null;unbindPops();unbindPops=()=>{};unbindUpgradePanel();unbindUpgradePanel=()=>{};
  adapter?.dispose();adapter=null;engine.setRefreshLocked(false);clearBubbleReminder();engine.setHotKeys(null);
  const levelScore=state.session.run.score-state.startScore;
  state={...state,session:{...state.session,run:{...state.session.run,levelScores:{...state.session.run.levelScores,5:levelScore}}}};
  if(won&&recordResult){
   recordGameHighScore(state.category??'touch',state.session.run.score);
   recordLevelResult(5,{timeMs:GAME_CONFIG.conveyor.durationMs,score:levelScore});
  }
  const medal=won&&recordResult?awardedMedal(5,clearance*100):null;
  const owned=state.session.run.upgrades.filter((id):id is UpgradeId=>id in UPGRADE_COPY);
  const manualScore=state.breakdown.base+state.breakdown.cleanSweep+state.breakdown.hotKey+state.breakdown.sureHands+state.breakdown.velocityBoost+state.breakdown.deadlineBoost;
  const bestLevel=Object.entries(state.session.run.levelScores).sort((a,b)=>(b[1]??0)-(a[1]??0))[0];
  root.dataset.screen=won?'run-won':'run-lost';
  const outcomeNote=won?(recordResult?'The completed score is now eligible for the local category high score.':'Playtest skip. Local records were not updated.'):'Only a completed run records a category high score.';
  const retryLevel=won?'':`<button class="game-button game-button-secondary" type="button" data-level-action="retry-level">Retry level</button>`;
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="conveyor-result-heading"><p class="game-eyebrow">Level 5 · Conveyor miniboss</p><h2 id="conveyor-result-heading">${won?(recordResult?'Survival Run complete':'Playtest clear'):'Conveyor breach'}</h2><div class="game-result-hero"><div><span>Clearance</span><strong>${formatGameNumber(clearance*100)}%</strong><small>Target ${formatGameNumber(GAME_CONFIG.conveyor.clearanceTarget*100)}%</small></div><div><span>Final score</span><strong>${formatGameCurrency(state.session.run.score)}</strong><small>${state.category==='keyboard-pointer'?'Keyboard & Pointer':'Touch'}</small></div></div>${medalStripMarkup(5,medal)}<h3 class="game-section-title">Run statistics</h3><div class="game-score-calculation"><div><span>Best-scoring level</span><strong>${bestLevel?`Level ${bestLevel[0]} · ${formatGameCurrency(bestLevel[1]??0)}`:'—'}</strong></div><div><span>Total bubbles popped</span><strong>${state.session.run.stats.totalBubbles}</strong></div><div><span>Manual / assisted</span><strong>${state.session.run.stats.manualPops} / ${state.session.run.stats.assistedPops}</strong></div><div><span>Highest combo</span><strong>${state.session.run.stats.highestCombo}</strong></div><div><span>Rerolls</span><strong>${state.session.run.stats.rerolls}</strong></div><div><span>Conveyor spawned</span><strong>${conveyorState.totalSpawned}</strong></div><div><span>Missed / insured</span><strong>${conveyorState.missed} / ${conveyorState.insuredMisses}</strong></div><div><span>Manual score</span><strong>+${formatGameCurrency(manualScore)}</strong></div><div><span>Assisted score</span><strong>+${formatGameCurrency(state.breakdown.assisted)}</strong></div><div><span>Miss penalties</span><strong>-${formatGameCurrency(state.breakdown.penalty)}</strong></div></div>${velocityDecoration()}<p class="game-result-note">${owned.length?`Final build: ${owned.map(id=>UPGRADE_COPY[id].name).join(', ')}.`:'No upgrades purchased.'} ${outcomeNote}</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button>${retryLevel}<button class="game-button" type="button" data-level-action="retry">New run</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry-level]')?.addEventListener('click',retryCurrentLevel);
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')!.addEventListener('click',start);
  mountResultVelocity();
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
  root.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="run-lost-heading"><p class="game-eyebrow">Level ${state.levelId} · ${levelDefinition(state.levelId).name}</p><h2 id="run-lost-heading">Time’s up</h2><div class="game-result-hero"><div><span>Deadline</span><strong>${clockText(timerTotalMs)}</strong><small>Hard timer expired</small></div><div><span>Run score</span><strong>${formatGameCurrency(state.session.run.score)}</strong><small>${state.category==='keyboard-pointer'?'Keyboard & Pointer':'Touch'}</small></div></div><p class="game-lede">Retry level keeps your score and upgrades. Retry run starts again at Level 1. Local records remain.</p><div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-level-action="exit">Endless Mode</button><button class="game-button game-button-secondary" type="button" data-level-action="retry-level">Retry level</button><button class="game-button" type="button" data-level-action="retry">Retry run</button></div></section>`;
  root.querySelector<HTMLButtonElement>('[data-level-action=exit]')!.addEventListener('click',()=>{stop();onExit();});
  root.querySelector<HTMLButtonElement>('[data-level-action=retry-level]')!.addEventListener('click',retryCurrentLevel);
  root.querySelector<HTMLButtonElement>('[data-level-action=retry]')!.addEventListener('click',start);
 }
 function refreshCurrentSheet(){
  if(!state||state.cleared||state.session.run.phase!=='playing'||engine.refreshing)return;
  if(state.levelId===5){
   adapter?.endConveyor(false);
   adapter?.dispose();
   adapter=null;
   playConveyor();
   return;
  }
  sheetClearedAtMs=null;
  reminderWaitingForSheet=true;
  resetSheetTracking();
  clearBubbleReminder();
  drunkenBobState=createDrunkenBobState();
  engine.forceReset();
  configureHazardSheet();
  sheetBubbleCount=engine.getStats().total;
  applyKeyLabels();
 }
 function retryCurrentLevel(){
  if(!state)return;
  const levelId=state.levelId;
  stopLevelTimer();
  chart?.destroy();chart=null;
  unbindPops();unbindPops=()=>{};
  unbindUpgradePanel();unbindUpgradePanel=()=>{};
  adapter?.endConveyor(false);
  adapter?.dispose();adapter=null;
  engine.setRefreshLocked(false);
  clearBubbleReminder();
  engine.setHazardWarning(null);
  engine.setHotKeys(null);
  sheet.update({onAllPopped:()=>{}});
  const hazardId=levelId===4?((state.session.run.encounter?.hazardId as HazardId|null)??retainedHazardId):null;
  const definition=levelDefinition(levelId);
  const session={
   ...state.session,
   run:{
    ...state.session.run,
    phase:'level-intro' as const,
    level:levelId,
    encounter:{
     levelId,
     sheetIndex:0,
     sheetCount:definition.sheetCount,
     bubblesRemaining:0,
     hazardId,
     sheetHazardIds:[]
    }
   }
  };
  state=createLevelState(session,levelId);
  prepareLevel();
  showIntro();
 }
 function markLevelWon(){
  if(!state||state.cleared||state.session.run.phase!=='playing')return;
  advanceElapsedNow();
  stopLevelTimer();
  if(state.levelId===5){
   adapter?.endConveyor(false);
   const spawned=Math.max(conveyorState.totalSpawned,conveyorState.popped,1);
   conveyorState={...conveyorState,totalSpawned:spawned,popped:spawned,finished:true};
   const outcome=reduceSession(state.session,{type:'complete-level'});
   if(outcome.accepted)state={...state,session:outcome.state,cleared:true,combo:{count:0,expiresAt:0}};
   showConveyorResult(true,1,false);
   return;
  }
  clearBubbleReminder();
  adapter?.warn(null);
  state={...state,sheet:state.sheets};
  const step=noteSheetCleared(state);
  state=step.state;
  if(state.levelId===2){
   const category=state.category??'touch';
   calibrationCollector?.endActivePeriod(levelElapsedMs);
   calibrationSummary=calibrationCollector?.summarize(category,levelElapsedMs)??null;
   if(calibrationSummary&&calibrationSummary.windows.length){
    state=withCalibration(state,calibrationSummary);
    saveCalibrationDiagnostics(calibrationSummary);
   }
  }
  showCleared(false);
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
  if(id==='clusterBomb')return clusterArm?clusterArm.label:'';
  return '';
 }
 function velocityDecoration(){return levelVelocityRates.length>=2?'<div class="game-result-velocity" aria-hidden="true"></div>':'';}
 function mountResultVelocity(){
  const host=root?.querySelector<HTMLElement>('.game-result-velocity');
  if(!host)return;
  chart?.destroy();chart=null;
  chart=mountVelocityChart(host,levelVelocityRates,{rateWindowMs:GAME_CONFIG.scoring.velocity.windowMs,running:false,decorate:true});
 }
 function resetSheetTracking(){clusterTier=0;clusterArm=null;sheetPatternPoints=[];sheetManualPoints=0;}
 function recordSheetPath(x:number|undefined,y:number|undefined,points:number){
  if(!state||state.levelId===5||x===undefined||y===undefined||!Number.isFinite(x)||!Number.isFinite(y))return;
  sheetPatternPoints.push({x,y});
  sheetManualPoints+=points;
 }
 function awardSheetPattern(){
  if(!state||state.levelId===5)return;
  const config=GAME_CONFIG.scoring.sheetPattern;
  const coverage=sheetPatternPoints.length/Math.max(1,sheetBubbleCount);
  if(sheetPatternPoints.length<config.minimumManualPops||coverage<config.minimumCoverage)return;
  const kind=classifySheetPattern(sheetPatternPoints,engine.settings.bubbleSize/2);
  if(!kind)return;
  const bonus=roundGameValue(sheetManualPoints*(config.multiplier-1));
  if(bonus<=0)return;
  const run=state.session.run;
  state={...state,session:{...state.session,run:{...run,score:run.score+bonus}},breakdown:{...state.breakdown,pattern:state.breakdown.pattern+bonus}};
  patternLabels.push(kind==='zigzag'?'Zigzag':'Swirl');
 }
 function applyKeyLabels(){
  const owned=state?.session.run.upgrades??[];
  const cover=owned.includes('keyboardCover');
  if(clusterArm&&!cover)engine.setForcedKeyLabels(clusterArm.indices);
  else if(cover)engine.setForcedKeyLabels('all');
  else engine.setForcedKeyLabels(null);
  engine.setHighlightedKey(clusterArm&&cover?clusterArm.code:null);
 }
 function syncClusterBomb(){
  if(!state||clusterBurst||state.levelId===5||!state.session.run.upgrades.includes('clusterBomb')){applyKeyLabels();return;}
  const total=Math.max(1,sheetBubbleCount||engine.getStats().total);
  const next=nextClusterArm({
   popped:engine.getStats().popped,
   total,
   previousTier:clusterTier,
   groups:engine.getKeyboardMap().filter(group=>group.remaining>0).map(group=>({code:group.code,label:group.label,indices:group.indices.filter(index=>engine.getGameBubbles().some(bubble=>bubble.index===index&&bubble.eligible&&!bubble.popped))})).filter(group=>group.indices.length>0),
   rng:state.rng
  });
  state={...state,rng:next.rng};
  if(next.tier!==clusterTier){clusterTier=next.tier;clusterArm=next.arm;}
  applyKeyLabels();
 }
 function releaseCluster(code:string|null){
  if(!state||!adapter||!clusterArm||code!==clusterArm.code||!state.session.run.upgrades.includes('clusterBomb'))return;
  const indices=clusterArm.indices.filter(index=>engine.getGameBubbles().some(bubble=>bubble.index===index&&bubble.eligible&&!bubble.popped));
  clusterArm=null;
  applyKeyLabels();
  clusterBurst=true;
  for(const index of indices)adapter.pop(index,{type:'assisted',upgrade:'clusterBomb'});
  clusterBurst=false;
 }
 function refreshGoal(){const slot=root?.querySelector('.game-hud-goal strong number-flow');if(state)updateAnimatedNumber(slot??null,state.sheet);}
 function refreshConveyorGoal(){const slots=root?.querySelectorAll('.game-hud-goal strong number-flow');if(!slots||slots.length<2)return;updateAnimatedNumber(slots[0],conveyorState.popped);updateAnimatedNumber(slots[1],conveyorState.totalSpawned);}
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
