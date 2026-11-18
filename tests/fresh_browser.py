"""v7 regression on the actual self-contained renderer, using inline HTML and real about:blank query strings.
Local HTTP navigation is blocked by the browser policy; storage is a test double.
Haptic calls / trusted label routing are inspected, NOT a physical phone motor.
"""
import os,json,time,subprocess,urllib.request,math,struct,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence';E.mkdir(exist_ok=True);results=[]
HTML=(ROOT/'index.html').read_text();URL='http://127.0.0.1:5187';defaults=json.loads((ROOT/'presets/default-preset.json').read_text())['settings']
fixture=ROOT/'tests/fixtures/refill-tone.wav'
with wave.open(str(fixture),'wb') as w:
 w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b''.join(struct.pack('<h',round(math.sin(i/16000*440*2*math.pi)*500)) for i in range(3200)))
def check(name,ok):
 results.append({'test':name,'passed':bool(ok)});(E/'fresh-browser-results.json').write_text(json.dumps(results,indent=2));print(('PASS ' if ok else 'FAIL ')+name,flush=True);assert ok,name
def ready(p):p.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1');p.wait_for_timeout(120)
def load(p,query='',reload=False):
 # Explicit in-memory storage double: localStorage is blocked at opaque origins.
 data=p.evaluate('(()=>{window.dispatchEvent(new Event("pagehide"));return window.__testStorage||{}})()')
 if reload:p.reload()
 else:p.goto('about:blank'+query)
 p.evaluate("""data=>{window.__testStorage=data;Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>__testStorage[k]??null,setItem:(k,v)=>{__testStorage[k]=String(v)},removeItem:k=>{delete __testStorage[k]},clear:()=>{window.__testStorage={}}}})}""",data)
 p.set_content(HTML,wait_until='load');ready(p)
def settings(p):return p.evaluate('({...bubbleUI.settings})')
def seeds(s):return [s['edgeSeed'],s['variantSeed']]
def changed(a,b):return a['edgeSeed']!=b['edgeSeed'] and a['variantSeed']%320!=b['variantSeed']%320
POINT='bubbleUI.inspect().filter(p=>p.mode==="poppable"&&p.eligible&&p.x>100&&p.x<500&&p.y>190&&p.y<600)'
def point(p,n=0):return p.evaluate(POINT+f'[{n}]')
def tap(p,n=0):
 q=point(p,n);p.mouse.click(q['x'],q['y']);p.wait_for_timeout(60);return q
serverlog=(E/'fresh-server-log.txt').open('w')
server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':'5187'},stdout=serverlog,stderr=serverlog)
try:
 for _ in range(30):
  try:urllib.request.urlopen(URL,timeout=1);break
  except Exception:time.sleep(.1)
 check('bundled server serves panel query instead of 404',urllib.request.urlopen(URL+'/?panel=show',timeout=3).status==200)
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
  ctx=browser.new_context(viewport={'width':1280,'height':900},device_scale_factor=1,accept_downloads=True)
  ctx.add_init_script('window.testPulses=[];Object.defineProperty(navigator,"vibrate",{configurable:true,value:ms=>{testPulses.push(ms);return true}});')
  p=ctx.new_page();p.set_default_timeout(20000);errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
  load(p);initial=settings(p)
  check('S is selected on a clean first load',initial['bubbleSize']==52)
  check('user preset and Original motion are preserved apart from size and fresh seeds',all(initial[k]==v for k,v in defaults.items() if not k.lower().endswith('seed')))
  check('both seeds are randomized on startup',changed(defaults,initial))
  check('normal URL has no panel icon, sidebar, crop dialog or controls',p.locator('#settings-toggle,#settings-panel,#crop-dialog').count()==0)
  check('one shared WebGL canvas still renders two surfaces in one draw',p.evaluate('document.querySelectorAll("canvas").length===1&&bubbleUI.getStats().surfaces===2&&bubbleUI.getStats().drawCalls===1'))
  check('haptic wiring is independent of the audio engine unlock',p.evaluate('bubbleUI.audio.state==="locked"&&bubbleUI.audio.feedback.mode==="vibration-api"'))
  p.screenshot(path=str(E/'fresh-desktop.png'))
  current=settings(p);sig=p.evaluate('bubbleUI.inspect().filter(p=>p.mode==="poppable").map(p=>[p.inflatedVariant,p.collapsedVariant])')
  load(p,reload=True);after=settings(p)
  check('reload simulation rolls both stored seeds again',changed(current,after))
  check('reload changes the actual inflated and collapsed atlas assignments',sig!=p.evaluate('bubbleUI.inspect().filter(p=>p.mode==="poppable").map(p=>[p.inflatedVariant,p.collapsedVariant])'))
  check('storage adapter saves without mounting the panel (memory test double)',p.evaluate('JSON.parse(localStorage.getItem("bubble-ui-studio-v7-fresh")).settings.edgeSeed===bubbleUI.settings.edgeSeed'))
  p.evaluate('bubbleUI.setSettings({contrast:1.25,collapseSpeed:.72,volume:.3})');p.wait_for_timeout(250);current=settings(p);load(p,reload=True);after=settings(p)
  check('custom preferences survive simulated reload; seeds do not (storage test double)',changed(current,after) and after['contrast']==1.25 and after['collapseSpeed']==.72 and after['volume']==.3)
  p.evaluate('bubbleUI.setSettings({contrast:1.04,collapseSpeed:1,volume:.75})')
  q=tap(p);check('mouse tap still commits one pop',p.evaluate('bubbleUI.getStats().popped')==1)
  check('a real pop requests a 13 ms pulse on the vibration path',p.evaluate('testPulses.includes(13)'))
  p.wait_for_function('(i)=>bubbleUI.inspect()[i].squish>.95',arg=q['index'])
  tap(p);check('repeat taps bounce without double-counting and request a lighter pulse',p.evaluate('bubbleUI.getStats().popped===1&&testPulses.includes(7)'))
  current=settings(p);p.locator('#reset').click();after=settings(p)
  check('Fresh Sheet resets the counter and regenerates every seed',p.evaluate('bubbleUI.getStats().popped===0') and changed(current,after))
  check('fresh seeds keep the same grade, dimensions and motion',all(after[k]==v for k,v in current.items() if not k.lower().endswith('seed')))
  check('wave reinflation remains scheduled on reset',p.evaluate('Array.from(bubbleUI.physics.resetAt).some(x=>x>=0)'))
  check('all newly cut edges stay collapsed during regeneration',p.evaluate('bubbleUI.inspect().filter(p=>p.cut).every(p=>p.popped&&p.squish===1)'))
  check('refill still plays when resetting popped bubbles',p.evaluate('bubbleUI.audio.refillVoice!==null'))
  p.wait_for_function('bubbleUI.audio.refillVoice===null');p.locator('#sheet').focus();current=settings(p);p.keyboard.press('Space')
  check('Space refreshes seeds even when the sheet is already fresh',changed(current,settings(p)) and p.evaluate('bubbleUI.getStats().popped===0'))
  check('refreshing an already-fresh sheet does not play a refill cue',p.evaluate('bubbleUI.audio.refillVoice===null'))
  codes=p.evaluate('bubbleUI.getKeyboardMap().map(g=>g.code)')
  for c in codes:p.keyboard.press(c)
  check('all 47 physical keys still pop exactly one per press',len(codes)==47 and p.evaluate('bubbleUI.getStats().popped')==47)
  mapping=p.evaluate('bubbleUI.getKeyboardMap().map(g=>g.total)');check('fresh sheet keyboard groups remain balanced',max(mapping)-min(mapping)<=1)
  p.keyboard.press('Space');p.keyboard.down('KeyQ');n=p.evaluate('bubbleUI.getStats().popped');p.keyboard.down('KeyQ');p.keyboard.down('KeyQ');p.keyboard.up('KeyQ')
  check('holding a key still suppresses repeats',n==1 and p.evaluate('bubbleUI.getStats().popped')==1)
  p.locator('#sound').click();p.locator('#sheet').focus();p.keyboard.press('KeyA');check('sound mute does not suppress haptics',p.evaluate('bubbleUI.audio.muted&&testPulses.slice(-1)[0]===13'))
  current=settings(p);p.keyboard.press('Space');check('muted refresh rerolls all seeds with no new refill sound',changed(current,settings(p)) and p.evaluate('bubbleUI.audio.refillVoice===null'))
  for query in ['?panel=hide','?notpanel=show','?panel=show&panel=hide']:
   load(p,query);check('URL rejects unauthorized panel query '+query,p.locator('#settings-panel').count()==0)
  load(p,'?other=1&panel=show');p.wait_for_function('document.getElementById("settings-panel").classList.contains("show")')
  check('exact panel=show opens the existing sidebar automatically',p.locator('#settings-panel').is_visible())
  check('panel opt-in still does not add an icon to the header',p.locator('#settings-toggle').count()==0)
  check('sidebar S button matches the active size',p.locator('[data-size="52"]').get_attribute('aria-pressed')=='true')
  check('both random seeds have an all-seeds reroll action',p.locator('[data-reroll-seed]').count()==2)
  for k in ['edgeSeed','variantSeed']:
   p.locator('#control-search').fill('seed');current=settings(p);p.locator('[data-reroll-seed="'+k+'"]').click();after=settings(p)
   check(k+' refresh regenerates both seeds without touching other preferences',changed(current,after) and all(after[x]==v for x,v in current.items() if not x.lower().endswith('seed')))
   check(k+' controls synchronize with regenerated values',int(p.locator('#setting-'+k).input_value())==after[k])
  p.locator('#control-search').fill('');p.screenshot(path=str(E/'fresh-controls.png'))
  p.locator('#control-search').fill('collapse');p.locator('#setting-collapseSpeed').evaluate("n=>{n.value='0.65';n.dispatchEvent(new Event('input',{bubbles:true}))}")
  check('restored motion controls remain editable',settings(p)['collapseSpeed']==.65)
  # Audio upload tests use a generated test fixture, never a claimed user recording.
  p.locator('#control-search').fill('volume');p.locator('#audio-refill-file').set_input_files(str(fixture));p.wait_for_function('bubbleUI.audio.refillSample!==null')
  check('refill file is decoded separately from pop samples',p.evaluate('bubbleUI.audio.refillSampleLabel==="refill-tone.wav"&&bubbleUI.audio.sampleLabel==="Synthesized fallback"'))
  p.locator('#audio-refill-test').click();check('supplied refill sample plays once at its original length',p.evaluate('Math.abs(bubbleUI.audio.refillVoice.duration-.2)<.001'))
  p.wait_for_function('bubbleUI.audio.refillVoice===null')
  p.evaluate('bubbleUI.setMuted(true)');p.locator('#audio-refill-test').click();check('custom refill obeys mute',p.evaluate('bubbleUI.audio.refillVoice===null'))
  p.evaluate('bubbleUI.setMuted(false);bubbleUI.setSettings({volume:0})');p.locator('#audio-refill-test').click();check('custom refill obeys zero volume',p.evaluate('bubbleUI.audio.refillVoice===null'))
  p.evaluate('bubbleUI.setSettings({volume:.75})')
  p.locator('#audio-refill-file').set_input_files({'name':'broken.wav','mimeType':'audio/wav','buffer':b'not an audio stream'})
  p.wait_for_function('document.getElementById("audio-refill-source").textContent.includes("Error")')
  check('invalid refill file leaves the previously loaded sample intact',p.evaluate('bubbleUI.audio.refillSampleLabel==="refill-tone.wav"'))
  p.locator('#audio-refill-clear').click();check('explicit fallback restores the synthesized refill',p.evaluate('bubbleUI.audio.refillSample===null&&bubbleUI.audio.refillSampleLabel==="Synthesized refill"'))
  p.locator('#control-search').fill('haptic');p.locator('#setting-haptics').uncheck();n=p.evaluate('testPulses.length');p.evaluate('bubbleUI.popKey("KeyH")')
  check('haptics switch disables pop vibration requests',p.evaluate('testPulses.length')==n)
  check('sidebar reports feedback path and disabled state honestly','off' in p.locator('#haptic-status').inner_text().lower() and p.locator('#haptic-test').is_disabled())
  p.locator('#setting-haptics').check();p.locator('#haptic-test').click();check('dedicated feedback test requests a bounded pulse',p.evaluate('testPulses.slice(-1)[0]===15'))
  p.locator('#control-search').fill('');p.locator('#settings-close').click();p.wait_for_timeout(350)
  check('panel can close without leaving an icon or blocking interaction',p.locator('#settings-toggle').count()==0 and not p.locator('#settings-panel').is_visible())
  load(p);check('returning to the normal URL removes the panel again',p.locator('#settings-panel').count()==0)
  p.evaluate('bubbleUI.setSettings({collapseSpeed:1})');p.locator('#sheet').focus();p.keyboard.press('Space')
  a=point(p,10);b=point(p,15);p.mouse.move(a['x'],a['y']);p.mouse.down();p.mouse.move(b['x'],b['y'],steps=10);p.mouse.up();p.wait_for_timeout(100)
  check('mouse dragging retains continuous trail popping',p.evaluate('bubbleUI.getStats().popped')>=4)
  p.evaluate('window.cornerEvents=[];for(const t of ["pointerdown","pointerup","pointercancel","gotpointercapture","lostpointercapture"]){window.addEventListener(t,e=>cornerEvents.push({type:t,target:e.target.outerHTML?.slice(0,180),id:e.pointerId}),true)}')
  box=p.locator('[data-corner="0"]').bounding_box();x=box['x']+box['width']/2;y=box['y']+box['height']/2;p.mouse.move(x,y);p.mouse.down();p.mouse.move(x+55,y+45,steps=8);p.wait_for_timeout(120)
  check('invisible corner remains draggable',p.evaluate('Math.max(...bubbleUI.inspectMotion().corners.map(Math.abs))>1'))
  p.mouse.up();p.wait_for_timeout(100)
  (E/'fresh-corner-diagnostic.json').write_text(json.dumps(p.evaluate('({events:cornerEvents,motion:bubbleUI.inspectMotion(),settings:bubbleUI.settings,pointers:bubbleUI.getStats().activePointers,corners:[...document.querySelectorAll(".corner-grip")].map(n=>({drag:n.dataset.dragging,capture:n.hasPointerCapture(1),hidden:n.hidden,rect:n.getBoundingClientRect().toJSON()}))})'),indent=2))
  p.wait_for_function('bubbleUI.inspectMotion().targets.every(x=>x===0)');p.wait_for_function('Math.max(...bubbleUI.inspectMotion().corners.map(Math.abs))<.5',timeout=60000)
  check('corner marker remains invisible',p.evaluate('getComputedStyle(document.querySelector(".corner-grip"),"::after").content==="none"'))
  for width,height in [(390,844),(320,568)]:
   p.set_viewport_size({'width':width,'height':height});p.wait_for_timeout(200)
   check(str(width)+'px mobile has S default and no panel button or horizontal overflow',settings(p)['bubbleSize']==52 and p.locator('#settings-toggle').count()==0 and p.evaluate('document.documentElement.scrollWidth===innerWidth'))
   check(str(width)+'px footer hit areas are at least 56x56',p.evaluate('[...document.querySelectorAll(".icon-action")].every(n=>{const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56})'))
  p.set_viewport_size({'width':390,'height':844});p.evaluate('bubbleUI.reset(undefined,true)');p.wait_for_timeout(250);p.screenshot(path=str(E/'fresh-mobile.png'))
  load(p,'?panel=show');p.wait_for_timeout(250);p.locator('#control-search').fill('haptic');p.screenshot(path=str(E/'fresh-mobile-controls.png'))
  check('mobile opt-in panel fits the viewport',p.evaluate('document.documentElement.scrollWidth===innerWidth&&document.getElementById("settings-panel").getBoundingClientRect().right<=innerWidth'))
  check('no application errors during normal and opt-in flows',not errors)
  # Native-switch branch: simulate feature detection in Chromium; this is NOT iOS hardware validation.
  native=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=1)
  native.add_init_script('Object.defineProperty(navigator,"vibrate",{configurable:true,value:undefined});Object.defineProperty(HTMLInputElement.prototype,"switch",{configurable:true,get(){return this.hasAttribute("switch")}});')
  m=native.new_page();m.set_default_timeout(20000);merrors=[];m.on('pageerror',lambda e:merrors.append(str(e)));load(m)
  check('native-switch fallback mounts only when its feature is available',m.evaluate('bubbleUI.audio.feedback.mode==="native-switch-tap"&&document.querySelectorAll("[data-bubble-haptic-switch]").length===2'))
  q=point(m,5);m.touchscreen.tap(q['x'],q['y']);m.wait_for_timeout(100)
  check('trusted direct tap pops once and forwards native label activation',m.evaluate('bubbleUI.getStats().popped===1&&bubbleUI.audio.feedback.status.nativeTaps===1'))
  m.touchscreen.tap(q['x'],q['y']);m.wait_for_timeout(100)
  check('re-tap also activates native switch without a second pop',m.evaluate('bubbleUI.getStats().popped===1&&bubbleUI.audio.feedback.status.nativeTaps===2'))
  before=m.evaluate('bubbleUI.audio.feedback.status.nativeTaps');m.evaluate('document.querySelector("[data-bubble-haptic-tap]").click()')
  check('programmatic label clicks are not treated as trusted haptics',m.evaluate('bubbleUI.audio.feedback.status.nativeTaps')==before)
  m.evaluate('bubbleUI.setSettings({haptics:false})');q=point(m,6);m.touchscreen.tap(q['x'],q['y']);m.wait_for_timeout(100)
  check('disabling native haptics leaves touch popping functional',m.evaluate('bubbleUI.getStats().popped===2&&bubbleUI.audio.feedback.status.nativeTaps===2'))
  m.evaluate('bubbleUI.setSettings({haptics:true})');cdp=native.new_cdp_session(m);a=point(m,10);b=point(m,11)
  def touch(kind,ps):cdp.send('Input.dispatchTouchEvent',{'type':kind,'touchPoints':ps})
  pt=lambda q,i:{'x':q['x'],'y':q['y'],'id':i,'radiusX':3,'radiusY':3,'force':1}
  before=m.evaluate('bubbleUI.getStats().popped');touch('touchStart',[pt(a,1),pt(b,2)]);touch('touchEnd',[]);m.wait_for_timeout(200)
  check('two-finger pop remains functional with the native label overlay',m.evaluate('bubbleUI.getStats().popped')==before+2)
  q=point(m,15);touch('touchStart',[pt(q,3)]);touch('touchCancel',[]);m.wait_for_timeout(80)
  check('touch cancel clears active pointers through the native layer',m.evaluate('bubbleUI.getStats().activePointers===0'))
  nativeTaps=m.evaluate('bubbleUI.audio.feedback.status.nativeTaps');a=point(m,20);b=point(m,21);touch('touchStart',[pt(a,4)]);touch('touchMove',[pt(b,4)]);touch('touchEnd',[]);m.wait_for_timeout(150)
  check('native path does not falsely report per-bubble haptics during a drag',m.evaluate('bubbleUI.audio.feedback.status.nativeTaps')==nativeTaps)
  check('native haptic support never claims a verified physical motor',m.evaluate('bubbleUI.audio.feedback.status.hardwareVerified===false'))
  m.evaluate('bubbleUI.destroy()');check('destroy cleans up native switch and label nodes',m.locator('[data-bubble-haptic-switch],[data-bubble-haptic-tap]').count()==0)
  check('native fallback routing causes no application errors',not merrors)
  native.close();ctx.close();browser.close()
finally:
 server.terminate();server.wait(timeout=5);serverlog.close()
print(json.dumps({'passed':sum(r['passed'] for r in results),'total':len(results)}),flush=True)
