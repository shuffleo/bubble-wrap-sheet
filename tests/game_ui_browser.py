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
 page.evaluate('bubbleUI.setSettings({showKeyLabels:true,keyboardEnabled:bubbleUI.settings.keyboardEnabled})')
 check('endless mode hides key labels, including a stored preference',page.locator('.keyboard-hints kbd').count()==0)
 page.evaluate('bubbleUI.setSettings({showKeyLabels:false})')
 check('engine emits a typed manual pointer source',page.evaluate("gamePopEvents[0]?.source.type==='manual'&&gamePopEvents[0]?.source.input==='mouse'"))
 page.evaluate('(index)=>bubbleUI.setHazardWarning(index)',point['index'])
 check('Memory Foam warning and reinflation restore a popped bubble',page.evaluate('(index)=>bubbleUI.inspectHazardState().warningIndex===index&&bubbleUI.reinflateForGame(index)&&!bubbleUI.getGameBubbles().find(b=>b.index===index).popped',point['index']))
 page.evaluate('(index)=>{bubbleUI.setGameBubbleHolds([index],1500,400);bubbleUI.popForGame(index,{type:"manual",input:"keyboard",gestureId:"key:KeyA"});}',point['index'])
 page.wait_for_timeout(250)
 check('Hardened bubbles expose partial hold progress before popping',page.evaluate('(index)=>{const bubble=bubbleUI.getGameBubbles().find(item=>item.index===index);return bubble.hardened&&bubble.holdProgress>0&&!bubble.popped}',point['index']))
 page.evaluate('bubbleUI.releaseKey("KeyA")')
 page.wait_for_timeout(500)
 check('Hardened hold progress decays after release',page.evaluate('(index)=>bubbleUI.getGameBubbles().find(item=>item.index===index).holdProgress===0',point['index']))
 redirected=page.evaluate('''() => {
  const cells=bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped);
  const source=cells[0],target=cells[1];
  bubbleUI.setGameManualTargetResolver(()=>target.index);
  bubbleUI.popForGame(source.index,{type:'manual',input:'mouse',gestureId:'bob-smoke'});
  bubbleUI.setGameManualTargetResolver(null);
  return {source:source.index,target:target.index};
 }''')
 check('Drunken Bob resolver redirects input globally and lurches the target',page.evaluate('(pair)=>!bubbleUI.getGameBubbles().find(b=>b.index===pair.source).popped&&bubbleUI.getGameBubbles().find(b=>b.index===pair.target).popped',redirected))
 page.evaluate('bubbleUI.startGameConveyor(1000);bubbleUI.setGameConveyorSpeed(1)')
 conveyor_sample=page.evaluate('''() => {
  const visible=bubbleUI.inspect().filter(p=>p.conveyorVisible&&p.mode==="poppable");
  const rows=new Set(visible.map(p=>Math.round(p.y))).size;
  const columns=new Set(visible.map(p=>Math.round(p.x/8))).size;
  return {x:visible[0].x,rows,columns,count:visible.length};
 }''')
 page.wait_for_timeout(120)
 check('conveyor sheet moves as one full-height lattice',page.evaluate('''(sample)=>{
  const visible=bubbleUI.inspect().filter(p=>p.conveyorVisible&&p.mode==="poppable");
  return sample.count>20 && sample.rows>=4 && sample.columns>=4 && visible.some(p=>p.x>sample.x+0.2) && bubbleUI.getStats().drawCalls===1;
 }''',conveyor_sample))
 check('conveyor ending uses a cut film column instead of the last hex outline',page.evaluate('''() => {
  bubbleUI.setGameConveyorFeeding(false);
  const visible=bubbleUI.inspect().filter(p=>p.conveyorVisible&&p.mode==="poppable");
  const cut=visible.filter(p=>p.cut),live=visible.filter(p=>!p.cut&&p.eligible);
  return cut.length>=4 && live.length>20 && Math.min(...cut.map(p=>p.x))<Math.min(...live.map(p=>p.x));
 }'''))
 page.evaluate('bubbleUI.endGameConveyor(false)')
 page.locator('#game-open').click()
 page.wait_for_selector('#game-root[data-screen="mode-select"]')
 check('entry button opens both mode choices',page.locator('[data-game-action=free],[data-game-action=survival]').count()==2)
 check('free play is named Endless Mode',page.locator('[data-game-action=free] strong').inner_text()=='Endless Mode')
 load(page,'?game=1&screen=level-intro')
 check('level brief leads with workload and four medal targets',page.locator('.game-brief-stats>div').count()==3 and page.locator('.game-medal').count()==4)
 check('highest medal is named Titanium',page.locator('.game-medal[data-medal=titanium] span').inner_text().lower()=='titanium' and page.locator('.game-medal[data-medal=platinum]').count()==0)
 page.locator('[data-game-action=roadmap]').click()
 check('planning page previews the next three levels',page.locator('.game-roadmap-level').count()==3 and page.locator('.game-roadmap-medals span').count()==12)
 check('planning page keeps each hazard preview to one line of content',page.locator('.game-roadmap-level>p').count()==3)
 load(page,'?game=1&screen=hud')
 check('level intro continues to the responsive HUD',page.locator('#game-root[data-screen="hud"] .game-hud-goal').count()==1)
 page.wait_for_function('getComputedStyle(document.querySelector(".brand")).display==="none" && bubbleUI.inspect().every(point=>point.mode!=="spring-return")')
 check('Survival Run removes the title and spring-return bubble',page.evaluate('getComputedStyle(document.querySelector(".brand")).display==="none" && bubbleUI.inspect().every(point=>point.mode!=="spring-return")'))
 check('HUD prioritises score, velocity history, and goal progress',page.locator('.game-hud-score number-flow,.game-velocity-chart canvas,.game-hud-goal').count()==3)
 check('velocity readout leads with the rate and omits the multiplier',page.evaluate('''() => {
   const row=document.querySelector('.game-velocity-readout');
   return row.firstElementChild.tagName==='STRONG' && row.querySelector('.game-label').textContent==='Pop / s' && !row.querySelector('small');
 }'''))
 check('upgrade icons have no panel chrome',page.evaluate('''() => {
   const panel=getComputedStyle(document.querySelector('.game-upgrade-panel'));
   return panel.borderTopWidth==='0px' && (panel.backgroundColor==='rgba(0, 0, 0, 0)' || panel.backgroundColor==='transparent');
 }'''))
 page.locator('.game-upgrade-panel').click()
 page.wait_for_function('document.querySelector(".game-hud-build").dataset.open==="true"')
 page.mouse.click(180,420)
 page.wait_for_function('document.querySelector(".game-hud-build").dataset.open!=="true"')
 page.locator('.game-upgrade-panel').click()
 page.locator('.game-upgrade-panel').click()
 check('upgrade explanation closes from an empty tap and a second tap',page.evaluate('document.querySelector(".game-hud-build").dataset.open!=="true"'))
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
 check('danger state uses neon-red countdown and a responsive 4px viewport border',page.evaluate('''() => {
   const hud=document.querySelector('.game-hud'),timer=document.querySelector('.game-hud-timer');
   const border=getComputedStyle(hud,'::before'),timerStyle=getComputedStyle(timer);
   return timerStyle.color==='rgb(255, 23, 68)' && border.borderTopWidth==='4px' && border.borderTopColor==='rgb(255, 23, 68)' && border.position==='fixed';
 }'''))
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
 check('win result includes a run ledger, statistics, and new run',page.locator('.game-level-breakdown li').count()==5 and page.locator('.game-run-stats>div').count()==6 and page.locator('[data-game-action=retry]').inner_text()=='New Run')
 check('game ending offers Endless Mode',page.locator('[data-game-action=free]').inner_text()=='Endless Mode')
 load(page,'?game=1&screen=run-lost')
 check('loss result remains useful before retry',page.locator('.game-result-grid').is_visible() and 'reached level' in page.locator('.game-eyebrow').inner_text().lower())

 load(page,'?game=1&tuning=show')
 check('tuning drawer is gated by the exact development route',page.locator('#tuning-drawer').count()==1)
 check('tuning drawer reserves calibration diagnostics',page.locator('[data-calibration-diagnostics]').inner_text()=='No Level 2 sample yet.')
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
 load(page)
 page.locator('#game-open').click()
 page.locator('[data-game-action=survival]').click()
 check('level 1 intro uses the configured workload','2 × M' in page.locator('.game-brief-stats').inner_text() and page.locator('.game-medal').count()==4)
 check('level 1 intro exposes the next-three planning page',page.locator('[data-level-action=preview]').is_visible())
 page.locator('[data-level-action=play]').click()
 page.wait_for_function('bubbleUI.settings.bubbleSize===64 && bubbleUI.refreshLocked===true')
 check('level 1 plays on M sheets without a timer',page.locator('.game-hud-timer').count()==0 and page.locator('.game-onboarding').is_visible())
 check('survival hides key labels',page.locator('.keyboard-hints kbd').count()==0)
 check('live survival HUD restores the overflow menu',page.locator('.game-overflow summary').is_visible())
 page.locator('.game-overflow summary').click()
 menu_labels=' '.join(page.locator('.game-overflow-menu button').all_inner_texts())
 check('live overflow restores refresh and mute and keeps playtest controls inside it','Refresh sheet' in menu_labels and 'Mute' in menu_labels and 'Tuning panel' in menu_labels and 'Retry level' in menu_labels and 'Mark level won' in menu_labels)
 page.locator('[data-game-action=tuning]').click()
 check('live overflow opens the tuning sidebar',page.locator('#tuning-drawer').count()==1)
 page.locator('[data-tuning-action=close]').click()
 page.locator('.game-overflow summary').click()
 page.locator('[data-game-action=mute]').click()
 check('live overflow mute toggles the hidden sound control',page.evaluate('document.getElementById("sound").dataset.muted==="true"'))
 page.locator('.game-overflow summary').click()
 page.locator('[data-game-action=mute]').click()
 check('live overflow unmute restores sound',page.evaluate('document.getElementById("sound").dataset.muted==="false"'))
 point=page.evaluate('bubbleUI.inspect().find(p=>p.mode==="poppable"&&p.eligible&&!p.popped&&p.y>180)')
 page.mouse.click(point['x'],point['y'])
 page.wait_for_function('document.querySelector("[data-live=score]")?.getAttribute("aria-label")==="$10"')
 page.wait_for_function('document.querySelector("[data-live=rate]")?.getAttribute("aria-label")==="1"')
 check('the first manual pop scores the base value',page.locator('[data-live=score]').get_attribute('aria-label')=='$10')
 check('pop rate rounds up to a whole number',page.locator('[data-live=rate]').get_attribute('aria-label')=='1')
 popped=page.evaluate('bubbleUI.getStats().popped')
 page.keyboard.press('Space')
 page.wait_for_timeout(200)
 check('level 1 ignores a refresh while the sheet is in play',page.evaluate('bubbleUI.getStats().popped')==popped)
 page.locator('.game-overflow summary').click()
 page.locator('[data-game-action=refresh]').click()
 page.wait_for_function('!bubbleUI.refreshing && bubbleUI.getStats().popped===0',timeout=8000)
 check('live overflow refresh replaces the sheet while play continues',page.evaluate('bubbleUI.getStats().popped===0 && bubbleUI.refreshLocked===true'))
 page.evaluate('''() => {
   const left=bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped);
   left.slice(0,-3).forEach(b=>bubbleUI.popForGame(b.index,{type:'manual',input:'mouse',gestureId:'stragglers'}));
 }''')
 page.wait_for_function('bubbleUI.inspectBubbleReminder().active',timeout=5000)
 page.wait_for_function('bubbleUI.inspectBubbleReminder().bounce>0.1',timeout=2000)
 check('one of the final three idle bubbles bounces without an exposure grade',page.evaluate('bubbleUI.inspectBubbleReminder().active && bubbleUI.inspectBubbleReminder().bounce>0.1 && bubbleUI.inspectBubbleReminder().exposure===0'))
 page.evaluate('''() => {
   const left=bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped);
   left.slice(0,-1).forEach(b=>bubbleUI.popForGame(b.index,{type:'manual',input:'mouse',gestureId:'bulk'}));
   const last=bubbleUI.getGameBubbles().find(b=>b.eligible&&!b.popped);
   bubbleUI.popForGame(last.index,{type:'manual',input:'mouse',gestureId:'last'});
   window.slideStartedImmediately=bubbleUI.refreshing;
 }''')
 check('the last pop settles before the sheet slides',page.evaluate('window.slideStartedImmediately===false'))
 page.wait_for_function('''() => {
   const root=document.querySelector('#game-root');
   if(root&&root.dataset.screen==='run-won') return true;
   if(!bubbleUI.refreshing) bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped).forEach(b=>bubbleUI.popForGame(b.index,{type:'manual',input:'mouse',gestureId:'finish'}));
   return false;
 }''',timeout=15000)
 check('level result attributes its score progressively',page.locator('.game-score-calculation>div').count()>=3 and page.locator('.game-medal[data-passed=true]').count()>=1)
 check('level result keeps the velocity trace as decoration',page.locator('.game-result-velocity canvas').count()==1)
 check('level result shows clear time and next medal guidance','clear time' in page.locator('.game-result-hero').inner_text().lower() and ('needs' in page.locator('.game-medal-gap').inner_text().lower() or 'secured' in page.locator('.game-medal-gap').inner_text().lower()))
 page.locator('[data-level-action=continue]').click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="level-intro" && document.querySelector(".game-eyebrow")?.textContent.includes("Level 2")')
 check('level 2 brief shows five M sheets and a soft target','5 × M' in page.locator('.game-brief-stats').inner_text() and 'time target' in page.locator('.game-brief-stats').inner_text().lower())
 page.locator('[data-level-action=play]').click()
 page.wait_for_function('bubbleUI.settings.bubbleSize===64 && bubbleUI.refreshLocked===true && document.querySelector(".game-hud-timer")')
 check('level 2 soft timer is visible without a danger state',page.locator('.game-hud-timer').is_visible() and page.locator('.game-hud').get_attribute('data-danger')=='false')
 page.wait_for_function('''() => {
   const root=document.querySelector('#game-root');
   if(root?.dataset.screen==='run-won'&&root.querySelector('.game-eyebrow')?.textContent.includes('Level 2')) return true;
   if(root?.dataset.screen==='hud'&&!bubbleUI.refreshing) bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped).forEach(b=>bubbleUI.popForGame(b.index,{type:'manual',input:'mouse',gestureId:'tempo'}));
   return false;
 }''',timeout=30000)
 check('level 2 result settles time bonus and calibration',page.locator('.game-score-calculation').inner_text().find('Remaining-time bonus')>=0 and 'Calibrated pace' in page.locator('.game-result-note').inner_text())
 page.locator('[data-level-action=shop]').click()
 check('level 2 opens a live two-offer shop',page.locator('#game-root[data-screen="shop"] .game-offer').count()==2)
 buy_button=page.locator('[data-shop-buy]:not([disabled])').first
 bought_upgrade=buy_button.get_attribute('data-shop-buy')
 buy_button.click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="level-intro" && document.querySelector(".game-eyebrow")?.textContent.includes("Level 3")')
 check('level 3 brief uses five L sheets and a calibrated deadline','5 × L' in page.locator('.game-brief-stats').inner_text() and 'deadline' in page.locator('.game-brief-stats').inner_text().lower())
 deadline=page.locator('.game-brief-stats div',has_text='Deadline').locator('strong').inner_text().strip()
 deadline_parts=[int(part) for part in deadline.split(':')]
 deadline_seconds=deadline_parts[0]*60+deadline_parts[1]
 check('level 3 countdown adds 25 seconds past the 16-28 second clamp',41<=deadline_seconds<=53)
 page.locator('[data-level-action=play]').click()
 page.wait_for_function('bubbleUI.settings.bubbleSize===82 && bubbleUI.refreshLocked===true')
 check('level 3 starts with a hard timer on L bubbles before its final-10-second danger state',page.locator('.game-hud-timer .game-label').inner_text().lower()=='time left' and page.locator('.game-hud').get_attribute('data-danger')=='false')
 check('the purchased upgrade appears in the live build HUD',page.locator(f'.game-upgrade[data-upgrade="{bought_upgrade}"]').count()==1)
 page.evaluate('''() => {
   const selected=bubbleUI.getGameBubbles().find(b=>b.eligible&&!b.popped);
   bubbleUI.popForGame(selected.index,{type:'manual',input:'mouse',gestureId:'upgrade-smoke'});
 }''')
 page.wait_for_function('bubbleUI.getStats().popped>=1')
 check('the expanded upgrade pool keeps manual play responsive',page.evaluate('bubbleUI.getStats().popped>=1'))
 page.wait_for_function('''() => {
   const root=document.querySelector('#game-root');
   if(root?.dataset.screen==='run-won'&&root.querySelector('.game-eyebrow')?.textContent.includes('Level 3')) return true;
   if(root?.dataset.screen==='hud'&&!bubbleUI.refreshing) bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped).forEach(b=>bubbleUI.popForGame(b.index,{type:'manual',input:'mouse',gestureId:'pressure'}));
   return false;
 }''',timeout=30000)
 page.locator('[data-level-action=shop]').click()
 check('level 3 completion opens the second live shop',page.locator('#game-root[data-screen="shop"] .game-offer').count()==2)
 page.locator('[data-shop-action=skip]').click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="level-intro" && document.querySelector(".game-eyebrow")?.textContent.includes("Level 4")')
 hazard_text=page.locator('.game-lede').inner_text()
 check('level 4 announces one of four seeded hazards',any(name in hazard_text for name in ('Double Layer','Memory Foam','Hardened Bubbles','Drunken Bob')) and 'adjusted deadline' in hazard_text)
 page.locator('[data-level-action=play]').click()
 page.wait_for_function('bubbleUI.settings.bubbleSize===64 && document.querySelector(".game-hud-hazard")')
 check('level 4 uses three M sheets with a hazard-adjusted hard deadline',page.locator('.game-hud-goal strong number-flow').evaluate_all('nodes=>nodes.map(node=>node.getAttribute("aria-label"))')==['1','3'] and page.locator('.game-hud-timer').is_visible())
 if 'Double Layer' in hazard_text:
  layered=page.evaluate('bubbleUI.getGameBubbles().find(b=>b.eligible&&!b.popped&&b.layers===2)')
  before=page.locator('[data-live=score]').get_attribute('aria-label')
  page.evaluate('(index)=>bubbleUI.popForGame(index,{type:"manual",input:"mouse",gestureId:"layer-one"})',layered['index'])
  check('Double Layer first hit cracks without popping or scoring',page.evaluate('(index)=>{const b=bubbleUI.getGameBubbles().find(item=>item.index===index);return b.layers===1&&!b.popped}',layered['index']) and page.locator('[data-live=score]').get_attribute('aria-label')==before)
  page.evaluate('(index)=>bubbleUI.popForGame(index,{type:"manual",input:"mouse",gestureId:"layer-two"})',layered['index'])
  page.wait_for_function('(index)=>bubbleUI.getGameBubbles().find(item=>item.index===index)?.popped',arg=layered['index'])
  check('Double Layer second hit pops normally',page.locator('[data-live=score]').get_attribute('aria-label')!=before)
 elif 'Memory Foam' in hazard_text:
  target=page.evaluate('bubbleUI.getGameBubbles().find(b=>b.eligible&&!b.popped)')
  page.evaluate('(index)=>bubbleUI.popForGame(index,{type:"manual",input:"mouse",gestureId:"foam-first"})',target['index'])
  popped_indices=page.evaluate('bubbleUI.getGameBubbles().filter(b=>b.popped).map(b=>b.index)')
  page.wait_for_function('(indices)=>indices.some(index=>!bubbleUI.getGameBubbles().find(b=>b.index===index)?.popped)',arg=popped_indices,timeout=6000)
  reinflated=page.evaluate('(indices)=>indices.find(index=>!bubbleUI.getGameBubbles().find(b=>b.index===index)?.popped)',popped_indices)
  before_value=float(page.locator('[data-live=score]').get_attribute('aria-label').replace('$','').replace(',',''))
  page.evaluate('(index)=>bubbleUI.popForGame(index,{type:"manual",input:"mouse",gestureId:"foam-repeat"})',reinflated)
  page.wait_for_timeout(100)
  after_value=float(page.locator('[data-live=score]').get_attribute('aria-label').replace('$','').replace(',',''))
  check('Memory Foam warns, reinflates, and blocks repeat base score',after_value-before_value<=2)
 elif 'Hardened Bubbles' in hazard_text:
  hardened=page.evaluate('bubbleUI.getGameBubbles().find(b=>b.eligible&&!b.popped&&b.hardened)')
  before_value=float(page.locator('[data-live=score]').get_attribute('aria-label').replace('$','').replace(',',''))
  page.evaluate('(index)=>bubbleUI.popForGame(index,{type:"manual",input:"keyboard",gestureId:"key:KeyA"})',hardened['index'])
  page.wait_for_timeout(300)
  check('Hardened Bubble short holds show progress without popping',page.evaluate('(index)=>{const b=bubbleUI.getGameBubbles().find(item=>item.index===index);return b.holdProgress>0&&!b.popped}',hardened['index']))
  page.wait_for_function('(index)=>bubbleUI.getGameBubbles().find(item=>item.index===index)?.popped',arg=hardened['index'],timeout=2500)
  after_value=float(page.locator('[data-live=score]').get_attribute('aria-label').replace('$','').replace(',',''))
  check('Hardened Bubble full holds pop for the configured base score',after_value-before_value==30)
 else:
  source=page.evaluate('bubbleUI.getGameBubbles().find(b=>b.eligible&&!b.popped)')
  before_popped=page.evaluate('bubbleUI.getStats().popped')
  page.evaluate('(index)=>bubbleUI.popForGame(index,{type:"manual",input:"mouse",gestureId:"bob-roll"})',source['index'])
  page.wait_for_function('(count)=>bubbleUI.getStats().popped>count',arg=before_popped)
  check('Drunken Bob redirects a valid input with visible hazard feedback','target' in page.locator('.game-hud-hazard').inner_text().lower())
 page.locator('.game-overflow summary').click()
 page.locator('[data-game-action=win]').click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="run-won"',timeout=5000)
 check('playtest skip marks level 4 won without saving a local record','Playtest skip' in page.locator('.game-result-note').inner_text() and 'not updated' in page.locator('.game-result-note').inner_text().lower())
 page.locator('[data-level-action=shop]').click()
 check('level 4 completion opens the third live shop',page.locator('#game-root[data-screen="shop"] .game-offer').count()==2)
 page.locator('[data-shop-action=skip]').click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="level-intro" && document.querySelector(".game-eyebrow")?.textContent.includes("Level 5")')
 check('level 5 brief announces the moving M belt and 45-second duration','Moving M belt' in page.locator('.game-brief-stats').inner_text() and '0:45' in page.locator('.game-brief-stats').inner_text())
 page.locator('[data-level-action=play]').click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="hud" && document.querySelector(".game-hud-goal small")?.textContent==="bubbles popped"')
 page.wait_for_function('''() => {
  const root=document.querySelector('#game-root');
  if(root?.dataset.screen==='run-won') return true;
  for(const bubble of bubbleUI.getGameBubbles().filter(b=>b.eligible&&!b.popped))bubbleUI.popForGame(bubble.index,{type:'manual',input:'mouse',gestureId:`conveyor-${performance.now()}-${bubble.index}`});
  return false;
 }''',timeout=75000)
 check('level 5 conveyor reaches a completed run at or above target','Survival Run complete' in page.locator('#conveyor-result-heading').inner_text() and float(page.locator('.game-result-hero strong').first.inner_text().replace('%',''))>=90)
 check('completed conveyor reports spawned, popped, missed, insurance, and score rows',page.locator('.game-score-calculation>div').count()>=7)
 page.locator('[data-level-action=retry]').click()
 page.wait_for_function('document.querySelector("#game-root")?.dataset.screen==="level-intro" && document.querySelector(".game-eyebrow")?.textContent.includes("Level 1")')
 page.locator('[data-level-action=play]').click()
 page.wait_for_function('bubbleUI.getStats().popped===0 && bubbleUI.refreshLocked===true')
 check('new run after the conveyor resets to a fresh level 1 sheet',page.evaluate('bubbleUI.getStats().popped===0 && bubbleUI.settings.bubbleSize===64'))
 check('fixture UI produces no JavaScript page errors',not errors)
 browser.close()

print(f'{passes} game UI assertions passed.')
