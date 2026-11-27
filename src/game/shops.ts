import {GAME_CONFIG,type UpgradeId} from './game-config';
import {rerollPrice,roundGameValue,shopInterest} from './economy';
import {nextInt,type GameRngState} from './game-rng';
import type {RunCategory} from './game-types';

export const LIVE_SHOP_UPGRADES:readonly UpgradeId[]=[
 'fatFinger',
 'roughTable',
 'knuckleCrack',
 'staticDischarge',
 'rateHikeCycle',
 'priorityBanking',
 'flatRate'
];

export interface LiveShopState {
 category:RunCategory;
 score:number;
 owned:UpgradeId[];
 offers:UpgradeId[];
 rerollsUsed:number;
 rng:GameRngState;
}

export interface ShopMutation {
 accepted:boolean;
 state:LiveShopState;
 reason?:'unavailable'|'owned'|'unaffordable'|'reroll-limit';
 interest?:number;
}

export function upgradePrice(category:RunCategory,id:UpgradeId):number {
 const prices=category==='touch'?GAME_CONFIG.categories.touch.upgradePrices:GAME_CONFIG.categories.keyboardPointer.upgradePrices;
 return prices[id];
}

export function createLiveShop(input:{
 category:RunCategory;
 score:number;
 owned:readonly UpgradeId[];
 rng:GameRngState;
}):LiveShopState {
 const drawn=drawOffers(input.rng,input.owned);
 return {category:input.category,score:input.score,owned:[...input.owned],offers:drawn.offers,rerollsUsed:0,rng:drawn.rng};
}

export function rerollLiveShop(shop:LiveShopState):ShopMutation {
 if(shop.rerollsUsed>=GAME_CONFIG.run.shopRerollLimit)return {accepted:false,state:shop,reason:'reroll-limit'};
 const price=rerollPrice(shop.category,shop.rerollsUsed,shop.owned);
 if(shop.score<price)return {accepted:false,state:shop,reason:'unaffordable'};
 const drawn=drawOffers(shop.rng,shop.owned,shop.offers);
 return {
  accepted:true,
  state:{...shop,score:roundGameValue(shop.score-price),offers:drawn.offers,rerollsUsed:shop.rerollsUsed+1,rng:drawn.rng}
 };
}

export function buyLiveShopUpgrade(shop:LiveShopState,id:UpgradeId):ShopMutation {
 if(!shop.offers.includes(id)||!LIVE_SHOP_UPGRADES.includes(id))return {accepted:false,state:shop,reason:'unavailable'};
 if(shop.owned.includes(id))return {accepted:false,state:shop,reason:'owned'};
 const price=upgradePrice(shop.category,id);
 if(shop.score<price)return {accepted:false,state:shop,reason:'unaffordable'};
 return {accepted:true,state:{...shop,score:roundGameValue(shop.score-price),owned:[...shop.owned,id]}};
}

export function skipLiveShop(shop:LiveShopState):ShopMutation {
 const interest=shopInterest(shop.score,shop.category,shop.owned);
 return {accepted:true,interest,state:{...shop,score:roundGameValue(shop.score+interest)}};
}

function drawOffers(rng:GameRngState,owned:readonly UpgradeId[],rejected:readonly UpgradeId[]=[]):{rng:GameRngState;offers:UpgradeId[]} {
 const available=LIVE_SHOP_UPGRADES.filter(id=>!owned.includes(id));
 const withoutRejected=available.filter(id=>!rejected.includes(id));
 const count=Math.min(GAME_CONFIG.run.shopOfferCount,available.length);
 const pool=withoutRejected.length>=count?withoutRejected:available;
 const shuffled=[...pool];
 let state=rng;
 for(let index=shuffled.length-1;index>0;index--){
  const draw=nextInt(state,0,index);
  state=draw.state;
  [shuffled[index],shuffled[draw.value]]=[shuffled[draw.value],shuffled[index]];
 }
 return {rng:state,offers:shuffled.slice(0,count)};
}
