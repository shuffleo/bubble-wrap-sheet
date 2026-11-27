export interface GameRngState {
 seed:number;
 cursor:number;
}

export interface RngValue<T> {
 state:GameRngState;
 value:T;
}

export function createGameRng(seed:number):GameRngState {
 if(!Number.isFinite(seed))throw new Error('RNG seed must be finite');
 return {seed:seed>>>0,cursor:0};
}

export function nextUnit(state:GameRngState):RngValue<number> {
 const cursor=state.cursor+1;
 let value=(state.seed+Math.imul(cursor,0x6d2b79f5))>>>0;
 value=Math.imul(value^(value>>>15),value|1);
 value^=value+Math.imul(value^(value>>>7),value|61);
 const unit=((value^(value>>>14))>>>0)/4294967296;
 return {state:{seed:state.seed,cursor},value:unit};
}

export function nextInt(state:GameRngState,minInclusive:number,maxInclusive:number):RngValue<number> {
 if(!Number.isInteger(minInclusive)||!Number.isInteger(maxInclusive)||maxInclusive<minInclusive)throw new Error('Invalid integer range');
 const draw=nextUnit(state);
 return {state:draw.state,value:minInclusive+Math.floor(draw.value*(maxInclusive-minInclusive+1))};
}

export function pickIndex(state:GameRngState,length:number):RngValue<number> {
 if(!Number.isInteger(length)||length<1)throw new Error('Pick length must be a positive integer');
 return nextInt(state,0,length-1);
}

export function pickWeighted<T extends string>(state:GameRngState,weights:Readonly<Record<T,number>>):RngValue<T> {
 const entries=Object.entries(weights) as [T,number][];
 if(!entries.length||entries.some(([,weight])=>!Number.isFinite(weight)||weight<=0))throw new Error('Weights must be finite and positive');
 const total=entries.reduce((sum,[,weight])=>sum+weight,0);
 const draw=nextUnit(state);
 let target=draw.value*total;
 for(const [choice,weight] of entries){
  target-=weight;
  if(target<0)return {state:draw.state,value:choice};
 }
 return {state:draw.state,value:entries[entries.length-1][0]};
}

function hashLabel(label:string):number {
 let hash=2166136261;
 for(let index=0;index<label.length;index++){hash^=label.charCodeAt(index);hash=Math.imul(hash,16777619);}
 return hash>>>0;
}

export function forkRng(state:GameRngState,label:string):GameRngState {
 return createGameRng((state.seed^hashLabel(label)^Math.imul(state.cursor,0x9e3779b1))>>>0);
}
