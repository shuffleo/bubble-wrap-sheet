import {createGameClock} from './game-clock';
import {GAME_CONFIG,levelDefinition,shouldOpenShopAfterLevel} from './game-config';
import {createGameRng} from './game-rng';
import type {EncounterState,GamePhase,GameRunAction,GameSessionState,LevelId,ReduceOutcome,RunState} from './game-types';

type ActionType=GameRunAction['type'];
export const LEGAL_TRANSITIONS:Readonly<Record<GamePhase,readonly ActionType[]>>={
 'mode-select':['select-survival-run','reset'],
 'level-intro':['finish-level-intro','declare-run-lost','back-to-mode-select','reset'],
 'playing':['begin-sheet-transition','complete-level','declare-run-lost','reset'],
 'sheet-transition':['finish-sheet-transition','declare-run-lost','reset'],
 'shop':['leave-shop','back-to-mode-select','reset'],
 'run-won':['back-to-mode-select','reset'],
 'run-lost':['back-to-mode-select','reset']
};

function emptyStats(){return {manualPops:0,assistedPops:0,scoreEvents:0};}

function encounterFor(level:LevelId):EncounterState {
 const definition=levelDefinition(level);
 return {levelId:level,sheetIndex:0,sheetCount:definition.sheetCount,bubblesRemaining:0,hazardId:null,sheetHazardIds:[]};
}

function initialRun(seed:number):RunState {
 return {seed:seed>>>0,phase:'mode-select',category:null,level:1,score:0,upgrades:[],rerollUsed:false,secondWindUsesRemaining:GAME_CONFIG.upgrades.secondWind.usesPerRun,calibration:null,encounter:null,stats:emptyStats()};
}

export function initialSession(seed:number):GameSessionState {
 return {run:initialRun(seed),clock:createGameClock(),rng:createGameRng(seed)};
}

function accepted(state:GameSessionState):ReduceOutcome {
 return {accepted:true,state};
}

export function reduceSession(session:GameSessionState,action:GameRunAction):ReduceOutcome {
 const phase=session.run.phase;
 if(!LEGAL_TRANSITIONS[phase].includes(action.type))return {accepted:false,state:session,reason:`illegal-transition:${phase}:${action.type}`};
 if(action.type==='reset')return accepted(initialSession(action.seed));
 if(action.type==='back-to-mode-select')return accepted(initialSession(session.run.seed));
 if(action.type==='select-survival-run')return accepted({...session,run:{...session.run,phase:'level-intro',level:1,encounter:encounterFor(1)}});
 if(action.type==='finish-level-intro')return accepted({...session,run:{...session.run,phase:'playing'}});
 if(action.type==='begin-sheet-transition')return accepted({...session,run:{...session.run,phase:'sheet-transition'}});
 if(action.type==='finish-sheet-transition')return accepted({...session,run:{...session.run,phase:'playing'}});
 if(action.type==='declare-run-lost')return accepted({...session,run:{...session.run,phase:'run-lost',encounter:null}});
 if(action.type==='leave-shop'){
  const level=(session.run.level+1) as LevelId;
  return accepted({...session,run:{...session.run,phase:'level-intro',level,rerollUsed:false,encounter:encounterFor(level)}});
 }
 if(action.type==='complete-level'){
  if(session.run.level===5)return accepted({...session,run:{...session.run,phase:'run-won',encounter:null}});
  if(shouldOpenShopAfterLevel(session.run.level))return accepted({...session,run:{...session.run,phase:'shop',encounter:null}});
  const level=(session.run.level+1) as LevelId;
  return accepted({...session,run:{...session.run,phase:'level-intro',level,encounter:encounterFor(level)}});
 }
 return {accepted:false,state:session,reason:'unhandled-action'};
}
