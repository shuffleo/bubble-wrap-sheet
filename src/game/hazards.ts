import type {GameBubbleSnapshot} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG,type HazardId} from './game-config';
import {nextInt,pickWeighted,type GameRngState} from './game-rng';

/** Stage F checkpoint pool. Hardened Bubbles and Drunken Bob join this list
 * only when their input mechanics are implemented. */
export const LIVE_LEVEL_FOUR_HAZARDS:readonly HazardId[]=['doubleLayer','memoryFoam'];

export interface HazardSelection {
 hazardId:HazardId;
 rng:GameRngState;
}

export interface DoubleLayerAssignment {
 indices:number[];
 rng:GameRngState;
}

export interface MemoryFoamState {
 untilNextMs:number;
 warningIndex:number|null;
 warningRemainingMs:number;
}

export interface MemoryFoamResolution {
 state:MemoryFoamState;
 rng:GameRngState;
 warnedIndex:number|null;
 reinflateIndex:number|null;
}

export function selectLevelFourHazard(rng:GameRngState):HazardSelection {
 const weights=Object.fromEntries(
  LIVE_LEVEL_FOUR_HAZARDS.map(id=>[id,GAME_CONFIG.hazards.selectionWeights[id]])
 ) as Record<HazardId,number>;
 const selected=pickWeighted(rng,weights);
 return {hazardId:selected.value,rng:selected.state};
}

export function hazardDeadlineMultiplier(hazardId:HazardId|null):number {
 if(hazardId==='doubleLayer')return GAME_CONFIG.hazards.doubleLayer.deadlineWorkloadMultiplier;
 if(hazardId==='memoryFoam')return GAME_CONFIG.hazards.memoryFoam.deadlineWorkloadMultiplier;
 if(hazardId==='hardenedBubbles')return GAME_CONFIG.hazards.hardenedBubbles.deadlineWorkloadMultiplier;
 if(hazardId==='drunkenBob')return GAME_CONFIG.hazards.drunkenBob.deadlineWorkloadMultiplier;
 return 1;
}

export function assignDoubleLayers(bubbles:readonly GameBubbleSnapshot[],rng:GameRngState):DoubleLayerAssignment {
 const pool=bubbles.filter(bubble=>bubble.eligible&&!bubble.popped).map(bubble=>bubble.index);
 const count=Math.min(pool.length,Math.ceil(pool.length*GAME_CONFIG.hazards.doubleLayer.bubbleRatio));
 let state=rng;
 const indices:number[]=[];
 while(indices.length<count&&pool.length){
  const draw=nextInt(state,0,pool.length-1);
  state=draw.state;
  indices.push(pool.splice(draw.value,1)[0]);
 }
 return {indices,rng:state};
}

export function createMemoryFoamState():MemoryFoamState {
 return {untilNextMs:GAME_CONFIG.hazards.memoryFoam.intervalMs,warningIndex:null,warningRemainingMs:0};
}

/** Advances only with active encounter time supplied by the caller. */
export function advanceMemoryFoam(input:{
 state:MemoryFoamState;
 activeDeltaMs:number;
 bubbles:readonly GameBubbleSnapshot[];
 rng:GameRngState;
}):MemoryFoamResolution {
 const delta=Math.max(0,input.activeDeltaMs);
 if(input.state.warningIndex!==null){
  const warningRemainingMs=input.state.warningRemainingMs-delta;
  if(warningRemainingMs>0)return {
   state:{...input.state,warningRemainingMs},
   rng:input.rng,
   warnedIndex:null,
   reinflateIndex:null
  };
  return {
   state:createMemoryFoamState(),
   rng:input.rng,
   warnedIndex:null,
   reinflateIndex:input.state.warningIndex
  };
 }
 const untilNextMs=input.state.untilNextMs-delta;
 if(untilNextMs>0)return {
  state:{...input.state,untilNextMs},
  rng:input.rng,
  warnedIndex:null,
  reinflateIndex:null
 };
 const popped=input.bubbles.filter(bubble=>bubble.eligible&&bubble.popped);
 if(!popped.length)return {state:createMemoryFoamState(),rng:input.rng,warnedIndex:null,reinflateIndex:null};
 const draw=nextInt(input.rng,0,popped.length-1);
 const warningIndex=popped[draw.value].index;
 const warningRemainingMs=Math.max(0,GAME_CONFIG.hazards.memoryFoam.warningMs+untilNextMs);
 if(warningRemainingMs===0)return {
  state:createMemoryFoamState(),
  rng:draw.state,
  warnedIndex:warningIndex,
  reinflateIndex:warningIndex
 };
 return {
  state:{untilNextMs:0,warningIndex,warningRemainingMs},
  rng:draw.state,
  warnedIndex:warningIndex,
  reinflateIndex:null
 };
}
