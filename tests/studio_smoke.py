import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':960},device_scale_factor=1)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda m: print('console',m.type,m.text[:500]) if m.type=='error' else None)
 page.set_content((ROOT/'index.html').read_text(),wait_until='load')
 page.wait_for_timeout(800)
 print('errors',errors)
 print('visible error',page.locator('#error-detail').text_content())
 print('globals',page.evaluate('({bootstrap:!!window.bootstrap,engine:!!window.bubbleUI})'))
 page.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1',timeout=30000)
 page.screenshot(animations='disabled',path=str(ROOT/'evidence/studio-desktop.png'))
 print('stats',page.evaluate('bubbleUI.getStats()'))
 page.locator('#settings-toggle').click();page.wait_for_timeout(350)
 page.screenshot(animations='disabled',path=str(ROOT/'evidence/studio-controls.png'))
 print('panel',page.locator('#settings-panel').get_attribute('class'), 'controls', page.locator('[data-control]').count())
 a=page.evaluate('bubbleUI.inspect().find(p=>p.eligible&&p.mode==="poppable"&&p.row>3&&p.col>3)')
 page.mouse.click(a['x'],a['y']);page.wait_for_timeout(200)
 print('afterclick',page.evaluate('bubbleUI.getStats()'))
 page.locator('#settings-close').click();page.wait_for_timeout(300)
 h=page.locator('[data-corner="0"]').bounding_box();page.mouse.move(h['x']+h['width']/2,h['y']+h['height']/2);page.mouse.down();page.mouse.move(h['x']+100,h['y']+100,steps=12);page.wait_for_timeout(400)
 page.screenshot(animations='disabled',path=str(ROOT/'evidence/studio-corner-drag.png'))
 print('motion',page.evaluate('bubbleUI.inspectMotion()'));page.mouse.up();page.wait_for_timeout(1800)
 print('settled',page.evaluate('bubbleUI.inspectMotion()'),'errors',errors)
 browser.close()
