import {GAME_CONFIG,type UpgradeId} from './game-config';
import {nextInt,type GameRngState} from './game-rng';

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

/** Advances spawn scheduling from active game time. Lane values are seeded,
 * normalized coordinates; rendering and moving hit tests stay in the engine. */
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
 let nextSpawnAtMs=input.state.nextSpawnAtMs,state=input.rng;
 const spawnLanes:number[]=[];
 while(nextSpawnAtMs<=elapsedMs&&nextSpawnAtMs<spawnCutoff){
  const lane=nextInt(state,0,9999);
  state=lane.state;
  spawnLanes.push(lane.value/9999);
  nextSpawnAtMs+=GAME_CONFIG.conveyor.spawnIntervalMs;
 }
 return {
  state:{
   ...input.state,
   elapsedMs,
   nextSpawnAtMs,
   totalSpawned:input.state.totalSpawned+spawnLanes.length,
   finished:elapsedMs>=GAME_CONFIG.conveyor.durationMs
  },
  rng:state,
  spawnLanes,
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
