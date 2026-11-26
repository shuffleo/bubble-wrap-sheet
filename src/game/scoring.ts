import {GAME_CONFIG} from './game-config';
import {roundGameValue} from './economy';
import {nextInt,type GameRngState} from './game-rng';
import type {RunCategory} from './game-types';

export type ScoreSkill='none'|'clean-sweep'|'hot-key';
export type ScoreInputKind='touch'|'mouse'|'pen'|'keyboard';

export interface ComboState {count:number;expiresAt:number;}
export const EMPTY_COMBO:ComboState={count:0,expiresAt:0};

export interface ManualScore {
 points:number;
 skill:ScoreSkill;
 combo:ComboState;
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
}):ManualScore {
 const scoring=GAME_CONFIG.scoring;
 const keyboard=input.input==='keyboard';
 const skill:ScoreSkill=keyboard
  ?input.hotKey?'hot-key':'none'
  :input.gestureOrdinal>=scoring.cleanSweepStartsAt&&input.adjacent?'clean-sweep':'none';
 const alive=input.combo.expiresAt!==0&&input.now<=input.combo.expiresAt;
 const combo={count:alive?input.combo.count+1:1,expiresAt:input.now+scoring.comboGraceMs};
 const points=roundGameValue(scoring.normalBase+(skill==='none'?0:scoring.skillBonus));
 return {points,skill,combo};
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
