const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialSession,LEGAL_TRANSITIONS,reduceSession}=require('../../.compiled/game/game-reducer');

function accepted(session,action){
 const result=reduceSession(session,action);
 assert.equal(result.accepted,true,result.reason);
 return result.state;
}

test('a new run follows the legal intro and sheet-transition phases',()=>{
 let session=initialSession(77);
 session=accepted(session,{type:'select-survival-run'});
 assert.equal(session.run.phase,'level-intro');
 assert.equal(session.run.encounter.levelId,1);
 session=accepted(session,{type:'finish-level-intro'});
 session=accepted(session,{type:'begin-sheet-transition'});
 assert.equal(session.run.phase,'sheet-transition');
 session=accepted(session,{type:'finish-sheet-transition'});
 assert.equal(session.run.phase,'playing');
});

test('illegal transitions return the original session unchanged',()=>{
 const session=initialSession(12);
 const result=reduceSession(session,{type:'complete-level'});
 assert.equal(result.accepted,false);
 assert.equal(result.state,session);
 assert.equal(result.reason,'illegal-transition:mode-select:complete-level');
});

test('level completion follows config shops and reaches run won',()=>{
 let session={...initialSession(3),run:{...initialSession(3).run,phase:'playing',level:1}};
 session=accepted(session,{type:'complete-level'});
 assert.equal(session.run.phase,'level-intro');
 assert.equal(session.run.level,2);
 session={...session,run:{...session.run,phase:'playing'}};
 session=accepted(session,{type:'complete-level'});
 assert.equal(session.run.phase,'shop');
 session=accepted(session,{type:'leave-shop'});
 assert.equal(session.run.level,3);
 assert.equal(session.run.phase,'level-intro');
 session={...session,run:{...session.run,phase:'playing',level:5}};
 session=accepted(session,{type:'complete-level'});
 assert.equal(session.run.phase,'run-won');
});

test('reset clears every transient run subsystem',()=>{
 const base=initialSession(1);
 const dirty={
  ...base,
  clock:{gameTimeMs:9000,paused:true,hidden:true},
  rng:{seed:1,cursor:99},
  run:{...base.run,phase:'shop',level:3,score:400,upgrades:['fatFinger'],rerollUsed:true,calibration:{popsPerSecond:8,sampledWindowMs:3000},encounter:{levelId:3,sheetIndex:2,sheetCount:5,bubblesRemaining:4,hazardId:'memoryFoam'},stats:{manualPops:12,assistedPops:3,scoreEvents:15}}
 };
 const result=reduceSession(dirty,{type:'reset',seed:42});
 assert.equal(result.accepted,true);
 assert.deepEqual(result.state,initialSession(42));
});

test('the transition table covers every phase and reset is always legal',()=>{
 assert.deepEqual(Object.keys(LEGAL_TRANSITIONS).sort(),['level-intro','mode-select','playing','run-lost','run-won','sheet-transition','shop']);
 for(const actions of Object.values(LEGAL_TRANSITIONS))assert.ok(actions.includes('reset'));
});
