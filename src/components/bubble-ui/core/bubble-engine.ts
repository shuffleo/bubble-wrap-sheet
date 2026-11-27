import {sheetEase} from './bubble-refresh';
import type {RefillTimeline} from './bubble-audio';
import {freshSeedSettings} from './bubble-random';
import {buildKeyboardMapping,pickUnpopped,type KeyboardMapping} from './bubble-keyboard';
import {BUBBLE_SIZE_MAX,BUBBLE_SIZE_MIN,DEFAULTS,sanitizeSettings,type Settings} from './bubble-settings';
import {SheetMotion} from './bubble-motion';
import {atlasURL,collapsedAtlasURL} from './bubble-atlas';
import {vertexShader,fragmentShader} from './bubble-shader';
import {BubblePhysics,type BubblePoint} from './bubble-physics';
import {BubbleAudio} from './bubble-audio';
import {makeGrid,hash,materialVariant,boundaryDistance,type Rect,type SurfaceConfig} from './bubble-grid';
export interface BubbleStats {popped:number;total:number;drawCalls:number;instances:number;surfaces:number;dpr:number;audio:string;activePointers:number;frames:number;}
export interface SurfaceHandle {reset:(immediate?:boolean)=>void;update:(options:SurfaceConfig)=>void;dispose:()=>void;}
export type ManualPopInput='touch'|'mouse'|'pen'|'keyboard';
export type ManualPopSource={type:'manual';input:ManualPopInput;gestureId:string};
export type AutomatedPopSource=
 |{type:'assisted';upgrade:string}
 |{type:'hazard';hazard:string}
 |{type:'system';reason:string};
export type BubblePopSource=ManualPopSource|AutomatedPopSource;
export interface BubblePopDetail {index:number;key:string;surface:string;source:BubblePopSource;}
export interface GameBubbleSnapshot {index:number;surface:string;eligible:boolean;popped:boolean;}
interface SheetExchange {old:Float32Array[];oldCount:number;timeline:RefillTimeline;progress:number;distance:number;slide:boolean;}
interface Surface {completed:boolean;id:string;node:HTMLElement;config:SurfaceConfig;rect:Rect;off:()=>void;}
interface Pointer {id:number;surface:string;x:number;y:number;startX:number;startY:number;index:number;visited:Set<number>;gentle:boolean;input:ManualPopInput;gestureId:string;}
let engineId=0;
const activeCanvas=new WeakMap<HTMLCanvasElement,BubbleEngine>();
const activeDocument=new WeakMap<Document,BubbleEngine>();
/** Single WebGL2 context, instanced hex tiles, CSS-pixel coordinates.
 * An opaque analytic material composites transmission against its own procedural
 * backing. It does NOT claim to refract arbitrary DOM content behind the canvas.
 */
export class BubbleEngine extends EventTarget {
 readonly audio=new BubbleAudio();readonly motion=new SheetMotion();settings:Settings=freshSeedSettings(DEFAULTS);private vertexCount=0;private neighborData:Float32Array[]=[];private cornerBindings:{node:HTMLElement;index:number;off:()=>void}[]=[];readonly canvas:HTMLCanvasElement;
 private gl:WebGL2RenderingContext;private program!:WebGLProgram;private vao!:WebGLVertexArrayObject;
 private buffers:WebGLBuffer[]=[];private texture!:WebGLTexture;private atlas!:WebGLTexture;private collapsedAtlas!:WebGLTexture;private atlasReady=0;private textureGeneration=0;private uniforms:Record<string,WebGLUniformLocation|null>={};
 private surfaces=new Map<string,Surface>();private pointers=new Map<number,Pointer>();private observer:ResizeObserver;
 private keyboard:KeyboardMapping=buildKeyboardMapping([]);private keyboardHints:HTMLDivElement|null=null;private hintNodes=new Map<number,HTMLElement>();
 private points:BubblePoint[]=[];private physics=new BubblePhysics([],()=>{});private coordMap=new Map<string,number>();
 private pendingPopSources=new Map<number,BubblePopSource>();private refreshLocked=false;private hotCodes:Set<string>|null=null;private labelSnapshot:boolean|null=null;private completionToken:object|null=null;
 private exchange:SheetExchange|null=null;private currentAttributes:Float32Array[]=[];private renderInstances=0;
 get refreshing(){return this.exchange!==null;}
 private frame=0;private last=0;private destroyed=false;private dirty=true;private dpr=1;private frames=0;private lost=false;private queued=false;
 private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 private onWindowChange=()=>this.layout();private onVisibility=()=>{if(document.hidden){this.cancelPointers();cancelAnimationFrame(this.frame);this.frame=0;}else this.wake();};
 private onBlur=()=>this.cancelPointers();
 private onOutsideDown=(e:PointerEvent)=>{const target=e.target as HTMLElement|null;if(!target||target.closest('button,input,select,textarea,aside,dialog,header,footer'))return;for(const surface of this.surfaces.values())if(surface.node.contains(target))return;const i=this.hitTest(e.clientX,e.clientY);if(i>=0){e.preventDefault();this.pointerDown(e,this.points[i].surface);}};
 private onLost=(e:Event)=>{e.preventDefault();this.lost=true;this.finishRefresh(true,false);this.cancelPointers();cancelAnimationFrame(this.frame);this.frame=0;this.dispatchEvent(new Event('contextlost'));};
 private onRestore=()=>{this.lost=false;this.initGL();this.upload();this.wake();this.dispatchEvent(new Event('contextrestored'));};
 constructor(canvas:HTMLCanvasElement){
  super();if(activeDocument.has(canvas.ownerDocument))throw new Error('Only one BubbleEngine / BubbleProvider is allowed per document. Register another surface on the existing engine.');if(activeCanvas.has(canvas))throw new Error('This canvas already has a BubbleEngine.');
  const gl=canvas.getContext('webgl2',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,powerPreference:'high-performance',preserveDrawingBuffer:false});
  if(!gl)throw new Error('WebGL 2 is unavailable. Enable hardware acceleration or use a current browser.');
  this.canvas=canvas;this.gl=gl;activeCanvas.set(canvas,this);activeDocument.set(canvas.ownerDocument,this);this.initGL();this.observer=new ResizeObserver(()=>this.layout());
  window.addEventListener('pointerdown',this.onOutsideDown);window.addEventListener('resize',this.onWindowChange);window.addEventListener('scroll',this.onWindowChange,true);window.addEventListener('blur',this.onBlur);document.addEventListener('visibilitychange',this.onVisibility);
  canvas.addEventListener('webglcontextlost',this.onLost);canvas.addEventListener('webglcontextrestored',this.onRestore);this.fit();
 }
 private compile(type:number,source:string){const g=this.gl,s=g.createShader(type);if(!s)throw new Error('Shader allocation failed.');g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS)){const log=g.getShaderInfoLog(s);g.deleteShader(s);throw new Error(`Bubble shader: ${log}`);}return s;}
 private initGL(){
  const g=this.gl,v=this.compile(g.VERTEX_SHADER,vertexShader),f=this.compile(g.FRAGMENT_SHADER,fragmentShader);const pr=g.createProgram();if(!pr)throw new Error('Program allocation failed.');g.attachShader(pr,v);g.attachShader(pr,f);g.linkProgram(pr);g.deleteShader(v);g.deleteShader(f);if(!g.getProgramParameter(pr,g.LINK_STATUS))throw new Error(g.getProgramInfoLog(pr)??'Program link failed');this.program=pr;
  g.useProgram(pr);this.vao=g.createVertexArray()!;g.bindVertexArray(this.vao);this.buffers=[];
  const vertices:number[]=[];const hex=[[-.5,-.288675135],[0,-.57735027],[.5,-.288675135],[.5,.288675135],[0,.57735027],[-.5,.288675135]];
  const triangle=(a:number[],b:number[],c:number[],level:number)=>{if(level===0){vertices.push(...a,...b,...c);return;}const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];triangle(a,ab,ca,level-1);triangle(ab,b,bc,level-1);triangle(ca,bc,c,level-1);triangle(ab,bc,ca,level-1);};
  for(let i=0;i<6;i++)triangle([0,0],hex[i],hex[(i+1)%6],2);this.vertexCount=vertices.length/2;
  for(let location=0;location<14;location++){const b=g.createBuffer()!;this.buffers.push(b);g.bindBuffer(g.ARRAY_BUFFER,b);g.enableVertexAttribArray(location);const size=location===0?2:location===13?1:location===12?4:location>=6?3:location>=4?1:4;g.vertexAttribPointer(location,size,g.FLOAT,false,0,0);if(location)g.vertexAttribDivisor(location,1);else g.bufferData(g.ARRAY_BUFFER,new Float32Array(vertices),g.STATIC_DRAW);}
  // Seeded noise texture: repeatable reference-free optical microstructure.
  const data=new Uint8Array(256*256*4);let seed=0x20ab34cd;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};for(let i=0;i<data.length;i+=4){data[i]=rnd()*255;data[i+1]=rnd()*255;data[i+2]=rnd()*255;data[i+3]=255;}
  this.texture=g.createTexture()!;g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.texture);g.texImage2D(g.TEXTURE_2D,0,g.RGBA,256,256,0,g.RGBA,g.UNSIGNED_BYTE,data);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.REPEAT);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.REPEAT);
  this.atlasReady=0;let readyCount=0;const generation=++this.textureGeneration;
  const loadAtlas=(unit:number,url:string):WebGLTexture=>{
   const texture=g.createTexture()!;g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);
   g.texImage2D(g.TEXTURE_2D,0,g.RGBA,1,1,0,g.RGBA,g.UNSIGNED_BYTE,new Uint8Array([110,110,110,255]));
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
   g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
   const image=new Image();image.onload=()=>{if(this.destroyed||this.lost||generation!==this.textureGeneration)return;
    g.activeTexture(g.TEXTURE0+unit);g.bindTexture(g.TEXTURE_2D,texture);
    g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,image);
    g.generateMipmap(g.TEXTURE_2D);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR_MIPMAP_LINEAR);
    readyCount++;if(readyCount===2)this.atlasReady=1;this.wake();
   };image.src=url;return texture;
  };
  this.atlas=loadAtlas(1,atlasURL);this.collapsedAtlas=loadAtlas(2,collapsedAtlasURL);
  for(const name of ['uSlide','uResolution','uNoise','uAtlas','uCollapsedAtlas','uAtlasReady','uDpr','uCorners','uRipples','uMotion','uPerspective','uTime','uMotionEnabled','uFilm','uTone','uGrade','uLayer','uReveal','uPressure','uGuides'])this.uniforms[name]=g.getUniformLocation(pr,name==='uCorners'||name==='uRipples'?name+'[0]':name);
  g.uniform1i(this.uniforms.uNoise,0);g.uniform1i(this.uniforms.uAtlas,1);g.uniform1i(this.uniforms.uCollapsedAtlas,2);
  g.disable(g.DEPTH_TEST);g.disable(g.BLEND);g.clearColor(0,0,0,0);
 }
 register(node:HTMLElement,config:SurfaceConfig={}):SurfaceHandle{
  const cfg=this.settings;config={bubbleSize:cfg.bubbleSize,gap:cfg.gap,cornerRadius:cfg.cornerRadius,cornerVariation:cfg.cornerVariation,edgeRoughness:cfg.edgeRoughness,edgeScale:cfg.edgeScale,edgeSeed:cfg.edgeSeed,...config};
  if(config.layout==='single')config={...config,edgeRoughness:0,cornerVariation:0};
  const id=`surface-${++engineId}`;const rect=node.getBoundingClientRect();const surface:Surface={completed:false,id,node,config:{...config},rect,off:()=>{}};this.surfaces.set(id,surface);
  const down=(e:PointerEvent)=>this.pointerDown(e,id),move=(e:PointerEvent)=>this.pointerMove(e,id),up=(e:PointerEvent)=>this.pointerUp(e,false),cancel=(e:PointerEvent)=>this.pointerUp(e,true);
  const key=(e:KeyboardEvent)=>{if(e.target!==node||e.repeat||(this.refreshing&&surface.config.layout!=='single'))return;if(e.key==='Enter'||(e.key===' '&&surface.config.mode==='spring-return')){if(node.tagName!=='BUTTON')e.preventDefault();this.audio.unlock();const index=this.points.findIndex((p,i)=>p.surface===id&&p.eligible&&!this.physics.isPopped[i]);if(index>=0){if(surface.config.mode==='spring-return')this.physics.press(index);else this.popWithSource(index,{type:'manual',input:'keyboard',gestureId:`key:${e.code||e.key}`});this.wake();}}};
  const keyup=(e:KeyboardEvent)=>{if((e.key===' '||e.key==='Enter')&&surface.config.mode==='spring-return'){this.points.forEach((p,i)=>{if(p.surface===id)this.physics.release(i);});this.wake();}};
  node.addEventListener('pointerdown',down);node.addEventListener('pointermove',move);node.addEventListener('pointerup',up);node.addEventListener('pointercancel',cancel);node.addEventListener('lostpointercapture',cancel);node.addEventListener('keydown',key);node.addEventListener('keyup',keyup);
  const detachHaptics=this.audio.feedback.attach(node);
  surface.off=()=>{detachHaptics();node.removeEventListener('pointerdown',down);node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',up);node.removeEventListener('pointercancel',cancel);node.removeEventListener('lostpointercapture',cancel);node.removeEventListener('keydown',key);node.removeEventListener('keyup',keyup);};this.observer.observe(node);this.layout();
  return {reset:(immediate=false)=>{this.reset(id,immediate);},update:(options)=>{const next={...surface.config,...options};if(Object.keys(options).every(k=>next[k as keyof SurfaceConfig]===surface.config[k as keyof SurfaceConfig]))return;surface.config=next;this.layout();},dispose:()=>{surface.off();this.observer.unobserve(node);for(const [pid,p]of this.pointers)if(p.surface===id)this.pointers.delete(pid);this.surfaces.delete(id);if(!this.destroyed)this.layout();}};
 }
 private fit(){this.dpr=Math.min(window.devicePixelRatio||1,this.settings.dpr);const w=Math.round(innerWidth*this.dpr),h=Math.round(innerHeight*this.dpr);if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}this.gl.viewport(0,0,w,h);}
 private layout(){
  if(this.destroyed||this.lost)return;this.finishRefresh(true,false);this.fit();const old=new Map(this.points.map((p,i)=>[p.key,{x:this.physics.squish[i],v:this.physics.velocity[i],p:this.physics.isPopped[i],t:this.physics.targetSquish[i],cut:!!p.cut,radius:p.radius}]));this.cancelPointers();this.points=[];
  for(const s of this.surfaces.values()){s.rect=s.node.getBoundingClientRect();if(s.rect.width>0&&s.rect.height>0)this.points.push(...makeGrid(s.rect,s.id,s.config));}
  this.coordMap=new Map(this.points.map((p,i)=>[p.key,i]));this.physics=new BubblePhysics(this.points,i=>this.didPop(i));this.physics.settings=this.settings;
  this.points.forEach((p,i)=>{const a=old.get(p.key);if(a&&!p.cut&&!a.cut&&a.radius===p.radius){this.physics.squish[i]=a.x;this.physics.velocity[i]=a.v;this.physics.isPopped[i]=a.p;this.physics.targetSquish[i]=a.p?1:0;}});for(const s of this.surfaces.values()){if(this.points.some((p,i)=>p.surface===s.id&&p.eligible&&!this.physics.isPopped[i]))s.completed=false;}this.keyboard=buildKeyboardMapping(this.points);this.refreshKeyboardHints();this.upload();this.notify();this.dispatchEvent(new Event('layoutchange'));this.wake();
 }
 private upload(){
  const n=this.points.length,a=new Float32Array(n*4),clip=new Float32Array(n*4),style=new Float32Array(n*4),edges=new Float32Array(n*4);
  this.points.forEach((p,i)=>{const s=this.surfaces.get(p.surface)!;edges.set([s.config.layout==='single'?-1:(s.config.edgeRoughness??0),s.config.edgeScale??24,s.config.edgeSeed??17,s.config.cornerVariation??0],i*4);const pitch=p.radius*2+Math.max(0,s.config.gap??4);a.set([p.x,p.y,p.radius,pitch],i*4);clip.set([s.rect.left,s.rect.top,s.rect.left+s.rect.width,s.rect.top+s.rect.height],i*4);style.set([hash(p.row*1023+p.col*17),s.config.cornerRadius??5,materialVariant(p.row+Math.floor(this.settings.variantSeed),p.col),materialVariant(p.row+Math.floor(this.settings.variantSeed),p.col,true)],i*4);});
  this.neighborData=Array.from({length:6},()=>new Float32Array(n*3));
  this.points.forEach((p,i)=>{const odd=p.row&1,offsets=[[0,-1],[0,1],[-1,odd-1],[-1,odd],[1,odd-1],[1,odd]];for(let k=0;k<6;k++){const j=this.physics.neighbors[i*6+k],np=j>=0?this.points[j]:null,row=np?.row??p.row+offsets[k][0],col=np?.col??p.col+offsets[k][1];this.neighborData[k].set([materialVariant(row+Math.floor(this.settings.variantSeed),col),materialVariant(row+Math.floor(this.settings.variantSeed),col,true),j>=0?this.physics.squish[j]:1],i*3);}});
  this.currentAttributes=[a,clip,style,this.physics.squish,this.physics.bounce,...this.neighborData,edges];
  const previous=this.exchange?.slide?this.exchange:null,oldCount=previous?.oldCount??0;
  this.renderInstances=n+oldCount;
  const roles=new Float32Array(this.renderInstances);if(previous){this.points.forEach((p,i)=>{if(p.mode==='poppable')roles[i]=2;});roles.fill(1,n);}
  const g=this.gl;g.bindVertexArray(this.vao);
  [...this.currentAttributes,roles].forEach((data,j)=>{let payload=data;if(previous&&j<12){payload=new Float32Array(data.length+previous.old[j].length);payload.set(data);payload.set(previous.old[j],data.length);}
   g.bindBuffer(g.ARRAY_BUFFER,this.buffers[j+1]);g.bufferData(g.ARRAY_BUFFER,payload,j>=3?g.DYNAMIC_DRAW:g.STATIC_DRAW);});
 }
 private inside(s:Surface,x:number,y:number){return boundaryDistance(s.rect,x,y,s.config.cornerRadius??5,s.config.edgeRoughness??0,s.config.edgeScale??24,s.config.edgeSeed??17,s.config.cornerVariation??0)<=0;}
 hitTest(screenX:number,screenY:number,surface?:string){
  const ss=surface?[this.surfaces.get(surface)].filter((s):s is Surface=>!!s):Array.from(this.surfaces.values()).reverse();
  for(const s of ss){if(this.refreshing&&s.config.layout!=='single')continue;const rest=s.config.layout==='single'?{x:screenX,y:screenY}:this.motion.inverse(s.rect,screenX,screenY),x=rest.x,y=rest.y;if(!this.inside(s,x,y))continue;
   if(s.config.layout==='single'){const i=this.points.findIndex(p=>p.surface===s.id);if(i>=0&&Math.hypot(x-this.points[i].x,y-this.points[i].y)<this.points[i].radius*1.06)return i;continue;}
   const pitch=Math.max(BUBBLE_SIZE_MIN,Math.min(BUBBLE_SIZE_MAX,s.config.bubbleSize??52))+Math.max(0,s.config.gap??4),dy=pitch*Math.sqrt(3)/2,row=Math.round((y-s.rect.top-pitch*.5)/dy);
   for(let dr=-1;dr<=1;dr++){const r=row+dr,col=Math.round((x-s.rect.left-pitch*.5-(r&1)*pitch*.5)/pitch);for(let dc=-1;dc<=1;dc++){const i=this.coordMap.get(`${s.id}:${r}:${col+dc}`);if(i!==undefined){const p=this.points[i];if(p.eligible&&Math.hypot(x-p.x,y-p.y)<p.radius*1.06)return i;}}}
  }return -1;
 }
 private retap(i:number){if(this.points[i]?.cut)return;this.physics.jiggle(i);const p=this.points[i];this.motion.impulse(p.x,p.y,1);this.audio.crinkle();this.audio.feedback.pulse(7);}
 private popWithSource(index:number,source:BubblePopSource):boolean {this.pendingPopSources.set(index,source);const popped=this.physics.pop(index);if(!popped)this.pendingPopSources.delete(index);return popped;}
 private stagePopSource(index:number,source:BubblePopSource):void {if(index>=0&&!this.physics.isPopped[index])this.pendingPopSources.set(index,source);}
 private pointerDown(e:PointerEvent,surface:string){if(this.refreshing&&this.surfaces.get(surface)?.config.layout!=='single')return;if(e.button!==0&&e.pointerType!=='touch')return;this.audio.unlock();const s=this.surfaces.get(surface)!;const haptic=e.target instanceof HTMLElement&&e.target.hasAttribute('data-bubble-haptic-tap');if(!haptic){try{s.node.setPointerCapture(e.pointerId);}catch{}}const i=this.hitTest(e.clientX,e.clientY,surface),input:ManualPopInput=e.pointerType==='touch'?'touch':e.pointerType==='pen'?'pen':'mouse',gestureId=`pointer:${e.pointerId}`;const p:Pointer={id:e.pointerId,surface,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,index:i,visited:new Set(),gentle:e.pointerType==='pen'&&e.pressure<.65,input,gestureId};if(i>=0){p.visited.add(i);if(this.physics.isPopped[i])this.retap(i);else{this.stagePopSource(i,{type:'manual',input,gestureId});this.physics.press(i,p.gentle?e.pressure:1);}}this.pointers.set(e.pointerId,p);this.wake();}
 private pointerMove(e:PointerEvent,surface:string){
  const p=this.pointers.get(e.pointerId);if(!p)return;
  if(p){if(!(e.target instanceof HTMLElement&&e.target.hasAttribute('data-bubble-haptic-tap')))e.preventDefault();const length=Math.hypot(e.clientX-p.x,e.clientY-p.y);if(length>1){const steps=Math.min(200,Math.max(1,Math.ceil(length/10)));for(let t=0;t<=steps;t++){const x=p.x+(e.clientX-p.x)*t/steps,y=p.y+(e.clientY-p.y)*t/steps;const i=this.hitTest(x,y,surface);if(i>=0&&!p.visited.has(i)){p.visited.add(i);if(this.physics.isPopped[i])this.retap(i);else if(!p.gentle)this.popWithSource(i,{type:'manual',input:p.input,gestureId:p.gestureId});else{this.stagePopSource(i,{type:'manual',input:p.input,gestureId:p.gestureId});this.physics.press(i,e.pressure);}}}}p.x=e.clientX;p.y=e.clientY;p.index=this.hitTest(p.x,p.y,surface);}
  this.wake();
 }
 private pointerUp(e:PointerEvent,cancelled:boolean){const p=this.pointers.get(e.pointerId);if(!p)return;this.pointers.delete(e.pointerId);if(!cancelled&&!p.gentle){for(const i of p.visited)this.popWithSource(i,{type:'manual',input:p.input,gestureId:p.gestureId});}for(const i of p.visited){let held=false;for(const other of this.pointers.values())if(other.visited.has(i))held=true;if(!held){this.physics.release(i);if(!this.physics.isPopped[i])this.pendingPopSources.delete(i);}}this.wake();}
 private cancelPointers(){for(const p of this.pointers.values())for(const i of p.visited){this.physics.release(i);if(!this.physics.isPopped[i])this.pendingPopSources.delete(i);}this.pointers.clear();this.points.forEach((p,i)=>{if(!p.cut&&!this.physics.isPopped[i]){this.physics.release(i);this.pendingPopSources.delete(i);}});for(let i=0;i<4;i++)this.motion.release(i);}
 private didPop(index:number){
  this.hintNodes.get(index)?.setAttribute('data-popped','true');
  this.audio.pop();const point=this.points[index],surface=this.surfaces.get(point.surface),source=this.pendingPopSources.get(index)??{type:'system' as const,reason:'physics'};this.pendingPopSources.delete(index);this.physics.jiggle(index);this.motion.impulse(point.x,point.y,.7);this.dispatchEvent(new CustomEvent<BubblePopDetail>('bubblepop',{detail:{index,key:point.key,surface:point.surface,source}}));queueMicrotask(()=>{if(this.destroyed)return;this.notify();if(surface){let count=0,total=0;this.points.forEach((p,i)=>{if(p.surface===point.surface&&p.eligible){total++;count+=this.physics.isPopped[i];}});surface.config.onPop?.(count);if(count===total&&total>0&&!surface.completed){surface.completed=true;this.finishWhenSettled(index,surface);}}});
 }
 /** Let the last bubble finish collapsing before the sheet is allowed to leave. */
 private finishWhenSettled(index:number,surface:Surface){
  const token={};this.completionToken=token;const started=performance.now();
  const settle=()=>{
   if(this.completionToken!==token||this.destroyed)return;
   const squish=this.physics.squish[index];
   if(squish!==undefined&&squish<0.9&&performance.now()-started<700){requestAnimationFrame(settle);return;}
   if(this.completionToken!==token||this.destroyed)return;
   surface.config.onAllPopped?.();
  };
  requestAnimationFrame(settle);
 }
 private notify(){if(this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;if(!this.destroyed)this.dispatchEvent(new CustomEvent('change',{detail:this.getStats()}));});}
 setMuted(muted:boolean){this.audio.unlock();this.audio.setMuted(muted);this.notify();}
 /** Snapshot the old sheet's material and popped state once, not every frame.
  * New + old instances share the same context, program, atlases and draw call. */
 private snapshotSheet(surface?:string):{old:Float32Array[];oldCount:number}{
  const indices=this.points.flatMap((p,i)=>p.mode==='poppable'&&(!surface||p.surface===surface)?[i]:[]);
  const widths=[4,4,4,1,1,3,3,3,3,3,3,4];
  return {oldCount:indices.length,old:this.currentAttributes.map((data,j)=>{const width=widths[j],out=new Float32Array(indices.length*width);indices.forEach((i,k)=>out.set(data.subarray(i*width,(i+1)*width),k*width));return out;})};
 }
 private finishRefresh(cancelSound=false,upload=true){
  if(!this.exchange)return;this.exchange=null;this.dirty=true;if(cancelSound)this.audio.stopRefill();
  for(const surface of this.surfaces.values())surface.node.removeAttribute('aria-busy');
  if(upload&&!this.lost&&!this.destroyed)this.upload();this.notify();
 }
 /** Named legacy mode remains intact; the default physically exchanges sheets.
  * Both modes re-roll all seeds. Reentrant requests do not stack audio/meshes. */
 setRefreshLocked(locked:boolean){this.refreshLocked=locked;}
 /** Sheet exchange used by Survival Run while player-triggered refresh stays locked. */
 forceReset(){const locked=this.refreshLocked;this.refreshLocked=false;this.reset();this.refreshLocked=locked;}
 /** Cancel any slide and open an unpopped sheet. Used when a run starts or retries. */
 freshSheet(){const locked=this.refreshLocked;this.refreshLocked=false;this.reset(undefined,true);this.refreshLocked=locked;}
 setHotKeys(codes:readonly string[]|null){
  if(codes){
   if(this.labelSnapshot===null)this.labelSnapshot=this.settings.showKeyLabels;
   this.hotCodes=new Set(codes);
   if(!this.settings.showKeyLabels)this.setSettings({showKeyLabels:true});
   else this.applyHotKeys();
  }else{
   this.hotCodes=null;
   const restore=this.labelSnapshot;this.labelSnapshot=null;
   if(restore!==null&&this.settings.showKeyLabels!==restore)this.setSettings({showKeyLabels:restore});
   else this.applyHotKeys();
  }
 }
 private applyHotKeys(){for(const node of this.hintNodes.values()){if(!this.hotCodes){delete node.dataset.hot;continue;}node.dataset.hot=String(this.hotCodes.has(node.dataset.keyCode||''));}}
 reset(surface?:string,immediate=false){
  this.completionToken=null;
  if(this.refreshLocked||this.destroyed||this.lost||(!immediate&&this.refreshing))return;
  if(immediate)this.finishRefresh(true,false);
  let popped=0,total=0;this.points.forEach((p,i)=>{if((!surface||p.surface===surface)&&p.mode==='poppable'&&p.eligible){total++;popped+=this.physics.isPopped[i];}});
  const slide=this.settings.refreshMode===1&&!immediate&&!this.reduced;
  const snapshot=slide?this.snapshotSheet(surface):{old:[],oldCount:0};
  this.cancelPointers();
  // Schedule audio before generating the new layout; both use its clock.
  const floor=this.settings.refreshMode===1?this.settings.slideMinimum:(popped===0?.55:0);
  const timeline=!immediate?this.audio.refill(this.settings.resetDuration,popped,total,floor):null;
  this.setSettings(freshSeedSettings(this.settings));
  for(const item of this.surfaces.values())if(!surface||item.id===surface)item.completed=false;
  if(slide)this.motion.clear();
  this.physics.reset(surface,immediate||slide||this.reduced,timeline??undefined);
  if(slide){this.physics.bounce.fill(0);this.physics.bounceVelocity.fill(0);}
  if(timeline&&timeline.duration>0){this.exchange={...snapshot,timeline,progress:0,distance:innerWidth+24,slide};for(const item of this.surfaces.values())if(item.config.layout!=='single')item.node.setAttribute('aria-busy','true');}
  this.upload();this.notify();this.wake();
 }
 inspectRefresh(){const e=this.exchange;return e?{mode:e.slide?'slide in/out':'refresh insitu',progress:e.progress,eased:sheetEase(e.progress),duration:e.timeline.duration,oldCount:e.oldCount,outgoingX:sheetEase(e.progress)*e.distance,incomingX:(sheetEase(e.progress)-1)*e.distance,oldPopped:e.old[3]?Array.from(e.old[3]).filter(x=>x>.9).length:0}:null;}
 /** Both per-seed refresh buttons intentionally re-roll the whole seed set. */
 refreshSeeds(){this.reset();}
 private wake(){if(this.destroyed||this.lost||document.hidden)return;this.dirty=true;if(!this.frame){this.last=performance.now();this.frame=requestAnimationFrame(this.tick);}}
 private tick=(time:number)=>{
  this.frame=0;if(this.destroyed||this.lost)return;const dt=Math.min(.05,(time-this.last)/1000);this.last=time;const active=this.physics.step(dt),flex=this.motion.step(dt);
  if(this.exchange){const duration=this.exchange.timeline.duration,elapsed=this.exchange.timeline.elapsed();this.exchange.progress=Number.isFinite(elapsed)&&duration>0?Math.max(0,Math.min(1,elapsed/duration)):1;if(this.exchange.progress>=1)this.finishRefresh();}
  if(this.dirty||active||flex||this.exchange){const g=this.gl;g.useProgram(this.program);g.bindVertexArray(this.vao);g.activeTexture(g.TEXTURE0);g.bindTexture(g.TEXTURE_2D,this.texture);g.activeTexture(g.TEXTURE1);g.bindTexture(g.TEXTURE_2D,this.atlas);g.activeTexture(g.TEXTURE2);g.bindTexture(g.TEXTURE_2D,this.collapsedAtlas);g.uniform1f(this.uniforms.uAtlasReady,this.atlasReady);g.bindBuffer(g.ARRAY_BUFFER,this.buffers[4]);g.bufferSubData(g.ARRAY_BUFFER,0,this.physics.squish);g.uniform2f(this.uniforms.uResolution,innerWidth,innerHeight);g.uniform1f(this.uniforms.uDpr,this.dpr);
   g.bindBuffer(g.ARRAY_BUFFER,this.buffers[5]);g.bufferSubData(g.ARRAY_BUFFER,0,this.physics.bounce);
   for(let k=0;k<6;k++){const data=this.neighborData[k];for(let i=0;i<this.points.length;i++){const j=this.physics.neighbors[i*6+k];data[i*3+2]=j>=0?this.physics.squish[j]:1;}g.bindBuffer(g.ARRAY_BUFFER,this.buffers[6+k]);g.bufferSubData(g.ARRAY_BUFFER,0,data);}
   const s=this.settings,e=this.exchange;g.uniform4f(this.uniforms.uSlide,e?sheetEase(e.progress):0,e?.distance??0,s.slideFlex,e?.slide?1:0);g.uniform3fv(this.uniforms.uCorners,this.motion.corners);g.uniform4fv(this.uniforms.uRipples,this.motion.ripples);
   g.uniform4f(this.uniforms.uMotion,s.cornerInfluence,s.rippleStrength,s.rippleSpeed,s.rippleWidth);g.uniform1f(this.uniforms.uPerspective,s.perspective);g.uniform1f(this.uniforms.uTime,this.motion.time);g.uniform1f(this.uniforms.uMotionEnabled,s.motion?1:0);
   g.uniform4f(this.uniforms.uFilm,s.seamWidth,s.filmStrength,s.filmTexture,s.textureFit);
   g.uniform4f(this.uniforms.uReveal,s.revealStart,s.revealEnd,s.revealCurve,s.linearReveal?1:0);g.uniform2f(this.uniforms.uPressure,s.pressureBulge,s.pressureWrinkle);
   g.uniform4f(this.uniforms.uTone,s.exposure,s.contrast,s.blackPoint,s.whitePoint);g.uniform4f(this.uniforms.uGrade,s.gamma,s.highlights,s.grain,s.sharpness);g.uniform4f(this.uniforms.uLayer,s.blendMode,s.layerOpacity,s.backingLevel,0);g.uniform1f(this.uniforms.uGuides,s.showContours?1:0);
   this.syncHandles();this.syncKeyboardHints();g.clear(g.COLOR_BUFFER_BIT);g.drawArraysInstanced(g.TRIANGLES,0,this.vertexCount,this.renderInstances);this.frames++;this.dirty=false;}
  if(active||flex||this.pointers.size||this.exchange)this.frame=requestAnimationFrame(this.tick);
 };
 /** Updates shader uniforms and imperative solvers without React renders. */
 setSettings(patch:Partial<Settings>){
  const next=sanitizeSettings(patch,this.settings);const geometry=['bubbleSize','gap','cornerRadius','cornerVariation','edgeRoughness','edgeScale','edgeSeed'] as const;
  const relayout=geometry.some(k=>next[k]!==this.settings[k]);const reshuffle=next.variantSeed!==this.settings.variantSeed;const hintsChanged=next.showKeyLabels!==this.settings.showKeyLabels||next.keyboardEnabled!==this.settings.keyboardEnabled;
  this.settings=next;this.physics.settings=next;this.motion.settings=next;this.audio.volume=next.volume;this.audio.pitchVariation=next.pitchVariation;this.audio.sampleGainVariation=next.sampleGainVariation;this.audio.sampleToneVariation=next.sampleToneVariation;this.audio.adaptiveRefill=next.adaptiveRefill;this.audio.refillMinimum=next.refillMinimum;this.audio.haptics=next.haptics;this.audio.setMuted(this.audio.muted);
  if(!next.motion)this.motion.clear();
  if(relayout){for(const surface of this.surfaces.values())if(surface.config.layout!=='single'){for(const key of geometry)(surface.config as unknown as Record<string,unknown>)[key]=next[key];}this.layout();}
  else if(reshuffle)this.upload();if(hintsChanged)this.refreshKeyboardHints();this.fit();this.wake();this.dispatchEvent(new Event('settingschange'));
 }
 private sheetSurface(){return Array.from(this.surfaces.values()).find(s=>s.config.layout!=='single');}
 bindCorner(node:HTMLElement,index:number){
  if(index<0||index>3)throw new Error('Corner index must be 0..3');let pointer=-1,sx=0,sy=0;
  const down=(e:PointerEvent)=>{if(e.button!==0||!this.settings.motion||this.refreshing)return;e.preventDefault();e.stopPropagation();pointer=e.pointerId;sx=e.clientX-this.motion.corners[index*3]/this.settings.cornerPull;sy=e.clientY-this.motion.corners[index*3+1]/this.settings.cornerPull;try{node.setPointerCapture(e.pointerId);}catch{}node.dataset.dragging='true';this.audio.unlock();};
  const move=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;e.preventDefault();this.motion.pull(index,e.clientX-sx,e.clientY-sy);this.wake();};
  const up=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;pointer=-1;delete node.dataset.dragging;this.motion.release(index);this.wake();};
  const key=(e:KeyboardEvent)=>{const dirs:Record<string,number[]>={ArrowLeft:[-35,0],ArrowRight:[35,0],ArrowUp:[0,-35],ArrowDown:[0,35]};const d=dirs[e.key];if(d){e.preventDefault();this.motion.pull(index,d[0],d[1]);this.wake();}};
  const ku=()=>{pointer=-1;delete node.dataset.dragging;this.motion.release(index);this.wake();};
  node.addEventListener('pointerdown',down);window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);window.addEventListener('blur',ku);node.addEventListener('lostpointercapture',up);node.addEventListener('keydown',key);node.addEventListener('keyup',ku);node.addEventListener('blur',ku);
  const off=()=>{node.removeEventListener('pointerdown',down);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',ku);node.removeEventListener('lostpointercapture',up);node.removeEventListener('keydown',key);node.removeEventListener('keyup',ku);node.removeEventListener('blur',ku);};
  const binding={node,index,off};this.cornerBindings.push(binding);this.wake();return ()=>{off();this.cornerBindings=this.cornerBindings.filter(b=>b!==binding);this.motion.release(index);};
 }
 private syncHandles(){const surface=this.sheetSurface();if(!surface)return;const r=surface.rect;
  for(const {node,index}of this.cornerBindings){const p=this.motion.deform(r,r.left+(index%2?r.width-9:9),r.top+(index>1?r.height-9:9));node.style.left=p.x+'px';node.style.top=p.y+'px';node.hidden=!this.settings.showHandles||!this.settings.motion||this.refreshing;}
 }
 inspectMotion(){return {corners:Array.from(this.motion.corners),targets:Array.from(this.motion.targets),time:this.motion.time};}
 project(x:number,y:number){const surface=this.sheetSurface();return surface?this.motion.deform(surface.rect,x,y):{x,y,z:0};}
 getStats():BubbleStats{let total=0,popped=0;this.points.forEach((p,i)=>{if(p.mode==='poppable'&&p.eligible){total++;popped+=this.physics.isPopped[i];}});return {total,popped,drawCalls:this.points.length?1:0,instances:this.points.length,surfaces:this.surfaces.size,dpr:this.dpr,audio:this.audio.state,activePointers:this.pointers.size,frames:this.frames};}
 /** Physical key -> one random unpopped bubble. Popped/cut cells cannot be selected. */
 popKey(code:string):number {
  if(this.destroyed||this.lost||this.refreshing||!this.settings.keyboardEnabled)return -1;
  const group=this.keyboard.byCode.get(code);if(!group)return -1;
  const index=pickUnpopped(group.indices,this.physics.isPopped);if(index<0)return -1;
  this.audio.unlock();if(!this.popWithSource(index,{type:'manual',input:'keyboard',gestureId:`key:${code}`}))return -1;this.wake();
  this.dispatchEvent(new CustomEvent('keypop',{detail:{code,label:group.label,index}}));return index;
 }
 getGameBubbles():GameBubbleSnapshot[]{return this.points.flatMap((point,index)=>point.mode==='poppable'?[{index,surface:point.surface,eligible:point.eligible!==false&&!point.cut,popped:!!this.physics.isPopped[index]}]:[]);}
 getGameNeighbours(index:number):number[]{if(!Number.isInteger(index)||index<0||index>=this.points.length)return[];const neighbours:number[]=[];for(let offset=0;offset<6;offset++){const candidate=this.physics.neighbors[index*6+offset];if(candidate>=0&&this.points[candidate]?.mode==='poppable'&&this.points[candidate].eligible!==false&&!this.points[candidate].cut)neighbours.push(candidate);}return neighbours;}
 popForGame(index:number,source:AutomatedPopSource):boolean {if(this.destroyed||this.lost||this.refreshing||!Number.isInteger(index))return false;const point=this.points[index];if(!point||point.mode!=='poppable'||point.eligible===false||point.cut)return false;const popped=this.popWithSource(index,source);if(popped)this.wake();return popped;}
 getKeyboardMap(){return this.keyboard.groups.map(group=>({...group,indices:[...group.indices],total:group.indices.length,remaining:group.indices.reduce((sum,index)=>sum+(this.physics.isPopped[index]?0:1),0)}));}
 private refreshKeyboardHints(){
  if(!this.settings.showKeyLabels||!this.settings.keyboardEnabled){this.keyboardHints?.remove();this.keyboardHints=null;this.hintNodes.clear();return;}
  if(!this.keyboardHints){this.keyboardHints=this.canvas.ownerDocument.createElement('div');this.keyboardHints.className='keyboard-hints';this.keyboardHints.setAttribute('aria-hidden','true');this.canvas.ownerDocument.body.append(this.keyboardHints);}
  this.keyboardHints.replaceChildren();this.hintNodes.clear();
  for(const [index,key]of this.keyboard.byPoint){const node=document.createElement('kbd');node.textContent=key.label;node.dataset.keyCode=key.code;node.dataset.pointIndex=String(index);this.hintNodes.set(index,node);this.keyboardHints.append(node);}
  this.applyHotKeys();this.syncKeyboardHints();
 }
 private syncKeyboardHints(){
  if(!this.keyboardHints)return;this.keyboardHints.hidden=this.refreshing;
  for(const [index,node]of this.hintNodes){const point=this.points[index],surface=this.surfaces.get(point.surface);if(!surface)continue;
   const p=this.motion.deform(surface.rect,point.x,point.y);node.style.transform=`translate3d(${p.x}px,${p.y}px,0) translate(-50%,-50%)`;node.dataset.popped=String(!!this.physics.isPopped[index]);}
 }
 /** Read-only diagnostic data for interaction tests. */
 inspect(){return this.points.map((p,i)=>({...p,index:i,keyboardCode:this.keyboard.byPoint.get(i)?.code??null,keyboardLabel:this.keyboard.byPoint.get(i)?.label??null,popped:!!this.physics.isPopped[i],squish:this.physics.squish[i],bounce:this.physics.bounce[i],taps:this.physics.tapCount[i],inflatedVariant:materialVariant(p.row+Math.floor(this.settings.variantSeed),p.col),collapsedVariant:materialVariant(p.row+Math.floor(this.settings.variantSeed),p.col,true)}));}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.exchange=null;cancelAnimationFrame(this.frame);this.observer.disconnect();for(const binding of this.cornerBindings)binding.off();this.cornerBindings=[];for(const s of this.surfaces.values())s.off();this.surfaces.clear();this.cancelPointers();window.removeEventListener('pointerdown',this.onOutsideDown);window.removeEventListener('resize',this.onWindowChange);window.removeEventListener('scroll',this.onWindowChange,true);window.removeEventListener('blur',this.onBlur);document.removeEventListener('visibilitychange',this.onVisibility);this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestore);this.audio.destroy();this.keyboardHints?.remove();this.keyboardHints=null;this.hintNodes.clear();const g=this.gl;for(const b of this.buffers)g.deleteBuffer(b);g.deleteTexture(this.texture);g.deleteTexture(this.atlas);g.deleteTexture(this.collapsedAtlas);g.deleteVertexArray(this.vao);g.deleteProgram(this.program);g.clear(g.COLOR_BUFFER_BIT);activeCanvas.delete(this.canvas);activeDocument.delete(this.canvas.ownerDocument);}
}
