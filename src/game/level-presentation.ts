import {formatGameCurrency,formatGameNumber} from './economy';
import {GAME_CONFIG,levelDefinition} from './game-config';
import type {LevelId} from './game-types';

export const MEDAL_NAMES=['bronze','silver','gold','titanium'] as const;
export type MedalName=typeof MEDAL_NAMES[number];
export type MedalMetric='score'|'timeSeconds'|'clearancePercent';

export interface MedalTarget {
 name:MedalName;
 value:number;
 label:string;
}

export interface UpcomingLevel {
 id:LevelId;
 name:string;
 goal:string;
 hazard:string;
 medals:MedalTarget[];
}

export function formatDuration(milliseconds:number):string {
 const safe=Math.max(0,Number.isFinite(milliseconds)?milliseconds:0);
 const centiseconds=Math.ceil(safe/10);
 const minutes=Math.floor(centiseconds/6000);
 const seconds=Math.floor(centiseconds/100)%60;
 const fraction=centiseconds%100;
 return `${minutes}:${String(seconds).padStart(2,'0')}.${String(fraction).padStart(2,'0')}`;
}

export function medalTargets(levelId:LevelId):MedalTarget[] {
 const medals=levelDefinition(levelId).medals;
 return MEDAL_NAMES.map(name=>({name,value:medals[name],label:formatMedalValue(medals.metric,medals[name])}));
}

export function awardedMedal(levelId:LevelId,value:number):MedalName|null {
 if(!Number.isFinite(value))return null;
 const medals=levelDefinition(levelId).medals;
 const achieved=(target:number)=>medals.metric==='timeSeconds'?value<=target:value>=target;
 let award:MedalName|null=null;
 for(const name of MEDAL_NAMES)if(achieved(medals[name]))award=name;
 return award;
}

export function nextMedal(levelId:LevelId,value:number):{name:MedalName;gap:string}|null {
 const level=levelDefinition(levelId);
 const current=awardedMedal(levelId,value);
 const nextIndex=current===null?0:MEDAL_NAMES.indexOf(current)+1;
 const name=MEDAL_NAMES[nextIndex];
 if(!name)return null;
 const target=level.medals[name];
 if(level.medals.metric==='timeSeconds')return {name,gap:`${formatDuration(Math.max(0,(value-target)*1000))} faster`};
 if(level.medals.metric==='clearancePercent')return {name,gap:`${formatGameNumber(Math.max(0,target-value))}% more`};
 return {name,gap:`${formatGameCurrency(Math.max(0,target-value))} more`};
}

export function levelGoal(levelId:LevelId):string {
 const level=levelDefinition(levelId);
 if(level.timer==='conveyor')return `Pop at least ${formatGameNumber(GAME_CONFIG.conveyor.clearanceTarget*100)}%`;
 const sheets=Number(level.sheetCount);
 return `Clear ${sheets} ${level.bubbleSize}-size ${sheets===1?'sheet':'sheets'}`;
}

export function levelHazardPreview(levelId:LevelId):string {
 const level=levelDefinition(levelId);
 if(level.id===1)return 'No hazard · learn Clean Sweep and Hot Keys';
 if(level.id===2)return 'Soft timer · establishes your pace';
 if(level.id===3)return 'Hard deadline · no hazard';
 if(level.id===4)return 'One seeded hazard per sheet';
 return `Conveyor · missed bubbles cost ${formatGameCurrency(GAME_CONFIG.conveyor.missScorePenalty)}`;
}

export function upcomingLevels(current:LevelId,count=3):UpcomingLevel[] {
 return GAME_CONFIG.run.levels
  .filter(level=>level.id>current)
  .slice(0,count)
  .map(level=>({
   id:level.id as LevelId,
   name:level.name,
   goal:levelGoal(level.id as LevelId),
   hazard:levelHazardPreview(level.id as LevelId),
   medals:medalTargets(level.id as LevelId)
  }));
}

function formatMedalValue(metric:MedalMetric,value:number):string {
 if(metric==='timeSeconds')return formatDuration(value*1000);
 if(metric==='clearancePercent')return `${formatGameNumber(value)}%`;
 return formatGameCurrency(value);
}
