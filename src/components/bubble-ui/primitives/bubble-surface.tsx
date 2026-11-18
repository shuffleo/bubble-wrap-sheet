'use client';
import * as React from 'react';
import {DEFAULTS} from '../core/bubble-settings';
import {useBubbleEngine} from '../core/bubble-context';
import type {SurfaceConfig} from '../core/bubble-grid';
import type {SurfaceHandle} from '../core/bubble-engine';
export interface BubbleSurfaceHandle {reset:(immediate?:boolean)=>void;}
export interface BubbleSurfaceProps extends Omit<React.HTMLAttributes<HTMLDivElement>,'onError'>,SurfaceConfig {}
export function useBubbleRegistration(ref:React.RefObject<HTMLElement|null>,config:SurfaceConfig){
 const engine=useBubbleEngine(),handle=React.useRef<SurfaceHandle|null>(null),latest=React.useRef(config);latest.current=config;
 React.useLayoutEffect(()=>{if(!engine||!ref.current)return;const h=engine.register(ref.current,{...latest.current,onPop:n=>latest.current.onPop?.(n),onAllPopped:()=>latest.current.onAllPopped?.()});handle.current=h;return()=>{h.dispose();handle.current=null;};},[engine,ref]);
 React.useLayoutEffect(()=>{handle.current?.update({bubbleSize:config.bubbleSize,gap:config.gap,cornerRadius:config.cornerRadius,edgeRoughness:config.edgeRoughness,edgeScale:config.edgeScale,edgeSeed:config.edgeSeed,cornerVariation:config.cornerVariation,mode:config.mode,layout:config.layout});},[config.bubbleSize,config.gap,config.cornerRadius,config.edgeRoughness,config.edgeScale,config.edgeSeed,config.cornerVariation,config.mode,config.layout]);
 return handle;
}
export const BubbleSurface=React.forwardRef<BubbleSurfaceHandle,BubbleSurfaceProps>(function BubbleSurface({bubbleSize=DEFAULTS.bubbleSize,gap=4,mode='poppable',cornerRadius=5,edgeRoughness=4.5,edgeScale=24,edgeSeed=17,cornerVariation=.38,layout='grid',onPop,onAllPopped,style,children,...props},forwardedRef){
 const node=React.useRef<HTMLDivElement>(null),handle=useBubbleRegistration(node,{bubbleSize,gap,mode,cornerRadius,edgeRoughness,edgeScale,edgeSeed,cornerVariation,layout,onPop,onAllPopped});
 React.useImperativeHandle(forwardedRef,()=>({reset:(immediate=false)=>handle.current?.reset(immediate)}),[handle]);
 return <div ref={node} tabIndex={0} role="region" aria-label="Interactive bubble wrap" {...props} style={{touchAction:'none',userSelect:'none',position:'relative',zIndex:2,background:'transparent',...style}}>{children}</div>;
});
