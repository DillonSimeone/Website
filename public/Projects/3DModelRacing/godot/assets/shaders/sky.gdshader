shader_type sky;

uniform float space = 0.0;

void sky() {
	float h = EYEDIR.y;

	// Three-tone gradient
	vec3 horizon = mix(vec3(1.0, 0.38, 0.12), vec3(0.02, 0.02, 0.05), space);
	vec3 mid_sky = mix(vec3(0.35, 0.12, 0.42), vec3(0.01, 0.015, 0.04), space);
	vec3 zenith = mix(vec3(0.08, 0.04, 0.18), vec3(0.003, 0.005, 0.015), space);
	vec3 ground = mix(vec3(0.04, 0.02, 0.05), vec3(0.01, 0.01, 0.015), space);

	vec3 col;
	if (h > 0.0) {
		float t = smoothstep(0.0, 0.55, h);
		col = mix(horizon, mid_sky, t);
		col = mix(col, zenith, smoothstep(0.3, 0.85, h));
	} else {
		col = mix(horizon * 0.4, ground, smoothstep(0.0, -0.35, h));
	}

	// Warm horizon band
	col += vec3(1.0, 0.5, 0.16) * exp(-abs(h) * 4.0) * 0.7 * (1.0 - space);
	// Tighter orange accent
	col += vec3(1.0, 0.32, 0.08) * exp(-pow(h * 14.0, 2.0)) * 0.45 * (1.0 - space);

	// Three star layers
	float star1 = fract(sin(dot(EYEDIR.xz, vec2(12.9898, 78.233))) * 43758.5453);
	float star2 = fract(sin(dot(EYEDIR.xz * 1.7 + 3.0, vec2(78.233, 12.9898))) * 43758.5453);
	float star3 = fract(sin(dot(EYEDIR.xz * 0.6 + 7.0, vec2(45.164, 93.723))) * 43758.5453);
	float vis = max(space, smoothstep(0.3, 0.8, h) * 0.4);
	col += vec3(0.8, 0.88, 1.0) * step(0.9965, star1) * vis;
	col += vec3(1.0, 0.92, 0.75) * step(0.9978, star2) * vis * 0.7;
	col += vec3(0.65, 0.75, 1.0) * step(0.999, star3) * vis * 0.5;

	// Faint cloud wisps
	float cloud_a = sin(EYEDIR.x * 3.5 + EYEDIR.z * 2.2) * sin(EYEDIR.x * 8.0 - EYEDIR.z * 5.5);
	float cloud_mask = smoothstep(0.06, 0.22, h) * smoothstep(0.45, 0.28, h) * (1.0 - space);
	col += vec3(1.0, 0.55, 0.3) * smoothstep(0.25, 0.75, cloud_a * 0.5 + 0.5) * cloud_mask * 0.1;

	COLOR = col;
}
