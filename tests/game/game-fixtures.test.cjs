const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG,upgradeIds}=require('../../.compiled/game/game-config');
const {UPGRADE_COPY,HAZARD_COPY}=require('../../.compiled/game/game-copy');
const {GAME_FIXTURES}=require('../../.compiled/game/game-fixtures');

test('every upgrade and hazard has player-facing copy',()=>{
 assert.deepEqual(Object.keys(UPGRADE_COPY).sort(),upgradeIds().sort());
 assert.deepEqual(Object.keys(HAZARD_COPY).sort(),Object.keys(GAME_CONFIG.hazards.selectionWeights).sort());
 for(const entry of [...Object.values(UPGRADE_COPY),...Object.values(HAZARD_COPY)]){
  assert.ok(entry.name.length>2);
  assert.ok(entry.description.length>10);
  if('icon' in entry)assert.ok(entry.icon.length>2);
 }
});

test('HUD fixture references valid level and upgrade data',()=>{
 const hud=GAME_FIXTURES.hud;
 assert.equal(hud.levelName,GAME_CONFIG.run.levels[hud.level-1].name);
 assert.ok(hud.goalCurrent<=hud.goalTarget);
 assert.equal(hud.velocityHistory.length,30);
 assert.ok(hud.timerRemainingMs<=hud.timerTotalMs);
 for(const id of hud.upgrades)assert.ok(Object.hasOwn(GAME_CONFIG.upgrades,id));
});

test('shop fixtures use category prices and valid affordability flags',()=>{
 for(const fixture of [GAME_FIXTURES.shop,GAME_FIXTURES.shopKeyboard]){
  const category=fixture.category==='touch'?GAME_CONFIG.categories.touch:GAME_CONFIG.categories.keyboardPointer;
  assert.ok(fixture.rerollsUsed<=fixture.rerollLimit);
  assert.equal(fixture.rerollLimit,GAME_CONFIG.run.shopRerollLimit);
  for(const offer of fixture.offers){
   assert.equal(offer.price,category.upgradePrices[offer.id]);
   assert.equal(offer.affordable,fixture.score>=offer.price&&!offer.owned);
  }
 }
});
