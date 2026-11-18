import type {RefillPlan} from './bubble-samples';
/** Quintic ease: zero velocity and acceleration at both ends, no overshoot. */
export function sheetEase(progress:number):number {const t=Math.max(0,Math.min(1,progress));return t*t*t*(t*(t*6-15)+10);}
/** An empty sheet is still a physical sheet exchange. Keep the complete clip for
 * a full reset, and a sufficiently long excerpt for sparse/empty replacements. */
export function refreshPlan(base:RefillPlan,minimum:number):RefillPlan {
 const floor=Math.min(base.sourceDuration,Math.max(0,minimum));
 const duration=Math.max(base.duration,floor);
 return {...base,duration,offset:Math.max(0,base.sourceDuration-duration)};
}
