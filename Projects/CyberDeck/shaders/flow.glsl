
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uVoltage;
uniform float uSourceType; // 0: Solar, 1: Wind, 2: Grid
uniform vec2 uResolution;

#define PI 3.1415926536

// ── Shared Utils ──
#define UI0 1597334673U
#define UI1 3812015801U
#define UI2 uvec2(UI0, UI1)
#define UIF (1.0 / float(0xffffffffU))

float hash12(vec2 p) {
    uvec2 q = uvec2(ivec2(p)) * UI2;
    uint n = (q.x ^ q.y) * UI0;
    return float(n) * UIF;
}

float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12(i + vec2(0.0, 0.0)), hash12(i + vec2(1.0, 0.0)), u.x),
                mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float mNoise(in vec2 pos) {
    vec2 q = pos;
    const mat2 m = mat2(0.36, 0.80, -0.80, 0.36);
    float amplitude = 0.5;
    float f = amplitude * noise(q);
    float scale = 2.12;
    for (int i = 0; i < 4; ++i) {
        q = m * q * scale;
        f += amplitude * noise(q);
        amplitude *= 0.5;
    }
    return f;
}

// ── Grid Logic ──
float hashG(float p) { p = fract(p * 0.011); p *= p + 7.5; p *= p + p; return fract(p); }
float hashG(vec2 p) {vec3 p3 = fract(vec3(p.xyx) * 0.13); p3 += dot(p3, p3.yzx + 3.333); return fract((p3.x + p3.y) * p3.z); }

float noise_grid(vec3 x) {
    const vec3 step = vec3(110, 241, 171);
    vec3 i = floor(x);
    vec3 f = fract(x);
    float n = dot(i, step);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix( hashG(n + dot(step, vec3(0, 0, 0))), hashG(n + dot(step, vec3(1, 0, 0))), u.x),
                   mix( hashG(n + dot(step, vec3(0, 1, 0))), hashG(n + dot(step, vec3(1, 1, 0))), u.x), u.y),
               mix(mix( hashG(n + dot(step, vec3(0, 0, 1))), hashG(n + dot(step, vec3(1, 0, 1))), u.x),
                   mix( hashG(n + dot(step, vec3(0, 1, 1))), hashG(n + dot(step, vec3(1, 1, 1))), u.x), u.y), u.z);
}

// ── Solar Utils ──
vec4 hash4(vec4 n) { return fract(sin(n)*1399763.5453123); }

float noise4q(vec4 x) {
    vec4 n3 = vec4(0,0.25,0.5,0.75);
    vec4 p2 = floor(x.wwww+n3);
    vec4 b = floor(x.xxxx+n3) + floor(x.yyyy+n3)*157.0 + floor(x.zzzz +n3)*113.0;
    vec4 p1 = b + fract(p2*0.00390625)*vec4(164352.0, -164352.0, 163840.0, -163840.0);
    p2 = b + fract((p2+1.0)*0.00390625)*vec4(164352.0, -164352.0, 163840.0, -163840.0);
    vec4 f1 = fract(x.xxxx+n3);
    vec4 f2 = fract(x.yyyy+n3);
    f1=f1*f1*(3.0-2.0*f1);
    f2=f2*f2*(3.0-2.0*f2);
    vec4 n1 = vec4(0,1.0,157.0,158.0);
    vec4 n2 = vec4(113.0,114.0,270.0,271.0);    
    vec4 vs1 = mix(hash4(p1), hash4(n1.yyyy+p1), f1);
    vec4 vs2 = mix(hash4(n1.zzzz+p1), hash4(n1.wwww+p1), f1);
    vec4 vs3 = mix(hash4(p2), hash4(n1.yyyy+p2), f1);
    vec4 vs4 = mix(hash4(n1.zzzz+p2), hash4(n1.wwww+p2), f1);    
    vs1 = mix(vs1, vs2, f2);
    vs3 = mix(vs3, vs4, f2);
    vs2 = mix(hash4(n2.xxxx+p1), hash4(n2.yyyy+p1), f1);
    vs4 = mix(hash4(n2.zzzz+p1), hash4(n2.wwww+p1), f1);
    vs2 = mix(vs2, vs4, f2);
    vs4 = mix(hash4(n2.xxxx+p2), hash4(n2.yyyy+p2), f1);
    vec4 vs5 = mix(hash4(n2.zzzz+p2), hash4(n2.wwww+p2), f1);
    vs4 = mix(vs4, vs5, f2);
    f1 = fract(x.zzzz+n3);
    f2 = fract(x.wwww+n3);
    f1=f1*f1*(3.0-2.0*f1);
    f2=f2*f2*(3.0-2.0*f2);
    vs1 = mix(vs1, vs2, f1);
    vs3 = mix(vs3, vs4, f1);
    vs1 = mix(vs1, vs3, f2);
    float r=dot(vs1,vec4(0.25));
    return r*r*(3.0-2.0*r);
}

float noiseSpere(vec3 ray,vec3 pos,float r,mat3 mr,float zoom,vec3 subnoise,float anim) {
    float b = dot(ray,pos);
    float c = dot(pos,pos) - b*b;
    vec3 r1=vec3(0.0);
    float s=0.0;
    float d=0.03125;
    float d2=zoom/(d*d); 
    float ar=5.0;
    for (int i=0;i<3;i++) {
        float rq=r*r;
        if(c <rq) {
            float l1=sqrt(rq-c);
            r1= ray*(b-l1)-pos;
            r1=r1*mr;
            s+=abs(noise4q(vec4(r1*d2+subnoise*ar,anim*ar))*d);
        }
        ar-=2.0;
        d*=4.0;
        d2*=0.0625;
        r=r-r*0.02;
    }
    return s;
}

float ring(vec3 ray,vec3 pos,float r,float size) {
    float b = dot(ray,pos);
    float c = dot(pos,pos) - b*b;
    return max(0.0,(1.0-size*abs(r-sqrt(c))));
}

float ringRayNoise(vec3 ray,vec3 pos,float r,float size,mat3 mr,float anim) {
    float b = dot(ray,pos);
    vec3 pr=ray*b-pos;
    float c=length(pr);
    pr*=mr;
    pr=normalize(pr);
    float s=max(0.0,(1.0-size*abs(r-c)));
    float nd=noise4q(vec4(pr*1.0,-anim+c))*2.0;
    nd=pow(nd,2.0);
    float n=0.4;
    float ns=1.0;
    if (c>r) {
        n=noise4q(vec4(pr*10.0,-anim+c));
        ns=noise4q(vec4(pr*50.0,-anim*2.5+c*2.0))*2.0;
    }
    n=n*n*nd*ns;
    return pow(s,4.0)+s*s*n;
}

void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uResolution.x / uResolution.y;

    // ── SOLAR ──
    vec3 solarColor = vec3(0.0);
    {
        float time = uTime * 1.0;
        vec2 sunPos = vec2(sin(time * 0.1) * 1.5, 0.8 + cos(time * 0.2) * 0.4);
        vec3 pos = vec3(sunPos, 4.0);
        vec3 ray = normalize(vec3(p, 2.0));
        mat3 mr = mat3(1.0);
        float s1 = noiseSpere(ray, pos, 1.0, mr, 0.5, vec3(0.0), time);
        s1 = pow(min(1.0, s1 * 2.4), 2.0);
        float s2 = noiseSpere(ray, pos, 1.0, mr, 4.0, vec3(83.23, 34.34, 67.453), time);
        s2 = min(1.0, s2 * 2.2);
        vec3 sunCol = mix(vec3(1.0,1.0,0.0), vec3(1.0), pow(s1,60.0)) * s1;
        sunCol += mix(mix(vec3(1.0,0.0,0.0), vec3(1.0,0.0,1.0), pow(s2,2.0)), vec3(1.0), pow(s2,10.0)) * s2;
        sunCol -= vec3(ring(ray, pos, 1.03, 11.0)) * 2.0;
        sunCol = max(vec3(0.0), sunCol);
        float s3 = ringRayNoise(ray, pos, 0.96, 1.0, mr, time);
        sunCol += mix(vec3(1.0,0.6,0.1), vec3(1.0,0.95,1.0), pow(s3,3.0)) * s3;
        solarColor = sunCol * (0.5 + uVoltage * 1.5);
    }

    // ── WIND ──
    vec3 windColor = vec3(0.0);
    {
        vec2 uv = p; uv.x += length(p - vec2(1.0));
        float ny = p.y + 0.5; uv.y *= 1.1; uv.x *= 3.25;
        float t = uTime * 0.725; uv.y += t;
        float fval1 = mNoise(uv); uv.x *= 0.64;
        float fval = 0.23 + (ny * 0.1); uv.x += 3.5 + (fval1 * fval);
        uv.y -= t * 0.53;
        float fval2 = mNoise(uv);
        float cut = 0.45;
        fval1 = smoothstep(cut - 0.1, 1.8, fval1);
        fval2 = smoothstep(cut, 1.8, fval2);
        fval1 = fval1 + fval2;
        vec3 col1top = vec3(0.65, 1.0, 0.5); vec3 col1bot = vec3(0.55, 0.6, 0.75);
        vec3 col2top = vec3(1.1, 0.75, 0.35) * 1.8; vec3 col2bot = vec3(1.0, 0.65, 0.3) * 1.8;
        vec3 col1 = mix(col1bot, col1top, ny) * fval1;
        vec3 col2 = mix(col2bot, col2top, ny) * fval2;
        float blend = 0.5 + (sin(fval1 * 4.25 + fval2 * 1.75) * 0.25);
        windColor = mix(col1, col2, blend) * 1.31;
        windColor = clamp(windColor, vec3(0.0), vec3(1.0));
        windColor *= 1.0 - 0.4 * dot(p, p);
        windColor *= (0.6 + uVoltage * 0.4);
    }

    // ── GRID ──
    vec3 gridColor = vec3(0.0);
    {
        vec2 uv = vUv;
        vec3 col = vec3(0.0);
        float pinch = uv.x * (1.0 - uv.x);
        float masterheight = (uv.y - 0.5) * 15.0 - sin(uTime * 2.0 + uv.x * 10.0) - sin(uTime * 10.0 + uv.x * 25.0) * 0.8 - sin(uTime * 2.0 + uv.x * 45.0) * 0.6;
        masterheight *= pow(abs(pinch), 0.1) * -0.02;
        for(int i = 0; i < 3; i++) {
            float noiseofs = noise_grid(vec3(uv.x * 35.0, uTime * 15.0, float(i) * 10.0)) * 2.0 - 1.0;
            float offset = 0.5;
            offset += noiseofs * 0.1 * pinch;
            float invHeight = 15.0;
            invHeight /= pow(max(pinch, 0.001), 3.0);
            float func = (uv.y - offset + masterheight) * invHeight - sin(uTime * 6.0 + uv.x * 20.0 + float(i) * 4.0);
            func *= 3.0;
            float blue = 3.0 / (pow(abs(func), 0.4));
            col.b += blue * 0.4;
            col.g += blue * 0.2;
        }
        gridColor = col * (0.5 + uVoltage * 1.5);
    }

    // ── Crossfade ──
    float solarWeight = 1.0 - smoothstep(0.0, 1.0, uSourceType);
    float windWeight = 1.0 - abs(uSourceType - 1.0);
    windWeight = clamp(windWeight, 0.0, 1.0);
    float gridWeight = smoothstep(1.0, 2.0, uSourceType);
    
    // Normalize so they sum to 1 
    float totalW = solarWeight + windWeight + gridWeight;
    vec3 finalColor = (solarColor * solarWeight + windColor * windWeight + gridColor * gridWeight) / max(totalW, 0.001);

    gl_FragColor = vec4(finalColor, 1.0);
}

