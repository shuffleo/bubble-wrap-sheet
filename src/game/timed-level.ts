import {GAME_CONFIG} from './game-config';
import {roundGameValue} from './economy';
import type {LevelPlayState} from './level-one';
import type {CalibrationResult,RunCategory} from './game-types';

export interface CalibrationWindow {
 manualPops:number;
 durationMs:number;
 popsPerSecond:number;
}

export interface ActiveSegment {
 startMs:number;
 endMs:number;
 popTimes:number[];
}

export interface CalibrationSummary extends CalibrationResult {
 windows:CalibrationWindow[];
}

/** Collects manual-pop periods. Call endActivePeriod at transitions, pauses,
 * and visibility loss so those gaps never enter calibration. */
export class CalibrationCollector {
 private current:{startMs:number;popTimes:number[]}|null=null;
 private segments:ActiveSegment[]=[];

 recordManualPop(gameTimeMs:number):void {
  if(!Number.isFinite(gameTimeMs)||gameTimeMs<0)throw new Error('Calibration time must be finite and non-negative');
  if(!this.current)this.current={startMs:gameTimeMs,popTimes:[]};
  this.current.popTimes.push(gameTimeMs);
 }

 endActivePeriod(gameTimeMs:number):void {
  if(!this.current)return;
  const endMs=Math.max(this.current.startMs,gameTimeMs);
  this.segments.push({startMs:this.current.startMs,endMs,popTimes:[...this.current.popTimes]});
  this.current=null;
 }

 summarize(category:RunCategory,gameTimeMs:number):CalibrationSummary {
  this.endActivePeriod(gameTimeMs);
  return calibratePace(this.segments,category);
 }
}

export function calibratePace(segments:readonly ActiveSegment[],category:RunCategory):CalibrationSummary {
 const duration=GAME_CONFIG.calibration.activeWindowMs;
 const minimumPops=GAME_CONFIG.calibration.minimumManualPopsPerWindow;
 const windows:CalibrationWindow[]=[];
 for(const segment of segments){
  for(let start=segment.startMs;start+duration<=segment.endMs;start+=duration){
   const end=start+duration;
   const manualPops=segment.popTimes.filter(time=>time>=start&&time<end).length;
   if(manualPops>=minimumPops)windows.push({manualPops,durationMs:duration,popsPerSecond:manualPops/(duration/1000)});
  }
 }
 if(!windows.length){
  for(const segment of segments){
   const durationMs=segment.endMs-segment.startMs;
   if(durationMs<=0||segment.popTimes.length<minimumPops)continue;
   windows.push({manualPops:segment.popTimes.length,durationMs,popsPerSecond:segment.popTimes.length/(durationMs/1000)});
  }
 }
 const rates=windows.map(window=>window.popsPerSecond).sort((a,b)=>a-b);
 const middle=Math.floor(rates.length/2);
 const median=rates.length===0?categoryBounds(category).minimum:rates.length%2?rates[middle]:(rates[middle-1]+rates[middle])/2;
 const bounds=categoryBounds(category);
 return {
  popsPerSecond:Math.max(bounds.minimum,Math.min(bounds.maximum,median)),
  sampledWindowMs:windows.reduce((total,window)=>total+window.durationMs,0),
  windows
 };
}

export function softParMs(category:RunCategory,totalBubbles:number,sheetCount:number):number {
 const config=category==='touch'?GAME_CONFIG.categories.touch:GAME_CONFIG.categories.keyboardPointer;
 const popMs=Math.max(0,totalBubbles)*config.softParSecondsPerBubble*1000;
 return Math.ceil(popMs+transitionAllowanceMs(sheetCount));
}

export function calibratedDeadlineMs(totalBubbles:number,sheetCount:number,calibration:CalibrationResult):number {
 const activeMs=Math.max(0,totalBubbles)/Math.max(Number.EPSILON,calibration.popsPerSecond)*1000*GAME_CONFIG.calibration.hardDeadlineChallengeFactor;
 const proposed=activeMs+transitionAllowanceMs(sheetCount);
 const minimum=GAME_CONFIG.calibration.hardDeadlineMinSeconds*1000;
 const maximum=GAME_CONFIG.calibration.hardDeadlineMaxSeconds*1000;
 return Math.ceil(Math.max(minimum,Math.min(maximum,proposed)));
}

export interface TimeSettlement {
 subtotal:number;
 multiplier:number;
 bonus:number;
 total:number;
 remainingMs:number;
}

export interface SecondWindResolution {
 triggered:boolean;
 totalMs:number;
 usesRemaining:number;
}

export function resolveSecondWind(input:{
 totalMs:number;
 elapsedMs:number;
 owned:boolean;
 usesRemaining:number;
 hardTimer:boolean;
}):SecondWindResolution {
 const addedMs=GAME_CONFIG.upgrades.secondWind.addedSeconds*1000;
 const canPreventFailure=input.hardTimer
  &&input.owned
  &&input.usesRemaining>0
  &&input.elapsedMs>=input.totalMs
  &&input.elapsedMs<input.totalMs+addedMs;
 return canPreventFailure
  ?{triggered:true,totalMs:input.totalMs+addedMs,usesRemaining:input.usesRemaining-1}
  :{triggered:false,totalMs:input.totalMs,usesRemaining:input.usesRemaining};
}

export function remainingTimeSettlement(subtotal:number,totalMs:number,elapsedMs:number):TimeSettlement {
 const remainingMs=Math.max(0,totalMs-elapsedMs);
 const fraction=totalMs>0?remainingMs/totalMs:0;
 const multiplier=1+(GAME_CONFIG.scoring.remainingTimeMaxMultiplier-1)*fraction;
 const total=roundGameValue(Math.max(0,subtotal)*multiplier);
 const rawBonus=Math.max(0,total-subtotal);
 const bonus=rawBonus===0?0:roundGameValue(rawBonus);
 return {subtotal,multiplier,bonus,total,remainingMs};
}

export function settleTimedLevel(state:LevelPlayState,totalMs:number,elapsedMs:number):{state:LevelPlayState;settlement:TimeSettlement} {
 const subtotal=state.session.run.score-state.startScore;
 const settlement=remainingTimeSettlement(subtotal,totalMs,elapsedMs);
 const run=state.session.run;
 const session={...state.session,run:{...run,score:run.score+settlement.bonus}};
 return {state:{...state,session,breakdown:{...state.breakdown,remainingTime:state.breakdown.remainingTime+settlement.bonus}},settlement};
}

export function withCalibration(state:LevelPlayState,calibration:CalibrationResult):LevelPlayState {
 return {...state,session:{...state.session,run:{...state.session.run,calibration}}};
}

function categoryBounds(category:RunCategory):{minimum:number;maximum:number} {
 const config=category==='touch'?GAME_CONFIG.categories.touch:GAME_CONFIG.categories.keyboardPointer;
 return {minimum:config.calibrationMinPopsPerSecond,maximum:config.calibrationMaxPopsPerSecond};
}

function transitionAllowanceMs(sheetCount:number):number {
 return Math.max(0,sheetCount-1)*GAME_CONFIG.calibration.sheetTransitionAllowanceSeconds*1000;
}
