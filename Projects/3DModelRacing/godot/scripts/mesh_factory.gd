class_name MeshFactory
extends RefCounted

static func default_vehicle() -> ArrayMesh:
	return normalize_longest(_wedge())

static func normalize_longest(mesh: ArrayMesh) -> ArrayMesh:
	var aabb := mesh.get_aabb()
	var longest := maxf(aabb.size.x, maxf(aabb.size.y, aabb.size.z))
	if longest < 0.00001:
		return mesh
	var scale := 3.0 / longest
	var center := aabb.get_center()
	var basis := Basis.from_scale(Vector3.ONE * scale)
	return transform_mesh(mesh, Transform3D(basis, -(basis * center)))

static func oriented_bounds(mesh: ArrayMesh, euler_deg: Vector3) -> Dictionary:
	var rot := Basis.from_euler(Vector3(
		deg_to_rad(euler_deg.x),
		deg_to_rad(euler_deg.y),
		deg_to_rad(euler_deg.z)
	))
	var bounds := _bounds(mesh, rot)
	bounds["stats"] = VehicleStats.from_size(bounds.size)
	bounds["rotation"] = rot
	return bounds

static func bake_oriented(mesh: ArrayMesh, euler_deg: Vector3) -> Dictionary:
	var job := begin_bake(mesh, euler_deg)
	while not pump_bake(job, 1000000):
		pass
	return job.result

static func begin_bake(mesh: ArrayMesh, euler_deg: Vector3) -> Dictionary:
	var rot := Basis.from_euler(Vector3(
		deg_to_rad(euler_deg.x),
		deg_to_rad(euler_deg.y),
		deg_to_rad(euler_deg.z)
	))
	var bounds := _bounds(mesh, rot)
	var shift := Vector3(-bounds.center.x, -bounds.min_v.y, -bounds.center.z)
	var surfaces: Array = []
	for surface in mesh.get_surface_count():
		surfaces.append(mesh.surface_get_arrays(surface))
	return {
		"xform": Transform3D(rot, shift),
		"bounds": bounds,
		"surfaces": surfaces,
		"surface_i": 0,
		"vert_i": 0,
		"base": 0,
		"verts": PackedVector3Array(),
		"indices": PackedInt32Array(),
		"done": false,
		"result": {},
	}

static func pump_bake(job: Dictionary, budget: int) -> bool:
	if bool(job.done):
		return true
	var surfaces: Array = job.surfaces
	var xform: Transform3D = job.xform
	var verts: PackedVector3Array = job.verts
	var indices: PackedInt32Array = job.indices
	var guard := 0
	while int(job.surface_i) < surfaces.size() and guard < budget:
		var arrays: Array = surfaces[int(job.surface_i)]
		var source: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var cursor := int(job.vert_i)
		var base := int(job.base)
		var end := mini(cursor + (budget - guard), source.size())
		for i in range(cursor, end):
			verts.append(xform * source[i])
		guard += end - cursor
		job.vert_i = end
		if end < source.size():
			break
		var index_variant: Variant = arrays[Mesh.ARRAY_INDEX]
		if index_variant is PackedInt32Array and not (index_variant as PackedInt32Array).is_empty():
			for idx in index_variant:
				indices.append(base + int(idx))
		else:
			for i in source.size():
				indices.append(base + i)
		job.surface_i = int(job.surface_i) + 1
		job.vert_i = 0
		job.base = verts.size()
	job.verts = verts
	job.indices = indices
	if int(job.surface_i) < surfaces.size():
		return false
	var bounds: Dictionary = job.bounds
	job.result = {
		"mesh": _mesh_from(verts, indices),
		"size": bounds.size,
		"stats": VehicleStats.from_size(bounds.size),
	}
	job.done = true
	return true

static func transform_mesh(mesh: ArrayMesh, xform: Transform3D) -> ArrayMesh:
	var verts := PackedVector3Array()
	var indices := PackedInt32Array()
	for surface in mesh.get_surface_count():
		var arrays: Array = mesh.surface_get_arrays(surface)
		var source: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var index_variant: Variant = arrays[Mesh.ARRAY_INDEX]
		var base := verts.size()
		for v in source:
			verts.append(xform * v)
		if index_variant == null:
			for i in source.size():
				indices.append(base + i)
		else:
			var index_data: PackedInt32Array = index_variant
			if index_data.is_empty():
				for i in source.size():
					indices.append(base + i)
			else:
				for idx in index_data:
					indices.append(base + idx)
	return _mesh_from(verts, indices)

static func weld_triangles(raw: PackedVector3Array) -> ArrayMesh:
	var map := {}
	var verts := PackedVector3Array()
	var indices := PackedInt32Array()
	for v in raw:
		var key := Vector3i(roundi(v.x * 1000.0), roundi(v.y * 1000.0), roundi(v.z * 1000.0))
		var found: int = int(map.get(key, -1))
		if found < 0:
			found = verts.size()
			verts.append(v)
			map[key] = found
		indices.append(found)
	return _mesh_from(verts, indices)

static func _mesh_from(verts: PackedVector3Array, indices: PackedInt32Array) -> ArrayMesh:
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var tool := SurfaceTool.new()
	tool.create_from(mesh, 0)
	tool.generate_normals()
	return tool.commit()

static func _bounds(mesh: ArrayMesh, rot: Basis) -> Dictionary:
	var aabb := mesh.get_aabb()
	var mn := Vector3(INF, INF, INF)
	var mx := Vector3(-INF, -INF, -INF)
	for ix in 2:
		for iy in 2:
			for iz in 2:
				var corner := aabb.position + Vector3(aabb.size.x * ix, aabb.size.y * iy, aabb.size.z * iz)
				var point := rot * corner
				mn.x = minf(mn.x, point.x)
				mn.y = minf(mn.y, point.y)
				mn.z = minf(mn.z, point.z)
				mx.x = maxf(mx.x, point.x)
				mx.y = maxf(mx.y, point.y)
				mx.z = maxf(mx.z, point.z)
	return {"min_v": mn, "max_v": mx, "center": (mn + mx) * 0.5, "size": mx - mn}

static func _wedge() -> ArrayMesh:
	var tool := SurfaceTool.new()
	tool.begin(Mesh.PRIMITIVE_TRIANGLES)
	var b0 := Vector3(-0.55, 0.0, -1.2)
	var b1 := Vector3(0.55, 0.0, -1.2)
	var b2 := Vector3(0.55, 0.0, 1.15)
	var b3 := Vector3(-0.55, 0.0, 1.15)
	var t0 := Vector3(-0.22, 0.28, -1.35)
	var t1 := Vector3(0.22, 0.28, -1.35)
	var t2 := Vector3(0.46, 0.46, 0.45)
	var t3 := Vector3(-0.46, 0.46, 0.45)
	_face(tool, [b0, b1, b2, b3], Vector3.DOWN)
	_face(tool, [t0, t3, t2, t1], Vector3.UP)
	_face(tool, [b0, t0, t1, b1], Vector3(0, 0, -1))
	_face(tool, [b3, b2, t2, t3], Vector3(0, 0, 1))
	_face(tool, [b0, b3, t3, t0], Vector3.LEFT)
	_face(tool, [b1, t1, t2, b2], Vector3.RIGHT)
	tool.generate_normals()
	return tool.commit()

static func _face(tool: SurfaceTool, pts: Array, hint: Vector3) -> void:
	var normal: Vector3 = (pts[1] - pts[0]).cross(pts[2] - pts[0])
	var p: Array = pts
	if normal.dot(hint) < 0.0:
		p = [pts[0], pts[3], pts[2], pts[1]]
	tool.add_vertex(p[0])
	tool.add_vertex(p[1])
	tool.add_vertex(p[2])
	tool.add_vertex(p[0])
	tool.add_vertex(p[2])
	tool.add_vertex(p[3])
