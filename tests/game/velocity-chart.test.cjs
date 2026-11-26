const {test}=require('node:test');
const assert=require('node:assert/strict');
const {VELOCITY_HISTORY_MS,historySamples,ratePerSecond}=require('../../.compiled/game/velocity-chart');

test('history samples cover the trailing thirty seconds',()=>{
 const samples=historySamples([1,2,4],10_000,VELOCITY_HISTORY_MS);
 assert.equal(samples.length,3);
 assert.equal(samples[0].time,10_000-VELOCITY_HISTORY_MS);
 assert.equal(samples.at(-1).time,10_000);
 assert.deepEqual(samples.map(sample=>sample.value),[1,2,4]);
});

test('an empty history still produces a flat window',()=>{
 const samples=historySamples([],5_000,1_000);
 assert.deepEqual(samples,[{time:4_000,value:0},{time:5_000,value:0}]);
});

test('rolling rate counts only pops inside the scoring window',()=>{
 const now=10_000;
 assert.equal(ratePerSecond([8_000,9_000,9_500],now,1_500),2/1.5);
 assert.equal(ratePerSecond([],now,1_500),0);
 assert.equal(ratePerSecond([1],now,0),0);
});
