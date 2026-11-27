const {test}=require('node:test');
const assert=require('node:assert/strict');
const {GAME_CONFIG}=require('../../.compiled/game/game-config');
const {awardedMedal,formatDuration,medalTargets,nextMedal,upcomingLevels}=require('../../.compiled/game/level-presentation');

test('every level exposes four ordered medal targets with formatted labels',()=>{
 for(const level of GAME_CONFIG.run.levels){
  const targets=medalTargets(level.id);
  assert.deepEqual(targets.map(target=>target.name),['bronze','silver','gold','titanium']);
  assert.ok(targets.every(target=>target.label.length>0));
 }
});

test('medals support higher score and clearance but lower time',()=>{
 assert.equal(awardedMedal(1,GAME_CONFIG.run.levels[0].medals.gold),'gold');
 assert.equal(awardedMedal(2,GAME_CONFIG.run.levels[1].medals.gold),'gold');
 assert.equal(awardedMedal(2,GAME_CONFIG.run.levels[1].medals.gold+1),'silver');
 assert.equal(awardedMedal(5,GAME_CONFIG.run.levels[4].medals.titanium),'titanium');
 assert.equal(awardedMedal(1,0),null);
});

test('next medal reports a concrete improvement and durations keep centiseconds',()=>{
 assert.equal(formatDuration(62_345),'1:02.35');
 assert.deepEqual(nextMedal(1,GAME_CONFIG.run.levels[0].medals.bronze),{name:'silver',gap:'$1,000 more'});
 assert.equal(nextMedal(1,GAME_CONFIG.run.levels[0].medals.titanium),null);
});

test('the planning page previews exactly the next three levels',()=>{
 const previews=upcomingLevels(1);
 assert.deepEqual(previews.map(level=>level.id),[2,3,4]);
 assert.ok(previews.every(level=>level.goal&&level.hazard&&level.medals.length===4));
 assert.ok(previews.every(level=>!`${level.goal} ${level.hazard}`.toLowerCase().includes('bonus objective')));
});
