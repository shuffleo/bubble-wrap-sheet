const HIGH_SCORE_KEY='bubble-survival-high-scores-v1';
export interface GameHighScores {touch:number|null;keyboardPointer:number|null;}
export const EMPTY_HIGH_SCORES:GameHighScores={touch:null,keyboardPointer:null};

export function readGameHighScores(storage:Pick<Storage,'getItem'>|null=typeof localStorage==='undefined'?null:localStorage):GameHighScores {
 if(!storage)return {...EMPTY_HIGH_SCORES};
 try{
  const value=JSON.parse(storage.getItem(HIGH_SCORE_KEY)||'null');
  return {
   touch:Number.isFinite(value?.touch)&&value.touch>=0?value.touch:null,
   keyboardPointer:Number.isFinite(value?.keyboardPointer)&&value.keyboardPointer>=0?value.keyboardPointer:null
  };
 }catch{return {...EMPTY_HIGH_SCORES};}
}
