import type {GameBubbleSnapshot} from '../components/bubble-ui/core/bubble-engine';
import {GAME_CONFIG,type UpgradeId} from './game-config';

export interface UpgradePopProc {
 upgrade:UpgradeId;
 index:number;
}

/** Resolves direct assists after manual scoring. Assisted pops never call this
 * function, so upgrade effects cannot recurse into one another. */
export function resolveManualUpgradeProcs(input:{
 owned:readonly UpgradeId[];
 neighbours:readonly number[];
 bubbles:readonly GameBubbleSnapshot[];
}):UpgradePopProc[] {
 const procs:UpgradePopProc[]=[];
 if(input.owned.includes('fatFinger')){
  const available=new Set(input.bubbles.filter(bubble=>bubble.eligible&&!bubble.popped).map(bubble=>bubble.index));
  for(const index of input.neighbours){
   if(!available.has(index))continue;
   procs.push({upgrade:'fatFinger',index});
   if(procs.length>=GAME_CONFIG.upgrades.fatFinger.neighbourCount)break;
  }
 }
 return procs;
}
