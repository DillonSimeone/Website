shader_type spatial;
render_mode cull_disabled, diffuse_burley, specular_schlick_ggx;

uniform float hot = 0.0;
uniform float pulse = 0.2;

varying vec3 world_pos;
varying vec4 tint;

void vertex() {
	world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	tint = COLOR;
}

void fragment() {
	vec3 base = tint.rgb;
	float glow = tint.a;

	// Scrolling lane glow
	float lane = smoothstep(0.40, 0.60, fract((world_pos.z + world_pos.x) * 0.065 + TIME * 0.22));

	// Asphalt grain
	float grain = fract(sin(dot(floor(world_pos.xz * 5.0), vec2(12.9898, 78.233))) * 43758.5453);

	vec3 col = base;
	// Normal road: grain + lane glow
	col += vec3(0.06, 0.12, 0.24) * lane * (1.0 - glow);
	col *= 1.0 - (1.0 - glow) * (1.0 - grain) * 0.08;

	// Ramp/curb energy
	float energy = glow * (0.45 + hot * (0.55 + pulse * 0.8));

	// Speed lines on hot ramps
	float speed_line = smoothstep(0.4, 0.5, fract(world_pos.z * 0.3 - TIME * 2.0));
	float ramp_extra = speed_line * hot * glow * 0.3;

	// Edge pulse on normal road
	float edge_pulse = 0.5 + 0.5 * sin(world_pos.z * 0.15 + TIME * 1.2);
	float normal_edge = edge_pulse * (1.0 - glow) * 0.04;

	ALBEDO = col;
	EMISSION = base * energy + vec3(0.15, 0.32, 0.75) * lane * 0.24 * (1.0 - glow) + vec3(1.0, 0.6, 0.15) * ramp_extra + vec3(0.8, 0.35, 0.12) * normal_edge;
	ROUGHNESS = mix(0.48, 0.2, glow);
	METALLIC = 0.14;
}
