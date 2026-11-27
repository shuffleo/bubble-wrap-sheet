import {GAME_CONFIG,type UpgradeId} from './game-config';
import type {GameRngState} from './game-rng';

export interface ConveyorState {
 elapsedMs:number;
 nextSpawnAtMs:number;
 totalSpawned:number;
 popped:number;
 missed:number;
 insuredMisses:number;
 finished:boolean;
}

export interface ConveyorAdvance {
 state:ConveyorState;
 rng:GameRngState;
 spawnLanes:number[];
 speedMultiplier:number;
}

export function createConveyorState():ConveyorState {
 return {elapsedMs:0,nextSpawnAtMs:0,totalSpawned:0,popped:0,missed:0,insuredMisses:0,finished:false};
}

export function conveyorSpeedMultiplier(elapsedMs:number):number {
 let multiplier:number=GAME_CONFIG.conveyor.speedStages[0].multiplier;
 for(const stage of GAME_CONFIG.conveyor.speedStages){
  if(elapsedMs<stage.atMs)break;
  multiplier=stage.multiplier;
 }
 return multiplier;
}

/** Advances the conveyor clock. The engine owns the continuous sheet, so this
 * no longer chooses random lanes. */
export function advanceConveyor(input:{
 state:ConveyorState;
 activeDeltaMs:number;
 rng:GameRngState;
}):ConveyorAdvance {
 if(input.state.finished)return {
  state:input.state,
  rng:input.rng,
  spawnLanes:[],
  speedMultiplier:conveyorSpeedMultiplier(input.state.elapsedMs)
 };
 const elapsedMs=Math.min(GAME_CONFIG.conveyor.durationMs,input.state.elapsedMs+Math.max(0,input.activeDeltaMs));
 const spawnCutoff=GAME_CONFIG.conveyor.durationMs-GAME_CONFIG.conveyor.cleanupWindowMs;
 const nextSpawnAtMs=elapsedMs<spawnCutoff?elapsedMs:Math.max(input.state.nextSpawnAtMs,spawnCutoff);
 return {
  state:{
   ...input.state,
   elapsedMs,
   nextSpawnAtMs,
   finished:elapsedMs>=GAME_CONFIG.conveyor.durationMs
  },
  rng:input.rng,
  spawnLanes:[],
  speedMultiplier:conveyorSpeedMultiplier(elapsedMs)
 };
}

export function recordConveyorPop(state:ConveyorState):ConveyorState {
 return {...state,popped:Math.min(state.totalSpawned,state.popped+1)};
}

export function recordConveyorMiss(state:ConveyorState,owned:readonly UpgradeId[]):{state:ConveyorState;insured:boolean} {
 const canInsure=owned.includes('bubbleInsurance')&&state.insuredMisses<GAME_CONFIG.upgrades.bubbleInsurance.insuredMisses;
 return {
  insured:canInsure,
  state:{
   ...state,
   missed:state.missed+1,
   insuredMisses:state.insuredMisses+(canInsure?1:0)
  }
 };
}

export function conveyorClearance(state:ConveyorState):number {
 return state.totalSpawned>0?Math.min(1,(state.popped+state.insuredMisses)/state.totalSpawned):0;
}
