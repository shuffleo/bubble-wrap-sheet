import {bindSheetFocus,focusSheetAfterPointer} from './components/bubble-ui/core/bubble-focus';
import {bindPreferenceStorage} from './components/bubble-ui/core/bubble-preferences';
import {bindBubbleKeyboard} from './components/bubble-ui/core/bubble-keyboard-input';
import {BubbleEngine} from './components/bubble-ui/core/bubble-engine';
import {createPanel,readSavedSettings} from './components/bubble-ui/core/bubble-panel';
import {readGameRoute} from './game/game-route';
import {createGameUi,type GameUiHandle} from './game/game-ui';
import {createTuningDrawer,type TuningDrawerHandle} from './game/tuning/tuning-drawer';
function start(){
 const canvas=document.querySelector<HTMLCanvasElement>('#material')!,sheet=document.getElementById('sheet')!;
 const reset=document.getElementById('reset') as HTMLButtonElement;
 const count=document.getElementById('count')!,total=document.getElementById('total')!,sound=document.getElementById('sound')!,status=document.getElementById('live')!;
 let engine:BubbleEngine;
 try{engine=new BubbleEngine(canvas);}catch(e){document.getElementById('error')!.hidden=false;document.getElementById('error-detail')!.textContent=String(e);return;}
 bindSheetFocus(sheet);
 const saved=readSavedSettings();engine.setSettings(saved);
 engine.register(document.getElementById('fidget')!,{layout:'single',bubbleSize:32,gap:6,cornerRadius:30,mode:'spring-return'});
 const handle=engine.register(sheet,{...saved,mode:'poppable'});
 for(const node of Array.from(document.querySelectorAll<HTMLElement>('[data-corner]')))engine.bindCorner(node,Number(node.dataset.corner));
 bindPreferenceStorage(engine);
 createPanel(engine);
 bindBubbleKeyboard(engine);
 const update=()=>{const s=engine.getStats();reset.disabled=engine.refreshing;reset.dataset.empty=String(s.popped===0);sheet.setAttribute('aria-busy',String(engine.refreshing));sound.setAttribute('aria-pressed',String(!engine.audio.muted));sound.dataset.muted=String(engine.audio.muted);sound.title=engine.audio.muted?'Unmute sound':'Mute sound';count.textContent=String(s.popped).padStart(3,'0');total.textContent=String(s.total);document.getElementById('progress')!.style.width=`${s.total?s.popped/s.total*100:0}%`;status.textContent=`${s.popped} of ${s.total} bubbles popped. Cut-edge bubbles are excluded.`;};engine.addEventListener('change',update);update();
 const freshSheet=()=>{handle.reset();};reset.addEventListener('click',event=>{freshSheet();if(event.detail>0)focusSheetAfterPointer(sheet);});
 sound.addEventListener('click',event=>{const muted=!engine.audio.muted;engine.setMuted(muted);sound.setAttribute('aria-pressed',String(!muted));sound.dataset.muted=String(muted);sound.title=muted?'Unmute sound':'Mute sound';if(event.detail>0)focusSheetAfterPointer(sheet);});
 const gameRoute=readGameRoute(location.search);
 const gameUi=createGameUi(gameRoute,()=>sheet.focus());
 const tuningDrawer=gameRoute.tuning?createTuningDrawer():null;
 document.getElementById('game-open')!.addEventListener('click',()=>gameUi.openModeSelect());
 engine.addEventListener('contextlost',()=>{status.textContent='Graphics paused. Waiting for context restoration.';});engine.addEventListener('contextrestored',update);
 (window as unknown as {bubbleUI:BubbleEngine}).bubbleUI=engine;
 (window as unknown as {bubbleGameUI:GameUiHandle}).bubbleGameUI=gameUi;
 if(tuningDrawer)(window as unknown as {bubbleTuning:TuningDrawerHandle}).bubbleTuning=tuningDrawer;
}
start();
