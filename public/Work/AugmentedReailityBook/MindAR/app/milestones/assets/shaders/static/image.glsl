// Generate Gold Noise image

   precision lowp    float;
// precision mediump float;
// precision highp   float;

void mainImage(out vec4 rgba, in vec2 xy)
{
    float seed = fract(iTime);                    // fractional base seed
    rgba       = vec4 (gold_noise(xy, seed+0.1),  // r
                       gold_noise(xy, seed+0.2),  // g
                       gold_noise(xy, seed+0.3),  // b
                       gold_noise(xy, seed+0.4)); // α
}