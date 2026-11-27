const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {
 LIVE_LEVEL_FOUR_HAZARDS,
 advanceMemoryFoam,
 assignDoubleLayers,
 createMemoryFoamState,
 hazardDeadlineMultiplier,
 selectLevelFourHazard
}=require('../../.compiled/game/hazards');

const bubbles=Array.from({length:10},(_,index)=>({
 index,
 surface:'sheet',
 eligible:true,
 popped:index<3,
 x:index*10,
 y:0,
 layers:1
}));

test('Level 4 hazard selection is seeded and limited to implemented checkpoint hazards',()=>{
 const first=selectLevelFourHazard(createGameRng(41));
 const second=selectLevelFourHazard(createGameRng(41));
 assert.deepEqual(first,second);
 assert.ok(LIVE_LEVEL_FOUR_HAZARDS.includes(first.hazardId));
 assert.equal(first.rng.cursor,1);
});

test('Double Layer assigns the configured ratio without duplicates',()=>{
 const available=bubbles.map(bubble=>({...bubble,popped:false}));
 const assignment=assignDoubleLayers(available,createGameRng(8));
 assert.equal(assignment.indices.length,Math.ceil(available.length*GAME_CONFIG.hazards.doubleLayer.bubbleRatio));
 assert.equal(new Set(assignment.indices).size,assignment.indices.length);
 assert.equal(hazardDeadlineMultiplier('doubleLayer'),GAME_CONFIG.hazards.doubleLayer.deadlineWorkloadMultiplier);
});

test('Memory Foam waits active time, warns a popped bubble, then requests reinflation',()=>{
 const rng=createGameRng(14);
 const waiting=advanceMemoryFoam({
  state:createMemoryFoamState(),
  activeDeltaMs:GAME_CONFIG.hazards.memoryFoam.intervalMs-1,
  bubbles,
  rng
 });
 assert.equal(waiting.warnedIndex,null);
 const warned=advanceMemoryFoam({state:waiting.state,activeDeltaMs:1,bubbles,rng:waiting.rng});
 assert.ok(bubbles.slice(0,3).some(bubble=>bubble.index===warned.warnedIndex));
 assert.equal(warned.reinflateIndex,null);
 const reinflated=advanceMemoryFoam({
  state:warned.state,
  activeDeltaMs:GAME_CONFIG.hazards.memoryFoam.warningMs,
  bubbles,
  rng:warned.rng
 });
 assert.equal(reinflated.reinflateIndex,warned.warnedIndex);
 assert.deepEqual(reinflated.state,createMemoryFoamState());
});

test('Memory Foam cannot schedule without an already popped bubble',()=>{
 const unpopped=bubbles.map(bubble=>({...bubble,popped:false}));
 const rng=createGameRng(2);
 const result=advanceMemoryFoam({
  state:createMemoryFoamState(),
  activeDeltaMs:GAME_CONFIG.hazards.memoryFoam.intervalMs,
  bubbles:unpopped,
  rng
 });
 assert.equal(result.warnedIndex,null);
 assert.equal(result.reinflateIndex,null);
 assert.deepEqual(result.rng,rng);
});
