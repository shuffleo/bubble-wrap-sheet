"""Checks for the requested v4 changes, including the actual offline audio signal."""
import os,json,wave,struct
from pathlib import Path
from playwright.sync_api import sync_playwright,Error
os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence';results=[]
HTML=(ROOT/'index.html').read_text()
DEFAULT=json.loads((ROOT/'presets/default-preset.json').read_text())['settings']
def check(name,value):
 results.append({'check':name,'pass':bool(value)});(E/'v4-browser-results.json').write_text(json.dumps(results,indent=2));print(('PASS ' if value else 'FAIL ')+name,flush=True)
 assert value,name

def ready(page):
 page.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1');page.wait_for_timeout(120)

def first_point(page):
 return page.evaluate('bubbleUI.inspect().find(p=>p.eligible&&p.mode==="poppable"&&p.x>100&&p.y>170)')

def pop_one(page):
 p=first_point(page);page.mouse.click(p['x'],p['y']);page.wait_for_function('bubbleUI.getStats().popped>0');return p

with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1);page.set_default_timeout(25000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(HTML,wait_until='load');ready(page)
 check('all uploaded defaults applied, with M size override',page.evaluate('bubbleUI.settings')==DEFAULT)
 check('brand reads bubble wrap',page.locator('.brand-name').inner_text()=='bubble wrap')
 check('counter is in header and horizontally centered',page.evaluate('(()=>{const r=document.querySelector("header .counter").getBoundingClientRect();return Math.abs(r.x+r.width/2-innerWidth/2)<1})()'))
 check('sizes are only in the collapsed sidebar',page.locator('header [data-size]').count()==0 and page.locator('#settings-panel [data-size]').count()==5 and not page.locator('.sizes').is_visible())
 check('four invisible corner targets remain reachable',page.evaluate('Array.from(document.querySelectorAll(".corner-grip")).length===4&&Array.from(document.querySelectorAll(".corner-grip")).every(n=>!n.hidden&&getComputedStyle(n,"::after").content==="none"&&getComputedStyle(n).backgroundColor==="rgba(0, 0, 0, 0)")'))
 check('initial cut bubbles do not enable refresh',page.evaluate('bubbleUI.inspect().some(p=>p.cut&&p.popped)&&bubbleUI.getStats().popped===0&&document.getElementById("reset").disabled'))
 check('footer buttons contain icons only, no labels or key badges',page.evaluate('Array.from(document.querySelectorAll("footer button")).length===2&&Array.from(document.querySelectorAll("footer button")).every(n=>n.textContent.trim()===""&&n.querySelector("svg")&&n.getAttribute("aria-label"))&&document.querySelectorAll("footer kbd").length===0'))
 check('refresh and audio touch targets are 56 by 56',page.evaluate('Array.from(document.querySelectorAll("footer button")).every(n=>{const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56})'))
 check('idle refresh is visibly dimmed',page.evaluate('Number(getComputedStyle(document.getElementById("reset")).opacity)<=.35'))
 check('no refill is played on load',page.evaluate('bubbleUI.audio.state==="locked"&&bubbleUI.audio.refillVoice===null'))
 page.keyboard.press('Space');check('Space on a pristine sheet is silent',page.evaluate('bubbleUI.audio.state==="locked"&&bubbleUI.audio.refillVoice===null'))
 page.screenshot(path=str(E/'v4-desktop.png'))
 pop_one(page)
 check('popping enables the refresh icon',not page.locator('#reset').is_disabled())
 page.locator('#reset').click();page.wait_for_function('bubbleUI.getStats().popped===0')
 check('fresh sheet starts the live refill voice',page.evaluate('bubbleUI.audio.refillVoice!==null&&bubbleUI.audio.state==="running"'))
 check('refill duration follows the configured wave',page.evaluate('Math.abs(bubbleUI.audio.refillVoice.duration-(bubbleUI.settings.resetDuration+.12))<.001'))
 check('reset immediately dims and disables the refresh control',page.locator('#reset').is_disabled())
 page.wait_for_function('bubbleUI.audio.refillVoice===null')
 check('refill voice cleans up after playback',True)
 page.locator('#sound').click()
 check('mute swaps waves for crossed speaker icon',page.evaluate('bubbleUI.audio.muted&&getComputedStyle(document.querySelector(".off-line")).display!=="none"&&getComputedStyle(document.querySelector(".sound-wave")).display==="none"&&document.getElementById("sound").getAttribute("aria-pressed")==="false"&&document.getElementById("sound").title==="Unmute sound"'))
 pop_one(page);page.locator('#reset').click();page.wait_for_function('bubbleUI.getStats().popped===0')
 check('muted reset never starts a refill voice',page.evaluate('bubbleUI.audio.refillVoice===null&&bubbleUI.audio.pendingRefill===null'))
 page.locator('#sound').click()
 check('unmute restores speaker waves',page.evaluate('!bubbleUI.audio.muted&&getComputedStyle(document.querySelector(".off-line")).display==="none"&&getComputedStyle(document.querySelector(".sound-wave")).display!=="none"'))
 page.evaluate('bubbleUI.audio.volume=0');pop_one(page);page.locator('#reset').click();page.wait_for_function('bubbleUI.getStats().popped===0')
 check('volume zero suppresses refill without forcing mute',page.evaluate('!bubbleUI.audio.muted&&bubbleUI.audio.refillVoice===null'))
 page.evaluate('bubbleUI.setSettings({volume:.75})')
 page.locator('#settings-toggle').click();page.wait_for_timeout(300)
 check('M is visibly selected in sidebar',page.locator('[data-size="64"]').get_attribute('aria-pressed')=='true' and page.locator('[data-size="64"]').is_visible())
 page.locator('[data-size="100"]').click();page.wait_for_function('bubbleUI.settings.bubbleSize===100')
 check('sidebar size buttons change diameter discretely',page.evaluate('bubbleUI.inspect().filter(p=>p.mode==="poppable").every(p=>p.radius===50)'))
 check('size changes do not play refill',page.evaluate('bubbleUI.audio.refillVoice===null'))
 page.locator('#settings-defaults').click();page.wait_for_function('bubbleUI.settings.bubbleSize===64')
 check('Defaults restores the personalized settings and M',page.evaluate('bubbleUI.settings')==DEFAULT)
 page.evaluate('document.getElementById("audio-refill-test").click()');page.wait_for_function('bubbleUI.audio.refillVoice!==null')
 page.evaluate('bubbleUI.setMuted(true)');page.wait_for_function('bubbleUI.audio.refillVoice===null')
 check('muting during refill cancels the voice',page.evaluate('bubbleUI.audio.muted&&bubbleUI.audio.pendingRefill===null'))
 page.evaluate('bubbleUI.setMuted(false)')
 page.screenshot(path=str(E/'v4-controls.png'));page.locator('#settings-close').click();page.wait_for_timeout(300)
 p=page.locator('[data-corner="0"]').bounding_box();x=p['x']+p['width']/2;y=p['y']+p['height']/2
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+55,y+40,steps=8);page.wait_for_function('bubbleUI.inspectMotion().corners[0]>8')
 check('invisible corner drag still bends and lifts',page.evaluate('bubbleUI.inspectMotion().corners[2]>5'))
 page.mouse.up();page.wait_for_function('Math.max(...bubbleUI.inspectMotion().corners.map(Math.abs))<.1')
 check('invisible corner springs back',True)
 page.locator('[data-corner="1"]').focus();page.keyboard.down('ArrowLeft');page.wait_for_function('bubbleUI.inspectMotion().corners[3]<-1');page.keyboard.up('ArrowLeft')
 check('corner remains keyboard operable with focus feedback',page.evaluate('getComputedStyle(document.querySelector("[data-corner=\\"1\\"]")).outlineStyle!=="none"'))
 page.locator('#sheet').focus();page.keyboard.press('KeyR');page.wait_for_function('bubbleUI.getStats().popped>0');page.keyboard.press('Space');page.wait_for_function('bubbleUI.getStats().popped===0')
 check('keyboard reset also plays the refill cue',page.evaluate('bubbleUI.audio.refillVoice!==null'))
 source=(ROOT/'.compiled/components/bubble-ui/core/bubble-refill.js').read_text()
 page.evaluate('(source)=>{const exports={};new Function("exports",source)(exports);window.testRefill=exports.scheduleRefill;}',source)
 signal=page.evaluate('''async()=>{const sr=48000,c=new OfflineAudioContext(1,sr*1.6,sr),noise=c.createBuffer(1,sr*1.5,sr),n=noise.getChannelData(0);let seed=6754;for(let i=0;i<n.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;n[i]=(seed>>>0)/2147483648-1;}let ended=0;const voice=testRefill(c,c.destination,noise,.85,()=>ended++),b=await c.startRendering(),data=b.getChannelData(0);const rms=(a,z)=>{let sum=0;for(let i=Math.floor(a*sr);i<Math.floor(z*sr);i++)sum+=data[i]*data[i];return Math.sqrt(sum/((z-a)*sr))};let peak=0,bad=0;for(const x of data){if(!Number.isFinite(x))bad++;peak=Math.max(peak,Math.abs(x));}return {duration:voice.duration,early:rms(.01,.07),swell:rms(.6,.8),tail:rms(1.05,1.5),peak,bad,ended,samples:Array.from(data),sampleRate:sr};}''')
 check('actual offline refill signal is nonzero and finite',signal['bad']==0 and signal['peak']>.03)
 check('refill swells instead of beginning with a pop',signal['swell']>signal['early']*10)
 check('refill signal leaves headroom and ends in silence',signal['peak']<.85 and signal['tail']<.00001)
 check('audio graph completes once and disconnects',signal['ended']==1)
 with wave.open(str(E/'refill-sound-check.wav'),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(signal['sampleRate']);f.writeframes(b''.join(struct.pack('<h',max(-32767,min(32767,round(v*32767)))) for v in signal.pop('samples')))
 (E/'refill-signal-results.json').write_text(json.dumps(signal,indent=2))
 check('desktop has no runtime errors',not errors)
 for width in [320,375,390,768]:
  mobile=browser.new_context(viewport={'width':width,'height':844},device_scale_factor=1,has_touch=True,is_mobile=True)
  mp=mobile.new_page();mobile_errors=[];mp.on('pageerror',lambda e:mobile_errors.append(str(e)));mp.set_content(HTML,wait_until='load');ready(mp)
  check(f'{width}px fresh visit defaults to M',mp.evaluate('bubbleUI.settings.bubbleSize===64'))
  bounds=mp.evaluate('''()=>{const b=document.querySelector('.brand-name').getBoundingClientRect(),c=document.querySelector('.counter').getBoundingClientRect(),s=document.getElementById('settings-toggle').getBoundingClientRect();return {left:b.right<c.left,right:c.right<s.left,center:Math.abs(c.x+c.width/2-innerWidth/2)<1,overflow:document.documentElement.scrollWidth>innerWidth,font:parseFloat(getComputedStyle(document.querySelector('.counter-meta strong')).fontSize),caption:parseFloat(getComputedStyle(document.querySelector('.counter-meta>span')).fontSize),targets:Array.from(document.querySelectorAll('footer button')).every(n=>{const r=n.getBoundingClientRect();return r.width>=56&&r.height>=56})}}''')
  check(f'{width}px header has no overlaps or horizontal overflow',bounds['left'] and bounds['right'] and bounds['center'] and not bounds['overflow'])
  check(f'{width}px counter text and touch targets are enlarged',bounds['font']>=14 and bounds['caption']>=11.5 and bounds['targets'])
  if width==390:
   mp.screenshot(path=str(E/'v4-mobile.png'))
   p=first_point(mp);mp.touchscreen.tap(p['x'],p['y']);mp.wait_for_function('bubbleUI.getStats().popped===1');mp.locator('#reset').tap();mp.wait_for_function('bubbleUI.getStats().popped===0')
   check('mobile touch refresh runs the refill sound',mp.evaluate('bubbleUI.audio.refillVoice!==null&&bubbleUI.audio.state==="running"'))
   mp.locator('#settings-toggle').tap();mp.wait_for_timeout(300);check('size choices accessible inside mobile sidebar',mp.locator('[data-size="64"]').is_visible())
   mp.screenshot(path=str(E/'v4-mobile-panel.png'))
  if width==320:mp.screenshot(path=str(E/'v4-mobile-320.png'))
  check(f'{width}px no JavaScript errors',not mobile_errors)
  mobile.close()
 # A real browser storage implementation on a locally fulfilled test origin.
 try:
  origin=browser.new_context(viewport={'width':1100,'height':800})
  origin.route('https://bubble-wrap.test/**',lambda route:route.fulfill(status=200,content_type='text/html',body=HTML))
  op=origin.new_page();op.goto('https://bubble-wrap.test/',wait_until='load');ready(op)
  op.evaluate('localStorage.setItem("bubble-ui-studio-v3",JSON.stringify({version:3,settings:{bubbleSize:100,contrast:2}}))');op.reload();ready(op)
  check('legacy saved settings cannot override the new defaults',op.evaluate('bubbleUI.settings.bubbleSize===64&&bubbleUI.settings.contrast===1.04'))
  op.evaluate('bubbleUI.setSettings({bubbleSize:82,contrast:1.21})');op.wait_for_timeout(500);op.reload();ready(op)
  check('new personal edits persist on an actual browser origin',op.evaluate('bubbleUI.settings.bubbleSize===82&&bubbleUI.settings.contrast===1.21'))
  op.evaluate('document.getElementById("settings-defaults").click()');op.wait_for_timeout(500);op.reload();ready(op)
  check('restored personal defaults persist across reloads',op.evaluate('bubbleUI.settings')==DEFAULT)
 except Error as error:
  if 'ERR_BLOCKED_BY_ADMINISTRATOR' not in str(error):raise
  note={'check':'real-origin storage persistence','status':'not verified','reason':'Browser policy blocks navigation, including locally fulfilled test origins. No storage shim was used.'}
  (E/'storage-test-limit.json').write_text(json.dumps(note,indent=2));print('UNVERIFIED real-origin storage: browser policy blocks navigation.',flush=True)
 browser.close()
print(json.dumps({'passed':len(results),'total':len(results)},indent=2))
