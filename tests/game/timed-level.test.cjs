const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {CalibrationCollector,calibratePace,calibratedDeadlineMs,remainingTimeSettlement,resolveSecondWind,softParMs}=require('../../.compiled/game/timed-level');

test('soft par uses actual bubble workload and transition allowance',()=>{
 const expected=100*GAME_CONFIG.categories.touch.softParSecondsPerBubble*1000+4*GAME_CONFIG.calibration.sheetTransitionAllowanceSeconds*1000;
 assert.equal(softParMs('touch',100,5),Math.ceil(expected));
 assert.ok(softParMs('keyboard-pointer',100,5)<softParMs('touch',100,5));
});

test('calibration samples manual active windows and excludes ended gaps',()=>{
 const collector=new CalibrationCollector();
 for(const time of [0,500,1000,1500,2000,2500])collector.recordManualPop(time);
 collector.endActivePeriod(3000);
 collector.recordManualPop(20_000);
 collector.endActivePeriod(30_000);
 const summary=collector.summarize('touch',30_000);
 assert.equal(summary.windows.length,1);
 assert.equal(summary.sampledWindowMs,GAME_CONFIG.calibration.activeWindowMs);
 assert.equal(summary.popsPerSecond,2);
});

test('calibration clamps extreme and missing samples to category bounds',()=>{
 const rapid=calibratePace([{startMs:0,endMs:3000,popTimes:Array.from({length:60},(_,index)=>index*40)}],'touch');
 const missing=calibratePace([],'keyboard-pointer');
 assert.equal(rapid.popsPerSecond,GAME_CONFIG.categories.touch.calibrationMaxPopsPerSecond);
 assert.equal(missing.popsPerSecond,GAME_CONFIG.categories.keyboardPointer.calibrationMinPopsPerSecond);
});

test('calibrated hard deadlines stay inside configured bounds',()=>{
 const minimum=calibratedDeadlineMs(1,1,{popsPerSecond:20,sampledWindowMs:3000});
 const maximum=calibratedDeadlineMs(1000,5,{popsPerSecond:2,sampledWindowMs:3000});
 assert.equal(minimum,GAME_CONFIG.calibration.hardDeadlineMinSeconds*1000);
 assert.equal(maximum,GAME_CONFIG.calibration.hardDeadlineMaxSeconds*1000);
});

test('remaining-time settlement rewards time but never punishes soft expiry',()=>{
 const early=remainingTimeSettlement(100,10000,5000);
 const expired=remainingTimeSettlement(100,10000,12000);
 assert.equal(early.multiplier,1.25);
 assert.equal(early.bonus,25);
 assert.equal(early.total,125);
 assert.deepEqual(expired,{subtotal:100,multiplier:1,bonus:0,total:100,remainingMs:0});
});

test('Second Wind extends one hard deadline only when it prevents failure',()=>{
 const totalMs=20_000;
 const triggered=resolveSecondWind({totalMs,elapsedMs:totalMs,owned:true,usesRemaining:1,hardTimer:true});
 assert.deepEqual(triggered,{
  triggered:true,
  totalMs:totalMs+GAME_CONFIG.upgrades.secondWind.addedSeconds*1000,
  usesRemaining:0
 });
 assert.equal(resolveSecondWind({totalMs,elapsedMs:totalMs,owned:true,usesRemaining:0,hardTimer:true}).triggered,false);
 assert.equal(resolveSecondWind({totalMs,elapsedMs:totalMs,owned:true,usesRemaining:1,hardTimer:false}).triggered,false);
 assert.equal(resolveSecondWind({
  totalMs,
  elapsedMs:totalMs+GAME_CONFIG.upgrades.secondWind.addedSeconds*1000,
  owned:true,
  usesRemaining:1,
  hardTimer:true
 }).triggered,false);
});
