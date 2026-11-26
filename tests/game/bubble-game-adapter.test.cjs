const {test}=require('node:test');
const assert=require('node:assert/strict');
const {BubbleGameAdapter}=require('../../.compiled/game/bubble-game-adapter');

class FakeEngine extends EventTarget {
 constructor(){
  super();
  this.items=[
   {index:0,surface:'sheet',eligible:true,popped:false},
   {index:1,surface:'sheet',eligible:true,popped:false},
   {index:2,surface:'sheet',eligible:false,popped:false}
  ];
 }
 getGameBubbles(){return this.items.map(item=>({...item}));}
 getGameNeighbours(index){return index===0?[1]:index===1?[0]:[];}
 popForGame(index,source){
  const item=this.items[index];
  if(!item||!item.eligible||item.popped)return false;
  item.popped=true;
  this.dispatchEvent(new CustomEvent('bubblepop',{detail:{index,key:`sheet:0:${index}`,surface:'sheet',source}}));
  return true;
 }
 manual(index,input,gestureId='gesture:1'){
  const item=this.items[index];item.popped=true;
  this.dispatchEvent(new CustomEvent('bubblepop',{detail:{index,key:`sheet:0:${index}`,surface:'sheet',source:{type:'manual',input,gestureId}}}));
 }
}

test('category locks on the first successful manual pop',()=>{
 const engine=new FakeEngine(),adapter=new BubbleGameAdapter(engine),events=[];
 adapter.addEventListener('gamepop',event=>events.push(event.detail));
 engine.manual(0,'touch');
 engine.items[1].popped=false;
 engine.manual(1,'keyboard','key:KeyQ');
 assert.equal(adapter.category,'touch');
 assert.deepEqual(events.map(event=>event.category),['touch','touch']);
 adapter.dispose();
});

test('automated pops cannot choose or change the run category',()=>{
 const engine=new FakeEngine(),adapter=new BubbleGameAdapter(engine);
 assert.equal(adapter.pop(0,{type:'assisted',upgrade:'fatFinger'}),true);
 assert.equal(adapter.category,null);
 engine.manual(1,'mouse');
 assert.equal(adapter.category,'keyboard-pointer');
 adapter.dispose();
});

test('bounded methods return copies and reject unavailable bubbles',()=>{
 const engine=new FakeEngine(),adapter=new BubbleGameAdapter(engine);
 const bubbles=adapter.bubbles();
 bubbles[0].popped=true;
 assert.equal(engine.items[0].popped,false);
 assert.deepEqual(adapter.neighbours(0),[1]);
 assert.equal(adapter.pop(2,{type:'hazard',hazard:'memoryFoam'}),false);
 assert.equal(adapter.pop(99,{type:'system',reason:'test'}),false);
 adapter.dispose();
});

test('random assisted selection only considers eligible unpopped bubbles',()=>{
 const engine=new FakeEngine(),adapter=new BubbleGameAdapter(engine);
 assert.equal(adapter.popRandom({type:'assisted',upgrade:'roughTable'},()=>0.999),1);
 assert.equal(adapter.popRandom({type:'assisted',upgrade:'roughTable'},()=>0),0);
 assert.equal(adapter.popRandom({type:'assisted',upgrade:'roughTable'},()=>0),-1);
 adapter.dispose();
});

test('dispose stops forwarding engine events',()=>{
 const engine=new FakeEngine(),adapter=new BubbleGameAdapter(engine);
 let count=0;adapter.addEventListener('gamepop',()=>count++);
 adapter.dispose();engine.manual(0,'pen');
 assert.equal(count,0);
});
