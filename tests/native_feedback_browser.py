"""Feature-spoofed native-label routing in Chromium. Not a physical iPhone test."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
R=Path(__file__).resolve().parents[1];E=R/'evidence';results=[]
def check(name,ok):
 results.append({'test':name,'passed':bool(ok)});(E/'native-feedback-results.json').write_text(json.dumps(results,indent=2));print(('PASS ' if ok else 'FAIL ')+name,flush=True);assert ok,name
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 c=b.new_context(viewport={'width':390,'height':620},device_scale_factor=1,has_touch=True,is_mobile=True)
 c.add_init_script('Object.defineProperty(navigator,"vibrate",{configurable:true,value:undefined});Object.defineProperty(HTMLInputElement.prototype,"switch",{configurable:true,get(){return this.hasAttribute("switch")}});')
 p=c.new_page();p.set_default_timeout(15000);errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto('about:blank');p.set_content((R/'index.html').read_text(),wait_until='load');p.wait_for_function('bubbleUI.atlasReady===1')
 check('feature-selected native feedback path mounts one label per surface',p.evaluate('bubbleUI.audio.feedback.mode==="native-switch-tap"&&document.querySelectorAll("[data-bubble-haptic-tap]").length===2'))
 q=p.evaluate('bubbleUI.inspect().find(q=>q.eligible&&q.mode==="poppable"&&q.x>80&&q.y>180)')
 p.touchscreen.tap(q['x'],q['y']);p.wait_for_timeout(100)
 check('actual trusted touch forwards label activation and pops once',p.evaluate('bubbleUI.getStats().popped===1&&bubbleUI.audio.feedback.status.nativeTaps===1'))
 p.evaluate('document.querySelector("#sheet [data-bubble-haptic-tap]").click()')
 check('synthetic click cannot claim native haptic feedback',p.evaluate('bubbleUI.audio.feedback.status.nativeTaps===1'))
 p.evaluate('bubbleUI.setSettings({haptics:false})');p.touchscreen.tap(q['x'],q['y']);p.wait_for_timeout(60)
 check('off switch stops label feedback while re-tap remains functional',p.evaluate('bubbleUI.audio.feedback.status.nativeTaps===1&&bubbleUI.getStats().popped===1'))
 p.evaluate('bubbleUI.setSettings({haptics:true})');a=p.evaluate('bubbleUI.inspect().filter(q=>q.eligible&&q.mode==="poppable"&&q.x>80&&q.y>220)[1]');bb=p.evaluate('bubbleUI.inspect().filter(q=>q.eligible&&q.mode==="poppable"&&q.x>80&&q.y>220)[3]')
 p.mouse.move(a['x'],a['y']);p.mouse.down();p.mouse.move(bb['x'],bb['y'],steps=5);p.mouse.up();p.wait_for_timeout(80)
 check('trusted drag does not falsely claim per-bubble native haptics',p.evaluate('bubbleUI.audio.feedback.status.nativeTaps===1'))
 before=p.evaluate('bubbleUI.getStats().popped');node=p.locator('#sheet [data-bubble-haptic-tap]');node.dispatch_event('pointerdown',{'pointerId':55,'pointerType':'touch','button':0,'clientX':a['x'],'clientY':a['y'],'pressure':1});node.dispatch_event('pointercancel',{'pointerId':55,'pointerType':'touch','button':0})
 check('cancellation through native label clears tracked pointer without release pop',p.evaluate('bubbleUI.getStats().activePointers===0') and p.evaluate('bubbleUI.getStats().popped')==before)
 check('native path explicitly reports hardware as unverified',p.evaluate('bubbleUI.audio.feedback.status.hardwareVerified===false'))
 p.evaluate('bubbleUI.destroy()');check('teardown removes native switches and touch labels',p.locator('[data-bubble-haptic-tap],[data-bubble-haptic-switch]').count()==0)
 check('no runtime errors in the feature-spoofed fallback',not errors)
 c.close();b.close()
print(json.dumps({'passed':len(results),'total':len(results)}))
