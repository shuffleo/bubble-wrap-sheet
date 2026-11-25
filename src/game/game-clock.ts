export interface GameClockState {
 gameTimeMs:number;
 paused:boolean;
 hidden:boolean;
}

export function createGameClock():GameClockState {
 return {gameTimeMs:0,paused:false,hidden:false};
}

export function setClockPaused(clock:GameClockState,paused:boolean):GameClockState {
 return {...clock,paused};
}

export function setClockHidden(clock:GameClockState,hidden:boolean):GameClockState {
 return {...clock,hidden};
}

export function advanceGameClock(clock:GameClockState,wallDeltaMs:number):GameClockState {
 if(!Number.isFinite(wallDeltaMs)||wallDeltaMs<0)throw new Error('Clock delta must be finite and non-negative');
 if(clock.paused||clock.hidden||wallDeltaMs===0)return clock;
 return {...clock,gameTimeMs:clock.gameTimeMs+wallDeltaMs};
}

export function readGameTimeMs(clock:GameClockState):number {
 return clock.gameTimeMs;
}
