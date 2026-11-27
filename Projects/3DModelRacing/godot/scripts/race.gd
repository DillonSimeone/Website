extends Node3D

const Perf = preload("res://scripts/perf.gd")

var vehicle: Vehicle
var director: RunDirector
var track: Dictionary = {}
var cam: Camera3D
var sky_mat: Material
var stars: CPUParticles3D
var phase := "play"
var mode := "arcade"
var elapsed := 0.0
var clock_on := false
var race_distance := 0.0
var respawn_xf := Transform3D.IDENTITY
var prev_pos := Vector3.ZERO
var shake := 0.0
var pending: Array = []
var ascent_energy := 0.0
var hud_ui: RaceHud
var booting := true
var _first_render_frame := true
var _physics_tick := 0

func _init() -> void:
	Perf.mark("RACE", "_init called")

func _ready() -> void:
	Perf.mark("RACE", "_ready started")
	mode = str(GameState.mode)
	var t0 := Time.get_ticks_msec()
	MeshPrep.request_track(mode, int(GameState.run_seed))
	Perf.mark("RACE", "request_track finished in %d ms" % (Time.get_ticks_msec() - t0))

	t0 = Time.get_ticks_msec()
	hud_ui = RaceHud.new()
	add_child(hud_ui)
	hud_ui.picked.connect(_pick)
	Perf.mark("RACE", "hud_ui created in %d ms" % (Time.get_ticks_msec() - t0))

	_boot_race()

func _boot_race() -> void:
	var t_boot := Time.get_ticks_msec()
	var built: Dictionary = MeshPrep.peek_road(mode, int(GameState.run_seed))
	if built.is_empty():
		Perf.mark("RACE", "ERROR: built road was empty!")
		return

	var pts: PackedVector3Array = built.layout.points
	var min_pt := Vector3(INF, INF, INF)
	var max_pt := Vector3(-INF, -INF, -INF)
	for p in pts:
		min_pt.x = minf(min_pt.x, p.x)
		min_pt.y = minf(min_pt.y, p.y)
		min_pt.z = minf(min_pt.z, p.z)
		max_pt.x = maxf(max_pt.x, p.x)
		max_pt.y = maxf(max_pt.y, p.y)
		max_pt.z = maxf(max_pt.z, p.z)
	var center := (min_pt + max_pt) * 0.5
	var radius := maxf((max_pt.x - min_pt.x) * 0.5, (max_pt.z - min_pt.z) * 0.5)

	var t0 := Time.get_ticks_msec()
	_build_world(center, radius)
	Perf.mark("RACE", "_build_world finished in %d ms" % (Time.get_ticks_msec() - t0))

	t0 = Time.get_ticks_msec()
	track = TrackBuilder.assemble(self, built)
	Perf.mark("RACE", "TrackBuilder.assemble took %d ms" % (Time.get_ticks_msec() - t0))

	t0 = Time.get_ticks_msec()
	_spawn_vehicle()
	Perf.mark("RACE", "_spawn_vehicle took %d ms" % (Time.get_ticks_msec() - t0))

	t0 = Time.get_ticks_msec()
	_spawn_rivals()
	Perf.mark("RACE", "_spawn_rivals took %d ms" % (Time.get_ticks_msec() - t0))

	t0 = Time.get_ticks_msec()
	_triggers()
	Perf.mark("RACE", "_triggers took %d ms" % (Time.get_ticks_msec() - t0))

	if mode == "roguelite":
		director = RunDirector.new()
		add_child(director)
		director.setup(int(GameState.run_seed))
		director.xp_popup.connect(_on_xp)
		director.leveled.connect(_on_level)
		director.wrecked.connect(_on_wreck)
	for barrier in get_tree().get_nodes_in_group("barrier"):
		if barrier.has_signal("smashed"):
			barrier.smashed.connect(_on_barrier)

	respawn_xf = track.spawn
	var spawn_xf: Transform3D = track.spawn
	spawn_xf.origin.y += 1.4
	vehicle.teleport(spawn_xf)
	prev_pos = vehicle.global_position
	_frame_camera(1.0)
	hud_ui.set_boot("", false)
	booting = false
	Perf.mark("RACE", "Total _boot_race finished in %d ms" % (Time.get_ticks_msec() - t_boot))

func _exit_tree() -> void:
	Engine.time_scale = 1.0
	WorldView.clear_lamps()
	if is_inside_tree():
		get_tree().paused = false

func _build_world(center: Vector3, radius: float) -> void:
	sky_mat = WorldView.dress(self, center, radius)
	cam = Camera3D.new()
	cam.fov = 68
	cam.current = true
	add_child(cam)
	stars = CPUParticles3D.new()
	var dot := SphereMesh.new()
	dot.radius = 0.035
	dot.height = 0.07
	stars.mesh = dot
	stars.amount = 140
	stars.lifetime = 2.4
	stars.explosiveness = 0.0
	stars.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	stars.emission_sphere_radius = 16.0
	stars.direction = Vector3.ZERO
	stars.spread = 180.0
	stars.gravity = Vector3.ZERO
	stars.initial_velocity_min = 0.1
	stars.initial_velocity_max = 0.8
	stars.emitting = false
	var star_mat := StandardMaterial3D.new()
	star_mat.albedo_color = Color(1, 1, 1)
	star_mat.emission_enabled = true
	star_mat.emission = Color(0.85, 0.9, 1)
	star_mat.emission_energy = 2.0
	star_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dot.material = star_mat
	add_child(stars)

func _spawn_vehicle() -> void:
	var car: Dictionary = MeshPrep.peek_car()
	vehicle = Vehicle.new()
	vehicle.setup(car.mesh, car.size, car.stats, GameState.color, GameState.pattern_id, GameState.euler_deg)
	add_child(vehicle)
	vehicle.trick.connect(_on_trick)
	vehicle.hard_impact.connect(_on_impact)

func _spawn_rivals() -> void:
	var points: PackedVector3Array = track.points
	if points.size() < 4:
		return
	var acc := 0.0
	var next := 60.0
	var count := 0
	var limit := 8 if mode == "roguelite" else 5
	for i in range(1, points.size()):
		acc += points[i - 1].distance_to(points[i])
		if acc < next:
			continue
		next += 78.0
		if track.has_lip and points[i].distance_to(track.lip) < 28.0:
			continue
		var rival := Rival.new()
		add_child(rival)
		rival.setup(points, i, VehicleLook.COLORS[count % VehicleLook.COLORS.size()], count)
		rival.cruise = 9.5 + float(count % 4) * 1.4
		count += 1
		if count >= limit:
			break

func _triggers() -> void:
	if track.has_lip:
		_area(track.lip, Vector3(18, 8, 18), _on_lip)
	if track.has_finish:
		_area(track.finish, Vector3(18, 7, 14), _on_finish)

func _area(pos: Vector3, size: Vector3, callback: Callable) -> void:
	var area := Area3D.new()
	area.collision_layer = 0
	area.collision_mask = 1 << 1
	area.monitoring = true
	area.monitorable = false
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	area.add_child(shape)
	area.position = pos + Vector3.UP * 2.2
	area.body_entered.connect(func(body: Node) -> void:
		if body.is_in_group("player"):
			callback.call()
	)
	add_child(area)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if phase == "play":
			_show_pause()
		elif phase == "pause":
			_resume()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed("respawn") and phase == "play":
		_teleport(respawn_xf)
		_popup("Respawn", Color(0.8, 0.85, 1))

func _physics_process(delta: float) -> void:
	if vehicle == null or phase == "done" or phase == "level" or phase == "pause":
		return
	if _physics_tick < 8:
		_physics_tick += 1
		Perf.mark("RACE_PHYSICS", "Tick #%d vehicle pos=(%.2f, %.2f, %.2f) vel=(%.2f, %.2f, %.2f) grounded=%d" % [
			_physics_tick,
			vehicle.global_position.x, vehicle.global_position.y, vehicle.global_position.z,
			vehicle.linear_velocity.x, vehicle.linear_velocity.y, vehicle.linear_velocity.z,
			vehicle.grounded
		])
	if phase == "ascent":
		stars.global_position = vehicle.global_position
		return
	var pos := vehicle.global_position
	var step := Vector2(pos.x, pos.z).distance_to(Vector2(prev_pos.x, prev_pos.z))
	if prev_pos != Vector3.ZERO and step < 15.0:
		race_distance += step
		if director:
			director.note_distance(step)
	prev_pos = pos
	if pos.y < -8.0:
		_fail_fall()
		return
	_update_checkpoint()
	_near_miss(delta)

func _process(delta: float) -> void:
	if _first_render_frame:
		_first_render_frame = false
		Perf.finish_transition("RACE")
	if vehicle == null or phase == "level" or phase == "pause" or phase == "done":
		return
	if not clock_on and (vehicle.forward_speed() > 1.0 or Input.is_action_pressed("throttle")):
		clock_on = true
	if clock_on and phase == "play":
		elapsed += delta
	_frame_camera(delta)
	_refresh_hud()
	_pulse_ramp()
	WorldView.update_day_night(delta)
	if phase == "ascent":
		stars.global_position = cam.global_position

func _frame_camera(delta: float) -> void:
	var back := vehicle.global_basis.z
	var dist := 7.2 + vehicle.box_size.z * 0.35
	var height := 2.4 + vehicle.box_size.y * 0.45
	if phase == "ascent":
		dist += 6.0
		height += 3.0
	var want := vehicle.global_position + Vector3.UP * height + back * dist
	var jitter := Vector3(randf_range(-1, 1), randf_range(-1, 1), 0) * shake * 0.35
	cam.global_position = cam.global_position.lerp(want, 1.0 - exp(-4.5 * delta)) + jitter
	var look := vehicle.global_position + Vector3.UP * vehicle.box_size.y * 0.35 - vehicle.global_basis.z * 5.0
	if look.distance_to(cam.global_position) > 0.2:
		cam.look_at(look, Vector3.UP)
	var speed := absf(vehicle.forward_speed())
	cam.fov = lerpf(cam.fov, 68.0 + clampf(speed / 36.0, 0.0, 1.0) * 16.0, 1.0 - exp(-4.0 * delta))
	shake = maxf(shake, vehicle.shake)
	shake = move_toward(shake, 0.0, delta * 1.6)

func _refresh_hud() -> void:
	var spd := maxf(0.0, vehicle.forward_speed())
	var progress := 0.0
	if float(track.length) > 1.0:
		progress = clampf(race_distance / float(track.length), 0.0, 1.0)
	var clock := "%02d:%02d" % [int(elapsed) / 60, int(elapsed) % 60]
	var title_text := "Arcade"
	var sub_text := "%.1f m long · %.1f m wide · %.1f m tall · %.0f kg" % [
		float(vehicle.stats.length), float(vehicle.stats.width), float(vehicle.stats.height), float(vehicle.stats.mass) * 180.0
	]
	var show_health := false
	var health := 1.0
	var nitro := vehicle.nitro_charges
	if director:
		title_text = "Lv %d" % director.level
		sub_text = "XP %d / %d    Integrity %d    %.0f m    Nitro %d" % [
			director.into, director.need, int(director.integrity), director.distance, nitro
		]
		show_health = true
		health = director.integrity / 100.0
	var boost_show := clampf(1.0 - vehicle.boost_cd / 5.0, 0.0, 1.0)
	if vehicle.boost_left > 0.0:
		boost_show = clampf(vehicle.boost_left / 2.7, 0.0, 1.0)
	var show_launch: bool = track.has_lip and phase == "play" and vehicle.global_position.distance_to(track.lip) < 70.0
	hud_ui.drive({
		"speed": int(round(spd * 3.6)),
		"title": title_text,
		"clock": clock,
		"sub": sub_text,
		"progress": progress,
		"boost": boost_show,
		"show_launch": show_launch,
		"launch": _energy(spd) / VehicleStats.LAUNCH_ENERGY,
		"show_health": show_health,
		"health": health,
		"nitro": nitro,
		"points": track.get("points", PackedVector3Array()),
		"player": vehicle.global_position,
		"heading": -vehicle.global_basis.z,
	})

func _pulse_ramp() -> void:
	if track.has("ramp_mat"):
		if track.ramp_mat is StandardMaterial3D:
			var hot := float(vehicle.stats.launch) * vehicle.launch_mult >= VehicleStats.LAUNCH_ENERGY
			if hot:
				track.ramp_mat.emission_enabled = true
				track.ramp_mat.emission = Color(1.0, 0.45, 0.1) * (0.8 + sin(Time.get_ticks_msec() * 0.008) * 0.4)
			else:
				track.ramp_mat.emission_enabled = false
		elif track.ramp_mat is ShaderMaterial:
			var mat: ShaderMaterial = track.ramp_mat
			var hot := float(vehicle.stats.launch) * vehicle.launch_mult >= VehicleStats.LAUNCH_ENERGY
			mat.set_shader_parameter("hot", 1.0 if hot else 0.0)
			mat.set_shader_parameter("pulse", 0.5 + sin(Time.get_ticks_msec() * 0.006) * 0.5)

func _energy(speed: float) -> float:
	return speed * speed / maxf(vehicle.mass, 0.2) * vehicle.launch_mult

func _update_checkpoint() -> void:
	var best := 7.5
	for cp in track.checkpoints:
		var d := vehicle.global_position.distance_to(cp.origin)
		if d < best:
			best = d
			respawn_xf = cp

func _near_miss(delta: float) -> void:
	if director == null or phase != "play":
		return
	for node in get_tree().get_nodes_in_group("rival"):
		if not node is Rival:
			continue
		var rival := node as Rival
		if rival.knocked or rival.get_meta("near", false):
			continue
		var dist := rival.global_position.distance_to(vehicle.global_position)
		if dist < 2.7 and dist > 1.25 and vehicle.forward_speed() > 10.0:
			rival.set_meta("near", true)
			director.add_xp(int(16 * vehicle.trick_xp_mult), "Near miss")

func _on_trick(kind: String, xp: int) -> void:
	if phase != "play":
		return
	if director:
		director.add_xp(xp, kind)
	else:
		_popup(kind, Color(0.75, 0.92, 1))

func _on_impact(point: Vector3, impulse: float) -> void:
	if phase != "play":
		return
	vehicle.add_dent(point, 0.72)
	_chip(point)
	shake = maxf(shake, 0.45)
	Sfx.blip(self, "hit")
	var hit_rival := false
	for node in get_tree().get_nodes_in_group("rival"):
		if not node is Rival:
			continue
		var rival := node as Rival
		if rival.rewarded:
			continue
		if rival.global_position.distance_to(vehicle.global_position) > 3.6:
			continue
		rival.spin_out(vehicle.global_position, vehicle.knockback)
		hit_rival = true
		vehicle.scrub(0.9)
		var xp := int(45 * vehicle.smash_xp_mult)
		if director:
			director.add_xp(xp, "Smash")
		else:
			_popup("Smash", Color(1, 0.82, 0.35))
	var hit_barrier := false
	for node in get_tree().get_nodes_in_group("barrier"):
		if node is Node3D and (node as Node3D).global_position.distance_to(point) < 2.5:
			(node as Node).call("punch", point)
			hit_barrier = true
	if director and not hit_rival and not hit_barrier and impulse > 8.0:
		director.hurt(clampf(impulse * 0.5, 6.0, 22.0))

func _on_barrier(_at: Vector3) -> void:
	if director and phase == "play":
		director.add_xp(12, "Splinter")
		director.hurt(5.0)
	elif phase == "play":
		_popup("Splinter", Color(1, 0.6, 0.3))

func _on_xp(amount: int, reason: String) -> void:
	_popup("+%d %s" % [amount, reason], Color(1.0, 0.86, 0.4))
	Sfx.blip(self, "xp")

func _on_level(choices: Array) -> void:
	if phase != "play":
		if director:
			director.choosing = false
		return
	phase = "level"
	pending = choices
	get_tree().paused = true
	hud_ui.open_choices("Level %d" % (director.level if director else 0), choices)
	Sfx.blip(self, "level")

func _pick(index: int) -> void:
	get_tree().paused = false
	if director:
		director.choose(index, pending, vehicle)
	if phase == "level":
		phase = "play"

func _on_wreck() -> void:
	Sfx.blip(self, "wreck")
	_end("Wrecked")

func _on_lip() -> void:
	if phase != "play":
		return
	var spd := maxf(0.0, vehicle.forward_speed())
	var energy := _energy(spd)
	if energy >= VehicleStats.LAUNCH_ENERGY and spd >= VehicleStats.LAUNCH_MIN_SPEED:
		_ascend(energy)

func _ascend(energy: float) -> void:
	phase = "ascent"
	ascent_energy = energy
	vehicle.begin_ascent()
	Engine.time_scale = 0.62
	if sky_mat is ProceduralSkyMaterial:
		sky_mat.sky_top_color = Color(0.01, 0.01, 0.02)
		sky_mat.sky_horizon_color = Color(0.05, 0.05, 0.1)
		sky_mat.ground_bottom_color = Color(0.01, 0.01, 0.02)
		sky_mat.ground_horizon_color = Color(0.05, 0.05, 0.1)
	elif sky_mat is ShaderMaterial:
		sky_mat.set_shader_parameter("space", 1.0)
	stars.emitting = true
	stars.global_position = cam.global_position
	_popup("The world lets go", Color(0.7, 0.9, 1))
	Sfx.blip(self, "launch")
	await get_tree().create_timer(3.8, true, true).timeout
	if is_inside_tree() and phase == "ascent":
		Engine.time_scale = 1.0
		_end("Ascended")

func _on_finish() -> void:
	if phase != "play":
		return
	_end("Finished")

func _fail_fall() -> void:
	if mode == "roguelite" and director:
		director.hurt(22.0)
		if phase != "play":
			return
	_popup("Off the world", Color(1, 0.55, 0.4))
	_teleport(respawn_xf)

func _end(kind: String) -> void:
	if phase == "done":
		return
	phase = "done"
	get_tree().paused = false
	Engine.time_scale = 1.0
	if kind != "Ascended":
		vehicle.alive = false
	var spd := maxf(0.0, vehicle.forward_speed())
	var energy := ascent_energy if kind == "Ascended" else _energy(spd)
	var xp := director.xp if director else 0
	var dist := director.distance if director else race_distance
	GameState.record_result(kind, energy, xp, dist)
	_show_results(kind, energy, xp, dist)

func _show_results(kind: String, energy: float, xp: int, dist: float) -> void:
	var blurb := "The ramp kept you."
	if kind == "Ascended":
		blurb = "You left the petty world behind."
	elif kind == "Wrecked":
		blurb = "The mesh gave out."
	var body := "%s\nEnergy %.0f    XP %d    Distance %.0f m\n%.1f m long · %.1f m wide · %.1f m tall" % [
		blurb, energy, xp, dist,
		float(vehicle.stats.length), float(vehicle.stats.width), float(vehicle.stats.height)
	]
	hud_ui.open_actions(kind, body, [["Retry", _retry], ["Menu", _menu]])

func _show_pause() -> void:
	phase = "pause"
	get_tree().paused = true
	hud_ui.open_actions("Paused", "", [["Resume", _resume], ["Menu", _menu]])

func _resume() -> void:
	hud_ui.close()
	get_tree().paused = false
	if phase == "pause":
		phase = "play"

func _popup(text: String, color: Color) -> void:
	hud_ui.popup(text, color)

func _chip(at: Vector3) -> void:
	var body := RigidBody3D.new()
	body.collision_layer = 0
	body.collision_mask = 1
	var mesh_node := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.16, 0.12, 0.18)
	mesh_node.mesh = box
	mesh_node.material_override = VehicleLook.material(GameState.color, GameState.pattern_id)
	body.add_child(mesh_node)
	add_child(body)
	body.global_position = at
	body.apply_impulse(Vector3(randf_range(-1, 1), 2.4, randf_range(-1, 1)))
	get_tree().create_timer(2.4).timeout.connect(body.queue_free)

func _teleport(xf: Transform3D) -> void:
	var safe_xf := xf
	safe_xf.origin.y += 1.4
	vehicle.teleport(safe_xf)
	prev_pos = safe_xf.origin
	shake = 0.0
	_frame_camera(1.0)

func _retry() -> void:
	get_tree().paused = false
	Engine.time_scale = 1.0
	get_tree().change_scene_to_file("res://scenes/race.tscn")

func _menu() -> void:
	get_tree().paused = false
	Engine.time_scale = 1.0
	get_tree().change_scene_to_file("res://scenes/main_menu.tscn")
