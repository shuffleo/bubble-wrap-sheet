import type {GameClockState} from './game-clock';
import type {GameRngState} from './game-rng';

export type GamePhase='mode-select'|'level-intro'|'playing'|'sheet-transition'|'shop'|'run-won'|'run-lost';
export type PopSource='manual'|'assisted'|'hazard'|'system';
export type InputKind='touch'|'pointer'|'keyboard';
export type RunCategory='touch'|'keyboard-pointer';
export type LevelId=1|2|3|4|5;

export interface GamePopEvent {
 bubbleId:string;
 sheetId:string;
 source:PopSource;
 input?:InputKind;
 gameTimeMs:number;
 position:{x:number;y:number};
 skill:'none'|'clean-sweep'|'hot-key';
 baseScore:number;
 firstScoredPop:boolean;
}

export interface CalibrationResult {
 popsPerSecond:number;
 sampledWindowMs:number;
}

export interface EncounterState {
 levelId:LevelId;
 sheetIndex:number;
 sheetCount:number;
 bubblesRemaining:number;
 hazardId:string|null;
}

export interface RunStats {
 manualPops:number;
 assistedPops:number;
 scoreEvents:number;
}

export interface RunState {
 seed:number;
 phase:GamePhase;
 category:RunCategory|null;
 level:LevelId;
 score:number;
 upgrades:string[];
 rerollUsed:boolean;
 calibration:CalibrationResult|null;
 encounter:EncounterState|null;
 stats:RunStats;
}

export interface GameSessionState {
 run:RunState;
 clock:GameClockState;
 rng:GameRngState;
}

export type GameRunAction=
 | {type:'reset';seed:number}
 | {type:'select-survival-run'}
 | {type:'back-to-mode-select'}
 | {type:'finish-level-intro'}
 | {type:'begin-sheet-transition'}
 | {type:'finish-sheet-transition'}
 | {type:'complete-level'}
 | {type:'leave-shop'}
 | {type:'declare-run-lost'};

export interface ReduceOutcome {
 accepted:boolean;
 state:GameSessionState;
 reason?:string;
}
