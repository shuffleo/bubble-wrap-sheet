"""Actual WebGL uniform/pixel, sidebar, input and persistence checks for v6.
The frozen-frame checks intentionally isolate material animation from frame rate.
SwiftShader runs are not physical-mobile performance benchmarks.
"""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence';results=[]
HTML=(ROOT/'index.html').read_text();defaults=json.loads((ROOT/'presets/default-preset.json').read_text())['settings']
NEW_KEYS=['pressSpeed','collapseSpeed','popImpulse','reboundLimit','revealStart','revealEnd','revealCurve','pressureBulge','pressureWrinkle','linearReveal']
def check(name,ok):
 results.append({'check':name,'pass':bool(ok)});(E/'motion-browser-results.json').write_text(json.dumps(results,indent=2));print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 assert ok,name
# Sample exact scene pixels at chosen squish with no pending animation tick.
FREEZE='''([s,patch])=>{
 const e=bubbleUI;e.setSettings(patch);cancelAnimationFrame(e.frame);e.frame=0;e.motion.clear();
 const index=e.points.findIndex(p=>p.mode==='poppable'&&p.eligible&&p.x>220&&p.x<650&&p.y>200&&p.y<450);
 const p=e.points[index];e.physics.reset(undefined,true);e.physics.bounce.fill(0);e.physics.bounceVelocity.fill(0);
 e.physics.squish[index]=s;e.physics.targetSquish[index]=s;e.physics.velocity[index]=0;e.physics.isPopped[index]=s>=1?1:0;
 e.dirty=true;e.last=performance.now();e.tick(e.last);cancelAnimationFrame(e.frame);e.frame=0;
 const gl=e.gl,n=Math.round(p.radius*2),data=new Uint8Array(n*n*4);
 gl.readPixels(Math.round(p.x-p.radius),innerHeight-Math.round(p.y+p.radius),n,n,gl.RGBA,gl.UNSIGNED_BYTE,data);
 return {pixels:Array.from(data),error:gl.getError(),index};
}'''
def delta(a,b):return sum(abs(x-y) for x,y in zip(a['pixels'],b['pixels']))/len(a['pixels'])
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 ctx=browser.new_context(viewport={'width':1200,'height':850},device_scale_factor=1,accept_downloads=True)
 page=ctx.new_page();page.set_default_timeout(30000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(HTML,wait_until='load');page.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1')
 check('original spring profile is the default and its button is selected',page.locator('[data-motion-preset="original"]').get_attribute('aria-pressed')=='true' and page.evaluate('bubbleUI.settings')==defaults)
 check('all ten new parameters have accessible, labeled sidebar controls',all(page.locator('#setting-'+k).count()==1 and page.locator('label[for="setting-'+k+'"]').count()==1 for k in NEW_KEYS))
 check('single WebGL canvas and original one-draw pipeline retained',page.evaluate('document.querySelectorAll("canvas").length===1&&bubbleUI.getStats().drawCalls===1&&bubbleUI.getStats().surfaces===2'))
 page.locator('#settings-toggle').click();page.wait_for_timeout(350)
 check('all three motion-only preset buttons have 44px touch height',page.evaluate('Array.from(document.querySelectorAll("[data-motion-preset]")).every(n=>n.getBoundingClientRect().height>=44)'))
 page.evaluate('bubbleUI.setSettings({contrast:1.27,volume:.28,edgeSeed:77,cornerLift:.9})')
 custom=page.evaluate('bubbleUI.settings');before=page.evaluate('bubbleUI.inspect().map(p=>[p.key,p.inflatedVariant,p.collapsedVariant])')
 page.locator('[data-motion-preset="slower"]').click();slow=page.evaluate('bubbleUI.settings')
 check('Slower preset updates both solver and visual-reveal settings',slow['collapseSpeed']==.65 and slow['collapseDamping']==28 and slow['revealStart']==.58)
 check('motion-only preset leaves custom material, audio, geometry and flex unchanged',all(slow[k]==custom[k] for k in ['contrast','volume','edgeSeed','cornerLift','bubbleSize','variantSeed','filmStrength']) and before==page.evaluate('bubbleUI.inspect().map(p=>[p.key,p.inflatedVariant,p.collapsedVariant])'))
 page.locator('[data-motion-preset="fast"]').click()
 check('Previous fast restores last release response for A/B testing',page.evaluate('bubbleUI.settings.spring===415&&bubbleUI.settings.popThreshold===.59&&bubbleUI.settings.collapseDamping===43&&bubbleUI.settings.revealStart===.35&&!bubbleUI.settings.linearReveal'))
 page.locator('[data-motion-preset="original"]').click()
 def setting(key,value):
  page.evaluate('([key,value])=>{const n=document.getElementById("setting-"+key);if(n.type==="checkbox"){n.checked=value;n.dispatchEvent(new Event("change",{bubbles:true}));}else{n.value=String(value);n.dispatchEvent(new Event("input",{bubbles:true}));}}',[key,value])
 setting('collapseSpeed',.5)
 check('live Collapse tempo slider changes the running solver',page.evaluate('bubbleUI.physics.settings.collapseSpeed===.5&&bubbleUI.settings.collapseSpeed===.5'))
 check('manual tuning shows Custom instead of incorrectly highlighting a preset',page.locator('[data-motion-preset][aria-pressed="true"]').count()==0 and 'Custom' in page.locator('#motion-profile-status').inner_text())
 page.locator('#control-search').fill('reveal');check('search discovers both reveal thresholds and easing',page.locator('[data-control="revealStart"]').is_visible() and page.locator('[data-control="revealEnd"]').is_visible() and page.locator('[data-control="revealCurve"]').is_visible());page.locator('#control-search').fill('')
 # Actual download/import path, including new settings.
 with page.expect_download() as info:page.locator('#preset-export').click()
 download=info.value;download.save_as(str(E/'motion-exported-preset.json'));export=json.loads((E/'motion-exported-preset.json').read_text())
 check('export includes every new response parameter',all(k in export['settings'] for k in NEW_KEYS) and export['settings']['collapseSpeed']==.5)
 page.locator('[data-motion-preset="fast"]').click();page.locator('#preset-file').set_input_files(str(E/'motion-exported-preset.json'));page.wait_for_function('bubbleUI.settings.collapseSpeed===.5')
 check('import restores the exact new motion settings and material settings',page.evaluate('bubbleUI.settings')==export['settings'])
 page.locator('#settings-defaults').click();check('Defaults returns original tension and personalized M material',page.evaluate('bubbleUI.settings')==defaults)
 page.locator('#settings-close').click();page.wait_for_timeout(300)
 # Use the existing, actual DOM controls to apply profiles before frozen frames.
 def profile(name):page.evaluate('(name)=>document.querySelector(`[data-motion-preset="${name}"]`).click()',name)
 profile('original');a=page.evaluate(FREEZE,[0,{}]);profile('fast');b=page.evaluate(FREEZE,[0,{}])
 check('inflated resting pixels are byte-identical across motion profiles',a['pixels']==b['pixels'])
 profile('original');a=page.evaluate(FREEZE,[1,{}]);profile('fast');b=page.evaluate(FREEZE,[1,{}])
 check('popped resting pixels are byte-identical across motion profiles',a['pixels']==b['pixels'])
 a=page.evaluate(FREEZE,[.55,{'revealStart':.35,'revealEnd':.98}]);b=page.evaluate(FREEZE,[.55,{'revealStart':.75,'revealEnd':.98}])
 check('Reveal starts at changes actual intermediate shader pixels',delta(a,b)>.4)
 a=page.evaluate(FREEZE,[.65,{'revealStart':.35,'revealEnd':.98}]);b=page.evaluate(FREEZE,[.65,{'revealEnd':.65}])
 check('Reveal completes at changes actual intermediate shader pixels',delta(a,b)>1)
 a=page.evaluate(FREEZE,[.65,{'revealStart':.35,'revealEnd':.98,'revealCurve':.5}]);b=page.evaluate(FREEZE,[.65,{'revealCurve':2.5}])
 check('Reveal easing changes actual pixels, not a CSS-only control',delta(a,b)>.4)
 a=page.evaluate(FREEZE,[.6,{'linearReveal':False,'revealCurve':1}]);b=page.evaluate(FREEZE,[.6,{'linearReveal':True}])
 check('Linear-light fade changes only the in-between texture blend',delta(a,b)>.1)
 a=page.evaluate(FREEZE,[.4,{'revealStart':.7,'revealEnd':.98,'pressureBulge':0,'pressureWrinkle':0}]);b=page.evaluate(FREEZE,[.4,{'pressureBulge':.15,'pressureWrinkle':.05}])
 check('pressure bulge and wrinkle flex change actual pre-pop image deformation',delta(a,b)>1)
 check('all new shader uniforms compile and render without GL errors',a['error']==0 and b['error']==0)
 # Return to real RAF, then verify input under exaggerated slow settings.
 page.evaluate('bubbleUI.setSettings('+json.dumps(defaults)+');bubbleUI.setSettings({collapseSpeed:.2,popImpulse:0});bubbleUI.reset(undefined,true)');page.locator('#sheet').focus()
 page.keyboard.press('KeyF');page.keyboard.press('KeyF')
 check('two rapid same-key taps still select two distinct group members',page.evaluate('bubbleUI.getStats().popped===2&&bubbleUI.inspect().filter(p=>p.keyboardCode==="KeyF"&&p.popped).length===2'))
 page.keyboard.down('KeyG');page.keyboard.down('KeyG');page.keyboard.up('KeyG')
 check('held-key repeat remains suppressed even at slow collapse tempo',page.evaluate('bubbleUI.getStats().popped===3'))
 page.keyboard.press('Space');check('Space cancels in-flight visual collapse and resets the sheet',page.evaluate('bubbleUI.getStats().popped===0'))
 page.wait_for_function('bubbleUI.inspect().filter(p=>p.eligible&&p.mode==="poppable").every(p=>Math.abs(p.squish)<.005)')
 check('cut edges stay flat after slow-motion reset',page.evaluate('bubbleUI.inspect().filter(p=>p.cut).every(p=>p.popped&&p.squish===1)'))
 profile('original');page.evaluate('bubbleUI.reset(undefined,true)');point=page.evaluate('bubbleUI.inspect().find(p=>p.eligible&&p.mode==="poppable"&&p.x>200&&p.y>200)');page.mouse.click(point['x'],point['y'])
 page.wait_for_function('bubbleUI.getStats().popped===1');check('mouse click and counter still respond immediately',True)
 page.wait_for_function('!bubbleUI.physics.hasMotion()');check('restored response settles and RAF can sleep',page.evaluate('bubbleUI.inspect().filter(p=>p.eligible&&p.popped).every(p=>p.squish===1)'))
 # Controls screenshot, with all three motion presets in view.
 page.locator('#settings-toggle').click();page.wait_for_timeout(350);page.evaluate('document.getElementById("settings-body").scrollTop=0');page.screenshot(path=str(E/'motion-controls.png'))
 page.locator('#control-search').fill('reveal');page.screenshot(path=str(E/'texture-transition-controls.png'))
 check('desktop page has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth===innerWidth'))
 check('no JavaScript exceptions during parameter editing, preset import, pixel tests or input',not errors)
 mobile=browser.new_context(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True)
 mp=mobile.new_page();mp.set_content(HTML,wait_until='load');mp.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1');mp.locator('#settings-toggle').tap();mp.wait_for_timeout(350)
 mp.locator('[data-motion-preset="slower"]').tap();check('motion preset controls work on touch-sized mobile sidebar',mp.evaluate('bubbleUI.settings.collapseSpeed===.65&&document.documentElement.scrollWidth===innerWidth'))
 mp.screenshot(path=str(E/'motion-mobile-controls.png'));mp.locator('#settings-close').tap();mp.wait_for_timeout(300);pt=mp.evaluate('bubbleUI.inspect().find(p=>p.eligible&&p.mode==="poppable"&&p.y>200)');mp.touchscreen.tap(pt['x'],pt['y']);mp.wait_for_function('bubbleUI.getStats().popped===1');check('mobile tap pops one bubble using slower motion settings',True)
 browser.close()
print(json.dumps({'passed':sum(x['pass'] for x in results),'total':len(results)},indent=2))
