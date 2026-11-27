import type {GameSessionState} from './game-types';

export const PERSISTENCE_FORMAT_VERSION=1;

export class GameSessionParseError extends Error {
 constructor(message:string){super(message);this.name='GameSessionParseError';}
}

function assertFiniteNumbers(value:unknown,path:string):void {
 if(typeof value==='number'){
  if(!Number.isFinite(value))throw new GameSessionParseError(`${path} must be finite`);
  return;
 }
 if(Array.isArray(value)){value.forEach((entry,index)=>assertFiniteNumbers(entry,`${path}/${index}`));return;}
 if(value&&typeof value==='object')for(const [key,entry] of Object.entries(value))assertFiniteNumbers(entry,`${path}/${key}`);
}

function isSession(value:unknown):value is GameSessionState {
 if(!value||typeof value!=='object')return false;
 const session=value as Partial<GameSessionState>;
 return !!session.run&&typeof session.run==='object'&&!!session.clock&&typeof session.clock==='object'&&!!session.rng&&typeof session.rng==='object';
}

export function serializeSession(session:GameSessionState):string {
 assertFiniteNumbers(session,'/session');
 return JSON.stringify({version:PERSISTENCE_FORMAT_VERSION,session});
}

export function parseSession(json:string):GameSessionState {
 let envelope:unknown;
 try{envelope=JSON.parse(json);}
 catch{throw new GameSessionParseError('Session JSON is malformed');}
 if(!envelope||typeof envelope!=='object')throw new GameSessionParseError('Session envelope must be an object');
 const candidate=envelope as {version?:unknown;session?:unknown};
 if(candidate.version!==PERSISTENCE_FORMAT_VERSION)throw new GameSessionParseError(`Unsupported session version: ${String(candidate.version)}`);
 if(!isSession(candidate.session))throw new GameSessionParseError('Session payload is invalid');
 assertFiniteNumbers(candidate.session,'/session');
 return candidate.session;
}
