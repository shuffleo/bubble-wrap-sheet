'use client';
import {bindSheetFocus,focusSheetAfterPointer} from '../components/bubble-ui/core/bubble-focus';
import * as React from 'react';
import {BubbleProvider,BubbleSheet,BubbleButton,useBubbleEngine,useBubbleStats,useBubbleSettings,BubbleControls,BubbleControlsTrigger,BubbleCornerGrips,type BubbleSheetHandle} from '../components/bubble-ui';
import './bubble-demo.css';
import {bindBubbleKeyboard} from '../components/bubble-ui/core/bubble-keyboard-input';
import {readSavedSettings,bindPreferenceStorage} from '../components/bubble-ui/core/bubble-preferences';
/** React integration example. The preview bundles the same production engine. */
function Playground(){
 const sheet=React.useRef<BubbleSheetHandle>(null),engine=useBubbleEngine(),stats=useBubbleStats(),settings=useBubbleSettings();
 const [muted,setMuted]=React.useState(false);
 const freshSheet=React.useCallback(()=>{if(engine)sheet.current?.reset();},[engine]);
 const toggleSound=React.useCallback(()=>{if(!engine)return;const next=!engine.audio.muted;engine.setMuted(next);setMuted(next);},[engine]);
 React.useEffect(()=>{if(!engine)return;engine.setSettings(readSavedSettings());return bindPreferenceStorage(engine);},[engine]);
 React.useEffect(()=>engine?bindBubbleKeyboard(engine):undefined,[engine]);
 React.useEffect(()=>{const node=document.getElementById('sheet');return node?bindSheetFocus(node):undefined;},[engine]);
 return <>
  <a className="skip" href="#sheet">Skip to bubble wrap</a>
  <header>
   <div className="brand"><BubbleButton className="fidget" bubbleSize={32} /><div className="brand-name">bubble wrap</div></div>
   <div className="counter"><div className="number">{String(stats.popped).padStart(3,'0')}</div><div className="counter-meta"><strong>popped</strong><span>OUT OF {stats.total} BUBBLES</span><div className="bar" aria-hidden="true"><i style={{width:`${stats.total?stats.popped/stats.total*100:0}%`}} /></div></div></div>
   <BubbleControlsTrigger />
  </header>
  <main><BubbleSheet id="sheet" ref={sheet} bubbleSize={settings.bubbleSize} gap={settings.gap} cornerRadius={settings.cornerRadius} edgeRoughness={settings.edgeRoughness} edgeScale={settings.edgeScale} edgeSeed={settings.edgeSeed} cornerVariation={settings.cornerVariation} style={{position:'absolute',inset:0}} aria-describedby="instructions" /></main><BubbleCornerGrips /><BubbleControls />
  <footer className="toolbar">
   <div className="center-actions"><button type="button" className="action icon-action" aria-label="Fresh sheet" title="Fresh sheet" disabled={engine?.refreshing??false} data-empty={String(stats.popped===0)} onClick={event=>{freshSheet();if(event.detail>0)focusSheetAfterPointer(document.getElementById("sheet")!);}}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></svg></button>
    <button id="sound" type="button" className="action icon-action" aria-label="Sound" title={muted?'Unmute sound':'Mute sound'} aria-pressed={!muted} data-muted={String(muted)} onClick={event=>{toggleSound();if(event.detail>0)focusSheetAfterPointer(document.getElementById("sheet")!);}}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m11 5-6 4H2v6h3l6 4Z" />{muted?<path d="m16 9 5 6m0-6-5 6" />:<path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />}</svg></button>
   </div>
  </footer>
  <p id="instructions" className="sr-only">Click, tap or drag to pop. Re-tap popped bubbles to crinkle them. Drag the sheet corners to bend. The four QWERTY rows pop one random bubble per press. Space refreshes; Enter on the focused sheet pops the next bubble. Held keys do not repeat. Open the URL with ?panel=show for controls and the key map. Choose XS through XL in material controls to start a new sheet at that size. Cut-edge bubbles stay flat and are excluded from the counter.</p>
  <p className="sr-only" role="status" aria-live="polite">{stats.popped} of {stats.total} bubbles popped.</p>
 </>;
}
export default function Page(){return <BubbleProvider><Playground /></BubbleProvider>;}
