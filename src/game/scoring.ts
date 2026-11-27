import {GAME_CONFIG} from './game-config';
import {roundGameValue} from './economy';
import {nextInt,type GameRngState} from './game-rng';
import type {UpgradeId} from './game-config';
import type {RunCategory} from './game-types';

export type ScoreSkill='none'|'clean-sweep'|'hot-key';
export type ScoreInputKind='touch'|'mouse'|'pen'|'keyboard';

export interface ComboState {count:number;expiresAt:number;}
export const EMPTY_COMBO:ComboState={count:0,expiresAt:0};

export interface ManualScore {
 points:number;
 skill:ScoreSkill;
 combo:ComboState;
 rate:number;
 velocityMultiplier:number;
 deadlineMultiplier:number;
 sureHandsBonus:number;
 velocityBoost:number;
 deadlineBoost:number;
}

export function scoreAssistedPop():number {
 return roundGameValue(GAME_CONFIG.scoring.assistedBase);
}

export function scoreManualPop(input:{
 now:number;
 input:ScoreInputKind;
 gestureOrdinal:number;
 adjacent:boolean;
 hotKey:boolean;
 combo:ComboState;
 owned?:readonly UpgradeId[];
 manualPopTimes?:readonly number[];
 hardDeadline?:{totalMs:number;elapsedMs:number}|null;
}):ManualScore {
 const scoring=GAME_CONFIG.scoring;
 const owned=input.owned??[];
 const keyboard=input.input==='keyboard';
 const skill:ScoreSkill=keyboard
  ?input.hotKey?'hot-key':'none'
  :input.gestureOrdinal>=scoring.cleanSweepStartsAt&&input.adjacent?'clean-sweep':'none';
 const alive=input.combo.expiresAt!==0&&input.now<=input.combo.expiresAt;
 const combo={count:alive?input.combo.count+1:1,expiresAt:input.now+scoring.comboGraceMs};
 const popTimes=[...(input.manualPopTimes??[]),input.now].filter(time=>time>=input.now-scoring.velocity.windowMs&&time<=input.now);
 const rate=manualPopRate(popTimes,scoring.velocity.windowMs);
 const velocity=velocityScoreMultiplier(rate,owned.includes('velocityBuff')&&alive);
 const deadline=deadlineScoreMultiplier(
  input.hardDeadline?.totalMs??0,
  input.hardDeadline?Math.max(0,input.hardDeadline.totalMs-input.hardDeadline.elapsedMs):0,
  owned.includes('deadlineFighter')&&alive&&!!input.hardDeadline
 );
 const skillBonus=skill==='none'?0:scoring.skillBonus;
 const sureHandsBonus=skill!=='none'&&owned.includes('sureHands')?GAME_CONFIG.upgrades.sureHands.additionalSkillBonus:0;
 const subtotal=scoring.normalBase+skillBonus+sureHandsBonus;
 const afterVelocity=subtotal*velocity;
 const points=roundGameValue(afterVelocity*deadline);
 const velocityBoost=roundGameValue(afterVelocity)-subtotal;
 const deadlineBoost=points-subtotal-velocityBoost;
 return {points,skill,combo,rate,velocityMultiplier:velocity,deadlineMultiplier:deadline,sureHandsBonus,velocityBoost,deadlineBoost};
}

export function manualPopRate(popTimes:readonly number[],windowMs=GAME_CONFIG.scoring.velocity.windowMs):number {
 if(!Number.isFinite(windowMs)||windowMs<=0)return 0;
 return popTimes.length/(windowMs/1000);
}

export function velocityScoreMultiplier(rate:number,active:boolean):number {
 if(!active||rate<GAME_CONFIG.scoring.velocity.activationPopsPerSecond)return 1;
 const velocity=GAME_CONFIG.scoring.velocity;
 const multiplier=velocity.minimumMultiplier+(velocity.maximumMultiplier-velocity.minimumMultiplier)
  *(1-Math.exp(-(rate-velocity.activationPopsPerSecond)/velocity.diminishingRate));
 return Math.max(velocity.minimumMultiplier,Math.min(velocity.maximumMultiplier,multiplier));
}

export function dangerZoneMs(totalMs:number):number {
 const deadline=GAME_CONFIG.scoring.deadline;
 return Math.min(Math.max(0,totalMs)*deadline.dangerZoneFraction,deadline.dangerZoneMaxSeconds*1000);
}

export function deadlineScoreMultiplier(totalMs:number,remainingMs:number,active:boolean):number {
 const zone=dangerZoneMs(totalMs);
 if(!active||zone<=0||remainingMs>zone)return 1;
 const deadline=GAME_CONFIG.scoring.deadline;
 const progress=1-Math.max(0,remainingMs)/zone;
 return deadline.minimumMultiplier+(deadline.maximumMultiplier-deadline.minimumMultiplier)*progress;
}

export function chooseHotKeys(codes:readonly string[],count:number,rng:GameRngState,previous:readonly string[]=[]):{state:GameRngState;codes:string[]} {
 const pool=[...new Set(codes)];
 let state=rng;
 for(let index=pool.length-1;index>0;index--){
  const draw=nextInt(state,0,index);
  state=draw.state;
  const swap=pool[index];pool[index]=pool[draw.value];pool[draw.value]=swap;
 }
 let chosen=pool.slice(0,Math.min(count,pool.length));
 const signature=(values:readonly string[])=>[...values].sort().join('|');
 if(previous.length>0&&signature(chosen)===signature(previous)&&pool.length>count)chosen=pool.slice(1,count+1);
 return {state,codes:chosen};
}

export function categoryForManualInput(input:ScoreInputKind):RunCategory {
 return input==='touch'?'touch':'keyboard-pointer';
}
