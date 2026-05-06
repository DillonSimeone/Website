vec4 makeGnome(vec2 uv, vec2 st){
	float stage = texture(iChannel0, vec2(0.5)/iResolution.xy).a;
    stage = min(1., stage * 1.5);
    float invstage = 1. - stage;
	vec4 result = vec4(0.);

    vec4 body = body(uv, stage);
    result = body;
    
    vec4 face = vec4(0.);
    vec4 chk1 = vec4(0.);
    vec4 nos = vec4(0.);
    vec4 mstchs = vec4(0.);
    
    vec2 muv = uv + vec2(-stage, stage) * .2;
    vec4 head = head(muv, stage, st, iTime);
    face = vec4(mix(head.rgb, head.rgb, head.a), max(head.a, face.a));

    vec4 mouth = mouth(muv, stage, st, iTime);
    face = vec4(mix(face.rgb, mouth.rgb, mouth.a), max(mouth.a, face.a));

    chk1 = cheek1(muv, stage);
    face = vec4(mix(face.rgb, chk1.rgb, chk1.a), max(chk1.a, face.a));
    vec4 cheek2 = cheek2(muv, stage);
    face = vec4(mix(face.rgb, cheek2.rgb, cheek2.a), max(cheek2.a, face.a));

    mstchs = mustaches(muv, stage);
    face = vec4(mix(face.rgb, mstchs.rgb, mstchs.a), max(mstchs.a, face.a));    

    nos = nose(muv, stage);
    face = vec4(mix(face.rgb, nos.rgb, nos.a), max(nos.a, face.a));
    
    vec4 eyes = eyes(muv, stage, nos.a, mstchs.a);
    face = vec4(mix(face.rgb, eyes.rgb, eyes.a), max(eyes.a, face.a));

    result = vec4(mix(result.rgb, face.rgb, face.a), max(result.a, face.a));
    
    vec3 rnbState = texture(iChannel0, vec2(0.5)/iResolution.xy).xyz;
    if(rnbState.z > 0.){
        vec2 muv = uv + vec2(-1., 1.) * .2;
        vec4 rainbow = rainbow(muv, rnbState, st, iTime);
        result = vec4(mix(result.rgb, rainbow.rgb, rainbow.a * (1. - chk1.a) * (1. - nos.a) * (1. - mstchs.a)), max(result.a, rainbow.a));
    }
    
    return result;
}

vec4 drawTree(vec2 uv) {
    vec2 p = uv;
    p.x -= 0.9; 
    p.y -= 1.8;
    p *= 0.3; 
    
    vec2 texUV = p * 0.5 + 0.5;
    if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) return vec4(0.0);
    
    vec4 tree = texture(iChannel1, texUV);
    tree.rgb *= 0.8;
    return tree;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    AA = (5./iResolution.y);
    vec2 st = fragCoord/iResolution.xy;
    vec2 uv = (2.*fragCoord-iResolution.xy)/iResolution.y;    
    vec3 bg = GREY * (1. - smoothstep(.6, .3, distance(uv * vec2(1., 4.), vec2(-.3, -3.6)))*.5);
    
    vec4 tree = drawTree(uv);
    bg = mix(bg, tree.rgb, tree.a);

    vec4 gnome = makeGnome(uv * 1.4 + vec2(0.0, 40.0 / iResolution.y), st);
    fragColor = vec4(mix(bg, gnome.rgb, gnome.a), 1.);    
}