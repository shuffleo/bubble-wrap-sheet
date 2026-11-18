import os,json
os.environ.pop('DISPLAY',None)
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];html=(ROOT/'index.html').read_text();results=[]
def check(name,value):
 assert value,name
 results.append({'test':name,'passed':True})
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/lib/chromium/chromium' if Path('/usr/lib/chromium/chromium').exists() else None),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ozone-platform=headless'])
 context=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
 page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.set_content(html,wait_until='load');page.wait_for_timeout(500)
 check('DPR is capped at two',page.evaluate('bubbleUI.getStats().dpr===2'))
 points=page.evaluate("bubbleUI.inspect().filter(p=>p.mode==='poppable'&&p.eligible&&p.x>50&&p.x<330&&p.y>190&&p.y<600)")
 starts=[q for q in points if q['x']<180];a,b=starts[0],starts[4];cdp=context.new_cdp_session(page)
 touches=[{'x':a['x'],'y':a['y'],'id':1,'force':1,'radiusX':8,'radiusY':8},{'x':b['x'],'y':b['y'],'id':2,'force':1,'radiusX':8,'radiusY':8}]
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':touches})
 check('two simultaneous touch pointers captured',page.evaluate('bubbleUI.getStats().activePointers===2'))
 for t in touches:t['x']+=page.evaluate('bubbleUI.settings.bubbleSize+bubbleUI.settings.gap')
 cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':touches})
 cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
 page.wait_for_function('bubbleUI.getStats().popped>=4',timeout=15000)
 check('two-finger drag pops both trails',page.evaluate('bubbleUI.getStats().popped>=4'))
 check('all touch pointers released',page.evaluate('bubbleUI.getStats().activePointers===0'))
 check('touch action disables browser gestures',page.locator('#sheet').evaluate("e=>getComputedStyle(e).touchAction==='none'"))
 page.screenshot(path=str(ROOT/'evidence/mobile-touch.png'))
 # Cancellation must not introduce a new release-triggered pop.
 page.evaluate('bubbleUI.reset(undefined,true)');c=points[-1]
 cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':c['x'],'y':c['y'],'id':3,'force':.1}]})
 # Snapshot in the cancellation event, not a prior browser round trip: the
 # new faster press can legitimately cross the threshold before cancellation.
 page.evaluate("document.getElementById('sheet').addEventListener('pointercancel',()=>{window.popsAtCancel=bubbleUI.getStats().popped},{capture:true,once:true})")
 cdp.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]})
 check('pointercancel clears tracking',page.evaluate('bubbleUI.getStats().activePointers===0'))
 check('pointercancel does not pop on release',page.evaluate('bubbleUI.getStats().popped===window.popsAtCancel'))
 page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(500)
 check('rotation preserves bubble diameter',page.evaluate("bubbleUI.inspect().find(p=>p.mode==='poppable').radius===26"))
 check('landscape has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
 page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(350)
 # Verify one-context guard and context-loss recovery, without stubbing the renderer.
 guard=page.evaluate("(()=>{try{new bubbleUI.constructor(document.createElement('canvas'));return false;}catch(e){return String(e).includes('Only one');}})()")
 check('second engine refused before creating another context',guard)
 page.evaluate("window.recovery={lost:false,restored:false};bubbleUI.addEventListener('contextlost',()=>recovery.lost=true);bubbleUI.addEventListener('contextrestored',()=>recovery.restored=true);window.loss=document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context');loss.loseContext();")
 page.wait_for_function('recovery.lost',timeout=15000);page.wait_for_timeout(300);page.evaluate('loss.restoreContext()');page.wait_for_function('recovery.restored',timeout=15000)
 check('WebGL context loss and restoration recover',page.evaluate('recovery.lost&&recovery.restored'))
 d=page.evaluate("bubbleUI.inspect().find(p=>p.mode==='poppable'&&p.eligible&&p.x>60&&p.x<300&&p.y>200)");page.touchscreen.tap(d['x'],d['y']);page.wait_for_function('bubbleUI.getStats().popped>0',timeout=15000)
 check('interaction works after context restoration',page.evaluate('bubbleUI.getStats().popped>0'))
 check('no JavaScript runtime errors',not errors)
 # Visibility of honest WebGL failure, no static fallback pretending to work.
 fallback=context.new_page();fallback.evaluate("HTMLCanvasElement.prototype.getContext=function(){return null}");fallback.set_content(html,wait_until='load')
 check('unsupported WebGL shows explicit error',fallback.locator('#error').is_visible())
 browser.close()
print(json.dumps(results,indent=2));(ROOT/'evidence/touch-recovery-results.json').write_text(json.dumps(results,indent=2))
