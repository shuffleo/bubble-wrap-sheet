import {GAME_CONFIG,type UpgradeId} from './game-config';
import {UPGRADE_COPY} from './game-copy';
import {formatGameCurrency,formatGameNumber,rerollPrice,roundGameValue,scoreAfterShopSkip,shopInterest} from './economy';
import {GAME_FIXTURES,type HudFixture,type ResultFixture,type ShopFixture} from './game-fixtures';
import {readGameHighScores} from './game-high-scores';
import {animatedNumber} from './game-vendors';
import {createTuningDrawer} from './tuning/tuning-drawer';
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

function sparkline(values:readonly number[]):string {
 if(values.length<2)return '';
 const width=180,height=38,max=Math.max(...values,1),step=width/(values.length-1);
 const points=values.map((value,index)=>`${(index*step).toFixed(1)},${(height-(value/max)*(height-3)).toFixed(1)}`).join(' ');
 return `<svg class="game-velocity-chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Pop velocity over the last 30 seconds"><polyline points="${points}"/></svg>`;
}

export function createGameUi(route:GameRoute,onFreePop:()=>void):GameUiHandle {
 let root:HTMLElement|null=null;
 let shopState:ShopFixture|null=null;
 let runScore:number|null=null;
 const live=document.createElement('p');
 live.id='game-live';live.className='sr-only';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');

 function ensureRoot(){
  if(root)return root;
  noIndex();
  root=document.createElement('div');root.id='game-root';root.dataset.screen='mode-select';
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
  document.body.dataset.gameMode='select';
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
  hydrateNumbers(node);
  node.querySelector<HTMLButtonElement>('[data-game-action=free]')!.addEventListener('click',close);
  node.querySelector<HTMLButtonElement>('[data-game-action=survival]')!.addEventListener('click',()=>renderLevelIntro());
  live.textContent='Game mode selection opened.';
  node.querySelector<HTMLButtonElement>('[data-game-action=survival]')!.focus();
 }

 function renderLevelIntro(){
  const level=GAME_CONFIG.run.levels[0],node=ensureRoot();node.dataset.screen='level-intro';
  document.body.dataset.gameMode='survival';
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
  document.body.dataset.gameMode='survival';
  const timer=timerParts(fixture.timerRemainingMs);
  node.innerHTML=`<section class="game-hud" aria-label="Survival Run status" data-danger="${fixture.dangerZone}" data-paused="${fixture.paused}" data-hidden="${fixture.hidden}">
   <div class="game-hud-score"><span class="game-label">Score</span><strong>${numberSlot(fixture.score,{currency:true})}</strong></div>
   <div class="game-hud-velocity"><div><span class="game-label">Pop / s</span><strong>${numberSlot(fixture.popsPerSecond)}</strong>${fixture.upgrades.includes('velocityBuff')?`<small>${numberSlot(fixture.velocityMultiplier)}× score</small>`:'<small>Last 30 seconds</small>'}</div>${sparkline(fixture.velocityHistory)}</div>
   <div class="game-hud-goal"><span class="game-label">Level ${numberSlot(fixture.level)}</span><strong>${fixture.goalLabel}</strong><span>${numberSlot(fixture.goalCurrent)} / ${numberSlot(fixture.goalTarget)} ${fixture.goalUnit}</span><i aria-hidden="true"><b style="width:${Math.min(100,fixture.goalCurrent/fixture.goalTarget*100)}%"></b></i></div>
   <div class="game-hud-timer" aria-label="${time(fixture.timerRemainingMs)} remaining"><span class="game-label">${fixture.timerKind==='soft'?'Target':'Time left'}</span><strong>${numberSlot(timer.minutes,{minimumIntegerDigits:2})}<span class="game-timer-colon">:</span>${numberSlot(timer.seconds,{minimumIntegerDigits:2})}</strong><small>${fixture.softTimerExpired?'Par spent — keep popping':fixture.dangerZone?'Danger zone':'Active time'}</small></div>
   <div class="game-hud-build" aria-label="Current upgrades">${fixture.upgrades.map(id=>{const copy=UPGRADE_COPY[id],active=fixture.activeUpgradeValues[id];return `<button type="button" class="game-upgrade" data-upgrade="${id}" data-active="${Boolean(active)}" aria-label="${copy.name}: ${copy.description}"><span class="material-symbols-rounded" aria-hidden="true">${copy.icon}</span>${active?`<b>${active}</b>`:''}<span class="game-upgrade-popover" role="tooltip"><strong>${copy.name}</strong><span>${copy.description}</span></span></button>`;}).join('')}</div>
   ${fixture.hazard?`<p class="game-hud-hazard"><span class="game-label">Hazard</span>${fixture.hazard}</p>`:''}
   ${fixture.paused?'<div class="game-state-banner">Paused</div>':''}
   ${fixture.hidden?'<button class="game-hud-reveal" type="button" data-game-action="reveal-hud">Show HUD</button>':''}
   <details class="game-overflow"><summary class="game-icon-button" aria-label="More game options"><span class="material-symbols-rounded" aria-hidden="true">more_horiz</span></summary><div class="game-overflow-menu"><button type="button" data-game-action="shop"><span class="material-symbols-rounded" aria-hidden="true">storefront</span>Shop preview</button><button type="button" data-game-action="mode"><span class="material-symbols-rounded" aria-hidden="true">sports_esports</span>Modes</button><button type="button" data-game-action="run-won"><span class="material-symbols-rounded" aria-hidden="true">emoji_events</span>Run won</button><button type="button" data-game-action="tuning"><span class="material-symbols-rounded" aria-hidden="true">tune</span>Tuning panel</button></div></details>
  </section>`;
  hydrateNumbers(node);
  node.querySelector<HTMLButtonElement>('[data-game-action=mode]')!.addEventListener('click',renderModeSelect);
  node.querySelector<HTMLButtonElement>('[data-game-action=shop]')!.addEventListener('click',()=>renderShop(true));
  node.querySelector<HTMLButtonElement>('[data-game-action=run-won]')!.addEventListener('click',()=>renderResult(GAME_FIXTURES.runWon));
  node.querySelector<HTMLButtonElement>('[data-game-action=tuning]')!.addEventListener('click',()=>{if(!document.getElementById('tuning-drawer'))createTuningDrawer();});
  for(const upgrade of Array.from(node.querySelectorAll<HTMLButtonElement>('.game-upgrade')))upgrade.addEventListener('click',()=>{upgrade.dataset.open=String(upgrade.dataset.open!=='true');});
  node.querySelector<HTMLButtonElement>('[data-game-action=reveal-hud]')?.addEventListener('click',()=>{route.hudState='normal';renderHud();});
  live.textContent=`Level ${fixture.level}. ${fixture.goalLabel}: ${fixture.goalCurrent} of ${fixture.goalTarget}. ${time(fixture.timerRemainingMs)} remaining.`;
 }

 function cloneShop(source:ShopFixture):ShopFixture {
  return {...source,ownedUpgrades:[...source.ownedUpgrades],offers:source.offers.map(offer=>({...offer}))};
 }

 function renderShop(reset=false){
  if(reset||!shopState)shopState=cloneShop(route.category==='keyboard-pointer'?GAME_FIXTURES.shopKeyboard:GAME_FIXTURES.shop);
  const fixture=shopState,node=ensureRoot();node.dataset.screen='shop';
  document.body.dataset.gameMode='survival';
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
  document.body.dataset.gameMode='survival';
  const title=fixture.outcome==='won'?'Run cleared':'Run over';
  node.innerHTML=`<div class="game-scrim"></div><section class="game-card game-result-card" aria-labelledby="game-result-heading">
   <p class="game-eyebrow">${fixture.outcome==='won'?'Survival complete':`Reached level ${fixture.reachedLevel}`}</p><h2 id="game-result-heading">${title}</h2>
   <div class="game-result-score"><span>Final score</span><strong>${numberSlot(fixture.finalScore,{currency:true})}</strong><small>${fixture.category==='touch'?'Touch':'Keyboard & Pointer'}</small></div>
   <div class="game-result-grid"><div><span>Manual pops</span><strong>${numberSlot(fixture.manualPops)}</strong></div><div><span>Assisted pops</span><strong>${numberSlot(fixture.assistedPops)}</strong></div><div><span>Upgrades bought</span><strong>${numberSlot(fixture.purchaseHistory.length)}</strong></div></div>
   <ol class="game-level-breakdown">${fixture.levelScores.map(row=>`<li><span>Level ${row.level} · ${GAME_CONFIG.run.levels[row.level-1].name}</span><strong>${numberSlot(row.score,{currency:true})}</strong></li>`).join('')}</ol>
   <div class="game-purchase-history"><span class="game-label">Build</span>${fixture.purchaseHistory.length?fixture.purchaseHistory.map(id=>`<span>${UPGRADE_COPY[id].name}</span>`).join(''):'<span>No upgrades</span>'}</div>
   <div class="game-inline-actions"><button class="game-button game-button-secondary" type="button" data-game-action="free">Free Pop</button><button class="game-button" type="button" data-game-action="retry">Retry run</button></div>
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
