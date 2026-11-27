import type {BubbleEngine} from './bubble-engine';
import {bubbleKeyCode} from './bubble-keyboard';

/** Install once per page. Returns cleanup for React effects / unmounting. */
export function bindBubbleKeyboard(engine:BubbleEngine,target:Window=window):()=>void {
 const held=new Set<string>();
 const down=(event:KeyboardEvent)=>{
  if(event.defaultPrevented||event.ctrlKey||event.altKey||event.metaKey||event.isComposing||event.keyCode===229||!engine.settings.keyboardEnabled)return;
  const node=event.target instanceof Element?event.target:null;
  if(node?.closest('input,textarea,select,aside,dialog,[role="textbox"],[role="combobox"],[role="slider"],[role="menu"],[data-bubble-keyboard="off"]')||(node instanceof HTMLElement&&node.isContentEditable)||document.querySelector('dialog[open]'))return;
  const space=event.code==='Space'||event.key===' ';
  const code=space?'Space':bubbleKeyCode(event);if(!code)return;
  // Keep native Space activation on a focused DOM control (mute, sidebar,
  // reset, etc.). Clicking the sheet or body restores global Space-to-refresh.
  if(space&&node?.closest('button,a[href],[role="button"],[role="switch"],[role="checkbox"]'))return;
  event.preventDefault();if(event.repeat||held.has(code))return;held.add(code);
  if(space){engine.reset();}
  else engine.popKey(code);
 };
 const up=(event:KeyboardEvent)=>{const code=event.code==='Space'||event.key===' '?'Space':bubbleKeyCode(event);if(code){held.delete(code);if(code!=='Space')engine.releaseKey(code);}};
 const clear=()=>{for(const code of held)if(code!=='Space')engine.releaseKey(code);held.clear();engine.releaseAllGameHolds();};
 target.addEventListener('keydown',down);target.addEventListener('keyup',up);target.addEventListener('blur',clear);
 document.addEventListener('visibilitychange',clear);
 return()=>{target.removeEventListener('keydown',down);target.removeEventListener('keyup',up);target.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',clear);clear();};
}
