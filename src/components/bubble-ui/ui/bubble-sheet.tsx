'use client';
import * as React from 'react';
import {BubbleSurface,type BubbleSurfaceProps,type BubbleSurfaceHandle} from '../primitives/bubble-surface';
export type BubbleSheetHandle=BubbleSurfaceHandle;
export interface BubbleSheetProps extends Omit<BubbleSurfaceProps,'mode'|'layout'> {poppable?:boolean;}
export const BubbleSheet=React.forwardRef<BubbleSheetHandle,BubbleSheetProps>(function BubbleSheet({poppable=true,...props},ref){return <BubbleSurface {...props} ref={ref} layout="grid" mode={poppable?'poppable':'spring-return'} />;});
