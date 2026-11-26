"""Fixture UI regression for Survival Run checkpoint 1."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

os.environ.pop('DISPLAY',None)
ROOT=Path(__file__).resolve().parents[1]
HTML=(ROOT/'standalone.html').read_text()
passes=0

def check(name,condition):
 global passes
 assert condition,name
 passes+=1
 print(f'PASS {name}',flush=True)

def load(page,query=''):
 page.goto('about:blank'+query)
 page.set_content(HTML,wait_until='domcontentloaded')
 page.wait_for_function('window.bubbleUI && window.bubbleGameUI && bubbleUI.atlasReady===1')

with sync_playwright() as pw:
 executable=os.environ.get('CHROMIUM_PATH') or ('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None)
 browser=pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1100,'height':760})
 errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))

 load(page)
 check('Free Pop starts without game chrome',page.locator('#game-root,#tuning-drawer').count()==0)
 check('Survival Run has an accessible entry button',page.locator('#game-open').is_visible())
 page.evaluate("window.gamePopEvents=[];bubbleUI.addEventListener('bubblepop',event=>gamePopEvents.push(event.detail))")
 point=page.evaluate('bubbleUI.inspect().find(p=>p.mode==="poppable"&&p.eligible&&!p.popped)')
 page.mouse.click(point['x'],point['y'])
 check('Free Pop interaction remains active',page.evaluate('bubbleUI.getStats().popped===1'))
 check('engine emits a typed manual pointer source',page.evaluate("gamePopEvents[0]?.source.type==='manual'&&gamePopEvents[0]?.source.input==='mouse'"))
 page.locator('#game-open').click()
 page.wait_for_selector('#game-root[data-screen="mode-select"]')
 check('entry button opens both mode choices',page.locator('[data-game-action=free],[data-game-action=survival]').count()==2)
 page.locator('[data-game-action=survival]').click()
 check('Survival Run opens the level intro fixture',page.locator('#game-root[data-screen="level-intro"]').count()==1)
 page.locator('[data-game-action=continue]').click()
 check('level intro continues to the responsive HUD',page.locator('#game-root[data-screen="hud"] .game-hud-goal').count()==1)
 page.wait_for_function('getComputedStyle(document.querySelector(".brand")).display==="none" && bubbleUI.inspect().every(point=>point.mode!=="spring-return")')
 check('Survival Run removes the title and spring-return bubble',page.evaluate('getComputedStyle(document.querySelector(".brand")).display==="none" && bubbleUI.inspect().every(point=>point.mode!=="spring-return")'))
 check('HUD prioritises score, velocity history, and goal progress',page.locator('.game-hud-score number-flow,.game-velocity-chart canvas,.game-hud-goal').count()==3)
 check('velocity trace fits its top-bar slot',page.evaluate('''() => {
   const host=document.querySelector('.game-velocity-chart');
   const canvas=host.querySelector('canvas');
   const score=document.querySelector('.game-hud-score').getBoundingClientRect();
   const velocity=document.querySelector('.game-hud-velocity').getBoundingClientRect();
   const goal=document.querySelector('.game-hud-goal').getBoundingClientRect();
   return canvas.clientWidth>=host.clientWidth-2 && canvas.clientHeight>=24 && score.right<=velocity.left+1 && velocity.right<=goal.left+1;
 }'''))
 check('goal count is primary and its unit is the caption', page.locator('.game-hud-goal strong number-flow').evaluate_all('nodes=>nodes.map(node=>node.getAttribute("aria-label"))')==['2','5'] and page.locator('.game-hud-goal small').inner_text()=='sheets popped')
 check('countdown has no status caption','Active time' not in page.locator('.game-hud-timer').inner_text())
 check('owned upgrades share one bottom-centre panel',page.locator('.game-upgrade-panel').count()==1 and page.locator('.game-upgrade-popover strong').count()==2)
 check('HUD overflow menu contains sheet controls and fixture destinations',page.locator('.game-overflow').click() is None and page.locator('.game-overflow-menu button').count()==6)
 check('refresh and mute are menu options rather than corner buttons',page.locator('#sound,#reset').evaluate_all('nodes=>nodes.every(node=>getComputedStyle(node).display==="none")') and page.locator('[data-game-action=refresh],[data-game-action=mute]').count()==2)
 check('game chrome uses bundled Material Symbols',page.locator('.game-hud .material-symbols-rounded').count()>=5)

 load(page,'?game=1&screen=hud&hud=danger')
 check('danger route exposes a distinct timer state',page.locator('.game-hud[data-danger="true"]').count()==1)
 check('game development routes are noindexed',page.locator('meta[name=robots]').get_attribute('content')=='noindex,follow')

 page.set_viewport_size({'width':390,'height':844})
 load(page,'?game=1&screen=hud&hud=soft-expired')
 check('soft timer keeps the countdown without a status caption',page.locator('.game-hud-timer number-flow').evaluate_all('nodes=>nodes.map(node=>node.getAttribute("aria-label"))')==['0','0'] and 'Par spent' not in page.locator('.game-hud-timer').inner_text())
 check('mobile HUD stays inside the viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 check('mobile velocity trace stays between the score and goal',page.evaluate('''() => {
   const score=document.querySelector('.game-hud-score').getBoundingClientRect();
   const velocity=document.querySelector('.game-hud-velocity').getBoundingClientRect();
   const goal=document.querySelector('.game-hud-goal').getBoundingClientRect();
   return score.right<=velocity.left+1 && velocity.right<=goal.left+1 && velocity.width<=140;
 }'''))
 before=page.locator('.game-velocity-readout strong number-flow').get_attribute('aria-label')
 point=page.evaluate('bubbleUI.inspect().find(p=>p.mode==="poppable"&&p.eligible&&!p.popped&&p.y>160)')
 page.mouse.click(point['x'],point['y'])
 page.wait_for_function('(before)=>document.querySelector(".game-velocity-readout strong number-flow")?.getAttribute("aria-label")!==before',arg=before)
 check('manual pops update the velocity readout',page.locator('.game-velocity-readout strong number-flow').get_attribute('aria-label')!=before)

 page.set_viewport_size({'width':1100,'height':760})
 load(page,'?game=1&screen=shop')
 check('shop renders exactly two fixture offers',page.locator('.game-offer').count()==2)
 first=page.locator('.game-offer').first
 first.locator('button').click()
 check('mock purchase dismisses the shop immediately',page.locator('#game-root[data-screen="hud"]').count()==1)
 load(page,'?game=1&screen=shop')
 page.locator('[data-game-action=reroll]').click()
 check('one paid reroll replaces offers and reports two remaining',page.locator('.game-offer[data-upgrade="knuckleCrack"]').count()==1 and '2 rerolls left' in page.locator('.game-shop-actions').inner_text())
 check('shop shows currency-prefixed prices and animated numbers',page.locator('.game-shop-card number-flow').count()>=4)
 load(page,'?game=1&screen=shop')
 before=page.locator('.game-balance number-flow').get_attribute('aria-label')
 page.locator('[data-game-action=skip]').click()
 check('skipping applies interest and closes the shop',page.locator('#game-root[data-screen="hud"]').count()==1 and page.locator('.game-hud-score number-flow').get_attribute('aria-label')!=before)

 load(page,'?game=1&screen=run-won')
 check('win result includes score breakdown and retry',page.locator('.game-level-breakdown li').count()==5 and page.locator('[data-game-action=retry]').is_visible())
 load(page,'?game=1&screen=run-lost')
 check('loss result remains useful before retry',page.locator('.game-result-grid').is_visible() and 'reached level' in page.locator('.game-eyebrow').inner_text().lower())

 load(page,'?game=1&tuning=show')
 check('tuning drawer is gated by the exact development route',page.locator('#tuning-drawer').count()==1)
 check('Tweakpane, Number Flow, and Smoothie Charts are bundled for offline use',page.evaluate('Boolean(window.GameVendors?.Pane && window.GameVendors?.SmoothieChart && window.GameVendors?.TimeSeries && customElements.get("number-flow"))'))
 check('schema generates a broad editable field set',page.locator('#tuning-pane-host .tp-lblv').count()>80)
 labels=page.locator('#tuning-pane-host .tp-lblv_l').all_inner_texts()
 check('restart policy labels cover live and deferred changes',any('Applies now' in label for label in labels) and any('New run' in label for label in labels))
 pulse=page.locator('#tuning-pane-host .tp-lblv',has_text='Score Pulse Ms · Applies now').locator('input')
 pulse.evaluate('(input)=>input.closest(".tp-fldv")?.querySelector("button")?.click()')
 pulse.fill('250')
 pulse.press('Enter')
 check('safe session override validates immediately','Valid override' in page.locator('#tuning-status').inner_text())
 with page.expect_download() as download:
  page.locator('[data-tuning-action=export]').click()
 check('complete tuning JSON exports with the canonical filename',download.value.suggested_filename=='level-design.json')
 check('fixture UI produces no JavaScript page errors',not errors)
 browser.close()

print(f'{passes} game UI assertions passed.')
