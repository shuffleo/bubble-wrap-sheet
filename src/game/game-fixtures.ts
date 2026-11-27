import {GAME_CONFIG,type UpgradeId} from './game-config';
import type {LevelId,RunCategory} from './game-types';

export interface ModeSelectFixture {
 touchBest:number|null;
 keyboardPointerBest:number|null;
}

export interface HudFixture {
 level:LevelId;
 levelName:string;
 score:number;
 goalLabel:string;
 goalCurrent:number;
 goalTarget:number;
 goalUnit:string;
 timerKind:'soft'|'hard';
 timerRemainingMs:number;
 timerTotalMs:number;
 combo:number;
 popsPerSecond:number;
 velocityHistory:number[];
 velocityMultiplier:number;
 deadlineMultiplier:number;
 upgrades:UpgradeId[];
 activeUpgradeValues:Partial<Record<UpgradeId,string>>;
 hazard:string|null;
 dangerZone:boolean;
 softTimerExpired:boolean;
 paused:boolean;
 hidden:boolean;
}

export interface ShopOfferFixture {
 id:UpgradeId;
 price:number;
 affordable:boolean;
 owned:boolean;
}

export interface ShopFixture {
 category:RunCategory;
 score:number;
 rerollsUsed:number;
 rerollLimit:number;
 ownedUpgrades:UpgradeId[];
 offers:ShopOfferFixture[];
}

export interface ResultFixture {
 outcome:'won'|'lost';
 category:RunCategory;
 finalScore:number;
 reachedLevel:LevelId;
 manualPops:number;
 assistedPops:number;
 purchaseHistory:UpgradeId[];
 levelScores:{level:LevelId;score:number}[];
 runTimeMs:number;
 highestCombo:number;
 rerolls:number;
}

const touch=GAME_CONFIG.categories.touch;
const keyboard=GAME_CONFIG.categories.keyboardPointer;
const hardTimerMs=GAME_CONFIG.calibration.hardDeadlineMaxSeconds*1000;
const dangerTimerMs=Math.min(hardTimerMs*GAME_CONFIG.scoring.deadline.dangerZoneFraction,GAME_CONFIG.scoring.deadline.dangerZoneMaxSeconds*1000);

export const GAME_FIXTURES={
 modeSelect:{touchBest:null,keyboardPointerBest:null} satisfies ModeSelectFixture,
 hud:{
  level:3,
  levelName:GAME_CONFIG.run.levels[2].name,
  score:touch.upgradePrices.fatFinger+touch.rerollPrice,
  goalLabel:'Clear sheets',
  goalCurrent:2,
  goalTarget:GAME_CONFIG.run.levels[2].sheetCount,
  goalUnit:'sheets popped',
  timerKind:'hard',
  timerRemainingMs:dangerTimerMs,
  timerTotalMs:hardTimerMs,
  combo:GAME_CONFIG.scoring.cleanSweepStartsAt+2,
  popsPerSecond:touch.calibrationMinPopsPerSecond+1,
  velocityHistory:[0.8,1.2,1.1,1.7,2.4,2.1,2.8,3.4,3.1,3.8,4.2,4.8,4.4,5.1,5.6,5.2,4.9,5.8,6.2,5.7,6.5,6.8,6.1,6.9,7.4,7.1,7.8,7.2,6.7,7],
  velocityMultiplier:GAME_CONFIG.scoring.velocity.minimumMultiplier,
  deadlineMultiplier:GAME_CONFIG.scoring.deadline.minimumMultiplier,
  upgrades:['fatFinger','velocityBuff'],
  activeUpgradeValues:{velocityBuff:'2×'},
  hazard:null,
  dangerZone:true,
  softTimerExpired:false,
  paused:false,
  hidden:false
 } satisfies HudFixture,
 shop:{
  category:'touch',
  score:touch.upgradePrices.fatFinger,
  rerollsUsed:0,
  rerollLimit:GAME_CONFIG.run.shopRerollLimit,
  ownedUpgrades:[],
  offers:[
   {id:'fatFinger',price:touch.upgradePrices.fatFinger,affordable:true,owned:false},
   {id:'velocityBuff',price:touch.upgradePrices.velocityBuff,affordable:true,owned:false}
  ]
 } satisfies ShopFixture,
 shopKeyboard:{
  category:'keyboard-pointer',
  score:keyboard.upgradePrices.bubbleInsurance,
  rerollsUsed:1,
  rerollLimit:GAME_CONFIG.run.shopRerollLimit,
  ownedUpgrades:[],
  offers:[
   {id:'sureHands',price:keyboard.upgradePrices.sureHands,affordable:false,owned:false},
   {id:'bubbleInsurance',price:keyboard.upgradePrices.bubbleInsurance,affordable:true,owned:false}
  ]
 } satisfies ShopFixture,
 runWon:{
  outcome:'won',
  category:'touch',
  finalScore:touch.upgradePrices.velocityBuff,
  reachedLevel:5,
  manualPops:GAME_CONFIG.scoring.hotKeyTargetCount*100,
  assistedPops:GAME_CONFIG.upgrades.bubbleInsurance.insuredMisses,
  purchaseHistory:['fatFinger','velocityBuff'],
  levelScores:GAME_CONFIG.run.levels.map(level=>({level:level.id as LevelId,score:GAME_CONFIG.scoring.normalBase*level.id*10})),
  runTimeMs:8*60*1000+42_000,
  highestCombo:47,
  rerolls:2
 } satisfies ResultFixture,
 runLost:{
  outcome:'lost',
  category:'keyboard-pointer',
  finalScore:keyboard.rerollPrice,
  reachedLevel:4,
  manualPops:GAME_CONFIG.scoring.cleanSweepStartsAt*50,
  assistedPops:0,
  purchaseHistory:['roughTable'],
  levelScores:GAME_CONFIG.run.levels.slice(0,3).map(level=>({level:level.id as LevelId,score:GAME_CONFIG.scoring.normalBase*level.id*10})),
  runTimeMs:6*60*1000+18_000,
  highestCombo:21,
  rerolls:0
 } satisfies ResultFixture
} as const;
