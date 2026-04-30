#define PI 3.14159265359
#define TAU 6.28318530718

#define STROKE .0025
#define EYE_SIZE .2
#define HEAD_SIZE .6
#define NOSE_SIZE .15
#define HAIR vec3(247., 204., 238.)/255.
#define OUTLINE vec3(0.)
#define MOUTH vec3(104., 73., 76.)/255.
#define TEETH vec3(1.)
#define TONGUE vec3(197., 103., 120.)/255.
#define SKIN vec3(241., 179., 196.)/255.
#define NOSE vec3(226., 134., 144.)/255.
#define HAT vec3(212., 76., 92.)/255.
#define GREY vec3(36., 44., 44.)/255.
#define LID vec3(201., 132., 148.)/255.
#define SHIRT vec3(157., 180., 192.)/255.
#define PENTH vec3(96., 99., 122.)/255.
#define BOOTS vec3(75., 49., 64.)/255.

float AA;

vec2 rotate2D(vec2 _st, vec2 center, float _angle){
    _st -= center;
    _st =  mat2(cos(_angle),-sin(_angle),
                sin(_angle),cos(_angle)) * _st;
    _st += center;
    return _st;
}

vec3 hsv2rgb(vec3 c) {
  // Íñigo Quílez
  vec3 rgb = clamp(abs(mod(c.x*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);
  rgb = rgb * rgb * (3. - 2. * rgb);
  return c.z * mix(vec3(1.), rgb, c.y);
}

float fbm1x(float x, float time){
	float amplitude = 1.;
    float frequency = 1.;
    float y = sin(x * frequency);
    float t = 0.01*(-time * 130.0);
    y += sin(x*frequency*2.1 + t)*4.5;
    y += sin(x*frequency*1.72 + t*1.121)*4.0;
    y += sin(x*frequency*2.221 + t*0.437)*5.0;
    y += sin(x*frequency*3.1122+ t*4.269)*2.5;
    y *= amplitude*0.06;
    return y;
}

float fbm(float x){
	float amplitude = 1.;
    float frequency = 1.;
    float y = sin(x * frequency);
    float t = 0.01;
    y += sin(x*frequency*2.1 + t)*4.5;
    y += sin(x*frequency*1.72 + t*1.121)*4.0;
    y += sin(x*frequency*2.221 + t*0.437)*5.0;
    y *= amplitude*0.06;
    return y;
}

float rfbm(float x, float time){
	return fbm1x(x, time)*.5+.5;
}

float rfbm(float x){
	return fbm(x)*.5+.5;
}

float rnd(in vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

#define LAYERS_CNT 13.
int layer(vec2 uv, float time){
    return int(floor(mod(abs(uv.x*.25 - time - uv.y*.5), LAYERS_CNT)));
}

float stripe(vec2 uv, float time){
    return smoothstep(.4975, .495, distance(fract(uv.x*.25 - time - uv.y*.5), .5));
}

vec4 mustaches(vec2 uv, float stage){
	vec3 lc1 = mix(vec3(0., -.35, .35), vec3(.25, -.24, .3), stage);
    vec3 lc2 = mix(vec3(.35, .12, .5), vec3(.2, .875, 1.),stage);
    vec3 rc1 = mix(vec3(-.15, -.37, .35), vec3(-.3, -.35, .4),stage);
    vec3 rc2 = mix(vec3(-.38, .12, .5), vec3(-.3, 1.05, 1.2),stage);
    
    float lArea = min(smoothstep(lc1.z + .01, lc1.z, distance(uv, lc1.xy)),
                      smoothstep(lc2.z + .01, lc2.z, distance(uv, lc2.xy)));
    
    float rArea = min(smoothstep(rc1.z + .01, rc1.z, distance(uv, rc1.xy)),
                      smoothstep(rc2.z + .01, rc2.z, distance(uv, rc2.xy)));
    
    float lOutline = max(smoothstep(STROKE+AA, STROKE, distance(distance(uv, lc1.xy), lc1.z)),
                        smoothstep(STROKE+AA, STROKE, distance(distance(uv, lc2.xy), lc2.z)))
        		  * lArea * (1. - rArea);
    float rOutline = max(smoothstep(STROKE+AA, STROKE, distance(distance(uv, rc1.xy), rc1.z)),
                        smoothstep(STROKE+AA, STROKE, distance(distance(uv, rc2.xy), rc2.z)))
        		  * rArea * (1. - lArea);
    
    vec3 clr = HAIR * max(lArea, rArea);
    clr = mix(clr, OUTLINE, max(lOutline, rOutline));
    return vec4(clr, max(max(lOutline, rOutline), max(lArea, rArea)));
}

vec4 mouth(vec2 uv, float stage, vec2 coord, float time){
	float invstage = 1. - stage;
    vec2 muv = uv + vec2(.1 - stage*.15, .33 - stage * .15);
    muv.x *= 1. + stage*.2;
    vec2 st = rotate2D(muv, vec2(0., -.2), muv.x * -PI);
    float ang = (atan(muv.y, muv.x) + PI) / TAU;
    float dst = length(st * vec2(1., 1. + stage));
    float creaseArea = step(dst, .166);
    float creaseOutline = max(step(abs(ang - .42), .06 - stage * .032), step(abs(ang - .083), .05 - stage * .025))
                       * smoothstep(.01, .001, distance(dst, .166));
    vec4 clr = vec4(mix(SKIN, OUTLINE, creaseOutline), max(creaseOutline, creaseArea));
    
    muv = uv + vec2(.05 * invstage, .33 - pow(stage, 4.) * .15);
    dst = length(st * vec2(1., 1. + pow(stage, 2.) * 20.));
    float mouthArea = step(dst, .125 * invstage);
    float mouthOutline = smoothstep(.01 + .2 * pow(stage, 4.), .001, distance(dst, .125 * invstage));
	
    vec3 mouthClr = MOUTH;
    {
    	dst = distance(muv, vec2(-.25, -.3 + stage * .1));
        float tongueArea = step(.3, dst);
        float tongueOutline = smoothstep(.01, .001, distance(.3, dst));	
    
        mouthClr = mix(TONGUE, MOUTH, tongueArea);
    	mouthClr = mix(mouthClr, OUTLINE, tongueOutline);
    }
    {
    	dst = distance(muv, vec2(-.1, 3.02));
        float teathArea = step(3., dst);
        float teathOutline = smoothstep(.01, .001, distance(3., dst));
    	
        mouthClr = mix(TEETH, mouthClr, teathArea);
    	mouthClr = mix(mouthClr, OUTLINE, teathOutline);
    }
    mouthClr = mix(mouthClr, OUTLINE, mouthOutline);
	return vec4(mix(clr.rgb, mouthClr, max(mouthOutline, mouthArea)), max(max(mouthOutline, mouthArea), clr.a));
}

vec4 cheek1(vec2 uv, float stage){
	uv.x *= 1. + stage;
    if(stage < .25)
        return vec4(0.);
    stage = (stage - .25)/.75;
    vec3 rcheek = mix(vec3(-.6, -.3, .15), vec3(-.65, -.1, .3), stage);
    vec2 cutoff = mix(vec2(.45, .1), vec2(.4, .2), stage);
    float dst = distance(uv, rcheek.xy);
    float ang = (atan(uv.y - rcheek.y, uv.x - rcheek.x) + PI) / TAU;
    float coff = smoothstep(cutoff.y + .01, cutoff.y, abs(ang - cutoff.x));
    float cheekArea = step(dst, rcheek.z) * coff;
    float cheekOutline = smoothstep(.01, .001, distance(dst, rcheek.z)) * coff;
    
    return vec4(mix(SKIN, OUTLINE, cheekOutline * smoothstep(0., .1, stage)), max(cheekOutline, cheekArea));
}

vec4 cheek2(vec2 uv, float stage){
	if(stage < .25)
        return vec4(0.);
    stage = (stage - .25)/.75;
    vec3 lcheek = mix(vec3(.5, -.25, .05), vec3(.51, -.16, .165), stage);
    vec2 cutoff = mix(vec2(.5, .01), vec2(.5, .45), stage);
    float dst = distance(uv * vec2(1.7, 1.), lcheek.xy);
    float ang = (atan(uv.y - lcheek.y, uv.x * 2. - lcheek.x) + PI) / TAU - stage * .15;
    float coff = smoothstep(cutoff.y + .01, cutoff.y, abs(ang - cutoff.x));
    float cheekArea = step(dst, lcheek.z);
    float cheekOutline = smoothstep(.01, .001, distance(dst, lcheek.z)) * coff;
    
    return vec4(mix(SKIN, OUTLINE, cheekOutline * smoothstep(0., .1, stage)), max(cheekOutline, cheekArea));
}

vec4 nose(vec2 uv, float stage){
	float invstage = 1. - stage;
    uv = rotate2D(uv, vec2(0.), .25);
    uv *= vec2(1. + invstage * uv.y * 1.5, 1. - invstage * .2);
    float noseArea = step(length(uv), NOSE_SIZE);
    float noseOutline = smoothstep(STROKE + AA, STROKE, distance(length(uv), NOSE_SIZE));
    vec3 clr = NOSE * step(length(uv), noseArea);
    clr = mix(clr, OUTLINE, noseOutline);
    return vec4(clr, max(noseOutline, noseArea));
}

vec4 beard(vec2 uv, float stage){
	float len = length(uv);
    float ang = atan(uv.x * 4., -uv.y + 1.);
    float f = ang * step(1., abs(ang)) * 30. - PI/2.;
    float a = mix(.5 * pow(smoothstep(1., 0., abs(ang)), .25), .15 + smoothstep(1.1, 1., abs(ang)) * .1, step(1., abs(ang)));
    float size = (.9 - smoothstep(1., 1.1, abs(ang)) * .1) + abs(sin(f)) * a;
    float beardArea = step(len, size);
    float beardOutline = smoothstep(mix(.03, STROKE+AA, step(abs(ang), 1.)), STROKE, abs(len - size));
    float cutoff = step(abs(ang), mix(1.2, 1.1, step(0., ang)));
    return vec4(mix(HAIR, OUTLINE, beardOutline), max(beardArea, beardOutline) * cutoff);
}

vec4 head(vec2 uv, float stage, vec2 st, float time){
	vec4 head = vec4(0.);
    {
    	vec2 muv = rotate2D(uv, vec2(0.), .1);
    	vec2 mult = vec2(1.4 + muv.y * .6, 1.);	
    	head = beard((muv + vec2(.15, -.55))  * mult, stage);
    }
    {
    	vec2 c = vec2(-.15, .2);
        float len = distance(uv, c);
        float ang = atan(uv.y - c.y, uv.x - c.x);
        float size = HEAD_SIZE + (cos((ang + 1.5) * 2.) * .25 - smoothstep(.5, 0., distance(ang, -1.525)) * .1);
        float faceArea = step(len, size);
        float faceOutline = smoothstep(STROKE+AA, STROKE, abs(len - size));
        vec3 clr = SKIN;
        clr = mix(clr, OUTLINE, faceOutline);

        head = vec4(mix(head.rgb, clr, max(faceOutline, faceArea)), max(max(faceOutline, faceArea), head.a));

        {
            vec3 ear = vec3(-1.1, -.01, .25);
            float dst = distance(uv * vec2(1.5, 1.), ear.xy);
            float earArea = step(dst, ear.z);
            float earOutline = smoothstep(STROKE+AA, STROKE, distance(dst, ear.z));
            vec3 clr = mix(SKIN, OUTLINE, earOutline);
            head = vec4(mix(head.rgb, clr, max(earOutline, earArea) * (1. - head.a)), max(max(earOutline, earArea), head.a));
        }
    }
    {
        vec4 lrtb = vec4(-.78 + uv.y * .175, -uv.y * .5 + .35, 1.26, .25);
        head *= step(uv.y, lrtb[3]);
        float hatArea = max(step(lrtb[3], uv.y) * step(lrtb[0], uv.x) * step(uv.x, lrtb[1]) *	step(uv.y, lrtb[2]),
            			    step(distance(uv, vec2(-.42, lrtb[2] - .04)), .145));
		float hatOutline = max(
                               max(
                                    smoothstep(STROKE + AA, STROKE, distance(uv.x, lrtb[0])),
                                    smoothstep(STROKE + AA, STROKE, distance(uv.x, lrtb[1]))
                                  ) * step(lrtb[3], uv.y) * step(uv.y, lrtb[2]),
                               max(
                                    smoothstep(STROKE + AA, STROKE, distance(uv.y, lrtb[3])) * step(lrtb[0], uv.x) * step(uv.x, lrtb[1]),
                                    smoothstep(STROKE + AA, STROKE, distance(distance(uv, vec2(-.42, lrtb[2] - .04)), .145)) * step(lrtb[2], uv.y)
                                  )
            				  );
        vec3 clr = mix(vec3(0.), HAT, hatArea);
        clr = mix(clr, OUTLINE, hatOutline);
		head = vec4(mix(head.rgb, clr, max(hatOutline, hatArea)), max(max(hatOutline, hatArea), head.a));
    }
    return head;
}

vec4 eyes(vec2 uv, float stage, float nose, float mustaches){
	const float pupilSize = .025;
    vec4 res = vec4(0.);
    {
        vec2 muv = rotate2D(uv - vec2(.1, .2), vec2(0.), -.1);
        float slope = sin(muv.x * 5. + PI*.5) * .1 - .075;
        float lEyeArea = step(length(muv), EYE_SIZE);
		float lEyeOutline = smoothstep(STROKE + AA, STROKE, distance(length(muv), EYE_SIZE));
    	vec3 clr = vec3(step(length(muv), EYE_SIZE)) * smoothstep(pupilSize, pupilSize + AA, distance(muv, vec2(stage * .1, .025)));
        clr = mix(clr, LID, step(stage * EYE_SIZE, distance(muv.y, slope)));
        clr = mix(clr, OUTLINE, lEyeOutline);
        clr = mix(clr, OUTLINE, smoothstep(STROKE + AA, STROKE, distance(stage * EYE_SIZE, distance(muv.y, slope))));
        res = vec4(mix(res.rgb, clr, max(lEyeOutline, lEyeArea)), max(max(lEyeOutline, lEyeArea), res.a));
    	
        slope = mix(sin(muv.x * 5. - PI*.42), sin(muv.x * 5. - PI*.46 + PI), stage) * .1 + .5 + stage * .05;
        float browArea = step(distance(uv.y, slope), .025 - stage * .01) * step(distance(uv.x, .1 + .1 * stage), .15 + .01 * stage);
        float browOutline = max(smoothstep(STROKE + AA, STROKE, distance(distance(uv.y, slope), .025 - stage * .01)) * step(distance(uv.x, .1 + .1 * stage), .15 + .01 * stage + STROKE/2.),
            					smoothstep(STROKE + AA, STROKE, distance(distance(uv.x, .1 + .1 * stage), .144 + .01 * stage)) * step(distance(uv.y, slope), .025 - stage * .01 + STROKE));
        clr = mix(vec3(0.), HAIR, browArea);
        clr = mix(clr, OUTLINE, browOutline);
        res = vec4(mix(res.rgb, clr, max(browOutline, browArea)), max(max(browOutline, browArea), res.a));
        res.a *= (1. - nose) * (1. - mustaches);
    }
    {
        vec2 muv = rotate2D(uv - vec2(-.25, .2), vec2(0.), .1);
        float slope = sin(muv.x * 5. + PI*.5) * .1 - .075;
    	float lEyeArea = step(length(muv), EYE_SIZE);
		float lEyeOutline = smoothstep(STROKE + AA, STROKE, distance(length(muv), EYE_SIZE));
    	lEyeOutline = max(lEyeOutline,
                          smoothstep(STROKE*.5 + AA*.5, STROKE*.5, distance(length(muv), EYE_SIZE + .025))
                         *smoothstep(stage*.3 + AA, stage*.3, distance(atan(muv.x, muv.y), -1.85))
                         *smoothstep(.1, .5, stage));
        
        vec3 clr = vec3(step(length(muv), EYE_SIZE)) * smoothstep(pupilSize, pupilSize + AA, distance(muv, vec2(stage * -.1, .025)));
        clr = mix(clr, LID, step(stage * EYE_SIZE, distance(muv.y, slope)));
        clr = mix(clr, OUTLINE, lEyeOutline);
        clr = mix(clr, OUTLINE, smoothstep(STROKE + AA, STROKE, distance(stage * EYE_SIZE, distance(muv.y, slope))));
        res = vec4(mix(res.rgb, clr, max(lEyeOutline, lEyeArea)), max(max(lEyeOutline, lEyeArea), res.a));
    	
        slope = mix(sin(muv.x * 5. - PI*.5), sin(muv.x * 5. - PI*.6 + PI), stage) * .1 + .475 + stage * .1;
        float browArea = step(distance(uv.y, slope), .035 - stage * .01) * step(distance(uv.x, -.25 + -.05 * stage), .15 + .05 * stage);
        float browOutline = max(smoothstep(STROKE + AA, STROKE, distance(distance(uv.y, slope), .035 - stage * .01)) * step(distance(uv.x, -.25 - .05 * stage), .15 + .05 * stage + STROKE/2.),
            					smoothstep(STROKE + AA, STROKE, distance(distance(uv.x, -.25 - .05 * stage), .144 + .05 * stage)) * step(distance(uv.y, slope), .035 - stage * .01 + STROKE));
        clr = mix(vec3(0.), HAIR, browArea);
        clr = mix(clr, OUTLINE, browOutline);
        res = vec4(mix(res.rgb, clr, max(browOutline, browArea)), max(max(browOutline, browArea), res.a));
        res.a *= 1. - mustaches;
    }
    return res;
}

vec4 body(vec2 uv, float stage){
	float mask = step(sin(uv.y * 4. + .9) * .1 + -1.1 + smoothstep(-.5, .5, uv.y) * (.25 + stage * .75), uv.x)
        	   * step(uv.y, .25 + uv.x * .1)
        	   * step(-1.2, uv.y)
        	   * step(uv.x, sin(uv.y * 5. + .3) * .1)
        	   * (1. - step(distance(uv.x, -.475), .125) * step(distance(uv.y, -1.1), .1));
    float shirtArea = step(distance(uv, mix(vec2(-.3, .3), vec2(0., .1), stage)), 1.);
    float sleeveOutline = 0.;
    float sleeve = 0.;
    float hand = 0.;
    {
    	sleeve = step(distance(uv.y, uv.x * (.3)), .15) * step(0., uv.x)
               * step(uv.x, sin(uv.y * 8. - .1 + stage*.2) * .1 + .6);
        sleeveOutline = max(smoothstep(STROKE+AA, STROKE, distance(distance(uv.y, uv.x * (.3)), .15)) * step(0., uv.x) * step(uv.x, sin(uv.y * 8. - .1 + stage*.2) * .1 + .6),
                            smoothstep(STROKE+AA, STROKE, distance(uv.x, sin(uv.y * 8. - .1 + stage*.2) * .1 + .6)) * step(distance(uv.y, uv.x * (.3)), .16));
        float h1 = step(distance(rotate2D(uv, vec2(1.2, .2), -.2) * vec2(1.75, 1.), vec2(1.2, .2)), .225);
        float h2 = step(distance(rotate2D(uv, vec2(.65, .35), .3) * vec2(1., 3.), vec2(.65, .35)), .2);
        hand = max(h1, h2) * (1. - sleeve);
        sleeveOutline = max(sleeveOutline,
                           max(smoothstep(STROKE+AA, STROKE, distance(distance(rotate2D(uv, vec2(1.2, .2), -.2) * vec2(1.75, 1.), vec2(1.2, .2)), .225)) * (1. - h2),
                           	   smoothstep(STROKE+AA, STROKE, distance(distance(rotate2D(uv, vec2(.65, .35), .3) * vec2(1., 3.), vec2(.65, .35)), .2)) * (1. - h1))
                           * (1. - sleeve));
        sleeveOutline = max(sleeveOutline,
                            smoothstep(STROKE+AA, STROKE, distance(.05, distance(uv.x, uv.y * .1 + .67))) * h1 * step(.35, uv.y)
                            );
        mask = max(hand, max(sleeve, mask));
        
        vec2 uv = rotate2D(uv * 1.2, vec2(0.), 2.1 - stage*.2) + vec2(stage * .4, -.3 + stage * .2);
        sleeve = max(sleeve,
            		 step(distance(pow(cos(uv.x), 8.), uv.y), .25 + stage * (1. - uv.y) * .125) * step(abs(uv.x), uv.y));
            		
        shirtArea = max(shirtArea, sleeve);
        hand = max(hand,
            	   step(distance(pow(cos(uv.x), 8.), uv.y), .25 + stage * (1. - uv.y) * .125) * step(distance(uv.y + uv.x, .2 - stage*.1), .35));
        sleeveOutline = max(sleeveOutline,
                            max(
                                smoothstep(STROKE*2.+AA*1.5, STROKE*2., distance(distance(pow(cos(uv.x), 8.), uv.y), .25 + stage * (1. - uv.y) * .125)) * step(abs(uv.x), uv.y),
                                smoothstep(STROKE*2.+AA*2., STROKE*2., distance(distance(uv.y + uv.x, .2 - stage*.1), .35)) * step(distance(pow(cos(uv.x), 8.), uv.y), .25 + stage * (1. - uv.y) * .125) * step(0., uv.y)
                                ));
    }
    float boots = max(
                      max(
                      step(distance(uv, vec2(-.578, -1.25)), .075),
                      step(distance(uv.y, sin(uv.x * 4. + 1.15) * .1 - 1.16), .075)
                    * step(uv.y, sin(uv.x * 3. + 1.) * .1 - 1.1)
                    * step(-1.33 - uv.y * .25, uv.x)
                    * step(uv.x, -.91 - uv.y * .25)),
                      max(
                      step(distance(uv, vec2(.075, -1.265)), .075),
                      step(distance(uv.y, sin(uv.x * 3. + 4.4) * .1 - 1.165), .075)
                    * step(uv.x, -.25 - uv.y * .25)
                    * step(-.06 + uv.y * .25, uv.x)
                    * step(uv.y, -1.2))
        			);
    float outline = smoothstep(STROKE+AA, STROKE, distance(uv.x, sin(uv.y * 5. + .3) * .1)) * step(-1.2, uv.y) * step(uv.y, 0.)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.x, sin(uv.y * 5. + .8) * .1 - .44)) * step(-1.25, uv.y) * step(uv.y, -1.)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.x, sin(uv.y * 5. + .7) * .1 - .7)) * step(-1.18, uv.y) * step(uv.y, -.85)
				  + smoothstep(STROKE+AA, STROKE, distance(sin(uv.y * 4. + .9) * .1 + -1.1 + smoothstep(-.5, .5, uv.y) * (.25 + stage * .75), uv.x)) * step(-1.266, uv.y) * step(uv.y, 0.)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.y, sin(uv.x * 2.) * .05 - .95)) * step(-.6, uv.x) * step(uv.x, -.2)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.y, sin(uv.x * 3. + 1.) * .1 - 1.1)) * step(-1.04, uv.x) * step(uv.x, -.6)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.y, sin(uv.x * 3. + 5.3) * .1 - 1.12)) * step(-.365, uv.x) * step(uv.x, .075)
        		  + smoothstep(STROKE+AA, STROKE, distance(distance(uv, mix(vec2(-.3, .3), vec2(0., .1), stage)), 1.)) * mask * (1. - sleeve) * step(uv.y, 0.)
        		  + smoothstep(STROKE+AA, STROKE, distance(distance(uv, vec2(.075, -1.265)), .075)) * step(-.25 - uv.y * .25, uv.x)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.y, sin(uv.x * 3. + 4.4) * .1 - 1.24)) * step(uv.x, -.25 - uv.y * .25) * step(-.06 + uv.y * .25, uv.x)
        		  + smoothstep(STROKE+AA, STROKE, distance(distance(uv, vec2(-.578, -1.25)), .075)) * step(-.91 - uv.y * .25, uv.x)
        		  + smoothstep(STROKE+AA, STROKE, distance(uv.y, sin(uv.x * 4. + 1.15) * .1 - 1.234)) * step(-1.33 - uv.y * .25, uv.x) * step(uv.x, -.91 - uv.y * .25)
        		  + sleeveOutline;
    outline = clamp(0., 1., outline);
    vec3 color = PENTH * mask;
    color = mix(color, SHIRT, shirtArea);
    color = mix(color, SKIN, hand);
    color = mix(color, BOOTS, boots);
    color = mix(color, OUTLINE, outline);
    return vec4(color, max(max(mask, boots), outline));
}

#define WIDTH (PI*.1)
vec4 rainbow(vec2 uv, vec3 state, vec2 st, float time){
	uv.x += PI*.1;
    float curve = sin(uv.y + 2.6) * .5 - fbm1x(uv.y, time * 10.) * .025;
    float upperCutoff = (state.y - time) * 8. * step(.00001, state.y);
    if(upperCutoff < 0.)
        upperCutoff -= fbm1x(uv.x * 10., time) * .1;
    float lowerCutoff = max((state.x - time) * 8., -1.125);
    vec4 rnb = vec4(hsv2rgb(vec3((uv.x - curve), 1., 1.)), 1.)
             * smoothstep(WIDTH + AA*2., WIDTH, distance(uv.x, curve))
             * smoothstep(upperCutoff+AA, upperCutoff, uv.y)
             * step(lowerCutoff, uv.y);
    {
		float size = smoothstep(0., .5, (time - state.x) * 4.);
        float s = 0.;
        if(lowerCutoff > -1.125){
            for(int i=-2; i<=2; i++){
                float fx = curve + WIDTH*.5*float(i);
                lowerCutoff = max((state.x - time) * 8., -1.1);
                lowerCutoff -= fbm1x(fx * 10., state.x) * .1;
                float splash = rfbm(fx, lowerCutoff) * .25 * size;
                splash = smoothstep(splash + AA*8., splash, distance(vec2(fx + WIDTH*.25, lowerCutoff), uv));
                s = max(s, splash);
            }
        }
        if (lowerCutoff < -1.){
            vec2 cntr = vec2(4., -9.2);
            uv *= 8.;
            float xsgn = sign(uv.x - cntr.x);
            vec2 dst = abs(uv - cntr);
            uv.y -= pow(dst.x/8., 8.);

            float seed = (uv.x - (dst.y + time * 12.) * xsgn) - cntr.x;
            float splashHeight = mix(.4 - sin(time * 10.)*.1, smoothstep(-1., 1., fbm(seed)), smoothstep(0., 2., dst.x))
                               * (4. - cos(dst.x) * 1.5)
                               * smoothstep(8., 0., dst.x)
                               * state.z;
            float splash = smoothstep(cntr.y, cntr.y+AA*12., uv.y)
                         * smoothstep(cntr.y + splashHeight + AA*12., cntr.y + splashHeight, uv.y)
                         * smoothstep(8., 7., dst.x);

            s = mix(s, splash, smoothstep(-1., -1.1, lowerCutoff));
        }
        rnb.rgb = mix(rnb.rgb, vec3(1.), s);
        rnb.a = max(rnb.a, s);    	
    }
    return rnb;
}