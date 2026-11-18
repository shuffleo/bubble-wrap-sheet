'use client';
import * as React from 'react';
import {panelAllowed} from '../core/bubble-panel-access';
import {useBubbleEngine} from '../core/bubble-context';
import {createPanel,type OffcanvasConstructor} from '../core/bubble-panel';
// Static, project-authored markup. Never pass untrusted data to this template.
const markup="<aside id=\"settings-panel\" class=\"offcanvas offcanvas-end\" tabindex=\"-1\" aria-labelledby=\"settings-heading\">\n<div class=\"panel-head\"><h2 id=\"settings-heading\">Material controls</h2><button id=\"settings-close\" class=\"close\" aria-label=\"Close material controls\">&times;</button></div>\n<div class=\"panel-intro\"><p>Adjust the material, cut, and feel. Drag a corner to bend the sheet. Tap popped bubbles again to crinkle them.</p><div class=\"panel-presets\"><button data-preset=\"natural\">Natural</button><button data-preset=\"crisp\">Crisp</button><button data-preset=\"soft\">Soft light</button><button data-preset=\"gentle\">Bouncy</button></div><input id=\"control-search\" type=\"search\" placeholder=\"Find a control...\" aria-label=\"Search material controls\"><button id=\"inspect-crops\">Inspect source crops &amp; atlases</button></div>\n<div id=\"settings-body\"></div><div class=\"panel-footer\"><button id=\"preset-import\">Import</button><button id=\"preset-export\">Export</button><button id=\"settings-defaults\">Defaults</button><input id=\"preset-file\" type=\"file\" accept=\"application/json,.json\" hidden><p id=\"preset-status\" role=\"status\">Changes save on this device. Seeds refresh automatically.</p><div class=\"sound-credit\" id=\"sound-credit\"><span>Sound effects by <a href=\"https://freesound.org/people/Anthousai/\" target=\"_blank\" rel=\"noopener noreferrer\">Anthousai</a> on <a href=\"https://freesound.org/\" target=\"_blank\" rel=\"noopener noreferrer\">Freesound</a> under <a href=\"https://creativecommons.org/publicdomain/zero/1.0/\" target=\"_blank\" rel=\"noopener noreferrer\">CC0</a>.</span><small id=\"sound-credit-status\">Three pop recordings and the refresh sound are bundled.</small></div></div></aside>\n<dialog id=\"crop-dialog\" aria-labelledby=\"crop-title\"><div class=\"audit-head\"><h2 id=\"crop-title\">Source crop inspection</h2><button id=\"crop-close\">Close</button></div><p class=\"audit-note\">64 individually reviewed source ellipses. Sampling stays inside each footprint, including deformed variants. The 320 popped textures are derived crushed-film variants, not 320 separately photographed popped bubbles. The blue edge reference is not used as a texture.</p><div class=\"audit-tabs\"><button data-audit=\"source\" aria-pressed=\"true\">Source footprints</button><button data-audit=\"crops\" aria-pressed=\"false\">64 isolated crops</button><button data-audit=\"inflated\" aria-pressed=\"false\">320 inflated variants</button><button data-audit=\"popped\" aria-pressed=\"false\">320 popped variants</button></div><img id=\"crop-image\" alt=\"Inspectable source footprint map or selected texture atlas\"></dialog>";
/** Mount once. Include bubble-demo.css or equivalent scoped styles. */
export function BubbleControls(){
 const engine=useBubbleEngine();const [allowed,setAllowed]=React.useState(false);
 React.useEffect(()=>setAllowed(panelAllowed()),[]);
 React.useEffect(()=>{if(!engine||!allowed)return;let cancelled=false,dispose:(()=>void)|undefined;
  // Lazy browser-only import avoids evaluating Bootstrap during SSR.
  void import('bootstrap/js/dist/offcanvas').then(({default:Offcanvas})=>{
   if(cancelled)return;dispose=createPanel(engine,Offcanvas as OffcanvasConstructor).dispose;
  }).catch(error=>{if(!cancelled){const node=document.getElementById('preset-status');if(node)node.textContent='Sidebar failed to load: '+String(error);}});
  return()=>{cancelled=true;dispose?.();};
 },[engine,allowed]);
 if(!allowed)return null;
 return <div style={{display:'contents'}} dangerouslySetInnerHTML={{__html:markup}} />;
}
export function BubbleControlsTrigger(){return null;}
export function BubbleCornerGrips(){
 const engine=useBubbleEngine(),nodes=React.useRef<(HTMLButtonElement|null)[]>([]);
 React.useEffect(()=>{if(!engine)return;const clean=nodes.current.flatMap((node,i)=>node?[engine.bindCorner(node,i)]:[]);return()=>clean.forEach(off=>off());},[engine]);
 return <>{['top left','top right','bottom left','bottom right'].map((name,i)=><button key={i} type="button" className="corner-grip" ref={node=>{nodes.current[i]=node;}} aria-label={'Drag '+name+' sheet corner'} title="Drag to bend; arrow keys also work" />)}</>;
}
