const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveManualUpgradeProcs}=require('../../.compiled/game/upgrades');

const bubbles=[
 {index:2,surface:'sheet',eligible:true,popped:false},
 {index:4,surface:'sheet',eligible:true,popped:true},
 {index:6,surface:'sheet',eligible:true,popped:false}
];

test('Fat Finger deterministically assists the first available neighbour',()=>{
 const procs=resolveManualUpgradeProcs({owned:['fatFinger'],neighbours:[4,6,2],bubbles});
 assert.deepEqual(procs,[{upgrade:'fatFinger',index:6}]);
});

test('manual procs do nothing without an owned upgrade or available neighbour',()=>{
 assert.deepEqual(resolveManualUpgradeProcs({owned:[],neighbours:[2],bubbles}),[]);
 assert.deepEqual(resolveManualUpgradeProcs({owned:['fatFinger'],neighbours:[4],bubbles}),[]);
});
