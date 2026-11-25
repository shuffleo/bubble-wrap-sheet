export type GameScreen='mode-select'|'level-intro'|'hud'|'shop'|'run-won'|'run-lost';
export interface GameRoute {
 enabled:boolean;
 screen:GameScreen;
 hudState:'normal'|'danger'|'paused'|'hidden';
 category:'touch'|'keyboard-pointer';
 tuning:boolean;
}

function single(params:URLSearchParams,key:string):string|null {
 const values=params.getAll(key);
 return values.length===1?values[0]:null;
}

export function readGameRoute(search:string):GameRoute {
 const params=new URLSearchParams(search);
 const enabled=single(params,'game')==='1';
 const requested=single(params,'screen');
 const screens:GameScreen[]=['mode-select','level-intro','hud','shop','run-won','run-lost'];
 const screen=enabled&&requested&&screens.includes(requested as GameScreen)?requested as GameScreen:'mode-select';
 const requestedHud=single(params,'hud');
 const hudStates:GameRoute['hudState'][]=['normal','danger','paused','hidden'];
 const hudState=enabled&&requestedHud&&hudStates.includes(requestedHud as GameRoute['hudState'])?requestedHud as GameRoute['hudState']:'normal';
 const category=enabled&&single(params,'category')==='keyboard-pointer'?'keyboard-pointer':'touch';
 const tuning=enabled&&single(params,'tuning')==='show';
 return {enabled,screen,hudState,category,tuning};
}
