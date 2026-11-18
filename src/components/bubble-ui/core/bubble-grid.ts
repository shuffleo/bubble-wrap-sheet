import type {BubblePoint} from './bubble-physics';
export interface Rect {left:number;top:number;width:number;height:number;}
export interface SurfaceConfig {layout?:'grid'|'single';bubbleSize?:number;gap?:number;mode?:'poppable'|'spring-return';cornerRadius?:number;cornerVariation?:number;edgeRoughness?:number;edgeScale?:number;edgeSeed?:number;onPop?:(count:number)=>void;onAllPopped?:()=>void;}
export function hash(n:number){const v=Math.sin(n*127.1+311.7)*43758.5453123;return v-Math.floor(v);}
/** Same deterministic ragged boundary as GLSL, in undeformed sheet coordinates. */
export function edgeInset(t:number,seed:number,roughness:number,scale:number){
 const q=t/Math.max(1,scale);
 return roughness*(.5+.25*Math.sin(q+seed)+.15*Math.sin(q*2.37+seed*1.7)+.10*Math.sin(q*5.13+seed*.7));
}
export function boundaryDistance(rect:Rect,x:number,y:number,cornerRadius=5,roughness=0,scale=24,seed=17,variation=0):number{
 const px=x-rect.left,py=y-rect.top,cx=rect.width/2,cy=rect.height/2;
 const left=px<cx,top=py<cy,quadrant=(top?0:2)+(left?0:1);
 const cr=Math.min(Math.max(0,cornerRadius*(1+variation*Math.sin(seed+quadrant*2.7))),cx,cy);
 const ix=edgeInset(py,seed+(left?1:4),roughness,scale),iy=edgeInset(px,seed+(top?7:11),roughness,scale);
 const qx=Math.abs(px-cx)-(cx-cr)+ix,qy=Math.abs(py-cy)-(cy-cr)+iy;
 return Math.hypot(Math.max(0,qx),Math.max(0,qy))+Math.min(Math.max(qx,qy),0)-cr;
}
// Independent deterministic permutations. Each run of 320 columns uses all
// variants once; adjacent hexes cannot select the same cell. Extra continuous
// local warps in the shader avoid an exact repeated stamp on larger sheets.
function permutation(seed:number):number[]{
 const a=Array.from({length:320},(_,i)=>i);
 for(let i=319;i>0;i--){const j=Math.floor(hash(seed+i*7.31)*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
const inflatedOrder=permutation(21.13),collapsedOrder=permutation(816.71);
export function materialVariant(row:number,col:number,collapsed=false):number{
 const n=collapsed?row*97+col*73:row*137+col*41;
 return (collapsed?collapsedOrder:inflatedOrder)[((n%320)+320)%320];
}
export function makeGrid(rect:Rect,id:string,config:SurfaceConfig):BubblePoint[]{
 const size=Math.max(24,Math.min(160,config.bubbleSize??52));
 const pitch=size+Math.max(0,config.gap??6),dy=pitch*Math.sqrt(3)/2;const pts:BubblePoint[]=[];
 if(config.layout==='single')return [{x:rect.left+rect.width/2,y:rect.top+rect.height/2,radius:Math.min(size/2,rect.width/2-1,rect.height/2-1),row:0,col:0,key:`${id}:0:0`,surface:id,mode:config.mode??'spring-return',eligible:true,cut:false,visible:true}];
 const rows=Math.ceil(rect.height/dy)+1,cols=Math.ceil(rect.width/pitch)+1;
 for(let row=-1;row<rows;row++)for(let col=-1;col<cols;col++){
  const x=rect.left+pitch*.5+col*pitch+(row&1)*pitch*.5,y=rect.top+pitch*.5+row*dy;
  const sd=boundaryDistance(rect,x,y,config.cornerRadius??5,config.edgeRoughness??0,config.edgeScale??24,config.edgeSeed??17,config.cornerVariation??0);
  // Include the irregular seal/UV offset in the membrane footprint. A circle
  // crossing a straight edge OR rounded corner is cut, not a poppable target.
  const footprint=size*.5*1.055;
  let cut=sd>-footprint;
  for(let a=0;a<24&&!cut;a++){const angle=a*Math.PI/12;cut=boundaryDistance(rect,x+Math.cos(angle)*footprint,y+Math.sin(angle)*footprint,config.cornerRadius??5,config.edgeRoughness??0,config.edgeScale??24,config.edgeSeed??17,config.cornerVariation??0)>-.25;}
  pts.push({x,y,radius:size*.5,row,col,key:`${id}:${row}:${col}`,surface:id,mode:config.mode??'poppable',eligible:!cut,cut,visible:sd<footprint});
 }
 return pts;
}
