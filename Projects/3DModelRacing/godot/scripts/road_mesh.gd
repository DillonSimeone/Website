class_name RoadMesh
extends RefCounted

static func build(layout: Dictionary) -> Dictionary:
	var job := begin(layout)
	while not pump(job, 100000):
		pass
	return finish(job)

static func begin(layout: Dictionary) -> Dictionary:
	var points: PackedVector3Array = layout.points
	var tags: PackedInt32Array = layout.tags
	var widths: PackedFloat32Array = layout.widths
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var lip := Vector3.ZERO
	var finish := points[points.size() - 1]
	var has_lip := false
	var has_finish := false

	# Precompute vertex cross-sections so consecutive segments share exact edges (ZERO gaps on curves!)
	var left_pts := PackedVector3Array()
	var right_pts := PackedVector3Array()
	var curb_l_pts := PackedVector3Array()
	var curb_r_pts := PackedVector3Array()
	var stripe_l_pts := PackedVector3Array()
	var stripe_r_pts := PackedVector3Array()

	var n_pts := points.size()
	left_pts.resize(n_pts)
	right_pts.resize(n_pts)
	curb_l_pts.resize(n_pts)
	curb_r_pts.resize(n_pts)
	stripe_l_pts.resize(n_pts)
	stripe_r_pts.resize(n_pts)

	for i in n_pts:
		var tag := int(tags[i])
		if (tag & TrackLayouts.LIP) != 0:
			lip = points[i]
			has_lip = true
		if (tag & TrackLayouts.FINISH) != 0:
			finish = points[i]
			has_finish = true

		var fwd := Vector3.ZERO
		if i == 0:
			fwd = points[1] - points[0]
		elif i == n_pts - 1:
			fwd = points[i] - points[i - 1]
		else:
			var d0 := (points[i] - points[i - 1]).normalized()
			var d1 := (points[i + 1] - points[i]).normalized()
			fwd = (d0 + d1)

		fwd.y = 0.0
		if fwd.length() < 0.001:
			fwd = Vector3(0, 0, -1)
		var right: Vector3 = fwd.cross(Vector3.UP).normalized()
		var half_w: float = float(widths[i]) * 0.5
		var p: Vector3 = points[i]

		var lp := p - right * half_w
		var rp := p + right * half_w
		left_pts[i] = lp
		right_pts[i] = rp
		curb_l_pts[i] = lp - right * 0.65 + Vector3.UP * 0.28
		curb_r_pts[i] = rp + right * 0.65 + Vector3.UP * 0.28
		stripe_l_pts[i] = p - right * 0.22 + Vector3.UP * 0.04
		stripe_r_pts[i] = p + right * 0.22 + Vector3.UP * 0.04

	return {
		"layout": layout,
		"tool": tool,
		"index": 0,
		"length": 0.0,
		"next_cp": 80.0,
		"lip": lip,
		"finish": finish,
		"has_lip": has_lip,
		"has_finish": has_finish,
		"checkpoints": [],
		"left_pts": left_pts,
		"right_pts": right_pts,
		"curb_l_pts": curb_l_pts,
		"curb_r_pts": curb_r_pts,
		"stripe_l_pts": stripe_l_pts,
		"stripe_r_pts": stripe_r_pts,
		"done": false,
	}

static func pump(job: Dictionary, batch: int) -> bool:
	if bool(job.done):
		return true
	var layout: Dictionary = job.layout
	var points: PackedVector3Array = layout.points
	var tags: PackedInt32Array = layout.tags
	var tool: SurfaceTool = job.tool
	var checkpoints: Array = job.checkpoints
	var last := points.size() - 1
	var end := mini(int(job.index) + batch, last)
	var length := float(job.length)
	var next_cp := float(job.next_cp)

	var lp: PackedVector3Array = job.left_pts
	var rp: PackedVector3Array = job.right_pts
	var clp: PackedVector3Array = job.curb_l_pts
	var crp: PackedVector3Array = job.curb_r_pts
	var slp: PackedVector3Array = job.stripe_l_pts
	var srp: PackedVector3Array = job.stripe_r_pts

	while int(job.index) < end:
		var i := int(job.index)
		job.index = i + 1
		var a: Vector3 = points[i]
		var b: Vector3 = points[i + 1]
		var step := a.distance_to(b)
		length += step
		var tag := int(tags[i])
		if not _drivable(tag) or not _drivable(int(tags[i + 1])) or step < 0.05:
			continue

		var ramp := (tag & TrackLayouts.RAMP) != 0
		var lip_zone := (tag & TrackLayouts.LIP) != 0

		# 1. Main Road Asphalt (Continuous Shared-Vertex Ribbon: ZERO gaps!)
		var deck := Color(0.24, 0.27, 0.35, 1.0) # Solid slate asphalt
		if lip_zone:
			deck = Color(0.3, 0.88, 1.0, 1.0) # Radiant cyan space-launch runway
		elif ramp:
			deck = Color(1.0, 0.6, 0.12, 1.0) # Mario Kart boost gold

		_quad(tool, lp[i], lp[i + 1], rp[i + 1], rp[i], deck)

		# 2. Dashed Yellow Mario Kart Center Stripe
		if not ramp and (i % 3 != 2):
			_quad(tool, slp[i], slp[i + 1], srp[i + 1], srp[i], Color(1.0, 0.88, 0.18, 1.0))

		# 3. Mario Kart Alternating Red and White Checkered Curbs
		if not ramp:
			var curb_col := Color(0.95, 0.18, 0.2, 1.0) if ((i / 2) % 2 == 0) else Color(0.98, 0.98, 1.0, 1.0)
			_quad(tool, clp[i], clp[i + 1], lp[i + 1], lp[i], curb_col)
			_quad(tool, rp[i], rp[i + 1], crp[i + 1], crp[i], curb_col)

		if length >= next_cp:
			next_cp = length + 90.0
			var fwd := (b - a).normalized()
			fwd.y = 0.0
			checkpoints.append(Transform3D(Basis.looking_at(fwd, Vector3.UP), a + Vector3.UP * 2.0))

	job.length = length
	job.next_cp = next_cp
	job.checkpoints = checkpoints
	if int(job.index) < last:
		return false
	job.done = true
	return true

static func finish(job: Dictionary) -> Dictionary:
	var tool: SurfaceTool = job.tool
	var layout: Dictionary = job.layout
	var points: PackedVector3Array = layout.points
	var ahead := Vector3(0, 0, 1)
	if points.size() > 3:
		ahead = points[3] - points[1]
		ahead.y = 0.0
	if ahead.length() < 0.1:
		ahead = Vector3(0, 0, 1)
	var spawn := Transform3D(Basis.looking_at(ahead.normalized(), Vector3.UP), points[1] + Vector3.UP * 2.4)
	var checkpoints: Array = job.checkpoints
	if checkpoints.is_empty():
		checkpoints.append(spawn)
	return {
		"layout": layout,
		"mesh": tool.commit(),
		"lip": job.lip,
		"finish": job.finish,
		"has_lip": job.has_lip,
		"has_finish": job.has_finish,
		"length": job.length,
		"spawn": spawn,
		"checkpoints": checkpoints,
	}

static func _drivable(tag: int) -> bool:
	return (tag & TrackLayouts.SOLID) != 0 and (tag & TrackLayouts.GAP) == 0

static func _quad(tool: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color) -> void:
	_tri(tool, a, b, c, color)
	_tri(tool, a, c, d, color)

static func _tri(tool: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, color: Color) -> void:
	var n := (b - a).cross(c - a).normalized()
	if n.dot(Vector3.UP) < 0.0:
		var swap := b
		b = c
		c = swap
		n = -n
	for point in [a, b, c]:
		tool.set_normal(n)
		tool.set_color(color)
		tool.add_vertex(point)
