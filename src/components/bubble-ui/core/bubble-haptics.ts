/** Mobile feedback adapter. Never fakes a trusted event or calls .click().
 * Android: Vibration API. WebKit: actual label tap -> native switch activation.
 * Safari does not expose programmable per-pop vibration for drag/keyboard events.
 * Feature detection is NOT proof of a physical motor or enabled system haptics.
 */
export type HapticMode='vibration-api'|'native-switch-tap'|'unavailable';
let switchId=0;
export class BubbleHaptics {
 readonly mode:HapticMode;private active=true;private destroyed=false;
 private bindings=new Set<{sync:()=>void;dispose:()=>void}>();
 private requests=0;private accepted=0;private nativeTaps=0;private lastResult='not-tested';
 constructor(){
  const nav=typeof navigator==='undefined'?undefined:navigator;
  this.mode=typeof nav?.vibrate==='function'?'vibration-api':
   typeof document!=='undefined'&&(nav?.maxTouchPoints??0)>0&&'switch' in document.createElement('input')?'native-switch-tap':'unavailable';
 }
 get enabled(){return this.active;}
 set enabled(value:boolean){this.active=value;for(const b of this.bindings)b.sync();}
 pulse(milliseconds=13):boolean {
  if(this.destroyed||!this.active||this.mode!=='vibration-api'||(typeof document!=='undefined'&&document.hidden))return false;
  this.requests++;
  try {const ok=navigator.vibrate(Math.max(1,Math.min(30,Math.round(milliseconds))));this.lastResult=ok?'api-accepted':'api-declined';if(ok)this.accepted++;return ok;}
  catch {this.lastResult='api-blocked';return false;}
 }
 /** The label is the actual touch target. The engine must capture this label,
  * not its parent, so the browser's release click can activate the native switch.
  * One invisible label per surface, not hundreds of per-bubble DOM controls.
  */
 attach(node:HTMLElement,accepts:(x:number,y:number)=>boolean=()=>true):()=>void {
  if(this.destroyed||this.mode!=='native-switch-tap')return()=>{};
  const doc=node.ownerDocument,input=doc.createElement('input'),label=doc.createElement('label');
  input.type='checkbox';input.setAttribute('switch','');input.id='bubble-native-haptic-'+(++switchId);
  input.tabIndex=-1;input.setAttribute('aria-hidden','true');input.setAttribute('data-bubble-haptic-switch','');
  input.style.cssText='position:fixed;left:-100px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
  label.htmlFor=input.id;label.tabIndex=-1;label.setAttribute('aria-hidden','true');label.setAttribute('data-bubble-haptic-tap','');
  label.style.cssText='position:absolute;inset:0;z-index:1;background:transparent;touch-action:none;cursor:inherit;-webkit-tap-highlight-color:transparent;';
  const position=node.style.position;if(getComputedStyle(node).position==='static')node.style.position='relative';
  doc.body.append(input);node.append(label);
  const pending=new Map<number,{x:number;y:number;valid:boolean}>();let released:{x:number;y:number;valid:boolean;time:number}|null=null;
  const down=(event:PointerEvent)=>{released=null;pending.set(event.pointerId,{x:event.clientX,y:event.clientY,valid:event.isTrusted&&this.active&&event.button===0&&event.pointerType!=='pen'&&accepts(event.clientX,event.clientY)});};
  const move=(event:PointerEvent)=>{const p=pending.get(event.pointerId);if(p&&Math.hypot(event.clientX-p.x,event.clientY-p.y)>9)p.valid=false;};
  const up=(event:PointerEvent)=>{move(event);const p=pending.get(event.pointerId);released=p?{x:event.clientX,y:event.clientY,valid:p.valid,time:performance.now()}:null;pending.delete(event.pointerId);};
  const cancel=(event:PointerEvent)=>{pending.delete(event.pointerId);released=null;};
  const click=(event:MouseEvent)=>{
   const valid=event.isTrusted&&this.active&&!this.destroyed&&released?.valid&&performance.now()-released.time<800&&Math.hypot(event.clientX-released.x,event.clientY-released.y)<12;
   released=null;if(!valid)event.preventDefault();
  };
  const activated=(event:Event)=>{if(!event.isTrusted||!this.active||this.destroyed){event.preventDefault();return;}this.nativeTaps++;this.lastResult='native-switch-activated';};
  const clear=()=>{pending.clear();released=null;};
  label.addEventListener('pointerdown',down);label.addEventListener('pointermove',move);label.addEventListener('pointerup',up);label.addEventListener('pointercancel',cancel);label.addEventListener('click',click);
  input.addEventListener('click',activated);window.addEventListener('blur',clear);doc.addEventListener('visibilitychange',clear);
  const binding={sync:()=>{input.disabled=!this.active;label.style.pointerEvents=this.active?'auto':'none';if(!this.active)clear();},dispose:()=>{
   clear();label.removeEventListener('pointerdown',down);label.removeEventListener('pointermove',move);label.removeEventListener('pointerup',up);label.removeEventListener('pointercancel',cancel);label.removeEventListener('click',click);input.removeEventListener('click',activated);window.removeEventListener('blur',clear);doc.removeEventListener('visibilitychange',clear);label.remove();input.remove();node.style.position=position;this.bindings.delete(binding);
  }};
  this.bindings.add(binding);binding.sync();return binding.dispose;
 }
 get status(){return {mode:this.mode,enabled:this.active,requests:this.requests,acceptedRequests:this.accepted,nativeTaps:this.nativeTaps,lastResult:this.lastResult,hardwareVerified:false};}
 get description():string {
  if(!this.active)return 'Haptics are off.';
  if(this.mode==='vibration-api')return 'Vibration API available. Pop pulses are requested even when sound is muted. Hardware, browser and phone settings can suppress feedback.';
  if(this.mode==='native-switch-tap')return 'Native tap feedback available (best effort). iPhone feedback occurs on a direct tap/release, not each drag or keyboard pop. System haptics must be enabled.';
  return 'This browser exposes no supported haptic path. Sound and visual feedback remain available.';
 }
 destroy(){if(this.destroyed)return;this.destroyed=true;for(const b of [...this.bindings])b.dispose();}
}
