interface NumberFlowElement extends HTMLElement {
 format?:Intl.NumberFormatOptions;
 numberPrefix?:string;
 plugins?:unknown[];
 update(value?:number):void;
}

interface PaneInstance {
 addFolder(options:{title:string;expanded?:boolean}):unknown;
 dispose():void;
}

interface VelocityPlot {
 destroy():void;
 ctx:CanvasRenderingContext2D;
 bbox:{top:number;height:number};
}

interface GameVendorBundle {
 Pane:new(options?:{container?:HTMLElement})=>PaneInstance;
 continuous:unknown;
 uPlot:{
  new(options:Record<string,unknown>,data:number[][],target:HTMLElement):VelocityPlot;
  paths:{spline?:()=>unknown};
 };
}

export interface VelocityChart {destroy():void;}

declare global {
 interface Window {GameVendors?:GameVendorBundle;}
}

export function gameVendors():GameVendorBundle {
 if(!window.GameVendors)throw new Error('Game UI vendors were not bundled');
 return window.GameVendors;
}

export function animatedNumber(value:number,{currency=false,continuous=true,minimumIntegerDigits=1}:{currency?:boolean;continuous?:boolean;minimumIntegerDigits?:number}={}):NumberFlowElement {
 const element=document.createElement('number-flow') as NumberFlowElement;
 element.format={minimumFractionDigits:0,maximumFractionDigits:2,minimumIntegerDigits,useGrouping:true};
 if(currency)element.numberPrefix='$';
 if(continuous)element.plugins=[gameVendors().continuous];
 element.setAttribute('aria-label',currency?`$${value}`:String(value));
 element.update(value);
 return element;
}

export function mountVelocityChart(host:HTMLElement,values:readonly number[]):VelocityChart {
 const samples=values.length>1?values:[0,values[0]??0];
 const uPlot=gameVendors().uPlot;
 const width=Math.max(108,Math.round(host.clientWidth||132));
 const height=28;
 const plot=new uPlot({
  width,height,pxAlign:false,
  padding:[3,1,2,1],
  cursor:{show:false,points:{show:false},drag:{setScale:false,x:false,y:false}},
  legend:{show:false},
  axes:[{show:false,size:0,stroke:'transparent'},{show:false,size:0,stroke:'transparent'}],
  scales:{x:{time:false},y:{range:(_plot:unknown,_min:number,max:number)=>[0,Math.max(1,max*1.12)]}},
  series:[{},{
   stroke:'#f3f3f3',width:1.7,points:{show:false},
   paths:uPlot.paths.spline?.(),
   fill:(self:VelocityPlot)=>{
    const gradient=self.ctx.createLinearGradient(0,self.bbox.top,0,self.bbox.top+self.bbox.height);
    gradient.addColorStop(0,'rgba(255,255,255,.38)');
    gradient.addColorStop(1,'rgba(255,255,255,0)');
    return gradient;
   }
  }]
 },[samples.map((_value,index)=>index),samples.map(value=>value)],host);
 return {destroy:()=>plot.destroy()};
}

export function updateAnimatedNumber(element:Element|null,value:number):void {
 if(element instanceof HTMLElement&&element.tagName.toLowerCase()==='number-flow'){
  const flow=element as NumberFlowElement;
  flow.setAttribute('aria-label',`${flow.numberPrefix??''}${value}`);
  flow.update(value);
 }
}
