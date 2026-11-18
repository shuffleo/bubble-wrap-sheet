import type {BubblePoint} from './bubble-physics';

export interface BubbleKey {readonly code:string;readonly label:string;readonly row:number;readonly column:number;}
const labels=['`1234567890-=','qwertyuiop[]\\',"asdfghjkl;'",'zxcvbnm,./'];
const punctuation:Record<string,string>={'`':'Backquote','-':'Minus','=':'Equal','[':'BracketLeft',']':'BracketRight','\\':'Backslash',';':'Semicolon',"'":'Quote',',':'Comma','.':'Period','/':'Slash'};
/** Physical US-QWERTY positions. Shift/Caps Lock never change a binding. */
export const KEY_ROWS:readonly (readonly BubbleKey[])[]=labels.map((row,r)=>Array.from(row,(label,column)=>({label,row:r,column,code:punctuation[label]??(/^\d$/.test(label)?'Digit'+label:'Key'+label.toUpperCase())})));
export const BUBBLE_KEYS:readonly BubbleKey[]=KEY_ROWS.flat();
const knownCodes=new Set(BUBBLE_KEYS.map(key=>key.code));
export interface KeyGroup extends BubbleKey {indices:number[];}
export interface KeyboardMapping {groups:KeyGroup[];byCode:Map<string,KeyGroup>;byPoint:Map<number,BubbleKey>;}

/**
 * Balanced spatial partition, O(n log n). First allocate four horizontal bands
 * in keyboard-row order, then partition each band from left to right. Integer
 * quotas are evenly spaced across the 47 keys, so every group has floor(n/47)
 * or ceil(n/47) members, including sparse layouts. No bubble belongs to two keys.
 * This is rebuilt only for geometry changes, not after pops or reset.
 */
export function buildKeyboardMapping(points:readonly BubblePoint[]):KeyboardMapping {
 const eligible=points.map((point,index)=>({point,index})).filter(({point:p})=>p.mode==='poppable'&&p.eligible!==false&&!p.cut)
  .sort((a,b)=>a.point.y-b.point.y||a.point.x-b.point.x||a.point.key.localeCompare(b.point.key));
 const n=eligible.length,k=BUBBLE_KEYS.length;
 const quotas=BUBBLE_KEYS.map((_,i)=>Math.floor((i+1)*n/k+.5)-Math.floor(i*n/k+.5));
 const groups:KeyGroup[]=[],byPoint=new Map<number,BubbleKey>();let offset=0,keyOffset=0;
 for(const row of KEY_ROWS){
  const count=row.reduce((sum,_,c)=>sum+quotas[keyOffset+c],0);
  const band=eligible.slice(offset,offset+count).sort((a,b)=>a.point.x-b.point.x||a.point.y-b.point.y||a.point.key.localeCompare(b.point.key));
  let cursor=0;
  for(const key of row){const size=quotas[keyOffset++],indices=band.slice(cursor,cursor+size).map(({index})=>index);cursor+=size;
   for(const index of indices)byPoint.set(index,key);groups.push({...key,indices});}
  offset+=count;
 }
 return {groups,byCode:new Map(groups.map(group=>[group.code,group])),byPoint};
}

/** Uniform choice without replacement: already-popped members are excluded. */
export function pickUnpopped(indices:readonly number[],popped:ArrayLike<number>,random:()=>number=Math.random):number {
 let count=0;for(const i of indices)if(!popped[i])count++;
 if(!count)return -1;
 const sample=random();let choice=Math.min(count-1,Math.floor(Math.max(0,Number.isFinite(sample)?sample:0)*count));
 for(const i of indices)if(!popped[i]&&choice--===0)return i;
 return -1;
}
export function bubbleKeyCode(event:Pick<KeyboardEvent,'code'|'key'>):string|null {
 // A real physical code takes precedence over a localized character. The
 // character fallback only supports virtual keyboards that omit code entirely.
 if(event.code&&event.code!=='Unidentified')return knownCodes.has(event.code)?event.code:null;
 return BUBBLE_KEYS.find(key=>key.label===event.key.toLowerCase())?.code??null;
}
