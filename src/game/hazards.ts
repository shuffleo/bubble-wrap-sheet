import type {GameBubbleSnapshot} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG,type HazardId} from './game-config';
import {nextInt,pickWeighted,type GameRngState} from './game-rng';

/** Completed Stage F pool. A seeded run selects one hazard for all three sheets. */
export const LIVE_LEVEL_FOUR_HAZARDS:readonly HazardId[]=['doubleLayer','memoryFoam','hardenedBubbles','drunkenBob'];

export interface HazardSelection {
 hazardId:HazardId;
 rng:GameRngState;
}

export interface DoubleLayerAssignment {
 indices:number[];
 rng:GameRngState;
}

export interface HardenedBubbleAssignment {
 indices:number[];
 rng:GameRngState;
}

export interface DrunkenBobState {
 failedRolls:number;
}

export interface DrunkenBobResolution {
 state:DrunkenBobState;
 rng:GameRngState;
 targetIndex:number|null;
 madeProgress:boolean;
 pity:boolean;
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
 return assignBubbleRatio(bubbles,GAME_CONFIG.hazards.doubleLayer.bubbleRatio,rng);
}

export function assignHardenedBubbles(bubbles:readonly GameBubbleSnapshot[],rng:GameRngState):HardenedBubbleAssignment {
 return assignBubbleRatio(bubbles,GAME_CONFIG.hazards.hardenedBubbles.bubbleRatio,rng);
}

function assignBubbleRatio(bubbles:readonly GameBubbleSnapshot[],ratio:number,rng:GameRngState):DoubleLayerAssignment {
 const pool=bubbles.filter(bubble=>bubble.eligible&&!bubble.popped).map(bubble=>bubble.index);
 const count=Math.min(pool.length,Math.ceil(pool.length*ratio));
 let state=rng;
 const indices:number[]=[];
 while(indices.length<count&&pool.length){
  const draw=nextInt(state,0,pool.length-1);
  state=draw.state;
  indices.push(pool.splice(draw.value,1)[0]);
 }
 return {indices,rng:state};
}

export function createDrunkenBobState():DrunkenBobState {
 return {failedRolls:0};
}

/** Resolves one valid manual source-cell input. Ordinary rolls include popped
 * positions; after the configured failure cap, pity draws from unpopped cells. */
export function resolveDrunkenBobInput(input:{
 state:DrunkenBobState;
 bubbles:readonly GameBubbleSnapshot[];
 rng:GameRngState;
}):DrunkenBobResolution {
 const eligible=input.bubbles.filter(bubble=>bubble.eligible);
 const unpopped=eligible.filter(bubble=>!bubble.popped);
 if(!eligible.length||!unpopped.length)return {
  state:input.state,
  rng:input.rng,
  targetIndex:null,
  madeProgress:false,
  pity:false
 };
 const pity=input.state.failedRolls>=GAME_CONFIG.hazards.drunkenBob.maximumFailedRolls;
 const pool=pity?unpopped:eligible;
 const draw=nextInt(input.rng,0,pool.length-1);
 const target=pool[draw.value];
 const madeProgress=!target.popped;
 return {
  state:{failedRolls:madeProgress?0:input.state.failedRolls+1},
  rng:draw.state,
  targetIndex:target.index,
  madeProgress,
  pity
 };
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
