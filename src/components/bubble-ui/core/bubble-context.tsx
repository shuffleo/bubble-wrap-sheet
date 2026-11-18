'use client';
import * as React from 'react';
import {DEFAULTS,type Settings} from './bubble-settings';
import {BubbleEngine,type BubbleStats} from './bubble-engine';
const Context=React.createContext<BubbleEngine|null|undefined>(undefined);
export interface BubbleProviderProps {children:React.ReactNode;className?:string;onError?:(error:Error)=>void;canvasZIndex?:number;initialSettings?:Partial<Settings>;}
/** Mount exactly once, above all surfaces. React never owns animation state. */
export function BubbleProvider({children,className,onError,canvasZIndex=1,initialSettings}:BubbleProviderProps){
 const initialRef=React.useRef(initialSettings);
 const canvas=React.useRef<HTMLCanvasElement>(null);
 const [engine,setEngine]=React.useState<BubbleEngine|null>(null);
 const [error,setError]=React.useState<string|null>(null);
 const errorRef=React.useRef(onError);errorRef.current=onError;
 React.useEffect(()=>{
  if(!canvas.current)return;
  let next:BubbleEngine;
  try{next=new BubbleEngine(canvas.current);if(initialRef.current)next.setSettings(initialRef.current);setEngine(next);setError(null);}
  catch(reason){const e=reason instanceof Error?reason:new Error(String(reason));setError(e.message);errorRef.current?.(e);return;}
  return()=>{next.destroy();};
 },[]);
 return <Context.Provider value={engine}>
  <canvas ref={canvas} className={className} aria-hidden="true" style={{position:'fixed',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:canvasZIndex}} />
  {children}
  {error&&<div role="alert" style={{position:'fixed',inset:'20%',zIndex:100,padding:24,background:'#111',color:'#ddd',borderRadius:16}}>The bubble material could not start. {error}</div>}
 </Context.Provider>;
}
export function useBubbleEngine(){const value=React.useContext(Context);if(value===undefined)throw new Error('Wrap Bubble UI surfaces in one BubbleProvider.');return value;}
const initial:BubbleStats={popped:0,total:0,drawCalls:0,instances:0,surfaces:0,dpr:1,audio:'locked',activePointers:0,frames:0};
/** Event-driven UI snapshots, never a subscription to the RAF loop. */
export function useBubbleStats(){const engine=useBubbleEngine();const [stats,setStats]=React.useState(initial);React.useEffect(()=>{if(!engine)return;const update=()=>setStats(engine.getStats());engine.addEventListener('change',update);update();return()=>engine.removeEventListener('change',update);},[engine]);return stats;}

/** UI changes only: no React subscriptions to physics frames. */
export function useBubbleSettings(){const engine=useBubbleEngine();const [settings,setSettings]=React.useState<Settings>({...DEFAULTS});React.useEffect(()=>{if(!engine)return;const update=()=>setSettings({...engine.settings});engine.addEventListener('settingschange',update);update();return()=>engine.removeEventListener('settingschange',update);},[engine]);return settings;}
