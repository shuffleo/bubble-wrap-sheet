import type {HazardId,UpgradeId} from './game-config';

export const UPGRADE_COPY:Record<UpgradeId,{name:string;description:string}>={
 fatFinger:{name:'Fat Finger',description:'Every manual pop assists one neighbouring bubble.'},
 knuckleCrack:{name:'Knuckle Crack',description:'Every fifth combo pop assists two neighbouring bubbles.'},
 roughTable:{name:'Rough Table',description:'Every four active seconds assists one random bubble.'},
 staticDischarge:{name:'Static Discharge',description:'Every twelfth manual pop clears a distant straggler.'},
 velocityBuff:{name:'Velocity Buff',description:'Sustained manual speed raises the score multiplier.'},
 deadlineFighter:{name:'Deadline Fighter',description:'Danger-zone combos build an extra score multiplier.'},
 sureHands:{name:'Sure Hands',description:'Skilled manual pops earn an additional score bonus.'},
 secondWind:{name:'Second Wind',description:'Once per run, add time when a deadline expires.'},
 bubbleInsurance:{name:'Bubble Insurance',description:'The first conveyor misses count as cleared.'}
};

export const HAZARD_COPY:Record<HazardId,{name:string;description:string}>={
 doubleLayer:{name:'Double Layer',description:'Some bubbles need two hits.'},
 memoryFoam:{name:'Memory Foam',description:'Popped bubbles warn, then reinflate.'},
 hardenedBubbles:{name:'Hardened Bubbles',description:'Some bubbles require a sustained hold.'},
 drunkenBob:{name:'Drunken Bob',description:'Inputs resolve to scrambled targets.'}
};
