const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readGameRoute}=require('../../.compiled/game/game-route');

test('game mode requires one exact game=1 query parameter',()=>{
 assert.equal(readGameRoute('').enabled,false);
 assert.equal(readGameRoute('?game=1').enabled,true);
 assert.equal(readGameRoute('?Game=1').enabled,false);
 assert.equal(readGameRoute('?game=true').enabled,false);
 assert.equal(readGameRoute('?game=1&game=1').enabled,false);
 assert.equal(readGameRoute('?x=game=1').enabled,false);
});

test('known fixture screens and states parse without accepting malformed values',()=>{
 assert.deepEqual(readGameRoute('?game=1&screen=shop&category=keyboard-pointer&hud=danger'),{enabled:true,screen:'shop',hudState:'danger',category:'keyboard-pointer',tuning:false});
 assert.equal(readGameRoute('?game=1&screen=unknown').screen,'mode-select');
 assert.equal(readGameRoute('?game=1&screen=shop&screen=hud').screen,'mode-select');
 assert.equal(readGameRoute('?game=1&screen=hud&hud=soft-expired').hudState,'soft-expired');
 assert.equal(readGameRoute('?game=1&tuning=show').tuning,true);
 assert.equal(readGameRoute('?game=1&tuning=SHOW').tuning,false);
});
