const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {
 advanceConveyor,
 conveyorClearance,
 conveyorSpeedMultiplier,
 createConveyorState,
 recordConveyorMiss,
 recordConveyorPop
}=require('../../.compiled/game/conveyor');

test('conveyor spawns deterministically, changes speed, and reserves cleanup time',()=>{
 const rng=createGameRng(44);
 const first=advanceConveyor({state:createConveyorState(),activeDeltaMs:1,rng});
 const repeated=advanceConveyor({state:createConveyorState(),activeDeltaMs:1,rng:createGameRng(44)});
 assert.deepEqual(first,repeated);
 assert.deepEqual(first.spawnLanes,[]);
 assert.equal(first.state.totalSpawned,0);
 assert.equal(conveyorSpeedMultiplier(0),GAME_CONFIG.conveyor.speedStages[0].multiplier);
 assert.equal(conveyorSpeedMultiplier(GAME_CONFIG.conveyor.speedStages[1].atMs),GAME_CONFIG.conveyor.speedStages[1].multiplier);
 const complete=advanceConveyor({
  state:first.state,
  activeDeltaMs:GAME_CONFIG.conveyor.durationMs,
  rng:first.rng
 });
 assert.equal(complete.state.finished,true);
 assert.equal(complete.state.nextSpawnAtMs,GAME_CONFIG.conveyor.durationMs-GAME_CONFIG.conveyor.cleanupWindowMs);
 assert.deepEqual(complete.spawnLanes,[]);
});

test('clearance includes only configured insured misses',()=>{
 let state={...createConveyorState(),totalSpawned:10};
 for(let index=0;index<6;index++)state=recordConveyorPop(state);
 for(let index=0;index<5;index++)state=recordConveyorMiss(state,['bubbleInsurance']).state;
 assert.equal(state.insuredMisses,GAME_CONFIG.upgrades.bubbleInsurance.insuredMisses);
 assert.equal(state.missed,5);
 assert.equal(conveyorClearance(state),0.9);
 const uninsured=recordConveyorMiss(createConveyorState(),[]);
 assert.equal(uninsured.insured,false);
});
