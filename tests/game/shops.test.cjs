const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {buyLiveShopUpgrade,createLiveShop,rerollLiveShop,skipLiveShop,upgradePrice}=require('../../.compiled/game/shops');

test('live shop offers are seeded, unique, and never owned',()=>{
 const input={category:'touch',score:5000,owned:['flatRate'],rng:createGameRng(42)};
 const first=createLiveShop(input),second=createLiveShop(input);
 assert.deepEqual(first.offers,second.offers);
 assert.equal(first.offers.length,GAME_CONFIG.run.shopOfferCount);
 assert.equal(new Set(first.offers).size,first.offers.length);
 assert.ok(!first.offers.includes('flatRate'));
});

test('rerolls spend score, reject both prior offers when possible, and stop at the limit',()=>{
 let shop=createLiveShop({category:'touch',score:10000,owned:[],rng:createGameRng(7)});
 const rejected=[...shop.offers];
 const poor={...shop,score:GAME_CONFIG.categories.touch.rerollPrice-1};
 assert.equal(rerollLiveShop(poor).reason,'unaffordable');
 assert.equal(rerollLiveShop(poor).state.score,poor.score);
 const first=rerollLiveShop(shop);
 assert.equal(first.accepted,true);
 assert.ok(first.state.offers.every(id=>!rejected.includes(id)));
 assert.equal(first.state.score,shop.score-GAME_CONFIG.categories.touch.rerollPrice);
 shop=first.state;
 for(let index=1;index<GAME_CONFIG.run.shopRerollLimit;index++)shop=rerollLiveShop(shop).state;
 const blocked=rerollLiveShop(shop);
 assert.equal(blocked.accepted,false);
 assert.equal(blocked.reason,'reroll-limit');
});

test('buying one offered upgrade deducts its category price without going negative',()=>{
 const shop=createLiveShop({category:'keyboard-pointer',score:10000,owned:[],rng:createGameRng(9)});
 const id=shop.offers[0],price=upgradePrice(shop.category,id);
 const bought=buyLiveShopUpgrade(shop,id);
 assert.equal(bought.accepted,true);
 assert.equal(bought.state.score,shop.score-price);
 assert.deepEqual(bought.state.owned,[id]);
 const poor={...shop,score:price-1};
 assert.equal(buyLiveShopUpgrade(poor,id).reason,'unaffordable');
});

test('skipping awards capped interest with owned economy upgrades',()=>{
 const shop=createLiveShop({category:'touch',score:20000,owned:['rateHikeCycle','priorityBanking'],rng:createGameRng(3)});
 const skipped=skipLiveShop(shop);
 assert.equal(skipped.accepted,true);
 assert.equal(skipped.interest,GAME_CONFIG.economy.shopInterestCap.touch*GAME_CONFIG.upgrades.priorityBanking.interestCapMultiplier);
 assert.equal(skipped.state.score,shop.score+skipped.interest);
});
