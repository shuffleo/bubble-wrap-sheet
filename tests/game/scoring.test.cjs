const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {EMPTY_COMBO,chooseHotKeys,dangerZoneMs,deadlineScoreMultiplier,scoreAssistedPop,scoreManualPop,velocityScoreMultiplier}=require('../../.compiled/game/scoring');
const {applyAssistedPop,applyManualPop,beginLevel,beginLevelOne,createLevelOne,createLevelState,noteSheetCleared}=require('../../.compiled/game/level-one');

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

test('Velocity Buff follows its configured diminishing curve only in a live combo',()=>{
 const activation=GAME_CONFIG.scoring.velocity.activationPopsPerSecond;
 assert.equal(velocityScoreMultiplier(activation-0.01,true),1);
 assert.equal(velocityScoreMultiplier(activation,true),GAME_CONFIG.scoring.velocity.minimumMultiplier);
 assert.ok(velocityScoreMultiplier(activation+4,true)>GAME_CONFIG.scoring.velocity.minimumMultiplier);
 assert.ok(velocityScoreMultiplier(100,true)<=GAME_CONFIG.scoring.velocity.maximumMultiplier);
 assert.equal(velocityScoreMultiplier(100,false),1);
});

test('Deadline Fighter rises linearly inside the configured danger zone',()=>{
 const totalMs=28_000,zone=dangerZoneMs(totalMs);
 assert.equal(zone,totalMs*GAME_CONFIG.scoring.deadline.dangerZoneFraction);
 assert.equal(deadlineScoreMultiplier(totalMs,zone+1,true),1);
 assert.equal(deadlineScoreMultiplier(totalMs,zone,true),1);
 assert.equal(deadlineScoreMultiplier(totalMs,zone/2,true),1.5);
 assert.equal(deadlineScoreMultiplier(totalMs,0,true),GAME_CONFIG.scoring.deadline.maximumMultiplier);
 assert.equal(deadlineScoreMultiplier(totalMs,0,false),1);
});

test('manual score applies Sure Hands before velocity and deadline multipliers',()=>{
 const now=1500;
 const result=scoreManualPop({
  now,
  input:'keyboard',
  gestureOrdinal:1,
  adjacent:false,
  hotKey:true,
  combo:{count:4,expiresAt:now},
  owned:['sureHands','velocityBuff','deadlineFighter'],
  manualPopTimes:[0,250,500,750,1000,1250],
  hardDeadline:{totalMs:20_000,elapsedMs:19_000}
 });
 assert.equal(result.sureHandsBonus,GAME_CONFIG.upgrades.sureHands.additionalSkillBonus);
 assert.ok(result.velocityMultiplier>1);
 assert.ok(result.deadlineMultiplier>1);
 assert.equal(
  GAME_CONFIG.scoring.normalBase+GAME_CONFIG.scoring.skillBonus+result.sureHandsBonus+result.velocityBoost+result.deadlineBoost,
  result.points
 );
});

test('a reinflated bubble advances manual play without awarding repeat score',()=>{
 const result=scoreManualPop({
  now:500,
  input:'touch',
  gestureOrdinal:3,
  adjacent:true,
  hotKey:false,
  combo:{count:2,expiresAt:500},
  owned:['sureHands','velocityBuff'],
  manualPopTimes:[0,250],
  scoreEligible:false
 });
 assert.equal(result.points,0);
 assert.equal(result.sureHandsBonus,0);
 assert.equal(result.velocityBoost,0);
 assert.equal(result.combo.count,3);
});

test('Hardened and Drunken Bob pops suppress skill while retaining configured base score',()=>{
 const hardened=scoreManualPop({
  now:500,
  input:'touch',
  gestureOrdinal:4,
  adjacent:true,
  hotKey:false,
  combo:{count:2,expiresAt:500},
  skillEligible:false,
  baseScore:GAME_CONFIG.scoring.hardenedBase
 });
 assert.equal(hardened.skill,'none');
 assert.equal(hardened.points,GAME_CONFIG.scoring.hardenedBase);
 const drunken=scoreManualPop({
  now:500,
  input:'keyboard',
  gestureOrdinal:1,
  adjacent:false,
  hotKey:true,
  combo:{count:2,expiresAt:500},
  skillEligible:false
 });
 assert.equal(drunken.skill,'none');
 assert.equal(drunken.points,GAME_CONFIG.scoring.normalBase);
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
 assert.equal(level.breakdown.base,GAME_CONFIG.scoring.normalBase*2);
 assert.equal(level.breakdown.assisted,GAME_CONFIG.scoring.assistedBase);
 assert.equal(level.breakdown.base+level.breakdown.cleanSweep+level.breakdown.hotKey+level.breakdown.assisted,level.session.run.score);
 assert.equal(level.combo.count,second.state.combo.count);
 let step=noteSheetCleared(level);
 assert.equal(step.kind,'next-sheet');
 step=noteSheetCleared(step.state);
 assert.equal(step.kind,'cleared');
 assert.equal(step.state.session.run.level,2);
 const level2=beginLevel(createLevelState(step.state.session,2),['KeyA','KeyS','KeyD']);
 assert.equal(level2.levelId,2);
 assert.equal(level2.sheets,GAME_CONFIG.run.levels[1].sheetCount);
 assert.equal(level2.category,'touch');
 assert.equal(level2.startScore,step.state.session.run.score);
});
