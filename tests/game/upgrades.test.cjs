const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {resolveManualUpgradeProcs}=require('../../.compiled/game/upgrades');

const bubbles=[
 {index:2,surface:'sheet',eligible:true,popped:false},
 {index:4,surface:'sheet',eligible:true,popped:true},
 {index:6,surface:'sheet',eligible:true,popped:false}
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
