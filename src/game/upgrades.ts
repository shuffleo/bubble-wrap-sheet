import type {GameBubbleSnapshot} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG,type UpgradeId} from './game-config';
import {nextInt,type GameRngState} from './game-rng';

export interface UpgradePopProc {
 upgrade:UpgradeId;
 index:number;
}

export interface UpgradeProcResolution {
 procs:UpgradePopProc[];
 rng:GameRngState;
}

export interface RoughTableResolution extends UpgradeProcResolution {
 elapsedMs:number;
}

/** Resolves direct assists after manual scoring. Assisted pops never call this
 * function, so upgrade effects cannot recurse into one another. */
export function resolveManualUpgradeProcs(input:{
 owned:readonly UpgradeId[];
 neighbours:readonly number[];
 bubbles:readonly GameBubbleSnapshot[];
 rng:GameRngState;
 comboCount?:number;
 encounterManualPops?:number;
 originIndex?:number;
}):UpgradeProcResolution {
 const procs:UpgradePopProc[]=[];
 let rng=input.rng;
 const available=new Set(input.bubbles.filter(bubble=>bubble.eligible&&!bubble.popped).map(bubble=>bubble.index));
 if(input.owned.includes('fatFinger')){
  const selected=selectRandomAvailable(input.neighbours,available,GAME_CONFIG.upgrades.fatFinger.neighbourCount,rng);
  rng=selected.rng;
  for(const index of selected.indices)procs.push({upgrade:'fatFinger',index});
 }
 if(input.owned.includes('knuckleCrack')&&(input.comboCount??0)>0&&(input.comboCount??0)%GAME_CONFIG.upgrades.knuckleCrack.manualComboInterval===0){
  const selected=selectRandomAvailable(input.neighbours,available,GAME_CONFIG.upgrades.knuckleCrack.neighbourCount,rng);
  rng=selected.rng;
  for(const index of selected.indices)procs.push({upgrade:'knuckleCrack',index});
 }
 if(input.owned.includes('staticDischarge')&&(input.encounterManualPops??0)>0&&(input.encounterManualPops??0)%GAME_CONFIG.upgrades.staticDischarge.manualPopInterval===0){
  const origin=input.bubbles.find(bubble=>bubble.index===input.originIndex);
  if(origin){
   const candidates=input.bubbles.filter(bubble=>available.has(bubble.index)&&Number.isFinite(bubble.x)&&Number.isFinite(bubble.y));
   const distances=candidates.map(bubble=>({index:bubble.index,distance:(bubble.x-origin.x)**2+(bubble.y-origin.y)**2}));
   const farthest=distances.reduce((maximum,candidate)=>Math.max(maximum,candidate.distance),-1);
   const ties=distances.filter(candidate=>candidate.distance===farthest);
   if(ties.length){
    const draw=ties.length===1?{state:rng,value:0}:nextInt(rng,0,ties.length-1);
    rng=draw.state;
    const index=ties[draw.value].index;
    available.delete(index);
    procs.push({upgrade:'staticDischarge',index});
   }
  }
 }
 return {procs,rng};
}

/** Advances Rough Table with active encounter time only. The caller excludes
 * transitions, menus, and hidden-tab time before supplying the delta. */
export function advanceRoughTable(input:{
 owned:readonly UpgradeId[];
 elapsedMs:number;
 activeDeltaMs:number;
 bubbles:readonly GameBubbleSnapshot[];
 rng:GameRngState;
 layout?:'static'|'conveyor';
}):RoughTableResolution {
 if(!input.owned.includes('roughTable'))return {elapsedMs:0,procs:[],rng:input.rng};
 const interval=GAME_CONFIG.upgrades.roughTable.intervalMs;
 let elapsedMs=Math.max(0,input.elapsedMs)+Math.max(0,input.activeDeltaMs);
 const triggerCount=Math.floor(elapsedMs/interval);
 if(triggerCount===0)return {elapsedMs,procs:[],rng:input.rng};
 elapsedMs%=interval;
 const available=new Set(input.bubbles.filter(bubble=>bubble.eligible&&!bubble.popped).map(bubble=>bubble.index));
 const candidates=input.layout==='conveyor'
  ?input.bubbles.filter(bubble=>available.has(bubble.index)).sort((a,b)=>b.x-a.x||a.index-b.index).map(bubble=>bubble.index)
  :[...available];
 const procs:UpgradePopProc[]=[];
 let rng=input.rng;
 for(let count=0;count<triggerCount&&candidates.length;count++){
  const draw=input.layout==='conveyor'?{state:rng,value:0}:nextInt(rng,0,candidates.length-1);
  rng=draw.state;
  const index=candidates.splice(draw.value,1)[0];
  available.delete(index);
  procs.push({upgrade:'roughTable',index});
 }
 return {elapsedMs,procs,rng};
}

function selectRandomAvailable(
 candidates:readonly number[],
 available:Set<number>,
 count:number,
 rng:GameRngState
):{indices:number[];rng:GameRngState} {
 const pool=[...new Set(candidates)].filter(index=>available.has(index));
 const indices:number[]=[];
 let state=rng;
 while(pool.length&&indices.length<count){
  const draw=nextInt(state,0,pool.length-1);
  state=draw.state;
  const index=pool.splice(draw.value,1)[0];
  available.delete(index);
  indices.push(index);
 }
 return {indices,rng:state};
}
