class_name TrackBuilder
extends RefCounted

static func construct(parent: Node3D, layout: Dictionary) -> Dictionary:
	return assemble(parent, RoadMesh.build(layout))

static func assemble(parent: Node3D, built: Dictionary) -> Dictionary:
	var layout: Dictionary = built.layout
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.roughness = 0.45
	mat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX

	var road := MeshInstance3D.new()
	road.mesh = built.mesh
	road.material_override = mat
	road.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(road)

	_colliders(parent, built.get("mesh", null))
	_props(parent, layout, built)

	built["ramp_mat"] = mat
	built["points"] = layout.points
	built["tags"] = layout.tags
	return built

static func _colliders(parent: Node3D, mesh: ArrayMesh) -> void:
	var body := StaticBody3D.new()
	body.collision_layer = 1
	body.collision_mask = 0
	parent.add_child(body)
	if mesh:
		var shape := CollisionShape3D.new()
		var trimesh := mesh.create_trimesh_shape()
		if trimesh is ConcavePolygonShape3D:
			(trimesh as ConcavePolygonShape3D).backface_collision = true
		shape.shape = trimesh
		body.add_child(shape)

static func _props(parent: Node3D, layout: Dictionary, built: Dictionary) -> void:
	var points: PackedVector3Array = layout.points
	var tags: PackedInt32Array = layout.tags
	var widths: PackedFloat32Array = layout.widths

	var pier_mat := StandardMaterial3D.new()
	pier_mat.albedo_color = Color(0.35, 0.38, 0.45)
	pier_mat.roughness = 0.75

	var neon_mat := StandardMaterial3D.new()
	neon_mat.albedo_color = Color(0.2, 0.85, 1.0)
	neon_mat.emission_enabled = true
	neon_mat.emission = Color(0.2, 0.85, 1.0)
	neon_mat.emission_energy_multiplier = 1.4

	# Shared materials for trees
	var foliage_mat := StandardMaterial3D.new()
	foliage_mat.albedo_color = Color(0.2, 0.75, 0.28)
	foliage_mat.roughness = 0.7

	var pine_mat := StandardMaterial3D.new()
	pine_mat.albedo_color = Color(0.12, 0.52, 0.22)
	pine_mat.roughness = 0.8

	var trunk_mat := StandardMaterial3D.new()
	trunk_mat.albedo_color = Color(0.45, 0.28, 0.15)
	trunk_mat.roughness = 0.9

	var lamp_count := 0

	for i in range(1, points.size() - 1):
		var tag := int(tags[i])
		var p: Vector3 = points[i]
		var fwd: Vector3 = (points[mini(i + 1, points.size() - 1)] - p)
		fwd.y = 0.0
		if fwd.length() < 0.05:
			continue
		fwd = fwd.normalized()
		var right := fwd.cross(Vector3.UP).normalized()
		var half_w: float = float(widths[i]) * 0.5

		# 1. Bridge Support Piers (descend all the way to base elevation)
		if (tag & TrackLayouts.BRIDGE_TAG) != 0 and i % 4 == 0:
			var pier_h: float = p.y - (-14.0)
			if pier_h > 2.0:
				for side_val in [-1.0, 1.0]:
					var side: float = float(side_val)
					var pier := MeshInstance3D.new()
					var cyl := CylinderMesh.new()
					cyl.top_radius = 0.4
					cyl.bottom_radius = 0.6
					cyl.height = pier_h
					pier.mesh = cyl
					pier.material_override = pier_mat
					var pier_pos: Vector3 = p + right * (side * (half_w - 0.5)) + Vector3.DOWN * (pier_h * 0.5)
					pier.position = pier_pos
					parent.add_child(pier)

		# 2. Continuous 3D Street Lamps (anchored firmly to curb with lights & road glow)
		if i % 4 == 0 and (tag & TrackLayouts.RAMP) == 0:
			var lamp_side: float = 1.0 if (lamp_count % 2 == 0) else -1.0
			var add_light: bool = (lamp_count % 3 == 0)
			_street_lamp(parent, p, right, lamp_side, half_w, add_light)
			lamp_count += 1

		# 3. Continuous Curve Safety Guardrails on outer bends
		var curve_val: float = right.dot(Vector3.FORWARD)
		if absf(curve_val) > 0.2 and (tag & TrackLayouts.RAMP) == 0:
			var outer_side: float = 1.0 if curve_val > 0.0 else -1.0
			_guardrail_segment(parent, p, points[mini(i + 1, points.size() - 1)], right, outer_side, half_w)

		# 4. Turn Chevron Direction Signs
		if i % 6 == 0 and absf(curve_val) > 0.28 and (tag & TrackLayouts.RAMP) == 0:
			var sign_side: float = 1.0 if curve_val > 0.0 else -1.0
			var sign_pos: Vector3 = p + right * (sign_side * (half_w + 2.2)) + Vector3.UP * 1.5
			_chevron_sign(parent, sign_pos, fwd)

		# 5. Spectator Bleachers / Grandstands with cheering crowds on straights
		if (i == 4 or i == 28 or i == 52 or i == 76) and (tag & TrackLayouts.RAMP) == 0:
			_grandstand(parent, p, right, 1.0, half_w, fwd)

		# 6. Roadside Sponsor & Distance Billboards
		if (i == 16 or i == 44 or i == 68) and (tag & TrackLayouts.RAMP) == 0:
			var bill_text := "★ SUPER MODEL GP ★" if i == 16 else ("TURBO SPEEDWAY" if i == 44 else "★ FINAL STRETCH ★")
			_billboard(parent, p, right, -1.0, half_w, fwd, bill_text)

		# 7. Dense Tree Clusters (properly anchored to the embankment, never floating!)
		if i % 3 == 0 and (tag & TrackLayouts.RAMP) == 0:
			for side_val in [-1.0, 1.0]:
				var side: float = float(side_val)
				var tree_dist: float = half_w + 3.8 + float((i * 7) % 5)
				var tree_pos: Vector3 = p + right * (side * tree_dist)
				# Anchor tree to road embankment elevation p.y
				tree_pos.y = p.y
				var is_pine: bool = ((i + int(side > 0)) % 2 == 0)
				_tree(parent, tree_pos, 1.0 + float(i % 3) * 0.2, is_pine, foliage_mat, pine_mat, trunk_mat)

	# Start banner arch
	_start_gantry(parent, points[1], points[3] - points[1], float(widths[1]))

	# Launch towers at Star Ramp
	if built.has_lip:
		_launch_towers(parent, built.lip, neon_mat)

	# Floating cartoon clouds in the blue sky
	_clouds(parent, points[points.size() / 2])

static func _street_lamp(parent: Node3D, p: Vector3, right: Vector3, side: float, half_w: float, with_omni: bool) -> void:
	var lamp_root := Node3D.new()
	var curb_pos: Vector3 = p + right * (side * (half_w + 0.65))
	lamp_root.position = curb_pos
	parent.add_child(lamp_root)

	var metal_mat := StandardMaterial3D.new()
	metal_mat.albedo_color = Color(0.22, 0.25, 0.3)
	metal_mat.roughness = 0.6

	# 1. Base mount on curb sunk deep into ground
	var base := MeshInstance3D.new()
	var b_cyl := CylinderMesh.new()
	b_cyl.top_radius = 0.26
	b_cyl.bottom_radius = 0.36
	b_cyl.height = 1.8
	base.mesh = b_cyl
	base.material_override = metal_mat
	base.position.y = -0.5 # Extends 1.4m down into curb/ground
	lamp_root.add_child(base)

	# 2. Main vertical lamp post (5.2m tall)
	var pole := MeshInstance3D.new()
	var p_cyl := CylinderMesh.new()
	p_cyl.top_radius = 0.1
	p_cyl.bottom_radius = 0.16
	p_cyl.height = 5.2
	pole.mesh = p_cyl
	pole.material_override = metal_mat
	pole.position.y = 2.6
	lamp_root.add_child(pole)

	# 3. Curved Overhang Arm reaching out over the road
	var arm := MeshInstance3D.new()
	var a_box := BoxMesh.new()
	a_box.size = Vector3(1.6, 0.12, 0.12)
	arm.mesh = a_box
	arm.material_override = metal_mat
	arm.position = Vector3(-side * 0.8, 5.1, 0.0)
	arm.rotation.z = -side * deg_to_rad(15)
	lamp_root.add_child(arm)

	# 4. Lantern Hood Fixture
	var hood := MeshInstance3D.new()
	var h_cyl := CylinderMesh.new()
	h_cyl.top_radius = 0.35
	h_cyl.bottom_radius = 0.22
	h_cyl.height = 0.3
	hood.mesh = h_cyl
	hood.material_override = metal_mat
	var head_pos := Vector3(-side * 1.5, 4.85, 0.0)
	hood.position = head_pos
	lamp_root.add_child(hood)

	# 5. Glowing Emissive Bulb
	var bulb := MeshInstance3D.new()
	var b_sp := SphereMesh.new()
	b_sp.radius = 0.18
	b_sp.height = 0.28
	bulb.mesh = b_sp
	var bulb_mat := StandardMaterial3D.new()
	bulb_mat.albedo_color = Color(1.0, 0.94, 0.75)
	bulb_mat.emission_enabled = true
	bulb_mat.emission = Color(1.0, 0.86, 0.42)
	bulb_mat.emission_energy_multiplier = 0.0 # Off during midday, lights up at dusk!
	bulb.material_override = bulb_mat
	bulb.position = head_pos + Vector3.DOWN * 0.12
	lamp_root.add_child(bulb)

	# 6. Warm Lamplight Pool on the Asphalt below the lamp
	var pool := MeshInstance3D.new()
	var p_cyl_mesh := CylinderMesh.new()
	p_cyl_mesh.top_radius = 2.8
	p_cyl_mesh.bottom_radius = 3.2
	p_cyl_mesh.height = 0.02
	pool.mesh = p_cyl_mesh
	var pool_mat := StandardMaterial3D.new()
	pool_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	pool_mat.albedo_color = Color(1.0, 0.88, 0.42, 0.0)
	pool_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	pool.material_override = pool_mat
	pool.position = Vector3(-side * 1.5, 0.04, 0.0)
	lamp_root.add_child(pool)

	# 7. Optional Physical OmniLight3D
	var light: OmniLight3D = null
	if with_omni:
		light = OmniLight3D.new()
		light.light_color = Color(1.0, 0.85, 0.48)
		light.omni_range = 14.0
		light.omni_attenuation = 1.3
		light.light_energy = 0.0 # Off during day, ramps up at dusk
		light.shadow_enabled = false
		light.position = head_pos + Vector3.DOWN * 0.3
		lamp_root.add_child(light)

	WorldView.register_lamp(bulb_mat, pool_mat, light)

static func _guardrail_segment(parent: Node3D, p0: Vector3, p1: Vector3, right: Vector3, side: float, half_w: float) -> void:
	var rail_root := Node3D.new()
	var pos: Vector3 = p0 + right * (side * (half_w + 0.55))
	rail_root.position = pos
	parent.add_child(rail_root)

	var step := p0.distance_to(p1)
	var rail_mat := StandardMaterial3D.new()
	rail_mat.albedo_color = Color(0.95, 0.2, 0.22) if (int(p0.z) % 2 == 0) else Color(0.98, 0.98, 1.0)
	rail_mat.roughness = 0.4

	# Horizontal curved barrier beam
	var beam := MeshInstance3D.new()
	var b_mesh := BoxMesh.new()
	b_mesh.size = Vector3(0.18, 0.45, maxf(step, 4.0))
	beam.mesh = b_mesh
	beam.material_override = rail_mat
	beam.position = Vector3(0, 0.55, -step * 0.5)
	rail_root.add_child(beam)

	# Vertical support post sunk deep into ground
	var post := MeshInstance3D.new()
	var p_mesh := BoxMesh.new()
	p_mesh.size = Vector3(0.12, 3.5, 0.12)
	post.mesh = p_mesh
	var p_mat := StandardMaterial3D.new()
	p_mat.albedo_color = Color(0.35, 0.38, 0.42)
	post.material_override = p_mat
	post.position = Vector3(0, -1.0, 0) # Penetrates 2.7m into the earth
	rail_root.add_child(post)

static func _grandstand(parent: Node3D, p: Vector3, right: Vector3, side: float, half_w: float, fwd: Vector3) -> void:
	var stand_root := Node3D.new()
	var stand_pos: Vector3 = p + right * (side * (half_w + 5.5))
	stand_root.position = stand_pos
	parent.add_child(stand_root)

	var wood_mat := StandardMaterial3D.new()
	wood_mat.albedo_color = Color(0.72, 0.55, 0.38) # Bleacher wood

	var steel_mat := StandardMaterial3D.new()
	steel_mat.albedo_color = Color(0.3, 0.35, 0.42)

	var canopy_mat := StandardMaterial3D.new()
	canopy_mat.albedo_color = Color(0.95, 0.22, 0.22) # Mario Kart red-and-white awning

	# Foundation pillars sunk deep into the ground
	for post_i in 4:
		var p_pillar := MeshInstance3D.new()
		var p_cyl := CylinderMesh.new()
		p_cyl.top_radius = 0.18
		p_cyl.bottom_radius = 0.25
		p_cyl.height = 6.0
		p_pillar.mesh = p_cyl
		p_pillar.material_override = steel_mat
		p_pillar.position = Vector3(float(post_i % 2) * 2.5 * side, -1.5, float(post_i / 2) * 8.0 - 4.0)
		stand_root.add_child(p_pillar)

	# 3 Tiers of benches
	for tier in 3:
		var bench := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(1.4, 0.4, 10.0)
		bench.mesh = box
		bench.material_override = wood_mat
		bench.position = Vector3(float(tier) * 1.2 * side, float(tier) * 0.75 + 0.35, 0)
		stand_root.add_child(bench)

		# Cheering crowd spectator figures along each tier
		for fan_j in 5:
			var fan := MeshInstance3D.new()
			var sp := SphereMesh.new()
			sp.radius = 0.25
			sp.height = 0.5
			fan.mesh = sp
			var f_mat := StandardMaterial3D.new()
			var fan_colors: Array[Color] = [Color(0.95, 0.2, 0.2), Color(0.2, 0.6, 1.0), Color(1.0, 0.9, 0.2), Color(0.3, 0.8, 0.3)]
			f_mat.albedo_color = fan_colors[(tier * 5 + fan_j) % fan_colors.size()]
			fan.material_override = f_mat
			fan.position = Vector3(float(tier) * 1.2 * side, float(tier) * 0.75 + 0.85, float(fan_j - 2) * 1.8)
			stand_root.add_child(fan)

	# Canopy Roof Overhead
	var roof := MeshInstance3D.new()
	var r_box := BoxMesh.new()
	r_box.size = Vector3(4.8, 0.2, 10.5)
	roof.mesh = r_box
	roof.material_override = canopy_mat
	roof.position = Vector3(1.2 * side, 3.8, 0)
	roof.rotation.z = -side * deg_to_rad(10)
	stand_root.add_child(roof)

	# Front Cheering Banner
	var banner := Label3D.new()
	banner.text = "★ MODEL RACING GRAND PRIX ★"
	banner.font_size = 46
	banner.position = Vector3(-side * 0.8, 1.2, 0)
	banner.modulate = Color(1.0, 0.9, 0.2)
	banner.outline_modulate = Color(0.8, 0.1, 0.1)
	banner.outline_size = 12
	banner.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	stand_root.add_child(banner)

static func _billboard(parent: Node3D, p: Vector3, right: Vector3, side: float, half_w: float, fwd: Vector3, text: String) -> void:
	var bill_root := Node3D.new()
	var bill_pos: Vector3 = p + right * (side * (half_w + 3.2))
	bill_root.position = bill_pos
	parent.add_child(bill_root)

	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.3, 0.32, 0.36)

	# Sturdy foundation posts extending deep into ground
	for p_side in [-1.4, 1.4]:
		var post := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.2, 7.0, 0.2)
		post.mesh = box
		post.material_override = pmat
		post.position = Vector3(p_side, -1.0, 0)
		bill_root.add_child(post)

	# Board backplate
	var board := MeshInstance3D.new()
	var b_box := BoxMesh.new()
	b_box.size = Vector3(3.6, 1.6, 0.15)
	board.mesh = b_box
	var b_mat := StandardMaterial3D.new()
	b_mat.albedo_color = Color(0.12, 0.14, 0.2)
	board.material_override = b_mat
	board.position = Vector3(0, 3.2, 0)
	bill_root.add_child(board)

	var lbl := Label3D.new()
	lbl.text = text
	lbl.font_size = 56
	lbl.position = Vector3(0, 3.2, 0.1)
	lbl.modulate = Color(1.0, 0.88, 0.18)
	lbl.outline_modulate = Color(0.9, 0.15, 0.15)
	lbl.outline_size = 14
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	bill_root.add_child(lbl)

static func _chevron_sign(parent: Node3D, pos: Vector3, fwd: Vector3) -> void:
	var root := Node3D.new()
	root.position = pos
	parent.add_child(root)

	var pmat := StandardMaterial3D.new()
	pmat.albedo_color = Color(0.35, 0.35, 0.4)

	# Two sturdy posts sunk 3.8m deep into the earth (never floating!)
	for side in [-0.6, 0.6]:
		var post := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.14, 5.5, 0.14)
		post.mesh = box
		post.position = Vector3(side, -1.5, 0) # Top at +1.25, bottom at -4.25
		post.material_override = pmat
		root.add_child(post)

	# Yellow Signboard
	var sign_mesh := MeshInstance3D.new()
	var s_box := BoxMesh.new()
	s_box.size = Vector3(1.8, 1.0, 0.1)
	sign_mesh.mesh = s_box
	var smat := StandardMaterial3D.new()
	smat.albedo_color = Color(1.0, 0.88, 0.12)
	sign_mesh.material_override = smat
	sign_mesh.position = Vector3(0, 0.9, 0)
	root.add_child(sign_mesh)

	var board := Label3D.new()
	board.text = ">>>"
	board.font_size = 72
	board.position = Vector3(0, 0.9, 0.08)
	board.modulate = Color(0.1, 0.1, 0.12)
	board.outline_size = 0
	root.add_child(board)

static func _tree(parent: Node3D, pos: Vector3, scale: float, is_pine: bool, fol_mat: Material, pine_mat: Material, trk_mat: Material) -> void:
	var tree_root := Node3D.new()
	tree_root.position = pos
	tree_root.scale = Vector3.ONE * scale
	parent.add_child(tree_root)

	# Trunk: bottom sinks 3.0m deep into embankment/ground, top rises to +4.5m
	var trunk := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = 0.4
	cyl.bottom_radius = 0.65
	cyl.height = 7.5
	trunk.mesh = cyl
	trunk.material_override = trk_mat
	trunk.position = Vector3(0, 0.75, 0) # Bottom at -3.0, top at +4.5
	tree_root.add_child(trunk)

	if is_pine:
		# Conic layered pine tree (tiers overlap trunk seamlessly)
		for tier in 3:
			var cone := MeshInstance3D.new()
			var c_mesh := CylinderMesh.new()
			c_mesh.top_radius = 0.1
			c_mesh.bottom_radius = 3.0 - float(tier) * 0.7
			c_mesh.height = 2.8
			cone.mesh = c_mesh
			cone.material_override = pine_mat
			cone.position = Vector3(0, 3.6 + float(tier) * 1.8, 0)
			tree_root.add_child(cone)
	else:
		# Round Mario Kart fruit tree (rests snugly atop trunk, overlapping it by 1.8m)
		var fol := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 2.4
		sphere.height = 4.2
		fol.mesh = sphere
		fol.material_override = fol_mat
		fol.position = Vector3(0, 4.6, 0) # Base of sphere touches Y = 2.5, perfectly hugging the trunk!
		tree_root.add_child(fol)

static func _start_gantry(parent: Node3D, pos: Vector3, dir: Vector3, width: float) -> void:
	dir.y = 0.0
	if dir.length() < 0.1:
		dir = Vector3(0, 0, -1)
	dir = dir.normalized()
	var right := dir.cross(Vector3.UP).normalized()
	var half: float = width * 0.5 + 0.8

	var gantry_mat := StandardMaterial3D.new()
	gantry_mat.albedo_color = Color(0.95, 0.2, 0.22) # Mario Kart red arch

	for side in [-1.0, 1.0]:
		var post := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(0.4, 7.5, 0.4)
		post.mesh = box
		post.position = pos + Vector3.UP * 1.5 + right * (side * half) # Sunk 2.2m into ground
		post.material_override = gantry_mat
		parent.add_child(post)

	var beam := MeshInstance3D.new()
	var beam_mesh := BoxMesh.new()
	beam_mesh.size = Vector3(half * 2.0, 0.45, 0.45)
	beam.mesh = beam_mesh
	beam.position = pos + Vector3.UP * 5.2
	beam.material_override = gantry_mat
	parent.add_child(beam)

	var label := Label3D.new()
	label.text = "★ 3D MODEL RACING ★"
	label.position = pos + Vector3.UP * 5.9
	label.font_size = 52
	label.modulate = Color(1.0, 0.92, 0.2)
	label.outline_modulate = Color(0.8, 0.1, 0.1)
	label.outline_size = 16
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	parent.add_child(label)

static func _launch_towers(parent: Node3D, lip_pos: Vector3, mat: Material) -> void:
	for side in [-1.0, 1.0]:
		var tower := MeshInstance3D.new()
		var cyl := CylinderMesh.new()
		cyl.top_radius = 0.3
		cyl.bottom_radius = 0.9
		cyl.height = 22.0
		tower.mesh = cyl
		tower.material_override = mat
		tower.position = lip_pos + Vector3(side * 12.0, 8.0, 0.0)
		parent.add_child(tower)

	var label := Label3D.new()
	label.text = "★ STAR ASCENT RAMP ★"
	label.position = lip_pos + Vector3.UP * 7.5
	label.font_size = 58
	label.modulate = Color(0.35, 0.9, 1.0)
	label.outline_modulate = Color(0.1, 0.2, 0.5)
	label.outline_size = 16
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	parent.add_child(label)

static func _clouds(parent: Node3D, track_mid: Vector3) -> void:
	var cloud_mat := StandardMaterial3D.new()
	cloud_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.9)
	cloud_mat.roughness = 1.0
	cloud_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED

	var offsets: Array[Vector3] = [
		Vector3(-80, 55, -120),
		Vector3(90, 60, -240),
		Vector3(-110, 52, -380),
		Vector3(70, 58, -500),
		Vector3(-40, 65, -620)
	]

	for off in offsets:
		var cloud_node := Node3D.new()
		cloud_node.position = track_mid + off
		parent.add_child(cloud_node)

		for j in 3:
			var puff := MeshInstance3D.new()
			var sp := SphereMesh.new()
			sp.radius = 12.0 + float(j * 3)
			sp.height = 12.0
			puff.mesh = sp
			puff.material_override = cloud_mat
			puff.position = Vector3(float(j - 1) * 9.0, 0, 0)
			cloud_node.add_child(puff)
