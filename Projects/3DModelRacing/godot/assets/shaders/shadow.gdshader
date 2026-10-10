shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_never, blend_mix;

uniform vec3 plane_origin = vec3(0.0);
uniform vec3 plane_normal = vec3(0.0, 1.0, 0.0);
uniform float max_lift = 0.9;
uniform float alpha = 0.55;

varying float fade;

void vertex() {
	vec4 world = MODEL_MATRIX * vec4(VERTEX, 1.0);
	float dist = dot(world.xyz - plane_origin, plane_normal);
	fade = clamp(1.0 - dist / max_lift, 0.0, 1.0);
	world.xyz -= plane_normal * (dist - 0.04);
	VERTEX = (inverse(MODEL_MATRIX) * world).xyz;
}

void fragment() {
	ALBEDO = vec3(0.02, 0.02, 0.05);
	ALPHA = alpha * fade * fade;
}
