import {KEY_ROWS} from './bubble-keyboard';
import {DEFAULTS,GROUPS,MOTION_PROFILES,motionProfileName,sanitizeSettings,type Settings,type SettingKey} from './bubble-settings';
import type {BubbleEngine} from './bubble-engine';
import {atlasURL,collapsedAtlasURL} from './bubble-atlas';
import {cropMapURL,cropReviewURL} from './bubble-audit';
export type Offcanvas={toggle:()=>void;hide:()=>void;show:()=>void;dispose:()=>void};
declare global {interface Window {bootstrap:{Offcanvas:new(node:HTMLElement,options:{backdrop:boolean;scroll:boolean;keyboard:boolean})=>Offcanvas};}}
export {readSavedSettings} from './bubble-preferences';
import {panelAllowed} from './bubble-panel-access';
import {freshSeedSettings,SEED_KEYS} from './bubble-random';
export type OffcanvasConstructor=new(node:HTMLElement,options:{backdrop:boolean;scroll:boolean;keyboard:boolean})=>Offcanvas;
export function createPanel(engine:BubbleEngine,OffcanvasClass?:OffcanvasConstructor){
 if(!panelAllowed()){for(const id of ['settings-toggle','settings-panel','crop-dialog'])document.getElementById(id)?.remove();return {toggle:()=>{},dispose:()=>{}};}
 document.getElementById('settings-toggle')?.remove();
 document.querySelector('meta[name=robots]')?.setAttribute('content','noindex,follow');
 const panel=document.getElementById('settings-panel')!,body=document.getElementById('settings-body')!,message=document.getElementById('preset-status')!;
 body.replaceChildren();const cleanup:(()=>void)[]=[];const on=(node:HTMLElement,event:string,fn:EventListener)=>{node.addEventListener(event,fn);cleanup.push(()=>node.removeEventListener(event,fn));};
 const sidebar=new (OffcanvasClass??window.bootstrap.Offcanvas)(panel,{backdrop:false,scroll:true,keyboard:true});
 on(document.getElementById('settings-close')!,'click',()=>sidebar.hide());

 on(panel,'shown.bs.offcanvas',()=>{panel.removeAttribute('aria-modal');panel.setAttribute('role','complementary');});
 on(panel,'hidden.bs.offcanvas',()=>{document.getElementById('sheet')?.focus({preventScroll:true});});
 const inputs=new Map<SettingKey,HTMLInputElement[]>();const selects=new Map<SettingKey,HTMLSelectElement>();
 const announce=(s:string)=>{message.textContent=s;};
 const saved=(event:Event)=>{const ok=(event as CustomEvent<{ok:boolean}>).detail.ok;announce(ok?'Saved on this device. Seeds refresh on every load and fresh sheet.':'Storage unavailable here. Export a preset to keep changes.');};
 engine.addEventListener('preferencesstatus',saved);cleanup.push(()=>engine.removeEventListener('preferencesstatus',saved));
 for(const group of GROUPS){
  const section=document.createElement('details');section.className='control-section';section.open=!!group.open;
  const summary=document.createElement('summary');summary.textContent=group.title;section.append(summary);
  if(group.title==='Press & pop feel'){
   const choices=document.createElement('div');choices.className='motion-presets';choices.setAttribute('role','group');choices.setAttribute('aria-label','Motion-only presets');
   const labels={original:'Original',slower:'Slower',fast:'Previous fast'};
   for(const key of Object.keys(MOTION_PROFILES) as (keyof typeof MOTION_PROFILES)[]){const b=document.createElement('button');b.type='button';b.dataset.motionPreset=key;b.textContent=labels[key];b.setAttribute('aria-pressed','false');on(b,'click',()=>{engine.setSettings(MOTION_PROFILES[key]);announce(labels[key]+' motion applied. Material and other settings unchanged.');});choices.append(b);}
   const note=document.createElement('p');note.className='control-hint';note.id='motion-profile-status';section.append(choices,note);
  }
  for(const control of group.controls){
   const row=document.createElement('div');row.className='control-row';row.dataset.control=control.key;
   const label=document.createElement('label');label.textContent=control.label;label.htmlFor='setting-'+control.key;row.append(label);
   const apply=(value:unknown)=>engine.setSettings({[control.key]:value} as Partial<Settings>);
   if(control.key==='bubbleSize'){
    row.classList.add('size-row');label.removeAttribute('for');label.id='size-label';
    const sizes=document.createElement('div');sizes.className='sizes';sizes.id='setting-bubbleSize';sizes.setAttribute('role','group');sizes.setAttribute('aria-labelledby',label.id);
    for(const [name,px] of Object.entries(control.options!)){const button=document.createElement('button');button.type='button';button.dataset.size=String(px);button.textContent=name;button.title=`${px} px`;button.setAttribute('aria-label',`${name} bubbles, ${px} pixels`);button.setAttribute('aria-pressed',String(engine.settings.bubbleSize===px));button.onclick=()=>{if(engine.settings.bubbleSize!==px)apply(px);};sizes.append(button);}row.append(sizes);
   }
   else if(control.options){const select=document.createElement('select');select.id=label.htmlFor;for(const [name,value]of Object.entries(control.options)){const option=document.createElement('option');option.textContent=name;option.value=String(value);select.append(option);}select.value=String(engine.settings[control.key]);select.addEventListener('change',()=>apply(Number(select.value)));row.append(select);selects.set(control.key,select);}
   else if(typeof DEFAULTS[control.key]==='boolean'){const input=document.createElement('input');input.type='checkbox';input.id=label.htmlFor;input.checked=!!engine.settings[control.key];input.addEventListener('change',()=>apply(input.checked));row.append(input);inputs.set(control.key,[input]);}
   else{const wrap=document.createElement('div');wrap.className='range-pair';const range=document.createElement('input'),number=document.createElement('input');range.type='range';number.type='number';range.id=label.htmlFor;number.setAttribute('aria-label',control.label+' numeric value');for(const input of [range,number]){input.min=String(control.min);input.max=String(control.max);input.step=String(control.step);input.value=String(engine.settings[control.key]);}
    range.addEventListener('input',()=>apply(Number(range.value)));number.addEventListener('change',()=>{if(number.value!==''&&Number.isFinite(number.valueAsNumber))apply(number.valueAsNumber);else number.value=String(engine.settings[control.key]);});wrap.append(range,number);row.append(wrap);inputs.set(control.key,[range,number]);}
   if(SEED_KEYS.includes(control.key)){const reroll=document.createElement('button');reroll.type='button';reroll.className='seed-reroll';reroll.dataset.rerollSeed=control.key;reroll.textContent='New seeds';reroll.setAttribute('aria-label','Regenerate all random seeds from '+control.label);reroll.title='Regenerate both seeds and start a fresh sheet';on(reroll,'click',()=>{engine.refreshSeeds();announce('New membrane and cut-edge seeds. Other settings unchanged.');});row.append(reroll);}
   if(control.hint){const hint=document.createElement('p');hint.className='control-hint';hint.textContent=control.hint;hint.id='hint-'+control.key;row.append(hint);row.querySelector('input,select')?.setAttribute('aria-describedby',hint.id);}
   section.append(row);
  }
  if(group.title==='Keyboard'){
   const map=document.createElement('div');map.className='keyboard-map';map.id='keyboard-map';map.setAttribute('aria-label','Keyboard mapping: remaining bubbles per key');
   const keys=new Map<string,HTMLElement>();
   for(const row of KEY_ROWS){const line=document.createElement('div');line.className='keyboard-map-row';for(const key of row){const cell=document.createElement('span');cell.className='keyboard-cell';cell.dataset.code=key.code;const label=document.createElement('kbd');label.textContent=key.label;const count=document.createElement('small');cell.append(label,count);keys.set(key.code,cell);line.append(cell);}map.append(line);}
   const summary=document.createElement('p');summary.className='control-hint';summary.id='keyboard-summary';
   const note=document.createElement('p');note.className='control-hint';note.textContent='Rows follow the keyboard from top to bottom; keys run left to right. Counts below are remaining bubbles. Cut edges are excluded. An empty group does nothing. Typing in controls never pops bubbles.';
   const syncKeys=()=>{const groups=engine.getKeyboardMap();for(const group of groups){const cell=keys.get(group.code)!;cell.querySelector('small')!.textContent=String(group.remaining);cell.dataset.empty=String(group.remaining===0);cell.title=`${group.label}: ${group.remaining} of ${group.total} remaining`;}
    const counts=groups.map(g=>g.total),empty=counts.filter(n=>n===0).length;summary.textContent=`47 keys / ${Math.min(...counts)}-${Math.max(...counts)} bubbles per key`+(empty?` / ${empty} empty keys at this size`:'')+'. Space: fresh sheet.';map.dataset.enabled=String(engine.settings.keyboardEnabled);};
   const timers=new Map<string,number>();const pulse=(event:Event)=>{const code=(event as CustomEvent<{code:string}>).detail.code,cell=keys.get(code);if(!cell)return;clearTimeout(timers.get(code));cell.dataset.active='true';timers.set(code,window.setTimeout(()=>{delete cell.dataset.active;timers.delete(code);},180));};
   engine.addEventListener('change',syncKeys);engine.addEventListener('settingschange',syncKeys);engine.addEventListener('keypop',pulse);syncKeys();
   cleanup.push(()=>{engine.removeEventListener('change',syncKeys);engine.removeEventListener('settingschange',syncKeys);engine.removeEventListener('keypop',pulse);for(const timer of timers.values())clearTimeout(timer);});
   section.append(map,summary,note);
  }
  if(group.title==='Audio & performance'){
   const actions=document.createElement('div');actions.className='panel-actions';
   const load=document.createElement('button');load.type='button';load.textContent='Import pop samples';load.id='audio-import';
   const test=document.createElement('button');test.type='button';test.textContent='Test sound';test.id='audio-test';test.onclick=()=>{engine.audio.unlock();engine.audio.pop(false);};
   const clear=document.createElement('button');clear.type='button';clear.textContent='Use synth';clear.onclick=()=>{engine.audio.clearSamples();status.textContent=engine.audio.sampleLabel;syncAnalysis();};
   const file=document.createElement('input');file.type='file';file.accept='audio/*';file.multiple=true;file.hidden=true;file.id='audio-files';load.onclick=()=>file.click();
   const status=document.createElement('p');status.className='control-hint';status.id='audio-source';status.textContent=engine.audio.sampleLabel+'. Import up to 12 individual pop files. Silence is trimmed and levels balanced once, before playback.';
   file.onchange=async()=>{try{await engine.audio.importFiles(Array.from(file.files??[]));status.textContent=engine.audio.sampleLabel+' (this session only). Random shuffle-bag selection, pitch, level and tone variation.';syncAnalysis();}catch(e){status.textContent=String(e);}file.value='';};
   const refill=document.createElement('button');refill.type='button';refill.textContent='Test refill';refill.id='audio-refill-test';refill.onclick=()=>engine.audio.refill(engine.settings.resetDuration);
   const refillLoad=document.createElement('button');refillLoad.type='button';refillLoad.textContent='Import refill sound';refillLoad.id='audio-refill-import';
   const refillFile=document.createElement('input');refillFile.type='file';refillFile.accept='audio/*';refillFile.hidden=true;refillFile.id='audio-refill-file';refillLoad.onclick=()=>refillFile.click();
   const refillClear=document.createElement('button');refillClear.type='button';refillClear.textContent='Use synth refill';refillClear.id='audio-refill-clear';
   const refillStatus=document.createElement('p');refillStatus.className='control-hint';refillStatus.id='audio-refill-source';refillStatus.textContent=engine.audio.refillSampleLabel+'. Bundled audio is available offline. Full-sheet refresh plays the complete clip; partial refresh uses a synchronized excerpt.';
   refillFile.onchange=async()=>{const chosen=refillFile.files?.[0];if(!chosen)return;try{await engine.audio.importRefillFile(chosen);refillStatus.textContent='Refill: '+engine.audio.refillSampleLabel+' (this session only). Original pitch; animation and excerpt share one duration.';syncAnalysis();}catch(error){refillStatus.textContent=String(error);}refillFile.value='';};
   refillClear.onclick=()=>{engine.audio.clearRefillSample();refillStatus.textContent=engine.audio.refillSampleLabel;syncAnalysis();};
   const report=document.createElement('div');report.id='sample-analysis';report.className='sample-analysis';
   const download=(bytes:BlobPart,type:string,name:string)=>{const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);};
   const exportReport=document.createElement('button');exportReport.type='button';exportReport.id='audio-analysis-export';exportReport.textContent='Export audio analysis';exportReport.onclick=()=>download(JSON.stringify(engine.audio.sampleReport,null,2),'application/json','bubble-audio-analysis.json');
   const syncAnalysis=()=>{report.replaceChildren();const data=engine.audio.sampleReport,all=[...data.pops,...(data.refill?[data.refill]:[])];exportReport.disabled=all.length===0;
    for(const [i,a] of all.entries()){const row=document.createElement('div'),text=document.createElement('p'),button=document.createElement('button');text.textContent=`${a.name}: ${Math.round(a.originalSeconds*1000)} -> ${Math.round(a.processedSeconds*1000)} ms. Trimmed ${Math.round(a.trimmedStartMs)} ms before / ${Math.round(a.trimmedEndMs)} ms after. Peak ${a.outputPeakDbFS.toFixed(1)} dBFS.`;button.type='button';button.textContent='Save cleaned WAV';button.onclick=()=>download(engine.audio.exportProcessed(a.kind,i),'audio/wav',a.name.replace(/\.[^.]+$/,'')+'-clean.wav');row.append(text,button);for(const warning of a.warnings){const note=document.createElement('p');note.textContent=warning;note.className='sample-warning';row.append(note);}report.append(row);}
    const creditStatus=document.getElementById('sound-credit-status');if(creditStatus)creditStatus.textContent=all.length?'Recorded pops/refill active. Bundled sounds by Anthousai; original procedural crinkles/fallback are separate.':'Procedural fallback active; switch back to the bundled recordings by reloading.';
   };syncAnalysis();
   const hapticTest=document.createElement('button');hapticTest.id='haptic-test';hapticTest.type='button';hapticTest.textContent='Test haptics';hapticTest.onclick=()=>engine.audio.feedback.pulse(15);
   const feedback=document.createElement('p');feedback.id='haptic-status';feedback.className='control-hint';feedback.setAttribute('role','status');const syncHaptics=()=>{feedback.textContent=engine.audio.feedback.description;hapticTest.disabled=!engine.settings.haptics||engine.audio.feedback.mode==='unavailable';};
   actions.append(load,test,clear,refillLoad,refill,refillClear,exportReport,hapticTest,file,refillFile);section.append(actions,status,refillStatus,report,feedback);cleanup.push(engine.audio.feedback.attach(hapticTest));syncHaptics();engine.addEventListener('settingschange',syncHaptics);cleanup.push(()=>engine.removeEventListener('settingschange',syncHaptics));
  }
  body.append(section);
 }
 const sync=()=>{
  const profile=motionProfileName(engine.settings);body.querySelectorAll<HTMLButtonElement>('[data-motion-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.motionPreset===profile)));
  const profileStatus=document.getElementById('motion-profile-status');if(profileStatus)profileStatus.textContent=(profile==='original'?'Original spring response restored.':profile==='slower'?'Slower, lower-damped spring response.':profile==='fast'?'Previous fast response for comparison.':'Custom motion response.')+' These buttons change motion only; your material grade, sound and sheet settings stay untouched.';
  body.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.size)===engine.settings.bubbleSize)));for(const [k,list]of inputs)for(const input of list){if(input.type==='checkbox')input.checked=Boolean(engine.settings[k]);else input.value=String(engine.settings[k]);}for(const [k,input]of selects)input.value=String(engine.settings[k]);};
 engine.addEventListener('settingschange',sync);sync();
 document.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach(button=>button.onclick=()=>{const presets:Record<string,Partial<Settings>>={natural:{exposure:0,contrast:1.04,blackPoint:.012,whitePoint:1,gamma:1,highlights:1,grain:.008,sharpness:.12,blendMode:0,layerOpacity:1,backingLevel:.24},crisp:{contrast:1.27,blackPoint:.035,sharpness:.5,filmStrength:.06,blendMode:0,layerOpacity:1},soft:{blendMode:1,backingLevel:.48,layerOpacity:1,contrast:1.08,gamma:1.08},gentle:{spring:160,damping:16,cornerSpring:55,cornerDamping:9,bounceStrength:1.4,rippleStrength:14}};engine.setSettings(presets[button.dataset.preset!]??{});});
 document.getElementById('settings-defaults')!.onclick=()=>{engine.setSettings(freshSeedSettings({...DEFAULTS,edgeSeed:engine.settings.edgeSeed,variantSeed:engine.settings.variantSeed,motion:DEFAULTS.motion&&!matchMedia('(prefers-reduced-motion: reduce)').matches}));engine.reset(undefined,true);announce('Your defaults restored. Size S and fresh random seeds.');};
 document.getElementById('preset-export')!.onclick=()=>{const data=JSON.stringify({version:3,settings:engine.settings},null,2);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.href=url;a.download='bubble-ui-preset.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);announce('Preset exported. Audio files are not included.');};
 const importInput=document.getElementById('preset-file') as HTMLInputElement;
 document.getElementById('preset-import')!.onclick=()=>importInput.click();
 importInput.onchange=async()=>{try{const file=importInput.files?.[0];if(!file)return;if(file.size>65536)throw new Error('Preset must be under 64 KB.');const raw=JSON.parse(await file.text());if(raw?.version!==3||!raw.settings||typeof raw.settings!=='object'||Array.isArray(raw.settings))throw new Error('This is not a version 3 Bubble UI preset.');engine.setSettings(sanitizeSettings(raw.settings));announce('Preset imported.');}catch(e){announce(String(e));}importInput.value='';};
 const groupMatches=(section:HTMLDetailsElement,q:string)=>!!section.querySelector('[data-motion-preset]')&&(!q||'motion original slower previous fast pressure bounce tension pop'.includes(q));
 const search=document.getElementById('control-search') as HTMLInputElement;
 search.oninput=()=>{const q=search.value.toLowerCase().trim();for(const section of Array.from(body.querySelectorAll<HTMLDetailsElement>('details'))){let found=groupMatches(section,q);for(const row of Array.from(section.querySelectorAll<HTMLElement>('.control-row'))){row.hidden=!!q&&!row.textContent?.toLowerCase().includes(q);if(!row.hidden)found=true;}section.hidden=!found;if(q&&found)section.open=true;}};
 const dialog=document.getElementById('crop-dialog') as HTMLDialogElement,img=document.getElementById('crop-image') as HTMLImageElement;
 document.getElementById('inspect-crops')!.onclick=()=>{img.src=cropMapURL;dialog.showModal();};document.getElementById('crop-close')!.onclick=()=>dialog.close();
 document.querySelectorAll<HTMLButtonElement>('[data-audit]').forEach(button=>button.onclick=()=>{img.src=({source:cropMapURL,crops:cropReviewURL,inflated:atlasURL,popped:collapsedAtlasURL} as Record<string,string>)[button.dataset.audit!];document.querySelectorAll('[data-audit]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});
 sidebar.show();
 return {toggle:()=>{if(panelAllowed())sidebar.toggle();},dispose:()=>{for(const off of cleanup)off();engine.removeEventListener('settingschange',sync);sidebar.dispose();}};
}
