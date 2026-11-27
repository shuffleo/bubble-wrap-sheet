import type {AutomatedPopSource,BubbleHitDetail,BubblePopDetail,ConveyorMissDetail,GameBubbleSnapshot,ManualPopInput,ManualPopSource} from '../components/bubble-ui/core/bubble-engine';
import type {RunCategory} from './game-types';

export interface BubbleGamePort extends EventTarget {
 getGameBubbles():GameBubbleSnapshot[];
 getGameNeighbours(index:number):number[];
 popForGame(index:number,source:AutomatedPopSource):boolean;
 setGameBubbleLayers(indices:readonly number[],layers:number):number;
 setGameBubbleHolds(indices:readonly number[],holdMs:number,decayMs:number):number;
 setGameManualTargetResolver(resolver:((sourceIndex:number,source:ManualPopSource,bubbles:readonly GameBubbleSnapshot[])=>number)|null):void;
 inspectGameHold():{active:boolean;indices:number[];progress:number[];requiredMs:number;decayMs:number};
 startGameConveyor(baseTravelMs:number):void;
 spawnGameConveyor(lane:number):number;
 setGameConveyorSpeed(multiplier:number):void;
 setGameConveyorFeeding(feeding:boolean):void;
 getGameConveyorIntroduced():number;
 endGameConveyor(countRemaining:boolean):number;
 reinflateForGame(index:number):boolean;
 setHazardWarning(index:number|null):boolean;
}

export interface GamePopDetail extends BubblePopDetail {
 category:RunCategory|null;
}
export interface GameHitDetail extends BubbleHitDetail {
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
 private readonly onBubbleHit=(event:Event)=>{
  if(this.disposed)return;
  const detail=(event as CustomEvent<BubbleHitDetail>).detail;
  if(detail.source.type==='manual'&&!this.lockedCategory)this.lockedCategory=categoryForInput(detail.source.input);
  this.dispatchEvent(new CustomEvent<GameHitDetail>('gamehit',{detail:{...detail,category:this.lockedCategory}}));
 };
 private readonly onConveyorMiss=(event:Event)=>{
  if(this.disposed)return;
  this.dispatchEvent(new CustomEvent<ConveyorMissDetail>('conveyormiss',{detail:(event as CustomEvent<ConveyorMissDetail>).detail}));
 };

 constructor(private readonly engine:BubbleGamePort){
  super();
  engine.addEventListener('bubblepop',this.onBubblePop);
  engine.addEventListener('bubblehit',this.onBubbleHit);
  engine.addEventListener('conveyormiss',this.onConveyorMiss);
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

 setLayers(indices:readonly number[],layers:number):number {
  if(this.disposed)return 0;
  return this.engine.setGameBubbleLayers(indices,layers);
 }

 setHolds(indices:readonly number[],holdMs:number,decayMs:number):number {
  if(this.disposed)return 0;
  return this.engine.setGameBubbleHolds(indices,holdMs,decayMs);
 }

 setTargetResolver(resolver:((sourceIndex:number,source:ManualPopSource,bubbles:readonly GameBubbleSnapshot[])=>number)|null):void {
  if(this.disposed)return;
  this.engine.setGameManualTargetResolver(resolver);
 }

 holdState() {
  return this.engine.inspectGameHold();
 }

 startConveyor(baseTravelMs:number):void {
  if(!this.disposed)this.engine.startGameConveyor(baseTravelMs);
 }

 spawnConveyor(lane:number):number {
  return this.disposed?-1:this.engine.spawnGameConveyor(lane);
 }

 setConveyorSpeed(multiplier:number):void {
  if(!this.disposed)this.engine.setGameConveyorSpeed(multiplier);
 }

 setConveyorFeeding(feeding:boolean):void {
  if(!this.disposed)this.engine.setGameConveyorFeeding(feeding);
 }

 conveyorIntroduced():number {
  return this.disposed?0:this.engine.getGameConveyorIntroduced();
 }

 endConveyor(countRemaining:boolean):number {
  return this.disposed?0:this.engine.endGameConveyor(countRemaining);
 }

 reinflate(index:number):boolean {
  if(this.disposed)return false;
  return this.engine.reinflateForGame(index);
 }

 warn(index:number|null):boolean {
  if(this.disposed)return false;
  return this.engine.setHazardWarning(index);
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
  this.engine.setGameManualTargetResolver(null);
  this.engine.removeEventListener('bubblepop',this.onBubblePop);
  this.engine.removeEventListener('bubblehit',this.onBubbleHit);
  this.engine.removeEventListener('conveyormiss',this.onConveyorMiss);
 }
}
