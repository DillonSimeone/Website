class_name Vehicle
extends RigidBody3D

signal trick(kind: String, xp: int)
signal hard_impact(point: Vector3, impulse: float)

var stats: Dictionary = {}
var box_size := Vector3(1.2, 0.5, 2.4)
var use_player_input := true
var throttle := 0.0
var brake := 0.0
var steer := 0.0
var launch_mult := 1.0
var spring_mult := 1.0
var spring_damp_mult := 1.0
var upright_mult := 1.0
var downforce_mult := 0.35
var trick_xp_mult := 1.0
var smash_xp_mult := 1.0
var knockback := 1.0
var nitro_charges := 0
var slipstream := false
var magnet := false
var ascend := false
var alive := true

var grounded := 0
var ground_normal := Vector3.UP
var squash := 0.0
var stretch := 0.0
var lean := 0.0
var boost_left := 0.0
var boost_cd := 0.0
var impact_cd := 0.0
var air_time := 0.0
var air_spin := 0.0
var drift_time := 0.0
var drift_cd := 0.0
var prev_speed := 0.0
var prev_vertical := 0.0
var shake := 0.0

var mesh_instance: MeshInstance3D
var shape_node: CollisionShape3D
var material: StandardMaterial3D
var shadow: MeshInstance3D
var shadow_mat: StandardMaterial3D
var dents: Array[Vector4] = []
var bites := 0
var _was_grounded := false

func _init() -> void:
	can_sleep = false
	continuous_cd = true
	contact_monitor = true
	max_contacts_reported = 8
	collision_layer = 1 << 1
	collision_mask = 1 | (1 << 2) | (1 << 3)
	add_to_group("player")
	mesh_instance = MeshInstance3D.new()
	mesh_instance.name = "Mesh"
	add_child(mesh_instance)
	shape_node = CollisionShape3D.new()
	shape_node.name = "Shape"
	add_child(shape_node)

func setup(src_mesh: ArrayMesh, size: Vector3, stat: Dictionary, body_color: Color, pattern: int, euler_deg: Vector3 = Vector3.ZERO) -> void:
	stats = stat.duplicate(true)
	box_size = size
	mass = float(stats.mass)
	var inset := Vector3(size.x * 0.82, maxf(size.y * 0.55, 0.2), size.z * 0.82)
	var box := BoxShape3D.new()
	box.size = inset
	shape_node.shape = box
	shape_node.position = Vector3(0, size.y * 0.12, 0)
	var fitted: Dictionary = MeshFactory.oriented_bounds(src_mesh, euler_deg)
	mesh_instance.mesh = src_mesh
	mesh_instance.basis = fitted.rotation
	mesh_instance.position = Vector3(-fitted.center.x, -fitted.min_v.y - size.y * 0.5, -fitted.center.z)
	material = VehicleLook.material(body_color, pattern)
	mesh_instance.material_override = material

	shadow = MeshInstance3D.new()
	shadow.mesh = src_mesh
	shadow.top_level = true
	shadow_mat = StandardMaterial3D.new()
	shadow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	shadow_mat.albedo_color = Color(0.04, 0.05, 0.08, 0.6)
	shadow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	shadow_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	shadow.material_override = shadow_mat
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shadow)

	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	var tall := clampf((size.y - 0.55) / 2.4, 0.0, 1.0)
	center_of_mass = Vector3(0, lerpf(-size.y * 0.12, size.y * 0.12, tall), 0)
	linear_damp = 0.08
	angular_damp = 0.35

func teleport(xf: Transform3D) -> void:
	global_transform = xf
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	PhysicsServer3D.body_set_state(get_rid(), PhysicsServer3D.BODY_STATE_TRANSFORM, xf)
	PhysicsServer3D.body_set_state(get_rid(), PhysicsServer3D.BODY_STATE_LINEAR_VELOCITY, Vector3.ZERO)
	PhysicsServer3D.body_set_state(get_rid(), PhysicsServer3D.BODY_STATE_ANGULAR_VELOCITY, Vector3.ZERO)
	sleeping = false
	squash = 0.0
	stretch = 0.0
	lean = 0.0

func forward_speed() -> float:
	return linear_velocity.dot(-global_basis.z)

func clear_dents() -> void:
	dents.clear()
	_sync_dents()

func add_dent(world_pos: Vector3, radius: float) -> void:
	var local: Vector3 = mesh_instance.to_local(world_pos)
	dents.append(Vector4(local.x, local.y, local.z, maxf(radius, 0.55)))
	if dents.size() > 4:
		dents.pop_front()
	_sync_dents()
	squash = 1.0
	shake = maxf(shake, 0.45)
	_bite(local)

func scrub(amount: float) -> void:
	linear_velocity *= amount

func begin_ascent() -> void:
	ascend = true
	gravity_scale = 0.12
	var velocity := linear_velocity
	velocity.y = maxf(velocity.y, 9.0)
	linear_velocity = velocity

func _physics_process(delta: float) -> void:
	if not alive:
		return
	impact_cd = maxf(0.0, impact_cd - delta)
	boost_cd = maxf(0.0, boost_cd - delta)
	drift_cd = maxf(0.0, drift_cd - delta)
	if boost_left > 0.0:
		boost_left = maxf(0.0, boost_left - delta)
	_read_input()
	if ascend:
		apply_central_force(Vector3.UP * mass * 22.0)
		angular_velocity *= 0.99
		_sync_visuals(delta)
		return
	_hover(delta)
	_drive(delta)
	_tricks(delta)
	_sync_visuals(delta)
	prev_speed = forward_speed()
	prev_vertical = linear_velocity.y

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	if not alive or ascend:
		return
	var strongest := 0.0
	var at := global_position
	for i in state.get_contact_count():
		var impulse := state.get_contact_impulse(i).length()
		if impulse > strongest:
			strongest = impulse
			at = state.transform * state.get_contact_local_position(i)
	if strongest > 7.0 and impact_cd <= 0.0:
		impact_cd = 0.65
		hard_impact.emit(at, strongest)

func _read_input() -> void:
	if not use_player_input:
		return
	throttle = Input.get_action_strength("throttle")
	brake = Input.get_action_strength("brake")
	steer = Input.get_action_strength("left") - Input.get_action_strength("right")
	var joy_x := Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
	var joy_y := Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)
	if absf(joy_x) > 0.18:
		steer = -joy_x
	if joy_y < -0.18:
		throttle = maxf(throttle, -joy_y)
	elif joy_y > 0.18:
		brake = maxf(brake, joy_y)
	if Input.is_action_just_pressed("boost"):
		if nitro_charges > 0:
			nitro_charges -= 1
			boost_left = 2.7
		elif boost_cd <= 0.0:
			boost_left = 1.05
			boost_cd = 5.0

func _hover(delta: float) -> void:
	var world := get_world_3d()
	if world == null:
		return
	var space := world.direct_space_state
	var bottom_y := -box_size.y * 0.5
	var hx := box_size.x * 0.38
	var hz := box_size.z * 0.38
	var ray_start_y := 0.25
	var locals: Array[Vector3] = [
		Vector3(-hx, ray_start_y, -hz),
		Vector3(hx, ray_start_y, -hz),
		Vector3(-hx, ray_start_y, hz),
		Vector3(hx, ray_start_y, hz),
	]
	var spring_k := 110.0 * spring_mult
	var damp := (2.4 * sqrt(spring_k * mass)) * spring_damp_mult
	var target_h := 0.42
	var target_dist := (ray_start_y - bottom_y) + target_h
	var ray_len := target_dist + 3.2
	grounded = 0
	var ground_y := global_position.y
	var found_ground := false
	var normal_sum := Vector3.ZERO
	var cast_dir := -global_basis.y
	for local in locals:
		var origin: Vector3 = to_global(local)
		var query := PhysicsRayQueryParameters3D.create(origin, origin + cast_dir * ray_len)
		query.exclude = [get_rid()]
		query.collision_mask = 1
		query.hit_back_faces = true
		query.hit_from_inside = true
		var hit: Dictionary = space.intersect_ray(query)
		if hit.is_empty():
			continue
		var n: Vector3 = hit.normal
		if n.dot(Vector3.UP) < 0.0:
			n = -n
		grounded += 1
		found_ground = true
		normal_sum += n
		ground_y = minf(ground_y, hit.position.y)
		var dist := origin.distance_to(hit.position)
		var err := target_dist - dist
		var vel_n := linear_velocity.dot(n)
		var force := err * spring_k - vel_n * damp
		if force > 0.0:
			apply_force(n * force, origin - global_position)
	if not found_ground:
		var from := global_position + Vector3.UP * 2.5
		var rescue := PhysicsRayQueryParameters3D.create(from, from + Vector3.DOWN * 12.0)
		rescue.exclude = [get_rid()]
		rescue.collision_mask = 1
		rescue.hit_back_faces = true
		rescue.hit_from_inside = true
		var hit2: Dictionary = space.intersect_ray(rescue)
		if not hit2.is_empty():
			var floor_y: float = hit2.position.y
			var wanted := floor_y + target_h + box_size.y * 0.5
			if global_position.y < wanted - 0.1:
				var xf := global_transform
				xf.origin.y = wanted
				teleport(xf)
				grounded = 4
				found_ground = true
				ground_y = floor_y
	if normal_sum.length() > 0.01:
		ground_normal = normal_sum.normalized()
	else:
		ground_normal = Vector3.UP
	if grounded > 0 and not _was_grounded:
		var impact_v := maxf(0.0, -prev_vertical)
		squash = maxf(squash, clampf(impact_v / 8.0, 0.35, 0.7))
		if impact_v > 8.0:
			shake = maxf(shake, 0.25)
	_was_grounded = grounded > 0

func _drive(delta: float) -> void:
	var forward := -global_basis.z
	forward = forward.slide(ground_normal)
	if forward.length() < 0.05:
		forward = -global_basis.z
		forward.y = 0.0
	if forward.length() < 0.001:
		forward = Vector3(0, 0, -1)
	forward = forward.normalized()
	var right := forward.cross(Vector3.UP).normalized()
	var speed := linear_velocity.dot(forward)
	var cap := float(stats.top_speed)
	if boost_left > 0.0:
		cap *= 1.35
		apply_central_force(forward * float(stats.accel) * mass * 1.85)
	cap *= _slip_bonus()
	if throttle > 0.0 and speed < cap:
		var ease := lerpf(0.65, 1.0, 1.0 - clampf(speed / cap, 0.0, 1.0))
		apply_central_force(forward * float(stats.accel) * mass * throttle * ease)
	if brake > 0.0:
		apply_central_force(-forward * float(stats.accel) * mass * 0.55 * brake)
	if speed > cap:
		apply_central_force(-forward * (speed - cap) * mass * 6.0)
	else:
		apply_central_force(-forward * speed * mass * 0.02)
	var lateral := linear_velocity.dot(right)
	var grip := float(stats.grip)
	if magnet and absf(speed) < 14.0:
		grip *= 1.35
	if grounded == 0:
		grip *= 0.12
	apply_central_force(-right * lateral * grip * mass * 0.45)
	var yaw_power := float(stats.yaw) * clampf(absf(speed) / 5.0, 0.75, 1.0)
	if grounded == 0:
		yaw_power *= 0.45
	var span := box_size.x * box_size.x + box_size.z * box_size.z
	var yaw_rate := angular_velocity.dot(global_basis.y)
	apply_torque(global_basis.y * (steer * yaw_power * (1.15 + span * 0.28) - yaw_rate * 1.6) * mass)
	var upright := 16.0 * upright_mult * clampf(0.7 / maxf(box_size.y, 0.2), 0.35, 2.2)
	if grounded == 0:
		upright *= 0.22
	var tilt := global_basis.y.cross(Vector3.UP)
	var residual := angular_velocity - global_basis.y * yaw_rate
	var ang_damp := 2.2 if grounded > 0 else 0.2
	apply_torque(tilt * upright * mass - residual * mass * ang_damp)
	if grounded > 0:
		var df := minf(mass * absf(speed) * 0.02 * downforce_mult, mass * 10.0)
		apply_central_force(Vector3.DOWN * df)
	if angular_velocity.length() > 7.5:
		angular_velocity = angular_velocity.normalized() * 7.5

func _slip_bonus() -> float:
	if not slipstream:
		return 1.0
	var best := 1.0
	for node in get_tree().get_nodes_in_group("rival"):
		if not node is Node3D:
			continue
		var to: Vector3 = (node as Node3D).global_position - global_position
		if to.length() < 9.0 and to.dot(-global_basis.z) > 0.0 and absf(to.dot(global_basis.x)) < 2.6:
			best = 1.14
	return best

func _tricks(delta: float) -> void:
	if grounded == 0:
		air_time += delta
		air_spin += angular_velocity.length() * delta
	else:
		if air_time > 0.45:
			var xp := 18
			var kind := "Air"
			if air_spin > 5.5:
				kind = "Wild spin"
				xp = 80
			elif air_spin > 2.2:
				kind = "Flip"
				xp = 48
			trick.emit(kind, int(xp * trick_xp_mult))
		air_time = 0.0
		air_spin = 0.0
		var lateral := absf(linear_velocity.dot(global_basis.x))
		if lateral > 4.5 and absf(forward_speed()) > 8.0:
			drift_time += delta
			if drift_time > 0.75 and drift_cd <= 0.0:
				trick.emit("Drift", int(22 * trick_xp_mult))
				drift_cd = 1.35
				drift_time = 0.0
		else:
			drift_time = maxf(0.0, drift_time - delta)

func _sync_visuals(delta: float) -> void:
	var accel := (forward_speed() - prev_speed) / maxf(delta, 0.001)
	var stretch_target := clampf(accel / 28.0, -1.0, 1.0)
	if boost_left > 0.0:
		stretch_target = 1.0
	stretch = lerpf(stretch, stretch_target, 1.0 - exp(-7.0 * delta))
	squash = move_toward(squash, 0.0, delta * 0.85)
	shake = move_toward(shake, 0.0, delta * 2.4)
	var lat := linear_velocity.dot(global_basis.x)
	lean = lerpf(lean, clampf(-lat / 14.0, -1.0, 1.0), 1.0 - exp(-6.0 * delta))
	var squashed := clampf(squash, 0.0, 0.55)
	var stretched := clampf(stretch, -0.6, 1.0)
	mesh_instance.scale = Vector3(1.0 + squashed * 0.18, 1.0 - squashed * 0.35, 1.0 + stretched * 0.28)
	mesh_instance.rotation.z = lean * 0.35
	if material is StandardMaterial3D:
		if boost_left > 0.0:
			material.emission_enabled = true
			material.emission = Color(1.0, 0.75, 0.25)
			material.emission_energy_multiplier = 1.8
		else:
			material.emission_energy_multiplier = 0.6
	_sync_shadow()

func _sync_shadow() -> void:
	if shadow == null or not is_inside_tree() or ascend:
		if shadow:
			shadow.visible = false
		return

	var space := get_world_3d().direct_space_state
	var from := global_position + Vector3.UP * 0.4
	var to := global_position - Vector3.UP * 24.0
	var query := PhysicsRayQueryParameters3D.create(from, to, 1)
	query.hit_back_faces = true
	query.hit_from_inside = true
	var res := space.intersect_ray(query)
	if res.is_empty():
		shadow.visible = false
		return

	shadow.visible = true
	var hit_pos: Vector3 = res.position
	var hit_norm: Vector3 = res.normal
	if hit_norm.dot(Vector3.UP) < 0.0:
		hit_norm = -hit_norm
	hit_norm = hit_norm.normalized()

	var car_fwd: Vector3 = -global_basis.z
	var ground_fwd := (car_fwd - hit_norm * car_fwd.dot(hit_norm)).normalized()
	if ground_fwd.length() < 0.01:
		ground_fwd = Vector3.FORWARD
	var ground_right := ground_fwd.cross(hit_norm).normalized()

	var car_scale := mesh_instance.scale
	var s_basis := Basis(ground_right * car_scale.x, hit_norm * 0.002, ground_fwd * car_scale.z)
	shadow.global_basis = s_basis * mesh_instance.basis

	var ground_offset := ground_right * mesh_instance.position.x + ground_fwd * mesh_instance.position.z
	shadow.global_position = hit_pos + hit_norm * 0.035 + ground_offset

	var height := global_position.y - hit_pos.y
	var alpha_val := clampf(1.0 - height / 14.0, 0.15, 0.62)
	if shadow_mat:
		shadow_mat.albedo_color.a = alpha_val

func _sync_dents() -> void:
	pass

func _bite(local: Vector3) -> void:
	if bites >= 3 or mesh_instance.mesh == null:
		return
	var cut := MeshBoolean.subtract_sphere(mesh_instance.mesh, local, 0.72)
	if cut == null:
		return
	bites += 1
	mesh_instance.mesh = cut
	if shadow:
		shadow.mesh = cut
