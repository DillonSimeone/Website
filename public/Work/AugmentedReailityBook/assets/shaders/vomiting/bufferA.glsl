float hash(float n) { return fract(sin(n) * 43758.5453123); }

void mainImage( out vec4 fragColor, in vec2 fragCoord){
    if(ivec2(fragCoord) == ivec2(0)){
        vec4 state = texture(iChannel0, vec2(0.5)/iResolution.xy);
        
        if(iFrame == 0){
            state = vec4(0.0, 0.0, 0.0, 0.0); // x: start, y: end, z: intensity, w: facialStage
        } else {
            float interval = 4.0;
            float timeIdx = floor(iTime / interval);
            float target = step(0.5, hash(timeIdx));
            
            float prevFacialStage = state.w;
            state.w = mix(state.w, target, 0.05); 
            
            float threshold = 0.5;
            if (prevFacialStage <= threshold && state.w > threshold) {
                state.x = iTime;
                state.y = 0.0;
                state.z = 1.0;
            } else if (prevFacialStage > threshold && state.w <= threshold) {
                state.y = iTime;
                state.x = 0.0;
            }
            
            if (state.y > 0.0) {
                state.z = smoothstep(0.5, 0.0, iTime - state.y); 
                if (state.z <= 0.0) state.y = 0.0;
            } else if (state.x > 0.0) {
                state.z = 1.0;
            } else {
                state.z = 0.0;
            }
        }
        fragColor = state;
    } else {
        fragColor = vec4(0.0);
    }
}