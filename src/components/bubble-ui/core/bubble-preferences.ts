import {DEFAULTS,MOTION_PROFILES,sanitizeSettings,type Settings} from './bubble-settings';
import {freshSeedSettings} from './bubble-random';
import type {BubbleEngine} from './bubble-engine';
export const STORE='bubble-ui-studio-v8-slide';
/** Explicit user choices persist; seeds are always rerolled after reading storage. */
export function readSavedSettings():Settings {
 let settings:Settings={...DEFAULTS,motion:DEFAULTS.motion&&!(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)};
 try {
  for(const key of [STORE,'bubble-ui-studio-v7-fresh','bubble-ui-studio-v6-motion','bubble-ui-studio-v4']){
   let raw;try{raw=JSON.parse(localStorage.getItem(key)||'null');}catch{continue;}
   if(raw?.version!==3||!raw.settings)continue;
   settings=sanitizeSettings(raw.settings,settings);
   if(key!==STORE){settings.refreshMode=1;if(key!=='bubble-ui-studio-v7-fresh')settings.bubbleSize=52;} // M -> S migration, without losing custom grade/motion.
   if(key==='bubble-ui-studio-v4')settings={...settings,...MOTION_PROFILES.original};
   break;
  }
 }catch{}
 return freshSeedSettings(settings);
}
/** Storage must work even when the settings sidebar is not mounted. */
export function bindPreferenceStorage(engine:BubbleEngine):()=>void {
 let timer=0;const save=()=>{
  clearTimeout(timer);timer=0;let ok=true;
  try{localStorage.setItem(STORE,JSON.stringify({version:3,settings:engine.settings}));}catch{ok=false;}
  engine.dispatchEvent(new CustomEvent('preferencesstatus',{detail:{ok}}));
 };
 const changed=()=>{clearTimeout(timer);timer=window.setTimeout(save,180);};
 engine.addEventListener('settingschange',changed);window.addEventListener('pagehide',save);save();
 return()=>{save();engine.removeEventListener('settingschange',changed);window.removeEventListener('pagehide',save);};
}
