"""Real Web Audio / WebGL checks using GENERATED test recordings, not user SFX."""
import os,json,math,struct,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
os.environ.pop('DISPLAY',None)
R=Path(__file__).resolve().parents[1];E=R/'evidence';F=R/'tests/fixtures';results=[]
def check(name,value):
 results.append({'test':name,'passed':bool(value)});(E/'audio-browser-results.json').write_text(json.dumps(results,indent=2));print(('PASS ' if value else 'FAIL ')+name,flush=True);assert value,name
def wav(name,lead,body,tail,freq,refill=False):
 rate=24000;x=[0.0]*round(lead*rate)
 for i in range(round(body*rate)):
  t=i/rate
  if refill:v=.5*math.sin(2*math.pi*(freq*t+450*t*t))*min(1,t/.015)*min(1,(body-t)/.03)
  else:v=.7*math.sin(2*math.pi*freq*t)*math.exp(-45*t)
  x.append(v)
 x.extend([0.0]*round(tail*rate));p=F/name
 with wave.open(str(p),'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(b''.join(struct.pack('<h',round(v*32767)) for v in x))
 return p
pops=[wav('generated-pop-'+str(i)+'.wav',.12+i*.08,.12,.25,320+i*260) for i in range(3)]
refill=wav('generated-refill-padded.wav',.22,1.2,.3,200,True)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
 c=b.new_context(viewport={'width':680,'height':620},device_scale_factor=1,accept_downloads=True);p=c.new_page();p.set_default_timeout(12000);errors=[];p.on('pageerror',lambda e:errors.append(str(e)))
 p.goto('about:blank?panel=show');p.set_content((R/'index.html').read_text(),wait_until='load');p.wait_for_function('window.bubbleUI&&bubbleUI.atlasReady===1')
 check('requested sound credit appears in the bottom sidebar footer','Sound effects by Anthousai on Freesound under CC0.' in p.locator('.panel-footer').inner_text())
 check('creator and CC0 links use official destinations',p.locator('#sound-credit a').nth(0).get_attribute('href')=='https://freesound.org/people/Anthousai/' and p.locator('#sound-credit a').nth(2).get_attribute('href')=='https://creativecommons.org/publicdomain/zero/1.0/')
 check('credit does not misrepresent the procedural fallback as a loaded recording','not loaded' in p.locator('#sound-credit-status').inner_text())
 p.locator('#control-search').fill('volume');p.locator('#audio-files').set_input_files([str(x) for x in pops]);p.wait_for_function('bubbleUI.audio.sampleReport.pops.length===3')
 report=p.evaluate('bubbleUI.audio.sampleReport');(E/'generated-audio-analysis.json').write_text(json.dumps(report,indent=2))
 check('all three sample files are analyzed before playback',len(report['pops'])==3 and all(x['originalSeconds']>.4 for x in report['pops']))
 check('leading and trailing silence are removed from every pop',all(x['trimmedStartMs']>110 and x['trimmedEndMs']>150 for x in report['pops']))
 check('sample attacks stay within a few milliseconds of start',p.evaluate('bubbleUI.audio.imported.every(b=>{const a=b.getChannelData(0);return a.findIndex(v=>Math.abs(v)>.04)/b.sampleRate<.005})'))
 check('processed outputs retain distinct tones and stay below clipping',all(x['processedSeconds']<.2 and x['outputPeakDbFS']<-3 for x in report['pops']))
 check('analysis rows expose cleaned WAV download actions',p.locator('#sample-analysis button').count()==3)
 with p.expect_download() as d:p.locator('#audio-analysis-export').click()
 download=d.value;download.save_as(str(E/'exported-audio-analysis.json'))
 check('exported analysis contains real trim/gain measurements',len(json.loads((E/'exported-audio-analysis.json').read_text())['pops'])==3)
 with p.expect_download() as d:p.locator('#sample-analysis button').first.click()
 d.value.save_as(str(E/'generated-pop-cleaned.wav'))
 with wave.open(str(E/'generated-pop-cleaned.wav'),'rb') as w:check('cleaned WAV export is valid and trimmed',w.getnframes()/w.getframerate()<.2 and w.getsampwidth()==2)
 p.locator('#audio-test').click();p.wait_for_function('bubbleUI.audio.state==="running"');p.wait_for_timeout(200)
 runs=p.evaluate('''async()=>{const result=[];for(let i=0;i<12;i++){bubbleUI.audio.pop(false);result.push({...bubbleUI.audio.lastSample});await new Promise(r=>setTimeout(r,60));}return result;}''')
 check('shuffle bag never repeats the same file on consecutive pops',all(a['index']!=b['index'] for a,b in zip(runs,runs[1:])))
 check('random pitch, level and tone are actually applied at playback',len({round(x['rate'],4) for x in runs})>3 and all(.73<=x['rate']<=1.27 and .94<=x['gain']<=1.06 and -.8<=x['toneDb']<=.8 for x in runs))
 p.wait_for_timeout(350);check('completed pop voices clean up their playback resources',p.evaluate('bubbleUI.audio.voices===0'))
 p.locator('#audio-files').set_input_files({'name':'invalid.wav','mimeType':'audio/wav','buffer':b'not audio'});p.wait_for_function('document.getElementById("audio-source").textContent.includes("Error")')
 check('failed replacement preserves the previous usable sample bank',p.evaluate('bubbleUI.audio.sampleReport.pops.length===3'))
 p.locator('#audio-refill-file').set_input_files(str(refill));p.wait_for_function('bubbleUI.audio.sampleReport.refill!==null');r=p.evaluate('bubbleUI.audio.sampleReport.refill');(E/'generated-refill-analysis.json').write_text(json.dumps(r,indent=2))
 check('refill silence is trimmed independently of the pop bank',r['trimmedStartMs']>200 and r['trimmedEndMs']>200 and p.evaluate('bubbleUI.audio.sampleReport.pops.length===3'))
 check('refill duration comes from cleaned PCM, not the file including silence',1.19<r['processedSeconds']<1.27 and r['originalSeconds']>1.7)
 p.locator('#audio-refill-test').click();v=p.evaluate('({voice:bubbleUI.audio.refillVoice.duration,plan:bubbleUI.audio.lastRefillPlan})')
 check('full refill audition plays the complete processed duration',abs(v['voice']-r['processedSeconds'])<.001 and v['plan']['offset']==0)
 p.wait_for_timeout(1400);p.locator('#settings-close').click();p.wait_for_timeout(200)
 p.evaluate('''()=>{const a=bubbleUI.audio,create=a.context.createBufferSource.bind(a.context);window.refillSourceCalls=[];a.context.createBufferSource=()=>{const n=create(),start=n.start.bind(n);n.start=(...args)=>{refillSourceCalls.push({args,rate:n.playbackRate.value,duration:n.buffer?.duration});return start(...args)};return n};bubbleUI.setMuted(true);bubbleUI.inspect().forEach(q=>{if(q.mode==='poppable'&&q.eligible)bubbleUI.physics.pop(q.index)});}''')
 p.wait_for_timeout(500);total=p.evaluate('bubbleUI.getStats().total');p.evaluate('bubbleUI.setMuted(false)');p.locator('#sheet').focus();p.keyboard.press('Space')
 full=p.evaluate('bubbleUI.audio.lastRefillPlan');check('full-sheet Space reset plans the entire trimmed clip',full['popped']==total and full['total']==total and abs(full['duration']-r['processedSeconds'])<.001 and full['offset']==0)
 call=p.evaluate('refillSourceCalls.at(-1)');check('refill source is scheduled at original pitch and full content length',call['rate']==1 and abs(call['args'][2]-r['processedSeconds'])<.001 and call['args'][1]==0)
 p.wait_for_timeout(math.ceil(full['duration']*1000)+150)
 check('full timed refill has completed visually at its shared endpoint',p.evaluate('bubbleUI.inspect().filter(q=>q.mode==="poppable"&&q.eligible).every(q=>Math.abs(q.squish)<.001)'))
 p.keyboard.press('KeyQ');p.wait_for_timeout(180);check('one key still pops exactly one bubble',p.evaluate('bubbleUI.getStats().popped===1'))
 before=p.evaluate('[bubbleUI.settings.edgeSeed,bubbleUI.settings.variantSeed]');p.keyboard.press('Space');short=p.evaluate('bubbleUI.audio.lastRefillPlan');after=p.evaluate('[bubbleUI.settings.edgeSeed,bubbleUI.settings.variantSeed]')
 check('one popped bubble gets a short refill excerpt',abs(short['duration']-.18)<.001 and short['offset']>0 and short['popped']==1)
 call=p.evaluate('refillSourceCalls.at(-1)');check('short excerpt uses source offset and duration rather than speeding up the whole sound',call['rate']==1 and abs(call['args'][1]-short['offset'])<.001 and abs(call['args'][2]-.18)<.001)
 p.wait_for_timeout(250);check('single-bubble wave ends with the short cue',p.evaluate('bubbleUI.inspect().filter(q=>q.mode==="poppable"&&q.eligible).every(q=>Math.abs(q.squish)<.001)'))
 check('adaptive refill still rolls all seeds',before[0]!=after[0] and before[1]%320!=after[1]%320)
 p.keyboard.press('KeyW');p.wait_for_timeout(150);p.evaluate('bubbleUI.setMuted(true)');p.keyboard.press('Space');p.wait_for_timeout(300)
 check('mute suppresses refill audio without blocking the timed animation',p.evaluate('bubbleUI.audio.refillVoice===null&&bubbleUI.getStats().popped===0&&bubbleUI.inspect().filter(q=>q.mode==="poppable"&&q.eligible).every(q=>Math.abs(q.squish)<.001)'))
 check('no runtime errors in sampled audio and reset synchronization',not errors)
 # Capture the delivered default state, not the generated test samples.
 p.reload();p.set_content((R/'index.html').read_text(),wait_until='load');p.wait_for_function('bubbleUI.atlasReady===1');p.locator('#control-search').fill('volume');p.wait_for_timeout(100);p.screenshot(path=str(E/'audio-controls-credit.png'))
 p.set_viewport_size({'width':390,'height':844});p.wait_for_timeout(150);p.screenshot(path=str(E/'audio-controls-mobile.png'))
 check('mobile sidebar footer and controls fit horizontally',p.evaluate('document.documentElement.scrollWidth===innerWidth&&document.getElementById("sound-credit").getBoundingClientRect().right<=innerWidth'))
 c.close();b.close()
print(json.dumps({'passed':len(results),'total':len(results)}),flush=True)
