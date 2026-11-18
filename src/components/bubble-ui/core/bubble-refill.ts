/** A rising, reversed-air swell with a short rubbery zip at the finish. */
export interface RefillVoice {cancel:()=>void;duration:number;}

/** Shared by the live synthesizer and OfflineAudioContext signal tests. */
export function scheduleRefill(
 context:BaseAudioContext,
 destination:AudioNode,
 noise:AudioBuffer,
 waveDuration:number,
 onEnded:()=>void=()=>{},
 exactDuration?:number,
 startAt?:number
):RefillVoice {
 const duration=exactDuration??Math.max(.32,Math.min(1.25,Number.isFinite(waveDuration)?waveDuration+.12:.97));
 const start=startAt??context.currentTime+.006,end=start+duration;
 const output=context.createGain(),air=context.createBufferSource(),band=context.createBiquadFilter(),low=context.createBiquadFilter(),airGain=context.createGain();
 const body=context.createOscillator(),bodyGain=context.createGain();
 output.connect(destination);
 air.buffer=noise;air.loop=true;
 band.type='bandpass';band.Q.value=.65;
 band.frequency.setValueAtTime(300,start);
 band.frequency.exponentialRampToValueAtTime(1350,start+duration*.65);
 band.frequency.exponentialRampToValueAtTime(3200,start+duration*.91);
 band.frequency.exponentialRampToValueAtTime(1100,end);
 low.type='lowpass';low.Q.value=.5;low.frequency.setValueAtTime(1400,start);low.frequency.exponentialRampToValueAtTime(7800,end);
 // Slow intake builds toward the end, then releases quickly, rather than a pop.
 airGain.gain.setValueAtTime(.0001,start);
 airGain.gain.exponentialRampToValueAtTime(.055,start+duration*.2);
 airGain.gain.exponentialRampToValueAtTime(.29,start+duration*.6);
 airGain.gain.exponentialRampToValueAtTime(.52,start+duration*.86);
 airGain.gain.exponentialRampToValueAtTime(.0001,end);
 air.connect(band);band.connect(low);low.connect(airGain);airGain.connect(output);
 body.type='triangle';body.frequency.setValueAtTime(100,start);
 body.frequency.exponentialRampToValueAtTime(320,start+duration*.64);
 body.frequency.exponentialRampToValueAtTime(870,start+duration*.9);
 body.frequency.exponentialRampToValueAtTime(125,end);
 bodyGain.gain.setValueAtTime(.0001,start);
 bodyGain.gain.exponentialRampToValueAtTime(.025,start+duration*.3);
 bodyGain.gain.exponentialRampToValueAtTime(.11,start+duration*.84);
 bodyGain.gain.exponentialRampToValueAtTime(.0001,end);
 body.connect(bodyGain);bodyGain.connect(output);
 let live=2,cancelled=false;
 const cleanup=()=>{if(--live===0){for(const node of [air,band,low,airGain,body,bodyGain,output])node.disconnect();onEnded();}};
 air.onended=cleanup;body.onended=cleanup;
 air.start(start);body.start(start);air.stop(end+.02);body.stop(end+.02);
 return {duration,cancel:()=>{if(cancelled||live===0)return;cancelled=true;const now=context.currentTime;output.gain.cancelScheduledValues(now);output.gain.setTargetAtTime(0,now,.004);air.stop(now+.024);body.stop(now+.024);}};
}

/** Plays the full trimmed refill or a planned excerpt, at its original pitch.
 * Replacement voices use the same cancel contract as the synthesized fallback.
 */
export function scheduleRefillSample(context:BaseAudioContext,destination:AudioNode,buffer:AudioBuffer,onEnded:()=>void=()=>{},options?:{duration:number;offset:number;startAt?:number}):RefillVoice {
 const source=context.createBufferSource(),gain=context.createGain();source.buffer=buffer;source.playbackRate.value=1;
 const offset=Math.max(0,Math.min(buffer.duration,options?.offset??0)),duration=Math.max(.001,Math.min(buffer.duration-offset,options?.duration??buffer.duration)),start=options?.startAt??context.currentTime+.006,end=start+duration,fade=Math.min(.008,duration/4);
 gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+fade);gain.gain.setValueAtTime(1,end-fade);gain.gain.linearRampToValueAtTime(0,end);
 source.connect(gain);gain.connect(destination);let ended=false,cancelled=false;
 source.onended=()=>{ended=true;source.disconnect();gain.disconnect();onEnded();};source.start(start,offset,duration);source.stop(end+.002);
 return {duration,cancel:()=>{if(ended||cancelled)return;cancelled=true;const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setTargetAtTime(0,now,.004);source.stop(now+.024);}};
}
