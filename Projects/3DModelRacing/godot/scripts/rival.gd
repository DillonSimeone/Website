class_name Rival
extends CharacterBody3D

signal smashed(at: Vector3, xp: int)

var path: PackedVector3Array = PackedVector3Array()
var idx := 0
var cruise := 12.0
var knocked := false
var rewarded := false
var knock_time := 0.0
var xp_value := 45
var lane_offset := 0.0
var target_lane := 0.0
var lane_timer := 0.0
var shadow: MeshInstance3D
var shadow_mat: StandardMaterial3D

func _ready() -> void:
	add_to_group("rival")
	motion_mode = CharacterBody3D.MOTION_MODE_FLOATING
	collision_layer = 1 << 3
	collision_mask = (1 << 1) | (1 << 2)

func setup(points: PackedVector3Array, start_index: int, body_color: Color, kind: int) -> void:
	path = points
	idx = clampi(start_index, 0, maxi(points.size() - 1, 0))

	# Distribute rivals across distinct lanes across the road width (never in the center divider!)
	var lanes: Array[float] = [-3.0, 2.8, -1.8, 1.8, -2.4, 2.4]
	lane_offset = lanes[kind % lanes.size()]
	target_lane = lane_offset
	lane_timer = 2.0 + float(kind % 3) * 1.5

	var mesh_node := MeshInstance3D.new()
	mesh_node.name = "Mesh"
	var base_mesh: ArrayMesh = MeshFactory.default_vehicle()
	mesh_node.mesh = base_mesh

	# 3 aerodynamic vehicle profiles for variety (no boxes or spheres)
	if kind % 3 == 0:
		mesh_node.scale = Vector3(0.55, 0.45, 0.6) # Formula wedge kart
		mesh_node.position.y = 0.2
	elif kind % 3 == 1:
		mesh_node.scale = Vector3(0.68, 0.48, 0.52) # Wide-body speeder
		mesh_node.position.y = 0.2
	else:
		mesh_node.scale = Vector3(0.5, 0.5, 0.58) # Sleek aero cruiser
		mesh_node.position.y = 0.2

	mesh_node.material_override = VehicleLook.material(body_color, (kind + 2) % VehicleLook.PATTERNS.size())
	add_child(mesh_node)

	shadow = MeshInstance3D.new()
	shadow.mesh = mesh_node.mesh
	shadow.top_level = true
	shadow_mat = StandardMaterial3D.new()
	shadow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	shadow_mat.albedo_color = Color(0.04, 0.05, 0.08, 0.55)
	shadow_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	shadow_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	shadow.material_override = shadow_mat
	shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(shadow)

	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = Vector3(1.3, 0.7, 2.0)
	shape.shape = box_shape
	shape.position.y = 0.45
	add_child(shape)

	if idx < path.size():
		var next_i := mini(idx + 1, path.size() - 1)
		var fwd := (path[next_i] - path[idx])
		fwd.y = 0.0
		if fwd.length() < 0.01:
			fwd = Vector3(0, 0, -1)
		var right_vec := fwd.normalized().cross(Vector3.UP).normalized()
		global_position = path[idx] + right_vec * lane_offset + Vector3.UP * 0.55

func _physics_process(delta: float) -> void:
	if path.size() < 2:
		return
	if knocked:
		velocity.y -= 12.0 * delta
		knock_time += delta
		move_and_slide()
		if shadow:
			shadow.visible = false
		if knock_time > 2.4:
			if shadow:
				shadow.queue_free()
			queue_free()
		return

	# Dynamic lane changing & overtaking logic
	lane_timer -= delta
	if lane_timer <= 0.0:
		lane_timer = randf_range(3.0, 7.0)
		var lane_choices: Array[float] = [-3.0, -1.8, 1.8, 3.0]
		target_lane = lane_choices[randi() % lane_choices.size()]

	lane_offset = move_toward(lane_offset, target_lane, delta * 2.5)

	var pt: Vector3 = path[idx]
	var next_idx := mini(idx + 1, path.size() - 1)
	var track_dir := (path[next_idx] - pt)
	track_dir.y = 0.0
	if track_dir.length() < 0.01:
		track_dir = Vector3(0, 0, -1)
	var right_vec := track_dir.normalized().cross(Vector3.UP).normalized()
	var target := pt + right_vec * lane_offset

	var to := target - global_position
	to.y = 0.0
	if to.length() < 3.8:
		idx = mini(idx + 1, path.size() - 1)
		pt = path[idx]
		next_idx = mini(idx + 1, path.size() - 1)
		track_dir = (path[next_idx] - pt)
		track_dir.y = 0.0
		if track_dir.length() < 0.01:
			track_dir = Vector3(0, 0, -1)
		right_vec = track_dir.normalized().cross(Vector3.UP).normalized()
		target = pt + right_vec * lane_offset
		to = target - global_position
		to.y = 0.0

	var dir := Vector3(0, 0, -1)
	if to.length() > 0.05:
		dir = to.normalized()

	velocity = dir * cruise
	velocity.y = clampf((target.y + 0.55 - global_position.y) * 5.0, -8.0, 8.0)
	if dir.length() > 0.1:
		look_at(global_position + dir, Vector3.UP)
	move_and_slide()
	_sync_shadow()

func _sync_shadow() -> void:
	if shadow == null or not is_inside_tree() or knocked:
		if shadow:
			shadow.visible = false
		return
	var space := get_world_3d().direct_space_state
	var from := global_position + Vector3.UP * 0.3
	var to := global_position - Vector3.UP * 10.0
	var query := PhysicsRayQueryParameters3D.create(from, to, 1)
	query.hit_back_faces = true
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
	var fwd := -global_basis.z
	var gfwd := (fwd - hit_norm * fwd.dot(hit_norm)).normalized()
	shadow.global_position = hit_pos + hit_norm * 0.03
	var mesh_node: MeshInstance3D = get_node_or_null("Mesh")
	var s_scale := mesh_node.scale if mesh_node else Vector3(0.55, 0.5, 0.55)
	shadow.global_basis = Basis(gright * s_scale.x, hit_norm * 0.002, gfwd * s_scale.z)

func _exit_tree() -> void:
	if shadow and is_instance_valid(shadow):
		shadow.queue_free()

func spin_out(from: Vector3, power: float) -> void:
	if knocked:
		return
	knocked = true
	rewarded = true
	collision_layer = 0
	collision_mask = 1
	var away := global_position - from
	away.y = 0.0
	if away.length() < 0.1:
		away = Vector3.RIGHT
	velocity = away.normalized() * 13.0 * power + Vector3.UP * 5.5
	smashed.emit(global_position, xp_value)
