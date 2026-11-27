import {GAME_CONFIG} from './game-config';
import {nextInt,type GameRngState} from './game-rng';

export interface ClusterGroup {
 code:string;
 label:string;
 indices:readonly number[];
}

export interface ClusterArm {
 code:string;
 label:string;
 indices:number[];
 tier:number;
}

/** How many quarter-sheet thresholds the current popped count has crossed. */
export function clusterTier(popped:number,total:number):number {
 if(total<=0||popped<=0)return 0;
 const fraction=GAME_CONFIG.upgrades.clusterBomb.sheetFraction;
 const cap=GAME_CONFIG.upgrades.clusterBomb.maximumArms;
 return Math.min(cap,Math.floor((popped/total)/fraction));
}

/** Arms one random remaining key group when a new quarter of the sheet is popped. */
export function nextClusterArm(input:{
 popped:number;
 total:number;
 previousTier:number;
 groups:readonly ClusterGroup[];
 rng:GameRngState;
}):{tier:number;arm:ClusterArm|null;rng:GameRngState} {
 const tier=clusterTier(input.popped,input.total);
 if(tier<=input.previousTier)return {tier:input.previousTier,arm:null,rng:input.rng};
 const available=input.groups.filter(group=>group.indices.length>0);
 if(!available.length)return {tier,arm:null,rng:input.rng};
 const draw=available.length===1?{state:input.rng,value:0}:nextInt(input.rng,0,available.length-1);
 const group=available[draw.value];
 return {tier,rng:draw.state,arm:{code:group.code,label:group.label,indices:[...group.indices],tier}};
}
