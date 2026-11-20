/** Mobile feedback adapter. Never fakes a trusted event or calls .click().
 * Android: one Vibration API pattern, updated synchronously inside the gesture.
 * iPhone: a real touch starts on a native switch. Each pop leapfrogs that switch
 * across the finger so WebKit's own drag tracking flips it and plays a tick.
 * Feature detection is NOT proof of a physical motor or enabled system haptics.
 */
export type HapticMode='vibration-api'|'native-switch-tap'|'unavailable';
const SWITCH_ARM_MS=260, SWITCH_MOVE_GAP=2, SWITCH_PARK_PX=10000;
export interface SwitchDragState {armedAt:number;visuallyOn:boolean;queued:number;movesSince:number;parked:boolean;}
export function beginSwitchDrag(now:number,checked:boolean):SwitchDragState {return {armedAt:now+SWITCH_ARM_MS,visuallyOn:checked,queued:0,movesSince:Number.POSITIVE_INFINITY,parked:false};}
/** Remaining vibration/pause segments, with the elapsed portion removed. */
export function nextVibrationPattern(previous:number[],startedAt:number,now:number,pulse:number,gap=16):number[] {
 const elapsed=Math.max(0,now-startedAt);const pending:number[]=[];let used=0;
 for(let i=0;i<previous.length;i++){const segment=previous[i];if(used+segment>elapsed){pending.push(Math.max(1,Math.round(segment-(elapsed-used))));for(let j=i+1;j<previous.length;j++)pending.push(previous[j]);break;}used+=segment;}
 const pulses=pending.reduce((count,segment,index)=>count+(index%2===0?1:0),0);
 if(pulses>=12)return pending;
 return pending.length===0?[pulse]:pending.length%2===1?[...pending,gap,pulse]:[...pending,pulse];
}
/** Move the switch across the finger, or park it once tracking is armed. */
export function placeSwitchDrag(drag:SwitchDragState,now:number):number|null {
 if(drag.queued>0&&now>=drag.armedAt&&drag.movesSince>=SWITCH_MOVE_GAP){drag.queued--;drag.movesSince=0;drag.parked=true;const thumbLeft=!drag.visuallyOn;drag.visuallyOn=!drag.visuallyOn;return thumbLeft?-SWITCH_PARK_PX:SWITCH_PARK_PX;}
 if(drag.parked||now<drag.armedAt)return null;drag.parked=true;return !drag.visuallyOn?SWITCH_PARK_PX:-SWITCH_PARK_PX;
}
let switchId=0;
export class BubbleHaptics {
 readonly mode:HapticMode;private active=true;private destroyed=false;
 private bindings=new Set<{sync:()=>void;dispose:()=>void}>();
 private requests=0;private accepted=0;private nativeTaps=0;private lastResult='not-tested';
 private pattern:number[]=[];private patternStarted=0;private drag:SwitchDragState|null=null;private dragInput:HTMLInputElement|null=null;
 constructor(){
  const nav=typeof navigator==='undefined'?undefined:navigator;
  this.mode=typeof nav?.vibrate==='function'?'vibration-api':
   typeof document!=='undefined'&&(nav?.maxTouchPoints??0)>0&&'switch' in document.createElement('input')?'native-switch-tap':'unavailable';
 }
 get enabled(){return this.active;}
 set enabled(value:boolean){this.active=value;if(!value){this.pattern=[];this.drag=null;}for(const b of this.bindings)b.sync();}
 private vibrate(pattern:number|number[]):boolean {
  try {const ok=navigator.vibrate(pattern);this.lastResult=ok?'api-accepted':'api-declined';if(ok)this.accepted++;return ok;}
  catch {this.lastResult='api-blocked';return false;}
 }
 pulse(milliseconds=13):boolean {
  if(this.destroyed||!this.active||(typeof document!=='undefined'&&document.hidden))return false;
  if(this.mode==='native-switch-tap'){if(!this.drag)return false;this.requests++;this.drag.queued=Math.min(16,this.drag.queued+1);const offset=placeSwitchDrag(this.drag,performance.now());if(offset!==null&&this.dragInput)this.dragInput.style.transform=`translate3d(${offset}px,0,0)`;this.lastResult='switch-drag-armed';return true;}
  if(this.mode!=='vibration-api')return false;
  this.requests++;const duration=Math.max(1,Math.min(30,Math.round(milliseconds))),now=performance.now();
  this.pattern=nextVibrationPattern(this.pattern,this.patternStarted,now,duration);this.patternStarted=now;
  return this.vibrate(this.pattern.length===1?this.pattern[0]:this.pattern);
 }
 /** The switch is the touch target, so a drag can flip it once per pop.
  * One invisible switch per surface, not one per bubble.
  */
 attach(node:HTMLElement):()=>void {
  if(this.destroyed||this.mode!=='native-switch-tap')return()=>{};
  const doc=node.ownerDocument,view=doc.defaultView??window,input=doc.createElement('input');
  input.type='checkbox';input.setAttribute('switch','');input.id='bubble-native-haptic-'+(++switchId);
  input.tabIndex=-1;input.setAttribute('aria-hidden','true');input.setAttribute('data-bubble-haptic-switch','');input.setAttribute('data-bubble-haptic-tap','');
  input.style.cssText='position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;opacity:0;appearance:auto;-webkit-appearance:auto;touch-action:none;cursor:inherit;-webkit-tap-highlight-color:transparent;';
  const position=node.style.position;if(getComputedStyle(node).position==='static')node.style.position='relative';
  node.append(input);let drag:SwitchDragState|null=null;let pointerId=-1;
  const place=()=>{if(!drag)return;const offset=placeSwitchDrag(drag,performance.now());if(offset!==null)input.style.transform=`translate3d(${offset}px,0,0)`;};
  const down=(event:PointerEvent)=>{if(!event.isTrusted||!this.active||this.destroyed||event.button!==0||event.pointerType==='pen')return;pointerId=event.pointerId;drag=beginSwitchDrag(performance.now(),input.checked);this.drag=drag;this.dragInput=input;};
  const move=(event:PointerEvent)=>{if(!drag||event.pointerId!==pointerId)return;drag.movesSince++;place();};
  const end=(event:PointerEvent)=>{if(!drag||event.pointerId!==pointerId)return;drag=null;pointerId=-1;if(this.dragInput===input){this.drag=null;this.dragInput=null;}input.style.transform='';};
  const activated=(event:Event)=>{if(!event.isTrusted||!this.active||this.destroyed){event.preventDefault();return;}this.nativeTaps++;this.lastResult='native-switch-activated';};
  input.addEventListener('pointerdown',down);view.addEventListener('pointermove',move,{capture:true,passive:true});view.addEventListener('pointerup',end);view.addEventListener('pointercancel',end,{capture:true});input.addEventListener('click',activated);
  const binding={sync:()=>{input.disabled=!this.active;input.style.pointerEvents=this.active?'auto':'none';if(!this.active&&this.dragInput===input){drag=null;this.drag=null;this.dragInput=null;input.style.transform='';}},dispose:()=>{
   input.removeEventListener('pointerdown',down);view.removeEventListener('pointermove',move,{capture:true});view.removeEventListener('pointerup',end);view.removeEventListener('pointercancel',end,{capture:true});input.removeEventListener('click',activated);if(this.dragInput===input){this.drag=null;this.dragInput=null;}input.remove();node.style.position=position;this.bindings.delete(binding);
  }};
  this.bindings.add(binding);binding.sync();return binding.dispose;
 }
 get status(){return {mode:this.mode,enabled:this.active,requests:this.requests,acceptedRequests:this.accepted,nativeTaps:this.nativeTaps,lastResult:this.lastResult,hardwareVerified:false};}
 get description():string {
  if(!this.active)return 'Haptics are off.';
  if(this.mode==='vibration-api')return 'Vibration API available. Every pop requests its own pulse, including while dragging, even when sound is muted. Hardware, browser and phone settings can suppress feedback.';
  if(this.mode==='native-switch-tap')return 'iPhone plays the system tick for a tap and for each bubble crossed while dragging. System haptics must be enabled. Keyboard pops cannot vibrate in this browser.';
  return 'This browser exposes no supported haptic path. Sound and visual feedback remain available.';
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;this.pattern=[];this.drag=null;this.dragInput=null;for(const b of [...this.bindings])b.dispose();}
}
