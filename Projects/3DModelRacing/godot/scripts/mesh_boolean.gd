class_name MeshBoolean
extends RefCounted

static func subtract_sphere(mesh: Mesh, center: Vector3, radius: float) -> ArrayMesh:
	if mesh == null or mesh.get_surface_count() == 0:
		return null
	var src: Array = mesh.surface_get_arrays(0)
	var verts: PackedVector3Array = src[Mesh.ARRAY_VERTEX]
	if verts.is_empty() or verts.size() > 24000:
		return null
	var index_data: Variant = src[Mesh.ARRAY_INDEX]
	var tris := PackedVector3Array()
	if index_data == null or (index_data is PackedInt32Array and (index_data as PackedInt32Array).is_empty()):
		for i in range(0, verts.size() - 2, 3):
			tris.append(verts[i])
			tris.append(verts[i + 1])
			tris.append(verts[i + 2])
	else:
		var indices: PackedInt32Array = index_data
		for i in range(0, indices.size() - 2, 3):
			tris.append(verts[indices[i]])
			tris.append(verts[indices[i + 1]])
			tris.append(verts[indices[i + 2]])
	var keep := PackedVector3Array()
	var removed := 0
	var normal_sum := Vector3.ZERO
	for i in range(0, tris.size(), 3):
		var a := tris[i]
		var b := tris[i + 1]
		var c := tris[i + 2]
		if _hits(a, b, c, center, radius):
			removed += 1
			normal_sum += (b - a).cross(c - a)
			continue
		keep.append(a)
		keep.append(b)
		keep.append(c)
	if removed == 0 or keep.is_empty():
		return null
	var normal := Vector3.UP if normal_sum.length() < 0.001 else normal_sum.normalized()
	var tangent := normal.cross(Vector3.UP)
	if tangent.length() < 0.01:
		tangent = normal.cross(Vector3.RIGHT)
	tangent = tangent.normalized()
	var bitangent := normal.cross(tangent).normalized()
	var origin := center - normal * radius * 0.25
	for s in 8:
		var t0 := TAU * float(s) / 8.0
		var t1 := TAU * float(s + 1) / 8.0
		keep.append(origin)
		keep.append(origin + (tangent * cos(t0) + bitangent * sin(t0)) * radius * 0.8)
		keep.append(origin + (tangent * cos(t1) + bitangent * sin(t1)) * radius * 0.8)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = keep
	var out := ArrayMesh.new()
	out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return out

static func _hits(a: Vector3, b: Vector3, c: Vector3, center: Vector3, radius: float) -> bool:
	var ab := b - a
	var ac := c - a
	var normal := ab.cross(ac)
	var span := normal.length()
	if span < 0.00001:
		return false
	normal /= span
	var dist := (center - a).dot(normal)
	if absf(dist) > radius:
		return false
	var projected := center - normal * dist
	var rel := projected - a
	var d00 := ab.dot(ab)
	var d01 := ab.dot(ac)
	var d11 := ac.dot(ac)
	var d20 := rel.dot(ab)
	var d21 := rel.dot(ac)
	var denom := d00 * d11 - d01 * d01
	if absf(denom) < 0.000001:
		return false
	var v := (d11 * d20 - d01 * d21) / denom
	var w := (d00 * d21 - d01 * d20) / denom
	var u := 1.0 - v - w
	return u >= -0.2 and v >= -0.2 and w >= -0.2
