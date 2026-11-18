import type {Rect} from './bubble-grid';
import {DEFAULTS,type Settings} from './bubble-settings';
/** Four spring-driven corner constraints plus eight travelling impulse waves.
 * Not a cloth FEM/self-collision solver. CPU inverse matches GPU perspective.
 */
export class SheetMotion {
 readonly corners=new Float32Array(12);readonly velocity=new Float32Array(12);readonly targets=new Float32Array(12);
 readonly ripples=new Float32Array(32);settings:Settings={...DEFAULTS};time=0;private cursor=0;
 constructor(){for(let i=0;i<8;i++)this.ripples[i*4+2]=-10;}
 impulse(x:number,y:number,strength=1){if(!this.settings.motion)return;const i=(this.cursor++%8)*4;this.ripples.set([x,y,this.time,strength],i);}
 pull(i:number,dx:number,dy:number){if(!this.settings.motion)return;const s=this.settings,l=Math.hypot(dx,dy),f=Math.min(1,s.maxPull/Math.max(1,l))*s.cornerPull;this.targets.set([dx*f,dy*f,Math.min(s.maxPull,l)*s.cornerLift],i*3);}
 release(i:number){this.targets.fill(0,i*3,i*3+3);}
 clear(){this.corners.fill(0);this.targets.fill(0);this.velocity.fill(0);for(let i=0;i<8;i++)this.ripples[i*4+2]=-10;}
 step(dt:number){this.time+=Math.min(dt,.05);if(!this.settings.motion){this.clear();return false;}let active=false;const s=this.settings;
  const steps=Math.max(1,Math.ceil(dt*120)),h=Math.min(dt,.05)/steps;
  for(let j=0;j<steps;j++)for(let i=0;i<12;i++){const d=this.targets[i]-this.corners[i];if(Math.abs(d)>.005||Math.abs(this.velocity[i])>.005){this.velocity[i]+=(d*s.cornerSpring-this.velocity[i]*s.cornerDamping)*h;this.corners[i]+=this.velocity[i]*h;active=true;}else{this.corners[i]=this.targets[i];this.velocity[i]=0;}}
  for(let i=0;i<8;i++)if(this.time-this.ripples[i*4+2]<1.65)active=true;return active;
 }
 deform(rect:Rect,x:number,y:number):{x:number;y:number;z:number}{
  if(!this.settings.motion)return {x,y,z:0};const s=this.settings,u=Math.max(0,Math.min(1,(x-rect.left)/rect.width)),v=Math.max(0,Math.min(1,(y-rect.top)/rect.height));let dx=0,dy=0,z=0;
  for(let i=0;i<4;i++){const w=Math.pow((i%2?u:1-u)*(i>1?v:1-v),s.cornerInfluence);dx+=w*this.corners[i*3];dy+=w*this.corners[i*3+1];z+=w*this.corners[i*3+2];}
  for(let i=0;i<8;i++){const k=i*4,age=this.time-this.ripples[k+2];if(age<0||age>1.65)continue;const d=Math.hypot(x-this.ripples[k],y-this.ripples[k+1]),q=(d-age*s.rippleSpeed)/s.rippleWidth;z+=Math.exp(-q*q*1.5)*Math.sin(q*2.2)*Math.exp(-age*3.8)*s.rippleStrength*this.ripples[k+3];}
  const perspective=s.perspective/(s.perspective-z),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  return {x:cx+(x+dx-cx)*perspective,y:cy+(y+dy-cy)*perspective,z};
 }
 inverse(rect:Rect,x:number,y:number){let px=x,py=y;
  for(let i=0;i<7;i++){const p=this.deform(rect,px,py),ex=p.x-x,ey=p.y-y;if(Math.abs(ex)+Math.abs(ey)<.02)break;const a=this.deform(rect,px+.5,py),b=this.deform(rect,px,py+.5);const ax=(a.x-p.x)*2,ay=(a.y-p.y)*2,bx=(b.x-p.x)*2,by=(b.y-p.y)*2,det=ax*by-ay*bx;if(Math.abs(det)<.05)break;px-=(ex*by-ey*bx)/det;py-=(ey*ax-ex*ay)/det;}
  return {x:px,y:py};
 }
}
