const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {planLevelSheets}=require('../../.compiled/game/sheet-plan');
const {beginLevelOne,createLevelOne,noteSheetCleared}=require('../../.compiled/game/level-one');

test('every current level plans one sheet entry per configured sheet and no hazards yet',()=>{
 for(const level of GAME_CONFIG.run.levels){
  const plans=planLevelSheets(level.id);
  assert.equal(plans.length,level.sheetCount);
  for(const plan of plans){
   assert.equal(plan.bubbleSize,level.bubbleSize);
   assert.deepEqual(plan.hazardIds,[]);
  }
 }
});

test('sheet transitions keep the preplanned hazard list for that sheet',()=>{
 let level=beginLevelOne(createLevelOne(3),['KeyA','KeyS','KeyD']);
 assert.deepEqual(level.session.run.encounter.sheetHazardIds,[]);
 const step=noteSheetCleared(level);
 level=step.state;
 assert.equal(level.sheet,2);
 assert.equal(level.session.run.encounter.sheetIndex,1);
 assert.deepEqual(level.session.run.encounter.sheetHazardIds,level.plans[1].hazardIds);
});
