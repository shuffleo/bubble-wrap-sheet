const {test}=require('node:test');
const assert=require('node:assert/strict');
const {classifySheetPattern}=require('../../.compiled/game/sheet-pattern');

test('a horizontal zigzag is recognized and paid once',()=>{
 const points=[];
 for(let row=0;row<4;row++){
  const y=row*35;
  const xs=row%2? [60,40,20,0] : [0,20,40,60];
  for(const x of xs)points.push({x,y});
 }
 assert.equal(classifySheetPattern(points,16),'zigzag');
});

test('an inward swirl is recognized separately from a scattered path',()=>{
 const swirl=[];
 for(let step=0;step<16;step++){
  const angle=step*0.7;
  const radius=80-step*4;
  swirl.push({x:100+Math.cos(angle)*radius,y:100+Math.sin(angle)*radius});
 }
 assert.equal(classifySheetPattern(swirl,16),'swirl');
 const scatter=[{x:0,y:0},{x:40,y:5},{x:8,y:30},{x:50,y:28},{x:12,y:8},{x:30,y:40}];
 assert.equal(classifySheetPattern(scatter,16),null);
});
