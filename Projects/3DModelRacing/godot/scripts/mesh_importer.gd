class_name MeshImporter
extends RefCounted

const MAX_BYTES := 20 * 1024 * 1024
const MAX_TRIS := 80000

static func load_bytes(file_name: String, bytes: PackedByteArray) -> Dictionary:
	if bytes.is_empty():
		return {"error": "That file is empty."}
	if bytes.size() > MAX_BYTES:
		return {"error": "That file is over 20 MB."}
	var ext := file_name.get_extension().to_lower()
	var mesh: ArrayMesh = null
	if ext == "obj":
		mesh = _parse_obj(bytes)
	elif ext == "glb" or ext == "gltf":
		if ext == "gltf" and bytes.size() > 0 and bytes[0] != 0x67:
			return {"error": "Export a binary GLB so the mesh is one file."}
		return _parse_glb(bytes)
	elif ext == "stl" or ext == "":
		mesh = _parse_stl(bytes)
	else:
		if bytes.size() >= 4 and bytes[0] == 0x67 and bytes[1] == 0x6c and bytes[2] == 0x54 and bytes[3] == 0x46:
			return _parse_glb(bytes)
		mesh = _parse_stl(bytes)
	if mesh == null:
		return {"error": "Could not read that mesh. Use STL, OBJ, or GLB."}
	return _finish(mesh)

static func _finish(mesh: ArrayMesh) -> Dictionary:
	var tris := 0
	for surface in mesh.get_surface_count():
		var arrays: Array = mesh.surface_get_arrays(surface)
		var index_data: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		if index_data.is_empty():
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			tris += int(verts.size() / 3.0)
		else:
			tris += int(index_data.size() / 3.0)
	if tris < 1:
		return {"error": "That file has no triangles."}
	if tris > MAX_TRIS:
		return {"error": "That mesh has too many triangles (%d). Decimate it under %d." % [tris, MAX_TRIS]}
	return {"mesh": MeshFactory.normalize_longest(mesh), "tris": tris}

static func _parse_stl(bytes: PackedByteArray) -> ArrayMesh:
	if bytes.size() < 84:
		return _parse_ascii_stl(bytes)
	var count := bytes.decode_u32(80)
	var binary_len := 84 + count * 50
	var binary_ok: bool = count > 0 and count < 2000000 and absi(binary_len - bytes.size()) <= 1
	if not binary_ok:
		return _parse_ascii_stl(bytes)
	var raw := PackedVector3Array()
	raw.resize(count * 3)
	var cursor := 84
	var out_i := 0
	for _n in count:
		cursor += 12
		for _v in 3:
			var x := bytes.decode_float(cursor)
			var y := bytes.decode_float(cursor + 4)
			var z := bytes.decode_float(cursor + 8)
			raw[out_i] = Vector3(x, y, z)
			out_i += 1
			cursor += 12
		cursor += 2
	return MeshFactory.weld_triangles(raw)

static func _parse_ascii_stl(bytes: PackedByteArray) -> ArrayMesh:
	var text := bytes.get_string_from_utf8()
	if not text.to_lower().contains("facet"):
		return null
	var raw := PackedVector3Array()
	var lines := text.split("\n")
	for line in lines:
		var trimmed := line.strip_edges()
		if trimmed.to_lower().begins_with("vertex"):
			var parts := trimmed.split(" ", false)
			if parts.size() >= 4:
				raw.append(Vector3(float(parts[1]), float(parts[2]), float(parts[3])))
	if raw.size() < 3:
		return null
	return MeshFactory.weld_triangles(raw)

static func _parse_obj(bytes: PackedByteArray) -> ArrayMesh:
	var text := bytes.get_string_from_utf8()
	var positions := PackedVector3Array()
	var raw := PackedVector3Array()
	var lines := text.split("\n")
	for line in lines:
		var trimmed := line.strip_edges()
		if trimmed.is_empty() or trimmed.begins_with("#"):
			continue
		var parts := trimmed.split(" ", false)
		if parts.is_empty():
			continue
		if parts[0] == "v" and parts.size() >= 4:
			positions.append(Vector3(float(parts[1]), float(parts[2]), float(parts[3])))
		elif parts[0] == "f" and parts.size() >= 4:
			var face: Array[int] = []
			for token_i in range(1, parts.size()):
				var idx := _obj_index(parts[token_i], positions.size())
				if idx < 0 or idx >= positions.size():
					face.clear()
					break
				face.append(idx)
			if face.size() >= 3:
				for i in range(1, face.size() - 1):
					raw.append(positions[face[0]])
					raw.append(positions[face[i]])
					raw.append(positions[face[i + 1]])
	if raw.size() < 3:
		return null
	return MeshFactory.weld_triangles(raw)

static func _obj_index(token: String, count: int) -> int:
	var part := token.split("/")[0]
	if part.is_empty():
		return -1
	var value := int(part)
	if value < 0:
		return count + value
	return value - 1

static func _parse_glb(bytes: PackedByteArray) -> Dictionary:
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_buffer(bytes, "model.glb", state)
	if err != OK:
		return {"error": "Could not read that GLB (%s)." % error_string(err)}
	var scene := doc.generate_scene(state)
	if scene == null:
		return {"error": "That GLB has no scene."}
	var raw := PackedVector3Array()
	_collect_mesh(scene, Transform3D.IDENTITY, raw)
	scene.free()
	if raw.size() < 3:
		return {"error": "That file has no mesh."}
	var welded := MeshFactory.weld_triangles(raw)
	return _finish(welded)

static func _collect_mesh(node: Node, parent_xform: Transform3D, raw: PackedVector3Array) -> void:
	var here := parent_xform
	if node is Node3D:
		here = parent_xform * (node as Node3D).transform
	if node is MeshInstance3D and (node as MeshInstance3D).mesh:
		var mesh := (node as MeshInstance3D).mesh
		for surface in mesh.get_surface_count():
			var arrays: Array = mesh.surface_get_arrays(surface)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var index_variant: Variant = arrays[Mesh.ARRAY_INDEX]
			var index_data := PackedInt32Array()
			if index_variant != null:
				index_data = index_variant
			if index_data.is_empty():
				for i in range(0, verts.size() - 2, 3):
					raw.append(here * verts[i])
					raw.append(here * verts[i + 1])
					raw.append(here * verts[i + 2])
			else:
				for i in range(0, index_data.size() - 2, 3):
					raw.append(here * verts[index_data[i]])
					raw.append(here * verts[index_data[i + 1]])
					raw.append(here * verts[index_data[i + 2]])
	for child in node.get_children():
		_collect_mesh(child, here, raw)
