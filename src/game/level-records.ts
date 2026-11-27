import {roundGameValue} from './economy';
import type {LevelId} from './game-types';

const LEVEL_RECORDS_KEY='bubble-survival-level-records-v1';

export interface LevelRecord {
 bestTimeMs:number|null;
 bestScore:number|null;
}

export type LevelRecords=Partial<Record<LevelId,LevelRecord>>;

function defaultStorage():Pick<Storage,'getItem'|'setItem'>|null {
 try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}
}

export function readLevelRecords(storage:Pick<Storage,'getItem'>|null=defaultStorage()):LevelRecords {
 if(!storage)return {};
 try{
  const value=JSON.parse(storage.getItem(LEVEL_RECORDS_KEY)||'null');
  if(!value||typeof value!=='object')return {};
  const records:LevelRecords={};
  for(const rawId of Object.keys(value)){
   const id=Number(rawId) as LevelId;
   if(!Number.isInteger(id)||id<1||id>5)continue;
   const candidate=value[rawId];
   const bestTimeMs=Number.isFinite(candidate?.bestTimeMs)&&candidate.bestTimeMs>=0?candidate.bestTimeMs:null;
   const bestScore=Number.isFinite(candidate?.bestScore)&&candidate.bestScore>=0?candidate.bestScore:null;
   if(bestTimeMs!==null||bestScore!==null)records[id]={bestTimeMs,bestScore};
  }
  return records;
 }catch{return {};}
}

export function recordLevelResult(levelId:LevelId,result:{timeMs:number;score:number},storage:Pick<Storage,'getItem'|'setItem'>|null=defaultStorage()):LevelRecords {
 const records=readLevelRecords(storage);
 const previous=records[levelId];
 const timeMs=Math.max(0,Math.ceil(result.timeMs));
 const score=roundGameValue(result.score);
 const next:LevelRecord={
  bestTimeMs:previous?.bestTimeMs===null||previous?.bestTimeMs===undefined?timeMs:Math.min(previous.bestTimeMs,timeMs),
  bestScore:previous?.bestScore===null||previous?.bestScore===undefined?score:Math.max(previous.bestScore,score)
 };
 const saved={...records,[levelId]:next};
 if(storage)storage.setItem(LEVEL_RECORDS_KEY,JSON.stringify(saved));
 return saved;
}
