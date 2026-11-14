shader_type canvas_item;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	p.x *= 1.6;
	float radius = length(p);

	// Dark base gradient
	vec3 col = mix(vec3(0.05, 0.025, 0.09), vec3(0.2, 0.04, 0.02), smoothstep(0.1, 1.35, radius));

	// Perspective grid on lower half (synthwave floor)
	float floor_line = UV.y - 0.56;
	if (floor_line > 0.0) {
		float depth = 1.0 / max(floor_line * 3.5, 0.05);
		float gx = abs(fract(p.x * depth * 0.4) - 0.5);
		float gz = abs(fract(floor_line * depth * 1.8 + TIME * 0.25) - 0.5);
		float lx = smoothstep(0.025, 0.0, gx);
		float lz = smoothstep(0.025, 0.0, gz);
		float grid = max(lx, lz) * smoothstep(0.44, 0.04, floor_line);
		col += vec3(0.75, 0.28, 0.88) * grid * 0.4;
		col += vec3(0.25, 0.08, 0.42) * smoothstep(0.44, 0.01, floor_line) * 0.2;
	}

	// Sun disc near horizon
	vec2 sun = vec2(0.0, -0.12);
	float sd = length(p - sun);
	col += vec3(1.0, 0.5, 0.16) * smoothstep(0.3, 0.0, sd) * 0.65;
	col += vec3(1.0, 0.28, 0.06) * exp(-sd * 3.2) * 0.3;

	// Horizontal bands through the sun
	float bands = step(0.5, fract((p.y + 0.12) * 8.0 - TIME * 0.15));
	float in_sun = smoothstep(0.3, 0.05, sd);
	col *= 1.0 - in_sun * (1.0 - bands) * 0.55;

	// Horizon glow (subtler so text is crisp and readable)
	float hz = exp(-pow((UV.y - 0.56) * 12.0, 2.0));
	col += vec3(1.0, 0.35, 0.1) * hz * 0.28;
	col += vec3(1.0, 0.6, 0.2) * hz * hz * 0.15;

	// Rotating sweep
	float sweep = 0.5 + 0.5 * sin(atan(p.y, p.x) * 4.0 + TIME * 0.3);
	col += vec3(0.5, 0.18, 0.04) * sweep * 0.05;

	// Overlay grid
	float ogrid = step(0.978, fract(UV.x * 26.0)) + step(0.978, fract(UV.y * 15.0));
	col += vec3(1.0, 0.5, 0.18) * ogrid * 0.06;

	// Scanlines
	col *= 0.94 + 0.06 * sin(UV.y * 380.0);

	// Vignette
	col *= 1.0 - smoothstep(0.55, 1.5, radius) * 0.4;

	COLOR = vec4(col, 1.0);
}
