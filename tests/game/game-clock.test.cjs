const {test}=require('node:test');
const assert=require('node:assert/strict');
const {advanceGameClock,createGameClock,readGameTimeMs,setClockHidden,setClockPaused}=require('../../.compiled/game/game-clock');

test('active game time accumulates explicit wall deltas',()=>{
 let clock=createGameClock();
 clock=advanceGameClock(clock,16);
 clock=advanceGameClock(clock,34);
 assert.equal(readGameTimeMs(clock),50);
});

test('paused and hidden clocks do not advance',()=>{
 const active=advanceGameClock(createGameClock(),100);
 const paused=advanceGameClock(setClockPaused(active,true),10000);
 const hidden=advanceGameClock(setClockHidden(active,true),10000);
 const both=advanceGameClock(setClockHidden(setClockPaused(active,true),true),10000);
 assert.equal(paused.gameTimeMs,100);
 assert.equal(hidden.gameTimeMs,100);
 assert.equal(both.gameTimeMs,100);
});

test('time resumes only after both pause gates clear',()=>{
 let clock=setClockHidden(setClockPaused(createGameClock(),true),true);
 clock=advanceGameClock(clock,1000);
 clock=setClockPaused(clock,false);
 clock=advanceGameClock(clock,1000);
 assert.equal(clock.gameTimeMs,0);
 clock=setClockHidden(clock,false);
 clock=advanceGameClock(clock,250);
 assert.equal(clock.gameTimeMs,250);
});

test('invalid clock deltas are rejected',()=>{
 assert.throws(()=>advanceGameClock(createGameClock(),-1),/finite and non-negative/);
 assert.throws(()=>advanceGameClock(createGameClock(),Number.NaN),/finite and non-negative/);
});
