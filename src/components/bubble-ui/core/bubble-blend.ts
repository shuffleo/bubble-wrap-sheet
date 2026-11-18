/** Selected scalar functions vendored/adapted from jamieowen/glsl-blend (MIT).
 * Copyright (c) 2015 Jamie Owen. See licenses/glsl-blend-MIT.txt.
 * RGB-neutral scalar path; nonseparable color/hue modes are intentionally absent.
 */
export const blendGLSL=`
float blendSoftLight(float base,float blend){return (blend<0.5)?(2.0*base*blend+base*base*(1.0-2.0*blend)):(sqrt(base)*(2.0*blend-1.0)+2.0*base*(1.0-blend));}
float blendDarken(float base,float blend){return min(blend,base);}
float blendOverlay(float base,float blend){return base<0.5?(2.0*base*blend):(1.0-2.0*(1.0-base)*(1.0-blend));}
// Scalar dispatch and remaining separable blend equations.
float blendLayer(int mode,float base,float layer){
 if(mode==1)return blendSoftLight(base,layer);
 if(mode==2)return blendDarken(base,layer);
 if(mode==3)return base*layer;
 if(mode==4)return 1.-(1.-base)*(1.-layer);
 if(mode==5)return blendOverlay(base,layer);
 if(mode==6)return blendOverlay(layer,base);
 if(mode==7)return max(base,layer);
 if(mode==8)return abs(base-layer);
 if(mode==9)return base+layer-2.*base*layer;
 if(mode==10)return layer<=0.?0.:max(1.-(1.-base)/layer,0.);
 if(mode==11)return layer>=1.?1.:min(base/(1.-layer),1.);
 return layer;
}`;
