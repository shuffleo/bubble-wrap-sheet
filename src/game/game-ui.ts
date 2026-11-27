import {GAME_CONFIG,type UpgradeId} from './game-config';
import {UPGRADE_COPY} from './game-copy';
import {formatGameCurrency,formatGameNumber,rerollPrice,roundGameValue,scoreAfterShopSkip,shopInterest} from './economy';
import {GAME_FIXTURES,type HudFixture,type ResultFixture,type ShopFixture} from './game-fixtures';
import {readGameHighScores} from './game-high-scores';
import {animatedNumber,updateAnimatedNumber} from './game-vendors';
import {bindVelocityPops,mountVelocityChart,type VelocityChart} from './velocity-chart';
import {createTuningDrawer} from './tuning/tuning-drawer';
import type {GameRoute,GameScreen} from './game-route';
import {medalStripMarkup,roadmapMarkup} from './dossier-ui';
import {readLevelRecords} from './level-records';
import {formatDuration} from './level-presentation';

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
 return value===null?'—':numberSlot(value,{currency:true});
}

function timerParts(milliseconds:number):{minutes:number;seconds:number} {
 const seconds=Math.max(0,Math.ceil(milliseconds/1000));
 return {minutes:Math.floor(seconds/60),seconds:seconds%60};
}

function time(milliseconds:number):string {
 const parts=timerParts(milliseconds);
 return `${parts.minutes}:${String(parts.seconds).padStart(2,'0')}`;
}

function numberSlot(value:number,{currency=false,className='',minimumIntegerDigits=1}:{currency?:boolean;className?:string;minimumIntegerDigits?:number}={}):string {
 const rounded=roundGameValue(value);
 return `<span class="${className}" data-game-number="${rounded}" data-currency="${currency}" data-minimum-digits="${minimumIntegerDigits}">${currency?formatGameCurrency(rounded):formatGameNumber(rounded)}</span>`;
}

function hydrateNumbers(container:ParentNode):void {
 for(const slot of Array.from(container.querySelectorAll<HTMLElement>('[data-game-number]'))){
  const value=Number(slot.dataset.gameNumber),element=animatedNumber(value,{currency:slot.dataset.currency==='true',minimumIntegerDigits:Number(slot.dataset.minimumDigits||1)});
  element.className=slot.className;
  for(const attribute of Array.from(slot.attributes)){
   if(attribute.name==='class'||attribute.name.startsWith('data-game-')||attribute.name==='data-currency')continue;
   element.setAttribute(attribute.name,attribute.value);
  }
  slot.replaceWith(element);
 }
}

function setMode(mode:'survival'|'select'|null){
 if(mode)document.body.dataset.gameMode=mode;
 else delete document.body.dataset.gameMode;
 window.dispatchEvent(new Event('resize'));
}

export interface GameUiOptions {onStartSurvival?:()=>void;}

export function createGameUi(route:GameRoute,onFreePop:()=>void,options:GameUiOptions={}):GameUiHandle {
 let root:HTMLElement|null=null;
 let shopState:ShopFixture|null=null;
 let runScore:number|null=null;
 let velocityChart:VelocityChart|null=null;
 let unbindVelocity:()=>void=()=>{};
 let unbindUpgrade:()=>void=()=>{};
 let sheetObserver:MutationObserver|null=null;
 const live=document.createElement('p');
 live.id='game-live';live.className='sr-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');

 function ensureRoot(){
  if(root)return root;
  noIndex();
  root=document.createElement('div');root.id='game-root';root.dataset.screen='mode-select';
  document.body.append(root,live);
  return root;
 }

 function clearVelocityChart(){unbindVelocity();unbindVelocity=()=>{};unbindUpgrade();unbindUpgrade=()=>{};velocityChart?.destroy();velocityChart=null;}
 function closeMenu(container:ParentNode){const menu=container.querySelector<HTMLDetailsElement>('.game-overflow');if(menu)menu.open=false;}
 function syncSheetMenu(container:ParentNode){
  const refresh=container.querySelector<HTMLButtonElement>('[data-game-action=refresh]');
  const mute=container.querySelector<HTMLButtonElement>('[data-game-action=mute]');
  const reset=document.getElementById('reset') as HTMLButtonElement|null;
  const sound=document.getElementById('sound') as HTMLButtonElement|null;
  if(refresh&&reset)refresh.disabled=reset.disabled;
  if(mute&&sound){
   const muted=sound.dataset.muted==='true';
   const label=mute.querySelector<HTMLElement>('[data-mute-label]');
   const icon=mute.querySelector<HTMLElement>('.material-symbols-rounded');
   if(label)label.textContent=muted?'Unmute':'Mute';
   if(icon)icon.textContent=muted?'volume_off':'volume_up';
   mute.setAttribute('aria-pressed',String(!muted));
  }
 }
 function watchSheetMenu(container:ParentNode){
  sheetObserver?.disconnect();
  const reset=document.getElementById('reset'),sound=document.getElementById('sound');
  if(!reset&&!sound)return;
  sheetObserver=new MutationObserver(()=>syncSheetMenu(container));
  if(reset)sheetObserver.observe(reset,{attributes:true,attributeFilter:['disabled']});
  if(sound)sheetObserver.observe(sound,{attributes:true,attributeFilter:['data-muted']});
 }
 function close(){
  clearVelocityChart();sheetObserver?.disconnect();sheetObserver=null;root?.remove();live.remove();root=null;setMode(null);onFreePop();
 }

 function renderModeSelect(){
  noIndex();
  const scores=readGameHighScores();
  const node=ensureRoot();node.dataset.screen='mode-select';
  clearVelocityChart();setMode('select');
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-mode-card" aria-labelledby="game-mode-heading">
   <p class="game-eyebrow">Bubble Wrap</p>
   <h2 id="game-mode-heading">Choose how to pop</h2>
   <p class="game-lede">Keep it meditative, or turn five sheets into a survival run.</p>
   <div class="game-mode-options">
    <button class="game-mode-option" type="button" data-game-action="free"><strong>Endless Mode</strong><span>Pop freely, with all material controls.</span></button>
    <button class="game-mode-option game-mode-option-primary" type="button" data-game-action="survival"><strong>Survival Run</strong><span>Five levels, tactical upgrades, hazards, and a conveyor finale.</span></button>
   </div>
   <div class="game-high-scores" aria-label="Local high scores"><span>Touch best <strong>${score(scores.touch)}</strong></span><span>Keyboard &amp; Pointer best <strong>${score(scores.keyboardPointer)}</strong></span></div>
  </section>`;
  hydrateNumbers(node);
  node.querySelector<HTMLButtonElement>('[data-game-action=free]')!.addEventListener('click',close);
  node.querySelector<HTMLButtonElement>('[data-game-action=survival]')!.addEventListener('click',()=>{if(options.onStartSurvival&&!route.enabled){options.onStartSurvival();return;}renderLevelIntro();});
  live.textContent='Game mode selection opened.';
  node.querySelector<HTMLButtonElement>('[data-game-action=survival]')!.focus();
 }

 function renderLevelIntro(){
  const level=GAME_CONFIG.run.levels[0],node=ensureRoot();node.dataset.screen='level-intro';
  clearVelocityChart();setMode('survival');
  const best=readLevelRecords()[1]?.bestTimeMs;
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-intro-card game-dossier" aria-labelledby="game-intro-heading">
   <p class="game-eyebrow">Level ${level.id} of ${GAME_CONFIG.run.levelCount}</p>
   <h2 id="game-intro-heading">${level.name}</h2>
   <div class="game-brief-stats"><div><span>Best time</span><strong>${best===null||best===undefined?'—':formatDuration(best)}</strong></div><div><span>Sheets</span><strong>${level.sheetCount} × ${level.bubbleSize}</strong></div><div><span>Goal</span><strong>All bubbles</strong></div></div>
   <p class="game-lede">Clear every bubble. Drag through adjacent bubbles for Clean Sweep, or hit highlighted Hot Keys.</p>
   <h3 class="game-section-title">Medal targets · score at least</h3>${medalStripMarkup(1)}
   <div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-game-action="back">Endless Mode</button><button class="game-button game-button-secondary" type="button" data-game-action="roadmap">Next 3 levels</button><button class="game-button" type="button" data-game-action="continue">Start</button></div>
  </section>`;
  node.querySelector<HTMLButtonElement>('[data-game-action=back]')!.addEventListener('click',close);
  node.querySelector<HTMLButtonElement>('[data-game-action=roadmap]')!.addEventListener('click',renderLevelRoadmap);
  node.querySelector<HTMLButtonElement>('[data-game-action=continue]')!.addEventListener('click',()=>showScreen('hud'));
  live.textContent=`Level ${level.id}: ${level.name}.`;
  node.querySelector<HTMLButtonElement>('[data-game-action=continue]')!.focus();
 }

 function renderLevelRoadmap(){
  const node=ensureRoot();node.dataset.screen='level-intro';
  clearVelocityChart();setMode('survival');
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-dossier" aria-labelledby="game-roadmap-heading"><p class="game-eyebrow">Plan your build</p><h2 id="game-roadmap-heading">Next 3 levels</h2><p class="game-lede">Preview the stakes and hazards before spending score on upgrades.</p>${roadmapMarkup(1)}<div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-game-action="brief">Back</button><button class="game-button" type="button" data-game-action="continue">Start level 1</button></div></section>`;
  node.querySelector<HTMLButtonElement>('[data-game-action=brief]')!.addEventListener('click',renderLevelIntro);
  node.querySelector<HTMLButtonElement>('[data-game-action=continue]')!.addEventListener('click',()=>showScreen('hud'));
  node.querySelector<HTMLButtonElement>('[data-game-action=brief]')!.focus();
 }

 function hudFixture():HudFixture {
  const base=GAME_FIXTURES.hud;
  const purchased=shopState?.ownedUpgrades||[];
  const upgrades=Array.from(new Set<UpgradeId>([...base.upgrades,...purchased]));
  const shared={...base,score:runScore??base.score,upgrades};
  if(route.hudState==='danger')return {...shared,dangerZone:true};
  if(route.hudState==='soft-expired')return {...shared,timerKind:'soft',timerRemainingMs:0,dangerZone:false,softTimerExpired:true};
  if(route.hudState==='paused')return {...shared,dangerZone:false,paused:true};
  if(route.hudState==='hidden')return {...shared,dangerZone:false,hidden:true};
  return {...shared,dangerZone:false,timerRemainingMs:Math.round(base.timerTotalMs/2)};
 }

 function renderHud(){
  const fixture=hudFixture(),node=ensureRoot();node.dataset.screen='hud';
  clearVelocityChart();setMode('survival');
  const timer=timerParts(fixture.timerRemainingMs);
  const progress=fixture.goalTarget>0?Math.min(100,fixture.goalCurrent/fixture.goalTarget*100):0;
  node.innerHTML=`<section class="game-hud" aria-label="Survival Run status" data-danger="${fixture.dangerZone}" data-paused="${fixture.paused}" data-hidden="${fixture.hidden}">
   <div class="game-hud-score"><span class="game-label">Score</span><strong>${numberSlot(fixture.score,{currency:true})}</strong></div>
   <div class="game-hud-velocity"><div class="game-velocity-readout"><strong>${numberSlot(fixture.popsPerSecond)}</strong><span class="game-label">Pop / s</span></div><div class="game-velocity-chart" role="img" aria-label="Pop velocity over the last 30 seconds"></div></div>
   <div class="game-hud-goal"><span class="game-label">Level ${numberSlot(fixture.level)}</span><strong>${numberSlot(fixture.goalCurrent)}<span class="game-goal-sep">/</span>${numberSlot(fixture.goalTarget)}</strong><small>${fixture.goalUnit}</small><i aria-hidden="true"><b style="width:${progress}%"></b></i></div>
   <div class="game-hud-timer" aria-label="${time(fixture.timerRemainingMs)} remaining"><span class="game-label">${fixture.timerKind==='soft'?'Target':'Time left'}</span><strong>${numberSlot(timer.minutes,{minimumIntegerDigits:2})}<span class="game-timer-colon">:</span>${numberSlot(timer.seconds,{minimumIntegerDigits:2})}</strong></div>
   ${fixture.upgrades.length?`<div class="game-hud-build"><button type="button" class="game-upgrade-panel" aria-expanded="false" aria-label="Owned upgrades"><span class="game-upgrade-icons">${fixture.upgrades.map(id=>{const copy=UPGRADE_COPY[id],active=fixture.activeUpgradeValues[id];return `<span class="game-upgrade" data-upgrade="${id}" data-active="${Boolean(active)}"><span class="material-symbols-rounded" aria-hidden="true">${copy.icon}</span>${active?`<b>${active}</b>`:''}</span>`;}).join('')}</span></button><div class="game-upgrade-popover" role="tooltip">${fixture.upgrades.map(id=>{const copy=UPGRADE_COPY[id];return `<span class="game-upgrade-note"><strong>${copy.name}</strong><span>${copy.description}</span></span>`;}).join('')}</div></div>`:''}
   ${fixture.hazard?`<p class="game-hud-hazard"><span class="game-label">Hazard</span>${fixture.hazard}</p>`:''}
   ${fixture.paused?'<div class="game-state-banner">Paused</div>':''}
   ${fixture.hidden?'<button class="game-hud-reveal" type="button" data-game-action="reveal-hud">Show HUD</button>':''}
   <details class="game-overflow"><summary class="game-icon-button" aria-label="More game options"><span class="material-symbols-rounded" aria-hidden="true">more_horiz</span></summary><div class="game-overflow-menu"><button type="button" data-game-action="refresh"><span class="material-symbols-rounded" aria-hidden="true">refresh</span>Refresh sheet</button><button type="button" data-game-action="mute" aria-pressed="true"><span class="material-symbols-rounded" aria-hidden="true">volume_up</span><span data-mute-label>Mute</span></button><button type="button" data-game-action="shop"><span class="material-symbols-rounded" aria-hidden="true">storefront</span>Shop preview</button><button type="button" data-game-action="mode"><span class="material-symbols-rounded" aria-hidden="true">sports_esports</span>Modes</button><button type="button" data-game-action="run-won"><span class="material-symbols-rounded" aria-hidden="true">emoji_events</span>Run won</button><button type="button" data-game-action="tuning"><span class="material-symbols-rounded" aria-hidden="true">tune</span>Tuning panel</button></div></details>
  </section>`;
  hydrateNumbers(node);
  const chartHost=node.querySelector<HTMLElement>('.game-velocity-chart');
  if(chartHost){
   const readout=node.querySelector<HTMLElement>('.game-velocity-readout strong number-flow');
   velocityChart=mountVelocityChart(chartHost,fixture.velocityHistory,{
    rateWindowMs:GAME_CONFIG.scoring.velocity.windowMs,
    running:!fixture.paused&&!fixture.hidden,
    onRate:rate=>updateAnimatedNumber(readout,rate)
   });
   const attach=()=>{
    const engine=(window as unknown as {bubbleUI?:EventTarget}).bubbleUI;
    if(!engine||!velocityChart)return false;
    unbindVelocity=bindVelocityPops(velocityChart,engine);
    return true;
   };
   if(!attach())requestAnimationFrame(()=>attach());
  }
  const build=node.querySelector<HTMLElement>('.game-hud-build');
  const panel=build?.querySelector<HTMLButtonElement>('.game-upgrade-panel');
  if(build&&panel){
   const setOpen=(open:boolean)=>{build.dataset.open=String(open);panel.setAttribute('aria-expanded',String(open));};
   const onPanelClick=(event:Event)=>{event.stopPropagation();setOpen(build.dataset.open!=='true');};
   const onOutside=(event:Event)=>{if(build.dataset.open!=='true')return;const target=event.target;if(target instanceof Node&&build.contains(target))return;setOpen(false);};
   panel.addEventListener('click',onPanelClick);
   document.addEventListener('pointerdown',onOutside);
   unbindUpgrade=()=>{panel.removeEventListener('click',onPanelClick);document.removeEventListener('pointerdown',onOutside);};
  }
  syncSheetMenu(node);watchSheetMenu(node);
  node.querySelector<HTMLDetailsElement>('.game-overflow')!.addEventListener('toggle',()=>syncSheetMenu(node));
  node.querySelector<HTMLButtonElement>('[data-game-action=refresh]')!.addEventListener('click',()=>{document.getElementById('reset')?.click();closeMenu(node);});
  node.querySelector<HTMLButtonElement>('[data-game-action=mute]')!.addEventListener('click',()=>{document.getElementById('sound')?.click();syncSheetMenu(node);closeMenu(node);});
  node.querySelector<HTMLButtonElement>('[data-game-action=mode]')!.addEventListener('click',renderModeSelect);
  node.querySelector<HTMLButtonElement>('[data-game-action=shop]')!.addEventListener('click',()=>renderShop(true));
  node.querySelector<HTMLButtonElement>('[data-game-action=run-won]')!.addEventListener('click',()=>renderResult(GAME_FIXTURES.runWon));
  node.querySelector<HTMLButtonElement>('[data-game-action=tuning]')!.addEventListener('click',()=>{closeMenu(node);if(!document.getElementById('tuning-drawer'))createTuningDrawer();});
  node.querySelector<HTMLButtonElement>('[data-game-action=reveal-hud]')?.addEventListener('click',()=>{route.hudState='normal';renderHud();});
  live.textContent=`Level ${fixture.level}. ${fixture.goalCurrent} of ${fixture.goalTarget} ${fixture.goalUnit}. ${time(fixture.timerRemainingMs)} remaining.`;
 }

 function cloneShop(source:ShopFixture):ShopFixture {
  return {...source,ownedUpgrades:[...source.ownedUpgrades],offers:source.offers.map(offer=>({...offer}))};
 }

 function renderShop(reset=false){
  if(reset||!shopState)shopState=cloneShop(route.category==='keyboard-pointer'?GAME_FIXTURES.shopKeyboard:GAME_FIXTURES.shop);
  const fixture=shopState,node=ensureRoot();node.dataset.screen='shop';
  clearVelocityChart();setMode('survival');
  const category=fixture.category==='touch'?GAME_CONFIG.categories.touch:GAME_CONFIG.categories.keyboardPointer;
  const currentRerollPrice=rerollPrice(fixture.category,fixture.rerollsUsed,fixture.ownedUpgrades);
  const rerollsRemaining=Math.max(0,fixture.rerollLimit-fixture.rerollsUsed);
  const interest=shopInterest(fixture.score,fixture.category,fixture.ownedUpgrades);
  const interestRate=fixture.ownedUpgrades.includes('rateHikeCycle')?GAME_CONFIG.upgrades.rateHikeCycle.interestRate:GAME_CONFIG.economy.shopInterestRate;
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-shop-card" aria-labelledby="game-shop-heading">
   <div class="game-screen-heading"><div><p class="game-eyebrow">After level 2</p><h2 id="game-shop-heading">Choose one edge</h2></div><div class="game-balance"><span>Available score</span><strong>${numberSlot(fixture.score,{currency:true})}</strong></div></div>
   <p class="game-lede">Your score is also your spending power. Buy one upgrade, reroll, or bank the score and earn interest.</p>
   <div class="game-offers">${fixture.offers.map(offer=>{const copy=UPGRADE_COPY[offer.id];const status=offer.owned?'Owned':offer.affordable?'Affordable':'Need more score';return `<article class="game-offer" data-upgrade="${offer.id}" data-affordable="${offer.affordable}" data-owned="${offer.owned}"><div><span class="game-offer-icon material-symbols-rounded" aria-hidden="true">${copy.icon}</span><span class="game-offer-status">${status}</span><h3>${copy.name}</h3><p>${copy.description}</p></div><button type="button" data-game-buy="${offer.id}" ${offer.affordable&&!offer.owned?'':'disabled'}>Buy <b>${numberSlot(offer.price,{currency:true})}</b></button></article>`;}).join('')}</div>
   <div class="game-shop-actions"><div><button class="game-button game-button-secondary" type="button" data-game-action="reroll" ${rerollsRemaining===0||fixture.score<currentRerollPrice?'disabled':''}><span class="material-symbols-rounded" aria-hidden="true">refresh</span>Reroll · ${numberSlot(currentRerollPrice,{currency:true})}</button><small>${rerollsRemaining} rerolls left</small></div><div><button class="game-button" type="button" data-game-action="skip">Skip</button><small>Earn ${formatGameNumber(interestRate*100)}% interest · ${formatGameCurrency(interest)}</small></div></div>
  </section>`;
  hydrateNumbers(node);
  for(const button of Array.from(node.querySelectorAll<HTMLButtonElement>('[data-game-buy]')))button.addEventListener('click',()=>{
   const id=button.dataset.gameBuy as UpgradeId,offer=fixture.offers.find(candidate=>candidate.id===id);
   if(!offer||!offer.affordable||offer.owned)return;
   fixture.score-=offer.price;offer.owned=true;fixture.ownedUpgrades.push(id);runScore=fixture.score;
   live.textContent=`${UPGRADE_COPY[id].name} bought for ${formatGameCurrency(offer.price)}.`;
   renderHud();
  });
  node.querySelector<HTMLButtonElement>('[data-game-action=reroll]')!.addEventListener('click',()=>{
   if(rerollsRemaining===0||fixture.score<currentRerollPrice)return;
   fixture.score-=currentRerollPrice;fixture.rerollsUsed++;
   const pools:UpgradeId[][]=[['knuckleCrack','roughTable'],['rateHikeCycle','priorityBanking'],['flatRate','staticDischarge']];
   const ids=pools[(fixture.rerollsUsed-1)%pools.length];
   fixture.offers=ids.map(id=>({id,price:category.upgradePrices[id],affordable:fixture.score>=category.upgradePrices[id],owned:false}));
   renderShop();
  });
  node.querySelector<HTMLButtonElement>('[data-game-action=skip]')!.addEventListener('click',()=>{const earned=shopInterest(fixture.score,fixture.category,fixture.ownedUpgrades);fixture.score=scoreAfterShopSkip(fixture.score,fixture.category,fixture.ownedUpgrades);runScore=fixture.score;live.textContent=`Shop skipped. ${formatGameCurrency(earned)} interest earned.`;renderHud();});
  live.textContent=`Shop opened with ${formatGameCurrency(fixture.score)} score available.`;
 }

 function renderResult(fixture:ResultFixture){
  const node=ensureRoot();node.dataset.screen=fixture.outcome==='won'?'run-won':'run-lost';
  clearVelocityChart();setMode('survival');
  const title=fixture.outcome==='won'?'Run cleared':'Run over';
  const bestRound=fixture.levelScores.reduce((best,row)=>row.score>best.score?row:best,fixture.levelScores[0]);
  const totalBubbles=fixture.manualPops+fixture.assistedPops;
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card game-dossier" aria-labelledby="game-result-heading">
   <p class="game-eyebrow">${fixture.outcome==='won'?'Survival complete':`Reached level ${fixture.reachedLevel}`}</p><h2 id="game-result-heading">${title}</h2>
   <div class="game-result-hero"><div><span>Final score</span><strong>${numberSlot(fixture.finalScore,{currency:true})}</strong><small>${fixture.category==='touch'?'Touch':'Keyboard & Pointer'}</small></div><div><span>Run time</span><strong>${formatDuration(fixture.runTimeMs)}</strong><small>${fixture.outcome==='won'?'5 levels cleared':`Stopped at level ${fixture.reachedLevel}`}</small></div></div>
   <h3 class="game-section-title">Run statistics</h3><div class="game-result-grid game-run-stats"><div><span>Best round</span><strong>Level ${bestRound.level}</strong><small>${numberSlot(bestRound.score,{currency:true})}</small></div><div><span>Total bubbles</span><strong>${numberSlot(totalBubbles)}</strong></div><div><span>Manual pops</span><strong>${numberSlot(fixture.manualPops)}</strong></div><div><span>Assisted pops</span><strong>${numberSlot(fixture.assistedPops)}</strong></div><div><span>Highest combo</span><strong>${numberSlot(fixture.highestCombo)}</strong></div><div><span>Rerolls</span><strong>${numberSlot(fixture.rerolls)}</strong></div></div>
   <h3 class="game-section-title">Level ledger</h3><ol class="game-level-breakdown">${fixture.levelScores.map(row=>`<li><span>Level ${row.level} · ${GAME_CONFIG.run.levels[row.level-1].name}</span><strong>${numberSlot(row.score,{currency:true})}</strong></li>`).join('')}</ol>
   <div class="game-purchase-history"><span class="game-label">Build</span>${fixture.purchaseHistory.length?fixture.purchaseHistory.map(id=>`<span>${UPGRADE_COPY[id].name}</span>`).join(''):'<span>No upgrades</span>'}</div>
   <div class="game-inline-actions game-dossier-actions"><button class="game-button game-button-secondary" type="button" data-game-action="free">Endless Mode</button><button class="game-button" type="button" data-game-action="retry">New Run</button></div>
  </section>`;
  hydrateNumbers(node);
  node.querySelector<HTMLButtonElement>('[data-game-action=free]')!.addEventListener('click',close);
  node.querySelector<HTMLButtonElement>('[data-game-action=retry]')!.addEventListener('click',renderLevelIntro);
  live.textContent=`${title}. Final score ${fixture.finalScore}.`;
 }

 function showScreen(screen:GameScreen){
  if(screen==='level-intro'){renderLevelIntro();return;}
  if(screen==='hud'){renderHud();return;}
  if(screen==='shop'){renderShop(true);return;}
  if(screen==='run-won'){renderResult(GAME_FIXTURES.runWon);return;}
  if(screen==='run-lost'){renderResult(GAME_FIXTURES.runLost);return;}
  renderModeSelect();
 }

 const handle:GameUiHandle={get root(){return root;},openModeSelect:renderModeSelect,showScreen,close};
 if(route.enabled)showScreen(route.screen);
 return handle;
}
