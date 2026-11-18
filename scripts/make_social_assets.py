#!/usr/bin/env python3
"""Capture the real WebGL membrane for the favicon and sharing assets.
No generated stand-in artwork; the same single-bubble surface is rendered at a
larger size. Requires a built index.html and Playwright Chromium. Fonts are
system dependencies only and are not copied into the repository.
"""
import io, os, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
os.environ.pop('DISPLAY',None)
CONFIG=json.loads((ROOT/'site.config.json').read_text())
ICONS=ROOT/'assets/icons';SOCIAL=ROOT/'assets/social';E=ROOT/'evidence'
for d in [ICONS,SOCIAL,E]:d.mkdir(parents=True,exist_ok=True)
HTML=(ROOT/'index.html').read_text()

def font(size,bold=False):
    paths=[os.environ.get('SOCIAL_FONT_BOLD' if bold else 'SOCIAL_FONT',''),
           f'/usr/share/fonts/truetype/liberation2/LiberationSans-{"Bold" if bold else "Regular"}.ttf',
           f'/usr/share/fonts/truetype/dejavu/DejaVuSans{"-Bold" if bold else ""}.ttf']
    for p in paths:
        if p and Path(p).is_file():return ImageFont.truetype(p,size)
    raise RuntimeError('Install Liberation/DejaVu Sans, or set SOCIAL_FONT and SOCIAL_FONT_BOLD.')

def load(page):
    page.goto('about:blank')
    page.set_content(HTML,wait_until='domcontentloaded')
    page.wait_for_function('window.bubbleUI && bubbleUI.atlasReady===1')
    page.evaluate('bubbleUI.setSettings({variantSeed:505,edgeSeed:50,showHandles:false,showKeyLabels:false,dpr:2})')
    page.wait_for_timeout(150)

with sync_playwright() as pw:
    executable=os.environ.get('CHROMIUM_PATH')
    if not executable and Path('/usr/bin/chromium').exists():executable='/usr/bin/chromium'
    browser=pw.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader','--disable-dev-shm-usage'])
    context=browser.new_context(device_scale_factor=2)
    p=context.new_page();p.set_default_timeout(20000)
    p.set_viewport_size({'width':176,'height':176});load(p)
    p.add_style_tag(content='header,main,footer,.corner-grip{display:none!important}')
    p.evaluate('''()=>{const n=document.createElement('div');n.style.cssText='position:absolute;left:4px;top:4px;width:168px;height:168px';document.body.append(n);bubbleUI.register(n,{layout:'single',mode:'spring-return',bubbleSize:160,gap:6,cornerRadius:84});}''')
    p.wait_for_timeout(200)
    bubble=Image.open(io.BytesIO(p.screenshot())).convert('RGB')
    bubble.save(ICONS/'bubble-master.png')
    icon=bubble.resize((512,512),Image.Resampling.LANCZOS)
    icon.save(ICONS/'icon-512.png',optimize=True)
    for size,name in [(192,'icon-192.png'),(180,'apple-touch-icon.png'),(96,'favicon-96.png'),(48,'favicon-48.png'),(32,'favicon-32.png'),(16,'favicon-16.png')]:
        icon.resize((size,size),Image.Resampling.LANCZOS).save(ICONS/name,optimize=True)
    icon.save(ICONS/'favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
    # Material composition comes directly from the live shader, not a photo
    # background. UI is hidden only in these art-directed social screenshots.
    for square in [False,True]:
        width,height=(1080,1080) if square else (1200,630)
        p.set_viewport_size({'width':width,'height':height});load(p)
        css=('main{inset:370px 48px -90px 48px!important}' if square else 'main{inset:34px -120px -80px 540px!important}')
        p.add_style_tag(content='header,footer,.corner-grip{display:none!important}'+css)
        p.evaluate('bubbleUI.setSettings({bubbleSize:82,cornerRadius:9,edgeRoughness:5.8,filmStrength:.22})')
        p.wait_for_timeout(250)
        capture=Image.open(io.BytesIO(p.screenshot())).convert('RGB')
        capture=capture.resize((width,height),Image.Resampling.LANCZOS)
        draw=ImageDraw.Draw(capture)
        if square:
            capture.paste(icon.resize((70,70),Image.Resampling.LANCZOS),(54,56))
            draw.text((146,54),'bubble wrap',font=font(74),fill=(242,242,242))
            draw.text((56,175),'Click. Tap. Type. Pop.',font=font(36),fill=(213,213,213))
            draw.text((56,236),'An interactive bubble wrap sheet.',font=font(25),fill=(154,154,154))
            draw.text((56,301),'bubblewrapsheet.netlify.app',font=font(19),fill=(132,132,132))
            name='bubble-wrap-square-v8.png'
        else:
            capture.paste(icon.resize((55,55),Image.Resampling.LANCZOS),(60,47))
            draw.text((60,151),'bubble',font=font(96),fill=(242,242,242))
            draw.text((60,242),'wrap',font=font(96),fill=(242,242,242))
            draw.text((64,388),'Click. Tap. Type. Pop.',font=font(28),fill=(220,220,220))
            draw.text((64,438),'An interactive bubble wrap sheet.',font=font(20),fill=(154,154,154))
            draw.text((64,553),'bubblewrapsheet.netlify.app',font=font(16),fill=(133,133,133))
            name='bubble-wrap-social-v8.png'
        capture.save(SOCIAL/name,optimize=True)
        print(name,capture.size,flush=True)
    browser.close()
print('Favicon and social assets captured from the app.',flush=True)
