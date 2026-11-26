import {GAME_CONFIG,type UpgradeId} from './game-config';
import type {RunCategory} from './game-types';

const factor=10**GAME_CONFIG.economy.decimalPlaces;

export function roundGameValue(value:number):number {
 if(!Number.isFinite(value))throw new Error('Game value must be finite');
 return Math.ceil((value-Number.EPSILON)*factor)/factor;
}

export function formatGameNumber(value:number):string {
 return new Intl.NumberFormat('en-US',{minimumFractionDigits:0,maximumFractionDigits:GAME_CONFIG.economy.decimalPlaces}).format(roundGameValue(value));
}

export function formatGameCurrency(value:number):string {
 return `$${formatGameNumber(value)}`;
}

function owns(upgrades:readonly UpgradeId[],id:UpgradeId):boolean {
 return upgrades.includes(id);
}

export function shopInterest(score:number,category:RunCategory,upgrades:readonly UpgradeId[]=[]):number {
 const rate=owns(upgrades,'rateHikeCycle')?GAME_CONFIG.upgrades.rateHikeCycle.interestRate:GAME_CONFIG.economy.shopInterestRate;
 const capKey=category==='touch'?'touch':'keyboardPointer';
 const capMultiplier=owns(upgrades,'priorityBanking')?GAME_CONFIG.upgrades.priorityBanking.interestCapMultiplier:1;
 return roundGameValue(Math.min(score*rate,GAME_CONFIG.economy.shopInterestCap[capKey]*capMultiplier));
}

export function scoreAfterShopSkip(score:number,category:RunCategory,upgrades:readonly UpgradeId[]=[]):number {
 return roundGameValue(score+shopInterest(score,category,upgrades));
}

export function rerollPrice(category:RunCategory,rerollsUsed:number,upgrades:readonly UpgradeId[]=[]):number {
 if(!Number.isInteger(rerollsUsed)||rerollsUsed<0)throw new Error('Rerolls used must be a non-negative integer');
 const categoryConfig=category==='touch'?GAME_CONFIG.categories.touch:GAME_CONFIG.categories.keyboardPointer;
 const growth=owns(upgrades,'flatRate')?1:GAME_CONFIG.economy.rerollPriceGrowthMultiplier;
 return roundGameValue(categoryConfig.rerollPrice*growth**rerollsUsed);
}
