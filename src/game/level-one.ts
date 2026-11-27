import {GAME_CONFIG,levelDefinition,type HazardId,type UpgradeId} from './game-config';
import {planLevelSheets,type SheetPlan} from './sheet-plan';
import {initialSession,reduceSession} from './game-reducer';
import {EMPTY_COMBO,categoryForManualInput,chooseHotKeys,scoreAssistedPop,scoreManualPop,type ComboState,type ScoreInputKind,type ScoreSkill} from './scoring';
import type {GameRngState} from './game-rng';
import type {GameSessionState,LevelId,RunCategory} from './game-types';
import {selectLevelFourHazard} from './hazards';

export interface LevelPlayState {
 session:GameSessionState;
 levelId:LevelId;
 startScore:number;
 sheet:number;
 sheets:number;
 size:string;
 plans:readonly SheetPlan[];
 combo:ComboState;
 hotKeys:string[];
 category:RunCategory|null;
 gesture:{id:string;lastIndex:number;ordinal:number}|null;
 cleared:boolean;
 prompt:boolean;
 rng:GameRngState;
 encounterManualPops:number;
 manualPopTimes:number[];
 currentVelocityMultiplier:number;
 currentDeadlineMultiplier:number;
 scoredBubbleKeys:Set<string>;
 breakdown:{base:number;cleanSweep:number;hotKey:number;sureHands:number;velocityBoost:number;deadlineBoost:number;assisted:number;assistedByUpgrade:Partial<Record<UpgradeId,number>>;remainingTime:number;penalty:number};
}
export type LevelOneState=LevelPlayState;

export interface ManualPopNotice {
 points:number;
 skill:ScoreSkill;
 total:number;
 category:RunCategory;
 hotKeys:string[];
 combo:number;
 prompt:boolean;
}

export function createLevelOne(seed:number):LevelOneState {
 const selected=reduceSession(initialSession(seed),{type:'select-survival-run'});
 return createLevelState(selected.state,1);
}

export function createLevelState(source:GameSessionState,levelId:LevelId):LevelPlayState {
 const level=levelDefinition(levelId);
 let session=source;
 let encounter=source.run.encounter;
 let hazardId=encounter?.hazardId as HazardId|null|undefined;
 if(levelId===4&&!hazardId){
  const selected=selectLevelFourHazard(source.rng);
  hazardId=selected.hazardId;
  encounter=encounter?{...encounter,hazardId}:encounter;
  session={...source,rng:selected.rng,run:{...source.run,encounter}};
 }
 const plans=planLevelSheets(levelId,hazardId??null);
 if(encounter)session={...session,run:{...session.run,encounter:{...encounter,sheetHazardIds:plans[0]?.hazardIds??[]}}};
 return {
  session,
  levelId,
  startScore:session.run.score,
  sheet:1,
  sheets:level.sheetCount,
  size:level.bubbleSize,
  plans,
  combo:EMPTY_COMBO,
  hotKeys:[],
  category:session.run.category,
  gesture:null,
  cleared:false,
  prompt:true,
  rng:session.rng,
  encounterManualPops:0,
  manualPopTimes:[],
  currentVelocityMultiplier:1,
  currentDeadlineMultiplier:1,
  scoredBubbleKeys:new Set(),
  breakdown:{base:0,cleanSweep:0,hotKey:0,sureHands:0,velocityBoost:0,deadlineBoost:0,assisted:0,assistedByUpgrade:{},remainingTime:0,penalty:0}
 };
}

export function beginLevelOne(state:LevelOneState,keyCodes:readonly string[]):LevelOneState {
 return beginLevel(state,keyCodes);
}

export function beginLevel(state:LevelPlayState,keyCodes:readonly string[]):LevelPlayState {
 const started=reduceSession(state.session,{type:'finish-level-intro'});
 if(!started.accepted)return state;
 const hot=chooseHotKeys(keyCodes,GAME_CONFIG.scoring.hotKeyTargetCount,state.rng);
 return {...state,session:started.state,hotKeys:hot.codes,rng:hot.state,prompt:true,gesture:null,combo:EMPTY_COMBO};
}

export function applyManualPop(state:LevelPlayState,input:{
 now:number;
 input:ScoreInputKind;
 gestureId:string;
 index:number;
 neighbours:readonly number[];
 keyCode:string|null;
 availableKeyCodes:readonly string[];
 hardDeadline?:{totalMs:number;elapsedMs:number}|null;
 firstScoredPop?:boolean;
 skillEligible?:boolean;
 baseScore?:number;
}):{state:LevelPlayState;notice:ManualPopNotice} {
 if(state.cleared||state.session.run.phase!=='playing')return {state,notice:noticeOf(state,0,'none')};
 const category=state.category??categoryForManualInput(input.input);
 const keyboard=input.input==='keyboard';
 const gesture=keyboard?null:nextGesture(state.gesture,input.gestureId,input.index,input.neighbours);
 const scored=scoreManualPop({
  now:input.now,
  input:input.input,
  gestureOrdinal:gesture?.ordinal??1,
  adjacent:gesture?gesture.adjacent:false,
  hotKey:keyboard&&!!input.keyCode&&state.hotKeys.includes(input.keyCode),
  combo:state.combo,
  owned:state.session.run.upgrades as UpgradeId[],
  manualPopTimes:state.manualPopTimes,
  hardDeadline:input.hardDeadline,
  scoreEligible:input.firstScoredPop!==false,
  skillEligible:input.skillEligible,
  baseScore:input.baseScore
 });
 let hotKeys=state.hotKeys;
 let rng=state.rng;
 if(scored.skill==='hot-key'){
  const next=chooseHotKeys(input.availableKeyCodes,GAME_CONFIG.scoring.hotKeyTargetCount,rng,hotKeys);
  hotKeys=next.codes;
  rng=next.state;
 }
 const run=state.session.run;
 const session={...state.session,run:{...run,category,score:run.score+scored.points,stats:{...run.stats,manualPops:run.stats.manualPops+1,totalBubbles:run.stats.totalBubbles+1,highestCombo:Math.max(run.stats.highestCombo,scored.combo.count),scoreEvents:run.stats.scoreEvents+1}}};
 const breakdown={
  ...state.breakdown,
  base:state.breakdown.base+(input.firstScoredPop===false?0:input.baseScore??GAME_CONFIG.scoring.normalBase),
  cleanSweep:state.breakdown.cleanSweep+(input.firstScoredPop!==false&&scored.skill==='clean-sweep'?GAME_CONFIG.scoring.skillBonus:0),
  hotKey:state.breakdown.hotKey+(input.firstScoredPop!==false&&scored.skill==='hot-key'?GAME_CONFIG.scoring.skillBonus:0),
  sureHands:state.breakdown.sureHands+scored.sureHandsBonus,
  velocityBoost:state.breakdown.velocityBoost+scored.velocityBoost,
  deadlineBoost:state.breakdown.deadlineBoost+scored.deadlineBoost
 };
 const manualPopTimes=[...state.manualPopTimes,input.now].filter(time=>time>=input.now-GAME_CONFIG.scoring.velocity.windowMs);
 const nextState={...state,session,combo:scored.combo,category,gesture:keyboard?state.gesture:gesture,hotKeys,rng,prompt:false,encounterManualPops:state.encounterManualPops+1,manualPopTimes,currentVelocityMultiplier:scored.velocityMultiplier,currentDeadlineMultiplier:scored.deadlineMultiplier,breakdown};
 return {state:nextState,notice:noticeOf(nextState,scored.points,scored.skill)};
}

export function applyAssistedPop(state:LevelPlayState,upgrade?:UpgradeId,firstScoredPop=true):{state:LevelPlayState;points:number} {
 const points=firstScoredPop?scoreAssistedPop():0;
 const run=state.session.run;
 const assistedByUpgrade=upgrade
  ?{...state.breakdown.assistedByUpgrade,[upgrade]:(state.breakdown.assistedByUpgrade[upgrade]??0)+points}
  :state.breakdown.assistedByUpgrade;
 return {
  points,
  state:{...state,session:{...state.session,run:{...run,score:run.score+points,stats:{...run.stats,assistedPops:run.stats.assistedPops+1,totalBubbles:run.stats.totalBubbles+1,scoreEvents:run.stats.scoreEvents+1}}},combo:state.combo,breakdown:{...state.breakdown,assisted:state.breakdown.assisted+points,assistedByUpgrade}}
 };
}

export function clearLevelCombo(state:LevelPlayState):LevelPlayState {
 return {...state,combo:EMPTY_COMBO,currentVelocityMultiplier:1,currentDeadlineMultiplier:1};
}

export function noteSheetCleared(state:LevelPlayState):{state:LevelPlayState;kind:'next-sheet'|'cleared'} {
 if(state.sheet<state.sheets){
  const advanced=reduceSession(state.session,{type:'begin-sheet-transition'});
  const finished=reduceSession(advanced.state,{type:'finish-sheet-transition'});
  const sheet=state.sheet+1;
  return {kind:'next-sheet',state:placeOnSheet({...state,session:finished.state,gesture:null,combo:EMPTY_COMBO,currentVelocityMultiplier:1,currentDeadlineMultiplier:1,prompt:false},sheet)};
 }
 const completed=reduceSession(state.session,{type:'complete-level'});
 return {kind:'cleared',state:{...state,session:completed.state,cleared:true,gesture:null,combo:EMPTY_COMBO,currentVelocityMultiplier:1,currentDeadlineMultiplier:1,prompt:false}};
}

function placeOnSheet(state:LevelPlayState,sheet:number):LevelPlayState {
 const plan=state.plans[sheet-1];
 const encounter=state.session.run.encounter;
 const session=encounter?{...state.session,run:{...state.session.run,encounter:{...encounter,sheetIndex:sheet-1,sheetHazardIds:plan?.hazardIds??[]}}}:state.session;
 return {...state,session,sheet};
}

function nextGesture(current:LevelPlayState['gesture'],id:string,index:number,neighbours:readonly number[]) {
 const same=current?.id===id?current:null;
 const ordinal=(same?.ordinal??0)+1;
 const adjacent=!!same&&neighbours.includes(same.lastIndex);
 return {id,lastIndex:index,ordinal,adjacent};
}

function noticeOf(state:LevelPlayState,points:number,skill:ScoreSkill):ManualPopNotice {
 return {points,skill,total:state.session.run.score,category:state.category??'touch',hotKeys:state.hotKeys,combo:state.combo.count,prompt:state.prompt};
}
