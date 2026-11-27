const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGameRng,forkRng,nextInt,nextUnit,pickWeighted}=require('../../.compiled/game/game-rng');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');

function units(seed,count){
 let state=createGameRng(seed),values=[];
 for(let index=0;index<count;index++){const draw=nextUnit(state);state=draw.state;values.push(draw.value);}
 return {state,values};
}

test('the same seed produces the same deterministic sequence',()=>{
 assert.deepEqual(units(123456,100),units(123456,100));
 assert.notDeepEqual(units(123456,10).values,units(654321,10).values);
});

test('serialized RNG state resumes the uninterrupted sequence',()=>{
 let state=units(99,12).state;
 const restored=JSON.parse(JSON.stringify(state));
 for(let index=0;index<40;index++){
  const left=nextUnit(state),right=nextUnit(restored);
  assert.equal(left.value,right.value);
  state=left.state;
  restored.seed=right.state.seed;
  restored.cursor=right.state.cursor;
 }
});

test('integer and weighted picks stay in bounds',()=>{
 let state=createGameRng(7);
 for(let index=0;index<100;index++){
  const draw=nextInt(state,3,8);state=draw.state;
  assert.ok(Number.isInteger(draw.value)&&draw.value>=3&&draw.value<=8);
 }
 const hazard=pickWeighted(state,GAME_CONFIG.hazards.selectionWeights);
 assert.ok(Object.hasOwn(GAME_CONFIG.hazards.selectionWeights,hazard.value));
});

test('named forks are stable and independent from the parent cursor',()=>{
 const parent=units(42,4).state;
 assert.deepEqual(forkRng(parent,'shop'),forkRng(parent,'shop'));
 assert.notDeepEqual(forkRng(parent,'shop'),forkRng(parent,'hazard'));
 assert.equal(parent.cursor,4);
});
