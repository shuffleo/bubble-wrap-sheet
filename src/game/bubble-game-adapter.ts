import type {AutomatedPopSource,BubblePopDetail,GameBubbleSnapshot,ManualPopInput} from '../components/bubble-ui/core/bubble-engine';
import type {RunCategory} from './game-types';

export interface BubbleGamePort extends EventTarget {
 getGameBubbles():GameBubbleSnapshot[];
 getGameNeighbours(index:number):number[];
 popForGame(index:number,source:AutomatedPopSource):boolean;
}

export interface GamePopDetail extends BubblePopDetail {
 category:RunCategory|null;
}

function categoryForInput(input:ManualPopInput):RunCategory {
 return input==='touch'?'touch':'keyboard-pointer';
}

/** Narrow gameplay boundary around BubbleEngine. It exposes only validated
 * bubble indices and locks category from the first successful manual pop. */
export class BubbleGameAdapter extends EventTarget {
 private lockedCategory:RunCategory|null=null;
 private disposed=false;
 private readonly onBubblePop=(event:Event)=>{
  if(this.disposed)return;
  const detail=(event as CustomEvent<BubblePopDetail>).detail;
  if(detail.source.type==='manual'&&!this.lockedCategory)this.lockedCategory=categoryForInput(detail.source.input);
  this.dispatchEvent(new CustomEvent<GamePopDetail>('gamepop',{detail:{...detail,category:this.lockedCategory}}));
 };

 constructor(private readonly engine:BubbleGamePort){
  super();
  engine.addEventListener('bubblepop',this.onBubblePop);
 }

 get category():RunCategory|null {return this.lockedCategory;}

 bubbles():readonly GameBubbleSnapshot[] {
  return this.engine.getGameBubbles().map(bubble=>({...bubble}));
 }

 neighbours(index:number):readonly number[] {
  return [...this.engine.getGameNeighbours(index)];
 }

 pop(index:number,source:AutomatedPopSource):boolean {
  if(this.disposed)return false;
  return this.engine.popForGame(index,source);
 }

 popRandom(source:AutomatedPopSource,random:()=>number=Math.random):number {
  if(this.disposed)return -1;
  const available=this.engine.getGameBubbles().filter(bubble=>bubble.eligible&&!bubble.popped);
  if(!available.length)return -1;
  const roll=Math.max(0,Math.min(0.9999999999999999,random()));
  const selected=available[Math.floor(roll*available.length)];
  return this.engine.popForGame(selected.index,source)?selected.index:-1;
 }

 dispose():void {
  if(this.disposed)return;
  this.disposed=true;
  this.engine.removeEventListener('bubblepop',this.onBubblePop);
 }
}
