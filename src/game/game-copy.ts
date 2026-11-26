import type {HazardId,UpgradeId} from './game-config';

export const UPGRADE_COPY:Record<UpgradeId,{name:string;description:string;icon:string}>={
 fatFinger:{name:'Fat Finger',description:'Every manual pop assists one neighbouring bubble.',icon:'touch_app'},
 knuckleCrack:{name:'Knuckle Crack',description:'Every fifth combo pop assists two neighbouring bubbles.',icon:'back_hand'},
 roughTable:{name:'Rough Table',description:'Every four active seconds assists one random bubble.',icon:'texture'},
 staticDischarge:{name:'Static Discharge',description:'Every twelfth manual pop clears a distant straggler.',icon:'electric_bolt'},
 velocityBuff:{name:'Velocity Buff',description:'Sustained manual speed raises the score multiplier.',icon:'speed'},
 deadlineFighter:{name:'Deadline Fighter',description:'Danger-zone combos build an extra score multiplier.',icon:'timer'},
 sureHands:{name:'Sure Hands',description:'Skilled manual pops earn an additional score bonus.',icon:'gesture'},
 secondWind:{name:'Second Wind',description:'Once per run, add time when a deadline expires.',icon:'air'},
 bubbleInsurance:{name:'Bubble Insurance',description:'The first conveyor misses count as cleared.',icon:'verified_user'},
 rateHikeCycle:{name:'Rate-hike Cycle',description:'Raises shop-skip interest from 2% to 5%.',icon:'trending_up'},
 priorityBanking:{name:'Priority Banking',description:'Doubles the maximum interest payout per shop.',icon:'account_balance'},
 flatRate:{name:'Flat Rate',description:'Stops reroll prices from increasing after each use.',icon:'horizontal_rule'}
};

export const HAZARD_COPY:Record<HazardId,{name:string;description:string}>={
 doubleLayer:{name:'Double Layer',description:'Some bubbles need two hits.'},
 memoryFoam:{name:'Memory Foam',description:'Popped bubbles warn, then reinflate.'},
 hardenedBubbles:{name:'Hardened Bubbles',description:'Some bubbles require a sustained hold.'},
 drunkenBob:{name:'Drunken Bob',description:'Inputs resolve to scrambled targets.'}
};
