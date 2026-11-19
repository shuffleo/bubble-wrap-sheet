import {bundledPCM} from './bubble-bundled-audio';
import {refreshPlan} from './bubble-refresh';
import {BubbleHaptics} from './bubble-haptics';
import {scheduleRefill,scheduleRefillSample,type RefillVoice} from './bubble-refill';
import {preparePCM,toAudioBuffer,encodeWav,SampleBag,makeRefillPlan,type SampleAnalysis,type RefillPlan} from './bubble-samples';
export interface RefillTimeline {duration:number;elapsed:()=>number;plan:RefillPlan;}
/** Predecode and clean samples at import time. Gestures only schedule playback. */
export class BubbleAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private noise:AudioBuffer|null=null;private voices=0;private pendingPops=0;
 private suspect=false;private watching=false;private renderedAt=0;private renderedWall=0;private inUnlock=false;
 private refillNoise:AudioBuffer|null=null;private refillVoice:RefillVoice|null=null;private refillGeneration=0;
 private refillSample:AudioBuffer|null=null;private refillImportGeneration=0;refillSampleLabel='Synthesized refill';
 private refillAnalysis:SampleAnalysis|null=null;private analyses:SampleAnalysis[]=[];private importGeneration=0;private bag=new SampleBag();
 readonly feedback=new BubbleHaptics();
 get haptics(){return this.feedback.enabled;}set haptics(value:boolean){this.feedback.enabled=value;}
 muted=false;volume=.35;pitchVariation=.15;sampleGainVariation=.06;sampleToneVariation=.8;adaptiveRefill=true;refillMinimum=.18;
 private imported:AudioBuffer[]=[];sampleLabel='Synthesized fallback';
 private bundled=bundledPCM();private bundledLoaded=false;
 constructor(){this.loadBundled();}
 private loadBundled(context?:BaseAudioContext){
  if(this.bundledLoaded)return;
  try{const buffers=this.bundled.map(p=>{const buffer=context?context.createBuffer(p.channels.length,p.channels[0].length,p.sampleRate):new AudioBuffer({numberOfChannels:p.channels.length,length:p.channels[0].length,sampleRate:p.sampleRate});p.channels.forEach((c,i)=>buffer.getChannelData(i).set(c));return buffer;});
   this.imported=buffers.slice(0,3);this.analyses=this.bundled.slice(0,3).map(p=>p.analysis);this.refillSample=buffers[3];this.refillAnalysis=this.bundled[3].analysis;this.sampleLabel='3 bundled Anthousai recordings';this.refillSampleLabel='Bundled refresh recording';this.bundledLoaded=true;
  }catch{/* Older WebKit can allocate buffers after context creation instead. */}
 }
 lastSample:{index:number;rate:number;gain:number;toneDb:number;duration:number}|null=null;lastRefillPlan:RefillPlan|null=null;
 private watchLifecycle(){
  if(this.watching||typeof document==='undefined')return;this.watching=true;
  const mark=()=>{this.suspect=true;};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)mark();});
  document.addEventListener('pagehide',mark);document.addEventListener('freeze',mark);
 }
 /** iOS can report "running" or "interrupted" after backgrounding while the
  * render clock is dead. resume() may never settle, so the next gesture rebuilds. */
 private shouldRebuild(){
  const context=this.context;if(!context)return false;
  const state=context.state as string;if(state==='closed'||state==='interrupted'||this.suspect)return true;
  return this.renderedWall>0&&context.state==='running'&&performance.now()-this.renderedWall>250&&context.currentTime<=this.renderedAt+.001;
 }
 private discardContext(){
  const old=this.context;this.refillVoice?.cancel();this.refillVoice=null;this.refillGeneration++;
  this.context=null;this.master=null;this.noise=null;this.refillNoise=null;this.voices=0;this.bundledLoaded=false;this.imported=[];this.refillSample=null;
  this.renderedAt=0;this.renderedWall=0;if(old&&old.state!=='closed')void old.close().catch(()=>{});
 }
 private markRendered(){const context=this.context;if(!context||context.state!=='running')return;this.renderedAt=context.currentTime;this.renderedWall=performance.now();this.suspect=false;}
 private flushPending(){
  if(this.context?.state!=='running'||!this.pendingPops)return;
  const count=this.pendingPops;this.pendingPops=0;for(let i=0;i<count;i++)this.pop(false);
 }
 /** Start a zero-length audible graph inside the trusted input call stack.
  * Older iOS WebKit needs this in addition to resume() before it will render. */
 private prime(){
  const context=this.context,master=this.master;if(!context||!master||context.state==='closed')return;
  try{const buffer=context.createBuffer(1,1,context.sampleRate),source=context.createBufferSource();source.buffer=buffer;source.connect(master);source.onended=()=>source.disconnect();source.start(0);}catch{}
 }
 unlock(){
  if(this.inUnlock)return;this.inUnlock=true;
  try{this.watchLifecycle();if(this.shouldRebuild())this.discardContext();
   if(!this.context){const AC=typeof window==='undefined'?undefined:window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!AC)return;
    try{this.context=new AC({latencyHint:'interactive'});}catch{try{this.context=new AC();}catch{return;}}
    this.suspect=false;
    this.loadBundled(this.context);this.context.onstatechange=()=>this.flushPending();
    this.master=this.context.createGain();this.master.gain.value=this.muted?0:this.volume;
    const limit=this.context.createDynamicsCompressor();limit.threshold.value=-12;limit.ratio.value=8;this.master.connect(limit);limit.connect(this.context.destination);
    this.noise=this.context.createBuffer(1,Math.ceil(this.context.sampleRate*.12),this.context.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    this.refillNoise=this.context.createBuffer(1,Math.ceil(this.context.sampleRate*1.5),this.context.sampleRate);const refillData=this.refillNoise.getChannelData(0);for(let i=0;i<refillData.length;i++)refillData[i]=Math.random()*2-1;
   }
   if(this.context.state==='running'){this.flushPending();return;}
   this.prime();
   if(this.context.state==='closed'||(this.context.state as string)==='interrupted')return;
   try{void this.context.resume().then(()=>this.flushPending()).catch(()=>{this.suspect=true;});}
   catch{this.suspect=true;}
  }finally{this.inUnlock=false;}
 }
 setMuted(value:boolean){this.muted=value;if(value){this.pendingPops=0;this.refillGeneration++;this.refillVoice?.cancel();this.refillVoice=null;}if(this.context&&this.master)this.master.gain.setTargetAtTime(value?0:this.volume,this.context.currentTime,.01);}
 pop(withHaptic=true){
  if(withHaptic)this.feedback.pulse(13);
  if(!this.inUnlock&&(!this.context||this.context.state!=='running'||this.shouldRebuild()))this.unlock();
  const c=this.context;if(this.muted||this.volume<=0||!c||!this.master||!this.noise||this.voices>=14)return;if(c.state!=='running'){if(c.state!=='closed'){this.pendingPops=Math.min(8,this.pendingPops+1);this.unlock();}return;}
  try{this.playPop(c);}catch{this.suspect=true;}
 }
 private playPop(c:AudioContext){if(!this.master||!this.noise)return;
  if(this.imported.length){
   const index=this.bag.pick(this.imported.length),buffer=this.imported[index],rate=1+(Math.random()*2-1)*this.pitchVariation,gain=1+(Math.random()*2-1)*this.sampleGainVariation,toneDb=(Math.random()*2-1)*this.sampleToneVariation;
   const node=c.createBufferSource(),level=c.createGain(),tone=c.createBiquadFilter();node.buffer=buffer;node.playbackRate.value=rate;level.gain.value=gain;tone.type='highshelf';tone.frequency.value=3500;tone.gain.value=toneDb;
   node.connect(tone);tone.connect(level);level.connect(this.master);this.voices++;this.lastSample={index,rate,gain,toneDb,duration:buffer.duration/rate};
   node.onended=()=>{node.disconnect();tone.disconnect();level.disconnect();this.voices--;};node.start(c.currentTime+.002);this.markRendered();return;
  }
  this.voices++;const now=c.currentTime+.002,pitch=1+(Math.random()*2-1)*this.pitchVariation;
  const osc=c.createOscillator(),env=c.createGain();osc.type='sine';osc.frequency.setValueAtTime(610*pitch,now);osc.frequency.exponentialRampToValueAtTime(95*pitch,now+.043);env.gain.setValueAtTime(.0001,now);env.gain.exponentialRampToValueAtTime(.78,now+.0015);env.gain.exponentialRampToValueAtTime(.0001,now+.078);osc.connect(env);env.connect(this.master);osc.start(now);osc.stop(now+.09);
  const n=c.createBufferSource(),filter=c.createBiquadFilter(),air=c.createGain();n.buffer=this.noise;filter.type='bandpass';filter.frequency.value=1900*pitch;filter.Q.value=.65;air.gain.setValueAtTime(.0001,now);air.gain.exponentialRampToValueAtTime(.75,now+.001);air.gain.exponentialRampToValueAtTime(.0001,now+.034);n.connect(filter);filter.connect(air);air.connect(this.master);n.start(now);n.stop(now+.05);
  osc.onended=()=>{osc.disconnect();env.disconnect();this.voices--;};n.onended=()=>{n.disconnect();filter.disconnect();air.disconnect();};this.markRendered();
 }
 planRefill(waveDuration=.85,popped=1,total=1){const duration=this.refillSample?.duration??Math.max(.32,Math.min(1.25,Number.isFinite(waveDuration)?waveDuration+.12:.97));return makeRefillPlan(duration,popped,total,!!this.refillSample,this.refillMinimum,this.adaptiveRefill);}
 /** Share a clock/duration with the wave. A full refill preserves the clip's
  * complete trimmed content. A partial one plays only a faded ending excerpt. */
 refill(waveDuration=.85,popped=1,total=1,minimumDuration=0):RefillTimeline {
  const plan=refreshPlan(this.planRefill(waveDuration,popped,total),minimumDuration);this.lastRefillPlan=plan;
  const wallStart=performance.now();let lastElapsed=0;
  const timeline={duration:plan.duration,plan,elapsed:()=>{lastElapsed=Math.max(lastElapsed,(performance.now()-wallStart)/1000);return lastElapsed;}};
  this.refillVoice?.cancel();this.refillVoice=null;const generation=++this.refillGeneration;
  if(this.muted||this.volume<=0||plan.duration<=0)return timeline;
  this.unlock();const context=this.context;if(!context||!this.master||!this.refillNoise)return timeline;
  const play=(resumed=false)=>{
   if(generation!==this.refillGeneration||context!==this.context||this.muted||this.volume<=0||context.state!=='running')return;
   const elapsed=resumed?timeline.elapsed():0;
   // A late audio resume never holds the sheet animation; that clock is the wall clock.
   if(elapsed>.25||elapsed>=plan.duration)return;
   const start=context.currentTime+.006,remaining=plan.duration-elapsed;
   const ended=()=>{if(this.refillGeneration===generation)this.refillVoice=null;};
   this.refillVoice=this.refillSample?scheduleRefillSample(context,this.master!,this.refillSample,ended,{duration:remaining,offset:plan.offset+elapsed,startAt:start}):scheduleRefill(context,this.master!,this.refillNoise!,waveDuration,ended,remaining,start);
   this.markRendered();
  };
  if(context.state==='running')play();else if(context.state==='suspended')void context.resume().then(()=>play(true)).catch(()=>{this.suspect=true;});else this.suspect=true;
  return timeline;
 }
 async importRefillFile(file:File){
  if(!file.size||file.size>16*1024*1024)throw new Error('Choose a nonempty audio file smaller than 16 MB.');
  this.unlock();const context=this.context;if(!context)throw new Error('Web Audio is unavailable.');
  const generation=++this.refillImportGeneration,buffer=await context.decodeAudioData(await file.arrayBuffer()),prepared=preparePCM(buffer,'refill',file.name);
  if(context!==this.context||generation!==this.refillImportGeneration)return;
  this.refillVoice?.cancel();this.refillVoice=null;this.refillGeneration++;
  this.refillSample=toAudioBuffer(context,prepared);this.refillAnalysis=prepared.analysis;this.refillSampleLabel=file.name;
 }
 clearRefillSample(){this.refillImportGeneration++;this.refillVoice?.cancel();this.refillVoice=null;this.refillGeneration++;this.refillSample=null;this.refillAnalysis=null;this.refillSampleLabel='Synthesized refill';}
 async importFiles(files:File[]){
  if(!files.length)return;if(files.length>12)throw new Error('Choose up to 12 audio files.');this.unlock();const context=this.context;if(!context)throw new Error('Web Audio is unavailable.');
  const generation=++this.importGeneration,buffers:AudioBuffer[]=[],analyses:SampleAnalysis[]=[];
  for(const file of files){if(!file.size||file.size>8*1024*1024)throw new Error('Each sample must be nonempty and smaller than 8 MB.');const source=await context.decodeAudioData(await file.arrayBuffer()),prepared=preparePCM(source,'pop',file.name);buffers.push(toAudioBuffer(context,prepared));analyses.push(prepared.analysis);}
  if(context!==this.context||generation!==this.importGeneration)return;
  this.imported=buffers;this.analyses=analyses;this.bag.clear();this.lastSample=null;this.sampleLabel=`${buffers.length} cleaned sample${buffers.length===1?'':'s'}`;
 }
 clearSamples(){this.importGeneration++;this.imported=[];this.analyses=[];this.bag.clear();this.lastSample=null;this.sampleLabel='Synthesized fallback';}
 get sampleReport(){return {pops:this.analyses.map(a=>({...a,warnings:[...a.warnings]})),refill:this.refillAnalysis?{...this.refillAnalysis,warnings:[...this.refillAnalysis.warnings]}:null};}
 exportProcessed(kind:'pop'|'refill',index=0):ArrayBuffer {const buffer=kind==='refill'?this.refillSample:this.imported[index];if(!buffer)throw new Error('Load a sound first.');return encodeWav(buffer);}
 crinkle(){const c=this.context;if(this.muted||!c||c.state!=='running'||!this.master||!this.noise||this.voices>=14)return;this.voices++;const source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();source.buffer=this.noise;filter.type='highpass';filter.frequency.value=2300;gain.gain.setValueAtTime(.07,c.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.045);source.connect(filter);filter.connect(gain);gain.connect(this.master);source.start();source.stop(c.currentTime+.055);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();this.voices--;};}
 stopRefill(){this.refillGeneration++;this.refillVoice?.cancel();this.refillVoice=null;}
 get state(){return this.context?.state??'locked';}
 destroy(){this.clearSamples();this.clearRefillSample();this.feedback.destroy();this.pendingPops=0;if(this.context)void this.context.close();this.context=null;}
}
