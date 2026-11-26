import {gameVendors,type TimeSeriesLike} from './game-vendors';

export const VELOCITY_HISTORY_MS=30_000;

export interface VelocitySample {time:number;value:number;}

export interface VelocityChart {
 destroy():void;
 setRunning(running:boolean):void;
 recordPop(time?:number):number;
}

export interface VelocityChartOptions {
 rateWindowMs:number;
 reducedMotion?:boolean;
 running?:boolean;
 onRate?:(rate:number)=>void;
}

export function historySamples(values:readonly number[],now:number,windowMs=VELOCITY_HISTORY_MS):VelocitySample[] {
 const safe=values.length>1?values:[values[0]??0,values[0]??0];
 const step=windowMs/(safe.length-1);
 return safe.map((value,index)=>({time:now-windowMs+index*step,value}));
}

export function ratePerSecond(times:readonly number[],now:number,windowMs:number):number {
 if(!(windowMs>0))return 0;
 const start=now-windowMs;
 let count=0;
 for(let index=times.length-1;index>=0&&times[index]>=start;index--)count++;
 return count/(windowMs/1000);
}

export function mountVelocityChart(host:HTMLElement,values:readonly number[],options:VelocityChartOptions):VelocityChart {
 const vendors=gameVendors();
 const series:TimeSeriesLike=new vendors.TimeSeries({resetBounds:true,resetBoundsInterval:400});
 const now=Date.now();
 for(const sample of historySamples(values,now))series.append(sample.time,sample.value);
 const canvas=document.createElement('canvas');
 canvas.className='game-velocity-canvas';
 host.replaceChildren(canvas);
 const reduced=options.reducedMotion??matchMedia('(prefers-reduced-motion: reduce)').matches;
 const chart=new vendors.SmoothieChart({
  minValue:0,
  maxValueScale:1.25,
  scaleSmoothing:reduced?1:.18,
  interpolation:'bezier',
  millisPerPixel:VELOCITY_HISTORY_MS/Math.max(48,host.clientWidth||120),
  grid:{fillStyle:'rgba(0,0,0,0)',strokeStyle:'rgba(255,255,255,.2)',lineWidth:1,millisPerLine:5000,verticalSections:2,borderVisible:false},
  labels:{disabled:true},
  tooltip:false,
  responsive:true,
  limitFPS:reduced?8:30
 });
 chart.addTimeSeries(series,{strokeStyle:'#f4f4f4',fillStyle:'rgba(255,255,255,.16)',lineWidth:1.6,interpolation:'bezier'});
 const pops:number[]=[];
 let live=false;
 let running=options.running!==false;
 let hold=values.length?values[values.length-1]:0;
 const fit=()=>{
  const width=canvas.offsetWidth||host.clientWidth||120;
  chart.options.millisPerPixel=VELOCITY_HISTORY_MS/Math.max(48,width);
 };
 const sample=()=>{
  if(!running||document.hidden)return;
  const time=Date.now();
  while(pops.length&&time-pops[0]>VELOCITY_HISTORY_MS)pops.shift();
  const value=live?ratePerSecond(pops,time,options.rateWindowMs):hold;
  series.append(time,value);
  if(live)options.onRate?.(value);
 };
 const observer=new ResizeObserver(fit);
 observer.observe(host);
 const onVisibility=()=>setRunning(!document.hidden&&running);
 document.addEventListener('visibilitychange',onVisibility);
 const timer=window.setInterval(sample,500);
 const start=()=>{fit();chart.streamTo(canvas,250);};
 if(running&&!document.hidden)start();
 function setRunning(next:boolean){
  running=next;
  if(running&&!document.hidden)start();
  else chart.stop();
 }
 return {
  setRunning,
  recordPop(time=Date.now()){
   live=true;
   pops.push(time);
   while(pops.length&&time-pops[0]>VELOCITY_HISTORY_MS)pops.shift();
   const rate=ratePerSecond(pops,time,options.rateWindowMs);
   if(running&&!document.hidden){series.append(time,rate);options.onRate?.(rate);}
   return rate;
  },
  destroy(){
   window.clearInterval(timer);
   observer.disconnect();
   document.removeEventListener('visibilitychange',onVisibility);
   chart.stop();
   canvas.remove();
  }
 };
}

export function bindVelocityPops(chart:VelocityChart,source:EventTarget):()=>void {
 const onPop=(event:Event)=>{
  const sourceType=(event as CustomEvent<{source?:{type?:string}}>).detail?.source?.type;
  if(sourceType!=='manual')return;
  chart.recordPop();
 };
 source.addEventListener('bubblepop',onPop);
 return ()=>source.removeEventListener('bubblepop',onPop);
}
