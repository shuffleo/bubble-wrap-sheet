import {GAME_CONFIG,levelDefinition} from './game-config';
import {planLevelSheets,type SheetPlan} from './sheet-plan';
import {initialSession,reduceSession} from './game-reducer';
import {EMPTY_COMBO,categoryForManualInput,chooseHotKeys,scoreAssistedPop,scoreManualPop,type ComboState,type ScoreInputKind,type ScoreSkill} from './scoring';
import type {GameRngState} from './game-rng';
import type {GameSessionState,RunCategory} from './game-types';

export interface LevelOneState {
 session:GameSessionState;
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
 breakdown:{base:number;cleanSweep:number;hotKey:number;assisted:number};
}

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
 const level=levelDefinition(1);
 const plans=planLevelSheets(1);
 const selected=reduceSession(initialSession(seed),{type:'select-survival-run'});
 const encounter=selected.state.run.encounter;
 const session=encounter?{...selected.state,run:{...selected.state.run,encounter:{...encounter,sheetHazardIds:plans[0]?.hazardIds??[]}}}:selected.state;
 return {
  session,
  sheet:1,
  sheets:level.sheetCount,
  size:level.bubbleSize,
  plans,
  combo:EMPTY_COMBO,
  hotKeys:[],
  category:null,
  gesture:null,
  cleared:false,
  prompt:true,
  rng:selected.state.rng,
  breakdown:{base:0,cleanSweep:0,hotKey:0,assisted:0}
 };
}

export function beginLevelOne(state:LevelOneState,keyCodes:readonly string[]):LevelOneState {
 const started=reduceSession(state.session,{type:'finish-level-intro'});
 if(!started.accepted)return state;
 const hot=chooseHotKeys(keyCodes,GAME_CONFIG.scoring.hotKeyTargetCount,state.rng);
 return {...state,session:started.state,hotKeys:hot.codes,rng:hot.state,prompt:true,gesture:null,combo:EMPTY_COMBO};
}

export function applyManualPop(state:LevelOneState,input:{
 now:number;
 input:ScoreInputKind;
 gestureId:string;
 index:number;
 neighbours:readonly number[];
 keyCode:string|null;
 availableKeyCodes:readonly string[];
}):{state:LevelOneState;notice:ManualPopNotice} {
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
  combo:state.combo
 });
 let hotKeys=state.hotKeys;
 let rng=state.rng;
 if(scored.skill==='hot-key'){
  const next=chooseHotKeys(input.availableKeyCodes,GAME_CONFIG.scoring.hotKeyTargetCount,rng,hotKeys);
  hotKeys=next.codes;
  rng=next.state;
 }
 const run=state.session.run;
 const session={...state.session,run:{...run,category,score:run.score+scored.points,stats:{...run.stats,manualPops:run.stats.manualPops+1,scoreEvents:run.stats.scoreEvents+1}}};
 const breakdown={
  ...state.breakdown,
  base:state.breakdown.base+GAME_CONFIG.scoring.normalBase,
  cleanSweep:state.breakdown.cleanSweep+(scored.skill==='clean-sweep'?GAME_CONFIG.scoring.skillBonus:0),
  hotKey:state.breakdown.hotKey+(scored.skill==='hot-key'?GAME_CONFIG.scoring.skillBonus:0)
 };
 const nextState={...state,session,combo:scored.combo,category,gesture:keyboard?state.gesture:gesture,hotKeys,rng,prompt:false,breakdown};
 return {state:nextState,notice:noticeOf(nextState,scored.points,scored.skill)};
}

export function applyAssistedPop(state:LevelOneState):{state:LevelOneState;points:number} {
 const points=scoreAssistedPop();
 const run=state.session.run;
 return {
  points,
  state:{...state,session:{...state.session,run:{...run,score:run.score+points,stats:{...run.stats,assistedPops:run.stats.assistedPops+1,scoreEvents:run.stats.scoreEvents+1}}},combo:state.combo,breakdown:{...state.breakdown,assisted:state.breakdown.assisted+points}}
 };
}

export function clearLevelCombo(state:LevelOneState):LevelOneState {
 return {...state,combo:EMPTY_COMBO};
}

export function noteSheetCleared(state:LevelOneState):{state:LevelOneState;kind:'next-sheet'|'cleared'} {
 if(state.sheet<state.sheets){
  const advanced=reduceSession(state.session,{type:'begin-sheet-transition'});
  const finished=reduceSession(advanced.state,{type:'finish-sheet-transition'});
  const sheet=state.sheet+1;
  return {kind:'next-sheet',state:placeOnSheet({...state,session:finished.state,gesture:null,combo:EMPTY_COMBO,prompt:false},sheet)};
 }
 const completed=reduceSession(state.session,{type:'complete-level'});
 return {kind:'cleared',state:{...state,session:completed.state,cleared:true,gesture:null,combo:EMPTY_COMBO,prompt:false}};
}

function placeOnSheet(state:LevelOneState,sheet:number):LevelOneState {
 const plan=state.plans[sheet-1];
 const encounter=state.session.run.encounter;
 const session=encounter?{...state.session,run:{...state.session.run,encounter:{...encounter,sheetIndex:sheet-1,sheetHazardIds:plan?.hazardIds??[]}}}:state.session;
 return {...state,session,sheet};
}

function nextGesture(current:LevelOneState['gesture'],id:string,index:number,neighbours:readonly number[]) {
 const same=current?.id===id?current:null;
 const ordinal=(same?.ordinal??0)+1;
 const adjacent=!!same&&neighbours.includes(same.lastIndex);
 return {id,lastIndex:index,ordinal,adjacent};
}

function noticeOf(state:LevelOneState,points:number,skill:ScoreSkill):ManualPopNotice {
 return {points,skill,total:state.session.run.score,category:state.category??'touch',hotKeys:state.hotKeys,combo:state.combo.count,prompt:state.prompt};
}
