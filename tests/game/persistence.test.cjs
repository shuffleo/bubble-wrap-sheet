const {test}=require('node:test');
const assert=require('node:assert/strict');
const {initialSession}=require('../../.compiled/game/game-reducer');
const {parseSession,serializeSession}=require('../../.compiled/game/persistence');

test('game sessions serialize and resume without losing deterministic state',()=>{
 const base=initialSession(44);
 const session={...base,clock:{gameTimeMs:321,paused:false,hidden:false},rng:{seed:44,cursor:7},run:{...base.run,phase:'playing',score:900,upgrades:['fatFinger']}};
 assert.deepEqual(parseSession(serializeSession(session)),session);
});

test('malformed and unsupported session envelopes are rejected',()=>{
 assert.throws(()=>parseSession('{'),/malformed/);
 assert.throws(()=>parseSession(JSON.stringify({version:999,session:initialSession(1)})),/Unsupported session version/);
 assert.throws(()=>parseSession(JSON.stringify({version:1,session:null})),/payload is invalid/);
});

test('non-finite numbers cannot be serialized',()=>{
 const session=initialSession(1);
 session.run.score=Number.NaN;
 assert.throws(()=>serializeSession(session),/must be finite/);
});
