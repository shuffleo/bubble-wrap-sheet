const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {advanceRoughTable,resolveManualUpgradeProcs}=require('../../.compiled/game/upgrades');

const bubbles=[
 {index:2,surface:'sheet',eligible:true,popped:false,x:0,y:0},
 {index:4,surface:'sheet',eligible:true,popped:true,x:10,y:0},
 {index:6,surface:'sheet',eligible:true,popped:false,x:20,y:0},
 {index:8,surface:'sheet',eligible:true,popped:false,x:40,y:0}
];

test('Fat Finger uses seeded randomness to assist one available neighbour',()=>{
 const input={owned:['fatFinger'],neighbours:[4,6,2],bubbles,rng:createGameRng(27)};
 const first=resolveManualUpgradeProcs(input),second=resolveManualUpgradeProcs(input);
 assert.deepEqual(first,second);
 assert.equal(first.procs.length,1);
 assert.equal(first.procs[0].upgrade,'fatFinger');
 assert.ok([2,6].includes(first.procs[0].index));
 assert.equal(first.rng.cursor,1);
});

test('manual procs do nothing without an owned upgrade or available neighbour',()=>{
 const rng=createGameRng(1);
 assert.deepEqual(resolveManualUpgradeProcs({owned:[],neighbours:[2],bubbles,rng}),{procs:[],rng});
 assert.deepEqual(resolveManualUpgradeProcs({owned:['fatFinger'],neighbours:[4],bubbles,rng}),{procs:[],rng});
});

test('Knuckle Crack triggers on the configured combo interval and avoids duplicate assists',()=>{
 const rng=createGameRng(17);
 const before=resolveManualUpgradeProcs({
  owned:['fatFinger','knuckleCrack'],
  neighbours:[2,6,8],
  bubbles,
  rng,
  comboCount:GAME_CONFIG.upgrades.knuckleCrack.manualComboInterval-1
 });
 assert.deepEqual(before.procs.map(proc=>proc.upgrade),['fatFinger']);
 const triggered=resolveManualUpgradeProcs({
  owned:['fatFinger','knuckleCrack'],
  neighbours:[2,6,8],
  bubbles,
  rng,
  comboCount:GAME_CONFIG.upgrades.knuckleCrack.manualComboInterval
 });
 assert.deepEqual(triggered.procs.map(proc=>proc.upgrade),['fatFinger','knuckleCrack','knuckleCrack']);
 assert.equal(new Set(triggered.procs.map(proc=>proc.index)).size,triggered.procs.length);
});

test('Static Discharge targets the farthest available bubble on its encounter interval',()=>{
 const resolution=resolveManualUpgradeProcs({
  owned:['staticDischarge'],
  neighbours:[],
  bubbles,
  rng:createGameRng(5),
  encounterManualPops:GAME_CONFIG.upgrades.staticDischarge.manualPopInterval,
  originIndex:2
 });
 assert.deepEqual(resolution.procs,[{upgrade:'staticDischarge',index:8}]);
 assert.deepEqual(resolveManualUpgradeProcs({
  owned:['staticDischarge'],
  neighbours:[],
  bubbles,
  rng:createGameRng(5),
  encounterManualPops:GAME_CONFIG.upgrades.staticDischarge.manualPopInterval-1,
  originIndex:2
 }).procs,[]);
});

test('Rough Table advances only supplied active time and uses seeded unique targets',()=>{
 const interval=GAME_CONFIG.upgrades.roughTable.intervalMs;
 const rng=createGameRng(23);
 const waiting=advanceRoughTable({owned:['roughTable'],elapsedMs:0,activeDeltaMs:interval-1,bubbles,rng});
 assert.equal(waiting.procs.length,0);
 assert.equal(waiting.elapsedMs,interval-1);
 const triggered=advanceRoughTable({owned:['roughTable'],elapsedMs:waiting.elapsedMs,activeDeltaMs:interval+1,bubbles,rng:waiting.rng});
 assert.equal(triggered.procs.length,2);
 assert.equal(new Set(triggered.procs.map(proc=>proc.index)).size,2);
 assert.equal(triggered.elapsedMs,0);
 assert.deepEqual(advanceRoughTable({owned:[],elapsedMs:100,activeDeltaMs:interval,bubbles,rng}),{elapsedMs:0,procs:[],rng});
});
