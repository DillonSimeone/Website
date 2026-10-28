shader_type spatial;
render_mode cull_disabled, diffuse_toon, specular_toon;

uniform vec4 albedo : source_color = vec4(0.92, 0.28, 0.16, 1.0);
uniform int pattern_id = 0;
uniform float squash_amount = 0.0;
uniform float stretch_amount = 0.0;
uniform float lean_amount = 0.0;
uniform float boost_glow = 0.0;
uniform vec4 dent0 = vec4(0.0);
uniform vec4 dent1 = vec4(0.0);
uniform vec4 dent2 = vec4(0.0);
uniform vec4 dent3 = vec4(0.0);
uniform int dent_count = 0;

varying vec3 undeformed;

void vertex() {
	undeformed = VERTEX;
	vec3 p = VERTEX;
	float sq = clamp(squash_amount, 0.0, 0.6);
	p.y *= 1.0 - sq * 0.45;
	p.x *= 1.0 + sq * 0.25;
	p.z *= 1.0 + sq * 0.25;
	float stch = clamp(stretch_amount, -0.6, 1.0);
	p.z *= 1.0 + stch * 0.35;
	p.x *= 1.0 - stch * 0.12;
	p.x += lean_amount * p.y * 0.55;
	VERTEX = p;
}

void fragment() {
	vec3 base = albedo.rgb;
	vec3 p = undeformed;
	float t = TIME;
	vec3 col = base;
	vec3 emission = vec3(0.0);
	float rough = 0.42;

	// Compact, branch-optimized pattern generator (compiles in milliseconds in WebGL)
	if (pattern_id == 0) {
		// Solid color
		col = base;
	} else if (pattern_id == 1) {
		// Checkers
		float c = step(0.5, fract(p.x * 2.2)) != step(0.5, fract(p.z * 2.2)) ? 1.0 : 0.0;
		col = mix(base * 0.22, base * 1.05, c);
	} else if (pattern_id == 2) {
		// Racing stripes
		float stripe = step(0.58, abs(fract(p.x * 1.4) - 0.5) * 2.0);
		col = mix(base, vec3(0.96, 0.95, 0.92), stripe);
	} else if (pattern_id == 3) {
		// Carbon weave
		vec2 g = abs(fract(p.xz * 6.5) - 0.5);
		float w = step(0.44, max(g.x, g.y));
		col = mix(base * 0.32, base * 0.85, w);
		rough = 0.28;
	} else if (pattern_id == 4) {
		// Scales / Honeycomb
		float s = step(0.38, length(abs(fract(vec2(p.x * 3.0, p.z * 2.0 + p.y)) - 0.5)));
		col = mix(base * 0.3, base * 1.15, s);
	} else if (pattern_id == 5) {
		// Camo
		float c = step(0.5, sin(p.x * 4.0) * cos(p.z * 3.5) + sin(p.y * 5.0));
		col = mix(base * 0.45, base * vec3(0.75, 0.9, 0.65), c);
	} else if (pattern_id == 6) {
		// Scrolling energy stripes (animated)
		float str = step(0.5, abs(fract(p.z * 1.5 + t * 0.8) - 0.5) * 2.0);
		col = mix(base * 0.35, vec3(0.95, 0.98, 1.0), str);
		emission = vec3(0.8, 0.9, 1.0) * str * 0.25;
	} else if (pattern_id == 7) {
		// Pulse glow (animated)
		float pls = 0.7 + 0.3 * sin(t * 3.2);
		col = base * pls;
		emission = base * (0.2 + 0.25 * sin(t * 3.2));
	} else if (pattern_id == 8) {
		// Plasma waves (animated)
		float w = sin(p.x * 3.5 + t * 1.6) * sin(p.z * 3.5 - t * 1.2);
		col = mix(base, vec3(0.9, 0.45, 1.0), w * 0.5 + 0.5);
		emission = col * 0.22;
	} else if (pattern_id == 9) {
		// Hologram scanlines (animated)
		float scan = 0.7 + 0.3 * sin(p.y * 16.0 - t * 4.5);
		col = mix(base, vec3(0.35, 0.88, 1.0), 0.5) * scan;
		emission = vec3(0.2, 0.75, 1.0) * scan * 0.35;
		rough = 0.18;
	} else if (pattern_id == 10) {
		// Flame lick (animated)
		float flm = sin(p.z * 5.5 + t * 5.0) * sin(p.y * 7.0 - t * 4.0) * 0.5 + 0.5;
		col = mix(base, vec3(1.0, 0.5, 0.1), flm);
		emission = vec3(1.0, 0.3, 0.05) * flm * 0.5;
	} else {
		// Scanlines (animated)
		float sl = step(0.5, fract(p.y * 8.0 + t * 1.2));
		col = mix(base * 0.25, base, sl);
		emission = base * sl * 0.15;
	}

	// Subtle rim emission
	float rim = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	emission += base * rim * 0.22;
	emission += vec3(1.0, 0.85, 0.5) * boost_glow * 0.65;
	col += vec3(0.2, 0.15, 0.08) * boost_glow;

	// Dents discard
	if (dent_count > 0 && dent0.w > 0.01 && length(p - dent0.xyz) < dent0.w) discard;
	if (dent_count > 1 && dent1.w > 0.01 && length(p - dent1.xyz) < dent1.w) discard;
	if (dent_count > 2 && dent2.w > 0.01 && length(p - dent2.xyz) < dent2.w) discard;
	if (dent_count > 3 && dent3.w > 0.01 && length(p - dent3.xyz) < dent3.w) discard;

	ALBEDO = col;
	EMISSION = emission;
	ROUGHNESS = rough;
	SPECULAR = 0.35;
}
