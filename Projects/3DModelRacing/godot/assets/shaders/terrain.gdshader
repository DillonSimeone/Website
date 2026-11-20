shader_type spatial;
render_mode cull_disabled;

uniform float peaks = 0.0;

varying vec3 world_pos;
varying vec3 tint;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	tint = COLOR.rgb;
}

void fragment() {
	float roll = sin(world_pos.x * 0.012) * cos(world_pos.z * 0.012);
	vec3 low = vec3(0.025, 0.03, 0.055);
	vec3 mid = vec3(0.06, 0.03, 0.08);
	vec3 high = vec3(0.14, 0.06, 0.12);
	float blend = roll * 0.5 + 0.5;
	vec3 col = mix(low, mix(mid, high, blend), blend);

	if (peaks > 0.5) {
		float h_norm = clamp(world_pos.y / 90.0, 0.0, 1.0);
		vec3 base_peak = mix(vec3(0.05, 0.03, 0.08), vec3(0.45, 0.18, 0.14), h_norm);
		vec3 frost = vec3(0.55, 0.5, 0.62);
		col = mix(base_peak, frost, smoothstep(0.7, 0.95, h_norm) * 0.3);
		col = mix(col, tint, 0.3);
	}

	// Dual-scale grid emission
	float grid_fine = step(0.985, fract(world_pos.x * 0.04)) + step(0.985, fract(world_pos.z * 0.04));
	float grid_coarse = step(0.992, fract(world_pos.x * 0.008)) + step(0.992, fract(world_pos.z * 0.008));

	// Sweeping glow wave
	float sweep = smoothstep(0.0, 0.15, fract(world_pos.z * 0.004 - TIME * 0.03));
	vec3 grid_col = vec3(0.45, 0.18, 0.75) * grid_fine * 0.45 + vec3(0.85, 0.4, 0.18) * grid_coarse * 0.3;
	vec3 sweep_col = vec3(0.9, 0.3, 0.1) * (1.0 - sweep) * 0.12;

	ALBEDO = col;
	EMISSION = grid_col + sweep_col;
	ROUGHNESS = 0.85;
}
