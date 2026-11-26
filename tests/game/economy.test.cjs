const {test}=require('node:test');
const assert=require('node:assert/strict');
const {formatGameCurrency,formatGameNumber,rerollPrice,roundGameValue,scoreAfterShopSkip,shopInterest}=require('../../.compiled/game/economy');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');

test('game values round upward to at most two decimals without redundant zeros',()=>{
 assert.equal(roundGameValue(1.001),1.01);
 assert.equal(roundGameValue(1),1);
 assert.equal(formatGameNumber(1200),'1,200');
 assert.equal(formatGameNumber(1.2),'1.2');
 assert.equal(formatGameCurrency(12.345),'$12.35');
});

test('shop skip pays capped category interest',()=>{
 assert.equal(shopInterest(1000,'touch'),20);
 assert.equal(shopInterest(100000,'touch'),GAME_CONFIG.economy.shopInterestCap.touch);
 assert.equal(scoreAfterShopSkip(1000,'touch'),1020);
});

test('banking upgrades raise the rate and cap independently',()=>{
 assert.equal(shopInterest(1000,'touch',['rateHikeCycle']),50);
 assert.equal(shopInterest(100000,'touch',['priorityBanking']),GAME_CONFIG.economy.shopInterestCap.touch*2);
 assert.equal(shopInterest(100000,'touch',['rateHikeCycle','priorityBanking']),GAME_CONFIG.economy.shopInterestCap.touch*2);
});

test('rerolls escalate geometrically unless Flat Rate is owned',()=>{
 assert.equal(rerollPrice('touch',0),GAME_CONFIG.categories.touch.rerollPrice);
 assert.equal(rerollPrice('touch',1),GAME_CONFIG.categories.touch.rerollPrice*GAME_CONFIG.economy.rerollPriceGrowthMultiplier);
 assert.equal(rerollPrice('touch',2),562.5);
 assert.equal(rerollPrice('touch',2,['flatRate']),GAME_CONFIG.categories.touch.rerollPrice);
});
