import {levelDefinition} from './game-config';
import type {LevelId} from './game-types';

/** One sheet inside a level. Hazard ids stay empty until a variant assigns them. */
export interface SheetPlan {
 index:number;
 bubbleSize:string;
 hazardIds:readonly string[];
}

/** Plans are fixed when the level starts so a seeded run can be replayed.
 * A later per-sheet hazard variant changes this function only. */
export function planLevelSheets(levelId:LevelId):SheetPlan[] {
 const level=levelDefinition(levelId);
 return Array.from({length:level.sheetCount},(_,index)=>({
  index:index+1,
  bubbleSize:level.bubbleSize,
  hazardIds:[]
 }));
}
