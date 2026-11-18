/** Game keys are not focus-navigation keys. Keep focus semantics and Tab access;
 * only suppress the sheet's ring following a pointer interaction, not controls. */
export function bindSheetFocus(sheet:HTMLElement,doc:Document=document):()=>void {
 let pointerOwned=false;
 const down=(event:PointerEvent)=>{if(event.target instanceof Node&&sheet.contains(event.target)){pointerOwned=true;sheet.dataset.pointerFocus='true';}else pointerOwned=false;};
 const key=(event:KeyboardEvent)=>{if(event.key==='Tab'){pointerOwned=false;delete sheet.dataset.pointerFocus;}};
 const focus=()=>{if(!pointerOwned)delete sheet.dataset.pointerFocus;};
 const blur=()=>{pointerOwned=false;delete sheet.dataset.pointerFocus;};
 const explicitPointer=()=>{pointerOwned=true;sheet.dataset.pointerFocus='true';};
 doc.addEventListener('pointerdown',down,true);doc.addEventListener('keydown',key,true);sheet.addEventListener('focus',focus);sheet.addEventListener('blur',blur);sheet.addEventListener('pointerfocus',explicitPointer);
 return()=>{doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('keydown',key,true);sheet.removeEventListener('focus',focus);sheet.removeEventListener('blur',blur);sheet.removeEventListener('pointerfocus',explicitPointer);delete sheet.dataset.pointerFocus;};
}
export function focusSheetAfterPointer(sheet:HTMLElement){sheet.dispatchEvent(new Event('pointerfocus'));sheet.focus({preventScroll:true});}
