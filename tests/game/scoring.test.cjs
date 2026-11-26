const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {EMPTY_COMBO,chooseHotKeys,scoreAssistedPop,scoreManualPop}=require('../../.compiled/game/scoring');
const {applyAssistedPop,applyManualPop,beginLevelOne,createLevelOne,noteSheetCleared}=require('../../.compiled/game/level-one');

test('clean sweep starts at the configured gesture crossing',()=>{
 const early=scoreManualPop({now:0,input:'mouse',gestureOrdinal:GAME_CONFIG.scoring.cleanSweepStartsAt-1,adjacent:true,hotKey:false,combo:EMPTY_COMBO});
 const sweep=scoreManualPop({now:0,input:'touch',gestureOrdinal:GAME_CONFIG.scoring.cleanSweepStartsAt,adjacent:true,hotKey:false,combo:EMPTY_COMBO});
 const gap=scoreManualPop({now:0,input:'pen',gestureOrdinal:GAME_CONFIG.scoring.cleanSweepStartsAt,adjacent:false,hotKey:false,combo:EMPTY_COMBO});
 assert.equal(early.skill,'none');
 assert.equal(early.points,GAME_CONFIG.scoring.normalBase);
 assert.equal(sweep.skill,'clean-sweep');
 assert.equal(sweep.points,GAME_CONFIG.scoring.normalBase+GAME_CONFIG.scoring.skillBonus);
 assert.equal(gap.skill,'none');
});

test('hot key scores only after a highlighted keyboard success and then rotates',()=>{
 const miss=scoreManualPop({now:0,input:'keyboard',gestureOrdinal:1,adjacent:true,hotKey:false,combo:EMPTY_COMBO});
 const hit=scoreManualPop({now:0,input:'keyboard',gestureOrdinal:4,adjacent:true,hotKey:true,combo:EMPTY_COMBO});
 assert.equal(miss.skill,'none');
 assert.equal(hit.skill,'hot-key');
 const first=chooseHotKeys(['KeyQ','KeyW','KeyE','KeyR'],GAME_CONFIG.scoring.hotKeyTargetCount,createGameRng(4));
 const second=chooseHotKeys(['KeyQ','KeyW','KeyE','KeyR'],GAME_CONFIG.scoring.hotKeyTargetCount,first.state,first.codes);
 assert.notDeepEqual([...first.codes].sort(),[...second.codes].sort());
});

test('combo expires from config and assisted pops do not extend it',()=>{
 const first=scoreManualPop({now:1000,input:'mouse',gestureOrdinal:1,adjacent:false,hotKey:false,combo:EMPTY_COMBO});
 const extended=scoreManualPop({now:first.combo.expiresAt,input:'mouse',gestureOrdinal:1,adjacent:false,hotKey:false,combo:first.combo});
 const expired=scoreManualPop({now:first.combo.expiresAt+1,input:'mouse',gestureOrdinal:1,adjacent:false,hotKey:false,combo:first.combo});
 assert.equal(extended.combo.count,2);
 assert.equal(expired.combo.count,1);
 assert.equal(scoreAssistedPop(),GAME_CONFIG.scoring.assistedBase);
});

test('level 1 scores two manual sheets and keeps the first category',()=>{
 let level=beginLevelOne(createLevelOne(9),['KeyA','KeyS','KeyD','KeyF']);
 assert.equal(level.sheets,GAME_CONFIG.run.levels[0].sheetCount);
 assert.equal(level.size,'M');
 const first=applyManualPop(level,{now:10,input:'touch',gestureId:'pointer:1',index:0,neighbours:[],keyCode:null,availableKeyCodes:level.hotKeys});
 level=first.state;
 const second=applyManualPop(level,{now:20,input:'keyboard',gestureId:'key:KeyA',index:1,neighbours:[0],keyCode:'KeyA',availableKeyCodes:['KeyA','KeyS','KeyD']});
 level=second.state;
 assert.equal(level.category,'touch');
 assert.equal(first.notice.points,GAME_CONFIG.scoring.normalBase);
 const assisted=applyAssistedPop(level);
 level=assisted.state;
 assert.equal(assisted.points,GAME_CONFIG.scoring.assistedBase);
 assert.equal(level.combo.count,second.state.combo.count);
 let step=noteSheetCleared(level);
 assert.equal(step.kind,'next-sheet');
 step=noteSheetCleared(step.state);
 assert.equal(step.kind,'cleared');
 assert.equal(step.state.session.run.level,2);
});
