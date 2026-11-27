import {blendGLSL} from './bubble-blend';
/** Reference-assisted 2.5D material. Shared geometry deformation keeps cell joins
 * coherent. Baked reference illumination is NOT physically re-lightable. */
export const vertexShader=`#version 300 es
precision highp float;
layout(location=0) in vec2 aVertex;
layout(location=1) in vec4 aBubble;
layout(location=2) in vec4 aClip;
layout(location=3) in vec4 aStyle;
layout(location=4) in float aSquish;
layout(location=5) in float aBounce;
layout(location=6) in vec3 aNeighbor0;
layout(location=7) in vec3 aNeighbor1;
layout(location=8) in vec3 aNeighbor2;
layout(location=9) in vec3 aNeighbor3;
layout(location=10) in vec3 aNeighbor4;
layout(location=11) in vec3 aNeighbor5;
layout(location=12) in vec4 aEdges;
layout(location=13) in float aReminderExposure;
layout(location=14) in vec4 aHazard;
layout(location=15) in float aSheetRole;
uniform vec4 uSlide;
uniform vec2 uResolution;
uniform vec3 uCorners[4];
uniform vec4 uRipples[8];
uniform vec4 uMotion;
uniform float uPerspective;
uniform float uTime;
uniform float uMotionEnabled;
out vec2 vLocal;
out vec2 vScreen;
out float vHeight;
flat out vec4 vBubble;
flat out vec4 vClip;
flat out vec4 vStyle;
flat out vec4 vEdges;
flat out float vSquish;
flat out float vBounce;
flat out float vReminderExposure;
flat out vec4 vHazard;
flat out vec3 vNeighbors[6];
void main(){
 vec2 screen=aBubble.xy+aVertex*aBubble.w;
 vLocal=aVertex*aBubble.w/aBubble.z;vScreen=screen;
 vNeighbors[0]=aNeighbor0;vNeighbors[1]=aNeighbor1;vNeighbors[2]=aNeighbor2;vNeighbors[3]=aNeighbor3;vNeighbors[4]=aNeighbor4;vNeighbors[5]=aNeighbor5;
 vEdges=aEdges;vBubble=aBubble;vClip=aClip;vStyle=aStyle;vSquish=aSquish;vBounce=aBounce;vReminderExposure=aReminderExposure;vHazard=aHazard;
 vec3 d=vec3(0.);
 if(aEdges.x>=0.&&uMotionEnabled>.5){
  vec2 uv=clamp((screen-aClip.xy)/(aClip.zw-aClip.xy),0.,1.);
  for(int i=0;i<4;i++){float w=pow((i%2==1?uv.x:1.-uv.x)*(i>1?uv.y:1.-uv.y),uMotion.x);d+=uCorners[i]*w;}
  for(int i=0;i<8;i++){float age=uTime-uRipples[i].z;if(age<0.||age>1.65)continue;float q=(distance(screen,uRipples[i].xy)-age*uMotion.z)/uMotion.w;d.z+=exp(-q*q*1.5)*sin(q*2.2)*exp(-age*3.8)*uMotion.y*uRipples[i].w;}
 }
 float interior=1.-smoothstep(.55,1.05,length(vLocal));
 d.z+=aBounce*8.*interior;
 float slideX=0.;
 if(aSheetRole>.5&&uSlide.w>.5){
  float phase=uSlide.x,uvx=clamp((screen.x-aClip.x)/(aClip.z-aClip.x),0.,1.);
  slideX=uSlide.y*(phase-(aSheetRole>1.5?1.:0.));
  float travel=sin(phase*3.14159265);
  // A gentle traveling curl, not rigid card rotation; continuous across tiles.
  d.z+=uSlide.z*travel*sin(uvx*3.14159265)*(aSheetRole>1.5?1.:-.65);
  d.y+=travel*sin(uvx*3.14159265)*2.;
 }
 vec2 center=(aClip.xy+aClip.zw)*.5;
 screen=center+(screen+d.xy-center)*(uPerspective/(uPerspective-d.z));screen.x+=slideX;vHeight=d.z;
 if(aSheetRole<-.5)screen=vec2(-10000.);
 gl_Position=vec4(screen.x/uResolution.x*2.-1.,1.-screen.y/uResolution.y*2.,0.,1.);
}`;
export const fragmentShader=`#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vScreen;
in float vHeight;
flat in vec4 vBubble;
flat in vec4 vClip;
flat in vec4 vStyle;
flat in vec4 vEdges;
flat in float vSquish;
flat in float vBounce;
flat in float vReminderExposure;
flat in vec4 vHazard;
flat in vec3 vNeighbors[6];
uniform sampler2D uNoise;
uniform sampler2D uAtlas;
uniform sampler2D uCollapsedAtlas;
uniform float uAtlasReady;
uniform float uDpr;

uniform vec4 uFilm;
uniform vec4 uTone;
uniform vec4 uGrade;
uniform vec4 uLayer;
// Compression thresholds, easing exponent and linear-light fade flag.
uniform vec4 uReveal;
// Inflated-UV bulge and wrinkle amplitude. Collapsed appearance stays fixed.
uniform vec2 uPressure;
uniform float uGuides;
out vec4 outColor;
${blendGLSL}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return texture(uNoise,(i+f+.5)/256.).r;}
float fbm(vec2 p){return .6*noise(p)+.27*noise(p*2.03+31.)+.13*noise(p*4.07+61.);}
float edgeInset(float t,float seed){float q=t/max(1.,vEdges.y);return vEdges.x*(.5+.25*sin(q+seed)+.15*sin(q*2.37+seed*1.7)+.10*sin(q*5.13+seed*.7));}
float cutDistance(){
 vec2 size=vClip.zw-vClip.xy,px=vScreen-vClip.xy,halfsize=size*.5;
 bool left=px.x<halfsize.x,top=px.y<halfsize.y;float quadrant=(top?0.:2.)+(left?0.:1.);
 float radius=vStyle.y;
 if(vEdges.x>=0.)radius*=1.+vEdges.w*sin(vEdges.z+quadrant*2.7);
 radius=min(max(radius,0.),min(halfsize.x,halfsize.y));
 vec2 inset=vec2(0.);
 if(vEdges.x>=0.)inset=vec2(edgeInset(px.y,vEdges.z+(left?1.:4.)),edgeInset(px.x,vEdges.z+(top?7.:11.)));
 vec2 q=abs(px-halfsize)-(halfsize-radius)+inset;
 return length(max(q,0.))+min(max(q.x,q.y),0.)-radius;
}
vec2 atlasUV(float index,vec2 p){vec2 cell=vec2(mod(index,20.),floor(index/20.));return (cell+clamp(p/2.60+.5,vec2(.015),vec2(.985)))/vec2(20.,16.);}
float sampleAtlas(float index,vec2 p){return texture(uAtlas,atlasUV(index,p)).r;}
float photograph(vec3 data,vec2 p){
 float r=length(p),inner=1.-smoothstep(.70,1.02,r),s=clamp(data.z,-.14,1.),seed=data.x*.031;
 // Deform the intact membrane more visibly while pressure is building.
 // The popped texture keeps the last release's UVs, so idle images do not change.
 vec2 intact=p*uFilm.w*(1.+s*uPressure.x*inner);
 intact+=vec2(sin(intact.y*5.+seed*17.),cos(intact.x*4.7+seed*31.))*s*uPressure.y*inner;
 vec2 collapsedP=p*uFilm.w*(1.+s*.055*inner);
 collapsedP+=vec2(sin(collapsedP.y*5.+seed*17.),cos(collapsedP.x*4.7+seed*31.))*s*.018*inner;
 float photo=sampleAtlas(data.x,intact);
 if(uGrade.w>.001){vec2 e=vec2(.020,0.);float blur=(sampleAtlas(data.x,intact+e)+sampleAtlas(data.x,intact-e)+sampleAtlas(data.x,intact+e.yx)+sampleAtlas(data.x,intact-e.yx))*.25;photo+=(photo-blur)*uGrade.w;}
 float crushed=texture(uCollapsedAtlas,atlasUV(data.y,collapsedP)).r;
 float reveal=pow(smoothstep(uReveal.x,uReveal.y,s),uReveal.z);
 float encoded=mix(photo,crushed,reveal);
 // The uploaded old shader mixed linear values then re-encoded with 1/2.2.
 // Guard endpoints: changing motion settings cannot re-grade resting material.
 if(uReveal.w<.5||reveal<=.000001||reveal>=.999999)return encoded;
 float linear=mix(pow(max(photo,0.),2.2),pow(max(crushed,0.),2.2),reveal);
 return pow(max(linear,0.),1./2.2);
}
float kernel(float r){return 1.-smoothstep(.79,1.20+uFilm.x/max(vBubble.z,12.),r);}
float continuousFilm(vec2 px){
 float coarse=fbm(px*.037),fine=fbm(px*.43);
 float phase=px.x*.087+px.y*.047+coarse*5.8;
 float ridge=exp(-pow(sin(phase)*9.,2.));
 float valley=exp(-pow(sin(phase+.28)*11.,2.));
 float textureValue=.24+(coarse-.5)*.11+(fine-.5)*.08+(ridge*.13-valley*.08)*uFilm.z;
 return mix(textureValue,.41,uFilm.y);
}
void main(){
 float sd=cutDistance();
 // Singleton fidgets retain a circular membrane inside their larger touch target.
 // Without this mask, the surrounding instanced hex film becomes visible on mobile.
 if(vEdges.x<0.)sd=max(sd,(length(vLocal)-1.08)*vBubble.z);
 if(sd>.6)discard;
 float coverage=1.-smoothstep(-.45,.6,sd);
 float r=length(vLocal),inner=1.-smoothstep(.72,1.04,r);
 vec2 p=vLocal*(1.-vBounce*.025*inner);
 float weight=kernel(r),value=photograph(vec3(vStyle.z,vStyle.w,vSquish),p)*weight;
 float pitch=vBubble.w/vBubble.z;
 vec2 offsets[6]=vec2[6](vec2(-1.,0.),vec2(1.,0.),vec2(-.5,-.866025404),vec2(.5,-.866025404),vec2(-.5,.866025404),vec2(.5,.866025404));
 // Compact-support normalized overlap-add: both sides of every boundary use
 // the same images and weights. No constant-gray hexagonal seams.
 for(int i=0;i<6;i++){vec2 q=vLocal-offsets[i]*pitch;float w=kernel(length(q));if(w>.0001){value+=photograph(vNeighbors[i],q)*w;weight+=w;}}
 float film=continuousFilm(vScreen-vClip.xy);
 value=weight>.0001?value/weight:film;
 value=mix(value,film,uFilm.y*smoothstep(.8,1.12,r));
 vec2 local=vLocal*vBubble.z;
 float plane=max(abs(local.x),max(abs(dot(local,vec2(.5,.866025404))),abs(dot(local,vec2(-.5,.866025404)))));
 float ed=vBubble.w*.5-plane;
 // Height-derived flex response accompanies perspective, without pretending to
 // replace baked lighting. Lower amplitude prevents metallic false highlights.
 vec3 N=normalize(vec3(-dFdx(vHeight)*uDpr,-dFdy(vHeight)*uDpr,1.));
 float relief=dot(N,normalize(vec3(-.35,-.55,1.)))-.8377;
 value+=relief*.21+vBounce*.030*inner;
 // Double membranes carry a broad rim; the cracked layer keeps a diagonal
 // fracture mark. Memory Foam warnings pulse the collapsed bubble locally.
 float doubleRim=(1.-smoothstep(.055,.14,abs(r-.82)))*step(1.5,vHazard.x);
 float crack=(1.-smoothstep(.018,.055,abs(vLocal.y-vLocal.x*.58)))*step(.5,vHazard.x)*step(vHazard.x,1.5)*inner;
 float hardenedRim=(1.-smoothstep(.035,.09,abs(r-.69)))*vHazard.z;
 float holdAngle=fract(atan(vLocal.y,vLocal.x)/6.2831853+1.);
 float holdArc=hardenedRim*step(holdAngle,vHazard.w);
 value+=doubleRim*.22-crack*.18+vHazard.y*.32*inner+hardenedRim*.10+holdArc*.38;
 value=mix(film,value,uAtlasReady);
 value=clamp((value-uTone.z)/max(.03,uTone.w-uTone.z),0.,1.);
 value*=exp2(uTone.x+vReminderExposure);value=(value-.5)*uTone.y+.5;
 value=pow(clamp(value,0.,1.),1./uGrade.x);
 value+=smoothstep(.5,1.,value)*(uGrade.y-1.)*.38;
 value+=(noise(vScreen*2.3)-.5)*uGrade.z;
 value=clamp(value,0.,1.);
 float base=clamp(uLayer.z*(1.+(film-.28)*.12),0.,1.);
 value=mix(base,blendLayer(int(uLayer.x),base,value),uLayer.y);
 if(uGuides>.5){float ring=1.-smoothstep(.008,.028,abs(r-1.));float hex=1.-smoothstep(.25,.8,ed);value=mix(value,.95,max(ring,hex)*.8);}
 outColor=vec4(vec3(clamp(value,0.,1.))*coverage,coverage);
}`;
