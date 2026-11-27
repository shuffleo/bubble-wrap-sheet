import {roundGameValue} from './economy';
import type {RunCategory} from './game-types';

const HIGH_SCORE_KEY='bubble-survival-high-scores-v1';
export interface GameHighScores {touch:number|null;keyboardPointer:number|null;}
export const EMPTY_HIGH_SCORES:GameHighScores={touch:null,keyboardPointer:null};

function defaultStorage():Pick<Storage,'getItem'|'setItem'>|null {
 try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}
}

export function readGameHighScores(storage:Pick<Storage,'getItem'>|null=defaultStorage()):GameHighScores {
 if(!storage)return {...EMPTY_HIGH_SCORES};
 try{
  const value=JSON.parse(storage.getItem(HIGH_SCORE_KEY)||'null');
  return {
   touch:Number.isFinite(value?.touch)&&value.touch>=0?value.touch:null,
   keyboardPointer:Number.isFinite(value?.keyboardPointer)&&value.keyboardPointer>=0?value.keyboardPointer:null
  };
 }catch{return {...EMPTY_HIGH_SCORES};}
}

export function recordGameHighScore(category:RunCategory,score:number,storage:Pick<Storage,'getItem'|'setItem'>|null=defaultStorage()):GameHighScores {
 const current=readGameHighScores(storage);
 const key=category==='touch'?'touch':'keyboardPointer';
 const settled=roundGameValue(score);
 const previous=current[key];
 const next=previous===null?settled:Math.max(previous,settled);
 const saved={...current,[key]:next};
 if(storage)storage.setItem(HIGH_SCORE_KEY,JSON.stringify(saved));
 return saved;
}
