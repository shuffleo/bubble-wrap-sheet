"""Contour-contained atlas. No sample may read beyond its reviewed source ellipse.
Coordinates use a 1000x1000 normalized reference, never a guessed global grid.
Run: python scripts/build_atlas.py [path/to/source.jpg]
"""
from pathlib import Path
import json, base64, hashlib, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import map_coordinates, gaussian_filter
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'assets/source-reference.jpg'
TILE,COLS,ROWS,COUNT,EXTENT=128,20,16,320,1.30
# Individually reviewed centres and conservative ellipse radii in reference pixels.
# They intentionally omit foreshortened border bubbles and ambiguous overlaps.
PATCHES=[
(375,124,27,26),(450,128,29,28),(522,131,29,29),(596,132,28,29),(666,132,27,29),(736,134,26,29),
(259,198,29,32),(333,199,30,31),(410,198,31,32),(486,200,31,33),(565,200,31,33),(638,201,30,33),(709,201,29,32),
(211,279,28,30),(288,277,31,31),(366,277,31,33),(447,278,32,33),(526,278,32,34),(606,277,29,34),(681,277,30,33),(759,279,30,32),
(250,357,29,32),(328,355,30,32),(411,354,30,33),(489,354,31,33),(569,355,30,34),(648,356,29,34),(728,357,29,33),
(286,442,29,33),(367,439,30,34),(448,440,31,34),(529,440,31,34),(610,438,29,34),(691,440,29,34),(770,437,28,33),
(248,518,30,34),(329,518,30,34),(409,517,30,34),(487,519,29,34),(570,519,30,34),(650,518,29,34),(730,519,29,33),
(249,601,30,30),(328,602,30,32),(408,600,29,33),(489,600,29,34),(571,597,29,33),(650,599,28,34),
(290,681,29,32),(369,680,29,32),(450,679,29,33),(529,681,28,32),(609,678,28,32),(684,681,27,32),
(268,753,26,29),(340,756,27,30),(414,756,27,31),(488,754,27,31),(566,757,26,30),(640,757,26,31),
(311,833,26,28),(384,831,26,29),(456,833,27,29),(528,832,27,28)]
# Footprints include the photographed seal, but not the neighboring dome.
PATCHES=[(cx,cy,round(rx*1.14,2),round(ry*1.09,2)) for cx,cy,rx,ry in PATCHES]
source=Image.open(SOURCE).convert('L');src=np.asarray(source,dtype=float)/255
Y,X=np.mgrid[-EXTENT:EXTENT:complex(TILE),-EXTENT:EXTENT:complex(TILE)]
R=np.hypot(X,Y);TH=np.arctan2(Y,X)
def smooth(a,b,x):
 t=np.clip((x-a)/(b-a),0,1);return t*t*(3-2*t)
inner=1-smooth(.72,1.,R)
max_source_r=0.
def sample_source(index,x,y):
 global max_source_r
 cx,cy,rx,ry=PATCHES[index]
 # Radially contain every UV, including variant deformation and guard texels.
 # The outer film continues inward along the seal instead of reading a neighbor.
 rr=np.hypot(x,y);safe=np.where(rr>1., .995-np.minimum(rr-1.,.4)*.18,rr)
 scale=safe/np.maximum(rr,1e-8);sx=x*scale;sy=y*scale
 max_source_r=max(max_source_r,float(np.max(np.hypot(sx,sy))))
 return map_coordinates(src,[(cy+sy*ry)*source.height/1000,(cx+sx*rx)*source.width/1000],order=1,mode='nearest')
def field(rng,sigma=9):
 f=gaussian_filter(rng.normal(size=(TILE,TILE)),sigma);return f/(np.std(f)+1e-8)
def make(i):
 rng=np.random.default_rng(12781+i*6967);index=i%len(PATCHES)
 # Small interior-only deformation; no global quarter-turn of baked lighting.
 angle=rng.uniform(-.045,.045);ca,sa=np.cos(angle),np.sin(angle)
 qx=X+((X*ca-Y*sa)-X)*inner+field(rng)*.014*inner
 qy=Y+((X*sa+Y*ca)-Y)*inner+field(rng)*.014*inner
 inflated=sample_source(index,qx,qy)
 inflated=(inflated-.45)*rng.uniform(.97,1.045)+.45+rng.uniform(-.01,.01)*inner
 # Extend the seal into textured connecting film without a flat gray annulus.
 outer=smooth(.98,1.30,R)
 inflated*=1-outer*.16
 flat_src=sample_source((i*17+7)%len(PATCHES),X,Y)
 residual=flat_src-gaussian_filter(flat_src,4.2)
 height=field(rng,8)*.004
 count=[3,5,7,4,6,8,4,5,7,9][i%10]
 main=rng.uniform(0,6.28)
 for j in range(count):
  angle=main+rng.uniform(-1.4,1.4);c,s=np.cos(angle),np.sin(angle)
  u=X*c+Y*s;v=-X*s+Y*c
  offset=rng.uniform(-.55,.55)
  ridge=np.exp(-.5*((v-offset+.055*np.sin(u*4+rng.uniform(0,6.28)))/rng.uniform(.028,.065))**2)
  height+=ridge*np.exp(-(u/rng.uniform(.5,1.0))**4)*rng.uniform(.015,.04)*rng.choice([-1,1])
 height*=1-smooth(.75,1.03,R)
 gy,gx=np.gradient(height,2*EXTENT/(TILE-1))
 N=np.dstack((-gx,-gy,np.ones_like(X)));N/=np.linalg.norm(N,axis=2,keepdims=True)
 L=np.array([-.32,-.48,1.]);L/=np.linalg.norm(L)
 spec=np.maximum(0,np.sum(N*L,axis=2))**26
 # Broad dome lighting is intentionally removed, not just darkened.
 flat=.32+rng.uniform(-.022,.022)+(spec-.14)*.55+residual*.90+field(rng,3)*.007
 mask=1-smooth(.84,1.03,R)
 popped=inflated*(1-mask)+np.clip(flat,.07,.92)*mask
 return np.clip(inflated,0,1),np.clip(popped,0,1)
assets=ROOT/'assets';evidence=ROOT/'evidence';assets.mkdir(exist_ok=True);evidence.mkdir(exist_ok=True)
atlases=[Image.new('L',(COLS*TILE,ROWS*TILE)) for _ in range(2)];hashes=[set(),set()]
for i in range(COUNT):
 for k,a in enumerate(make(i)):
  im=Image.fromarray(np.uint8(a*255));atlases[k].paste(im,((i%COLS)*TILE,(i//COLS)*TILE));hashes[k].add(hashlib.sha256(im.tobytes()).hexdigest())
urls=[]
for k,state in enumerate(['inflated','collapsed']):
 path=assets/f'material-{state}-320.jpg';atlases[k].save(path,quality=94,optimize=True)
 urls.append('data:image/jpeg;base64,'+base64.b64encode(path.read_bytes()).decode())
 contact=Image.new('RGB',(8*160,4*180),(15,15,15));d=ImageDraw.Draw(contact)
 for j in range(32):
  idx=j*7;tile=atlases[k].crop(((idx%COLS)*128,(idx//COLS)*128,(idx%COLS+1)*128,(idx//COLS+1)*128)).resize((156,156))
  contact.paste(tile,((j%8)*160,(j//8)*180));d.text(((j%8)*160+5,(j//8)*180+160),f'{idx:03d} / source {idx%len(PATCHES):02d}',fill='white')
 contact.save(evidence/f'{state}-variation-samples.jpg',quality=94)
# Auditable source-centre map and isolated source crops, separate from variants.
audit=source.resize((1500,1500)).convert('RGB');d=ImageDraw.Draw(audit)
contact=Image.new('RGB',(8*144,8*164),(14,14,14));cd=ImageDraw.Draw(contact)
for i,(cx,cy,rx,ry) in enumerate(PATCHES):
 d.ellipse(((cx-rx)*1.5,(cy-ry)*1.5,(cx+rx)*1.5,(cy+ry)*1.5),outline=(240,180,40),width=2);d.text((cx*1.5-6,cy*1.5-6),str(i),fill=(255,240,80))
 tile=np.uint8(sample_source(i,X,Y)*255)
 tile=Image.fromarray(tile).convert('RGB').resize((140,140));mask=Image.fromarray(np.uint8(np.clip((1.015-R)/.025,0,1)*255)).resize((140,140));clean=Image.new('RGB',(140,140),(14,14,14));clean.paste(tile,(0,0),mask);contact.paste(clean,((i%8)*144,(i//8)*164));cd.text(((i%8)*144+4,(i//8)*164+143),f'{i:02d}  {cx},{cy}',fill='white')
audit.save(evidence/'crop-contours.jpg',quality=94);contact.save(evidence/'source-crop-review.jpg',quality=95)
manifest={'version':3,'reference_size':list(source.size),'coordinate_space':[1000,1000],'source_membranes':len(PATCHES),'inflated_variants':COUNT,'collapsed_variants':COUNT,'max_normalized_source_radius':max_source_r,'sampling':'radially contained inside individually reviewed ellipses; exterior uses inward seal extension','ai_generated':False,'popped':'derived crushed-film variants, not separate photographs','crops':[{'id':i,'cx':a[0],'cy':a[1],'rx':a[2],'ry':a[3]} for i,a in enumerate(PATCHES)]}
(assets/'crop-manifest.json').write_text(json.dumps(manifest,indent=2));(assets/'variant-manifest.json').write_text(json.dumps({**{k:v for k,v in manifest.items() if k!='crops'},'unique_inflated_cells':len(hashes[0]),'unique_collapsed_cells':len(hashes[1]),'tile_pixels':TILE,'atlas_columns':COLS,'atlas_rows':ROWS},indent=2))
(ROOT/'src/components/bubble-ui/core/bubble-atlas.ts').write_text('/** Contour-contained user-reference atlas. See assets/crop-manifest.json. */\n'+f'export const ATLAS_COLUMNS={COLS};\nexport const ATLAS_ROWS={ROWS};\nexport const ATLAS_VARIANTS={COUNT};\nexport const ATLAS_EXTENT={EXTENT};\n'+f'export const atlasURL="{urls[0]}";\nexport const collapsedAtlasURL="{urls[1]}";\n')
print(json.dumps({'source_bubbles':len(PATCHES),'max_source_radius':max_source_r,'unique':[len(h) for h in hashes]}))

review_urls=[]
for name in ['crop-contours.jpg','source-crop-review.jpg']:
 review_urls.append('data:image/jpeg;base64,'+base64.b64encode((evidence/name).read_bytes()).decode())
(ROOT/'src/components/bubble-ui/core/bubble-audit.ts').write_text('/** Generated alongside the atlas; exact current source footprints. */\n'+f'export const cropMapURL="{review_urls[0]}";\nexport const cropReviewURL="{review_urls[1]}";\n')
