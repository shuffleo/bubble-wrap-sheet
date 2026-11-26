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

export interface TimeSeriesLike {
 append(timestamp:number,value:number):void;
}

export interface SmoothieChartLike {
 options:{millisPerPixel:number};
 addTimeSeries(series:TimeSeriesLike,presentation?:object):void;
 streamTo(canvas:HTMLCanvasElement,delayMillis?:number):void;
 stop():void;
}

interface GameVendorBundle {
 Pane:new(options?:{container?:HTMLElement})=>PaneInstance;
 continuous:unknown;
 TimeSeries:new(options?:{resetBounds?:boolean;resetBoundsInterval?:number})=>TimeSeriesLike;
 SmoothieChart:new(options?:object)=>SmoothieChartLike;
}

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

export function updateAnimatedNumber(element:Element|null,value:number):void {
 if(element instanceof HTMLElement&&element.tagName.toLowerCase()==='number-flow'){
  const flow=element as NumberFlowElement;
  flow.setAttribute('aria-label',`${flow.numberPrefix??''}${value}`);
  flow.update(value);
 }
}
