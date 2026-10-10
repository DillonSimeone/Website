extends SceneTree

func _initialize() -> void:
	call_deferred("_go")

func _go() -> void:
	var code := _logic()
	if code != 0:
		quit(code)
		return
	var host: Node3D = load("res://scripts/tests/physics_host.gd").new()
	root.add_child(host)

func _logic() -> int:
	var failed := false
	failed = _expect(_stats(), "stats") or failed
	failed = _expect(_stl(), "stl") or failed
	failed = _expect(_obj(), "obj") or failed
	failed = _expect(_tracks(), "tracks") or failed
	var rng := RandomNumberGenerator.new()
	rng.seed = 5
	var picks := Upgrades.roll(3, {}, rng)
	if picks.size() != 3:
		push_error("upgrade roll")
		failed = true
	if failed:
		print("LOGIC FAIL")
		return 1
	print("LOGIC OK")
	return 0

func _expect(err: String, name: String) -> bool:
	if err == "":
		print("OK ", name)
		return false
	push_error(name + " " + err)
	return true

func _stats() -> String:
	var kart := VehicleStats.from_size(Vector3(1.27, 0.48, 3.0))
	var cube := VehicleStats.from_size(Vector3(3, 3, 3))
	print("kart speed ", snappedf(kart.top_speed, 0.01), " launch ", snappedf(kart.launch, 0.1), " mass ", snappedf(kart.mass, 0.01))
	print("cube speed ", snappedf(cube.top_speed, 0.01), " launch ", snappedf(cube.launch, 0.1), " mass ", snappedf(cube.mass, 0.01))
	if float(kart.top_speed) <= float(cube.top_speed):
		return "kart should be faster"
	if float(kart.launch) < VehicleStats.LAUNCH_ENERGY:
		return "kart should be able to launch"
	if float(cube.launch) >= VehicleStats.LAUNCH_ENERGY:
		return "cube should stay on the ground"
	var wedge := MeshFactory.bake_oriented(MeshFactory.default_vehicle(), Vector3.ZERO)
	var size: Vector3 = wedge.size
	var longest := maxf(size.x, maxf(size.y, size.z))
	if absf(longest - 3.0) > 0.05:
		return "wedge longest %s" % longest
	print("wedge ", size, " launch ", snappedf(wedge.stats.launch, 0.1))
	if float(wedge.stats.launch) < VehicleStats.LAUNCH_ENERGY:
		return "default wedge should be able to launch"
	return ""

func _stl() -> String:
	var bytes := _box_stl(Vector3(0.4, 1.0, 2.0))
	var result := MeshImporter.load_bytes("crate.stl", bytes)
	if result.has("error"):
		return str(result.error)
	var mesh: ArrayMesh = result.mesh
	var aabb := mesh.get_aabb()
	var longest := maxf(aabb.size.x, maxf(aabb.size.y, aabb.size.z))
	if absf(longest - 3.0) > 0.08:
		return "stl scale %s" % longest
	return ""

func _obj() -> String:
	var text := "v 0 0 0\nv 1 0 0\nv 0 2 0\nv 0 0 4\nf 1 2 3\nf 1 3 4\n"
	var result := MeshImporter.load_bytes("tri.obj", text.to_utf8_buffer())
	if result.has("error"):
		return str(result.error)
	return ""

func _tracks() -> String:
	for mode in ["arcade", "roguelite"]:
		for seed_value in [1, 2, 9]:
			if mode == "arcade" and seed_value != 1:
				continue
			var err := _one_track(mode, seed_value)
			if err != "":
				return "%s %s %s" % [mode, seed_value, err]
	return ""

func _one_track(mode: String, seed_value: int) -> String:
	var layout := TrackLayouts.build(mode, seed_value)
	var points: PackedVector3Array = layout.points
	var tags: PackedInt32Array = layout.tags
	if points.size() != tags.size() or points.size() < 12:
		return "count %s" % points.size()
	var has_lip := false
	var has_finish := false
	var length := 0.0
	var tag_bits := 0
	for i in points.size():
		tag_bits |= int(tags[i])
		if (int(tags[i]) & TrackLayouts.LIP) != 0:
			has_lip = true
		if (int(tags[i]) & TrackLayouts.FINISH) != 0:
			has_finish = true
		if i == points.size() - 1:
			continue
		var dist := points[i].distance_to(points[i + 1])
		length += dist
		if dist > 14.0:
			return "step %s" % dist
	if not has_lip or not has_finish:
		return "markers lip=%s finish=%s bits=%s" % [has_lip, has_finish, tag_bits]
	if length < 180.0:
		return "short %s" % length
	return ""

func _box_stl(size: Vector3) -> PackedByteArray:
	var hx := size.x * 0.5
	var hy := size.y * 0.5
	var hz := size.z * 0.5
	var corners: Array[Vector3] = [
		Vector3(-hx, -hy, -hz), Vector3(hx, -hy, -hz), Vector3(hx, hy, -hz), Vector3(-hx, hy, -hz),
		Vector3(-hx, -hy, hz), Vector3(hx, -hy, hz), Vector3(hx, hy, hz), Vector3(-hx, hy, hz),
	]
	var faces := [
		[0, 1, 2], [0, 2, 3],
		[4, 6, 5], [4, 7, 6],
		[0, 4, 5], [0, 5, 1],
		[3, 2, 6], [3, 6, 7],
		[1, 5, 6], [1, 6, 2],
		[0, 3, 7], [0, 7, 4],
	]
	var count := faces.size()
	var bytes := PackedByteArray()
	bytes.resize(84 + count * 50)
	bytes.encode_u32(80, count)
	var cursor := 84
	for face in faces:
		cursor += 12
		for idx in face:
			var p: Vector3 = corners[idx]
			bytes.encode_float(cursor, p.x)
			bytes.encode_float(cursor + 4, p.y)
			bytes.encode_float(cursor + 8, p.z)
			cursor += 12
		cursor += 2
	return bytes
