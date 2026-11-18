import {DEFAULTS,GROUPS,type Settings,type SettingKey} from './bubble-settings';
/** Keep discovery centralized: every seed exposed by the panel joins a fresh roll. */
export const SEED_KEYS=Object.keys(DEFAULTS).filter(k=>/seed$/i.test(k)) as SettingKey[];
export function randomUnit():number {
 try {if(typeof globalThis.crypto?.getRandomValues==='function')return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}catch{}
 return Math.random();
}
/** Change every seed, not the grade or spring settings. No adjacent roll can repeat.
 * variantSeed is periodic modulo 320 in the atlas permutation, so exclude that
 * residue too: a new number must actually produce a new membrane arrangement. */
export function freshSeedSettings(settings:Settings,random:()=>number=randomUnit):Settings {
 const next={...settings},used=new Set<number>();
 const controls=GROUPS.flatMap(g=>g.controls);
 for(const key of SEED_KEYS){
  const control=controls.find(c=>c.key===key)!;const old=Number(settings[key]);
  const choices:number[]=[];
  for(let n=Math.ceil(control.min??0);n<=Math.floor(control.max??999);n++)
   if(n!==old&&!used.has(n)&&(key!=='variantSeed'||n%320!==Math.floor(old)%320))choices.push(n);
  const u=random(),rank=Math.floor(Math.max(0,Math.min(.999999999999,Number.isFinite(u)?u:0))*choices.length);
  const value=choices[rank];(next as unknown as Record<string,unknown>)[key]=value;used.add(value);
 }
 return next;
}
