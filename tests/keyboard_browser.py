"""Physical-key routing and mapping in actual Chromium; no input or GL mocks."""
import os,json
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence';RESULTS=[]
HTML=(ROOT/'index.html').read_text()
def check(name,ok):
 RESULTS.append({'check':name,'pass':bool(ok)})
 (E/'keyboard-browser-results.json').write_text(json.dumps(RESULTS,indent=2))
 print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 assert ok,name

def count(page):return page.evaluate('bubbleUI.getStats().popped')
def ready(page):page.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1')
def fresh(page):page.evaluate('bubbleUI.reset(undefined,true)');page.locator('#sheet').focus()
def maps(page):return page.evaluate('bubbleUI.getKeyboardMap()')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 context=browser.new_context(viewport={'width':1440,'height':960},device_scale_factor=1)
 page=context.new_page();page.set_default_timeout(25000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(HTML,wait_until='load');ready(page);page.wait_for_timeout(150)
 check('keyboard enabled by default; clean material has no label overlay',page.evaluate('bubbleUI.settings.keyboardEnabled&&!bubbleUI.settings.showKeyLabels&&document.querySelectorAll(".keyboard-hints").length===0'))
 page.screenshot(path=str(E/'desktop.png'))
 initial=maps(page);totals=[g['total'] for g in initial]
 check('exact four keyboard rows and all 47 groups are present',len(initial)==47 and [''.join(g['label'] for g in initial if g['row']==r) for r in range(4)]==['`1234567890-=','qwertyuiop[]\\',"asdfghjkl;'",'zxcvbnm,./'])
 check('every intact bubble belongs to exactly one balanced group',page.evaluate('(()=>{const gs=bubbleUI.getKeyboardMap(),ids=gs.flatMap(g=>g.indices),n=gs.map(g=>g.total);return ids.length===bubbleUI.getStats().total&&new Set(ids).size===ids.length&&Math.max(...n)-Math.min(...n)<=1;})()'))
 check('cut edges and spring-return primitive have no key binding',page.evaluate('bubbleUI.inspect().filter(p=>p.cut||p.mode==="spring-return").every(p=>p.keyboardCode===null)'))
 page.locator('#sheet').focus();page.keyboard.press('Space')
 check('Space on an already fresh sheet neither pops nor plays refill',count(page)==0 and page.evaluate('bubbleUI.audio.state==="locked"&&bubbleUI.audio.refillVoice===null'))
 all_keys=[]
 for group in initial:
  before=count(page);page.keyboard.press(group['code']);after=count(page)
  hit=page.evaluate('(code)=>bubbleUI.inspect().filter(p=>p.keyboardCode===code&&p.popped).map(p=>p.index)',group['code'])
  all_keys.append({'key':group['label'],'code':group['code'],'delta':after-before,'hit':hit,'valid':after-before==1 and len(hit)==1 and hit[0] in group['indices']})
 (E/'physical-keys-results.json').write_text(json.dumps(all_keys,indent=2))
 check('all 47 real physical keys, including punctuation, pop exactly one own-group member',all(x['valid'] for x in all_keys))
 check('R, M and comma no longer reset, mute, or open the panel',count(page)==47 and page.evaluate('!bubbleUI.audio.muted&&!document.getElementById("settings-panel").classList.contains("show")'))
 check('first physical-key pop unlocks real Web Audio',page.evaluate('bubbleUI.audio.state==="running"'))
 check('pops do not reassign keyboard groups',[[g['code'],g['indices']] for g in maps(page)]==[[g['code'],g['indices']] for g in initial])
 page.keyboard.press('Space');page.wait_for_function('bubbleUI.getStats().popped===0')
 check('Space resets without adding a pop and starts refill audio',page.evaluate('bubbleUI.audio.refillVoice!==null&&document.getElementById("reset").disabled'))
 check('reset restores each group without remapping positions',all(g['remaining']==g['total'] for g in maps(page)) and [[g['code'],g['indices']] for g in maps(page)]==[[g['code'],g['indices']] for g in initial])
 page.wait_for_function('bubbleUI.audio.refillVoice===null')
 # Hold behavior: Playwright emits repeat=true on consecutive keydown calls.
 page.keyboard.down('KeyQ');first=count(page)
 for _ in range(6):page.keyboard.down('KeyQ')
 check('holding a key does not auto-pop the rest of its group',first==1 and count(page)==1)
 page.keyboard.up('KeyQ');page.keyboard.press('KeyQ')
 check('releasing and pressing the same key selects another unpopped bubble',count(page)==2 and page.evaluate('bubbleUI.inspect().filter(p=>p.keyboardCode==="KeyQ"&&p.popped).length===2'))
 fresh(page);group=next(g for g in maps(page) if g['code']=='KeyG');seen=[];deltas=[]
 for i in range(group['total']+3):
  before=count(page);page.keyboard.press('KeyG');deltas.append(count(page)-before)
  seen=page.evaluate('bubbleUI.inspect().filter(p=>p.keyboardCode==="KeyG"&&p.popped).map(p=>p.index)')
 check('repeated taps exhaust a group one at a time, with no duplicate pops',deltas==[1]*group['total']+[0]*3 and set(seen)==set(group['indices']))
 check('an exhausted group never borrows a bubble from another key',count(page)==group['total'] and page.evaluate('bubbleUI.inspect().filter(p=>p.mode==="poppable"&&p.eligible&&p.popped).every(p=>p.keyboardCode==="KeyG")'))
 # Randomness test: repeated fresh sheets should not always choose the first ID.
 draws=[]
 for _ in range(24):
  fresh(page);page.keyboard.press('KeyG');draws.append(page.evaluate('bubbleUI.inspect().find(p=>p.keyboardCode==="KeyG"&&p.popped).index'))
 check('fresh-group selections vary rather than always taking the first bubble',len(set(draws))>=2 and all(x in group['indices'] for x in draws))
 fresh(page)
 for code in ['KeyA','KeyS','KeyD']:page.keyboard.down(code)
 for code in ['KeyA','KeyS','KeyD']:page.keyboard.up(code)
 check('three distinct keys pressed together produce exactly three pops',count(page)==3)
 before=count(page);page.keyboard.press('Shift+Digit1');page.keyboard.press('Shift+KeyQ')
 check('Shift changes characters but not physical-key mapping',count(page)==before+2 and page.evaluate('bubbleUI.inspect().some(p=>p.keyboardCode==="Digit1"&&p.popped)&&bubbleUI.inspect().some(p=>p.keyboardCode==="KeyQ"&&p.popped)'))
 # Deliberately different key/code: verify physical, not translated character.
 before=count(page);page.evaluate('document.getElementById("sheet").dispatchEvent(new KeyboardEvent("keydown",{key:"a",code:"KeyQ",bubbles:true,cancelable:true}))');page.evaluate('document.getElementById("sheet").dispatchEvent(new KeyboardEvent("keyup",{key:"a",code:"KeyQ",bubbles:true}))')
 check('localized character does not displace the physical Q key',count(page)==before+1 and page.evaluate('bubbleUI.inspect().filter(p=>p.keyboardCode==="KeyQ"&&p.popped).length===2'))
 before=count(page)
 for flags in [{'ctrlKey':True},{'altKey':True},{'metaKey':True},{'isComposing':True}]:
  page.evaluate('(flags)=>{const n=document.getElementById("sheet");n.dispatchEvent(new KeyboardEvent("keydown",{key:"z",code:"KeyZ",bubbles:true,cancelable:true,...flags}));n.dispatchEvent(new KeyboardEvent("keyup",{key:"z",code:"KeyZ",bubbles:true}));}',flags)
 check('browser shortcuts and composition do not pop bubbles',count(page)==before)
 # Space itself is edge-triggered, even if another key pops during the hold.
 page.keyboard.down('Space');page.keyboard.press('KeyA');page.keyboard.down('Space')
 check('holding Space does not repeatedly erase new pops',count(page)==1)
 page.keyboard.up('Space');page.keyboard.press('Space');check('a new Space press refreshes again',count(page)==0)
 fresh(page);page.keyboard.down('KeyT');page.evaluate('window.dispatchEvent(new Event("blur"))');page.evaluate('document.getElementById("sheet").dispatchEvent(new KeyboardEvent("keydown",{key:"t",code:"KeyT",bubbles:true,cancelable:true}))');page.keyboard.up('KeyT')
 check('window blur clears held-key state and avoids stuck keys',count(page)==2)
 fresh(page);page.locator('#settings-toggle').click();page.wait_for_timeout(300)
 check('sidebar contains live map of all 47 keys',page.locator('.keyboard-cell').count()==47 and page.locator('#keyboard-map').is_visible())
 page.locator('#control-search').focus();before=count(page);page.keyboard.type('qwerty 123 r m , ')
 check('typing letters, punctuation and Space in sidebar search never pops or resets',count(page)==before)
 page.locator('#control-search').fill('');page.evaluate('bubbleUI.setSettings({showKeyLabels:true})');page.wait_for_timeout(120)
 check('optional labels cover exactly the intact eligible cells',page.evaluate('document.querySelectorAll(".keyboard-hints kbd").length===bubbleUI.getStats().total'))
 page.screenshot(path=str(E/'keyboard-controls.png'))
 page.locator('#settings-close').click();page.wait_for_timeout(260);page.locator('#sheet').focus();page.keyboard.press('KeyW')
 check('sidebar remaining count tracks a popped key group',page.evaluate('Number(document.querySelector(".keyboard-cell[data-code=KeyW] small").textContent)===bubbleUI.getKeyboardMap().find(g=>g.code==="KeyW").remaining'))
 page.wait_for_timeout(120)
 check('popped key label becomes visually subdued',page.evaluate('(()=>{const p=bubbleUI.inspect().find(p=>p.keyboardCode==="KeyW"&&p.popped);return document.querySelector(`.keyboard-hints [data-point-index="${p.index}"]`).dataset.popped==="true"})()'))
 p=page.locator('[data-corner="0"]').bounding_box();x=p['x']+p['width']/2;y=p['y']+p['height']/2
 page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+60,y+45,steps=6);page.wait_for_timeout(150)
 check('labels follow the sheet deformation without another canvas',page.evaluate('(()=>{const p=bubbleUI.inspect().find(p=>p.eligible&&p.mode==="poppable"&&p.row===2&&p.col===2);const q=bubbleUI.project(p.x,p.y),n=document.querySelector(`.keyboard-hints [data-point-index="${p.index}"]`).getBoundingClientRect();return Math.abs(n.x+n.width/2-q.x)<.5&&Math.abs(n.y+n.height/2-q.y)<.5&&document.querySelectorAll("canvas").length===1})()'))
 page.mouse.up();page.wait_for_function('Math.max(...bubbleUI.inspectMotion().corners.map(Math.abs))<.1');page.locator('#sheet').focus()
 page.screenshot(path=str(E/'keyboard-labels.png'))
 before=count(page);page.evaluate('bubbleUI.setSettings({keyboardEnabled:false})');page.keyboard.press('KeyA');page.keyboard.press('Space')
 check('keyboard can be disabled without changing mouse controls or progress',count(page)==before and page.locator('.keyboard-hints').count()==0)
 page.evaluate('bubbleUI.setSettings({keyboardEnabled:true,showKeyLabels:false})');page.keyboard.press('Space')
 # Native controls must remain accessible: Space on sound is mute, not reset.
 page.keyboard.press('KeyA');before=count(page);page.locator('#sound').focus();page.keyboard.press('Space')
 check('Space on a focused sound button retains native keyboard activation',count(page)==before and page.evaluate('bubbleUI.audio.muted'))
 page.locator('#sheet').focus();page.keyboard.press('Space');check('Space on sheet refreshes while muted without refill sound',count(page)==0 and page.evaluate('bubbleUI.audio.refillVoice===null'))
 page.keyboard.press('KeyA');page.locator('#sound').click();page.keyboard.press('Space')
 check('mouse use of sound control returns keyboard focus to the sheet for Space refresh',count(page)==0 and page.evaluate('document.activeElement.id==="sheet"'))
 # Inputs/editable content outside the panel are protected too.
 page.evaluate('(()=>{const n=document.createElement("div");n.id="editing-test";n.contentEditable="true";document.body.append(n);n.focus()})()');page.keyboard.type('qwerty 123 ')
 check('contenteditable content outside the sidebar is not intercepted',count(page)==0 and page.locator('#editing-test').inner_text().strip()=='qwerty 123')
 page.evaluate('document.getElementById("editing-test").remove()')
 page.evaluate('bubbleUI.setMuted(false)')
 # Resizing and changing the size must rebalance, not leave stale indices.
 populations=[]
 for width,height in [(1440,960),(390,844),(320,568),(844,390)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
 for size in [24,32,40,52,64,82,100,124,148]:
   page.evaluate('(bubbleSize)=>bubbleUI.setSettings({bubbleSize})',size);page.wait_for_timeout(35)
   m=maps(page);counts=[g['total'] for g in m];n=page.evaluate('bubbleUI.getStats().total');assigned=[i for g in m for i in g['indices']]
   populations.append({'width':width,'height':height,'diameter':size,'total':n,'min':min(counts),'max':max(counts),'empty':sum(v==0 for v in counts),'valid':max(counts)-min(counts)<=1 and len(assigned)==len(set(assigned))==n})
 check('all 20 responsive size combinations reassign without duplicates or stale cells',all(p['valid'] for p in populations))
 (E/'keyboard-size-populations.json').write_text(json.dumps(populations,indent=2))
 # Mobile screenshot of unchanged clean UI and narrow sidebar.
 page.set_viewport_size({'width':390,'height':844});page.evaluate('bubbleUI.setSettings({bubbleSize:64,showKeyLabels:false})');page.wait_for_timeout(250);fresh(page);page.evaluate('document.activeElement.blur()');page.screenshot(path=str(E/'mobile.png'))
 page.locator('#settings-toggle').click();page.wait_for_timeout(250)
 check('mobile key map fits inside the existing collapsible sidebar',page.evaluate('(()=>{const p=document.getElementById("settings-panel").getBoundingClientRect(),k=document.getElementById("keyboard-map").getBoundingClientRect();return k.left>=p.left&&k.right<=p.right&&document.documentElement.scrollWidth===innerWidth;})()'))
 page.screenshot(path=str(E/'mobile-controls.png'))
 check('no keyboard or rendering JavaScript errors',not errors)
 # Dispose removes optional labels and does not allocate another context.
 page.evaluate('bubbleUI.setSettings({showKeyLabels:true});bubbleUI.destroy()');check('engine destruction removes the label overlay',page.locator('.keyboard-hints').count()==0)
 browser.close()
print(json.dumps({'passed':len(RESULTS),'total':len(RESULTS)},indent=2))
