const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createGameRng}=require('../../.compiled/game/game-rng');
const {clusterTier,nextClusterArm}=require('../../.compiled/game/cluster-bomb');

const groups=[
 {code:'KeyA',label:'a',indices:[0,1]},
 {code:'KeyB',label:'b',indices:[2,3]}
];

test('cluster bomb stays quiet before the first quarter of a sheet',()=>{
 assert.equal(clusterTier(1,8),0);
 const armed=nextClusterArm({popped:1,total:8,previousTier:0,groups,rng:createGameRng(3)});
 assert.equal(armed.tier,0);
 assert.equal(armed.arm,null);
});

test('cluster bomb arms once at each quarter and does not repeat that quarter',()=>{
 const first=nextClusterArm({popped:2,total:8,previousTier:0,groups,rng:createGameRng(9)});
 assert.equal(first.tier,1);
 assert.ok(first.arm);
 assert.ok(groups.some(group=>group.code===first.arm.code));
 const same=nextClusterArm({popped:3,total:8,previousTier:first.tier,groups,rng:first.rng});
 assert.equal(same.arm,null);
 const second=nextClusterArm({popped:4,total:8,previousTier:first.tier,groups,rng:same.rng});
 assert.equal(second.tier,2);
 assert.ok(second.arm);
 assert.equal(clusterTier(8,8),3);
});
