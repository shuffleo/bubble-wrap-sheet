const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EMPTY_HIGH_SCORES,readGameHighScores}=require('../../.compiled/game/game-high-scores');

const storage=value=>({getItem:()=>value});

test('missing or damaged local scores use empty placeholders',()=>{
 assert.deepEqual(readGameHighScores(null),EMPTY_HIGH_SCORES);
 assert.deepEqual(readGameHighScores(storage('{')),EMPTY_HIGH_SCORES);
});

test('valid score categories load independently',()=>{
 assert.deepEqual(readGameHighScores(storage(JSON.stringify({touch:1200,keyboardPointer:4500}))),{touch:1200,keyboardPointer:4500});
 assert.deepEqual(readGameHighScores(storage(JSON.stringify({touch:-1,keyboardPointer:700}))),{touch:null,keyboardPointer:700});
});
