export interface PatternPoint {x:number;y:number;}
export type SheetPattern='zigzag'|'swirl';

/** Classifies a manual pop path. Zigzag wins over swirl so one sheet pays once. */
export function classifySheetPattern(points:readonly PatternPoint[],radius:number):SheetPattern|null {
 if(points.length<6||!(radius>0))return null;
 if(isZigzag(points,radius))return 'zigzag';
 if(isSwirl(points)||isConcentric(points,radius))return 'swirl';
 return null;
}

function isZigzag(points:readonly PatternPoint[],radius:number):boolean {
 const pitch=radius*1.75;
 const segments:{row:number;xs:number[]}[]=[];
 for(const point of points){
  const row=Math.round(point.y/pitch);
  const last=segments[segments.length-1];
  if(!last||last.row!==row)segments.push({row,xs:[point.x]});
  else last.xs.push(point.x);
 }
 if(segments.length<3||new Set(segments.map(segment=>segment.row)).size<3)return false;
 const rows=segments.map(segment=>segment.row);
 if(new Set(rows).size!==rows.length)return false;
 const vertical=Math.sign(rows[1]-rows[0]);
 if(vertical===0)return false;
 for(let index=1;index<rows.length;index++)if(Math.sign(rows[index]-rows[index-1])!==vertical)return false;
 let previousDirection=0;
 for(const segment of segments){
  if(segment.xs.length<2)return false;
  const direction=Math.sign(segment.xs[segment.xs.length-1]-segment.xs[0]);
  if(direction===0)return false;
  for(let index=1;index<segment.xs.length;index++)if((segment.xs[index]-segment.xs[index-1])*direction<-radius*0.5)return false;
  if(previousDirection!==0&&direction===previousDirection)return false;
  previousDirection=direction;
 }
 return true;
}

function isSwirl(points:readonly PatternPoint[]):boolean {
 const center=centroid(points);
 let angle=Math.atan2(points[0].y-center.y,points[0].x-center.x);
 let turned=0,positive=0,negative=0;
 const radii=points.map(point=>Math.hypot(point.x-center.x,point.y-center.y));
 for(let index=1;index<points.length;index++){
  const next=Math.atan2(points[index].y-center.y,points[index].x-center.x);
  let delta=next-angle;
  while(delta>Math.PI)delta-=Math.PI*2;
  while(delta<-Math.PI)delta+=Math.PI*2;
  turned+=delta;
  if(delta>0.05)positive++;
  else if(delta<-0.05)negative++;
  angle=next;
 }
 const steps=positive+negative;
 if(steps<5||Math.max(positive,negative)/steps<0.75||Math.abs(turned)<Math.PI*1.25)return false;
 return Math.abs(correlation(radii.map((_,index)=>index),radii))>=0.45;
}

function isConcentric(points:readonly PatternPoint[],radius:number):boolean {
 const center=centroid(points);
 const width=radius*1.8;
 const rings=points.map(point=>Math.round(Math.hypot(point.x-center.x,point.y-center.y)/width));
 const groups:{ring:number;angles:number[]}[]=[];
 points.forEach((point,index)=>{
  const ring=rings[index];
  const angle=Math.atan2(point.y-center.y,point.x-center.x);
  const last=groups[groups.length-1];
  if(!last||last.ring!==ring)groups.push({ring,angles:[angle]});
  else last.angles.push(angle);
 });
 if(groups.length<2||groups.some(group=>group.angles.length<3))return false;
 const order=groups.map(group=>group.ring);
 const direction=Math.sign(order[1]-order[0]);
 if(direction===0)return false;
 for(let index=1;index<order.length;index++)if(Math.sign(order[index]-order[index-1])!==direction)return false;
 return groups.every(group=>angularRun(group.angles)>=0.7);
}

function angularRun(angles:readonly number[]):number {
 let positive=0,negative=0;
 for(let index=1;index<angles.length;index++){
  let delta=angles[index]-angles[index-1];
  while(delta>Math.PI)delta-=Math.PI*2;
  while(delta<-Math.PI)delta+=Math.PI*2;
  if(delta>0.05)positive++;
  else if(delta<-0.05)negative++;
 }
 const steps=positive+negative;
 return steps?Math.max(positive,negative)/steps:0;
}

function centroid(points:readonly PatternPoint[]):PatternPoint {
 const count=points.length||1;
 return {
  x:points.reduce((sum,point)=>sum+point.x,0)/count,
  y:points.reduce((sum,point)=>sum+point.y,0)/count
 };
}

function correlation(left:readonly number[],right:readonly number[]):number {
 const count=Math.min(left.length,right.length);
 if(count<3)return 0;
 const mean=(values:readonly number[])=>values.reduce((sum,value)=>sum+value,0)/count;
 const leftMean=mean(left),rightMean=mean(right);
 let product=0,leftSquare=0,rightSquare=0;
 for(let index=0;index<count;index++){
  const leftDelta=left[index]-leftMean,rightDelta=right[index]-rightMean;
  product+=leftDelta*rightDelta;
  leftSquare+=leftDelta*leftDelta;
  rightSquare+=rightDelta*rightDelta;
 }
 const scale=Math.sqrt(leftSquare*rightSquare);
 return scale===0?0:product/scale;
}
