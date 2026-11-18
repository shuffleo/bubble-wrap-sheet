/** Offline PCM cleanup: never runs in the render loop or on a pop gesture.
 * Source buffers are immutable. Trim decisions use every channel, so stereo
 * phase cancellation cannot erase a transient. No pitch flattening is applied.
 */
export type SampleKind='pop'|'refill';
export interface PCMSource {sampleRate:number;length:number;numberOfChannels:number;getChannelData:(channel:number)=>Float32Array;}
export interface SampleAnalysis {
 name:string;kind:SampleKind;sampleRate:number;channels:number;originalSeconds:number;processedSeconds:number;
 trimmedStartMs:number;trimmedEndMs:number;inputPeakDbFS:number;outputPeakDbFS:number;outputRmsDbFS:number;
 appliedGainDb:number;thresholdDbFS:number;clippedInputSamples:number;warnings:string[];
}
export interface PreparedPCM {channels:Float32Array[];sampleRate:number;analysis:SampleAnalysis;}
const db=(a:number)=>20*Math.log10(Math.max(1e-9,a));
export function preparePCM(source:PCMSource,kind:SampleKind,name='sample'):PreparedPCM {
 const rate=source.sampleRate,n=source.length,count=source.numberOfChannels;
 if(!Number.isFinite(rate)||rate<8000||rate>384000||n<1||count<1||count>8)throw new Error('Unsupported audio format.');
 if(n/rate>30)throw new Error('Use a source recording no longer than 30 seconds, including silence.');
 const filtered:Float32Array[]=[],window=Math.max(1,Math.round(rate*.01)),pole=Math.exp(-2*Math.PI*20/rate);
 let peak=0,inputPeak=0,clipped=0;
 for(let c=0;c<count;c++){
  const input=source.getChannelData(c),out=new Float32Array(n),means:number[]=[];
  if(input.length!==n)throw new Error('Audio channels have inconsistent lengths.');
  for(let i=0;i<n;i+=window){let sum=0;const end=Math.min(n,i+window);for(let j=i;j<end;j++){const v=input[j];if(!Number.isFinite(v))throw new Error('Audio contains invalid PCM samples.');sum+=v;inputPeak=Math.max(inputPeak,Math.abs(v));if(Math.abs(v)>=.9999)clipped++;}means.push(sum/(end-i));}
  means.sort((a,b)=>a-b);const baseline=means[Math.floor(means.length/2)];let prev=0,y=0;
  for(let i=0;i<n;i++){const x=input[i]-baseline;y=x-prev+pole*y;prev=x;out[i]=y;peak=Math.max(peak,Math.abs(y));}filtered.push(out);
 }
 if(peak<1e-5)throw new Error('The recording is silent or too quiet to use safely.');
 const block=Math.max(1,Math.round(rate*.002)),peaks:number[]=[];
 for(let i=0;i<n;i+=block){let p=0;for(const channel of filtered)for(let j=i;j<Math.min(n,i+block);j++)p=Math.max(p,Math.abs(channel[j]));peaks.push(p);}
 const sorted=peaks.slice().sort((a,b)=>a-b),floor=sorted[Math.floor(sorted.length*.1)];
 // Relative -46 dB threshold plus a bounded noise-floor estimate. Never gate
 // the middle of a recording; only remove outer silence and preserve the tail.
 const threshold=Math.max(1e-5,peak*Math.pow(10,-46/20),Math.min(floor*3,peak*.08));
 let first=n,last=-1;
 for(const channel of filtered)for(let i=0;i<n;i++)if(Math.abs(channel[i])>=threshold){first=Math.min(first,i);last=Math.max(last,i);}
 if(last<first)throw new Error('No usable sound was detected.');
 const start=Math.max(0,first-Math.round(rate*.002));
 const end=Math.min(n,last+1+Math.round(rate*(kind==='pop'?.018:.025))),length=end-start,duration=length/rate;
 if(duration>(kind==='pop'?3:15))throw new Error(kind==='pop'?'Trimmed pop is longer than 3 seconds. Choose an individual pop.':'Trimmed refill is longer than 15 seconds.');
 const gain=Math.min(4,(kind==='pop'?.70:.65)/peak),attack=Math.min(Math.round(rate*.0003),Math.floor(length/8)),release=Math.min(Math.round(rate*(kind==='pop'?.006:.012)),Math.floor(length/8));
 let energy=0,outPeak=0;
 const channels=filtered.map(channel=>{const output=new Float32Array(length);for(let i=0;i<length;i++){
  const fadeIn=attack>0?Math.min(1,i/attack):1,fadeOut=release>0?Math.min(1,(length-1-i)/release):1;
  const v=channel[start+i]*gain*fadeIn*fadeOut;output[i]=v;energy+=v*v;outPeak=Math.max(outPeak,Math.abs(v));
 }return output;});
 const warnings:string[]=[];
 if(clipped)warnings.push('Source contains full-scale samples; clipped transients cannot be reconstructed by normalization.');
 if(first===0||last===n-1)warnings.push('Sound reaches a source boundary. Only a tiny click-prevention fade was applied there.');
 if(kind==='pop'&&duration>.65)warnings.push('Long pop tail retained. Audition for multiple pops or background noise before using.');
 return {channels,sampleRate:rate,analysis:{name,kind,sampleRate:rate,channels:count,originalSeconds:n/rate,processedSeconds:duration,trimmedStartMs:start/rate*1000,trimmedEndMs:(n-end)/rate*1000,inputPeakDbFS:db(inputPeak),outputPeakDbFS:db(outPeak),outputRmsDbFS:db(Math.sqrt(energy/(length*count))),appliedGainDb:db(gain),thresholdDbFS:db(threshold),clippedInputSamples:clipped,warnings}};
}
export function toAudioBuffer(context:BaseAudioContext,pcm:PreparedPCM):AudioBuffer {
 const buffer=context.createBuffer(pcm.channels.length,pcm.channels[0].length,pcm.sampleRate);
 pcm.channels.forEach((channel,i)=>buffer.getChannelData(i).set(channel));return buffer;
}
/** Portable processed 16-bit PCM WAV; the imported original is never overwritten. */
export function encodeWav(source:PCMSource):ArrayBuffer {
 const channels=source.numberOfChannels,bytes=source.length*channels*2,data=new ArrayBuffer(44+bytes),view=new DataView(data);
 const text=(offset:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(offset+i,s.charCodeAt(i));};
 text(0,'RIFF');view.setUint32(4,36+bytes,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,source.sampleRate,true);view.setUint32(28,source.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,bytes,true);
 const arrays=Array.from({length:channels},(_,i)=>source.getChannelData(i));let offset=44;
 for(let i=0;i<source.length;i++)for(const channel of arrays){const v=Math.max(-1,Math.min(1,channel[i]));view.setInt16(offset,Math.round(v*(v<0?32768:32767)),true);offset+=2;}return data;
}
/** Shuffle bag: equally frequent samples and no same-file repeat at a boundary. */
export class SampleBag {
 private bag:number[]=[];private last=-1;private count=0;
 pick(count:number,random:()=>number=Math.random):number {
  if(count<1)return -1;if(count!==this.count){this.bag=[];this.count=count;this.last=-1;}
  const unit=()=>Math.max(0,Math.min(.999999999999,random()||0));
  if(!this.bag.length){this.bag=Array.from({length:count},(_,i)=>i);for(let i=count-1;i>0;i--){const j=Math.floor(unit()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
   if(count>1&&this.bag[count-1]===this.last)[this.bag[0],this.bag[count-1]]=[this.bag[count-1],this.bag[0]];
  }return this.last=this.bag.pop()!;
 }
 clear(){this.bag=[];this.count=0;this.last=-1;}
}
export interface RefillPlan {duration:number;offset:number;sourceDuration:number;fraction:number;popped:number;total:number;sample:boolean;}
/** Full sheet: entire trimmed clip. Partial sheet: tail-anchored excerpt at
 * original pitch. A single cell is a short cue even on a tiny viewport. */
export function makeRefillPlan(sourceDuration:number,popped:number,total:number,sample:boolean,minimum=.18,adaptive=true):RefillPlan {
 const length=Math.max(.02,Math.min(15,Number.isFinite(sourceDuration)?sourceDuration:.97));
 const whole=Math.max(0,Math.floor(total)),amount=Math.min(whole,Math.max(0,Math.floor(popped)));
 const fraction=whole>0?amount/whole:0;
 let duration=0;
 if(amount>0){const floor=Math.min(length,Math.max(.04,minimum));duration=!adaptive||amount===whole?length:amount===1?floor:floor+(length-floor)*Math.pow(fraction,.6);}
 return {duration,offset:Math.max(0,length-duration),sourceDuration:length,fraction,popped:amount,total:whole,sample};
}
