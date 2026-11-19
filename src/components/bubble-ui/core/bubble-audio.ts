import {bundledPCM} from './bubble-bundled-audio';
import {refreshPlan} from './bubble-refresh';
import {BubbleHaptics} from './bubble-haptics';
import {scheduleRefill,scheduleRefillSample,type RefillVoice} from './bubble-refill';
import {preparePCM,toAudioBuffer,encodeWav,SampleBag,makeRefillPlan,type SampleAnalysis,type RefillPlan} from './bubble-samples';
export interface RefillTimeline {duration:number;elapsed:()=>number;plan:RefillPlan;}
/** Predecode and clean samples at import time. Gestures only schedule playback. */
export class BubbleAudio {
 private context:AudioContext|null=null;private master:GainNode|null=null;private noise:AudioBuffer|null=null;private voices=0;private pendingPops=0;
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
  if(!this.context){const AC=window.AudioContext||(window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;if(!AC)return;
   try{this.context=new AC({latencyHint:'interactive'});}catch{try{this.context=new AC();}catch{return;}}
   this.loadBundled(this.context);this.context.onstatechange=()=>this.flushPending();
   this.master=this.context.createGain();this.master.gain.value=this.muted?0:this.volume;
   const limit=this.context.createDynamicsCompressor();limit.threshold.value=-12;limit.ratio.value=8;this.master.connect(limit);limit.connect(this.context.destination);
   this.noise=this.context.createBuffer(1,Math.ceil(this.context.sampleRate*.12),this.context.sampleRate);const data=this.noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
   this.refillNoise=this.context.createBuffer(1,Math.ceil(this.context.sampleRate*1.5),this.context.sampleRate);const refillData=this.refillNoise.getChannelData(0);for(let i=0;i<refillData.length;i++)refillData[i]=Math.random()*2-1;
  }
  if(this.context.state==='running'){this.flushPending();return;}
  this.prime();
  if(this.context.state==='closed')return;
  try{void this.context.resume().then(()=>this.flushPending()).catch(()=>{});}
  catch{}
 }
 setMuted(value:boolean){this.muted=value;if(value){this.pendingPops=0;this.refillGeneration++;this.refillVoice?.cancel();this.refillVoice=null;}if(this.context&&this.master)this.master.gain.setTargetAtTime(value?0:this.volume,this.context.currentTime,.01);}
 pop(withHaptic=true){
  if(withHaptic)this.feedback.pulse(13);
  const c=this.context;if(this.muted||this.volume<=0||!c||!this.master||!this.noise||this.voices>=14)return;if(c.state!=='running'){if(c.state!=='closed'){this.pendingPops=Math.min(8,this.pendingPops+1);this.unlock();}return;}
  if(this.imported.length){
   const index=this.bag.pick(this.imported.length),buffer=this.imported[index],rate=1+(Math.random()*2-1)*this.pitchVariation,gain=1+(Math.random()*2-1)*this.sampleGainVariation,toneDb=(Math.random()*2-1)*this.sampleToneVariation;
   const node=c.createBufferSource(),level=c.createGain(),tone=c.createBiquadFilter();node.buffer=buffer;node.playbackRate.value=rate;level.gain.value=gain;tone.type='highshelf';tone.frequency.value=3500;tone.gain.value=toneDb;
   node.connect(tone);tone.connect(level);level.connect(this.master);this.voices++;this.lastSample={index,rate,gain,toneDb,duration:buffer.duration/rate};
   node.onended=()=>{node.disconnect();tone.disconnect();level.disconnect();this.voices--;};node.start(c.currentTime+.002);return;
  }
  this.voices++;const now=c.currentTime+.002,pitch=1+(Math.random()*2-1)*this.pitchVariation;
  const osc=c.createOscillator(),env=c.createGain();osc.type='sine';osc.frequency.setValueAtTime(610*pitch,now);osc.frequency.exponentialRampToValueAtTime(95*pitch,now+.043);env.gain.setValueAtTime(.0001,now);env.gain.exponentialRampToValueAtTime(.78,now+.0015);env.gain.exponentialRampToValueAtTime(.0001,now+.078);osc.connect(env);env.connect(this.master);osc.start(now);osc.stop(now+.09);
  const n=c.createBufferSource(),filter=c.createBiquadFilter(),air=c.createGain();n.buffer=this.noise;filter.type='bandpass';filter.frequency.value=1900*pitch;filter.Q.value=.65;air.gain.setValueAtTime(.0001,now);air.gain.exponentialRampToValueAtTime(.75,now+.001);air.gain.exponentialRampToValueAtTime(.0001,now+.034);n.connect(filter);filter.connect(air);air.connect(this.master);n.start(now);n.stop(now+.05);
  osc.onended=()=>{osc.disconnect();env.disconnect();this.voices--;};n.onended=()=>{n.disconnect();filter.disconnect();air.disconnect();};
 }
 planRefill(waveDuration=.85,popped=1,total=1){const duration=this.refillSample?.duration??Math.max(.32,Math.min(1.25,Number.isFinite(waveDuration)?waveDuration+.12:.97));return makeRefillPlan(duration,popped,total,!!this.refillSample,this.refillMinimum,this.adaptiveRefill);}
 /** Share a clock/duration with the wave. A full refill preserves the clip's
  * complete trimmed content. A partial one plays only a faded ending excerpt. */
 refill(waveDuration=.85,popped=1,total=1,minimumDuration=0):RefillTimeline {
  const plan=refreshPlan(this.planRefill(waveDuration,popped,total),minimumDuration);this.lastRefillPlan=plan;
  const wallStart=performance.now()/1000+.006;let readClock=()=>performance.now()/1000-wallStart,lastElapsed=0;
  const timeline={duration:plan.duration,plan,elapsed:()=>{lastElapsed=Math.max(lastElapsed,readClock());return lastElapsed;}};
  this.refillVoice?.cancel();this.refillVoice=null;const generation=++this.refillGeneration;
  if(this.muted||this.volume<=0||plan.duration<=0)return timeline;
  this.unlock();const context=this.context;if(!context||!this.master||!this.refillNoise)return timeline;
  const play=(resumed=false)=>{
   if(generation!==this.refillGeneration||context!==this.context||this.muted||this.volume<=0||context.state!=='running')return;
   const elapsed=resumed?Math.max(0,performance.now()/1000-wallStart):0;
   // Never fire a stale refill after a blocked/slow unlock. Visuals still finish.
   if(elapsed>.1||elapsed>=plan.duration)return;
   const start=context.currentTime+.006,remaining=plan.duration-elapsed;
   readClock=()=>context.state==='running'?elapsed+context.currentTime-start:performance.now()/1000-wallStart;
   const ended=()=>{if(this.refillGeneration===generation)this.refillVoice=null;};
   this.refillVoice=this.refillSample?scheduleRefillSample(context,this.master!,this.refillSample,ended,{duration:remaining,offset:plan.offset+elapsed,startAt:start}):scheduleRefill(context,this.master!,this.refillNoise!,waveDuration,ended,remaining,start);
  };
  if(context.state==='running')play();else if(context.state==='suspended')void context.resume().then(()=>play(true)).catch(()=>{});
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
