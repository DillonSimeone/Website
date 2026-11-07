class_name WorldView
extends RefCounted

static var active_sun: DirectionalLight3D
static var active_fill: DirectionalLight3D
static var active_env: Environment
static var active_sky: ProceduralSkyMaterial
static var time_of_day: float = 0.15 # Starts in bright mid-morning
static var street_lamps: Array[Dictionary] = []
static var stars_particles: CPUParticles3D

static func clear_lamps() -> void:
	street_lamps.clear()

static func register_lamp(bulb_mat: StandardMaterial3D, pool_mat: StandardMaterial3D, light: OmniLight3D = null) -> void:
	street_lamps.append({
		"bulb": bulb_mat,
		"pool": pool_mat,
		"light": light
	})

static func dress(parent: Node3D, track_center: Vector3 = Vector3(0, 0, -350), track_radius: float = 400.0) -> Material:
	clear_lamps()
	time_of_day = 0.15

	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.24, 0.62, 0.98) # Bright Mario Kart blue
	sky_mat.sky_horizon_color = Color(0.72, 0.88, 1.0)
	sky_mat.ground_bottom_color = Color(0.22, 0.58, 0.28)
	sky_mat.ground_horizon_color = Color(0.55, 0.82, 0.45)
	sky_mat.sun_angle_max = 35.0
	sky_mat.energy_multiplier = 1.25
	active_sky = sky_mat

	var sky := Sky.new()
	sky.sky_material = sky_mat

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.8, 0.88)
	env.ambient_light_energy = 1.05
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	active_env = env

	var world := WorldEnvironment.new()
	world.environment = env
	parent.add_child(world)

	# Main warm bright sunlight
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45, 35, 0)
	sun.light_color = Color(1.0, 0.98, 0.92)
	sun.light_energy = 1.3
	sun.shadow_enabled = false
	parent.add_child(sun)
	active_sun = sun

	# Soft sky fill
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-20, -145, 0)
	fill.light_color = Color(0.65, 0.8, 1.0)
	fill.light_energy = 0.45
	fill.shadow_enabled = false
	parent.add_child(fill)
	active_fill = fill

	_ground(parent, track_center)
	_peaks(parent, track_center, track_radius)
	_hot_air_balloons(parent, track_center, track_radius)

	return sky_mat

static func update_day_night(delta: float) -> void:
	if active_sun == null or active_sky == null or active_env == null:
		return

	# Smooth continuous day-night cycle (approx 85 seconds for a complete loop)
	time_of_day = fposmod(time_of_day + delta * (1.0 / 85.0), 1.0)
	var t := time_of_day

	# Sun circular path across sky
	var sun_yaw := t * 360.0
	var sun_pitch := sin(t * TAU) * 62.0 - 12.0
	active_sun.rotation_degrees = Vector3(sun_pitch, sun_yaw, 0.0)
	active_fill.rotation_degrees = Vector3(-sun_pitch * 0.5, sun_yaw + 180.0, 0.0)

	# Calculate night factor: 0.0 = daytime, 1.0 = full night
	var night_factor := 0.0
	if t >= 0.46 and t <= 0.88:
		if t < 0.56:
			night_factor = (t - 0.46) / 0.10
		elif t > 0.80:
			night_factor = 1.0 - (t - 0.80) / 0.08
		else:
			night_factor = 1.0

	# Calculate sunset factor: peaks around t = 0.48
	var sunset_factor := clampf(1.0 - absf(t - 0.48) / 0.08, 0.0, 1.0)
	# Calculate dawn factor: peaks around t = 0.90
	var dawn_factor := clampf(1.0 - absf(t - 0.90) / 0.08, 0.0, 1.0)

	# Dynamic Sky Colors
	var day_sky := Color(0.24, 0.62, 0.98)
	var day_horiz := Color(0.72, 0.88, 1.0)
	var sunset_sky := Color(0.82, 0.38, 0.25)
	var sunset_horiz := Color(1.0, 0.72, 0.32)
	var night_sky := Color(0.04, 0.05, 0.14)
	var night_horiz := Color(0.12, 0.15, 0.28)
	var dawn_sky := Color(0.52, 0.38, 0.68)
	var dawn_horiz := Color(1.0, 0.75, 0.55)

	var cur_sky := day_sky
	var cur_horiz := day_horiz

	if sunset_factor > 0.0:
		cur_sky = cur_sky.lerp(sunset_sky, sunset_factor)
		cur_horiz = cur_horiz.lerp(sunset_horiz, sunset_factor)
	if dawn_factor > 0.0:
		cur_sky = cur_sky.lerp(dawn_sky, dawn_factor)
		cur_horiz = cur_horiz.lerp(dawn_horiz, dawn_factor)
	if night_factor > 0.0:
		cur_sky = cur_sky.lerp(night_sky, night_factor)
		cur_horiz = cur_horiz.lerp(night_horiz, night_factor)

	active_sky.sky_top_color = cur_sky
	active_sky.sky_horizon_color = cur_horiz
	active_sky.ground_bottom_color = Color(0.22, 0.58, 0.28).lerp(Color(0.04, 0.08, 0.05), night_factor)
	active_sky.ground_horizon_color = cur_horiz * 0.75
	active_sky.energy_multiplier = lerpf(1.25, 0.45, night_factor)

	# Sun light intensity & color
	var day_sun_col := Color(1.0, 0.98, 0.92)
	var sunset_sun_col := Color(1.0, 0.55, 0.2)
	var night_moon_col := Color(0.55, 0.68, 0.92)
	var dawn_sun_col := Color(1.0, 0.75, 0.48)

	var cur_sun_col := day_sun_col
	if sunset_factor > 0.0:
		cur_sun_col = cur_sun_col.lerp(sunset_sun_col, sunset_factor)
	if dawn_factor > 0.0:
		cur_sun_col = cur_sun_col.lerp(dawn_sun_col, dawn_factor)
	if night_factor > 0.0:
		cur_sun_col = cur_sun_col.lerp(night_moon_col, night_factor)

	active_sun.light_color = cur_sun_col
	active_sun.light_energy = lerpf(1.3, 0.25, night_factor)
	active_fill.light_energy = lerpf(0.45, 0.12, night_factor)

	# Ambient light
	active_env.ambient_light_color = Color(0.75, 0.8, 0.88).lerp(Color(0.18, 0.22, 0.38), night_factor)
	active_env.ambient_light_energy = lerpf(1.05, 0.38, night_factor)

	# Street Lamps: turn on during dusk and stay on through the night!
	var lamp_glow := lerpf(0.0, 3.2, night_factor)
	var pool_alpha := lerpf(0.0, 0.45, night_factor)
	var light_pwr := lerpf(0.0, 1.6, night_factor)

	for lamp in street_lamps:
		var bulb: StandardMaterial3D = lamp.bulb
		var pool: StandardMaterial3D = lamp.pool
		var light: OmniLight3D = lamp.light
		if bulb:
			bulb.emission_energy_multiplier = lamp_glow
		if pool:
			pool.albedo_color.a = pool_alpha
		if light:
			light.light_energy = light_pwr

static func _ground(parent: Node3D, center: Vector3) -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(4000, 4000)
	var mesh := MeshInstance3D.new()
	mesh.mesh = plane
	mesh.position = Vector3(center.x, -14.0, center.z)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.28, 0.68, 0.32) # Vibrant Mario Kart emerald grass!
	mat.roughness = 0.85
	mesh.material_override = mat
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mesh)

static func _peaks(parent: Node3D, center: Vector3, min_radius: float) -> void:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var rng := RandomNumberGenerator.new()
	rng.seed = 11

	var inner_r := maxf(min_radius + 220.0, 650.0)
	var outer_r := inner_r + 450.0
	var count := 40
	var first_in := Vector3.ZERO
	var first_out := Vector3.ZERO
	var previous_in := Vector3.ZERO
	var previous_out := Vector3.ZERO

	for i in count + 1:
		var inner := Vector3.ZERO
		var outer := Vector3.ZERO
		if i == count:
			inner = first_in
			outer = first_out
		else:
			var angle := TAU * float(i) / float(count)
			var radius := outer_r + rng.randf_range(-40.0, 60.0)
			var height := 120.0 + rng.randf_range(0.0, 160.0)
			inner = Vector3(center.x + cos(angle) * inner_r, -14.0, center.z + sin(angle) * inner_r)
			outer = Vector3(center.x + cos(angle) * radius, -14.0 + height, center.z + sin(angle) * radius)
			if i == 0:
				first_in = inner
				first_out = outer
		if i > 0:
			var shade := 0.65 + rng.randf_range(-0.08, 0.08)
			var color := Color(0.22 * shade, 0.58 * shade, 0.28 * shade) if (i % 2 == 0) else Color(0.78 * shade, 0.58 * shade, 0.38 * shade)
			_tri(tool, previous_in, inner, outer, color)
			_tri(tool, previous_in, outer, previous_out, color)
		previous_in = inner
		previous_out = outer

	var mesh := MeshInstance3D.new()
	mesh.mesh = tool.commit()
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.roughness = 0.8
	mesh.material_override = mat
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mesh)

static func _hot_air_balloons(parent: Node3D, center: Vector3, radius: float) -> void:
	# Colorful hot air balloons in the distant sky over the hills
	var balloon_data: Array[Dictionary] = [
		{"pos": center + Vector3(-220, 65, -180), "color1": Color(0.95, 0.2, 0.22), "color2": Color(1.0, 0.9, 0.2), "scale": 1.4},
		{"pos": center + Vector3(260, 85, -340), "color1": Color(0.18, 0.65, 1.0), "color2": Color(1.0, 1.0, 1.0), "scale": 1.6},
		{"pos": center + Vector3(-180, 75, -520), "color1": Color(0.95, 0.55, 0.12), "color2": Color(0.3, 0.85, 0.3), "scale": 1.5}
	]

	for data in balloon_data:
		var root := Node3D.new()
		root.position = data.pos
		root.scale = Vector3.ONE * float(data.scale)
		parent.add_child(root)

		# Upper balloon envelope
		var env_mesh := MeshInstance3D.new()
		var sp := SphereMesh.new()
		sp.radius = 4.2
		sp.height = 7.5
		env_mesh.mesh = sp
		var b_mat := StandardMaterial3D.new()
		b_mat.albedo_color = data.color1
		b_mat.roughness = 0.5
		env_mesh.material_override = b_mat
		root.add_child(env_mesh)

		# Basket
		var basket := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(1.2, 1.0, 1.2)
		basket.mesh = box
		basket.position = Vector3(0, -5.2, 0)
		var bs_mat := StandardMaterial3D.new()
		bs_mat.albedo_color = Color(0.48, 0.32, 0.18)
		basket.material_override = bs_mat
		root.add_child(basket)

static func _tri(tool: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, color: Color) -> void:
	for point in [a, b, c]:
		tool.set_normal(Vector3.UP)
		tool.set_color(color)
		tool.add_vertex(point)
