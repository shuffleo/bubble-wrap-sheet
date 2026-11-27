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

/** Resolves direct assists after manual scoring. Assisted pops never call this
 * function, so upgrade effects cannot recurse into one another. */
export function resolveManualUpgradeProcs(input:{
 owned:readonly UpgradeId[];
 neighbours:readonly number[];
 bubbles:readonly GameBubbleSnapshot[];
 rng:GameRngState;
}):UpgradeProcResolution {
 const procs:UpgradePopProc[]=[];
 let rng=input.rng;
 if(input.owned.includes('fatFinger')){
  const available=new Set(input.bubbles.filter(bubble=>bubble.eligible&&!bubble.popped).map(bubble=>bubble.index));
  const neighbours=input.neighbours.filter(index=>available.has(index));
  while(neighbours.length&&procs.length<GAME_CONFIG.upgrades.fatFinger.neighbourCount){
   const draw=nextInt(rng,0,neighbours.length-1);
   rng=draw.state;
   procs.push({upgrade:'fatFinger',index:neighbours.splice(draw.value,1)[0]});
  }
 }
 return {procs,rng};
}
