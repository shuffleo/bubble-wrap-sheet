const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {
 LIVE_LEVEL_FOUR_HAZARDS,
 advanceMemoryFoam,
 assignDoubleLayers,
 assignHardenedBubbles,
 createDrunkenBobState,
 createMemoryFoamState,
 hazardDeadlineMultiplier,
 resolveDrunkenBobInput,
 selectLevelFourHazard
}=require('../../.compiled/game/hazards');

const bubbles=Array.from({length:10},(_,index)=>({
 index,
 surface:'sheet',
 eligible:true,
 popped:index<3,
 x:index*10,
 y:0,
 layers:1,
 hardened:false,
 holdProgress:0
}));

test('Level 4 hazard selection is seeded across the complete four-hazard pool',()=>{
 const first=selectLevelFourHazard(createGameRng(41));
 const second=selectLevelFourHazard(createGameRng(41));
 assert.deepEqual(first,second);
 assert.ok(LIVE_LEVEL_FOUR_HAZARDS.includes(first.hazardId));
 assert.deepEqual(LIVE_LEVEL_FOUR_HAZARDS,['doubleLayer','memoryFoam','hardenedBubbles','drunkenBob']);
 assert.equal(first.rng.cursor,1);
});

test('Double Layer assigns the configured ratio without duplicates',()=>{
 const available=bubbles.map(bubble=>({...bubble,popped:false}));
 const assignment=assignDoubleLayers(available,createGameRng(8));
 assert.equal(assignment.indices.length,Math.ceil(available.length*GAME_CONFIG.hazards.doubleLayer.bubbleRatio));
 assert.equal(new Set(assignment.indices).size,assignment.indices.length);
 assert.equal(hazardDeadlineMultiplier('doubleLayer'),GAME_CONFIG.hazards.doubleLayer.deadlineWorkloadMultiplier);
});

test('Hardened Bubbles assigns the configured ratio without duplicates',()=>{
 const available=bubbles.map(bubble=>({...bubble,popped:false}));
 const assignment=assignHardenedBubbles(available,createGameRng(18));
 assert.equal(assignment.indices.length,Math.ceil(available.length*GAME_CONFIG.hazards.hardenedBubbles.bubbleRatio));
 assert.equal(new Set(assignment.indices).size,assignment.indices.length);
 assert.equal(hazardDeadlineMultiplier('hardenedBubbles'),GAME_CONFIG.hazards.hardenedBubbles.deadlineWorkloadMultiplier);
});

test('Drunken Bob guarantees progress after the configured failed-roll cap',()=>{
 let state=createDrunkenBobState(),rng=createGameRng(1);
 const mostlyPopped=bubbles.map((bubble,index)=>({...bubble,popped:index!==9}));
 for(let failure=1;failure<=GAME_CONFIG.hazards.drunkenBob.maximumFailedRolls;failure++){
  let result;
  for(let seed=1;seed<1000;seed++){
   result=resolveDrunkenBobInput({state,bubbles:mostlyPopped,rng:createGameRng(seed)});
   if(!result.madeProgress)break;
  }
  assert.equal(result.madeProgress,false);
  assert.equal(result.state.failedRolls,failure);
  state=result.state;
  rng=result.rng;
 }
 const pity=resolveDrunkenBobInput({state,bubbles:mostlyPopped,rng});
 assert.equal(pity.pity,true);
 assert.equal(pity.madeProgress,true);
 assert.equal(pity.targetIndex,9);
 assert.equal(pity.state.failedRolls,0);
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
