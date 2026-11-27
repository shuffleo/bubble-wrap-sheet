const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readLevelRecords,recordLevelResult}=require('../../.compiled/game/level-records');

function memoryStorage(initial=null){
 let value=initial;
 return {
  getItem:()=>value,
  setItem:(_key,next)=>{value=next;},
  value:()=>value
 };
}

test('missing and damaged level records are ignored',()=>{
 assert.deepEqual(readLevelRecords(null),{});
 assert.deepEqual(readLevelRecords(memoryStorage('{')),{});
});

test('level records keep the fastest time and highest score independently',()=>{
 const storage=memoryStorage();
 recordLevelResult(1,{timeMs:12000.2,score:400},storage);
 recordLevelResult(1,{timeMs:14000,score:600},storage);
 assert.deepEqual(readLevelRecords(storage)[1],{bestTimeMs:12001,bestScore:600});
});
