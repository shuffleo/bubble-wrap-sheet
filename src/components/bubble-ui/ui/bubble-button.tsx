'use client';
import * as React from 'react';
import {useBubbleRegistration} from '../primitives/bubble-surface';
export interface BubbleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>{bubbleSize?:number;}
/** Native button semantics; one membrane, spring-return behavior, shared draw. */
export const BubbleButton=React.forwardRef<HTMLButtonElement,BubbleButtonProps>(function BubbleButton({bubbleSize=32,style,children,...props},forwardedRef){
 const node=React.useRef<HTMLButtonElement>(null);
 useBubbleRegistration(node,{bubbleSize,gap:10,cornerRadius:999,mode:'spring-return',layout:'single'});
 React.useImperativeHandle(forwardedRef,()=>node.current!,[]);
 return <button type="button" aria-label="Spring-return bubble" {...props} ref={node} style={{width:38,height:38,padding:0,border:'1px solid #3a3a3a',borderRadius:'50%',background:'transparent',position:'relative',zIndex:2,touchAction:'none',cursor:'pointer',...style}}>{children}</button>;
});
