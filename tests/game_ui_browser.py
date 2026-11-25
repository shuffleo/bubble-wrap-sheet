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
 point=page.evaluate('bubbleUI.inspect().find(p=>p.mode==="poppable"&&p.eligible&&!p.popped)')
 page.mouse.click(point['x'],point['y'])
 check('Free Pop interaction remains active',page.evaluate('bubbleUI.getStats().popped===1'))
 page.locator('#game-open').click()
 page.wait_for_selector('#game-root[data-screen="mode-select"]')
 check('entry button opens both mode choices',page.locator('[data-game-action=free],[data-game-action=survival]').count()==2)
 page.locator('[data-game-action=survival]').click()
 check('Survival Run opens the level intro fixture',page.locator('#game-root[data-screen="level-intro"]').count()==1)
 page.locator('[data-game-action=continue]').click()
 check('level intro continues to the responsive HUD',page.locator('#game-root[data-screen="hud"] .game-hud-primary').count()==1)

 load(page,'?game=1&screen=hud&hud=danger')
 check('danger route exposes a distinct timer state',page.locator('.game-hud[data-danger="true"]').count()==1)
 check('game development routes are noindexed',page.locator('meta[name=robots]').get_attribute('content')=='noindex,follow')

 page.set_viewport_size({'width':390,'height':844})
 load(page,'?game=1&screen=hud&hud=soft-expired')
 check('soft timer fixture explains that play continues','Par spent' in page.locator('.game-hud-timer').inner_text())
 check('mobile HUD stays inside the viewport',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))

 page.set_viewport_size({'width':1100,'height':760})
 load(page,'?game=1&screen=shop')
 check('shop renders exactly two fixture offers',page.locator('.game-offer').count()==2)
 first=page.locator('.game-offer').first
 first.locator('button').click()
 check('mock purchase updates owned and available-score states',first.get_attribute('data-owned')=='true' and page.locator('.game-balance strong').inner_text()=='0')
 load(page,'?game=1&screen=shop')
 page.locator('[data-game-action=reroll]').click()
 check('one paid reroll replaces offers and disables itself',page.locator('.game-offer[data-upgrade="knuckleCrack"]').count()==1 and page.locator('[data-game-action=reroll]').is_disabled())

 load(page,'?game=1&screen=run-won')
 check('win result includes score breakdown and retry',page.locator('.game-level-breakdown li').count()==5 and page.locator('[data-game-action=retry]').is_visible())
 load(page,'?game=1&screen=run-lost')
 check('loss result remains useful before retry',page.locator('.game-result-grid').is_visible() and 'reached level' in page.locator('.game-eyebrow').inner_text().lower())

 load(page,'?game=1&tuning=show')
 check('tuning drawer is gated by the exact development route',page.locator('#tuning-drawer').count()==1)
 check('schema generates a broad editable field set',page.locator('[data-tuning-input]').count()>80)
 check('restart policy labels cover live and deferred changes',page.locator('.tuning-policy[data-restart="none"]').count()>0 and page.locator('.tuning-policy[data-restart="run"]').count()>0)
 pulse=page.locator('[data-tuning-input="/ui/scorePulseMs"]')
 pulse.evaluate('(input)=>input.closest("details").open=true')
 pulse.fill('250')
 check('safe session override validates immediately','Valid override' in page.locator('#tuning-status').inner_text())
 with page.expect_download() as download:
  page.locator('[data-tuning-action=export]').click()
 check('complete tuning JSON exports with the canonical filename',download.value.suggested_filename=='level-design.json')
 check('fixture UI produces no JavaScript page errors',not errors)
 browser.close()

print(f'{passes} game UI assertions passed.')
