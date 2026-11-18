/** Serializable, bounded controls. Imported presets are validated, never eval'd. */
// User material preset; S size and the uploaded old build's motion response.
// Motion profiles change only pressure/collapse/reveal settings. Corner hit areas stay enabled,
// but their decoration is removed in CSS (showHandles controls input, not paint).
export const DEFAULTS={
 "bubbleSize": 52,
 "gap": 4,
 "cornerRadius": 21,
 "cornerVariation": 0.75,
 "edgeRoughness": 7.7,
 "edgeScale": 43.5,
 "edgeSeed": 50,
 "seamWidth": 5,
 "filmStrength": 0.34,
 "filmTexture": 1.5,
 "textureFit": 1,
 "variantSeed": 505,
 "exposure": 0,
 "contrast": 1.04,
 "blackPoint": 0.012,
 "whitePoint": 1,
 "gamma": 1,
 "highlights": 1,
 "grain": 0.008,
 "sharpness": 0.12,
 "blendMode": 0,
 "layerOpacity": 1,
 "backingLevel": 0.24,
 "spring": 250,
 "damping": 20,
 "popThreshold": 0.75,
 "collapseSpring": 700,
 "collapseDamping": 34,
 // Tempo is a time scale, not a timeout. 1 reproduces the original solver.
 "pressSpeed": 1,
 "collapseSpeed": 1,
 "popImpulse": 10,
 "reboundLimit": 0.06,
 "revealStart": 0.48,
 "revealEnd": 0.98,
 "revealCurve": 1,
 "pressureBulge": 0.10,
 "pressureWrinkle": 0.035,
 "linearReveal": true,
 "neighborRipple": 1.9,
 "bounceStrength": 0.45,
 "bounceDamping": 6.5,
 "resetDuration": 0.85,
 "refreshMode": 1,
 "slideMinimum": 0.72,
 "slideFlex": 12,
 "motion": true,
 "cornerPull": 0.3,
 "cornerLift": 0.25,
 "cornerSpring": 90,
 "cornerDamping": 14,
 "cornerInfluence": 2.3,
 "maxPull": 75,
 "rippleStrength": 2,
 "rippleSpeed": 190,
 "rippleWidth": 61,
 "perspective": 1210,
 "volume": 0.75,
 "pitchVariation": 0.27,
 "sampleGainVariation": 0.06,
 "sampleToneVariation": 0.8,
 "adaptiveRefill": true,
 "refillMinimum": 0.18,
 "haptics": true,
 "dpr": 2,
 "showHandles": true,
 "showContours": false,
 "keyboardEnabled": true,
 "showKeyLabels": false
};
export type Settings=typeof DEFAULTS;
export type SettingKey=keyof Settings;
/** Comparable, motion-only presets. They never change the uploaded image grade. */
const original={spring:250,damping:20,popThreshold:.75,collapseSpring:700,collapseDamping:34,
 pressSpeed:1,collapseSpeed:1,popImpulse:10,reboundLimit:.06,revealStart:.48,revealEnd:.98,
 revealCurve:1,pressureBulge:.10,pressureWrinkle:.035,linearReveal:true};
export const MOTION_PROFILES={
 original,
 slower:{...original,pressSpeed:.8,collapseSpeed:.65,popImpulse:6,damping:18,collapseDamping:28,reboundLimit:.09,revealStart:.58,revealEnd:.99,revealCurve:1.15},
 fast:{...original,spring:415,damping:23,popThreshold:.59,collapseSpring:780,collapseDamping:43,revealStart:.35,pressureBulge:.055,pressureWrinkle:.018,linearReveal:false}
} satisfies Record<string,Partial<Settings>>;
export const MOTION_KEYS=Object.keys(original) as (keyof typeof original)[];
export function motionProfileName(settings:Settings):string {
 for(const [name,profile] of Object.entries(MOTION_PROFILES))if(MOTION_KEYS.every(k=>settings[k]===profile[k]))return name;
 return 'custom';
}
export interface Control {key:SettingKey;label:string;min?:number;max?:number;step?:number;options?:Record<string,number>;hint?:string;}
export const GROUPS:{title:string;open?:boolean;controls:Control[]}[]=[
 {title:'Fresh sheet transition',open:true,controls:[
  {key:'refreshMode',label:'Refresh mode',options:{'Slide in/out':1,'Refresh insitu':0},hint:'Slide: old sheet exits right, a fresh sheet enters from the left. Insitu preserves the previous wave refill.'},
  {key:'slideMinimum',label:'Minimum slide time',min:.4,max:1.1,step:.01,hint:'Minimum duration in seconds for sparse or empty sheets. The sound excerpt and slide share one clock. Full-sheet refresh plays the complete recording.'},
  {key:'slideFlex',label:'Travel flex',min:0,max:32,step:1,hint:'Subtle flexible curl during travel; 0 keeps the sheet flat.'}]},
 {title:'Bubble size',open:true,controls:[{key:'bubbleSize',label:'Size',options:{XS:40,S:52,M:64,L:82,XL:100},hint:'Changing size starts a fresh sheet. Default S is 52 pixels.'}]},
 {title:'Press & pop feel',open:true,controls:[
  {key:'pressSpeed',label:'Press tempo',min:.25,max:2,step:.05,hint:'1 = old build. Lower = slower pressure buildup while holding; quick taps use Collapse tempo.'},
  {key:'collapseSpeed',label:'Collapse tempo',min:.2,max:2,step:.05,hint:'1 = old build. Try 0.65 for a slower, elastic collapse on clicks, taps and keys. No input delay is added.'},
  {key:'popImpulse',label:'Snap kick',min:0,max:20,step:.5,hint:'Initial collapse momentum. Lower gives a softer, more gradual start.'},
  {key:'spring',label:'Press stiffness',min:80,max:700,step:5},
  {key:'damping',label:'Press damping',min:5,max:40,step:.5,hint:'Lower = more elastic pressure/release response.'},
  {key:'popThreshold',label:'Pressure threshold',min:.3,max:.9,step:.01,hint:'Compression needed to pop a held press. A quick click or key commits a pop immediately, as in the old build.'},
  {key:'collapseSpring',label:'Collapse stiffness',min:200,max:1200,step:10},
  {key:'collapseDamping',label:'Collapse damping',min:12,max:65,step:.5,hint:'Lower = more spring rebound. Original: 34; the previous fast build used 43.'},
  {key:'reboundLimit',label:'Rebound allowance',min:0,max:.14,step:.005,hint:'Allowed spring overshoot beyond the flat position. 0.06 restores the original limit.'}]},
 {title:'Popped texture transition',controls:[
  {key:'revealStart',label:'Reveal starts at',min:0,max:.9,step:.01,hint:'Compression before the crushed image begins appearing. Original: 0.48; previous fast build: 0.35. Higher holds the inflated look longer.'},
  {key:'revealEnd',label:'Reveal completes at',min:.1,max:1,step:.01,hint:'Compression at full crushed appearance. The start and end always stay at least 0.05 apart.'},
  {key:'revealCurve',label:'Reveal easing',min:.4,max:3,step:.05,hint:'1 = original smoothstep. Higher keeps the inflated texture longer, then reveals the folds later.'},
  {key:'pressureBulge',label:'Compression bulge',min:0,max:.18,step:.005,hint:'Transient UV compression of the inflated membrane. Resting textures and crop boundaries stay unchanged.'},
  {key:'pressureWrinkle',label:'Wrinkle flex',min:0,max:.07,step:.001},
  {key:'linearReveal',label:'Linear-light fade',hint:'Restores the old build\'s linear-light texture transition. Only the blend changes, not either resting image.'}]},
 {title:'Keyboard',open:true,controls:[{key:'keyboardEnabled',label:'Keyboard popping',hint:'One physical press pops one random bubble in its group. Held keys do not auto-repeat. Space refreshes the sheet.'},{key:'showKeyLabels',label:'Show key labels',hint:"Reveal each bubble's key on the sheet. Labels are off by default."}]},
 {title:'Image & tonal range',open:true,controls:[
  {key:'exposure',label:'Exposure',min:-2,max:2,step:.01},{key:'contrast',label:'Contrast',min:.3,max:2.5,step:.01},
  {key:'blackPoint',label:'Black point',min:0,max:.45,step:.005},{key:'whitePoint',label:'White point',min:.55,max:1,step:.005},
  {key:'gamma',label:'Gamma',min:.4,max:2.4,step:.01},{key:'highlights',label:'Highlights',min:.2,max:1.6,step:.01},
  {key:'sharpness',label:'Microcontrast',min:0,max:1,step:.01},{key:'grain',label:'Film grain',min:0,max:.15,step:.001}]},
 {title:'Layer blending',open:true,controls:[
  {key:'blendMode',label:'Blend mode',options:{Normal:0,'Soft light':1,Darken:2,Multiply:3,Screen:4,Overlay:5,'Hard light':6,Lighten:7,Difference:8,Exclusion:9,'Color burn':10,'Color dodge':11}},
  {key:'layerOpacity',label:'Layer opacity',min:0,max:1,step:.01},{key:'backingLevel',label:'Backing gray',min:0,max:1,step:.01,hint:'The second layer inside the sheet. Page background stays black. Darken/multiply over pure black produce black.'}]},
 {title:'Membranes & connecting film',controls:[
  {key:'gap',label:'Bubble gap',min:0,max:18,step:.5},{key:'textureFit',label:'Texture fit',min:.88,max:1.08,step:.005},
  {key:'seamWidth',label:'Join softness',min:.35,max:5,step:.05},{key:'filmStrength',label:'Gray support',min:0,max:.75,step:.01},
  {key:'filmTexture',label:'Film folds',min:0,max:1.5,step:.01},{key:'variantSeed',label:'Variant seed',min:0,max:999,step:1}]},
 {title:'Cut edges',controls:[
  {key:'cornerRadius',label:'Corner radius',min:0,max:24,step:.5},{key:'cornerVariation',label:'Corner variation',min:0,max:.8,step:.01},
  {key:'edgeRoughness',label:'Cut irregularity',min:0,max:12,step:.1},{key:'edgeScale',label:'Cut wavelength',min:5,max:70,step:.5},
  {key:'edgeSeed',label:'Cut seed',min:0,max:100,step:1}]},
 {title:'Ripples & repeated taps',controls:[
  {key:'neighborRipple',label:'Neighbor response',min:0,max:5,step:.1},
  {key:'bounceStrength',label:'Re-tap bounce',min:0,max:2.5,step:.05},{key:'bounceDamping',label:'Re-tap damping',min:3,max:24,step:.5},
  {key:'resetDuration',label:'Synth refill length',min:0,max:2,step:.05,hint:'Controls the synthesized fallback. An imported refill uses its actual trimmed duration instead.'}]},
 {title:'Sheet flex & corner dragging',controls:[
  {key:'motion',label:'Sheet motion'},{key:'showHandles',label:'Corner dragging',hint:'Invisible grab areas at the four corners. Keyboard focus remains visible.'},
  {key:'cornerPull',label:'Drag response',min:.2,max:1.5,step:.05},{key:'cornerLift',label:'Corner lift',min:0,max:1.5,step:.05},
  {key:'maxPull',label:'Pull limit',min:20,max:170,step:5},{key:'cornerSpring',label:'Sheet stiffness',min:25,max:220,step:5},
  {key:'cornerDamping',label:'Sheet damping',min:4,max:32,step:.5},{key:'cornerInfluence',label:'Bend locality',min:1,max:5,step:.1},
  {key:'rippleStrength',label:'Tap ripples',min:0,max:25,step:.5},{key:'rippleSpeed',label:'Ripple speed',min:80,max:500,step:5},
  {key:'rippleWidth',label:'Ripple width',min:15,max:100,step:1},{key:'perspective',label:'Perspective depth',min:650,max:2400,step:10}]},
 {title:'Audio & performance',controls:[
  {key:'volume',label:'Volume',min:0,max:1,step:.01},{key:'pitchVariation',label:'Pitch variation',min:0,max:.35,step:.01},
  {key:'sampleGainVariation',label:'Sample level variation',min:0,max:.2,step:.01,hint:'Small per-pop gain differences; imported samples only.'},
  {key:'sampleToneVariation',label:'Sample tone variation',min:0,max:3,step:.1,hint:'Random high-shelf variation in dB. 0 preserves the recorded tone.'},
  {key:'adaptiveRefill',label:'Adaptive refill duration',hint:'A full sheet uses the complete trimmed sound; partial sheets use a shorter, faded ending. Animation follows the same duration.'},
  {key:'refillMinimum',label:'Single-bubble refill',min:.08,max:.6,step:.01,hint:'Seconds for one bubble, bounded by the trimmed clip length.'},
  {key:'haptics',label:'Haptics',hint:'Android requests vibration pulses. iPhone uses direct native tap feedback where supported; drag/key vibration is not available in Safari.'},{key:'dpr',label:'Pixel ratio cap',min:1,max:2,step:.25},
  {key:'showContours',label:'Crop / cell guides'}]}
];
const ranges=new Map(GROUPS.flatMap(g=>g.controls.map(c=>[c.key,c] as const)));
export function sanitizeSettings(input:unknown,base:Settings=DEFAULTS):Settings {
 const out={...base};if(!input||typeof input!=='object'||Array.isArray(input))return out;
 for(const [key,value] of Object.entries(input)){
  if(!Object.prototype.hasOwnProperty.call(DEFAULTS,key))continue;
  const k=key as SettingKey;if(typeof DEFAULTS[k]==='boolean'){if(typeof value==='boolean')(out as unknown as Record<string,unknown>)[k]=value;continue;}
  if(typeof value!=='number'||!Number.isFinite(value))continue;
  if(k==='bubbleSize'){if([40,52,64,82,100].includes(value))out.bubbleSize=value;continue;}
  const c=ranges.get(k);if(!c)continue;
  const next=c.options?(Object.values(c.options).includes(value)?value:DEFAULTS[k]):Math.max(c.min??-Infinity,Math.min(c.max??Infinity,value));
  (out as unknown as Record<string,unknown>)[k]=next;
 }
 if(out.revealEnd-out.revealStart<.05){
  const onlyEnd=Object.prototype.hasOwnProperty.call(input,'revealEnd')&&!Object.prototype.hasOwnProperty.call(input,'revealStart');
  if(onlyEnd)out.revealStart=Math.max(0,out.revealEnd-.05);
  else out.revealEnd=Math.min(1,out.revealStart+.05);
 }
 return out;
}
