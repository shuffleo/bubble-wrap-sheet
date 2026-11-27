import {DEFAULTS,type Settings} from './bubble-settings';
export interface BubblePoint { x:number; y:number; radius:number; row:number; col:number; key:string; surface:string; mode:'poppable'|'spring-return'; eligible?:boolean; cut?:boolean; visible?:boolean; }
export interface TimedReset {duration:number;elapsed:()=>number;}
export type PopListener=(index:number)=>void;
/** All motion is imperative. No React updates, allocations, or variable-step springs. */
export class BubblePhysics {
 readonly squish:Float32Array; readonly velocity:Float32Array; readonly targetSquish:Float32Array; readonly isPopped:Float32Array;
 readonly bounce:Float32Array;readonly bounceVelocity:Float32Array;readonly tapCount:Uint16Array;
 settings:Settings={...DEFAULTS};
 readonly resetAt:Float64Array; readonly neighbors:Int32Array;
 private refillStart:Float64Array;private refillLength:Float64Array;private refillX:Float32Array;private refillV:Float32Array;private refillClock:(()=>number)|null=null;
 time=0; private accumulator=0;
 constructor(readonly points:BubblePoint[],private onPop:PopListener,private beforePop:(index:number)=>boolean=()=>true){
  const n=points.length;this.refillStart=new Float64Array(n).fill(-1);this.refillLength=new Float64Array(n);this.refillX=new Float32Array(n);this.refillV=new Float32Array(n);this.bounce=new Float32Array(n);this.bounceVelocity=new Float32Array(n);this.tapCount=new Uint16Array(n);this.squish=new Float32Array(n);this.velocity=new Float32Array(n);this.targetSquish=new Float32Array(n);this.isPopped=new Float32Array(n);this.resetAt=new Float64Array(n).fill(-1);this.neighbors=new Int32Array(n*6).fill(-1);
  points.forEach((p,i)=>{if(p.cut){this.squish[i]=1;this.targetSquish[i]=1;this.isPopped[i]=1;}});
  const map=new Map(points.map((p,i)=>[`${p.surface}:${p.row}:${p.col}`,i]));
  points.forEach((p,i)=>{const odd=p.row&1;const ds=[[0,-1],[0,1],[-1,odd-1],[-1,odd],[1,odd-1],[1,odd]];ds.forEach(([r,c],j)=>{this.neighbors[i*6+j]=map.get(`${p.surface}:${p.row+r}:${p.col+c}`)??-1;});});
 }
 pop(i:number):boolean{
  if(i<0||i>=this.points.length||this.isPopped[i]||this.points[i].cut||this.points[i].eligible===false)return false;
  if(this.points[i].mode==='spring-return'){this.targetSquish[i]=.78;return false;}
  if(!this.beforePop(i)){this.targetSquish[i]=0;this.velocity[i]=Math.min(0,this.velocity[i]);return false;}
  this.refillStart[i]=-1;this.isPopped[i]=1;this.targetSquish[i]=1;this.velocity[i]=Math.max(this.velocity[i],this.settings.popImpulse*this.settings.collapseSpeed);this.resetAt[i]=-1;
  for(let k=0;k<6;k++){const j=this.neighbors[i*6+k];if(j>=0&&!this.isPopped[j])this.velocity[j]-=this.settings.neighborRipple;}
  this.onPop(i);return true;
 }
 jiggle(i:number){if(i<0||i>=this.points.length||this.points[i].cut)return;this.tapCount[i]++;this.bounceVelocity[i]=Math.min(24,this.bounceVelocity[i]+10*this.settings.bounceStrength);}
 press(i:number,pressure=1){if(i<0||i>=this.points.length||this.isPopped[i]||this.points[i].cut||this.points[i].eligible===false)return;this.refillStart[i]=-1;this.targetSquish[i]=Math.max(this.targetSquish[i],Math.min(1,pressure)*.9);}
 release(i:number){if(i>=0&&i<this.points.length&&!this.isPopped[i])this.targetSquish[i]=0;}
 reinflate(i:number):boolean{
  if(i<0||i>=this.points.length||!this.isPopped[i]||this.points[i].cut||this.points[i].eligible===false)return false;
  this.refillStart[i]=-1;this.isPopped[i]=0;this.targetSquish[i]=0;this.resetAt[i]=-1;this.velocity[i]=Math.min(this.velocity[i],-this.settings.popImpulse*this.settings.pressSpeed);
  return true;
 }
 reset(surface?:string,immediate=false,timeline?:TimedReset){
  if(timeline&&!immediate&&timeline.duration>0){this.timedReset(surface,timeline);return;}
  this.refillStart.fill(-1);this.refillClock=null;
  const ps=this.points;let max=1;for(let i=0;i<ps.length;i++)if(!surface||ps[i].surface===surface)max=Math.max(max,ps[i].x+ps[i].y*.6);
  for(let i=0;i<ps.length;i++)if(!surface||ps[i].surface===surface){if(ps[i].cut){this.squish[i]=1;this.velocity[i]=0;this.targetSquish[i]=1;this.isPopped[i]=1;this.resetAt[i]=-1;continue;}this.isPopped[i]=0;this.targetSquish[i]=0;this.resetAt[i]=immediate?-1:this.time+(ps[i].x+ps[i].y*.6)/max*this.settings.resetDuration;if(immediate){this.squish[i]=0;this.velocity[i]=0;}}
 }
 /** Reset-only analytic spring, time-normalized to the sound's duration.
  * The ordinary press/pop solver is unchanged. Each local reinflation gets
  * 45% of the shared duration, following a 55% diagonal travel window.
  * Audio/wall clock rather than accumulated RAF dt avoids slow-frame drift. */
 private timedReset(surface:string|undefined,timeline:TimedReset){
  this.refillClock=timeline.elapsed;const indices:number[]=[];let lo=Infinity,hi=-Infinity;
  for(let i=0;i<this.points.length;i++){const p=this.points[i];if(surface&&p.surface!==surface)continue;
   this.refillStart[i]=-1;this.resetAt[i]=-1;this.bounce[i]=0;this.bounceVelocity[i]=0;
   if(p.cut){this.isPopped[i]=1;this.squish[i]=1;this.velocity[i]=0;this.targetSquish[i]=1;continue;}
   if(this.isPopped[i]||Math.abs(this.squish[i])>.0003){indices.push(i);const rank=p.x+p.y*.6;lo=Math.min(lo,rank);hi=Math.max(hi,rank);}
   this.isPopped[i]=0;this.targetSquish[i]=0;
  }
  for(const i of indices){const p=this.points[i],wave=indices.length>1&&hi>lo?(p.x+p.y*.6-lo)/(hi-lo):0;
   this.refillStart[i]=wave*timeline.duration*.55;this.refillLength[i]=timeline.duration*(indices.length>1?.45:1);
   this.refillX[i]=this.squish[i];this.refillV[i]=this.velocity[i];this.resetAt[i]=this.time+this.refillStart[i];
  }
 }
 private stepRefill(i:number,elapsed:number){
  const start=this.refillStart[i],length=this.refillLength[i];if(elapsed<start)return;
  const t=Math.max(0,Math.min(1,(elapsed-start)/Math.max(.001,length)));
  if(t>=1-1e-9){this.squish[i]=0;this.velocity[i]=0;this.resetAt[i]=-1;this.refillStart[i]=-1;return;}
  const a=this.refillX[i],b=(this.refillV[i]*length+6*a)/8,decay=Math.exp(-6*t),co=Math.cos(8*t),si=Math.sin(8*t);
  const residual=Math.exp(-6)*(a*Math.cos(8)+b*Math.sin(8)),smooth=t*t*(3-2*t);
  this.squish[i]=Math.max(-.14,Math.min(1.14,decay*(a*co+b*si)-residual*smooth));
  this.velocity[i]=(decay*((-6*a+8*b)*co+(-6*b-8*a)*si)-residual*6*t*(1-t))/length;
 }
 hasMotion(){for(let i=0;i<this.points.length;i++)if(this.refillStart[i]>=0||this.resetAt[i]>=0||Math.abs(this.squish[i]-this.targetSquish[i])>=.0003||Math.abs(this.velocity[i])>=.003||Math.abs(this.bounce[i])>.0003||Math.abs(this.bounceVelocity[i])>.003)return true;return false;}
 step(dt:number):boolean{
  this.accumulator+=Math.min(Math.max(dt,0),.05);let active=false;const step=1/120;
  const refillElapsed=this.refillClock?.()??0;
  while(this.accumulator>=step){this.accumulator-=step;this.time+=step;
   for(let i=0;i<this.points.length;i++){
    if(Math.abs(this.bounce[i])>.0003||Math.abs(this.bounceVelocity[i])>.003){this.bounceVelocity[i]+=(-130*this.bounce[i]-this.settings.bounceDamping*this.bounceVelocity[i])*step;this.bounce[i]+=this.bounceVelocity[i]*step;active=true;}else{this.bounce[i]=0;this.bounceVelocity[i]=0;}
    if(this.refillStart[i]>=0){this.stepRefill(i,refillElapsed);active=true;continue;}
    if(this.resetAt[i]>=this.time){active=true;continue;}
    if(this.resetAt[i]>=0){this.resetAt[i]=-1;this.targetSquish[i]=this.isPopped[i]?1:0;}
    const x=this.squish[i],v=this.velocity[i],t=this.targetSquish[i];
    if(Math.abs(x-t)<.0003&&Math.abs(v)<.003){this.squish[i]=t;this.velocity[i]=0;continue;}
    active=true;const k=this.isPopped[i]?this.settings.collapseSpring:this.settings.spring;const c=this.isPopped[i]?this.settings.collapseDamping:this.settings.damping;
    // Time-scaled spring: k*r^2 and c*r preserve the damping ratio.
    // A fixed-step solver and rate-scaled kick keep the original curve at r=1.
    const rate=this.isPopped[i]?this.settings.collapseSpeed:this.settings.pressSpeed;
    const nv=v+((t-x)*k*rate*rate-c*rate*v)*step;this.velocity[i]=nv;this.squish[i]=Math.max(-.14,Math.min(1+this.settings.reboundLimit,x+nv*step));
    if(!this.isPopped[i]&&this.points[i].mode==='poppable'&&this.targetSquish[i]>=this.settings.popThreshold&&this.squish[i]>=this.settings.popThreshold)this.pop(i);
   }
  }return active||this.hasMotion();
 }
}
