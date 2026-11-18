"""Current release browser regression. Uses actual WebGL and embedded recordings.
Chromium/SwiftShader and touch emulation are not physical-device performance or
haptic validation. Opaque-origin loads intentionally exercise storage fallback.
"""
import os,json,sys,time,subprocess,urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence';E.mkdir(exist_ok=True)
HTML=(ROOT/'standalone.html').read_text();results=[]
def check(name,ok):
 results.append({'test':name,'passed':bool(ok)});(E/'release-browser-results.json').write_text(json.dumps(results,indent=2)+'\n');print(('PASS ' if ok else 'FAIL ')+name,flush=True);assert ok,name

def load(page,query='',html=HTML):
 page.goto('about:blank'+query);page.set_content(html,wait_until='domcontentloaded');page.wait_for_function('window.bubbleUI && bubbleUI.atlasReady===1');page.wait_for_timeout(160)

def rest(p):p.wait_for_function('!bubbleUI.refreshing',timeout=8000);p.wait_for_timeout(60)
def poppoint(p):
 q=p.evaluate('bubbleUI.inspect().find(p=>p.mode==="poppable"&&p.eligible&&!p.popped&&p.x>120&&p.x<500&&p.y>200)');p.mouse.click(q['x'],q['y']);p.wait_for_timeout(70);return q

with sync_playwright() as pw:
 executable=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
 browser=pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 ctx=browser.new_context(viewport={'width':1000,'height':740},device_scale_factor=1)
 ctx.add_init_script('''window.__soundStarts=[];const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.__soundStarts.push({bufferSeconds:this.buffer?.duration,rate:this.playbackRate.value,args});return start.apply(this,args);};''')
 p=ctx.new_page();p.set_default_timeout(20000);errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 load(p)
 check('normal URL: no settings panel or panel icon',p.locator('#settings-panel,#settings-toggle').count()==0)
 check('default is S with slide in/out selected',p.evaluate('bubbleUI.settings.bubbleSize===52&&bubbleUI.settings.refreshMode===1'))
 check('three real pop samples and a refill are predecoded before any gesture',p.evaluate('bubbleUI.audio.imported.length===3&&!!bubbleUI.audio.refillSample&&bubbleUI.audio.state==="locked"'))
 check('embedded sample names are the supplied files, not generated fixtures',p.evaluate('bubbleUI.audio.sampleReport.pops.map(p=>p.name).join(",")==="single 1.wav,single 2.wav,single 3.wav"'))
 check('main title, canonical and JSON-LD are in static HTML',p.evaluate('document.title==="Bubble Wrap - Satisfying Pops, Anywhere"&&document.querySelector("link[rel=canonical]").href==="https://bubblewrapsheet.netlify.app/"&&!!JSON.parse(document.querySelector("script[type=\\"application/ld+json\\"]").textContent)'))
 check('one shared WebGL canvas and draw call',p.evaluate('document.querySelectorAll("canvas").length===1&&bubbleUI.getStats().drawCalls===1'))
 q=poppoint(p);before=p.evaluate('bubbleUI.getStats().popped');p.keyboard.press('a');p.wait_for_timeout(80)
 check('mouse click then typing pops without a sheet focus outline',p.evaluate('getComputedStyle(document.getElementById("sheet")).outlineStyle==="none"'))
 check('one keyboard key commits one additional pop',p.evaluate('bubbleUI.getStats().popped')==before+1)
 check('live pop playback selects a bundled PCM buffer',p.evaluate('bubbleUI.audio.lastSample!==null&&__soundStarts.some(s=>[.042,.087,.096].some(x=>Math.abs(x-s.bufferSeconds)<1e-6))'))
 p.keyboard.press('Tab');p.keyboard.press('Shift+Tab')
 check('Tab navigation restores the visible sheet outline',p.evaluate('document.activeElement.id==="sheet"&&getComputedStyle(document.getElementById("sheet")).outlineStyle==="solid"'))
 p.keyboard.press('b');check('popping after Tab retains the accessibility outline',p.evaluate('getComputedStyle(document.getElementById("sheet")).outlineStyle==="solid"'))
 p.mouse.click(q['x'],q['y']);check('returning to pointer input suppresses only the sheet outline',p.evaluate('getComputedStyle(document.getElementById("sheet")).outlineStyle==="none"'))
 p.wait_for_timeout(250);p.screenshot(path=str(E/'release-desktop.png'))
 old=p.evaluate('({edge:bubbleUI.settings.edgeSeed,variant:bubbleUI.settings.variantSeed,contrast:bubbleUI.settings.contrast})')
 p.keyboard.press('Space');state=p.evaluate('bubbleUI.inspectRefresh()')
 check('Space starts an actual slide exchange with old instances preserved',state and state['mode']=='slide in/out' and state['oldCount']>0 and state['oldPopped']>0)
 check('refill uses a recorded sample and at least the 720ms slide duration',p.evaluate('bubbleUI.audio.lastRefillPlan.sample&&bubbleUI.audio.lastRefillPlan.duration>=.72'))
 check('new sheet starts inflated while the old copy keeps popped cells',p.evaluate('bubbleUI.getStats().popped===0&&bubbleUI.inspect().every(p=>!p.cut||p.popped)'))
 check('refresh changes both seeds but not the material grade',p.evaluate('(s)=>bubbleUI.settings.edgeSeed!==s.edge&&bubbleUI.settings.variantSeed!==s.variant&&bubbleUI.settings.contrast===s.contrast',old))
 check('sheet inputs are locked while two sheets travel',p.evaluate('(q)=>bubbleUI.popKey("KeyA")===-1&&bubbleUI.hitTest(q.x,q.y)===-1',q))
 check('header fidget remains hit-testable during transport',p.evaluate('(()=>{const p=bubbleUI.inspect().find(p=>p.mode==="spring-return");return bubbleUI.hitTest(p.x,p.y)>=0})()'))
 # Freeze the common clock just to capture the same mid-frame reproducibly.
 p.evaluate('bubbleUI.exchange.timeline.elapsed=()=>bubbleUI.exchange.timeline.duration*.5; bubbleUI.wake()');p.wait_for_function('bubbleUI.exchange && Math.abs(bubbleUI.exchange.progress-.5)<.001')
 state=p.evaluate('bubbleUI.inspectRefresh()')
 check('old sheet moves right and incoming sheet enters from the left',state['outgoingX']>0 and state['incomingX']<0 and abs(state['progress']-.5)<.01)
 check('transport uses one context and one draw with temporary extra instances',p.evaluate('bubbleUI.renderInstances===bubbleUI.points.length+bubbleUI.exchange.oldCount&&document.querySelectorAll("canvas").length===1&&bubbleUI.getStats().drawCalls===1'))
 p.screenshot(path=str(E/'release-slide-mid.png'))
 p.evaluate('bubbleUI.exchange.timeline.elapsed=()=>10');rest(p)
 check('temporary geometry is released after the slide',p.evaluate('bubbleUI.renderInstances===bubbleUI.points.length&&bubbleUI.exchange===null'))
 check('refresh button remains dim but enabled on an empty sheet',p.evaluate('document.getElementById("reset").dataset.empty==="true"&&!document.getElementById("reset").disabled'))
 starts=p.evaluate('__soundStarts.length');p.keyboard.press('Space');p.wait_for_timeout(35)
 check('empty-sheet Space still plays a real excerpt',p.evaluate('(n)=>bubbleUI.refreshing&&bubbleUI.audio.lastRefillPlan.popped===0&&Math.abs(bubbleUI.audio.lastRefillPlan.duration-.72)<1e-6&&__soundStarts.length>n',starts))
 seeds=p.evaluate('[bubbleUI.settings.edgeSeed,bubbleUI.settings.variantSeed]');p.keyboard.press('Space');check('reentrant refresh does not reroll again or stack sheets',p.evaluate('JSON.stringify([bubbleUI.settings.edgeSeed,bubbleUI.settings.variantSeed])')==json.dumps(seeds,separators=(',',':')))
 rest(p);p.locator('#reset').click();check('empty-sheet refresh button also starts the transition',p.evaluate('bubbleUI.refreshing'));rest(p)
 # Exact full-sheet plan without spending hundreds of separate physical events.
 p.evaluate('bubbleUI.inspect().filter(p=>p.mode==="poppable"&&p.eligible).forEach(p=>bubbleUI.physics.pop(p.index))');p.wait_for_timeout(160);p.keyboard.press('Space')
 check('full sheet plays the complete 1.129-second recording at original rate',p.evaluate('Math.abs(bubbleUI.audio.lastRefillPlan.duration-bubbleUI.audio.refillSample.duration)<1e-9&&bubbleUI.audio.lastRefillPlan.offset===0&&__soundStarts.at(-1).rate===1'))
 rest(p);p.locator('#sound').click();starts=p.evaluate('__soundStarts.length');p.keyboard.press('Space');rest(p)
 check('muting suppresses refill playback without skipping the animation',p.evaluate('(n)=>bubbleUI.audio.muted&&__soundStarts.length===n',starts))
 p.locator('#sound').click();rest(p)
 for key in ['Backquote','1','2','3','4','5','6','7','8','9','0','-','=','q','w','e','r','t','y','u','i','o','p','[',']','\\','a','s','d','f','g','h','j','k','l',';','\'','z','x','c','v','b','n','m',',','.','/']:p.keyboard.press(key)
 check('all 47 physical keys pop one bubble from their group',p.evaluate('bubbleUI.getStats().popped')==47)
 before=p.evaluate('bubbleUI.getStats().popped');p.keyboard.down('a');p.keyboard.down('a');p.keyboard.down('a');p.keyboard.up('a')
 check('holding a mapped key does not auto-repeat popping',p.evaluate('bubbleUI.getStats().popped')==before+1)
 check('no WebGL errors after transport and keyboard use',p.evaluate('bubbleUI.gl.getError()===0'))
 # Resize during transport must cancel cleanly and allow fresh interaction.
 p.keyboard.press('Space');p.set_viewport_size({'width':820,'height':720});p.wait_for_function('bubbleUI.canvas.width===820 && !bubbleUI.refreshing',timeout=4000)
 check('resizing mid-slide cancels its snapshot safely',p.evaluate('!bubbleUI.refreshing&&bubbleUI.renderInstances===bubbleUI.points.length&&bubbleUI.gl.getError()===0'))
 # Responsive branding and input target size.
 for width in [320,390,520,760]:
  p.set_viewport_size({'width':width,'height':844});p.wait_for_timeout(100)
  check(f'{width}px mobile shows the interactive bubble, not brand text',p.evaluate('getComputedStyle(document.querySelector(".brand-name")).display==="none"&&document.querySelector("#fidget").getBoundingClientRect().width>=44'))
 p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(160);p.screenshot(path=str(E/'release-mobile.png'))
 check('bottom controls retain 56px mobile touch targets',p.evaluate('[...document.querySelectorAll(".icon-action")].every(n=>n.getBoundingClientRect().width>=56&&n.getBoundingClientRect().height>=56)'))
 f=p.evaluate('bubbleUI.inspect().find(p=>p.mode==="spring-return")');p.mouse.move(f['x'],f['y']);p.mouse.down();p.wait_for_timeout(80)
 check('mobile header bubble really compresses',p.evaluate('bubbleUI.inspect().find(p=>p.mode==="spring-return").squish>.05'))
 p.mouse.up();p.wait_for_timeout(350)
 # The URL-enabled panel uses the shipped Bootstrap widget.
 p.set_viewport_size({'width':1000,'height':740});load(p,'?panel=show');p.wait_for_selector('#settings-panel.show')
 check('URL opt-in opens the existing library sidebar, with no icon',p.locator('#settings-panel.show').count()==1 and p.locator('#settings-toggle').count()==0)
 check('debug URL is noindexed while canonical stays at the public root',p.evaluate('document.querySelector("meta[name=robots]").content==="noindex,follow"&&document.querySelector("link[rel=canonical]").href==="https://bubblewrapsheet.netlify.app/"'))
 check('68 sidebar controls include both refresh modes',p.locator('[data-control]').count()==68 and p.locator('#setting-refreshMode option').count()==2)
 check('sidebar correctly reports bundled sound availability and requested credit',p.locator('#sound-credit').inner_text().find('Anthousai')>=0 and 'Recorded' in p.locator('#sound-credit-status').inner_text())
 p.locator('#control-search').fill('qwerty');before=p.evaluate('bubbleUI.getStats().popped');p.locator('#control-search').press('a');check('typing in controls does not pop bubbles',p.evaluate('bubbleUI.getStats().popped')==before)
 p.locator('#control-search').fill('');p.locator('#setting-refreshMode').select_option('0');p.screenshot(path=str(E/'release-controls.png'))
 p.locator('#settings-close').click();p.wait_for_timeout(300);q=poppoint(p);p.wait_for_timeout(200);p.keyboard.press('Space')
 check('refresh insitu remains selectable without a sliding snapshot',p.evaluate('bubbleUI.inspectRefresh()?.mode==="refresh insitu"&&bubbleUI.inspectRefresh().oldCount===0'))
 rest(p);check('insitu reset finishes with cut edges still flat',p.evaluate('bubbleUI.inspect().every(p=>p.cut?p.popped&&p.squish===1:!p.popped)'))
 # Restore new mode, then force GPU context recovery.
 p.evaluate('bubbleUI.setSettings({refreshMode:1})');p.keyboard.press('Space');p.evaluate('window.__loss=bubbleUI.gl.getExtension("WEBGL_lose_context");__loss.loseContext()');p.wait_for_timeout(160);p.evaluate('__loss.restoreContext()');p.wait_for_function('!bubbleUI.lost&&bubbleUI.atlasReady===1');p.wait_for_timeout(120)
 check('context loss during slide restores a stable fresh sheet',p.evaluate('!bubbleUI.refreshing&&bubbleUI.gl.getError()===0&&document.querySelectorAll("canvas").length===1'))
 load(p,html=(ROOT/'backups/refresh-insitu.html').read_text());check('named backup opens in refresh insitu with recorded audio bundled',p.evaluate('bubbleUI.settings.refreshMode===0&&bubbleUI.audio.imported.length===3&&!!bubbleUI.audio.refillSample'))
 # Offline standalone confirms no missing companion WAV problem.
 off=browser.new_context(viewport={'width':600,'height':720},offline=True);op=off.new_page();load(op);op.keyboard.press('a');op.wait_for_timeout(80)
 check('standalone pops with bundled recordings while offline',op.evaluate('bubbleUI.audio.lastSample!==null&&bubbleUI.getStats().popped===1'))
 op.keyboard.press('Space');op.wait_for_timeout(50);check('offline refresh uses the recorded WAV, not synth fallback',op.evaluate('bubbleUI.audio.lastRefillPlan.sample'));off.close()
 reduced=browser.new_context(viewport={'width':600,'height':720},reduced_motion='reduce');rp=reduced.new_page();load(rp);rp.keyboard.press('Space');rp.wait_for_timeout(30)
 check('reduced-motion mode suppresses directional travel',rp.evaluate('bubbleUI.exchange!==null&&!bubbleUI.exchange.slide&&bubbleUI.exchange.oldCount===0'));reduced.close()
 # Mobile touch events, not mouse events in a narrow viewport.
 touch=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
 tp=touch.new_page();tp.on('pageerror',lambda e:errors.append(str(e)));load(tp)
 points=tp.evaluate('bubbleUI.inspect().filter(p=>p.mode==="poppable"&&p.eligible&&p.x>70&&p.x<320&&p.y>200&&p.y<610)')
 pair=[points[0],points[-1]];cdp=touch.new_cdp_session(tp)
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':v['x'],'y':v['y'],'id':i+1,'radiusX':4,'radiusY':4,'force':1} for i,v in enumerate(pair)]})
 tp.wait_for_timeout(220);cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});tp.wait_for_timeout(100)
 check('two independent mobile touches pop two bubbles',tp.evaluate('bubbleUI.getStats().popped')==2)
 check('mobile touch keeps the viewport still and no sheet outline',tp.evaluate('scrollX===0&&scrollY===0&&getComputedStyle(document.getElementById("sheet")).outlineStyle==="none"'))
 tp.locator('#reset').tap();tp.wait_for_timeout(40)
 check('touch reset uses slide and the recorded excerpt',tp.evaluate('bubbleUI.refreshing&&bubbleUI.audio.lastRefillPlan.sample&&bubbleUI.audio.lastRefillPlan.duration>=.72'))
 rest(tp);check('touch reset clears interior pops without reinflating cut edges',tp.evaluate('bubbleUI.getStats().popped===0&&bubbleUI.inspect().every(p=>!p.cut||p.popped)'))
 touch.close()
 check('no JavaScript page errors',not errors)
 browser.close()
# The deploy directory must independently serve all public assets.
log=(E/'release-server.log').open('w');port='5196';server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':port},stdout=log,stderr=log)
try:
 for i in range(40):
  try:urllib.request.urlopen(f'http://127.0.0.1:{port}/',timeout=1);break
  except Exception:time.sleep(.1)
 for path,mime in [('?panel=show','text/html'),('favicon.ico','image/x-icon'),('assets/icons/favicon-96.png','image/png'),('assets/social/bubble-wrap-social-v8.png','image/png'),('assets/social/bubble-wrap-square-v8.png','image/png'),('assets/audio/processed/pop-01.wav','audio/wav'),('assets/audio/processed/refresh.wav','audio/wav'),('robots.txt','text/plain'),('sitemap.xml','application/xml'),('site.webmanifest','application/manifest+json')]:
  r=urllib.request.urlopen(f'http://127.0.0.1:{port}/'+path,timeout=3);check('deploy serves '+path,r.status==200 and mime in r.headers.get('Content-Type',''))
finally:server.terminate();server.wait(timeout=5);log.close()
print(f'{len(results)} browser/deployment assertions passed.',flush=True)
