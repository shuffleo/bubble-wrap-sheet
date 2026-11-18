import {BUNDLED_SOUNDS} from './bubble-bundled-data';
import type {PreparedPCM} from './bubble-samples';
/** Decode our generated PCM16 WAVs synchronously before the first gesture.
 * No fetch, CDN, decodeAudioData race, or AudioContext is required. */
export function bundledPCM():PreparedPCM[] {
 return BUNDLED_SOUNDS.map(sample=>{
  const raw=atob(sample.base64),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),view=new DataView(bytes.buffer);
  const tag=(at:number,n:number)=>String.fromCharCode(...bytes.subarray(at,at+n));
  if(tag(0,4)!=='RIFF'||tag(8,4)!=='WAVE')throw new Error('Invalid bundled WAV');
  let rate=0,count=0,bits=0,format=0,start=0,size=0;
  for(let at=12;at+8<=bytes.length;){const length=view.getUint32(at+4,true),id=tag(at,4);if(at+8+length>bytes.length)throw new Error('Truncated bundled WAV');
   if(id==='fmt '){format=view.getUint16(at+8,true);count=view.getUint16(at+10,true);rate=view.getUint32(at+12,true);bits=view.getUint16(at+22,true);}
   if(id==='data'){start=at+8;size=length;}at+=8+length+(length%2);
  }
  if(format!==1||bits!==16||count<1||count>2||rate<8000||!size||size%(count*2))throw new Error('Unsupported bundled PCM');
  const frames=size/count/2,channels=Array.from({length:count},()=>new Float32Array(frames));
  for(let i=0;i<frames;i++)for(let c=0;c<count;c++)channels[c][i]=view.getInt16(start+(i*count+c)*2,true)/32768;
  return {channels,sampleRate:rate,analysis:sample.analysis};
 });
}
